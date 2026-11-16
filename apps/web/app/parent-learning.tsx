'use client';
import {useEffect,useState} from 'react';
import ParentCalendar from './parent-calendar';
import './parent-learning.css';

type Props={api:(path:string,method?:string,body?:unknown)=>Promise<any>;studentId:string;revision:number;view:string;events:any[];holidays:any[];subject:(id:string)=>string;open:(key:string,row:any)=>void};
export default function ParentLearning({api,studentId,revision,events,holidays,subject,open}:Props){
 const[data,setData]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;setData(null);setError('');void api('/operations/parent/learning?studentId='+studentId).then(value=>{if(active)setData(value);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[api,studentId,revision]);
 if(error)return <p role="alert" className="error-banner">{error}</p>;
 if(!data)return <p role="status">Loading your child's school calendar...</p>;
 return <ParentCalendar attendance={data.attendance} events={events} holidays={holidays} exams={data.exams} subject={subject} open={open}/>;
}
