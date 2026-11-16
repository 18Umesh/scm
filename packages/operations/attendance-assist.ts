export const attendanceStates=['present','absent'] as const;
export type AttendanceState=typeof attendanceStates[number];
export type AttendanceLearner={id:string;name:string;admissionNumber:string};
export type AttendanceSuggestion={key:string;line:string;studentId:string;status:AttendanceState|'';issue:string;excluded:boolean};
const normalize=(v:string)=>v.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const contains=(text:string,term:string)=>(' '+text+' ').includes(' '+term+' ');
type RecognizedStatus=AttendanceState|'late'|'leave'|'halfDay'|'earlyExit';
const labels:[RecognizedStatus,string[]][]=[
 ['halfDay',['half day','halfday','hd','ఆఫ్ డే','आधा दिन']],['earlyExit',['early exit','left early']],
 ['absent',['not present','absent','a','గైర్హాజరు','अनुपस्थित']],
 ['present',['present','p','హాజరు','उपस्थित']],['late',['late','l','ఆలస్యం','देर']],
 ['leave',['on leave','leave','lv','సెలవు','छुट्टी']]
];
function statusOf(line:string){let rest=line;const found=new Set<RecognizedStatus>();for(const [status,words]of labels)for(const word of words){if(contains(rest,word)){found.add(status);rest=(' '+rest+' ').replaceAll(' '+word+' ',' ').trim();}}return found;}
export function parseAttendanceText(text:string,learners:AttendanceLearner[]):AttendanceSuggestion[]{
 const roster=learners.map(v=>({...v,full:normalize(v.name),admission:normalize(v.admissionNumber)}));
 const rows:AttendanceSuggestion[]=[];
 const lines=text.slice(0,30000).split(/\r?\n|;|,|\band\b/iu).map(v=>v.trim()).filter(Boolean).slice(0,500);
 for(let index=0;index<lines.length;index++){
  const line=lines[index],normalized=normalize(line);let matches=roster.filter(r=>contains(normalized,r.full)||!!r.admission&&contains(normalized,r.admission));
  if(!matches.length){
   let identity=' '+normalized+' ';
   for(const [,words]of labels)for(const word of words)identity=identity.replaceAll(' '+word+' ',' ');
   for(const word of ['please','mark','student','as','is','was'])identity=identity.replaceAll(' '+word+' ',' ');
   identity=identity.trim().replace(/\s+/g,' ');
   matches=roster.filter(r=>{const first=r.full.split(' ')[0];return first.length>=3&&identity===first;});
  }
  const statuses=statusOf(normalized);
  // Column headers carry no student identity and are not attendance rows.
  if(!matches.length&&/^(name|student|admission|attendance|status|date|class|roll|school)(\s|$)/i.test(normalized))continue;
  if(!matches.length&&!statuses.size)continue;
  const issue=/\bnot absent\b/.test(normalized)?'Please choose the status explicitly.':matches.length===0?'No matching student.':matches.length>1?'More than one student matches.':statuses.size===0?'Attendance status is missing.':statuses.size>1?'Conflicting attendance statuses.':statuses.size===1&&!attendanceStates.includes([...statuses][0] as AttendanceState)?'Choose Present or Absent for this entry.':'';
  rows.push({key:String(index),line,studentId:matches.length===1?matches[0].id:'',status:statuses.size===1&&!issue?[...statuses][0] as AttendanceState:'',issue,excluded:false});
 }
 const seen=new Set<string>();for(const row of rows){if(row.studentId&&seen.has(row.studentId))row.issue='Repeated student: keep one entry and exclude the others.';seen.add(row.studentId);}
 return rows;
}
export function attendanceSuggestionErrors(rows:AttendanceSuggestion[],learners:AttendanceLearner[]){
 const valid=new Set(learners.map(r=>r.id)),seen=new Set<string>(),errors:string[]=[];
 for(const row of rows.filter(r=>!r.excluded)){
  if(!valid.has(row.studentId))errors.push('Choose a student for every included entry.');
  if(!attendanceStates.includes(row.status as AttendanceState))errors.push('Choose an attendance status for every included entry.');
  if(seen.has(row.studentId))errors.push('A student appears more than once. Exclude duplicate entries.');seen.add(row.studentId);
 }
 if(!rows.some(r=>!r.excluded))errors.push('No entries selected.');
 return [...new Set(errors)];
}
