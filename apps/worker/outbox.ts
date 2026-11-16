import type{Database}from'../../packages/db';
import{unlink}from'node:fs/promises';
import{resolve}from'node:path';
import{z}from'zod';
import{readIdentitySecret}from'../../packages/auth';
export async function processOutbox(db:Database,schoolId:string,transport?:{deliver(payload:Record<string,any>):Promise<void>}){
 return db.tenant(schoolId,undefined,async tx=>{
  const row=(await tx.query("SELECT * FROM outbox_events WHERE status='pending' AND deleted_at IS NULL AND (payload->>'nextAttemptAt' IS NULL OR (payload->>'nextAttemptAt')::timestamptz<=now()) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];if(!row)return false;
  try{
   if(row.payload.eventType==='fileErase'){z.uuid().parse(schoolId);z.uuid().parse(row.payload.fileId);await unlink(resolve(process.env.FILE_DIRECTORY??'.data/files',schoolId,row.payload.fileId+'.enc')).catch(error=>{if(error.code!=='ENOENT')throw error;});}
   else if(row.payload.eventType==='authOtp'){
    if(new Date(row.payload.expiresAt??row.created_at).getTime()+(row.payload.expiresAt?0:300000)<=Date.now()){await tx.query("UPDATE outbox_events SET status='cancelled',payload=payload-'encryptedDelivery',version=version+1 WHERE id=$1",[row.id]);return true;}
    const value=JSON.parse(readIdentitySecret(row.payload.encryptedDelivery));let config:any;try{config=JSON.parse(process.env.SCHOOL_MESSAGING??'{}')[schoolId]?.[value.channel];}catch{config=null;}
    if(transport)await transport.deliver({...value,eventType:'authOtp'});else{
     if(!config?.url||!config?.apiKey||!config.url.startsWith('https://'))throw new Error('messagingNotConfigured');const response=await fetch(config.url,{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({destination:value.destination,template:'campus_sign_in',code:value.code,expiresInSeconds:300}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('messagingUnavailable');
    }
   }else{
    const notification=(await tx.query('SELECT * FROM notification_events WHERE id=$1',[row.payload.notificationId])).rows[0];if(!notification){await tx.query("UPDATE outbox_events SET status='cancelled',version=version+1 WHERE id=$1",[row.id]);return true;}
    const memberships=(await tx.query('SELECT role FROM memberships WHERE user_id=$1 AND active=true',[notification.owner_id])).rows;
    const kind=notification.audience?.kind;const parents=memberships.some(m=>m.role==='parent');const staff=memberships.some(m=>!['student','parent'].includes(m.role));
    if((kind==='parents'&&!parents)||(kind==='staff'&&!staff)||!memberships.length){await tx.query("UPDATE outbox_events SET status='cancelled',version=version+1 WHERE id=$1",[row.id]);return true;}
    if(notification.payload.studentId&&kind==='parents'&&!(await tx.query("SELECT id FROM guardians WHERE owner_id=$1 AND student_id=$2 AND deleted_at IS NULL AND payload->>'canView'='true'",[notification.owner_id,notification.payload.studentId])).rows.length){await tx.query("UPDATE outbox_events SET status='cancelled',version=version+1 WHERE id=$1",[row.id]);return true;}
    if(notification.audience?.classIds?.length){
     const match=(await tx.query("SELECT id FROM guardians WHERE owner_id=$1 AND deleted_at IS NULL AND payload->>'canView'='true' AND student_id IN (SELECT id FROM students WHERE class_id=ANY($2::uuid[]) AND deleted_at IS NULL AND status='active') UNION ALL SELECT id FROM memberships WHERE user_id=$1 AND active=true AND scope->'classes' ?| $3::text[]",[notification.owner_id,notification.audience.classIds,notification.audience.classIds])).rows;
     if(!match.length){await tx.query("UPDATE outbox_events SET status='cancelled',version=version+1 WHERE id=$1",[row.id]);return true;}
    }
    const preference=(await tx.query("SELECT payload FROM notification_preferences WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1",[notification.owner_id])).rows[0]?.payload;
    if(preference){
     const essential=['emergency','studentAbsent','attendanceCorrected','leaveDecision','coverAssigned'].includes(notification.payload.eventType);
     if(!preference.pushEnabled||(!essential&&!preference.optionalNotices)){await tx.query("UPDATE outbox_events SET status='cancelled',version=version+1 WHERE id=$1",[row.id]);return true;}
     const now=new Date();const local=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);const start=preference.quietStart,end=preference.quietEnd;
     const quiet=start<end?local>=start&&local<end:start>end&&(local>=start||local<end);
     if(quiet&&notification.payload.eventType!=='emergency'){await tx.query("UPDATE outbox_events SET payload=payload||$1::jsonb,version=version+1 WHERE id=$2",[JSON.stringify({nextAttemptAt:new Date(Date.now()+900000).toISOString()}),row.id]);return true;}
    }
    if(transport)await transport.deliver({recipientUserId:notification.owner_id,title:notification.payload.title,body:notification.payload.body,audience:notification.audience});
    else {const config=JSON.parse(process.env.SCHOOL_PUSH??'{}')[schoolId];if(!config?.deliveryUrl||!config?.apiKey||!config.deliveryUrl.startsWith('https://'))throw new Error('pushNotConfigured');const response=await fetch(config.deliveryUrl,{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({recipientUserId:notification.owner_id,title:notification.payload.title,body:notification.payload.body,audience:notification.audience}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('pushUnavailable');}
   }
   await tx.query("UPDATE outbox_events SET status='delivered',payload=payload||$1::jsonb,version=version+1,updated_at=now() WHERE id=$2",[JSON.stringify({deliveredAt:new Date().toISOString(),encryptedDelivery:null}),row.id]);
  }catch(error){
   const failure=error instanceof Error&&['messagingNotConfigured','pushNotConfigured'].includes(error.message)?error.message:'deliveryFailed';const attempts=(row.payload.deliveryAttempts??0)+1;const retry=failure==='deliveryFailed'&&attempts<5;
   await tx.query("UPDATE outbox_events SET status=$1,payload=payload||$2::jsonb,version=version+1,updated_at=now() WHERE id=$3",[retry?'pending':'failed',JSON.stringify({failure,deliveryAttempts:attempts,nextAttemptAt:retry?new Date(Date.now()+Math.min(3600000,30000*2**attempts)).toISOString():null}),row.id]);
  }
  return true;
 });
}

export async function expirePrivacyExports(db:Database,schoolId:string){return db.tenant(schoolId,undefined,async tx=>{
 const rows=await tx.query("UPDATE privacy_exports SET status='expired',payload=payload-'encryptedContent',version=version+1,updated_at=now() WHERE status='ready' AND (payload->>'expiresAt')::timestamptz<=now() RETURNING id");return rows.rows.length;
});}
