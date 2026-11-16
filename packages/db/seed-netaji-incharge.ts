import type {Database} from './index';
import {id,hashPassword} from '../auth';
import {NETAJI} from '../demo/netaji';
import {Operations,type Actor} from '../operations/service';
import {TeacherWorkflows} from '../operations/teacher';
export async function seedNetajiIncharge(db:Database){
 if(!db.embedded||process.env.NODE_ENV==='production')throw new Error('Incharge sample data is local-only.');
 const person=NETAJI.accounts.find(a=>a.role==='incharge')!,principal=NETAJI.accounts.find(a=>a.role==='principal')!;
 await db.admin.query('BEGIN');
 try{
  if((await db.admin.query("SELECT id FROM audit_logs WHERE school_id=$1 AND action='demo.inchargeAccountCreated'",[NETAJI.schoolId])).rows.length){await db.admin.query('COMMIT');}
  else{
   const classes=(await db.admin.query("SELECT id FROM classes WHERE school_id=$1 AND payload->>'name'='Grade 4' AND deleted_at IS NULL ORDER BY payload->>'section'",[NETAJI.schoolId])).rows.map(r=>r.id);
   const department=(await db.admin.query("SELECT id FROM departments WHERE school_id=$1 AND payload->>'name'='Primary School' AND deleted_at IS NULL",[NETAJI.schoolId])).rows[0];
   await db.admin.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[person.id,person.email,person.name,hashPassword(NETAJI.password)]);
   const membership=(await db.admin.query("SELECT id FROM memberships WHERE school_id=$1 AND user_id=$2 AND role='incharge'",[NETAJI.schoolId,person.id])).rows[0];
   if(membership)await db.admin.query('UPDATE memberships SET scope=$1 WHERE id=$2',[JSON.stringify({classes,departments:[department.id]}),membership.id]);
   else await db.admin.query('INSERT INTO memberships(id,school_id,user_id,role,scope,created_by) VALUES($1,$2,$3,$4,$5,$6)',[id(),NETAJI.schoolId,person.id,'incharge',JSON.stringify({classes,departments:[department.id]}),principal.id]);
   if(!(await db.admin.query('SELECT id FROM staff WHERE school_id=$1 AND owner_id=$2',[NETAJI.schoolId,person.id])).rows.length)await db.admin.query('INSERT INTO staff(id,school_id,owner_id,status,payload,created_by) VALUES($1,$2,$3,$4,$5,$6)',[id(),NETAJI.schoolId,person.id,'active',JSON.stringify({name:person.name,employeeNumber:'NPS-STAFF-INCHARGE',userId:person.id,departmentId:department.id,managerUserId:principal.id,designation:'Class Incharge',joinedOn:'2026-06-01'}),principal.id]);
   await db.admin.query('INSERT INTO audit_logs(id,school_id,actor_id,action,resource,metadata) VALUES($1,$2,$3,$4,$5,$6)',[id(),NETAJI.schoolId,principal.id,'demo.inchargeAccountCreated','memberships',JSON.stringify({userId:person.id,classes})]);await db.admin.query('COMMIT');
  }
 }catch(error){await db.admin.query('ROLLBACK');throw error;}
 if((await db.admin.query("SELECT id FROM audit_logs WHERE school_id=$1 AND action='demo.inchargeExamplesReady'",[NETAJI.schoolId])).rows.length)return;
 const ops=new Operations(db),flow=new TeacherWorkflows(db,ops);
 const member=(await db.admin.query("SELECT id,scope FROM memberships WHERE school_id=$1 AND user_id=$2 AND role='incharge'",[NETAJI.schoolId,person.id])).rows[0];
 const ctx:Actor={schoolId:NETAJI.schoolId,userId:person.id,membershipId:member.id,role:'incharge'};
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());const offset=(n:number)=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 for(const [i,teacher] of NETAJI.accounts.filter(a=>a.role==='teacher').entries()){
  const period=(await db.admin.query('SELECT * FROM timetable_entries WHERE school_id=$1 AND class_id=$2 AND staff_id IN (SELECT id FROM staff WHERE owner_id=$3) AND published=true AND deleted_at IS NULL LIMIT 1',[NETAJI.schoolId,member.scope.classes[0],teacher.id])).rows[0];
  const title=['Equivalent fractions (Demo)','Describing words (Demo)','Water cycle (Demo)'][i];
  if((await db.admin.query("SELECT id FROM syllabus_units WHERE school_id=$1 AND payload->>'title'=$2 AND deleted_at IS NULL",[NETAJI.schoolId,title])).rows.length)continue;
  const unit=await ops.create(ctx,'syllabus',{title,classId:period.class_id,subjectId:period.payload.subjectId,staffId:period.staff_id,startDate:offset(-14),dueDate:offset(i===2?-2:7),description:'Fictional coordination example. Teach concepts, practise examples and check understanding.'});
  if(i<2){const m=(await db.admin.query("SELECT id FROM memberships WHERE user_id=$1 AND school_id=$2 AND role='teacher'",[teacher.id,NETAJI.schoolId])).rows[0];await flow.progress({schoolId:NETAJI.schoolId,userId:teacher.id,membershipId:m.id,role:'teacher'},unit.id,{version:unit.version,status:i===0?'completed':'inProgress',...(i===0?{completedOn:offset(-3)}:{}),notes:'Fictional syllabus progress example.'});}
 }
 await db.tenant(NETAJI.schoolId,person.id,tx=>ops.audit(tx,ctx,'demo.inchargeExamplesReady','schools',NETAJI.schoolId,{syllabusExamples:3}));
}
