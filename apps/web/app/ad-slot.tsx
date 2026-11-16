"use client";
import{useEffect,useState,useRef}from'react';
import * as Dialog from '@radix-ui/react-dialog';
import{ArrowUpRight,BookOpen,Palette,Leaf,RefreshCw,X}from'lucide-react';
import{slotAllowed,type AdRole,type AdRoute}from'../../../packages/ads';
import type{Language}from'../../../packages/i18n';
import './ad-slot.css';
type Props={role:string;lang:Language;feedCards:number;classroom?:boolean;route?:AdRoute;variant?:'card'|'native';exampleIndex?:number;api:(path:string,method?:string,body?:unknown)=>Promise<any>};
export default function AdSlot({role,lang,feedCards,classroom=false,route='home',variant='native',exampleIndex,api}:Props){
 const[ad,setAd]=useState<any>(null),[examples,setExamples]=useState<any[]>([]),[hidden,setHidden]=useState(false),[preview,setPreview]=useState(false),[reported,setReported]=useState(false);
 const counted=useRef(new Set<string>()),container=useRef<HTMLElement|null>(null),video=useRef<HTMLVideoElement|null>(null);
 const slot=route==='feed'?'school_feed_native':route==='classes'?'teacher_classes_card':role==='parent'?'parent_home_feed':role==='teacher'?'teacher_home_card':'management_home_card';
 const allowed=slotAllowed(role as AdRole,route,slot,classroom);
 useEffect(()=>{
  if(!allowed)return;let active=true;
  api('/operations/ads/slot','POST',{slotId:slot,route,language:lang,appVersion:'0.2.0'}).then(result=>{
   const candidate=exampleIndex!==undefined&&result.examples?.length?result.examples[exampleIndex%result.examples.length]:result.ad;if(!active||!candidate)return;
   const count=Number(sessionStorage.getItem('campus-ad-count')??0);
   if(!candidate.demo&&((route==='home'&&role==='parent'&&feedCards<5)||(route==='feed'&&feedCards<3)||count>=6))return;
   setAd(candidate);setExamples(result.examples??[]);
   if(!candidate.demo)sessionStorage.setItem('campus-ad-count',String(count+1));

  }).catch(()=>{});return()=>{active=false;};
 },[api,role,lang,feedCards,classroom,slot,allowed,route,exampleIndex]);
 useEffect(()=>{
  if(!ad||hidden||!allowed||!container.current)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const observer=new IntersectionObserver(entries=>{
   const visible=entries[0]?.intersectionRatio>=.5;
   if(!visible){if(timer)clearTimeout(timer);timer=undefined;video.current?.pause();return;}
   if(!counted.current.has(ad.id+':impression')&&!timer)timer=setTimeout(()=>{if(document.visibilityState==='visible'){counted.current.add(ad.id+':impression');void api('/operations/ads/metric','POST',{campaignId:ad.id,slotId:slot,event:'impression'}).catch(()=>{});}},ad.media?.type==='video'?2000:1000);
  },{threshold:[0,.5]});observer.observe(container.current);
  const pause=()=>{if(document.visibilityState!=='visible'){video.current?.pause();if(timer)clearTimeout(timer);timer=undefined;}};document.addEventListener('visibilitychange',pause);
  return()=>{observer.disconnect();if(timer)clearTimeout(timer);document.removeEventListener('visibilitychange',pause);};
 },[ad,hidden,allowed,api,slot]);
 if(!allowed||!ad||hidden)return null;
 const labels={en:'Sponsored',te:'\u0c2a\u0c4d\u0c30\u0c3e\u0c2f\u0c4b\u0c1c\u0c3f\u0c24\u0c02',hi:'\u092a\u094d\u0930\u093e\u092f\u094b\u091c\u093f\u0924'},Icon=ad.theme==='craft'?Palette:ad.theme==='nature'?Leaf:BookOpen;
 const metric=(event:string)=>api('/operations/ads/metric','POST',{campaignId:ad.id,slotId:slot,event}).catch(()=>{});
 return <><aside ref={container} className={'school-ad '+(ad.theme??'books')+(variant==='native'?' school-ad-native':'')} aria-label={ad.demo?'Sponsored demo advertisement':labels[lang]}>
  <div className="school-ad-top"><span>{variant==='native'?<span className="school-ad-advertiser"><span className="school-ad-avatar" aria-hidden="true">{ad.advertiser.slice(0,1)}</span><span className="school-ad-identity"><strong>{ad.advertiser}</strong><small>{labels[lang]}{ad.demo?' \u00b7 Demo':''}</small></span></span>:<>{labels[lang]}{ad.demo&&<span className="school-ad-demo">Demo advertisement</span>}</>}</span><button className="school-ad-close" aria-label="Hide advertisement" onClick={()=>setHidden(true)}><X size={16}/></button></div>
  {variant==='native'&&<p className="school-ad-caption">{ad.body}</p>}
  {ad.media&&<div className={'school-ad-media '+ad.media.type}>{ad.media.type==='video'?<video ref={video} key={ad.id} src={ad.media.src} poster={ad.media.poster} controls muted playsInline preload="none" aria-label={ad.media.alt??ad.headline} onPlay={()=>{const key=ad.id+':video_start';if(!counted.current.has(key)){counted.current.add(key);void metric('video_start');}}} onEnded={()=>{const key=ad.id+':video_complete';if(!counted.current.has(key)){counted.current.add(key);void metric('video_complete');}}}>{ad.media.captions&&<track kind="captions" src={ad.media.captions} srcLang="en" label="English"/>}</video>:<img src={ad.media.src} alt={ad.media.alt??ad.headline} loading="lazy" decoding="async"/>}</div>}
  <div className="school-ad-layout">{!ad.media&&<div className="school-ad-art" aria-hidden="true"><div className="school-ad-orbit"/><Icon size={56} strokeWidth={1.4}/><span className="school-ad-spark">{'\u2726'}</span><span className="school-ad-dot"/></div>}<div className="school-ad-copy"><span className="school-ad-brand">{ad.advertiser}</span><h3>{ad.headline}</h3>{variant!=='native'&&<p>{ad.body}</p>}{ad.demo?<button className="school-ad-cta" onClick={()=>{void metric('click');setPreview(true);}}>{variant==='native'?'Learn more':ad.cta??'View offer'}<ArrowUpRight size={16}/></button>:<a className="school-ad-cta" href={ad.landingUrl} target="_blank" rel="sponsored noopener noreferrer" onClick={()=>void metric('click')}>{variant==='native'?'Learn more':ad.cta??'Learn more'}<ArrowUpRight size={16}/></a>}</div></div>
  <div className="school-ad-footer"><span>{ad.demo?'Fictional advertiser - Local preview':'Advertisement'}</span><div>{ad.demo&&examples.length>1&&<button onClick={()=>{const index=examples.findIndex(a=>a.id===ad.id);setAd(examples[(index+1)%examples.length]);setReported(false);}}><RefreshCw size={13}/>Next example</button>}<button disabled={reported} onClick={()=>{void metric('report');setReported(true);}}>{reported?(ad.demo?'Demo report recorded':'Reported'):'Report ad'}</button></div></div>
 </aside><Dialog.Root open={preview} onOpenChange={setPreview}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content school-ad-preview"><Dialog.Title>Demo advertisement</Dialog.Title><Dialog.Description>This fictional offer shows how an advertisement opens. No purchase or advertiser visit takes place in this preview.</Dialog.Description><strong>{ad.advertiser}</strong><h3>{ad.headline}</h3><p>{ad.body}</p><Dialog.Close className="secondary">Return to school</Dialog.Close><Dialog.Close className="school-ad-close" aria-label="Close ad preview"><X size={20}/></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root></>;
}
