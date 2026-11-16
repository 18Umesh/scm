import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import sharp from 'sharp';
import ExcelJS from 'exceljs';
import {createDatabase,type Database} from '../packages/db';
import {seedNetaji} from '../packages/db/seed-netaji';
import {NETAJI} from '../packages/demo/netaji';
import {Operations,type Actor} from '../packages/operations/service';
import {TeacherWorkflows} from '../packages/operations/teacher';
import {ParentFiles} from '../packages/operations/files';
import {SchoolFileStore} from '../packages/operations/school-file-store';
let db:Database,ops:Operations,flow:TeacherWorkflows,files:ParentFiles,teacher:Actor,parent:Actor,other:Actor,classId:string,studentId:string,directory:string;
const originalMode=process.env.POST_ATTACHMENT_STORAGE,originalStores=process.env.SCHOOL_FILE_STORES,originalQuota=process.env.FILE_SCHOOL_QUOTA_BYTES;
const pdf=Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
const entry=(name:string,bytes:Buffer)=>({filename:name,fileBase64:bytes.toString('base64')});
before(async()=>{
 process.env.POST_ATTACHMENT_STORAGE='local';db=await createDatabase({mode:'embedded'});await db.migrate();await seedNetaji(db);ops=new Operations(db);directory=await mkdtemp(join(tmpdir(),'campus-post-'));files=new ParentFiles(db,ops,directory);flow=new TeacherWorkflows(db,ops,files);
 const actor=async(email:string):Promise<Actor>=>{const user=NETAJI.accounts.find(a=>a.email===email)!;const m=(await db.admin.query('SELECT * FROM memberships WHERE user_id=$1',[user.id])).rows[0];return{schoolId:m.school_id,userId:m.user_id,membershipId:m.id,role:m.role};};teacher=await actor('anjali@netaji.school');parent=await actor('priya@netaji.school');other=await actor('suresh@netaji.school');const student=(await ops.list(parent,'students',{})).data[0];studentId=student.id;classId=student.class_id!;
});
after(async()=>{await db?.close();for(const[key,value]of Object.entries({POST_ATTACHMENT_STORAGE:originalMode,SCHOOL_FILE_STORES:originalStores,FILE_SCHOOL_QUOTA_BYTES:originalQuota})){if(value===undefined)delete process.env[key];else process.env[key]=value;}if(directory){assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep+'campus-post-'));await rm(directory,{recursive:true,force:true});}});

test('post images, PDFs and spreadsheets download only for selected recipients',async()=>{
 const image=await sharp({create:{width:80,height:60,channels:3,background:'#789566'}}).png().toBuffer();const book=new ExcelJS.Workbook();book.addWorksheet('Practice').addRow(['Question','Answer']);const xlsx=Buffer.from(await book.xlsx.writeBuffer());
 const post=await flow.post(teacher,{classIds:[classId],studentIds:[studentId],files:[entry('practice.png',image),entry('worksheet.pdf',pdf),entry('questions.xlsx',xlsx)]});assert.ok(post.published);assert.equal(post.payload.body,'');assert.equal(post.payload.attachmentCount,3);
 const list=await files.list(parent,'feed',post.id);assert.equal(list.data.length,3);assert.ok(list.data.every(file=>!('storage'in file)));const photo=list.data.find(file=>file.mime==='image/webp')!;assert.equal(photo.filename,'practice.webp');const opened=await files.download(parent,photo.id);assert.equal((await sharp(opened.buffer).metadata()).format,'webp');assert.notDeepEqual(await readFile(join(directory,teacher.schoolId,photo.id+'.enc')),opened.buffer);
 const document=list.data.find(file=>file.filename==='worksheet.pdf')!;assert.deepEqual((await files.download(parent,document.id)).buffer,pdf);await assert.rejects(files.download(other,document.id),/notFound/);await assert.rejects(files.list(other,'feed',post.id),/notFound/);await assert.rejects(files.upload(teacher,{module:'feed',recordId:post.id,...entry('late.pdf',pdf)}),/recordLocked/);await assert.rejects(files.upload(parent,{module:'feed',recordId:post.id,...entry('parent.pdf',pdf)}),/forbidden/);
});

test('a failed attachment leaves no visible post or retained draft files',async()=>{
 const before=await readdir(join(directory,teacher.schoolId));await assert.rejects(flow.post(teacher,{body:'Must not publish a partial post.',classIds:[classId],files:[entry('good.pdf',pdf),entry('bad.exe',Buffer.from('MZ not an allowed attachment'))]}),/invalidImage/);
 assert.deepEqual(await readdir(join(directory,teacher.schoolId)),before);assert.equal((await db.admin.query("SELECT count(*)::int n FROM posts WHERE payload->>'body'=$1 AND deleted_at IS NULL",['Must not publish a partial post.'])).rows[0].n,0);
});

test('school quota and file count limits prevent uncontrolled attachment growth',async()=>{
 process.env.FILE_SCHOOL_QUOTA_BYTES='1';try{await assert.rejects(flow.post(teacher,{body:'Storage cap check.',classIds:[classId],files:[entry('worksheet.pdf',pdf)]}),/schoolStorageFull/);}finally{if(originalQuota===undefined)delete process.env.FILE_SCHOOL_QUOTA_BYTES;else process.env.FILE_SCHOOL_QUOTA_BYTES=originalQuota;}
 await assert.rejects(flow.post(teacher,{classIds:[classId],files:Array.from({length:6},()=>entry('extra.pdf',pdf))}));await assert.rejects(flow.post(teacher,{classIds:[classId],files:[entry('large.pdf',Buffer.alloc(6*1024*1024+1))]}),/fileTooLarge/);
});

test('links-only posting stores no binary files and rejects direct upload attempts',async()=>{
 process.env.POST_ATTACHMENT_STORAGE='links-only';try{const before=await readdir(join(directory,teacher.schoolId));const post=await flow.post(teacher,{classIds:[classId],links:[{name:'School worksheet',url:'https://drive.google.com/file/d/school-example/view'}]});assert.equal((await ops.get(parent,'feed',post.id)).payload.links.length,1);assert.equal((await files.list(parent,'feed',post.id)).data.length,0);assert.deepEqual(await readdir(join(directory,teacher.schoolId)),before);await assert.rejects(flow.post(teacher,{classIds:[classId],files:[entry('blocked.pdf',pdf)]}),/schoolFileLinksOnly/);await assert.rejects(files.upload(teacher,{module:'feed',recordId:post.id,...entry('blocked.pdf',pdf)}),/schoolFileLinksOnly/);await assert.rejects(flow.post(teacher,{classIds:[classId],links:[{name:'Unsafe link',url:'javascript:alert(1)'}]}));}finally{process.env.POST_ATTACHMENT_STORAGE='local';}
});

test('school-owned Drive stores encrypted content remotely, supports private downloads and never writes a local copy',async()=>{
 const original=process.env.SCHOOL_FILE_STORES;process.env.POST_ATTACHMENT_STORAGE='school-drive';process.env.SCHOOL_FILE_STORES=JSON.stringify({[teacher.schoolId]:{provider:'google-drive',folderId:'school-folder',clientId:'school-client',clientSecret:'test-secret',refreshToken:'test-refresh'}});
 const objects=new Map<string,Buffer>();let serial=0,tokenCalls=0;const metadata:any[]=[];
 const request:typeof fetch=async(input,options)=>{const url=String(input);if(url==='https://oauth2.googleapis.com/token'){tokenCalls++;return Response.json({access_token:'test-access',expires_in:3600});}if(url.includes('uploadType=resumable')){metadata.push(JSON.parse(String(options?.body)));return new Response(null,{status:200,headers:{location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=school-upload'}});}if(options?.method==='PUT'){const key='school-file-'+(++serial);objects.set(key,Buffer.from(options.body as ArrayBuffer));return Response.json({id:key});}const key=/\/files\/([^?]+)/.exec(url)?.[1]??'';if(options?.method==='DELETE'){objects.delete(key);return new Response(null,{status:204});}if(objects.has(key))return new Response(new Uint8Array(objects.get(key)!).buffer);return new Response(null,{status:404});};
 try{const before=await readdir(join(directory,teacher.schoolId));const cloudFiles=new ParentFiles(db,ops,directory,new SchoolFileStore(directory,request));const cloudFlow=new TeacherWorkflows(db,ops,cloudFiles);const post=await cloudFlow.post(teacher,{classIds:[classId],studentIds:[studentId],files:[entry('school.pdf',pdf)]});const list=await cloudFiles.list(parent,'feed',post.id);assert.equal(list.data.length,1);assert.deepEqual((await cloudFiles.download(parent,list.data[0].id)).buffer,pdf);await assert.rejects(cloudFiles.download(other,list.data[0].id),/notFound/);assert.deepEqual(await readdir(join(directory,teacher.schoolId)),before);assert.deepEqual(metadata[0].parents,['school-folder']);assert.notDeepEqual([...objects.values()][0],pdf);assert.equal(tokenCalls,1);await cloudFiles.erase(teacher.schoolId,list.data[0].id);assert.equal(objects.size,0);}finally{process.env.POST_ATTACHMENT_STORAGE='local';if(original===undefined)delete process.env.SCHOOL_FILE_STORES;else process.env.SCHOOL_FILE_STORES=original;}
});

test('a missing school cloud connection fails closed without falling back to local disk',async()=>{
 process.env.POST_ATTACHMENT_STORAGE='school-drive';const original=process.env.SCHOOL_FILE_STORES;delete process.env.SCHOOL_FILE_STORES;try{const before=await readdir(join(directory,teacher.schoolId));await assert.rejects(flow.post(teacher,{classIds:[classId],files:[entry('no-fallback.pdf',pdf)]}),/schoolFileLinksOnly/);assert.deepEqual(await readdir(join(directory,teacher.schoolId)),before);}finally{process.env.POST_ATTACHMENT_STORAGE='local';if(original!==undefined)process.env.SCHOOL_FILE_STORES=original;}
});

test('a school Drive upload outage never publishes a partial post or writes a local fallback',async()=>{
 const original=process.env.SCHOOL_FILE_STORES;process.env.POST_ATTACHMENT_STORAGE='school-drive';process.env.SCHOOL_FILE_STORES=JSON.stringify({[teacher.schoolId]:{provider:'google-drive',folderId:'school-folder',clientId:'school-client',clientSecret:'test-secret',refreshToken:'test-refresh'}});
 const request:typeof fetch=async(input)=>String(input).includes('oauth2.googleapis.com')?Response.json({access_token:'test-access'}):String(input).includes('uploadType=resumable')?new Response(null,{headers:{location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=offline'}}):new Response(null,{status:503});
 try{const before=await readdir(join(directory,teacher.schoolId));const cloudFlow=new TeacherWorkflows(db,ops,new ParentFiles(db,ops,directory,new SchoolFileStore(directory,request)));await assert.rejects(cloudFlow.post(teacher,{body:'Cloud outage post.',classIds:[classId],files:[entry('unavailable.pdf',pdf)]}),/schoolStorageUnavailable/);assert.deepEqual(await readdir(join(directory,teacher.schoolId)),before);assert.equal((await db.admin.query("SELECT count(*)::int n FROM posts WHERE payload->>'body'='Cloud outage post.' AND published=true")).rows[0].n,0);}finally{process.env.POST_ATTACHMENT_STORAGE='local';if(original===undefined)delete process.env.SCHOOL_FILE_STORES;else process.env.SCHOOL_FILE_STORES=original;}
});
