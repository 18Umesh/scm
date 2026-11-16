import {z} from 'zod';
import type {Database} from '../db';
import {Operations,OperationError,type Actor} from './service';
export class InchargeWorkflows{
 constructor(private db:Database,private ops:Operations){}
 async overview(ctx:Actor,input:unknown){
  if(ctx.role!=='incharge')throw new OperationError(403,'forbidden');
  const {date}=z.object({date:z.iso.date().default(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date()))}).parse(input);
  const all=async(key:string,query:Record<string,unknown>={})=>{const data:any[]=[];for(let page=1;;page++){const result=await this.ops.list(ctx,key,{...query,page,limit:100});data.push(...result.data);if(page*100>=result.total)return data;}};
  const [classes,staff,students,periods,syllabus,exams,marks,attendance,leave,cover,homework]=await Promise.all(['classes','staff','students','timetable','syllabus','exams','marks','attendance','leave','cover','homework'].map(key=>all(key,key==='attendance'?{date}:{})));
  const subjects=(await this.ops.lookup(ctx,'subjects')).data;
  await this.db.tenant(ctx.schoolId,ctx.userId,tx=>this.ops.audit(tx,ctx,'sensitive.read','inchargeWorkspace'));
  return{date,classes,staff,students,periods:periods.filter(p=>p.published),syllabus,exams,marks,attendance:attendance.filter(r=>r.payload.date===date&&Number(r.payload.period??0)===0),leave,cover,homework,subjects};
 }
}
