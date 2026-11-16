// School dates, rather than the device clock, control when a scheduled exam opens.
export const examTypes=['unitTest','quarterly','halfYearly','final','other'] as const;
export const examTypeNames:Record<string,string>={unitTest:'Unit test',quarterly:'Quarterly',halfYearly:'Half yearly',final:'Final exam',other:'Assessment'};
export const examSchoolDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const marksOpen=(exam:{published:boolean;payload:Record<string,any>},today=examSchoolDay())=>exam.published&&exam.payload.date<today;
export function examStatistics(exam:any,marks:any[],total:number){
 const scores=marks.filter(r=>r.payload.examId===exam.id);
 const average=scores.length?scores.reduce((n,r)=>n+Number(r.payload.score),0)/scores.length:null;
 const passed=scores.filter(r=>r.payload.score>=exam.payload.passMarks).length;
 return{examId:exam.id,entered:scores.length,total,missing:Math.max(0,total-scores.length),average:average===null?null:Math.round(average*100)/100,averagePercentage:average===null?null:Math.round(average/exam.payload.maxMarks*1000)/10,passCount:passed,passPercentage:scores.length?Math.round(passed/scores.length*1000)/10:null,highest:scores.length?Math.max(...scores.map(r=>r.payload.score)):null};
}
export function classExamSummary(exams:any[],marks:any[],students:any[]){
 const maxMarks=exams.reduce((sum,e)=>sum+Number(e.payload.maxMarks),0);
 const results=students.map(student=>{
  const papers=exams.map(exam=>({exam,mark:marks.find(m=>m.payload.examId===exam.id&&m.payload.studentId===student.id)}));
  const entered=papers.filter(p=>p.mark).length,complete=exams.length>0&&entered===exams.length;
  const score=papers.reduce((sum,p)=>sum+Number(p.mark?.payload.score??0),0);
  return{studentId:student.id,entered,required:exams.length,complete,score,maxMarks,percentage:complete?score/maxMarks*100:null,passed:complete?papers.every(p=>p.mark.payload.score>=p.exam.payload.passMarks):null};
 });
 const complete=results.filter(r=>r.complete),passed=complete.filter(r=>r.passed).length;
 const average=complete.length?complete.reduce((sum,r)=>sum+r.score,0)/complete.length:null;
 return{results,total:students.length,entered:complete.length,missing:students.length-complete.length,passCount:passed,passPercentage:complete.length?passed/complete.length*100:null,average:average===null?null:Math.round(average*100)/100,averagePercentage:average===null?null:average/maxMarks*100,maxMarks,subjects:exams.length};
}
