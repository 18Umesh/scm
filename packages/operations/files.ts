import{z}from'zod';
import sharp from'sharp';
import{createCipheriv,createDecipheriv,createHash,randomBytes}from'node:crypto';
import type{Database,Queryable}from'../db';
import{id}from'../auth';
import{postUploadsEnabled,schoolDriveConfig}from './post-attachment-input';
import{SchoolFileStore}from './school-file-store';
import{Operations,OperationError,type Actor}from'./service';
const modules=['albums','submissions','pickup','homework','certificates','feed']as const;
export class ParentFiles{
 private storage:SchoolFileStore;
 constructor(private db:Database,private ops:Operations,directory=process.env.FILE_DIRECTORY??'.data/files',storage?:SchoolFileStore){this.storage=storage??new SchoolFileStore(directory);}
 private key(schoolId:string){const key=process.env.FIELD_ENCRYPTION_KEY??(process.env.NODE_ENV==='production'?'':'fictional-local-development-key');if(!key)throw new OperationError(503,'encryptionNotConfigured');return createHash('sha256').update(key+':files:'+schoolId).digest();}
 async erase(schoolId:string,fileId:string){const row=await this.db.tenant(schoolId,undefined,async tx=>(await tx.query('SELECT payload FROM parent_files WHERE id=$1',[z.uuid().parse(fileId)])).rows[0]);await this.storage.remove(schoolId,fileId,row?.payload.storage);}
 private async consent(tx:Queryable,studentIds:string[]){for(const studentId of studentIds){if(!(await tx.query("SELECT id FROM students WHERE id=$1 AND status='active' AND deleted_at IS NULL AND COALESCE(payload->>'optionalProcessingRestricted','false')<>'true'",[studentId])).rows.length)throw new OperationError(403,'photoConsentRequired');const decision=(await tx.query("SELECT payload->>'decision' AS decision FROM consent_records WHERE student_id=$1 AND lower(payload->>'purpose') IN ('photos','photographs','photo') AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1",[studentId])).rows[0];if(decision?.decision!=='consented')throw new OperationError(403,'photoConsentRequired');}}
 private async scanDocument(buffer:Buffer){
  if(!process.env.FILE_SCAN_URL&&process.env.NODE_ENV==='production')throw new OperationError(503,'fileScannerNotConfigured');
  if(process.env.FILE_SCAN_URL){if(!process.env.FILE_SCAN_URL.startsWith('https://')||!process.env.FILE_SCAN_TOKEN)throw new OperationError(503,'fileScannerNotConfigured');const scan=await fetch(process.env.FILE_SCAN_URL,{method:'POST',headers:{Authorization:`Bearer ${process.env.FILE_SCAN_TOKEN}`,'Content-Type':'application/octet-stream'},body:new Uint8Array(buffer).buffer,signal:AbortSignal.timeout(15000)});if(!scan.ok||(await scan.json()as any).clean!==true)throw new OperationError(400,'unsafeFile');}
  else if(/\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA)\b/i.test(buffer.toString('latin1')))throw new OperationError(400,'unsafeFile');
 }
 async upload(ctx:Actor,input:unknown){
  const body=z.object({module:z.enum(modules),recordId:z.uuid(),filename:z.string().trim().min(1).max(150),fileBase64:z.string().max(9*1024*1024),studentIds:z.array(z.uuid()).max(100).default([])}).strict().parse(input);
  if(body.module==='feed'&&!postUploadsEnabled(ctx.schoolId))throw new OperationError(403,'schoolFileLinksOnly');
  const record=await this.ops.get(ctx,body.module,body.recordId);
  if(ctx.role==='parent'&&!['submissions','pickup'].includes(body.module))throw new OperationError(403,'forbidden');
  if(!['principal','admin'].includes(ctx.role)&&record.owner_id!==ctx.userId)throw new OperationError(403,'forbidden');
  if(!this.ops.canCreate(ctx,body.module,this.ops.definition(body.module)))throw new OperationError(403,'forbidden');
  if(body.module==='submissions'&&(record.status==='reviewed'||(await this.ops.get(ctx,'homework',record.payload.homeworkId)).payload.dueDate<new Date().toISOString().slice(0,10)))throw new OperationError(409,'recordLocked');
  if(body.module==='pickup'&&record.status!=='pending')throw new OperationError(409,'recordLocked');
  if(['albums','homework','feed'].includes(body.module)&&record.published)throw new OperationError(409,'recordLocked');
  let buffer=Buffer.from(body.fileBase64,'base64');if(!buffer.length||buffer.length>6*1024*1024)throw new OperationError(413,'fileTooLarge');
  let mime='application/pdf';
  if(buffer.subarray(0,5).toString()==='%PDF-'){
   if(['albums','pickup'].includes(body.module))throw new OperationError(400,'imageRequired');
   await this.scanDocument(buffer);
  }else if(body.module==='feed'&&/\.(docx|xlsx|pptx)$/i.test(body.filename)){
   const extension=body.filename.split('.').pop()!.toLowerCase();const marker=({docx:'word/document.xml',xlsx:'xl/workbook.xml',pptx:'ppt/presentation.xml'} as Record<string,string>)[extension];
   if((buffer.length<4||buffer.readUInt32LE(0)!==0x04034b50)||!buffer.includes(Buffer.from('[Content_Types].xml'))||!buffer.includes(Buffer.from(marker))||/vbaProject|activeX|embeddings/i.test(buffer.toString('latin1')))throw new OperationError(400,'unsupportedFile');
   mime=({docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'} as Record<string,string>)[extension];await this.scanDocument(buffer);
  }else if(body.module==='feed'&&/\.(txt|csv)$/i.test(body.filename)){
   try{new TextDecoder('utf-8',{fatal:true}).decode(buffer);if(buffer.includes(0))throw new Error('binary');}catch{throw new OperationError(400,'unsupportedFile');}
   mime=/\.csv$/i.test(body.filename)?'text/csv':'text/plain';await this.scanDocument(buffer);
  }else{
   try{const image=sharp(buffer,{limitInputPixels:16_000_000,animated:false,failOn:'warning'});const metadata=await image.metadata();if(!['jpeg','png','webp'].includes(metadata.format??'')||(metadata.pages??1)>1)throw new Error('format');buffer=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();mime='image/webp';}catch{throw new OperationError(400,'invalidImage');}
  }
  const fileId=id(),nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key(ctx.schoolId),nonce);const encrypted=Buffer.concat([nonce,cipher.update(buffer),cipher.final(),cipher.getAuthTag()]);
  const useDrive=body.module==='feed'&&process.env.POST_ATTACHMENT_STORAGE!=='local'&&!!schoolDriveConfig(ctx.schoolId);
  const stored=await this.storage.put(ctx.schoolId,fileId,encrypted,useDrive);
  try{return await this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
   const locked=(await tx.query(`SELECT * FROM ${this.ops.definition(body.module).table} WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,[body.recordId])).rows[0];if(!locked||(['albums','homework','feed'].includes(body.module)&&locked.published)||(['pickup','submissions'].includes(body.module)&&['approved','reviewed'].includes(locked.status)))throw new OperationError(409,'recordLocked');if(ctx.role==='parent'&&locked.student_id&&!(await tx.query("SELECT id FROM guardians WHERE owner_id=$1 AND student_id=$2 AND deleted_at IS NULL AND payload->>'canView'='true'",[ctx.userId,locked.student_id])).rows.length)throw new OperationError(403,'forbidden');await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[ctx.schoolId+':file-quota']);
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[ctx.schoolId+':files:'+body.module+':'+body.recordId]);const count=(await tx.query("SELECT count(*)::int n FROM parent_files WHERE payload->>'module'=$1 AND payload->>'recordId'=$2 AND deleted_at IS NULL",[body.module,body.recordId])).rows[0].n;if(count>=(body.module==='albums'?100:body.module==='feed'?5:20))throw new OperationError(413,'fileLimitReached');const used=BigInt((await tx.query("SELECT COALESCE(sum((payload->>'size')::bigint),0)::text n FROM parent_files WHERE deleted_at IS NULL")).rows[0].n);if(used+BigInt(buffer.length)>BigInt(process.env.FILE_SCHOOL_QUOTA_BYTES??'1073741824'))throw new OperationError(413,'schoolStorageFull');
   if(body.module==='albums'){if(!body.studentIds.length)throw new OperationError(400,'depictedStudentsRequired');await this.consent(tx,body.studentIds);const valid=(await tx.query('SELECT id,class_id FROM students WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL',[body.studentIds])).rows;if(valid.length!==new Set(body.studentIds).size)throw new OperationError(400,'referenceNotFound');if(locked.audience?.classIds?.length&&valid.some(v=>!locked.audience.classIds.includes(v.class_id)))throw new OperationError(400,'classMismatch');}
   const filename=body.module==='feed'&&['image/webp','application/pdf'].includes(mime)?body.filename.replace(/\.[^.]+$/,'')+(mime==='image/webp'?'.webp':'.pdf'):body.filename;
   const payload={storage:stored,module:body.module,recordId:body.recordId,filename:filename.replace(/[\r\n"\\/]/g,'_'),mime,size:buffer.length,studentIds:body.module==='albums'?body.studentIds:[],sha256:createHash('sha256').update(buffer).digest('hex')};
   await tx.query("INSERT INTO parent_files(id,school_id,owner_id,student_id,status,payload,created_by) VALUES($1,$2,$3,$4,'ready',$5,$3)",[fileId,ctx.schoolId,ctx.userId,record.student_id,JSON.stringify(payload)]);await this.ops.audit(tx,ctx,'file.uploaded','parent_files',fileId);return{id:fileId,...payload};
  });}catch(error){await this.storage.remove(ctx.schoolId,fileId,stored);throw error;}
 }
 async list(ctx:Actor,module:string,recordId:string){const record=await this.ops.get(ctx,module,recordId);return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{const files=(await tx.query("SELECT id,owner_id,payload FROM parent_files WHERE payload->>'module'=$1 AND payload->>'recordId'=$2 AND status='ready' AND deleted_at IS NULL ORDER BY created_at",[module,recordId])).rows;const data=[];for(const file of files){try{if(module==='albums')await this.consent(tx,file.payload.studentIds);const{storage:_storage,...metadata}=file.payload;data.push({id:file.id,...metadata,canRemove:(file.owner_id===ctx.userId||['principal','admin'].includes(ctx.role))&&!record.published&&!['approved','reviewed','issued'].includes(record.status)});}catch{/* withdrawn photo consent hides the image immediately */}}return{data};});}
 async download(ctx:Actor,fileId:string){z.uuid().parse(fileId);const file=await this.db.tenant(ctx.schoolId,ctx.userId,async tx=>(await tx.query("SELECT * FROM parent_files WHERE id=$1 AND status='ready' AND deleted_at IS NULL",[fileId])).rows[0]);if(!file)throw new OperationError(404,'notFound');await this.ops.get(ctx,file.payload.module,file.payload.recordId);await this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{if(file.payload.module==='albums')await this.consent(tx,file.payload.studentIds);await this.ops.audit(tx,ctx,'sensitive.read','parent_files',file.id);});const encrypted=await this.storage.get(ctx.schoolId,fileId,file.payload.storage);const decipher=createDecipheriv('aes-256-gcm',this.key(ctx.schoolId),encrypted.subarray(0,12));decipher.setAuthTag(encrypted.subarray(-16));return{...file.payload,buffer:Buffer.concat([decipher.update(encrypted.subarray(12,-16)),decipher.final()])};}
 async remove(ctx:Actor,fileId:string){const file=await this.db.tenant(ctx.schoolId,ctx.userId,async tx=>(await tx.query('SELECT * FROM parent_files WHERE id=$1 AND deleted_at IS NULL',[z.uuid().parse(fileId)])).rows[0]);if(!file)throw new OperationError(404,'notFound');const record=await this.ops.get(ctx,file.payload.module,file.payload.recordId);if(ctx.userId!==file.owner_id&&!['principal','admin'].includes(ctx.role))throw new OperationError(403,'forbidden');if(record.published||['reviewed','approved'].includes(record.status))throw new OperationError(409,'recordLocked');await this.db.tenant(ctx.schoolId,ctx.userId,tx=>tx.query("UPDATE parent_files SET deleted_at=now(),status='removed',version=version+1 WHERE id=$1",[fileId]));await this.storage.remove(ctx.schoolId,fileId,file.payload.storage);return{ok:true};}
}
