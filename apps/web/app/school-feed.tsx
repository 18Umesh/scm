'use client';
import {useCallback,useEffect,useState,Fragment} from 'react';
import {Check,GraduationCap,MessageSquare,Plus,RefreshCw} from 'lucide-react';
import type {Language} from '../../../packages/i18n';
import PostAttachments from './post-attachments';
import AdSlot from './ad-slot';
import './school-feed.css';
type Props={role:string;api:(path:string,method?:string,body?:unknown)=>Promise<any>;schoolName:string;userId:string;displayName:string;lang:Language;records?:any[];onRefresh?:()=>Promise<void>;onPost?:()=>void;onOpen?:(row:any)=>void;manage?:()=>void;hideHeading?:boolean;hideHeader?:boolean};
export default function SchoolFeed({role,api,schoolName,userId,displayName,lang,records,onRefresh,onPost,onOpen,manage,hideHeading,hideHeader}:Props){
 const [rows,setRows]=useState<any[]>([]),[page,setPage]=useState(1),[total,setTotal]=useState(0),[loading,setLoading]=useState(records===undefined),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=useCallback(async(next=1)=>{const result=await api(`/operations/records/feed?status=published&limit=20&page=${next}`);setRows(old=>next===1?result.data:[...old,...result.data]);setPage(next);setTotal(result.total);},[api]);
 useEffect(()=>{if(records!==undefined)return;let active=true;setLoading(true);void api('/operations/records/feed?status=published&limit=20&page=1').then(result=>{if(active){setRows(result.data);setPage(1);setTotal(result.total);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[api,records]);
 async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action();}catch{setError('School updates could not load. Please try again.');}finally{setBusy(false);}}
 const refresh=async()=>{if(onRefresh)await onRefresh();else await load();};
 const posts=(records??rows).filter(row=>row.published);
 return <section className="school-feed-page" aria-label="School Feed">
  {!hideHeader&&<div className="school-feed-heading">{!hideHeading&&<h2>School Feed</h2>}<div>{onPost&&<button className="school-feed-post" onClick={onPost}><Plus size={17}/>Post update</button>}{manage&&<button className="school-feed-action" onClick={manage}>Manage updates</button>}<button className="school-feed-refresh" aria-label="Refresh School Feed" disabled={busy||loading} onClick={()=>void run(refresh)}><RefreshCw size={18}/></button></div></div>}
  {error&&<p className="school-feed-error" role="alert">{error}</p>}
  {loading?<p className="school-feed-empty" role="status">Loading school updates…</p>:<>
   {posts.map((row,index)=><Fragment key={row.id}><article className="school-feed-card" key={row.id}><div className="school-feed-author"><span className="school-feed-avatar"><GraduationCap size={23}/></span><div><strong>{row.owner_id===userId?displayName:schoolName}</strong><small>{row.created_at?new Date(row.created_at).toLocaleString(lang==='en'?'en-IN':lang,{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}):'School update'}{row.audience?.kind==='people'?' · Individual update':row.audience?.kind==='staff'?' · Staff update':''}</small></div></div>{row.payload.title&&<h3>{row.payload.title}</h3>}{row.payload.body&&<p className="school-feed-body">{row.payload.body}</p>}<PostAttachments api={api} record={row}/>{onOpen&&<button className="school-feed-detail" onClick={()=>onOpen(row)}>{row.payload.postType==='poll'?'View poll':'View update'}</button>}{row.payload.requiredAcknowledgement&&!row.payload.acknowledged&&<button className="school-feed-action" disabled={busy} onClick={()=>void run(async()=>{await api(`/operations/records/feed/${row.id}/actions`,'POST',{action:'acknowledge',version:row.version});await refresh();})}><Check size={16}/>Acknowledge</button>}{row.payload.acknowledged&&<small className="school-feed-ack"><Check size={14}/>Acknowledged</small>}</article>{((index===posts.length-1&&posts.length<3)||(index>=2&&(index-2)%6===0&&index<=14))&&<AdSlot api={api} role={role} lang={lang} feedCards={index+1} route="feed" variant="native" exampleIndex={Math.max(0,Math.floor((index-2)/6))}/>}</Fragment>)}
   {!posts.length&&<div className="school-feed-empty"><MessageSquare size={32}/><h3>No school updates yet</h3><p>Updates shared with you will appear here.</p></div>}
   {records===undefined&&rows.length<total&&<button className="school-feed-action school-feed-more" disabled={busy} onClick={()=>void run(()=>load(page+1))}>Load more updates</button>}
  </>}
 </section>;
}
