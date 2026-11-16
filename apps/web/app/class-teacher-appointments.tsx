'use client';
import{useCallback,useEffect,useState}from'react';
type Classroom={id:string;version:number;name:string;classTeacherId:string|null;classTeacherName:string|null;candidates:{id:string;name:string}[]};
export default function ClassTeacherAppointments({api}:{api:(path:string,method?:string,body?:unknown)=>Promise<any>}){
 const[classes,setClasses]=useState<Classroom[]>([]),[selected,setSelected]=useState(''),[staffId,setStaffId]=useState(''),[reason,setReason]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{const response=await api('/operations/classTeachers');setClasses(response.data);return response.data as Classroom[];},[api]);
 useEffect(()=>{void load().catch(()=>setError('Could not load class teacher appointments.')).finally(()=>setLoading(false));},[load]);
 const classroom=classes.find(c=>c.id===selected);
 async function save(){
  if(!classroom)return;setBusy(true);setError('');setNotice('');try{
   await api('/operations/classTeachers','POST',{classId:classroom.id,staffId:staffId||null,version:classroom.version,reason});await load();setReason('');setNotice('Class teacher appointment saved. Access follows the new appointment when the teacher refreshes the class.');
  }catch(e){setError(e instanceof Error&&e.message==='versionConflict'?'This appointment changed in another session. Reload before saving.':'Could not save this appointment. Check the class and teacher, then try again.');}finally{setBusy(false);}
 }
 return <section className="panel operation-panel"><h2>Class teacher appointments</h2><p>Appoint one class teacher to view all subject results, overall class pass percentage and class attendance. Mark entry stays limited to the subjects that teacher teaches. Only teachers assigned to the selected class can be appointed.</p>{loading&&<p role="status">Loading appointments…</p>}{error&&<p className="error-banner" role="alert">{error}</p>}{notice&&<p className="success-banner" role="status">{notice}</p>}
 <div className="form-grid"><label>Class<select aria-label="Appointment class" value={selected} onChange={e=>{setSelected(e.target.value);setStaffId(classes.find(c=>c.id===e.target.value)?.classTeacherId??'');setReason('');setNotice('');}}><option value="">Choose a class</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{classroom&&<label>Class teacher<select aria-label="Appointed class teacher" value={staffId} onChange={e=>setStaffId(e.target.value)}><option value="">No class teacher appointed</option>{classroom.candidates.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}</div>
 {classroom&&<><p>Current appointment: <strong>{classroom.classTeacherName??'None'}</strong></p><label>Reason for appointment or change<textarea aria-label="Appointment reason" maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} rows={2}/></label><button className="primary" disabled={busy||reason.trim().length<3||staffId===(classroom.classTeacherId??'')} onClick={()=>void save()}>{busy?'Saving…':'Save appointment'}</button></>}
 </section>;
}
