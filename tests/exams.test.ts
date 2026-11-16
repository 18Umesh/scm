import{test,before,after}from'node:test';
import assert from'node:assert/strict';
import{createDatabase,type Database}from'../packages/db';
import{seedNetaji}from'../packages/db/seed-netaji';
import{NETAJI}from'../packages/demo/netaji';
import{Operations,type Actor}from'../packages/operations/service';
import{TeacherWorkflows}from'../packages/operations/teacher';
import{marksOpen,examStatistics,examSchoolDay,classExamSummary}from'../packages/operations/exam-progress';
let db:Database,ops:Operations,flow:TeacherWorkflows,teacher:Actor,principal:Actor,parent:Actor,room:any,classId:string,subjectId:string;
before(async()=>{
 db=await createDatabase({mode:'embedded'});await db.migrate();await seedNetaji(db);ops=new Operations(db);flow=new TeacherWorkflows(db,ops);
 const actor=async(email:string):Promise<Actor>=>{const a=NETAJI.accounts.find(a=>a.email===email)!;const m=(await db.admin.query('SELECT * FROM memberships WHERE user_id=$1',[a.id])).rows[0];return{schoolId:m.school_id,userId:m.user_id,membershipId:m.id,role:m.role};};
 teacher=await actor('anjali@netaji.school');principal=await actor('principal@netaji.school');parent=await actor('priya@netaji.school');
 const overview=await flow.overview(teacher);classId=overview.classes.find(c=>c.student_count===10)!.id;room=await flow.classroom(teacher,classId);subjectId=overview.subjects.find(s=>s.label==='Mathematics')!.id;
});
after(async()=>{await db?.close();});
async function exam(date:string,published=true){const e=await ops.create(principal,'exams',{name:'Test-only scheduled unit test',examType:'unitTest',classId,subjectId,date,startTime:'09:00',endTime:'10:00',maxMarks:25,passMarks:10,portions:'Test fixture'});if(published){await ops.action(principal,'exams',e.id,{action:'approve',version:1});await ops.action(principal,'exams',e.id,{action:'publish',version:2});}return ops.get(teacher,'exams',e.id);}
test('exam demo seeds all categories, three subjects and ten students without resetting results',async()=>{
 assert.equal(room.exams.length,21);assert.equal(room.marks.length,129);assert.equal(room.isClassTeacher,true);assert.equal((await db.admin.query('SELECT count(*)::int n FROM exams')).rows[0].n,21);assert.equal((await db.admin.query('SELECT count(*)::int n FROM marks')).rows[0].n,129);assert.equal(room.students.length,10);assert.equal(room.history.attendance.length,40);
 assert.deepEqual(new Set(room.exams.map((e:any)=>e.payload.examType)),new Set(['unitTest','quarterly','halfYearly','final']));
 const before=(await db.admin.query('SELECT count(*)::int n FROM marks')).rows[0].n;await seedNetaji(db);assert.equal((await db.admin.query('SELECT count(*)::int n FROM marks')).rows[0].n,before);
 const calendar=await flow.overview(teacher);assert.ok(room.exams.every((e:any)=>calendar.events.some((v:any)=>v.id===e.id)));
 const visible=await ops.list(parent,'marks',{limit:100});assert.equal(visible.total,12);assert.ok(visible.data.every(m=>m.published));
});
test('published exams open only after the school date; UI and generic APIs cannot bypass the lock',async()=>{
 assert.equal(marksOpen({published:true,payload:{date:'2026-11-09'}},'2026-11-09'),false);assert.equal(marksOpen({published:true,payload:{date:'2026-11-09'}},'2026-11-10'),true);assert.equal(marksOpen({published:false,payload:{date:'2026-01-01'}},'2026-11-10'),false);
 for(const e of[await exam(examSchoolDay()),await exam('2099-01-01'),await exam('2026-06-01',false)]){
  await assert.rejects(ops.create(teacher,'marks',{examId:e.id,subjectId,studentId:room.students[0].id,score:20}),/marksNotOpen/);
  await assert.rejects(ops.bulkMarks(teacher,{examId:e.id,action:'save',entries:[{studentId:room.students[0].id,score:20,version:0}]}),/marksNotOpen/);
 }
});
test('class marks save and submit atomically with zero scores, stale-version protection and approval privacy',async()=>{
 const e=await exam('2026-08-04');let entries=room.students.map((s:any,i:number)=>({studentId:s.id,score:i===0?0:20,version:0}));
 await assert.rejects(ops.bulkMarks(parent,{examId:e.id,action:'save',entries}),/forbidden/);
 await assert.rejects(ops.bulkMarks(teacher,{examId:e.id,action:'submit',entries:entries.slice(0,2)}),/incompleteMarks/);
 await assert.rejects(ops.bulkMarks(teacher,{examId:e.id,action:'save',entries:entries.map((v:any,i:number)=>i===9?{...v,score:26}:v)}),/invalidMarks/);
 assert.equal((await ops.list(teacher,'marks',{limit:100})).data.filter(m=>m.payload.examId===e.id).length,0);
 const saved=await ops.bulkMarks(teacher,{examId:e.id,action:'save',entries});assert.equal(saved.count,10);
 entries=entries.map((v:any)=>({...v,version:1}));
 await assert.rejects(ops.bulkMarks(teacher,{examId:e.id,action:'save',entries:entries.map((v:any,i:number)=>({...v,score:12,version:i===9?0:1}))}),/versionConflict/);
 assert.equal((await ops.get(teacher,'marks',saved.data[0].id)).payload.score,0);
 await assert.rejects(ops.create(teacher,'marks',{examId:e.id,studentId:entries[0].studentId,subjectId,score:10}),/duplicateMarks/);
 await assert.rejects(ops.get(parent,'marks',saved.data[0].id),/notFound/);
 const submitted=await ops.bulkMarks(teacher,{examId:e.id,action:'submit',entries});assert.ok(submitted.data.every(m=>m.status==='submitted'));
 await assert.rejects(ops.bulkMarks(teacher,{examId:e.id,action:'save',entries:submitted.data.map(m=>({studentId:m.student_id,score:25,version:m.version}))}),/recordLocked/);
 const mark=submitted.data.find(m=>m.student_id===room.students.find((s:any)=>s.payload.name==='Aarav Reddy').id)!;
 await ops.action(principal,'marks',mark.id,{action:'approve',version:mark.version});const approved=await ops.get(principal,'marks',mark.id);await ops.action(principal,'marks',mark.id,{action:'publish',version:approved.version});assert.equal((await ops.get(parent,'marks',mark.id)).payload.score,mark.payload.score);
});
test('a student from another class cannot receive marks for this exam',async()=>{
 const e=await exam('2026-08-05');const other=(await db.admin.query('SELECT id FROM classes WHERE id<>$1 LIMIT 1',[classId])).rows[0];
 const pupil=await db.tenant(principal.schoolId,principal.userId,tx=>ops.insert(tx,principal,'students',{name:'Test Student',admissionNumber:'TEST-ONLY',classId:other.id,dateOfBirth:'2017-01-01',gender:'notProvided',apaarState:'not_provided'}));
 await assert.rejects(ops.create(teacher,'marks',{examId:e.id,subjectId,studentId:pupil.id,score:20}),/classMismatch/);
 await assert.rejects(ops.bulkMarks(teacher,{examId:e.id,action:'save',entries:[{studentId:pupil.id,score:20,version:0}]}),/classMismatch/);
 await assert.rejects(flow.classroom(parent,classId),/forbidden/);
});
test('statistics use scored students as denominator and distinguish missing marks from zero',()=>{
 const stat=examStatistics({id:'exam',payload:{maxMarks:25,passMarks:10}},[{payload:{examId:'exam',score:0}},{payload:{examId:'exam',score:20}}],10);
 assert.equal(stat.entered,2);assert.equal(stat.missing,8);assert.equal(stat.passPercentage,50);assert.equal(stat.averagePercentage,40);assert.equal(examStatistics({id:'exam',payload:{maxMarks:25,passMarks:10}},[],10).passPercentage,null);
});
test('subject teachers see their own history; class teachers read all subjects but grade only assigned subjects',async()=>{
 for(const account of NETAJI.accounts.filter(a=>a.role==='teacher')){
  const m=(await db.admin.query('SELECT * FROM memberships WHERE user_id=$1',[account.id])).rows[0];
  const actor:Actor={schoolId:m.school_id,userId:m.user_id,membershipId:m.id,role:m.role};
  const own=await flow.classroom(actor,classId);
  const assigned=(await db.admin.query("SELECT id FROM subjects WHERE payload->>'name'=$1",[account.subject])).rows[0].id;
  assert.deepEqual(own.assignedSubjectIds,[assigned]);assert.ok(own.exams.length>=7);
  assert.ok(own.exams.every((e:any)=>own.isClassTeacher||e.payload.subjectId===assigned));assert.ok(own.marks.every((r:any)=>own.isClassTeacher||r.payload.subjectId===assigned));
  assert.ok(own.stats.every((s:any)=>own.exams.some((e:any)=>e.id===s.examId)));
  const foreign=(await db.admin.query("SELECT * FROM exams WHERE class_id=$1 AND payload->>'subjectId'<>$2 AND payload->>'date'='2026-11-06' LIMIT 1",[classId,assigned])).rows[0];
  const mark=(await db.admin.query("SELECT * FROM marks WHERE payload->>'examId'=$1 AND status='draft' LIMIT 1",[foreign.id])).rows[0];
  if(own.isClassTeacher){assert.equal((await ops.get(actor,'exams',foreign.id)).id,foreign.id);assert.equal((await ops.get(actor,'marks',mark.id)).id,mark.id);}else{await assert.rejects(ops.get(actor,'exams',foreign.id),/notFound/);await assert.rejects(ops.get(actor,'marks',mark.id),/notFound/);}
  await assert.rejects(ops.create(actor,'marks',{examId:foreign.id,studentId:mark.student_id,subjectId:assigned,score:10}),/subjectNotAssigned/);
  await assert.rejects(ops.bulkMarks(actor,{examId:foreign.id,action:'save',entries:[{studentId:mark.student_id,score:10,version:mark.version}]}),own.isClassTeacher?/subjectNotAssigned/:/notFound/);
  await assert.rejects(ops.update(actor,'marks',mark.id,{version:mark.version,payload:{examId:foreign.id,studentId:mark.student_id,subjectId:foreign.payload.subjectId,score:10}}),own.isClassTeacher?/subjectNotAssigned/:/notFound/);
  await assert.rejects(ops.action(actor,'marks',mark.id,{action:'submit',version:mark.version}),own.isClassTeacher?/subjectNotAssigned/:/notFound/);
 }
 const hodMember=(await db.admin.query("SELECT * FROM memberships WHERE role='hod'")).rows[0];
 const hod:Actor={schoolId:hodMember.school_id,userId:hodMember.user_id,membershipId:hodMember.id,role:hodMember.role};
 assert.equal((await flow.classroom(hod,classId)).assignedSubjectIds.length,3);
});
test('unpublished or revoked assignments and ownership of old marks do not grant subject access',async()=>{
 const membership=(await db.admin.query('SELECT * FROM memberships WHERE user_id=$1',[NETAJI.accounts[1].id])).rows[0];
 const actor:Actor={schoolId:membership.school_id,userId:membership.user_id,membershipId:membership.id,role:membership.role};
 const staff=(await db.admin.query('SELECT id FROM staff WHERE owner_id=$1',[actor.userId])).rows[0];
 const own=await flow.classroom(actor,classId),subject=own.assignedSubjectIds[0];
 const foreign=(await db.admin.query("SELECT * FROM marks WHERE class_id=$1 AND payload->>'subjectId'<>$2 AND status='draft' LIMIT 1",[classId,subject])).rows[0];
 await db.admin.query('UPDATE marks SET owner_id=$1 WHERE id=$2',[actor.userId,foreign.id]);
 try{
  await assert.rejects(ops.get(actor,'marks',foreign.id),/notFound/);
  await db.admin.query('UPDATE timetable_entries SET published=false WHERE staff_id=$1 AND class_id=$2',[staff.id,classId]);
  assert.equal((await ops.list(actor,'exams',{classId})).total,0);
  assert.equal((await ops.list(actor,'marks',{classId})).total,0);
  assert.deepEqual((await flow.classroom(actor,classId)).assignedSubjectIds,[]);
  const ownExam=own.exams.find((e:any)=>e.payload.date==='2026-11-06')!;
  await assert.rejects(ops.create(actor,'marks',{examId:ownExam.id,studentId:own.students[9].id,subjectId:subject,score:10}),/subjectNotAssigned/);
 }finally{
  await db.admin.query('UPDATE timetable_entries SET published=true WHERE staff_id=$1 AND class_id=$2',[staff.id,classId]);
  await db.admin.query('UPDATE marks SET owner_id=$1 WHERE id=$2',[foreign.owner_id,foreign.id]);
 }
});

test('HOD class teacher appointments change all-subject history access without granting extra mark-entry subjects',async()=>{
 const hodMember=(await db.admin.query("SELECT * FROM memberships WHERE role='hod'")).rows[0];
 const hod:Actor={schoolId:hodMember.school_id,userId:hodMember.user_id,membershipId:hodMember.id,role:hodMember.role};
 const raviMember=(await db.admin.query('SELECT * FROM memberships WHERE user_id=$1',[NETAJI.accounts[1].id])).rows[0];
 const ravi:Actor={schoolId:raviMember.school_id,userId:raviMember.user_id,membershipId:raviMember.id,role:raviMember.role};
 const appointments=await ops.classTeachers(hod),classroom=appointments.data.find(c=>c.id===classId)!;
 const staff=classroom.candidates.find(c=>c.name==='Ravi Kumar')!;
 await assert.rejects(ops.appointClassTeacher(teacher,{classId,staffId:staff.id,version:classroom.version,reason:'No permission'}),/forbidden/);
 const changed=await ops.appointClassTeacher(hod,{classId,staffId:staff.id,version:classroom.version,reason:'Test rotation of class teacher'});
 try{
  const previous=await flow.classroom(teacher,classId),appointed=await flow.classroom(ravi,classId);
  assert.equal(previous.isClassTeacher,false);assert.ok(previous.exams.every((e:any)=>e.payload.subjectId===subjectId));
  assert.equal(appointed.isClassTeacher,true);assert.equal(new Set(appointed.exams.map((e:any)=>e.payload.subjectId)).size,3);assert.equal(appointed.assignedSubjectIds.length,1);
  const math=previous.exams.find((e:any)=>e.payload.date==='2026-11-06')!;
  await assert.rejects(ops.bulkMarks(ravi,{examId:math.id,action:'save',entries:[{studentId:room.students[9].id,score:20,version:0}]}),/subjectNotAssigned/);
  await assert.rejects(ops.appointClassTeacher(hod,{classId,staffId:classroom.classTeacherId,version:classroom.version,reason:'Stale update'}),/versionConflict/);
  const invalid=appointments.data.find(c=>c.id!==classId)!;
  const outside=await ops.appointClassTeacher(hod,{classId:invalid.id,staffId:staff.id,version:invalid.version,reason:'Unassigned teacher'}).catch(e=>e);assert.match(outside.message,/teacherNotAssigned/);
 }finally{await ops.appointClassTeacher(hod,{classId,staffId:classroom.classTeacherId,version:changed.version,reason:'Restore original test appointment'});}
 const audit=(await db.admin.query("SELECT metadata FROM audit_logs WHERE action='classTeacher.appointed' ORDER BY created_at DESC LIMIT 1")).rows[0];assert.ok(audit.metadata.reason);
});

test('overall pass percentage requires passing every subject and excludes incomplete subject sets',()=>{
 const exams=['math','english','evs'].map(id=>({id,payload:{maxMarks:100,passMarks:40}}));
 const pupils=['a','b','c'].map(id=>({id}));const marks=[['a','math',100],['a','english',100],['a','evs',0],['b','math',50],['b','english',60],['b','evs',70],['c','math',100]].map(([studentId,examId,score])=>({payload:{studentId,examId,score}}));
 const summary=classExamSummary(exams,marks,pupils);assert.equal(summary.passPercentage,50);assert.equal(summary.entered,2);assert.equal(summary.missing,1);assert.equal(summary.passCount,1);assert.equal(summary.results[0].passed,false);assert.equal(summary.results[2].percentage,null);
});
test('full all-subject report cards are restricted to the appointed class teacher',async()=>{
 const year=(await db.admin.query('SELECT payload FROM classes WHERE id=$1',[classId])).rows[0].payload.academicYearId;
 const card=await ops.create(principal,'reportCards',{studentId:room.students[0].id,academicYearId:year,gradingScale:'Test scale'});
 assert.equal((await ops.get(teacher,'reportCards',card.id)).id,card.id);
 const membership=(await db.admin.query('SELECT * FROM memberships WHERE user_id=$1',[NETAJI.accounts[1].id])).rows[0];
 const subjectTeacher:Actor={schoolId:membership.school_id,userId:membership.user_id,membershipId:membership.id,role:membership.role};
 assert.equal((await ops.list(subjectTeacher,'reportCards',{})).total,0);
 await assert.rejects(ops.get(subjectTeacher,'reportCards',card.id),/notFound/);
});
