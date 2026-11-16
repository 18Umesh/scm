'use client';
import {useCallback,useEffect,useState} from 'react';
type Client=(path:string,method?:string,body?:unknown)=>Promise<any>;
export default function TeacherStudentRequests({api}:{api:Client}){
 const [requests,setRequests]=useState<any[]>([]),[students,setStudents]=useState<any[]>([]),[reason,setReason]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{const [leaves,pupils]=await Promise.all([api('/operations/records/studentLeave?limit=100'),api('/operations/lookups/students')]);setRequests(leaves.data);setStudents(pupils.data);},[api]);
 useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);
 async function decide(row:any,action:'approve'|'reject'){
  setBusy(true);setError('');setNotice('');try{await api(`/operations/records/studentLeave/${row.id}/actions`,'POST',{action,version:row.version,...(reason?{reason}:{})});await load();setNotice(action==='approve'?'Leave approved.':'Leave rejected.');}catch(error){setError(error instanceof Error?error.message:'Please try again.');}finally{setBusy(false);}
 }
 return <div>{error&&<p className="teacher-error" role="alert">{error}</p>}{notice&&<p className="teacher-success" role="status">{notice}</p>}<label>Decision note<input aria-label="Decision note" maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>{requests.map(row=><article className="teacher-agenda-row" key={row.id}><div><strong>{students.find(s=>s.id===row.student_id)?.label??'Assigned learner'}</strong><p>{row.payload.startDate} to {row.payload.endDate} · {row.status}</p><p>{row.payload.reason}</p></div>{row.status==='pending'&&<><button className="teacher-secondary" disabled={busy} onClick={()=>void decide(row,'approve')}>Approve</button><button className="teacher-secondary" disabled={busy||reason.trim().length<3} onClick={()=>void decide(row,'reject')}>Reject</button></>}</article>)}{!requests.length&&<p className="teacher-empty">No student leave requests assigned to you.</p>}</div>;
}
