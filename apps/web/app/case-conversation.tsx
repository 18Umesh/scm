'use client';
import{useEffect,useState}from'react';
import{Send}from'lucide-react';
import{translate,type Language}from'../../../packages/i18n';
export default function CaseConversation({api,module,recordId,lang}:{api:(path:string,method?:string,body?:unknown)=>Promise<any>;module:string;recordId:string;lang:Language}){
 const[updates,setUpdates]=useState<any[]>([]),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);const t=(key:string)=>translate(lang,key);const path=`/operations/parent/cases/${module}/${recordId}`;
 useEffect(()=>{void api(path).then(r=>setUpdates(r.data)).catch(e=>setError(e.message));},[api,path]);
 return <section className="family-conversation"><h3>{t('caseConversation')}</h3>{updates.map(update=><article key={update.id}><small>{t(update.payload.authorRole)}</small><p>{update.payload.message}</p></article>)}<form onSubmit={e=>{e.preventDefault();setBusy(true);setError('');void api(path,'POST',{message}).then(()=>{setMessage('');return api(path);}).then(r=>setUpdates(r.data)).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}><label>{t('replyToCase')}<textarea required rows={3} value={message} onChange={e=>setMessage(e.target.value)}/></label>{error&&<p className="error-banner" role="alert">{t(error)}</p>}<button className="primary" disabled={busy}><Send size={16}/>{t('sendReply')}</button></form></section>;
}
