import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,type Database} from '../packages/db';
import {seedNetaji} from '../packages/db/seed-netaji';
import {NETAJI} from '../packages/demo/netaji';
import {Operations,type Actor} from '../packages/operations/service';
import {InchargeWorkflows} from '../packages/operations/incharge';
import {Finance} from '../packages/operations/finance';
let db:Database,ops:Operations,flow:InchargeWorkflows,ctx:Actor,data:any;
before(async()=>{db=await createDatabase({mode:'embedded'});await db.migrate();await seedNetaji(db);ops=new Operations(db);flow=new InchargeWorkflows(db,ops);const m=(await db.admin.query("SELECT * FROM memberships WHERE school_id=$1 AND role='incharge'",[NETAJI.schoolId])).rows[0];ctx={schoolId:m.school_id,userId:m.user_id,membershipId:m.id,role:'incharge'};data=await flow.overview(ctx,{});});
after(async()=>{await db?.close();});
test('incharge sees only assigned Grade 4 classes, teachers and academic records',async()=>{
 assert.equal(data.classes.length,2);assert.ok(data.classes.every((c:any)=>c.payload.name==='Grade 4'));assert.equal(data.students.length,10);assert.equal(data.periods.length,20);assert.equal(data.syllabus.length,3);assert.equal(data.staff.filter((s:any)=>s.owner_id!==ctx.userId).length,3);
 const foreign=(await db.admin.query("SELECT id FROM classes WHERE payload->>'name'='Grade 5' LIMIT 1")).rows[0];await assert.rejects(ops.get(ctx,'classes',foreign.id),/notFound/);assert.equal((await ops.list(ctx,'timetable',{classId:foreign.id})).total,0);await assert.rejects(new Finance(db).overview(ctx),/forbidden/);await assert.rejects(ops.list(ctx,'invoices',{}),/forbidden/);
 await assert.rejects(flow.overview({...ctx,role:'parent'},{}),/forbidden/);
});
test('incharge syllabus assignments use the teacher assigned to the class and subject',async()=>{
 const period=data.periods[0];const payload={classId:period.class_id,staffId:period.staff_id,subjectId:period.payload.subjectId,title:'Incharge test unit',startDate:'2026-11-01',dueDate:'2026-12-01',description:'Teach and check understanding.'};
 const saved=await ops.create(ctx,'syllabus',payload);assert.equal(saved.status,'pending');
 const other=data.subjects.find((s:any)=>s.id!==payload.subjectId);await assert.rejects(ops.create(ctx,'syllabus',{...payload,subjectId:other.id}),/subjectNotAssigned/);
 const foreign=(await db.admin.query("SELECT id FROM classes WHERE payload->>'name'='Grade 5' LIMIT 1")).rows[0];await assert.rejects(ops.create(ctx,'syllabus',{...payload,classId:foreign.id}),/forbidden/);
 await assert.rejects(ops.create(ctx,'marks',{examId:data.exams[0].id,studentId:data.students[0].id,subjectId:payload.subjectId,score:20}),/forbidden/);
 await assert.rejects(ops.action(ctx,'marks',data.marks[0].id,{action:'approve',version:data.marks[0].version}),/forbidden/);
});
test('class teacher changes and class updates enforce the same assigned scope',async()=>{
 const classes=await ops.classTeachers(ctx);assert.equal(classes.data.length,2);const target=classes.data.find(c=>c.name==='Grade 4 A')!,teacher=target.candidates[0];assert.ok(teacher);
 const result=await ops.appointClassTeacher(ctx,{classId:target.id,staffId:teacher.id,version:target.version,reason:'Fictional appointment test'});assert.equal(result.classTeacherId,teacher.id);
 const foreign=(await db.admin.query("SELECT id,version FROM classes WHERE payload->>'name'='Grade 5' LIMIT 1")).rows[0];await assert.rejects(ops.appointClassTeacher(ctx,{classId:foreign.id,staffId:teacher.id,version:foreign.version,reason:'Invalid class'}),/notFound/);
 await assert.rejects(ops.create(ctx,'feed',{body:'No school-wide publishing.',postType:'notice',audience:{kind:'both',classIds:[],roles:[],userIds:[]}}),/forbidden/);
 const post=await ops.create(ctx,'feed',{body:'A class coordination update.',postType:'notice',audience:{kind:'both',classIds:[target.id],roles:[],userIds:[]}});await ops.action(ctx,'feed',post.id,{action:'publish',version:post.version});assert.equal((await ops.get(ctx,'feed',post.id)).published,true);
});
test('Incharge leave approval is restricted to explicitly routed requests',async()=>{
 const teacher=NETAJI.accounts.find(a=>a.role==='teacher')!;const member=(await db.admin.query("SELECT id FROM memberships WHERE user_id=$1 AND role='teacher'",[teacher.id])).rows[0];const staff=data.staff.find((s:any)=>s.owner_id===teacher.id);const request=await ops.create({schoolId:ctx.schoolId,userId:teacher.id,membershipId:member.id,role:'teacher'},'leave',{staffId:staff.id,leaveType:'casual',startDate:'2099-11-05',endDate:'2099-11-05',halfDay:false,reason:'Fictional delegated review.'});
 await assert.rejects(ops.get(ctx,'leave',request.id),/notFound/);
 await db.admin.query("UPDATE leave_requests SET payload=payload||$1::jsonb WHERE id=$2",[JSON.stringify({approverUserId:ctx.userId}),request.id]);
 const visible=await ops.get(ctx,'leave',request.id);assert.equal(visible.payload.reason,'Fictional delegated review.');const approved=await ops.action(ctx,'leave',request.id,{action:'approve',version:visible.version});assert.ok('status' in approved);assert.equal(approved.status,'approved');
});
