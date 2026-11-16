import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {z} from 'zod';
import {OperationError} from './service';
import {schoolDriveConfig} from './post-attachment-input';
export type StoredFile={provider:'local'|'google-drive';objectId:string};
export class SchoolFileStore{
 private tokens=new Map<string,{token:string;expires:number}>();
 constructor(private directory:string,private request:typeof fetch=fetch){}
 private path(schoolId:string,fileId:string){z.uuid().parse(schoolId);z.uuid().parse(fileId);return join(resolve(this.directory),schoolId,fileId+'.enc');}
 private async token(schoolId:string){
  const config=schoolDriveConfig(schoolId);if(!config)throw new OperationError(503,'schoolStorageNotConnected');const cached=this.tokens.get(schoolId);if(cached&&cached.expires>Date.now())return cached.token;
  const result=await this.request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:config.refreshToken,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
  if(!result.ok)throw new OperationError(503,'schoolStorageNotConnected');const data=await result.json() as any;if(typeof data.access_token!=='string')throw new OperationError(503,'schoolStorageNotConnected');this.tokens.set(schoolId,{token:data.access_token,expires:Date.now()+Math.max(0,(Number(data.expires_in)||3600)-60)*1000});return data.access_token as string;
 }
 async put(schoolId:string,fileId:string,encrypted:Buffer,useSchoolDrive:boolean):Promise<StoredFile>{
  if(!useSchoolDrive){const path=this.path(schoolId,fileId);await mkdir(resolve(this.directory,schoolId),{recursive:true});await writeFile(path,encrypted,{flag:'wx',mode:0o600});return{provider:'local',objectId:fileId};}
  const config=schoolDriveConfig(schoolId);if(!config)throw new OperationError(503,'schoolStorageNotConnected');const token=await this.token(schoolId);
  const start=await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Upload-Content-Type':'application/octet-stream','X-Upload-Content-Length':String(encrypted.length)},body:JSON.stringify({name:fileId+'.enc',parents:[config.folderId],mimeType:'application/octet-stream'}),signal:AbortSignal.timeout(15000)});
  const location=start.headers.get('location');if(!start.ok||!location)throw new OperationError(503,'schoolStorageUnavailable');const target=new URL(location);if(target.protocol!=='https:'||target.hostname!=='www.googleapis.com')throw new OperationError(503,'schoolStorageUnavailable');
  const uploaded=await this.request(target,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/octet-stream','Content-Length':String(encrypted.length)},body:new Uint8Array(encrypted).buffer,signal:AbortSignal.timeout(60000)});if(!uploaded.ok)throw new OperationError(503,'schoolStorageUnavailable');const data=await uploaded.json() as any;if(typeof data.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(data.id))throw new OperationError(503,'schoolStorageUnavailable');return{provider:'google-drive',objectId:data.id};
 }
 async get(schoolId:string,fileId:string,stored?:StoredFile){
  if(!stored||stored.provider==='local')return readFile(this.path(schoolId,fileId));
  const response=await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(stored.objectId)}?alt=media&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${await this.token(schoolId)}`},signal:AbortSignal.timeout(30000)});if(!response.ok)throw new OperationError(response.status===404?404:503,response.status===404?'notFound':'schoolStorageUnavailable');return Buffer.from(await response.arrayBuffer());
 }
 async remove(schoolId:string,fileId:string,stored?:StoredFile){
  if(!stored||stored.provider==='local'){await unlink(this.path(schoolId,fileId)).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;});return;}
  const response=await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(stored.objectId)}?supportsAllDrives=true`,{method:'DELETE',headers:{Authorization:`Bearer ${await this.token(schoolId)}`},signal:AbortSignal.timeout(15000)});if(!response.ok&&response.status!==404)throw new OperationError(503,'schoolStorageUnavailable');
 }
}
