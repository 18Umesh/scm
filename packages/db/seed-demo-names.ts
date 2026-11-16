import type{Database}from './index';
import{DEMO}from './seed';
import{sampleNames,sampleStudents}from './demo-names';
export async function seedDemoNames(db:Database){
 if(!db.embedded||process.env.NODE_ENV==='production')return;
 for(const [role,name]of Object.entries(sampleNames))await db.admin.query("UPDATE users SET display_name=$1 WHERE email=$2 AND display_name=$3 AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=users.id AND m.school_id=ANY($4::uuid[]))",[name,role+'@demo.campus.test','Demo '+role,DEMO.schools]);
 for(const schoolId of DEMO.schools){
  for(let i=0;i<sampleStudents.length;i++)await db.admin.query("UPDATE students SET payload=jsonb_set(payload,'{name}',to_jsonb($1::text)),version=version+1 WHERE school_id=$2 AND payload->>'admissionNumber'=$3 AND payload->>'name'=$4",[sampleStudents[i],schoolId,'DEMO-'+String(i+1).padStart(3,'0'),'Fictional Learner '+String(i+1).padStart(2,'0')]);
  for(const [oldName,name]of [['Fictional Demo Teacher',sampleNames.teacher],['Fictional Demo HOD',sampleNames.hod]])await db.admin.query("UPDATE staff SET payload=jsonb_set(payload,'{name}',to_jsonb($1::text)),version=version+1 WHERE school_id=$2 AND payload->>'name'=$3 AND payload->>'employeeNumber' IN ('DEMO-T01','DEMO-H01')",[name,schoolId,oldName]);
  for(const [userId,name]of [[DEMO.users.parent,sampleNames.parent],[DEMO.users.teacher,sampleNames.teacher]])await db.admin.query("UPDATE guardians SET payload=jsonb_set(payload,'{name}',to_jsonb($1::text)),version=version+1 WHERE school_id=$2 AND owner_id=$3 AND payload->>'name'='Fictional Demo Guardian'",[name,schoolId,userId]);
  await db.admin.query("UPDATE pickup_authorizations SET payload=jsonb_set(payload,'{name}',to_jsonb($1::text)),version=version+1 WHERE school_id=$2 AND owner_id=$3 AND payload->>'name'='Fictional Demo Guardian'",[sampleNames.parent,schoolId,DEMO.users.parent]);
  const samples=(await db.admin.query("SELECT id FROM students WHERE school_id=$1 AND payload->>'name' LIKE 'Fictional Browser Test %' AND payload->>'admissionNumber' LIKE 'BROWSER-%' ORDER BY created_at,id",[schoolId])).rows;
  const first=['Arjun','Saanvi','Kabir','Tara','Nikhil','Diya','Rohan','Isha','Aditya','Kavya'];const last=['Nair','Iyer','Menon','Mehta','Varma','Desai','Kapoor','Joshi','Kulkarni','Patel'];
  for(let i=0;i<samples.length;i++)await db.admin.query("UPDATE students SET payload=jsonb_set(payload,'{name}',to_jsonb($1::text)),version=version+1 WHERE id=$2",[first[i%first.length]+' '+last[Math.floor(i/first.length)%last.length],samples[i].id]);
 }
}
