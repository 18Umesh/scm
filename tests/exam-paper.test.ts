import {test} from 'node:test';
import assert from 'node:assert/strict';
import {examBlueprint,paperSlots,formatExamPaper,type ExamBlueprint} from '../packages/operations/exam-paper';
import {openRouterTeaching} from '../packages/operations/teaching-studio';
const blueprint:ExamBlueprint={examName:'Quarterly examination',topics:['Fractions','Decimals'],difficulty:'Mixed',objectiveCount:4,subjectiveCount:4,objectiveMarks:1,subjectiveMarks:3};
const questions=()=>paperSlots(blueprint).map((s,i)=>({...s,prompt:`Question ${i+1} about ${s.topic}?`,...(s.type==='objective'?{options:['One','Two','Three','Four']} :{}),answer:s.type==='objective'?'Two':'A worked explanation.'}));
test('exam blueprint balances all difficulty levels and covers multiple topics',()=>{
 const slots=paperSlots(examBlueprint.parse(blueprint));assert.equal(slots.length,8);for(const level of ['Easy','Medium','Hard','Hardest'])assert.equal(slots.filter(s=>s.difficulty===level).length,2);
 const text=formatExamPaper(JSON.stringify({questions:questions()}),blueprint,{className:'Grade 4',subject:'Mathematics'});assert.match(text,/Total marks: 16/);assert.match(text,/SECTION A/);assert.match(text,/SECTION B/);assert.match(text,/TEACHER ANSWER KEY/);
 assert.throws(()=>examBlueprint.parse({...blueprint,objectiveCount:0,subjectiveCount:0}));assert.throws(()=>examBlueprint.parse({...blueprint,topics:['Fractions','fractions']}));assert.throws(()=>examBlueprint.parse({...blueprint,objectiveCount:1,subjectiveCount:0}));
});
test('exam output rejects wrong counts, difficulty labels, topics, duplicates and invalid MCQ answers',()=>{
 const context={className:'Grade 4',subject:'Mathematics'};
 assert.throws(()=>formatExamPaper(JSON.stringify({questions:questions().slice(1)}),blueprint,context));
 for(const patch of [{difficulty:'Hardest'},{topic:'Unassigned topic'},{answer:'Not an option'},{options:['One','One','Two','Three']}]){const q=questions();Object.assign(q[0],patch);assert.throws(()=>formatExamPaper(JSON.stringify({questions:q}),blueprint,context));}
 const q=questions();q[1].prompt=q[0].prompt;assert.throws(()=>formatExamPaper(JSON.stringify({questions:q}),blueprint,context));
});
test('OpenRouter receives the exam blueprint and returns a validated teacher paper',async()=>{
 const original=globalThis.fetch,key=process.env.OPENROUTER_API_KEY,enabled=process.env.TEACHING_AI_ENABLED;
 process.env.OPENROUTER_API_KEY='test-secret';process.env.TEACHING_AI_ENABLED='true';
 try{
  globalThis.fetch=async(_url,init)=>{const request=JSON.parse(init!.body as string);const task=JSON.parse(request.messages[1].content);assert.deepEqual(task.examBlueprint.questionSlots,paperSlots(blueprint));return Response.json({model:'test:free',usage:{cost:0},choices:[{finish_reason:'stop',message:{content:JSON.stringify({questions:questions()})}}]});};
  const input={classId:'019a6000-0000-7000-8000-000000000001',subjectId:'019a6000-0000-7000-8000-000000000002',topic:'Fractions and decimals examination',kind:'Exam question paper' as const,source:'',exam:blueprint};
  assert.match((await openRouterTeaching(input,{className:'Grade 4',subject:'Mathematics'})).text,/TEACHER ANSWER KEY/);
  globalThis.fetch=async()=>Response.json({usage:{cost:0},choices:[{message:{content:'A paper with the wrong counts.'}}]});await assert.rejects(openRouterTeaching(input,{className:'Grade 4',subject:'Mathematics'}),/did not match/);
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=key;if(enabled===undefined)delete process.env.TEACHING_AI_ENABLED;else process.env.TEACHING_AI_ENABLED=enabled;}
});
