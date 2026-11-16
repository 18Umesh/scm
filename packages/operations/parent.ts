import {z} from 'zod';
import type{Database} from '../db';
import {id} from '../auth';
import {Operations,OperationError,type Actor} from './service';

const parentSchoolDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());
export class ParentWorkflows{
 constructor(private db:Database,private ops:Operations){}
 async feed(ctx:Actor,input:unknown){
  if(ctx.role!=='parent')throw new OperationError(403,'forbidden');
  const {studentId,scope,sort,page,limit}=z.object({studentId:z.uuid(),scope:z.enum(['global','mine']).default('global'),sort:z.enum(['newest','oldest']).default('newest'),page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(100).default(20)}).parse(input);
  const child=await this.ops.get(ctx,'students',studentId);const posts:any[]=[];
  for(let p=1;;p++){const result=await this.ops.list(ctx,'feed',{status:'published',page:p,limit:100});posts.push(...result.data);if(p*100>=result.total)break;}
  const visible=posts.filter(row=>{const audience=row.audience??row.payload.audience??{};const targeted=audience.kind==='people'||audience.classIds?.length||row.student_id;if(scope==='global')return !targeted;if(!targeted)return false;if(row.student_id&&row.student_id!==studentId)return false;if(audience.studentIds?.length&&!audience.studentIds.includes(studentId))return false;return !audience.classIds?.length||audience.classIds.includes(child.class_id);}).sort((a,b)=>(sort==='newest'?-1:1)*(new Date(a.created_at).getTime()-new Date(b.created_at).getTime())||a.id.localeCompare(b.id));
  return{data:visible.slice((page-1)*limit,page*limit),total:visible.length,page,limit};
 }
 async learning(ctx:Actor,input:unknown){
  if(ctx.role!=='parent')throw new OperationError(403,'forbidden');const {studentId}=z.object({studentId:z.uuid()}).parse(input);const child=await this.ops.get(ctx,'students',studentId);
  const all=async(key:string,query:Record<string,unknown>)=>{const data:any[]=[];for(let page=1;;page++){const r=await this.ops.list(ctx,key,{...query,page,limit:100});data.push(...r.data);if(page*100>=r.total)return data;}};
  const [attendance,exams,marks,homework,submissions]=await Promise.all([all('attendance',{studentId}),all('exams',{classId:child.class_id}),all('marks',{studentId}),all('homework',{classId:child.class_id}),all('submissions',{studentId})]);
  const published=homework.filter(r=>r.published);const checks=await this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{await this.ops.audit(tx,ctx,'sensitive.read','parentLearning',studentId);return(await tx.query("SELECT payload->>'homeworkId' AS homework_id,status,updated_at FROM assignment_checks WHERE student_id=$1 AND deleted_at IS NULL",[studentId])).rows.filter(r=>published.some(h=>h.id===r.homework_id));});
  return{attendance:attendance.filter(r=>r.student_id===studentId&&Number(r.payload.period??0)===0),exams:exams.filter(r=>r.published),marks:marks.filter(r=>r.student_id===studentId&&r.published),homework:published,submissions:submissions.filter(r=>r.student_id===studentId),checks};
 }
 async reviewDeletion(ctx:Actor,requestId:string,input:unknown){
  if(!['principal','admin'].includes(ctx.role))throw new OperationError(403,'forbidden');const body=z.object({decision:z.enum(['retain','restrict','anonymize']),reason:z.string().trim().min(20).max(2000),reviewed:z.literal(true),retentionUntil:z.iso.date().optional()}).strict().parse(input);await this.ops.get(ctx,'dataRequests',requestId);
  return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
   const request=(await tx.query("SELECT * FROM data_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[requestId])).rows[0];if(!request||request.payload.requestType!=='deletion'||!['open','retained','restricted'].includes(request.status)||!request.student_id)throw new OperationError(409,'recordLocked');
   const student=(await tx.query("SELECT * FROM students WHERE id=$1 FOR UPDATE",[request.student_id])).rows[0];let next='resolved';const today=parentSchoolDay();const eraseIds:string[]=[];
   if(body.decision==='retain'){if(!body.retentionUntil||body.retentionUntil<=today)throw new OperationError(400,'retentionDateRequired');next='retained';}
   else if(body.decision==='restrict'){
    next='restricted';await tx.query("UPDATE students SET payload=payload||'{\"optionalProcessingRestricted\":true}'::jsonb,version=version+1 WHERE id=$1",[student.id]);
   }else{
    if(student.status!=='withdrawn')throw new OperationError(409,'withdrawalRequired');
    const hold=(await tx.query("SELECT id FROM privacy_holds WHERE student_id=$1 AND deleted_at IS NULL AND payload->>'expiresOn'>=$2 LIMIT 1",[student.id,today])).rows[0];if(hold)throw new OperationError(409,'retentionHoldActive');
    const financial=(await tx.query("SELECT id FROM fee_invoices WHERE student_id=$1 AND status='issued' UNION ALL SELECT id FROM payments WHERE student_id=$1 UNION ALL SELECT id FROM certificates WHERE student_id=$1 AND status='issued' UNION ALL SELECT id FROM report_cards WHERE student_id=$1 AND status IN ('approved','published') LIMIT 1",[student.id])).rows[0];if(financial)throw new OperationError(409,'retainedRecordsExist');
    if((await tx.query("SELECT id FROM library_loans WHERE student_id=$1 AND status='issued' AND deleted_at IS NULL UNION ALL SELECT id FROM hostel_allocations WHERE student_id=$1 AND status='active' AND deleted_at IS NULL LIMIT 1",[student.id])).rows.length)throw new OperationError(409,'activeServicesExist');
    const files=(await tx.query("SELECT id FROM parent_files WHERE (student_id=$1 OR payload->'studentIds' ? $1::text) AND deleted_at IS NULL",[student.id])).rows;eraseIds.push(...files.map(f=>f.id));
    await tx.query("UPDATE parent_files SET deleted_at=now(),status='removed',payload=jsonb_build_object('erasureRequestId',$2::text),version=version+1 WHERE id=ANY($1::uuid[])",[eraseIds,request.id]);
    for(const fileId of eraseIds)await tx.query("INSERT INTO outbox_events(id,school_id,owner_id,status,payload,created_by) VALUES($1,$2,$3,'pending',$4,$3)",[id(),ctx.schoolId,ctx.userId,JSON.stringify({eventType:'fileErase',fileId})]);
    for(const table of ['assignment_checks','attendance_records','student_leave_requests','homework_submissions','marks','grievances','safety_reports','health_records','remedial_sessions','discipline_records','achievements','pickup_authorizations','gate_passes','ptm_bookings','enrollments','case_updates'])await tx.query(`UPDATE ${table} SET deleted_at=now(),payload=jsonb_build_object('redacted',true,'erasureRequestId',$2::text),version=version+1 WHERE student_id=$1 AND deleted_at IS NULL`,[student.id,request.id]);
    await tx.query("UPDATE guardians SET payload=jsonb_build_object('studentId',$1::text,'canView',false,'canPickup',false,'redacted',true),version=version+1 WHERE student_id=$1",[student.id]);
    await tx.query('SELECT disable_student_membership($1)',[student.id]);
    await tx.query("UPDATE students SET status='anonymized',owner_id=NULL,payload=jsonb_build_object('name','Anonymized learner','admissionNumber','ANON-'||id::text,'classId',class_id::text,'redacted',true),version=version+1 WHERE id=$1",[student.id]);
    await tx.query("UPDATE privacy_exports SET status='expired',payload=payload-'encryptedContent',version=version+1 WHERE student_id=$1 AND status='ready'",[student.id]);
   }
   const payload={...request.payload,resolution:{...body,reviewedBy:ctx.userId,reviewedAt:new Date().toISOString()}};if(body.decision==='anonymize')payload.description='Deletion request completed after retention review';
   await tx.query('UPDATE data_requests SET status=$1,payload=$2,version=version+1,updated_at=now() WHERE id=$3',[next,JSON.stringify(payload),request.id]);await this.ops.audit(tx,ctx,'privacy.'+body.decision,'data_requests',request.id,{reason:body.reason});return{ok:true,status:next,eraseIds};
  });
 }
 async slots(ctx:Actor,studentId:string){const child=await this.ops.get(ctx,'students',z.uuid().parse(studentId));const slots=await this.ops.list(ctx,'ptmSlots',{classId:child.class_id,limit:100});return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{const booked=(await tx.query("SELECT payload->>'slotId' AS slot FROM ptm_bookings WHERE status='booked' AND deleted_at IS NULL AND payload ? 'slotId'")).rows;return{data:slots.data.filter(s=>s.payload.date>=parentSchoolDay()).map(s=>({...s,available:!booked.some(b=>b.slot===s.id)}))};});}
 async book(ctx:Actor,input:unknown){if(ctx.role!=='parent')throw new OperationError(403,'forbidden');const body=z.object({slotId:z.uuid(),studentId:z.uuid()}).strict().parse(input);const child=await this.ops.get(ctx,'students',body.studentId),slot=await this.ops.get(ctx,'ptmSlots',body.slotId);if(child.class_id!==slot.class_id||slot.payload.date<parentSchoolDay())throw new OperationError(400,'invalidDateRange');return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{await tx.query('SELECT id FROM ptm_slots WHERE id=$1 FOR UPDATE',[body.slotId]);if((await tx.query("SELECT id FROM ptm_bookings WHERE payload->>'slotId'=$1 AND status='booked' AND deleted_at IS NULL",[body.slotId])).rows.length)throw new OperationError(409,'bookingConflict');return this.ops.insert(tx,ctx,'ptm',{slotId:body.slotId,studentId:body.studentId,staffId:slot.payload.staffId,date:slot.payload.date,startTime:slot.payload.startTime,endTime:slot.payload.endTime});});}
 async vote(ctx:Actor,postId:string,input:unknown){if(ctx.role!=='parent')throw new OperationError(403,'forbidden');const body=z.object({choice:z.string().trim().min(1).max(200),version:z.number().int().nonnegative().default(0)}).strict().parse(input);const post=await this.ops.get(ctx,'feed',postId);const options=post.payload.pollOptions?.split('\n')??[];if(!post.published||post.payload.postType!=='poll'||!options.includes(body.choice))throw new OperationError(400,'invalidPollOptions');if(post.payload.closesOn&&post.payload.closesOn<parentSchoolDay())throw new OperationError(409,'surveyClosed');return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{await tx.query('SELECT id FROM posts WHERE id=$1 FOR UPDATE',[post.id]);const existing=(await tx.query("SELECT id,version FROM survey_responses WHERE owner_id=$1 AND payload->>'surveyId'=$2 AND deleted_at IS NULL",[ctx.userId,post.id])).rows[0];if((existing?.version??0)!==body.version)throw new OperationError(409,'versionConflict');const payload={surveyId:post.id,poll:true,questions:[post.payload.title],answers:[body.choice]};if(existing)await tx.query('UPDATE survey_responses SET payload=$1,version=version+1 WHERE id=$2',[JSON.stringify(payload),existing.id]);else await tx.query("INSERT INTO survey_responses(id,school_id,owner_id,status,payload,created_by) VALUES($1,$2,$3,'submitted',$4,$3)",[id(),ctx.schoolId,ctx.userId,JSON.stringify(payload)]);return{ok:true,version:body.version+1};});}
 async respond(ctx:Actor,surveyId:string,input:unknown){
  if(ctx.role!=='parent')throw new OperationError(403,'forbidden');
  const body=z.object({answers:z.array(z.string().trim().min(1).max(2000)).min(1).max(30),version:z.number().int().nonnegative().default(0)}).strict().parse(input);
  const survey=await this.ops.get(ctx,'surveys',surveyId);
  if(!survey.published||survey.payload.closesOn&&survey.payload.closesOn<parentSchoolDay())throw new OperationError(409,'surveyClosed');
  const questions=survey.payload.questions.split('\n').map((v:string)=>v.trim()).filter(Boolean);if(body.answers.length!==questions.length)throw new OperationError(400,'answerEveryQuestion');
  return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
   await tx.query('SELECT id FROM surveys WHERE id=$1 FOR UPDATE',[surveyId]);
   const existing=(await tx.query("SELECT id,version FROM survey_responses WHERE owner_id=$1 AND payload->>'surveyId'=$2 AND deleted_at IS NULL",[ctx.userId,surveyId])).rows[0];
   if((existing?.version??0)!==body.version)throw new OperationError(409,'versionConflict');
   const payload={surveyId,questions,answers:body.answers,submittedAt:new Date().toISOString()};
   if(existing)await tx.query('UPDATE survey_responses SET payload=$1,version=version+1,updated_at=now() WHERE id=$2',[JSON.stringify(payload),existing.id]);
   else await tx.query("INSERT INTO survey_responses(id,school_id,owner_id,status,payload,created_by) VALUES($1,$2,$3,'submitted',$4,$3)",[id(),ctx.schoolId,ctx.userId,JSON.stringify(payload)]);
   await this.ops.audit(tx,ctx,'survey.responded','surveys',surveyId);return{ok:true,version:body.version+1};
  });
 }
 async responses(ctx:Actor,surveyId:string){const survey=await this.ops.get(ctx,'surveys',surveyId);if(!['principal','admin'].includes(ctx.role)&&survey.owner_id!==ctx.userId)throw new OperationError(403,'forbidden');return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{await this.ops.audit(tx,ctx,'sensitive.read','surveyResponses',surveyId);return{data:(await tx.query("SELECT id,payload,updated_at FROM survey_responses WHERE payload->>'surveyId'=$1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1000",[surveyId])).rows};});}
 async submit(ctx:Actor,input:unknown){
  if(ctx.role!=='parent')throw new OperationError(403,'forbidden');const body=z.object({homeworkId:z.uuid(),studentId:z.uuid(),answer:z.string().trim().min(1).max(8000),version:z.number().int().nonnegative().default(0)}).strict().parse(input);
  const [child,homework]=await Promise.all([this.ops.get(ctx,'students',body.studentId),this.ops.get(ctx,'homework',body.homeworkId)]);if(child.class_id!==homework.class_id)throw new OperationError(403,'forbidden');
  if(homework.payload.dueDate<parentSchoolDay())throw new OperationError(409,'homeworkClosed');
  return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[ctx.schoolId+':submission:'+body.studentId+':'+body.homeworkId]);const existing=(await tx.query("SELECT * FROM homework_submissions WHERE student_id=$1 AND payload->>'homeworkId'=$2 AND deleted_at IS NULL FOR UPDATE",[body.studentId,body.homeworkId])).rows[0];
   if(existing?.status==='reviewed')throw new OperationError(409,'recordLocked');if((existing?.version??0)!==body.version)throw new OperationError(409,'versionConflict');
   const payload={homeworkId:body.homeworkId,studentId:body.studentId,classId:child.class_id,answer:body.answer};
   if(existing){if(existing.owner_id!==ctx.userId)throw new OperationError(403,'forbidden');return(await tx.query("UPDATE homework_submissions SET payload=$1,status='submitted',version=version+1,updated_at=now() WHERE id=$2 RETURNING *",[JSON.stringify(payload),existing.id])).rows[0];}
   return this.ops.insert(tx,ctx,'submissions',payload);
  });
 }
 async updates(ctx:Actor,module:string,recordId:string,input?:unknown){
  if(!['grievances','safety','dataRequests'].includes(module))throw new OperationError(404,'notFound');const record=await this.ops.get(ctx,module,recordId);
  if(input!==undefined){const body=z.object({message:z.string().trim().min(1).max(4000)}).strict().parse(input);return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{const updateId=id();await tx.query("INSERT INTO case_updates(id,school_id,owner_id,student_id,status,payload,created_by) VALUES($1,$2,$3,$4,'active',$5,$3)",[updateId,ctx.schoolId,ctx.userId,record.student_id,JSON.stringify({module,recordId,message:body.message,authorRole:ctx.role})]);const recipient=ctx.userId===record.owner_id?(await tx.query("SELECT user_id FROM memberships WHERE role='principal' AND active=true LIMIT 1")).rows[0]?.user_id:record.owner_id;if(ctx.role==='parent'&&['grievances','safety'].includes(module)&&record.student_id){for(const target of await this.ops.caseRecipients(tx,record.student_id))await this.ops.notify(tx,ctx,target.user_id,'Concern updated: '+record.payload.title,body.message,{recordId,module,audience:{kind:'staff',classIds:[],roles:[target.role],userIds:[]}});}else if(recipient)await this.ops.notify(tx,ctx,recipient,'caseUpdated',body.message,{recordId,module,audience:{kind:recipient===record.owner_id&&record.payload.requesterRole==='parent'?'parents':'staff',classIds:[],roles:[],userIds:[]}});return{ok:true};});}
  return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>({data:(await tx.query("SELECT id,owner_id,payload,created_at FROM case_updates WHERE payload->>'module'=$1 AND payload->>'recordId'=$2 ORDER BY created_at LIMIT 1000",[module,recordId])).rows}));
 }
}
