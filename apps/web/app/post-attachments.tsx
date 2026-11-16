'use client';
import {useEffect,useState,type MouseEvent} from 'react';
import {Download,ExternalLink,FileText,Link2} from 'lucide-react';
import './post-attachments.css';
type FileRow={id:string;filename:string;mime:string;size:number};
export default function PostAttachments({api,record}:{api:(path:string,method?:string,body?:unknown)=>Promise<any>;record:{id:string;payload:Record<string,any>}}){
 const [files,setFiles]=useState<FileRow[]>([]),[error,setError]=useState(false);
 const [pending,setPending]=useState(''),[downloadError,setDownloadError]=useState('');
 async function download(event:MouseEvent<HTMLAnchorElement>,file:FileRow){
  event.preventDefault();if(pending===file.id)return;setPending(file.id);setDownloadError('');
  try{const path='/api/operations/files/'+file.id+'?download=1';let response=await fetch(path,{credentials:'same-origin',cache:'no-store'});if(response.status===401){await api('/auth/me');response=await fetch(path,{credentials:'same-origin',cache:'no-store'});}if(!response.ok)throw new Error('This file could not be downloaded. Reopen the post and try again.');const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download=file.filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){setDownloadError(error instanceof Error?error.message:'Download failed.');}finally{setPending('');}
 }
 useEffect(()=>{let active=true;setFiles([]);setError(false);if(record.payload.attachmentCount)void api('/operations/files?module=feed&recordId='+record.id).then(value=>{if(active)setFiles(value.data);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[api,record.id,record.payload.attachmentCount]);
 const links=(record.payload.links??[]).filter((link:any)=>{try{return new URL(link.url).protocol==='https:';}catch{return false;}});
 if(!record.payload.attachmentCount&&!links.length)return null;
 return <div className="post-published-attachments" aria-label="Post attachments">{error&&<p role="status">Attachments could not load. Reopen this post to try again.</p>}{downloadError&&<p role="alert">{downloadError}</p>}{files.map(file=><a className={'post-download '+(file.mime.startsWith('image/')?'post-download-photo':'')} href={'/api/operations/files/'+file.id+'?download=1'} download={file.filename} onClick={event=>void download(event,file)} aria-busy={pending===file.id} key={file.id} aria-label={'Download '+file.filename}>{file.mime.startsWith('image/')?<img src={'/api/operations/files/'+file.id} alt={file.filename} loading="lazy"/>:<FileText size={25}/>}<span><strong>{file.filename}</strong><small>{pending===file.id?'Downloading…':file.size>=1048576?(file.size/1048576).toFixed(1)+' MB':Math.max(1,Math.round(file.size/1024))+' KB'}</small></span><Download size={18}/></a>)}{links.map((link:any,index:number)=><a className="post-download" key={index} href={link.url} target="_blank" rel="noopener noreferrer"><Link2 size={23}/><span><strong>{link.name}</strong><small>Open in {new URL(link.url).hostname}</small></span><ExternalLink size={17}/></a>)}</div>;
}
