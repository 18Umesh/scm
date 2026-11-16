import{z}from 'zod';
import{Operations,OperationError,type Actor,type RecordRow}from './service';
import{Finance}from './finance';
import{access}from './registry';
import{pagination}from '../validation';
export class Reports{
 constructor(private ops:Operations,private finance:Finance){}
 private async all(ctx:Actor,key:string,query:Record<string,unknown>={}){const rows:RecordRow[]=[];let page=1;for(;;){const result=await this.ops.list(ctx,key,{...query,page,limit:100});rows.push(...result.data);if(page*100>=result.total)break;page++;}return{data:rows};}
 async get(ctx:Actor,key:string,query:unknown){const filter=z.object({from:z.iso.date().optional(),to:z.iso.date().optional(),classId:z.uuid().optional()}).parse(query);if(filter.from&&filter.to&&filter.from>filter.to)throw new OperationError(400,'invalidDateRange');const pages=pagination.parse(query);
  const within=(date:string)=>!!date&&(!filter.from||date>=filter.from)&&(!filter.to||date<=filter.to);
  if(key==='studentPerformance'){
   if(access(ctx.role,'studentReports')==='none')throw new OperationError(403,'forbidden');
   const students=await this.ops.list(ctx,'students',{...pages,classId:filter.classId});
   const marks=await this.all(ctx,'marks',{classId:filter.classId});const attendance=ctx.role==='student'?{data:[]}:await this.all(ctx,'attendance',{classId:filter.classId}).catch(()=>({data:[]}));
   return{...pages,total:students.total,data:students.data.map(student=>{const exams=marks.data.filter(r=>r.student_id===student.id&&r.published&&within(new Date(r.created_at).toISOString().slice(0,10)));const days=attendance.data.filter(r=>r.student_id===student.id&&within(r.payload.date));return{id:student.id,name:student.payload.name,classId:student.class_id,publishedAssessments:exams.length,totalMarks:exams.reduce((sum,r)=>sum+r.payload.score,0),attendanceRecorded:days.length,present:days.filter(r=>['present','late'].includes(r.payload.attendance)).length,absent:days.filter(r=>r.payload.attendance==='absent').length,marks:exams.map(r=>({examId:r.payload.examId,subjectId:r.payload.subjectId,score:r.payload.score,remarks:r.payload.remarks}))};}),sources:['published marks','attendance records'],ranking:false};
  }
  if(key==='teacherPerformance'){
   if(access(ctx.role,'teacherReports')==='none')throw new OperationError(403,'forbidden');const staff=await this.ops.list(ctx,'staff',pages);const leave=await this.all(ctx,'leave');const cover=await this.all(ctx,'cover');const syllabus=await this.all(ctx,'syllabus').catch(()=>({data:[]}));
   return{...pages,total:staff.total,data:staff.data.map(person=>({id:person.id,name:person.payload.name,approvedLeaveHalfDays:leave.data.filter(r=>r.staff_id===person.id&&r.status==='approved'&&within(r.payload.startDate)).reduce((sum,r)=>sum+r.payload.dayUnits,0),syllabusAssigned:syllabus.data.filter(r=>r.staff_id===person.id&&within(r.payload.dueDate)).length,syllabusCompleted:syllabus.data.filter(r=>r.staff_id===person.id&&r.status==='completed'&&within(r.payload.dueDate)).length,syllabusCompletedOnTime:syllabus.data.filter(r=>r.staff_id===person.id&&r.status==='completed'&&r.payload.completedOn<=r.payload.dueDate&&within(r.payload.dueDate)).length,syllabusOverdue:syllabus.data.filter(r=>r.staff_id===person.id&&r.status!=='completed'&&r.payload.dueDate<new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})&&within(r.payload.dueDate)).length,coverClasses:cover.data.filter(r=>r.staff_id===person.id&&within(r.payload.date)).length})),sources:['approved leave','assigned cover','HOD-assigned syllabus and dated completion'],performanceNote:'Syllabus figures are evidence for review; no automatic teacher ranking.',ranking:false};
  }
  if(key==='leaveReport'){
   if(access(ctx.role,'leaveReports')==='none')throw new OperationError(403,'forbidden');const leave=await this.all(ctx,'leave');const filtered=leave.data.filter(r=>within(r.payload.startDate));return{...pages,total:filtered.length,data:filtered.slice((pages.page-1)*pages.limit,pages.page*pages.limit).map(r=>({id:r.id,staffId:r.staff_id,leaveType:r.payload.leaveType,startDate:r.payload.startDate,endDate:r.payload.endDate,halfDays:r.payload.dayUnits,status:r.status})),sources:['leave register'],medicalReasonsIncluded:false};
  }
  if(key==='financialStatements')return this.finance.statements(ctx,filter);
  if(key==='totalFinance'){
   if(filter.from||filter.to)throw new OperationError(400,'reportDateRangeUnsupported');
   if(!['management','principal','accounts'].includes(ctx.role))throw new OperationError(403,'forbidden');const summary=await this.finance.overview(ctx);const trial=await this.finance.trialBalance(ctx,pages);return{...trial,summary,sources:['issued invoices','approved concessions','immutable receipts','posted journal lines']};
  }
  throw new OperationError(404,'notFound');
 }
}
