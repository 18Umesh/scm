import {z} from 'zod';
import{ParentFiles}from './files';
import{postFileSchema,schoolFileLinkSchema,postUploadsEnabled}from './post-attachment-input';
import type {Database,Queryable} from '../db';
import {id} from '../auth';
import {Operations,OperationError,type Actor,type RecordRow} from './service';
import {examStatistics,marksOpen} from './exam-progress';
import{teachingSubjects,isClassTeacher}from './teaching-subjects';

export const schoolDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export class TeacherWorkflows{
 constructor(private db:Database,private ops:Operations,private files=new ParentFiles(db,ops)){}
 private async scope(tx:Queryable,ctx:Actor){
  if(!['teacher','hod'].includes(ctx.role))throw new OperationError(403,'forbidden');
  const member=(await tx.query("SELECT scope FROM memberships WHERE id=$1 AND user_id=$2 AND role=$3 AND active=true",[ctx.membershipId,ctx.userId,ctx.role])).rows[0];
  if(!member)throw new OperationError(403,'forbidden');
  const staff=(await tx.query('SELECT * FROM staff WHERE owner_id=$1 AND deleted_at IS NULL',[ctx.userId])).rows[0];
  return{classes:member.scope.classes??[],staff};
 }
 private async all(ctx:Actor,key:string,query:Record<string,unknown>={}){const rows:RecordRow[]=[];for(let page=1;;page++){const result=await this.ops.list(ctx,key,{...query,page,limit:100});rows.push(...result.data);if(page*100>=result.total)return rows;}}
 async overview(ctx:Actor){
  const own=await this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
   const scope=await this.scope(tx,ctx);const classes=(await tx.query("SELECT c.*,(SELECT count(*)::int FROM students s WHERE s.class_id=c.id AND s.deleted_at IS NULL AND s.status='active') student_count FROM classes c WHERE c.id=ANY($1::uuid[]) AND c.deleted_at IS NULL ORDER BY c.payload->>'name',c.payload->>'section'",[scope.classes])).rows;
   const periods=(await tx.query('SELECT * FROM timetable_entries WHERE staff_id=$1 AND published=true AND deleted_at IS NULL ORDER BY payload->>\'startTime\'',[scope.staff?.id??null])).rows;
   const coverPeriods=(await tx.query("SELECT * FROM timetable_entries WHERE id IN (SELECT (payload->>'timetableId')::uuid FROM substitutions WHERE staff_id=$1 AND deleted_at IS NULL) AND deleted_at IS NULL",[scope.staff?.id??null])).rows;
   const reminders=(await tx.query('SELECT * FROM teacher_reminders WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY payload->>\'remindAt\'',[ctx.userId])).rows;
   const rules=(await tx.query('SELECT operations_config FROM school_settings')).rows[0].operations_config;
   const leave=(await tx.query("SELECT payload,status FROM leave_requests WHERE staff_id=$1 AND deleted_at IS NULL AND left(payload->>'startDate',4)=$2",[scope.staff?.id??null,schoolDay().slice(0,4)])).rows;
   const balances=['casual','sick','earned','maternity','compensatory','onDuty','unpaid'].map(type=>{const used=leave.filter(r=>r.status==='approved'&&r.payload.leaveType===type).reduce((n,r)=>n+Number(r.payload.dayUnits),0);const pending=leave.filter(r=>['pending','escalated'].includes(r.status)&&r.payload.leaveType===type).reduce((n,r)=>n+Number(r.payload.dayUnits),0);return{type,allowance:type==='unpaid'?null:rules.leaveAllowanceHalfDays/2,used:used/2,pending:pending/2,remaining:type==='unpaid'?null:Math.max(0,(rules.leaveAllowanceHalfDays-used)/2)};});
   await this.ops.audit(tx,ctx,'sensitive.read','teacherWorkspace');return{staff:scope.staff,classes,periods,coverPeriods,reminders,balances};
  });
  const [calendar,feed,homework,syllabus,notifications,cover,exams,holidays]=await Promise.all(['calendar','feed','homework','syllabus','notifications','cover','exams','holidays'].map(key=>this.all(ctx,key)));
  const subjects=(await this.ops.lookup(ctx,'subjects')).data;
  const events=[...calendar.filter(r=>r.published),...holidays.filter(r=>r.published).map(r=>({...r,payload:{...r.payload,eventType:'holiday'}})),...exams.filter(r=>r.published&&own.classes.some(c=>c.id===r.class_id)).map(r=>({...r,payload:{title:r.payload.name+' - '+(subjects.find(s=>s.id===r.payload.subjectId)?.label??'Subject'),date:r.payload.date,eventType:'exam',description:r.payload.startTime+' - '+r.payload.endTime}}))];
  return{...own,postUploadsEnabled:postUploadsEnabled(ctx.schoolId),date:schoolDay(),events,feed,homework,syllabus,notifications,cover,subjects};
 }
 async classroom(ctx:Actor,classId:string){
  z.uuid().parse(classId);await this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{if(!(await this.scope(tx,ctx)).classes.includes(classId))throw new OperationError(404,'notFound');});
  const [allStudents,homework,submissions,exams,marks,syllabus]=await Promise.all(['students','homework','submissions','exams','marks','syllabus'].map(key=>this.all(ctx,key,{classId})));
  const students=allStudents.filter(r=>r.status==='active').sort((a,b)=>a.payload.admissionNumber.localeCompare(b.payload.admissionNumber,undefined,{numeric:true}));
  const checks=await this.db.tenant(ctx.schoolId,ctx.userId,async tx=>(await tx.query('SELECT * FROM assignment_checks WHERE class_id=$1 AND deleted_at IS NULL',[classId])).rows);
  const history=await this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
   const year=(await tx.query("SELECT y.payload FROM classes c JOIN academic_years y ON y.id=(c.payload->>'academicYearId')::uuid WHERE c.id=$1 AND y.deleted_at IS NULL",[classId])).rows[0]?.payload;
   const start=year?.startDate??schoolDay().slice(0,4)+'-01-01',end=year?.endDate??schoolDay().slice(0,4)+'-12-31';
   const attendance=(await tx.query("SELECT student_id,left(payload->>'date',7) AS month_key,count(*)::int recorded,count(*) FILTER (WHERE payload->>'attendance'='present')::int present,count(*) FILTER (WHERE payload->>'attendance'='absent')::int absent FROM attendance_records WHERE class_id=$1 AND deleted_at IS NULL AND COALESCE(payload->>'period','0')='0' AND payload->>'date'>=$2 AND payload->>'date'<=$3 AND payload->>'date'<$4 AND payload->>'attendance' IN ('present','absent') GROUP BY student_id,left(payload->>'date',7) ORDER BY month_key",[classId,start,end,schoolDay()])).rows.map(r=>({...r,month:r.month_key}));
   return{attendance,start,end,academicYear:year?.name??'Current year'};
  });
  const stats=exams.map(exam=>({...examStatistics(exam,marks.filter(m=>students.some(s=>s.id===m.student_id)),students.length),marksOpen:marksOpen(exam)}));
  const assignedSubjectIds=ctx.role==='teacher'?await this.db.tenant(ctx.schoolId,ctx.userId,tx=>teachingSubjects(tx,ctx.userId,classId)):[...new Set(exams.map(e=>e.payload.subjectId))];
  const classTeacher=ctx.role==='teacher'&&await this.db.tenant(ctx.schoolId,ctx.userId,tx=>isClassTeacher(tx,ctx.userId,classId));
  return{students,homework,submissions,exams,marks,syllabus,checks,stats,history,assignedSubjectIds,isClassTeacher:classTeacher,schoolDate:schoolDay()};
 }
 async reminder(ctx:Actor,input:unknown,recordId?:string){
  const body=z.object({title:z.string().trim().min(1).max(150),notes:z.string().max(2000).default(''),remindAt:z.iso.datetime({offset:true}),version:z.number().int().nonnegative().default(0),status:z.enum(['pending','completed','cancelled']).default('pending')}).strict().parse(input);
  if(recordId)z.uuid().parse(recordId);if(body.status==='pending'&&new Date(body.remindAt).getTime()<Date.now()-60000)throw new OperationError(400,'reminderMustBeFuture');
  return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{await this.scope(tx,ctx);const payload={title:body.title,notes:body.notes,remindAt:body.remindAt,role:ctx.role};let row;
   if(recordId){const previous=(await tx.query('SELECT * FROM teacher_reminders WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL FOR UPDATE',[recordId,ctx.userId])).rows[0];if(!previous)throw new OperationError(404,'notFound');if(previous.version!==body.version)throw new OperationError(409,'versionConflict');row=(await tx.query('UPDATE teacher_reminders SET payload=$1,status=$2,version=version+1,updated_at=now() WHERE id=$3 RETURNING *',[JSON.stringify(payload),body.status,recordId])).rows[0];}
   else{if(body.version!==0)throw new OperationError(409,'versionConflict');row=(await tx.query('INSERT INTO teacher_reminders(id,school_id,owner_id,status,payload,created_by) VALUES($1,$2,$3,$4,$5,$3) RETURNING *',[id(),ctx.schoolId,ctx.userId,body.status,JSON.stringify(payload)])).rows[0];}
   await this.ops.audit(tx,ctx,'reminder.saved','teacher_reminders',row.id);return row;
  });
 }
 async progress(ctx:Actor,recordId:string,input:unknown){
  z.uuid().parse(recordId);const body=z.object({version:z.number().int().positive(),status:z.enum(['pending','inProgress','completed']),completedOn:z.iso.date().optional(),notes:z.string().max(2000).default('')}).strict().parse(input);
  if(body.status==='completed'&&(!body.completedOn||body.completedOn>schoolDay()))throw new OperationError(400,'completionDateRequired');
  return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{const scope=await this.scope(tx,ctx);const row=(await tx.query('SELECT * FROM syllabus_units WHERE id=$1 AND staff_id=$2 AND deleted_at IS NULL FOR UPDATE',[recordId,scope.staff?.id??null])).rows[0];if(!row||!scope.classes.includes(row.class_id))throw new OperationError(404,'notFound');if(row.version!==body.version)throw new OperationError(409,'versionConflict');if(body.completedOn&&body.completedOn<row.payload.startDate)throw new OperationError(400,'invalidDateRange');const payload={...row.payload,progressNotes:body.notes,completedOn:body.status==='completed'?body.completedOn:null};
   const updated=(await tx.query('UPDATE syllabus_units SET status=$1,payload=$2,version=version+1,updated_at=now() WHERE id=$3 RETURNING *',[body.status,JSON.stringify(payload),recordId])).rows[0];await this.ops.audit(tx,ctx,'syllabus.progress','syllabus_units',recordId,{from:row.status,to:body.status,completedOn:body.completedOn});return updated;
  });
 }
 async track(ctx:Actor,input:unknown){
  const body=z.object({homeworkId:z.uuid(),studentId:z.uuid(),submitted:z.boolean(),version:z.number().int().nonnegative(),notes:z.string().max(1000).default('')}).strict().parse(input);
  return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{const scope=await this.scope(tx,ctx);const work=(await tx.query('SELECT * FROM homework WHERE id=$1 AND deleted_at IS NULL FOR SHARE',[body.homeworkId])).rows[0];const student=(await tx.query("SELECT * FROM students WHERE id=$1 AND deleted_at IS NULL AND status='active'",[body.studentId])).rows[0];if(!work||!student||!scope.classes.includes(work.class_id)||work.class_id!==student.class_id)throw new OperationError(404,'notFound');
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[ctx.schoolId+body.homeworkId+body.studentId]);const previous=(await tx.query("SELECT * FROM assignment_checks WHERE student_id=$1 AND payload->>'homeworkId'=$2 AND deleted_at IS NULL FOR UPDATE",[body.studentId,body.homeworkId])).rows[0];if((previous?.version??0)!==body.version)throw new OperationError(409,'versionConflict');const payload={...body,markedAt:new Date().toISOString()};let row;
   if(previous)row=(await tx.query('UPDATE assignment_checks SET payload=$1,status=$2,version=version+1,updated_at=now() WHERE id=$3 RETURNING *',[JSON.stringify(payload),body.submitted?'submitted':'pending',previous.id])).rows[0];else row=(await tx.query('INSERT INTO assignment_checks(id,school_id,owner_id,class_id,student_id,status,payload,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$3) RETURNING *',[id(),ctx.schoolId,ctx.userId,work.class_id,student.id,body.submitted?'submitted':'pending',JSON.stringify(payload)])).rows[0];await this.ops.audit(tx,ctx,'assignment.checked','assignment_checks',row.id);return row;
  });
 }
 async post(ctx:Actor,input:unknown){
  const body=z.object({title:z.string().trim().max(150).default(''),body:z.string().trim().max(8000).default(''),files:z.array(postFileSchema).max(5).default([]),links:z.array(schoolFileLinkSchema).max(5).default([]),classIds:z.array(z.uuid()).min(1).max(100),studentId:z.uuid().optional(),studentIds:z.array(z.uuid()).min(1).max(100).optional()}).strict().refine(v=>!(v.studentId&&v.studentIds),'Use one student recipient format.').refine(v=>v.body.length>0||v.files.length>0||v.links.length>0,'Write a message or add an attachment.').refine(v=>v.files.length+v.links.length<=5,'Up to five attachments per post.').parse(input);
  if(body.files.length&&!postUploadsEnabled(ctx.schoolId))throw new OperationError(403,'schoolFileLinksOnly');
  if(body.files.reduce((sum,file)=>sum+Buffer.byteLength(file.fileBase64,'base64'),0)>6*1024*1024)throw new OperationError(413,'fileTooLarge');
  const post=await this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{const scope=await this.scope(tx,ctx);if(body.classIds.some(v=>!scope.classes.includes(v)))throw new OperationError(403,'forbidden');const users:string[]=[];
   const studentIds=[...new Set(body.studentIds??(body.studentId?[body.studentId]:[]))];
   for(const studentId of studentIds){const student=(await tx.query("SELECT class_id FROM students WHERE id=$1 AND status='active' AND deleted_at IS NULL",[studentId])).rows[0];if(!student||!body.classIds.includes(student.class_id))throw new OperationError(404,'notFound');const guardians=(await tx.query("SELECT DISTINCT owner_id FROM guardians WHERE student_id=$1 AND deleted_at IS NULL AND payload->>'canView'='true'",[studentId])).rows.map(r=>r.owner_id);if(!guardians.length)throw new OperationError(400,'noLinkedGuardian');users.push(...guardians);}
   const audience={kind:studentIds.length?'people':'parents',classIds:body.classIds,roles:['parent'],userIds:[...new Set(users)],...(studentIds.length?{studentIds}:{})};return this.ops.insert(tx,ctx,'feed',{title:body.title,body:body.body,attachmentCount:body.files.length,links:body.links,postType:'notice',requiredAcknowledgement:false,audience},{status:'draft',published:false});
  });
  const uploaded:string[]=[];
  try{
   for(const file of body.files){const saved=await this.files.upload(ctx,{module:'feed',recordId:post.id,...file});uploaded.push(saved.id);}
   const result=await this.ops.action(ctx,'feed',post.id,{action:'publish',version:post.version});if(!('id'in result))throw new OperationError(500,'serverError');return result;
  }catch(error){
   await this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
    await tx.query("UPDATE parent_files SET deleted_at=now(),status='removed',version=version+1 WHERE payload->>'module'='feed' AND payload->>'recordId'=$1 AND deleted_at IS NULL",[post.id]);
    await tx.query("UPDATE posts SET deleted_at=now(),version=version+1 WHERE id=$1 AND published=false",[post.id]);
    await this.ops.audit(tx,ctx,'post.attachmentFailed','posts',post.id);
   });
   await Promise.all(uploaded.map(fileId=>this.files.erase(ctx.schoolId,fileId)));throw error;
  }
 }
}

export async function dispatchTeacherReminders(db:Database,schoolId:string){return db.tenant(schoolId,undefined,async tx=>{
 const rows=(await tx.query("SELECT * FROM teacher_reminders WHERE status='pending' AND deleted_at IS NULL AND (payload->>'remindAt')::timestamptz<=now() ORDER BY payload->>'remindAt' FOR UPDATE SKIP LOCKED LIMIT 50")).rows;
 for(const row of rows){const membership=(await tx.query("SELECT id,role FROM memberships WHERE user_id=$1 AND role=$2 AND active=true",[row.owner_id,row.payload.role])).rows[0];if(membership){const ops=new Operations(db);await ops.notify(tx,{schoolId,userId:row.owner_id,membershipId:membership.id,role:membership.role},row.owner_id,'Personal reminder',row.payload.title,{reminderId:row.id,audience:{kind:'staff',roles:[membership.role],classIds:[],userIds:[]}});}await tx.query("UPDATE teacher_reminders SET status=$1,payload=payload||jsonb_build_object('notifiedAt',now()),version=version+1 WHERE id=$2",[membership?'reminded':'cancelled',row.id]);}
 return rows.length;
});}
