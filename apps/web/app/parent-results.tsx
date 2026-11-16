'use client';
import {useEffect,useState} from 'react';
import ParentReportCard from './parent-report-card';
type Props={api:(path:string)=>Promise<any>;studentId:string;revision:number;view:string;subject:(id:string)=>string;cards:any[];open:(row:any)=>void};
export default function ParentResults({api,studentId,revision,view,subject,cards,open}:Props){
 const[data,setData]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;setData(null);setError('');void api('/operations/parent/learning?studentId='+studentId).then(r=>{if(active)setData(r);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[api,studentId,revision]);
 if(error)return <p role="alert" className="error-banner">{error}</p>;if(!data)return <p role="status">Loading examinations…</p>;
 const rounds=[...new Map<string,any>(data.exams.map((e:any)=>[e.payload.name+'|'+e.payload.date,{key:e.payload.name+'|'+e.payload.date,name:e.payload.name,date:e.payload.date}])).values()].sort((a,b)=>a.date.localeCompare(b.date));
 return <div className="parent-results">{view==='reportCards'?<ParentReportCard data={data} subject={subject} cards={cards} open={open}/>:<><p className="parent-feed-caption">Your child’s school-published examination schedule.</p>{rounds.map(round=><section className="family-card parent-exam-card" key={round.key}><div className="parent-panel-head"><div><h3>{round.name}</h3><p>{new Date(round.date+'T12:00:00+05:30').toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</p></div><span className="family-status">{round.date<new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date())?'Completed':'Scheduled'}</span></div>{data.exams.filter((e:any)=>e.payload.name+'|'+e.payload.date===round.key).sort((a:any,b:any)=>(a.payload.startTime??'').localeCompare(b.payload.startTime??'')).map((e:any)=><div className="parent-subject-mark" key={e.id}><strong>{subject(e.payload.subjectId)}</strong><span>{e.payload.startTime} – {e.payload.endTime}</span></div>)}</section>)}{!rounds.length&&<p className="family-empty">No examination timetable published yet.</p>}</>}</div>;
}
