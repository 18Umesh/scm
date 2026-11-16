import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openRouterTeaching,type TeachingInput} from '../packages/operations/teaching-studio';
test('teaching provider fixes routing to free models and rejects charged, failed and incomplete responses',async()=>{
 const oldFetch=globalThis.fetch,key=process.env.OPENROUTER_API_KEY,enabled=process.env.TEACHING_AI_ENABLED;
 process.env.OPENROUTER_API_KEY='test-server-secret';process.env.TEACHING_AI_ENABLED='true';
 const input:TeachingInput={classId:'019a6000-0000-7000-8000-000000000001',subjectId:'019a6000-0000-7000-8000-000000000002',topic:'Fractions',kind:'Lesson plan',source:''};
 const context={className:'Grade 4',subject:'Mathematics'};
 try{
  globalThis.fetch=async(_url,init)=>{const body=JSON.parse(init!.body as string);assert.equal(body.model,'openrouter/free');const task=JSON.parse(body.messages[1].content);assert.ok(!('durationMinutes' in task));assert.ok(!('language' in task));assert.ok(!('date' in task));assert.deepEqual(body.provider.max_price,{prompt:0,completion:0});assert.equal(body.provider.data_collection,'deny');assert.ok(!JSON.stringify(body).includes('test-server-secret'));return Response.json({model:'provider/example:free',choices:[{finish_reason:'stop',message:{content:'A draft lesson'}}],usage:{cost:0}});};
  assert.equal((await openRouterTeaching(input,context)).text,'A draft lesson');
  globalThis.fetch=async()=>Response.json({choices:[{message:{content:'Paid response'}}],usage:{cost:0.01}});await assert.rejects(openRouterTeaching(input,context),/verified/);
  globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'length',message:{content:'Incomplete'}}],usage:{cost:0}});await assert.rejects(openRouterTeaching(input,context),/output limit/);
  globalThis.fetch=async()=>Response.json({}, {status:429});await assert.rejects(openRouterTeaching(input,context),/limit reached/);
  process.env.TEACHING_AI_ENABLED='false';await assert.rejects(openRouterTeaching(input,context),/not configured/);
 }finally{globalThis.fetch=oldFetch;if(key===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=key;if(enabled===undefined)delete process.env.TEACHING_AI_ENABLED;else process.env.TEACHING_AI_ENABLED=enabled;}
});
