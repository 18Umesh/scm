'use client';
import {Plus,X} from 'lucide-react';
import {difficulties,paperSlots,type ExamBlueprint} from '../../../packages/operations/exam-paper';
export const defaultExam=():ExamBlueprint=>({examName:'Unit test',topics:[''],difficulty:'Mixed',objectiveCount:8,subjectiveCount:4,objectiveMarks:1,subjectiveMarks:3});
export default function ExamPaperSettings({value,onChange,busy}:{value:ExamBlueprint;onChange:(v:ExamBlueprint)=>void;busy:boolean}){
 const change=(key:keyof ExamBlueprint,v:any)=>onChange({...value,[key]:v});
 const slots=paperSlots(value),total=value.objectiveCount+value.subjectiveCount;
 return <fieldset className="studio-exam-settings" disabled={busy}><legend>Question paper blueprint</legend>
 <label>Exam type<select value={value.examName} onChange={e=>change('examName',e.target.value)}>{['Unit test','Quarterly examination','Half-yearly examination','Final examination','Practice examination'].map(v=><option key={v}>{v}</option>)}</select></label>
 <div className="teacher-section-head"><h4>Topics to cover</h4><button type="button" className="teacher-secondary" disabled={value.topics.length>=12} onClick={()=>change('topics',[...value.topics,''])}><Plus size={16}/>Add topic</button></div>
 {value.topics.map((topic,i)=><div className="studio-exam-topic" key={i}><label>Topic {i+1}<input required minLength={2} maxLength={160} value={topic} placeholder="e.g. Fractions" onChange={e=>change('topics',value.topics.map((v,j)=>i===j?e.target.value:v))}/></label>{value.topics.length>1&&<button type="button" className="teacher-icon" aria-label={'Remove topic '+(i+1)} onClick={()=>change('topics',value.topics.filter((_,j)=>i!==j))}><X size={18}/></button>}</div>)}
 <label>Difficulty<select value={value.difficulty} onChange={e=>change('difficulty',e.target.value)}>{[...difficulties,'Mixed'].map(d=><option key={d}>{d}</option>)}</select></label>
 <div className="studio-fields"><label>Objective questions (MCQ)<input aria-label="Objective question count" type="number" required min={0} max={40} value={value.objectiveCount} onChange={e=>change('objectiveCount',Number(e.target.value))}/></label><label>Marks per objective question<input aria-label="Objective marks" type="number" required min={1} max={10} value={value.objectiveMarks} onChange={e=>change('objectiveMarks',Number(e.target.value))}/></label></div>
 <div className="studio-fields"><label>Subjective questions<input aria-label="Subjective question count" type="number" required min={0} max={20} value={value.subjectiveCount} onChange={e=>change('subjectiveCount',Number(e.target.value))}/></label><label>Marks per subjective question<input aria-label="Subjective marks" type="number" required min={1} max={20} value={value.subjectiveMarks} onChange={e=>change('subjectiveMarks',Number(e.target.value))}/></label></div>
 <div className="studio-exam-summary"><strong>{total} questions · {value.objectiveCount*value.objectiveMarks+value.subjectiveCount*value.subjectiveMarks} marks</strong>{value.difficulty==='Mixed'?<p>{difficulties.map(d=>`${slots.filter(s=>s.difficulty===d).length} ${d.toLowerCase()}`).join(' · ')}</p>:<p>All questions: {value.difficulty.toLowerCase()}</p>}<small>Mixed spreads questions evenly across all four levels. Papers with fewer than four questions cannot include every level. Difficulty is relative to this grade and needs teacher review.</small></div>
 {total<1||total>50||total<value.topics.length?<p role="alert">Choose 1–50 questions, with at least one question per topic.</p>:null}
 </fieldset>;
}
