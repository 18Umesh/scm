import {z} from 'zod';
export const difficulties=['Easy','Medium','Hard','Hardest'] as const;
export const examBlueprint=z.object({
 examName:z.string().trim().min(2).max(120),
 topics:z.array(z.string().trim().min(2).max(160)).min(1).max(12),
 difficulty:z.enum(['Easy','Medium','Hard','Hardest','Mixed']),
 objectiveCount:z.number().int().min(0).max(40),subjectiveCount:z.number().int().min(0).max(20),
 objectiveMarks:z.number().int().min(1).max(10),subjectiveMarks:z.number().int().min(1).max(20)
}).strict().superRefine((v,ctx)=>{
 const total=v.objectiveCount+v.subjectiveCount;
 if(total<1||total>50)ctx.addIssue({code:'custom',message:'Choose between 1 and 50 questions in total.'});
 if(total<v.topics.length)ctx.addIssue({code:'custom',message:'Choose at least one question per topic.'});
 if(new Set(v.topics.map(t=>t.toLowerCase())).size!==v.topics.length)ctx.addIssue({code:'custom',message:'Remove duplicate topics.'});
});
export type ExamBlueprint=z.infer<typeof examBlueprint>;
export function paperSlots(b:ExamBlueprint){
 return Array.from({length:b.objectiveCount+b.subjectiveCount},(_,i)=>({type:i<b.objectiveCount?'objective':'subjective',topic:b.topics[i%b.topics.length],difficulty:b.difficulty==='Mixed'?difficulties[i%4]:b.difficulty}));
}
const question=z.object({type:z.enum(['objective','subjective']),topic:z.string(),difficulty:z.enum(difficulties),prompt:z.string().trim().min(3).max(2000),options:z.array(z.string().trim().min(1).max(500)).optional(),answer:z.string().trim().min(1).max(3000)});
export function formatExamPaper(text:string,b:ExamBlueprint,context:{className:string;subject:string}){
 const raw=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 const result=z.object({questions:z.array(question).max(50)}).parse(JSON.parse(raw));
 const slots=paperSlots(b);
 if(result.questions.length!==slots.length)throw new Error('Question count mismatch');
 if(new Set(result.questions.map(q=>q.prompt.toLowerCase().replace(/\s+/g,' ').trim())).size!==result.questions.length)throw new Error('Duplicate questions');
 result.questions.forEach((q,i)=>{
  const slot=slots[i];if(q.type!==slot.type||q.topic!==slot.topic||q.difficulty!==slot.difficulty)throw new Error('Question blueprint mismatch');
  if(q.type==='objective'&&(q.options?.length!==4||new Set(q.options).size!==4||!q.options.includes(q.answer)))throw new Error('Invalid objective answer');
 });
 const total=b.objectiveCount*b.objectiveMarks+b.subjectiveCount*b.subjectiveMarks;
 const lines=[b.examName,`${context.className} | ${context.subject}`,`Total marks: ${total}`,`Topics: ${b.topics.join(', ')}`,'Answer all questions.',''];
 result.questions.forEach((q,i)=>{if(i===0&&b.objectiveCount)lines.push('SECTION A — OBJECTIVE (MCQ)');if(i===b.objectiveCount)lines.push('SECTION B — SUBJECTIVE');lines.push(`${i+1}. ${q.prompt} [${q.type==='objective'?b.objectiveMarks:b.subjectiveMarks} marks]`);if(q.type==='objective')q.options!.forEach((o,j)=>lines.push(`${String.fromCharCode(65+j)}. ${o}`));lines.push('');});
 lines.push('TEACHER ANSWER KEY','Private teacher copy — remove this section before sharing the paper.','');
 result.questions.forEach((q,i)=>lines.push(`${i+1}. ${q.answer}\nTopic: ${q.topic} | Difficulty: ${q.difficulty}\n`));
 return lines.join('\n');
}
