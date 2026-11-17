import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request} from 'node:http';
import type {INestApplication} from '@nestjs/common';
import {createDatabase,type Database} from '../packages/db';
import {seedNetaji} from '../packages/db/seed-netaji';
import {NETAJI} from '../packages/demo/netaji';
import {studentDemoPin} from '../packages/demo/students';
import {Operations,type Actor} from '../packages/operations/service';
import {StudentWorkflows} from '../packages/operations/student';
import {ParentFiles} from '../packages/operations/files';
import {createApp} from '../apps/api/src/app';
let db:Database,ops:Operations,student:StudentWorkflows,app:INestApplication,origin:string,directory:string;
const oldFiles=process.env.FILE_DIRECTORY;
async function actor(role:string,username?:string):Promise<Actor>{const m=(await db.admin.query('SELECT * FROM memberships WHERE school_id=$1 AND role=$2'+(username?" AND scope->>'username'=$3":''),username?[NETAJI.schoolId,role,username]:[NETAJI.schoolId,role])).rows[0];return{schoolId:NETAJI.schoolId,userId:m.user_id,membershipId:m.id,role:m.role};}
before(async()=>{directory=await mkdtemp(join(tmpdir(),'campus-student-'));process.env.FILE_DIRECTORY=directory;db=await createDatabase({mode:'embedded'});await db.migrate();await seedNetaji(db);ops=new Operations(db);student=new StudentWorkflows(db,ops);app=await createApp(db);await app.listen(0,'127.0.0.1');origin=await app.getUrl();});
after(async()=>{await app?.close();await db?.close();if(oldFiles===undefined)delete process.env.FILE_DIRECTORY;else process.env.FILE_DIRECTORY=oldFiles;if(directory)await rm(directory,{recursive:true,force:true});});
type Session={cookie:string;csrf:string};
async function call(path:string,method='GET',body?:unknown,session?:Session,host='netaji.campus.test'){
 return new Promise<Response>((resolve,reject)=>{const req=request(origin+'/api'+path,{method,headers:{host,...(body?{'content-type':'application/json'}:{}),...(session?{cookie:session.cookie,'x-csrf-token':session.csrf}:{})}},res=>{const chunks:Buffer[]=[];res.on('data',b=>chunks.push(b));res.on('end',()=>{const headers=new Headers();for(let i=0;i<res.rawHeaders.length;i+=2)headers.append(res.rawHeaders[i],res.rawHeaders[i+1]);resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers}));});});req.on('error',reject);if(body)req.write(JSON.stringify(body));req.end();});
}
async function login(){const r=await call('/student/auth/login','POST',{username:'aarav.reddy',pin:studentDemoPin});assert.equal(r.status,200);const cookies=r.headers.getSetCookie().map(v=>v.split(';')[0]);return{cookie:cookies.join('; '),csrf:cookies.find(c=>c.startsWith('campus_csrf='))!.split('=')[1]};}
test('student demo provisions ten accounts once and retains office opt-out',async()=>{
 assert.equal((await db.admin.query("SELECT count(*)::int n FROM memberships WHERE role='student'")).rows[0].n,10);await seedNetaji(db);assert.equal((await db.admin.query("SELECT count(*)::int n FROM memberships WHERE role='student'")).rows[0].n,10);
 const a=await actor('student','aarav.reddy'),overview=await student.overview(a);assert.equal(overview.profile.name,'Aarav Reddy');assert.ok(overview.timetable.length);assert.equal(overview.subjects.length,3);assert.ok(overview.resources.length);assert.ok(overview.attendance.length);assert.ok(overview.marks.length);
 assert.ok(overview.notifications.length);const notice=overview.notifications[0];await student.readNotification(a,{id:notice.id});assert.equal((await student.overview(a)).notifications.find(n=>n.id===notice.id)?.status,'read');
 const other=await actor('student','diya.menon');await assert.rejects(student.readNotification(other,{id:notice.id}),/notFound/);await assert.rejects(student.overview(await actor('parent')),/forbidden/);
 const file=await new ParentFiles(db,ops).download(a,overview.resources[0].id);assert.equal(file.buffer.subarray(0,4).toString(),'%PDF');
 await db.admin.query("UPDATE classes SET payload=jsonb_set(payload,'{studentLoginEnabled}','false') WHERE id=$1",[overview.profile.classId]);await seedNetaji(db);await assert.rejects(student.overview(a),/studentLoginDisabled/);await db.admin.query("UPDATE classes SET payload=jsonb_set(payload,'{studentLoginEnabled}','true') WHERE id=$1",[overview.profile.classId]);
});
test('student reads isolate classmates unpublished marks parent posts and future papers',async()=>{
 const a=await actor('student','aarav.reddy'),other=await actor('student','diya.menon'),head=await actor('principal'),overview=await student.overview(a),classId=overview.profile.classId;
 const own=(await db.admin.query('SELECT id FROM students WHERE owner_id=$1',[a.userId])).rows[0].id;
 const publish=async(body:string,audience:any)=>{let row:any=await ops.create(head,'feed',{body,postType:'notice',audience});row=await ops.action(head,'feed',row.id,{action:'publish',version:row.version});return row;};
 const parent=await publish('Parent-only private update',{kind:'parents',classIds:[classId],roles:['parent'],userIds:[]});const direct=await publish('Aarav student-only update',{kind:'people',classIds:[classId],roles:['student'],userIds:[a.userId],studentIds:[own]});const targeted=await publish('Aarav subset only',{kind:'students',classIds:[classId],roles:['student'],userIds:[],studentIds:[own]});
 assert.ok((await student.feed(a,{scope:'mine'})).data.some(r=>r.id===direct.id));for(const row of [parent,direct,targeted])assert.ok(!(await student.feed(other,{scope:'mine'})).data.some(r=>r.id===row.id));assert.ok(!(await student.feed(a,{scope:'mine'})).data.some(r=>r.id===parent.id));
 const otherData=await student.overview(other);assert.ok(!otherData.notifications.some(n=>n.payload.recordId===targeted.id));
 assert.ok(overview.marks.every(m=>m.student_id===own&&m.published));await assert.rejects(ops.get(other,'marks',overview.marks[0].id),/notFound/);await assert.rejects(ops.list(a,'invoices',{}),/forbidden/);await assert.rejects(ops.create(a,'homework',{}),/forbidden/);
 const future=overview.exams.find(e=>e.payload.date>overview.date);assert.ok(future);await db.admin.query("UPDATE exams SET status='paperReleased',payload=payload||$2::jsonb WHERE id=$1",[future.id,JSON.stringify({questionPaper:'PRIVATE FUTURE PAPER'})]);assert.equal((await ops.get(a,'exams',future.id)).payload.questionPaper,undefined);
 const mark=overview.marks[0];await db.admin.query('UPDATE marks SET published=false WHERE id=$1',[mark.id]);assert.ok(!(await student.overview(a)).marks.some(m=>m.id===mark.id));await db.admin.query('UPDATE marks SET published=true WHERE id=$1',[mark.id]);
});
test('student HTTP login refresh logout and disabled-class revocation work end to end',async()=>{
 assert.equal((await call('/student/auth/login','POST',{username:'aarav.reddy',pin:'999999'})).status,401);const session=await login();assert.equal((await (await call('/auth/me','GET',undefined,session)).json()).role,'student');const result=await call('/operations/student/overview','GET',undefined,session);assert.equal(result.status,200);const data=await result.json();assert.equal(data.profile.name,'Aarav Reddy');
 assert.equal((await call('/operations/student/notifications','POST',{id:data.notifications[0].id},{...session,csrf:'bad'})).status,403);assert.equal((await call('/operations/finance/overview','GET',undefined,session)).status,403);assert.equal((await call('/operations/configuration','GET',undefined,session)).status,403);assert.equal((await call('/operations/student/overview','GET',undefined,session,'unknown.school.test')).status,404);
 const r=await call('/auth/refresh','POST',{},session);assert.equal(r.status,200);assert.equal((await call('/auth/me','GET',undefined,session)).status,401);const cookies=r.headers.getSetCookie().map(c=>c.split(';')[0]),rotated={cookie:cookies.join('; '),csrf:cookies.find(c=>c.startsWith('campus_csrf='))!.split('=')[1]};
 await db.admin.query("UPDATE classes SET payload=jsonb_set(payload,'{studentLoginEnabled}','false') WHERE id=$1",[data.profile.classId]);assert.equal((await call('/operations/student/overview','GET',undefined,rotated)).status,403);assert.equal((await call('/student/auth/login','POST',{username:'aarav.reddy',pin:studentDemoPin})).status,403);await db.admin.query("UPDATE classes SET payload=jsonb_set(payload,'{studentLoginEnabled}','true') WHERE id=$1",[data.profile.classId]);assert.equal((await call('/auth/logout','POST',{},rotated)).status,200);assert.equal((await call('/auth/me','GET',undefined,rotated)).status,401);
});
test('office PIN resets preserve the student account and revoke existing sessions',async()=>{
 const session=await login(),principal=await actor('principal'),pupil=(await student.overview(await actor('student','aarav.reddy'))).profile;
 await assert.rejects(ops.provisionStudent(await actor('teacher'),{studentId:pupil.id,username:'aarav.reddy',pin:'456789'}),/forbidden/);
 const before=(await db.admin.query("SELECT count(*)::int n FROM memberships WHERE role='student'")).rows[0].n;
 await ops.provisionStudent(principal,{studentId:pupil.id,username:'aarav.reddy',pin:'456789'});assert.equal((await db.admin.query("SELECT count(*)::int n FROM memberships WHERE role='student'")).rows[0].n,before);assert.equal((await call('/auth/me','GET',undefined,session)).status,401);assert.equal((await call('/student/auth/login','POST',{username:'aarav.reddy',pin:studentDemoPin})).status,401);assert.equal((await call('/student/auth/login','POST',{username:'aarav.reddy',pin:'456789'})).status,200);
 await seedNetaji(db);assert.equal((await call('/student/auth/login','POST',{username:'aarav.reddy',pin:studentDemoPin})).status,401);
});
