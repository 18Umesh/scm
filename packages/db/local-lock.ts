import {openSync,readFileSync,writeFileSync,closeSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

// A second embedded API must fail before opening the same PostgreSQL files.
export function lockLocalDatabase(directory:string){
 const path=resolve(directory)+'.writer-lock';const owner=JSON.stringify({pid:process.pid,nonce:randomUUID()});
 for(let attempt=0;attempt<3;attempt++){
  try{const descriptor=openSync(path,'wx',0o600);try{writeFileSync(descriptor,owner);}finally{closeSync(descriptor);}return()=>{try{if(readFileSync(path,'utf8')===owner)unlinkSync(path);}catch{/* already released */}};}
  catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
   const text=readFileSync(path,'utf8');let pid:number;try{pid=JSON.parse(text).pid;}catch{throw new Error('Embedded database writer lock is unreadable; inspect it before retrying.');}
   if(!Number.isInteger(pid)||pid<1)throw new Error('Embedded database writer lock is invalid.');
   try{process.kill(pid,0);throw new Error('Embedded database is already open in another process. Reuse the existing API.');}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e;}
   try{if(readFileSync(path,'utf8')===text)unlinkSync(path);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
 }
 throw new Error('Could not acquire embedded database writer lock.');
}
