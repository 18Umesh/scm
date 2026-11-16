'use client';
import{Check,X}from'lucide-react';
import'./attendance-buttons.css';
export default function AttendanceButtons({name,value,onChange,disabled=false,presentLabel='Present',absentLabel='Absent'}:{name:string;value:string;onChange:(value:'present'|'absent')=>void;disabled?:boolean;presentLabel?:string;absentLabel?:string}){
 return <div className="attendance-buttons" role="group" aria-label={'Attendance for '+name}><button type="button" className="attendance-present" aria-label={'Present for '+name} aria-pressed={value==='present'} disabled={disabled} onClick={()=>onChange('present')}><Check size={19} aria-hidden="true"/><span>{presentLabel}</span></button><button type="button" className="attendance-absent" aria-label={'Absent for '+name} aria-pressed={value==='absent'} disabled={disabled} onClick={()=>onChange('absent')}><X size={19} aria-hidden="true"/><span>{absentLabel}</span></button></div>;
}
