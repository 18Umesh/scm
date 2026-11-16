import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import { createDatabase, type Database } from '../packages/db';
import { seed, DEMO } from '../packages/db/seed';
import { createApp } from '../apps/api/src/app';
import { id, verifyPassword, hashPassword, totp, verifyTotp, RateLimiter } from '../packages/auth';
import { allowed } from '../packages/rbac';
import { roles } from '../packages/validation';
import { contrast, safeAccent, requiredBlocks, validateLayout } from '../packages/theme';
import { normalizeHost } from '../packages/tenancy';
import { AiGateway, safePublicPrompt } from '../packages/ai';
import { request } from 'node:http';
let db: Database; let app: INestApplication; let origin: string;
type Session = {cookie:string;csrf:string};
async function call(path:string,options: {method?:string;body?:any;session?:Session;host?:string;origin?:string;csrf?:string}={}) {
  return new Promise<Response>((resolve,reject)=> {
    const req=request(`${origin}/api${path}`,{method:options.method ?? 'GET',headers:{host:options.host ?? 'greenfield.campus.test',...(options.origin?{origin:options.origin}:{}),...(options.body?{'content-type':'application/json'}:{}),...(options.session?{cookie:options.session.cookie,'x-csrf-token':options.csrf ?? options.session.csrf}:{})}},res=> {
      const chunks:Buffer[]=[]; res.on('data',chunk=>chunks.push(chunk)); res.on('end',()=> {
        const headers=new Headers(); for(let i=0;i<res.rawHeaders.length;i+=2) headers.append(res.rawHeaders[i],res.rawHeaders[i+1]);
        resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers}));
      });
    }); req.on('error',reject); if(options.body) req.write(JSON.stringify(options.body)); req.end();
  });
}
async function login(email='admin',host='greenfield.campus.test'):Promise<Session> {
  const r = await call('/auth/login',{method:'POST',host,body:{email:`${email}@demo.campus.test`,password:DEMO.password,...(email==='principal'?{code:totp(DEMO.totpSecret)}:{})}});
  assert.equal(r.status,200,await r.text());
  const sessionCookie=r.headers.getSetCookie().find(c=>c.startsWith('campus_session='))!;assert.match(sessionCookie,/HttpOnly/i);assert.match(sessionCookie,/SameSite=Strict/i);assert.doesNotMatch(sessionCookie,/Domain=/i);
  const cookies = r.headers.getSetCookie().map(c=>c.split(';')[0]);
  return {cookie:cookies.join('; '),csrf:cookies.find(c=>c.startsWith('campus_csrf='))!.split('=')[1]};
}
before(async()=> { db = await createDatabase({mode:process.env.TEST_DATABASE_URL?'postgres':'embedded',url:process.env.TEST_DATABASE_URL,adminUrl:process.env.TEST_DATABASE_ADMIN_URL}); await db.migrate(); await seed(db); app=await createApp(db); await app.listen(0,'127.0.0.1'); origin=await app.getUrl(); });
after(async()=>{await app?.close();await db?.close();});
test('password hashes are salted and verified; IDs are UUIDv7',()=> {
  const a=hashPassword('long-secret'); const b=hashPassword('long-secret'); assert.notEqual(a,b); assert.ok(verifyPassword('long-secret',a)); assert.ok(!verifyPassword('wrong',a)); assert.match(id(),/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});
test('TOTP matches RFC6238 sample and rejects malformed codes',()=> {
  assert.equal(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',59000),'287082'); assert.ok(verifyTotp(DEMO.totpSecret,totp(DEMO.totpSecret))); assert.ok(!verifyTotp(DEMO.totpSecret,'x'));
});
test('permissions deny unknown roles and unknown actions by default',()=> {
  assert.equal(allowed('root','settings.write'),false); for (const role of roles) assert.equal(allowed(role,'unknown'),false);
  assert.equal(allowed('parent','audit.read'),false); assert.equal(allowed('teacher','settings.write'),false); assert.equal(allowed('student','dashboard.read'),false); assert.equal(allowed('admin','settings.write'),true); assert.equal(allowed('accounts','audit.read'),false);
});
test('rate limits reset only after their window',()=> { const limit=new RateLimiter(); assert.ok(limit.take('a',1,100,1)); assert.ok(!limit.take('a',1,100,2)); assert.ok(limit.take('a',1,100,102)); });
test('host parser rejects header tricks',()=> { for(const host of ['a.com,b.com','a.com/path','a.com@evil.com','a..com','a.com\n']) assert.equal(normalizeHost(host),null); assert.equal(normalizeHost('Greenfield.Localhost:3000'),'greenfield.localhost'); });
test('RLS limits reads, rejects foreign inserts and cannot be bypassed by runtime role',async()=> {
  const result = await db.tenant(DEMO.schools[0],undefined,tx=>tx.query('SELECT * FROM schools')); assert.equal(result.rows.length,1); assert.equal(result.rows[0].id,DEMO.schools[0]);
  await assert.rejects(db.tenant(DEMO.schools[0],undefined,tx=>tx.query('INSERT INTO audit_logs(id,school_id,action,resource) VALUES($1,$2,$3,$4)',[id(),DEMO.schools[1],'test','test'])),/row-level security/);
  assert.equal((await db.publicQuery('SELECT * FROM schools')).rows.length,0);
  const role=(await db.tenant(DEMO.schools[0],undefined,tx=>tx.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user'))).rows[0]; assert.equal(role.rolsuper,false); assert.equal(role.rolbypassrls,false);
  if(process.env.TEST_DATABASE_ADMIN_URL)await assert.rejects(createDatabase({mode:'postgres',url:process.env.TEST_DATABASE_ADMIN_URL}),/must not bypass RLS/);
});
test('all tenant tables force RLS',async()=> {
  const rows=(await db.admin.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('users','school_domains','schema_migrations')")).rows;
  for (const row of rows) { const flags=(await db.admin.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname=$1',[row.tablename])).rows[0]; assert.ok(flags.relrowsecurity && flags.relforcerowsecurity,row.tablename); }
});
test('audit logs reject edits, deletes and truncation',async()=> {
  await assert.rejects(db.tenant(DEMO.schools[0],undefined,tx=>tx.query("UPDATE audit_logs SET action='forged'")),/permission denied|append-only/);
  await assert.rejects(db.tenant(DEMO.schools[0],undefined,tx=>tx.query('DELETE FROM audit_logs')),/permission denied|append-only/);
  await assert.rejects(db.tenant(DEMO.schools[0],undefined,tx=>tx.query('TRUNCATE audit_logs')),/permission denied/);
});
test('verified school bootstrap resolves two distinct schools; unknown host is rejected',async()=> {
  const a=await (await call('/public/bootstrap')).json(); const b=await (await call('/public/bootstrap',{host:'riverdale.campus.test'})).json(); assert.notEqual(a.school.id,b.school.id); assert.notEqual(a.theme.accent,b.theme.accent);
  assert.equal((await call('/public/bootstrap',{host:'attacker.test'})).status,404);
  await db.admin.query("UPDATE school_domains SET verified=false WHERE host='riverdale.campus.test'"); assert.equal((await call('/public/bootstrap',{host:'riverdale.campus.test'})).status,404); await db.admin.query("UPDATE school_domains SET verified=true WHERE host='riverdale.campus.test'");
});
test('unauthenticated protected endpoints fail closed',async()=> {
  for(const path of ['/auth/me','/dashboard','/memberships','/audit','/settings','/ai/usage']) assert.equal((await call(path)).status,401,path);
});
test('session cookies are host-only and HttpOnly; session cannot cross school hosts',async()=> {
  const session=await login(); assert.equal((await call('/dashboard',{session})).status,200);
  for(const host of ['riverdale.campus.test','greenfield.localhost']) for(const path of ['/auth/me','/dashboard','/memberships','/settings','/ai/usage']) assert.equal((await call(path,{session,host})).status,401,`${host}${path}`);
});
test('unverified school cannot be resolved even when its domain was approved earlier',async()=> {
  await db.admin.query('UPDATE schools SET verified=false WHERE id=$1',[DEMO.schools[1]]);
  assert.equal((await call('/public/bootstrap',{host:'riverdale.campus.test'})).status,404);
  await db.admin.query('UPDATE schools SET verified=true WHERE id=$1',[DEMO.schools[1]]);
});
test('role permissions enforced for parent and teacher; no sensitive overview counts',async()=> {
  const parent=await login('parent'); const teacher=await login('teacher');
  for(const session of [parent,teacher]) for(const path of ['/audit','/memberships']) assert.equal((await call(path,{session})).status,403);
  assert.equal((await (await call('/dashboard',{session:parent})).json()).counts,null);
  assert.equal((await call('/settings/theme',{method:'PUT',session:teacher,body:{accent:'#ffffff',version:1}})).status,403);
  assert.equal((await call('/ai/usage',{session:parent})).status,403);
});
test('privileged roles require a valid second factor',async()=> {
  const response=await call('/auth/login',{method:'POST',body:{email:'principal@demo.campus.test',password:DEMO.password}}); assert.equal(response.status,401); assert.equal((await response.json()).code,'mfaRequired');
  assert.equal((await call('/auth/me',{session:await login('principal')})).status,200);
});
test('CSRF and origin checks block writes',async()=> {
  const session=await login();
  assert.equal((await call('/auth/logout',{method:'POST',body:{},session,csrf:'incorrect'})).status,403);
  assert.equal((await call('/auth/logout',{method:'POST',body:{},session,origin:'https://attacker.test'})).status,403);
});
test('role switch permits only own same-school memberships and rotates sessions',async()=> {
  const session=await login('teacher'); const me=await (await call('/auth/me',{session})).json(); const parent=me.memberships.find((m:any)=>m.role==='parent');
  const foreign=(await db.admin.query('SELECT id FROM memberships WHERE school_id=$1 AND user_id=$2 LIMIT 1',[DEMO.schools[1],DEMO.users.teacher])).rows[0];
  assert.equal((await call('/auth/context',{method:'POST',body:{membershipId:foreign.id},session})).status,403);
  const r=await call('/auth/context',{method:'POST',body:{membershipId:parent.id},session}); assert.equal(r.status,200); assert.equal((await call('/auth/me',{session})).status,401);
});
test('refresh rotates tokens and logout revokes a session',async()=> {
  const session=await login(); const response=await call('/auth/refresh',{method:'POST',body:{},session}); assert.equal(response.status,200);
  assert.equal((await call('/auth/me',{session})).status,401);
  const cookies=response.headers.getSetCookie().map(c=>c.split(';')[0]); const rotated={cookie:cookies.join('; '),csrf:cookies.find(c=>c.startsWith('campus_csrf='))!.split('=')[1]};
  assert.equal((await call('/auth/logout',{method:'POST',body:{},session:rotated})).status,200); assert.equal((await call('/auth/me',{session:rotated})).status,401);
});
test('lists validate pagination and sensitive reads are audited',async()=> {
  const session=await login(); assert.equal((await call('/memberships?limit=1000',{session})).status,400);
  const response=await (await call('/memberships?page=1&limit=2',{session})).json(); assert.equal(response.data.length,2); assert.ok(response.total>2);
  const filtered=await (await call('/memberships?role=teacher&page=1&limit=1',{session})).json();assert.equal(filtered.total,1);assert.equal(filtered.data[0].role,'teacher');
  const logs=(await db.tenant(DEMO.schools[0],undefined,tx=>tx.query("SELECT * FROM audit_logs WHERE action='sensitive.read' AND resource='memberships'"))).rows; assert.ok(logs.length>0);
});
test('settings use optimistic concurrency and append an audit event',async()=> {
  const session=await login(); const before=await (await call('/settings',{session})).json();
  const body={enabled:false,monthlyCapPaise:'12345',version:before.version}; assert.equal((await call('/settings/ai',{method:'PUT',body,session})).status,200);
  assert.equal((await call('/settings/ai',{method:'PUT',body,session})).status,409);
  const other=await db.tenant(DEMO.schools[1],undefined,tx=>tx.query('SELECT ai_monthly_cap_paise::text FROM school_settings')); assert.equal(other.rows[0].ai_monthly_cap_paise,'10000');
});
test('theme corrects contrast, versions changes and never changes another school',async()=> {
  for(let i=0;i<256;i++) { const hex='#'+(i*65537).toString(16).padStart(6,'0'); for(const background of ['#FFFFFF','#EEF2F7','#E8F4F3'])assert.ok(contrast(safeAccent(hex),background)>=4.5); }
  assert.ok(validateLayout([...requiredBlocks])); assert.ok(!validateLayout(['today'])); assert.ok(!validateLayout([...requiredBlocks,'script']));
  const session=await login(); const b=await (await call('/public/bootstrap')).json(); const r=await call('/settings/theme',{method:'PUT',session,body:{accent:'#ffff00',version:b.theme.version}}); assert.equal(r.status,200); assert.ok(contrast((await r.json()).accent,'#FFFFFF')>=4.5);
  assert.equal((await call('/settings/theme',{method:'PUT',session,body:{accent:'#abcdef',version:b.theme.version}})).status,409);
});
test('AI is globally off by default and personal prompts cannot reach free endpoints',async()=> {
  const gateway=new AiGateway(db,()=>false,{draft:async()=>{throw new Error('Provider must never run');}});
  const result=await gateway.request(DEMO.schools[0],DEMO.users.teacher,'teacher',{task:'worksheet',prompt:'Five questions about rivers',dataTier:'public'}); assert.equal(result.ok,false); if(!result.ok) assert.equal(result.code,'aiDisabled');
  for(const prompt of ['name: Example Child','phone +91 9876543210','student ID: 12345','contact a@example.com']) assert.equal(safePublicPrompt(prompt),false);
  assert.equal((await call('/dashboard',{session:await login()})).status,200);
});
test('AI records disabled attempts without retaining prompts and enforces role',async()=> {
  const session=await login('teacher'); const response=await call('/ai/drafts',{method:'POST',session,body:{task:'worksheet',prompt:'Five questions on rivers',dataTier:'public'}}); assert.equal(response.status,422);
  assert.equal((await response.json()).code,'aiDisabled');
  const rows=(await db.tenant(DEMO.schools[0],undefined,tx=>tx.query('SELECT * FROM ai_requests'))).rows; assert.ok(rows.length); assert.ok(!Object.hasOwn(rows[0],'prompt'));
  assert.equal((await call('/ai/drafts',{method:'POST',session:await login('parent'),body:{task:'worksheet',prompt:'Five questions on rivers',dataTier:'public'}})).status,403);
});
test('AI personal-data route is denied before provider; per-school cap fails closed',async()=> {
  let calls=0;
  const model={id:'reviewed-test-free-model',free:true,noTraining:true,contractVerified:true,policyVerifiedAt:new Date().toISOString(),costCeilingPaise:0n};
  const gateway=new AiGateway(db,()=>true,{draft:async()=>{calls++;return{text:'Fictional educational draft',costPaise:0n};}},[model]);
  await db.admin.query('UPDATE school_settings SET ai_enabled=true,ai_monthly_cap_paise=10 WHERE school_id=$1',[DEMO.schools[0]]);
  for(const input of [{task:'worksheet',prompt:'Example content',dataTier:'personal' as const},{task:'circular',prompt:'Name: Demo person',dataTier:'public' as const}]) {
    const response=await gateway.request(DEMO.schools[0],DEMO.users.teacher,'teacher',input);assert.equal(response.ok,false);if(!response.ok)assert.equal(response.code,'aiPersonalBlocked');
  }
  assert.equal(calls,0);
  await db.admin.query('UPDATE school_settings SET ai_monthly_cap_paise=0 WHERE school_id=$1',[DEMO.schools[0]]);
  const result=await gateway.request(DEMO.schools[0],DEMO.users.teacher,'teacher',{task:'worksheet',prompt:'Five questions about rivers',dataTier:'public'});assert.equal(result.ok,false);if(!result.ok)assert.equal(result.code,'aiCapReached');assert.equal(calls,0);
  await db.admin.query('UPDATE school_settings SET ai_monthly_cap_paise=10 WHERE school_id=$1',[DEMO.schools[0]]);
  const success=await gateway.request(DEMO.schools[0],DEMO.users.teacher,'teacher',{task:'worksheet',prompt:'Five questions about rivers',dataTier:'public'});assert.equal(success.ok,true);if(success.ok)assert.equal(success.approval,'required');assert.equal(calls,1);
  await db.admin.query('UPDATE school_settings SET ai_enabled=false WHERE school_id=$1',[DEMO.schools[0]]);
});
