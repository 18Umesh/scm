import type {Database} from './index';
import {NETAJI} from '../demo/netaji';
import {studentDemoAccounts,studentDemoPin} from '../demo/students';
import {Operations,type Actor} from '../operations/service';
import {ParentFiles} from '../operations/files';

function practicePdf(){
 const stream='BT /F1 18 Tf 50 750 Td (Equivalent fractions - Grade 4) Tj 0 -35 Td /F1 12 Tf (Write two equivalent fractions for 1/2, 1/3 and 3/4.) Tj 0 -25 Td (Draw a picture to explain each answer. Bring your notebook to school.) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
 let result='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(result));result+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(result);result+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(v=>String(v).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(result);
}
export async function seedNetajiStudents(db:Database){
 if(!db.embedded||process.env.NODE_ENV==='production')throw new Error('Student examples are local-only.');
 if((await db.admin.query("SELECT id FROM audit_logs WHERE school_id=$1 AND action='demo.studentWorkspaceReady'",[NETAJI.schoolId])).rows.length)return;
 const principal=NETAJI.accounts.find(a=>a.role==='principal')!,membership=(await db.admin.query("SELECT id FROM memberships WHERE school_id=$1 AND user_id=$2 AND role='principal'",[NETAJI.schoolId,principal.id])).rows[0];
 const admin:Actor={schoolId:NETAJI.schoolId,userId:principal.id,membershipId:membership.id,role:'principal'},ops=new Operations(db);
 const klass=(await db.admin.query("SELECT * FROM classes WHERE school_id=$1 AND payload->>'name'='Grade 4' AND payload->>'section'='A' AND deleted_at IS NULL",[NETAJI.schoolId])).rows[0];
 if(!klass)return;
 if(!klass.payload.studentLoginEnabled)await ops.update(admin,'classes',klass.id,{version:klass.version,payload:{...klass.payload,studentLoginEnabled:true}});
 const pupils=(await db.admin.query("SELECT id,owner_id,payload FROM students WHERE school_id=$1 AND class_id=$2 AND deleted_at IS NULL",[NETAJI.schoolId,klass.id])).rows;
 for(const demo of studentDemoAccounts){const pupil=pupils.find(p=>p.payload.name===demo.name);if(pupil&&!pupil.payload.loginUsername)await ops.provisionStudent(admin,{studentId:pupil.id,username:demo.username,pin:studentDemoPin});}
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());
 const existing=(await db.admin.query("SELECT id FROM posts WHERE school_id=$1 AND payload->>'body'=$2 AND deleted_at IS NULL",[NETAJI.schoolId,'Hello, Grade 4! Your next discovery starts here. Check your school day, practise a little, and bring your curiosity to class. (Demo)'])).rows[0];
 if(!existing){const post=await ops.create(admin,'feed',{body:'Hello, Grade 4! Your next discovery starts here. Check your school day, practise a little, and bring your curiosity to class. (Demo)',postType:'notice',audience:{kind:'students',classIds:[klass.id],roles:['student'],userIds:[]}});await ops.action(admin,'feed',post.id,{action:'publish',version:post.version});}
 const teacher=NETAJI.accounts.find(a=>a.role==='teacher')!,tm=(await db.admin.query("SELECT id FROM memberships WHERE school_id=$1 AND user_id=$2 AND role='teacher'",[NETAJI.schoolId,teacher.id])).rows[0];
 const actor:Actor={schoolId:NETAJI.schoolId,userId:teacher.id,membershipId:tm.id,role:'teacher'};
 const period=(await db.admin.query("SELECT payload FROM timetable_entries WHERE school_id=$1 AND class_id=$2 AND staff_id IN (SELECT id FROM staff WHERE owner_id=$3) AND deleted_at IS NULL AND published=true LIMIT 1",[NETAJI.schoolId,klass.id,teacher.id])).rows[0];
 let resource=(await db.admin.query("SELECT * FROM homework WHERE school_id=$1 AND class_id=$2 AND payload->>'instructions' LIKE 'Explore equivalent fractions with the attached practice sheet.%' AND deleted_at IS NULL",[NETAJI.schoolId,klass.id])).rows[0];
 if(period){
  if(!resource)resource=await ops.create(actor,'homework',{classId:klass.id,subjectId:period.payload.subjectId,dueDate:date,instructions:'Explore equivalent fractions with the attached practice sheet. Complete the examples in your notebook and bring it to class. (Demo)',workType:'diary'});
  if(!resource.published){const files=new ParentFiles(db,ops);if(!(await files.list(actor,'homework',resource.id)).data.length)await files.upload(actor,{module:'homework',recordId:resource.id,filename:'Grade-4-fractions-practice.pdf',fileBase64:practicePdf().toString('base64')});await ops.action(actor,'homework',resource.id,{action:'publish',version:resource.version});}
 }
 await db.tenant(admin.schoolId,admin.userId,tx=>ops.audit(tx,admin,'demo.studentWorkspaceReady','students'));
}
