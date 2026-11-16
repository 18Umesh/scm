'use client';
import {useEffect,useState} from 'react';
import {FileText,X} from 'lucide-react';
export default function PostFilePreview({file,remove,disabled}:{file:File;remove:()=>void;disabled:boolean}){
 const [url,setUrl]=useState('');
 useEffect(()=>{if(!file.type.startsWith('image/'))return;const value=URL.createObjectURL(file);setUrl(value);return()=>URL.revokeObjectURL(value);},[file]);
 return <div className={'post-file-preview '+(url?'photo':'')}>
  {url?<img src={url} alt={file.name}/>:<FileText size={24}/>}<span><strong>{file.name}</strong><small>{Math.max(1,Math.round(file.size/1024))} KB</small></span><button type="button" disabled={disabled} aria-label={'Remove '+file.name} onClick={remove}><X size={16}/></button>
 </div>;
}
