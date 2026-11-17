import {z} from 'zod';
import type {Database} from '../db';
import {Operations,OperationError,type Actor} from './service';

export class StudentWorkflows{
 constructor(private db:Database,private ops:Operations){}
 private async profile(ctx:Actor){
  if(ctx.role!=='student')throw new OperationError(403,'forbidden');
  return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
   const row=(await tx.query("SELECT s.id,s.class_id,s.payload,c.payload AS classroom,t.payload->>'name' AS teacher FROM students s JOIN classes c ON c.id=s.class_id LEFT JOIN staff t ON t.id=(c.payload->>'classTeacherId')::uuid AND t.deleted_at IS NULL JOIN memberships m ON m.user_id=s.owner_id AND m.id=$2 AND m.active=true AND m.role='student' WHERE s.owner_id=$1 AND s.deleted_at IS NULL AND s.status='active' AND c.deleted_at IS NULL AND c.payload->>'studentLoginEnabled'='true'",[ctx.userId,ctx.membershipId])).rows[0];
   if(!row)throw new OperationError(403,'studentLoginDisabled');
   return{id:row.id,name:row.payload.name,admissionNumber:row.payload.admissionNumber,classId:row.class_id,className:[row.classroom.name,row.classroom.section].filter(Boolean).join(' '),classTeacher:row.teacher??null,username:row.payload.loginUsername};
  });
 }
 private async all(ctx:Actor,key:string){const data:any[]=[];for(let page=1;;page++){const r=await this.ops.list(ctx,key,{page,limit:100});data.push(...r.data);if(page*100>=r.total)return data;}}
 async overview(ctx:Actor){
  const profile=await this.profile(ctx);const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());
  const [timetable,homework,exams,marks,reportCards,calendar,onlineClasses]=await Promise.all(['timetable','homework','exams','marks','reportCards','calendar','onlineClasses'].map(key=>this.all(ctx,key)));
  const details=await this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
   const attendance=(await tx.query("SELECT id,payload FROM attendance_records WHERE student_id=$1 AND deleted_at IS NULL AND COALESCE((payload->>'period')::int,0)=0 AND payload->>'date'<=$2 ORDER BY payload->>'date' DESC LIMIT 366",[profile.id,date])).rows;
   const subjectIds=[...new Set([...timetable,...homework,...exams].map(r=>r.payload.subjectId).filter(Boolean))];
   const subjects=(await tx.query("SELECT id,payload->>'name' AS name FROM subjects WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL",[subjectIds])).rows;
   const staffIds=[...new Set(timetable.map(r=>r.staff_id).filter(Boolean))];
   const teachers=(await tx.query("SELECT id,payload->>'name' AS name FROM staff WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL",[staffIds])).rows;
   const notifications=(await tx.query("SELECT id,status,payload,version FROM notification_events WHERE owner_id=$1 AND deleted_at IS NULL AND audience->>'kind' IN ('students','both','people') ORDER BY created_at DESC LIMIT 50",[ctx.userId])).rows;
   const resources=(await tx.query("SELECT id,payload->>'recordId' AS homework_id,payload->>'filename' AS filename,payload->>'mime' AS mime,(payload->>'size')::int AS size FROM parent_files WHERE payload->>'module'='homework' AND payload->>'recordId'=ANY($1::text[]) AND status='ready' AND deleted_at IS NULL ORDER BY created_at DESC",[homework.map(h=>h.id)])).rows;
   await this.ops.audit(tx,ctx,'sensitive.read','studentOverview',profile.id);return{attendance,subjects,teachers,notifications,resources};
  });
  return{profile,date,timetable,homework,exams,marks,reportCards,calendar,onlineClasses,...details};
 }
 async feed(ctx:Actor,input:unknown){
  await this.profile(ctx);const body=z.object({scope:z.enum(['global','mine']).default('global'),page:z.coerce.number().int().min(1).default(1),sort:z.enum(['newest','oldest']).default('newest')}).parse(input);
  const rows=(await this.all(ctx,'feed')).filter(row=>{const targeted=!!(row.audience?.classIds?.length||row.audience?.userIds?.length||row.audience?.studentIds?.length||row.student_id);return body.scope==='mine'?targeted:!targeted;}).sort((a,b)=>(body.sort==='newest'?-1:1)*(new Date(a.created_at).getTime()-new Date(b.created_at).getTime())||a.id.localeCompare(b.id));
  return{data:rows.slice((body.page-1)*20,body.page*20),total:rows.length,page:body.page,limit:20};
 }
 async readNotification(ctx:Actor,input:unknown){
  await this.profile(ctx);const {id}=z.object({id:z.uuid()}).strict().parse(input);return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
   const result=await tx.query("UPDATE notification_events SET status='read',version=version+1,updated_at=now() WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL AND audience->>'kind' IN ('students','both','people') RETURNING id",[id,ctx.userId]);
   if(!result.rows.length)throw new OperationError(404,'notFound');return{ok:true};
  });
 }
}
