import{sampleNames,sampleStudents}from './demo-names';
import type{Database}from './index';
import {id,hashPassword}from '../auth';
import {DEMO}from './seed';
import {definitions}from '../operations/registry';
export async function seedOperations(db:Database){
 if(process.env.NODE_ENV==='production')throw new Error('Demo seed forbidden in production');
 const password=hashPassword(DEMO.password);
 await db.admin.query("INSERT INTO school_domains(host,school_id,verified,school_verified,active) VALUES('10.0.2.2',$1,true,true,true) ON CONFLICT(host) DO NOTHING",[DEMO.schools[0]]);
 await db.admin.query("UPDATE guardians SET payload=jsonb_set(payload,'{phone}',to_jsonb(CASE WHEN owner_id=$1 THEN '+910000000001' ELSE '+910000000002' END)),version=version+1 WHERE payload->>'phone'='+910000000000' AND payload->>'name'='Fictional Demo Guardian' AND owner_id=ANY($2::uuid[])",[DEMO.users.parent,[DEMO.users.parent,DEMO.users.teacher]]);
 for(const role of ['accounts','hod','management']){
  let user=(await db.admin.query('SELECT id FROM users WHERE email=$1',[`${role}@demo.campus.test`])).rows[0];
  if(!user){user={id:id()};await db.admin.query('INSERT INTO users(id,email,display_name,password_hash,totp_secret) VALUES($1,$2,$3,$4,$5)',[user.id,`${role}@demo.campus.test`,sampleNames[role as keyof typeof sampleNames],password,role==='hod'?null:DEMO.totpSecret]);}
  for(const schoolId of DEMO.schools)await db.admin.query('INSERT INTO memberships(id,school_id,user_id,role) VALUES($1,$2,$3,$4) ON CONFLICT(school_id,user_id,role) DO NOTHING',[id(),schoolId,user.id,role]);
 }
 for(const schoolId of DEMO.schools){
  if((await db.admin.query('SELECT id FROM classes WHERE school_id=$1 LIMIT 1',[schoolId])).rows.length)continue;
  const put=async(key:string,payload:Record<string,any>,options:{owner?:string;status?:string;published?:boolean}={})=>{
   const recordId=id();await db.admin.query(`INSERT INTO ${definitions[key].table}(id,school_id,owner_id,class_id,student_id,staff_id,payload,status,published,audience,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[recordId,schoolId,options.owner??DEMO.users.admin,payload.classId??null,payload.studentId??null,payload.staffId??null,JSON.stringify(payload),options.status??definitions[key].initialStatus??'active',options.published??false,payload.audience?JSON.stringify(payload.audience):null,DEMO.users.admin]);return recordId;
  };
  const year=await put('academicYears',{name:'2026-2027',startDate:'2026-06-01',endDate:'2027-04-30'});
  const hod=(await db.admin.query("SELECT user_id FROM memberships WHERE school_id=$1 AND role='hod'",[schoolId])).rows[0].user_id;
  const department=await put('departments',{name:'Demo academics',hodUserId:hod});
  const teacher=await put('staff',{name:sampleNames.teacher,employeeNumber:'DEMO-T01',userId:DEMO.users.teacher,departmentId:department,designation:'Teacher',joinedOn:'2026-06-01'},{owner:DEMO.users.teacher});
  const hodStaff=await put('staff',{name:sampleNames.hod,employeeNumber:'DEMO-H01',userId:hod,departmentId:department,designation:'Head of department',joinedOn:'2026-06-01'},{owner:hod});
  const a=await put('classes',{name:'Grade 6',section:'A',academicYearId:year,classTeacherId:teacher,studentLoginEnabled:false});
  const b=await put('classes',{name:'Grade 7',section:'A',academicYearId:year,classTeacherId:hodStaff,studentLoginEnabled:false});
  await db.admin.query("UPDATE memberships SET scope=$1,version=version+1 WHERE school_id=$2 AND user_id=$3 AND role='teacher'",[JSON.stringify({classes:[a],departments:[department]}),schoolId,DEMO.users.teacher]);
  await db.admin.query("UPDATE memberships SET scope=$1,version=version+1 WHERE school_id=$2 AND user_id=$3 AND role='hod'",[JSON.stringify({classes:[a,b],departments:[department]}),schoolId,hod]);
  for(let i=1;i<=4;i++){
   const classId=i<=2?a:b;const studentId=await put('students',{name:sampleStudents[i-1],admissionNumber:`DEMO-${String(i).padStart(3,'0')}`,classId,dateOfBirth:'2014-01-01',gender:'notProvided',apaarState:i===1?'declined':'not_provided'});
   const parent=i<=2?DEMO.users.parent:DEMO.users.teacher;await put('guardians',{name:i<=2?sampleNames.parent:sampleNames.teacher,studentId,classId,userId:parent,relationship:'guardian',phone:i<=2?'+910000000001':'+910000000002',canView:true,canPickup:false},{owner:parent});
  }
  const subject=await put('subjects',{name:'Mathematics',code:'MATH'});
  await put('subjects',{name:'Science',code:'SCI'});
  for(const weekday of [1,2,3,4,5])await put('timetable',{classId:a,subjectId:subject,staffId:teacher,weekday,period:1,startTime:'09:00',endTime:'09:45',room:'Demo room 1'},{owner:DEMO.users.teacher,status:'published',published:true});
  await put('homework',{title:'Explore fractions',classId:a,subjectId:subject,dueDate:'2026-11-12',instructions:'Fictional exercise: draw three examples of equivalent fractions.'},{owner:DEMO.users.teacher,status:'published',published:true});
  await put('feed',{title:'Welcome to your demo school',body:'All accounts and records here are fictional. You can use them to test school workflows.',postType:'notice',requiredAcknowledgement:false,audience:{kind:'both',classIds:[],roles:[],userIds:[]}},{status:'published',published:true});
  await put('feed',{title:'Staff planning meeting',body:'Fictional staff-only planning notice. Parents must never receive this record.',postType:'notice',requiredAcknowledgement:false,audience:{kind:'staff',classIds:[],roles:[],userIds:[]}},{status:'published',published:true});
  await put('calendar',{title:'Demo parent-teacher day',date:'2026-11-14',eventType:'ptm',description:'Fictional event for testing the school calendar.',audience:{kind:'both',classIds:[],roles:[],userIds:[]}},{status:'published',published:true});
  const head=await put('feeHeads',{name:'Tuition',taxable:false,accountCode:'4000'});
  await put('feePlans',{name:'Demo term plan',classId:a,feeHeadId:head,amountPaise:'150000',dueDate:'2026-11-30'});
 }
}
