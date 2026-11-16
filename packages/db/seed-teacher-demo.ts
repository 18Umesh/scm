import type {Database} from './index';
import {DEMO} from './seed';
import {id} from '../auth';
export async function seedTeacherDemo(db:Database){
 if(!db.embedded||process.env.NODE_ENV==='production')return;
 for(const schoolId of DEMO.schools){
  const teacher=(await db.admin.query('SELECT * FROM staff WHERE school_id=$1 AND owner_id=$2 AND deleted_at IS NULL',[schoolId,DEMO.users.teacher])).rows[0];
  const member=(await db.admin.query("SELECT scope FROM memberships WHERE school_id=$1 AND user_id=$2 AND role='teacher'",[schoolId,DEMO.users.teacher])).rows[0];
  const subject=(await db.admin.query('SELECT id FROM subjects WHERE school_id=$1 ORDER BY created_at LIMIT 1',[schoolId])).rows[0];
  const hod=(await db.admin.query("SELECT user_id FROM memberships WHERE school_id=$1 AND role='hod'",[schoolId])).rows[0];
  if(!teacher||!subject||!member?.scope.classes?.length)continue;
  const classId=member.scope.classes[0];
  if(!(await db.admin.query("SELECT id FROM syllabus_units WHERE school_id=$1 AND payload->>'fixture'='teacher-syllabus-v1'",[schoolId])).rows.length){
   const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});const end=new Date(today+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+7);
   await db.admin.query("INSERT INTO syllabus_units(id,school_id,owner_id,staff_id,class_id,status,payload,created_by) VALUES($1,$2,$3,$4,$5,'pending',$6,$3)",[id(),schoolId,hod.user_id,teacher.id,classId,JSON.stringify({title:'Patterns and fractions',classId,staffId:teacher.id,subjectId:subject.id,startDate:today,dueDate:end.toISOString().slice(0,10),description:'Explore patterns, introduce fractions and check understanding.',fixture:'teacher-syllabus-v1'})]);
  }
 }
}
