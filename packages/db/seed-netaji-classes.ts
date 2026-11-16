import type {Database} from './index';
import {id} from '../auth';
import {NETAJI} from '../demo/netaji';

// Additive, local-only teaching preview. Existing pupils and family links stay intact.
export async function seedNetajiClasses(db:Database){
 if(!db.embedded||process.env.NODE_ENV==='production')throw new Error('Netaji teaching preview is local-only.');
 const teacher=NETAJI.accounts.find(a=>a.email==='anjali@netaji.school')!;
 const principal=NETAJI.accounts.find(a=>a.role==='principal')!;
 const hod=NETAJI.accounts.find(a=>a.role==='hod')!;
 await db.admin.query('BEGIN');
 try{
  const staff=(await db.admin.query('SELECT id FROM staff WHERE school_id=$1 AND owner_id=$2 AND deleted_at IS NULL',[NETAJI.schoolId,teacher.id])).rows[0];
  const original=(await db.admin.query("SELECT payload FROM classes WHERE school_id=$1 AND payload->>'name'='Grade 4' AND payload->>'section'='A' AND deleted_at IS NULL",[NETAJI.schoolId])).rows[0];
  const subject=(await db.admin.query("SELECT id FROM subjects WHERE school_id=$1 AND payload->>'code'='MATH' AND deleted_at IS NULL",[NETAJI.schoolId])).rows[0];
  if(!staff||!original||!subject)throw new Error('Initialize the Netaji Grade 4 demo first.');
  const specs=[['Grade 4','B','09:50','10:35'],['Grade 5','A','10:50','11:35'],['Grade 5','B','11:40','12:25'],['Grade 6','A','13:00','13:45'],['Grade 6','B','13:50','14:35']];
  const classIds:string[]=[];let created=0;
  for(const [index,[name,section,startTime,endTime]] of specs.entries()){
   let classroom=(await db.admin.query("SELECT id FROM classes WHERE school_id=$1 AND payload->>'name'=$2 AND payload->>'section'=$3 AND payload->>'academicYearId'=$4 AND deleted_at IS NULL",[NETAJI.schoolId,name,section,original.payload.academicYearId])).rows[0];
   if(!classroom){const classId=id();await db.admin.query('INSERT INTO classes(id,school_id,owner_id,payload,status,created_by) VALUES($1,$2,$3,$4,$5,$3)',[classId,NETAJI.schoolId,principal.id,JSON.stringify({name,section,academicYearId:original.payload.academicYearId,classTeacherId:staff.id,studentLoginEnabled:false}),'active']);classroom={id:classId};created++;}
   classIds.push(classroom.id);
   for(const weekday of [1,2,3,4,5]){
    const exists=(await db.admin.query("SELECT id FROM timetable_entries WHERE school_id=$1 AND class_id=$2 AND staff_id=$3 AND payload->>'weekday'=$4 AND deleted_at IS NULL",[NETAJI.schoolId,classroom.id,staff.id,String(weekday)])).rows.length;
    if(!exists)await db.admin.query('INSERT INTO timetable_entries(id,school_id,owner_id,class_id,staff_id,payload,status,published,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,true,$3)',[id(),NETAJI.schoolId,principal.id,classroom.id,staff.id,JSON.stringify({classId:classroom.id,subjectId:subject.id,staffId:staff.id,weekday,period:index+2,startTime,endTime,room:name+' '+section}),'published']);
   }
  }
  for(const userId of [teacher.id,hod.id]){
   const member=(await db.admin.query("SELECT id,scope FROM memberships WHERE school_id=$1 AND user_id=$2 AND role IN ('teacher','hod') AND active=true",[NETAJI.schoolId,userId])).rows[0];
   if(!member)throw new Error('Missing Netaji teaching membership.');
   const classes=[...new Set([...(member.scope.classes??[]),...classIds])];
   if(classes.length!==(member.scope.classes??[]).length)await db.admin.query('UPDATE memberships SET scope=$1 WHERE id=$2',[JSON.stringify({...member.scope,classes}),member.id]);
  }
  if(created)await db.admin.query('INSERT INTO audit_logs(id,school_id,actor_id,action,resource,metadata) VALUES($1,$2,$3,$4,$5,$6)',[id(),NETAJI.schoolId,principal.id,'demo.teachingClassesAssigned','classes',JSON.stringify({teacherId:teacher.id,addedClasses:created,studentsAdded:0})]);
  await db.admin.query('COMMIT');
 }catch(error){await db.admin.query('ROLLBACK');throw error;}
}
