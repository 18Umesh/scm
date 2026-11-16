import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../packages/db';
import {seedNetaji} from '../packages/db/seed-netaji';
import {NETAJI} from '../packages/demo/netaji';
import {Finance} from '../packages/operations/finance';
import {Operations,type Actor} from '../packages/operations/service';
import {ParentWorkflows} from '../packages/operations/parent';

test('Netaji teaching assignments are additive, repeatable and preserve the ten pupils',async()=>{
 const db=await createDatabase({mode:'embedded'});
 try{
  await db.migrate();await seedNetaji(db);await seedNetaji(db);
  const membership=(await db.admin.query("SELECT * FROM memberships WHERE school_id=$1 AND role='accounts'",[NETAJI.schoolId])).rows[0];
  const actor={schoolId:NETAJI.schoolId,userId:membership.user_id,membershipId:membership.id,role:'accounts' as const};const finance=new Finance(db);
  const summary=await finance.overview(actor);assert.equal(summary.invoiceCount,10);assert.equal(summary.billedPaise,'3000000');assert.equal(summary.collectedPaise,'1650000');assert.equal(summary.concessionsPaise,'50000');assert.equal(summary.refundsPaise,'50000');assert.equal(summary.duePaise,'1350000');
  assert.equal((await finance.receipts(actor,{limit:100})).total,7);assert.equal((await finance.trialBalance(actor,{})).balanced,true);
  const statements=await finance.statements(actor,{});assert.equal(statements.expensesPaise,'130000');assert.equal(statements.balanced,true);
  assert.equal((await db.admin.query('SELECT count(*)::int n FROM fee_invoices')).rows[0].n,12);
  assert.equal((await db.admin.query("SELECT count(*)::int n FROM audit_logs WHERE action='demo.financeInitializedV2'")).rows[0].n,1);
  assert.equal((await db.admin.query('SELECT count(*)::int n FROM payslips')).rows[0].n,3);
  assert.equal((await db.admin.query('SELECT count(*)::int n FROM classes')).rows[0].n,6);
  assert.equal((await db.admin.query('SELECT count(*)::int n FROM students')).rows[0].n,10);
  assert.equal((await db.admin.query('SELECT count(*)::int n FROM guardians')).rows[0].n,4);
  const memberships=(await db.admin.query("SELECT user_id,scope FROM memberships WHERE role='teacher'")).rows;
  assert.equal(memberships.find(m=>m.user_id===NETAJI.accounts[0].id)!.scope.classes.length,6);
  assert.ok(memberships.filter(m=>m.user_id!==NETAJI.accounts[0].id).every(m=>m.scope.classes.length===1));
  const periods=(await db.admin.query('SELECT t.* FROM timetable_entries t JOIN staff s ON s.id=t.staff_id WHERE s.owner_id=$1 ORDER BY t.payload->>\'weekday\',t.payload->>\'startTime\'',[NETAJI.accounts[0].id])).rows;
  assert.equal(periods.length,30);assert.ok(periods.every(p=>p.published));
  for(const weekday of [1,2,3,4,5]){const day=periods.filter(p=>p.payload.weekday===weekday);assert.equal(day.length,6);for(let i=1;i<day.length;i++)assert.ok(day[i-1].payload.endTime<=day[i].payload.startTime);}
  const ops=new Operations(db),flow=new ParentWorkflows(db,ops);
  const roleActor=async(role:string,userId?:string):Promise<Actor>=>{const m=(await db.admin.query('SELECT * FROM memberships WHERE school_id=$1 AND role=$2'+(userId?' AND user_id=$3':''),userId?[NETAJI.schoolId,role,userId]:[NETAJI.schoolId,role])).rows[0];return{schoolId:NETAJI.schoolId,userId:m.user_id,membershipId:m.id,role:m.role};};
  const parent=await roleActor('parent');const child=(await ops.list(parent,'students',{})).data[0];const head=(await db.admin.query("SELECT t.owner_id FROM classes c JOIN staff t ON t.id=(c.payload->>'classTeacherId')::uuid WHERE c.id=$1",[child.class_id])).rows[0];
  const teacher=await roleActor('teacher',head.owner_id),incharge=await roleActor('incharge');const otherTeacher=await roleActor('teacher',NETAJI.accounts.filter(a=>a.role==='teacher'&&a.id!==teacher.userId)[0].id);
  for(const module of ['grievances','safety']){
   const report=await ops.create(parent,module,{studentId:child.id,title:'Fictional routing '+module,description:'Please review this fictional parent issue.'});
   for(const recipient of [teacher,incharge]){assert.equal((await ops.get(recipient,module,report.id)).id,report.id);assert.ok((await ops.list(recipient,'notifications',{limit:100})).data.some(n=>n.payload.recordId===report.id));}
   await assert.rejects(ops.get(otherTeacher,module,report.id),/notFound/);await assert.rejects(flow.updates(otherTeacher,module,report.id,{message:'Not assigned'}),/notFound/);
   await flow.updates(teacher,module,report.id,{message:'The class teacher is reviewing this.'});const thread=await flow.updates(parent,module,report.id);assert.ok('data'in thread);assert.equal(thread.data.length,1);
   await flow.updates(parent,module,report.id,{message:'A parent follow-up for both recipients.'});for(const recipient of [teacher,incharge])assert.ok((await ops.list(recipient,'notifications',{limit:100})).data.some(n=>n.payload.recordId===report.id&&n.payload.body==='A parent follow-up for both recipients.'));
   const resolved=await ops.action(incharge,module,report.id,{action:'resolve',version:report.version,reason:'Reviewed and resolved with the class teacher.'});assert.ok('status'in resolved);assert.equal(resolved.status,'resolved');assert.equal((await ops.get(parent,module,report.id)).payload.resolution,'Reviewed and resolved with the class teacher.');
   await db.admin.query("UPDATE memberships SET scope=jsonb_set(scope,'{classes}','[]'::jsonb) WHERE id=$1",[incharge.membershipId]);await assert.rejects(ops.get(incharge,module,report.id),/notFound/);await db.admin.query("UPDATE memberships SET scope=jsonb_set(scope,'{classes}',$2::jsonb) WHERE id=$1",[incharge.membershipId,JSON.stringify([child.class_id])]);
  }
 }finally{await db.close();}
});
