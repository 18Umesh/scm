import type {Database} from './index';
import {NETAJI} from '../demo/netaji';
import {Operations,type Actor} from '../operations/service';
import {definitions} from '../operations/registry';
import {TeacherWorkflows} from '../operations/teacher';
export async function seedNetajiParent(db:Database){
 if(!db.embedded||process.env.NODE_ENV==='production')throw new Error('Parent examples are local-only.');
 const schoolId=NETAJI.schoolId;
 const actor=async(role:string,userId=NETAJI.accounts.find(a=>a.role===role)!.id):Promise<Actor>=>{const m=(await db.admin.query('SELECT * FROM memberships WHERE school_id=$1 AND user_id=$2 AND role=$3 AND active=true',[schoolId,userId,role])).rows[0];return{schoolId,userId,membershipId:m.id,role:m.role};};
 const principal=await actor('principal'),ops=new Operations(db),teachers=new TeacherWorkflows(db,ops);
 // Add the school-wide feed example even when earlier parent examples are already present.
 let schoolPost=(await db.admin.query("SELECT * FROM posts WHERE school_id=$1 AND payload->>'body'=$2 AND deleted_at IS NULL",[schoolId,'Welcome to Netaji Public School (Demo). Follow school-wide celebrations and announcements here. Class and individual updates are in My Feed.'])).rows[0];
 if(!schoolPost)schoolPost=await ops.create(principal,'feed',{body:'Welcome to Netaji Public School (Demo). Follow school-wide celebrations and announcements here. Class and individual updates are in My Feed.',postType:'notice',audience:{kind:'both',classIds:[],roles:[],userIds:[]}});
 if(!schoolPost.published)await ops.action(principal,'feed',schoolPost.id,{action:'publish',version:schoolPost.version});
 await db.admin.query("UPDATE homework SET payload=jsonb_set(payload,'{instructions}',to_jsonb($2::text)),version=version+1 WHERE school_id=$1 AND payload->>'instructions'=$3",[schoolId,'Draw and label four equivalent-fraction pairs in your notebook. Bring the completed work to school. Fictional practice assignment.','Draw and label four equivalent-fraction pairs. You may write an answer or upload a photo of your notebook. Fictional practice assignment.']);
 if((await db.admin.query("SELECT id FROM audit_logs WHERE school_id=$1 AND action='demo.parentExamplesReady'",[schoolId])).rows.length)return;

 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());const offset=(n:number)=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const classroom=(await db.admin.query("SELECT * FROM classes WHERE school_id=$1 AND payload->>'name'='Grade 4' AND payload->>'section'='A' AND deleted_at IS NULL",[schoolId])).rows[0];
 const students=(await db.admin.query("SELECT * FROM students WHERE school_id=$1 AND class_id=$2 AND deleted_at IS NULL ORDER BY payload->>'admissionNumber'",[schoolId,classroom.id])).rows;
 const ensure=async(who:Actor,key:string,field:string,value:string,payload:Record<string,unknown>)=>(await db.admin.query(`SELECT * FROM ${definitions[key].table} WHERE school_id=$1 AND payload->>$2=$3 AND deleted_at IS NULL`,[schoolId,field,value])).rows[0]??ops.create(who,key,payload);
 const publish=async(who:Actor,key:string,row:any)=>row.published?row:ops.action(who,key,row.id,{action:'publish',version:row.version});
 let assignment:any,mathTeacher:Actor|undefined;
 for(const [i,person] of NETAJI.accounts.filter(a=>a.role==='teacher').entries()){
  const ctx=await actor('teacher',person.id);const period=(await db.admin.query('SELECT * FROM timetable_entries WHERE school_id=$1 AND class_id=$2 AND staff_id IN (SELECT id FROM staff WHERE owner_id=$3) AND published=true AND deleted_at IS NULL LIMIT 1',[schoolId,classroom.id,person.id])).rows[0];
  const diaryText=['Practise equivalent fractions using paper folding. Bring your mathematics notebook. (Demo)','Read a short story and underline five describing words. (Demo)','Observe how water changes when heated or cooled. Discuss the water cycle at home. (Demo)'][i];
  const diary=await ensure(ctx,'homework','instructions',diaryText,{classId:classroom.id,subjectId:period.payload.subjectId,dueDate:offset(2),workType:'diary',instructions:diaryText});await publish(ctx,'homework',diary);
  if(i<2){const title=['Fraction practice sheet (Demo)','My describing words (Demo)'][i];const row=await ensure(ctx,'homework','title',title,{classId:classroom.id,subjectId:period.payload.subjectId,dueDate:offset(7),workType:'assignment',title,instructions:i===0?'Draw and label four equivalent-fraction pairs in your notebook. Bring the completed work to school. Fictional practice assignment.':'Write five sentences about your favourite place, using a different describing word in each. Fictional practice assignment.'});await publish(ctx,'homework',row);if(i===0){assignment=row;mathTeacher=ctx;}}
  const slot=await ensure(principal,'ptmSlots','description',person.name+' — Grade 4 parent meeting (Demo)',{staffId:period.staff_id,classId:classroom.id,date:offset(7),startTime:'15:30',endTime:'15:45',description:person.name+' — Grade 4 parent meeting (Demo)'});await publish(principal,'ptmSlots',slot);
 }
 if(assignment&&mathTeacher&&!(await db.admin.query("SELECT id FROM assignment_checks WHERE school_id=$1 AND student_id=$2 AND payload->>'homeworkId'=$3 AND deleted_at IS NULL",[schoolId,students[0].id,assignment.id])).rows.length)await teachers.track(mathTeacher,{homeworkId:assignment.id,studentId:students[0].id,submitted:true,version:0});
 const audience={kind:'both',classIds:[classroom.id],roles:[],userIds:[]};
 const meeting=await ensure(principal,'calendar','title','Grade 4 parent–teacher meeting (Demo)',{title:'Grade 4 parent–teacher meeting (Demo)',date:offset(7),eventType:'ptm',description:'Book an available meeting slot from Family services. Bring your child’s learning notebook. Fictional event.',audience});await publish(principal,'calendar',meeting);
 const holiday=await ensure(principal,'holidays','title','School holiday preview (Demo)',{title:'School holiday preview (Demo)',date:offset(14),description:'Fictional calendar example. This is not a real school closure.',audience});await publish(principal,'holidays',holiday);
 const notice=await ensure(principal,'feed','body','Grade 4 parent update (Demo): Review the class Diary and book a parent–teacher meeting slot from Family services.',{body:'Grade 4 parent update (Demo): Review the class Diary and book a parent–teacher meeting slot from Family services.',postType:'notice',requiredAcknowledgement:true,audience});await publish(principal,'feed',notice);
 const survey=await ensure(principal,'surveys','title','Grade 4 family feedback (Demo)',{title:'Grade 4 family feedback (Demo)',questions:'Which school updates are most useful to your family?\nWhat would help with learning at home?',closesOn:offset(30),audience});await publish(principal,'surveys',survey);
 const consent=await ensure(principal,'consentNotices','noticeVersion','demo-photos-v1',{title:'Class photo sharing choice (Demo)',purpose:'photos',body:'Optional fictional photo-sharing notice. You can consent, decline or withdraw. No consent is selected for you.',noticeVersion:'demo-photos-v1',audience});await publish(principal,'consentNotices',consent);
 const yearId=classroom.payload.academicYearId;
 const term=await ensure(principal,'terms','name','Published assessment period (Demo)',{name:'Published assessment period (Demo)',academicYearId:yearId,startDate:'2026-06-01',endDate:'2026-10-31'});
 const grading='Demo report bands';
 for(const [minimum,maximum,grade] of [[0,39.99,'Needs support'],[40,59.99,'Developing'],[60,79.99,'Secure'],[80,100,'Strong']] as const){if(!(await db.admin.query("SELECT id FROM grading_scales WHERE school_id=$1 AND payload->>'name'=$2 AND payload->>'grade'=$3",[schoolId,grading,grade])).rows.length)await ops.create(principal,'grading',{name:grading,minimum,maximum,grade,remarks:'Fictional demo bands, not an official school grading policy.'});}
 for(const student of students.slice(0,3)){
  let report=(await db.admin.query("SELECT * FROM report_cards WHERE school_id=$1 AND student_id=$2 AND payload->>'termId'=$3 AND deleted_at IS NULL",[schoolId,student.id,term.id])).rows[0]??await ops.create(principal,'reportCards',{studentId:student.id,academicYearId:yearId,termId:term.id,gradingScale:grading,remarks:'Fictional local demonstration report. Includes only the fully published June–October assessments.'});
  if(report.status==='draft')report=await ops.action(principal,'reportCards',report.id,{action:'approve',version:report.version});await publish(principal,'reportCards',report);
 }
 await db.tenant(schoolId,principal.userId,tx=>ops.audit(tx,principal,'demo.parentExamplesReady','schools',schoolId,{diary:3,assignments:2,meetingSlots:3,reportCards:3,fictional:true}));
}
