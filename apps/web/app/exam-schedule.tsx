'use client';
import{useState}from'react';
import{ChevronDown,ChevronRight,GraduationCap,LockKeyhole}from'lucide-react';
import{marksOpen}from'../../../packages/operations/exam-progress';
type Exam={id:string;published:boolean;payload:Record<string,any>};
export default function ExamSchedule({exams,schoolDate,stats,total,subject,onSelect}:{exams:Exam[];schoolDate:string;stats:any[];total:number;subject:(id:string)=>string;onSelect:(id:string)=>void}){
 const[expanded,setExpanded]=useState('');
 const groups=new Map<string,Exam[]>();
 for(const exam of exams){
  // Subject papers on the same exam day share a card; each keeps its own marks.
  const key=JSON.stringify([exam.payload.name.trim().toLowerCase(),exam.payload.examType??'other',exam.payload.date]);
  groups.set(key,[...(groups.get(key)??[]),exam]);
 }
 return <div className="exam-schedule">{[...groups.entries()].map(([key,papers])=>{
  const exam=papers[0],ready=marksOpen(exam,schoolDate),isExpanded=expanded===key;
  return <article key={key} className="exam-schedule-group"><button className="exam-schedule-card" aria-expanded={papers.length>1?isExpanded:undefined} onClick={()=>papers.length===1?onSelect(exam.id):setExpanded(isExpanded?'':key)}>
   <span className="exam-date-tile"><strong>{exam.payload.date.slice(8)}</strong><small>{new Date(exam.payload.date+'T12:00:00').toLocaleDateString('en-IN',{month:'short'})}</small></span>
   <span className="exam-card-main"><strong>{exam.payload.name}</strong><small>{papers.length===1?`${subject(exam.payload.subjectId)} · ${exam.payload.startTime}–${exam.payload.endTime}`:`${papers.length} subjects · ${papers.map(p=>subject(p.payload.subjectId)).join(', ')}`}</small><span className={'exam-state '+(ready?' ready':'')}>{ready?<GraduationCap size={14}/>:<LockKeyhole size={14}/>} {ready?(papers.length===1?`${stats.find(s=>s.examId===exam.id)?.entered??0}/${total} marks entered`:'Open subject to enter marks'):'Upcoming · marks locked'}</span></span>
   {papers.length>1?<ChevronDown size={18} className={isExpanded?'exam-group-expanded':''}/>:<ChevronRight size={18}/>}
  </button>{papers.length>1&&isExpanded&&<div className="exam-subject-papers" role="group" aria-label={exam.payload.name+' subject papers'}>{papers.map(paper=><button key={paper.id} onClick={()=>onSelect(paper.id)}><span><strong>{subject(paper.payload.subjectId)}</strong><small>{paper.payload.startTime}–{paper.payload.endTime} · {stats.find(s=>s.examId===paper.id)?.entered??0}/{total} marks entered</small></span><ChevronRight size={17}/></button>)}</div>}</article>;
 })}</div>;
}
