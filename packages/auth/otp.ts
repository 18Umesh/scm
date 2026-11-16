import{createHmac,randomInt,timingSafeEqual}from'node:crypto';
import type{Database}from'../db';
import{id,protectIdentitySecret}from'./index';
export class OtpService{
 constructor(private db:Database){}
 private hash(challenge:string,code:string){const key=process.env.AUTH_OTP_SECRET??(this.db.embedded?'fictional-local-otp-secret':'');if(!key)throw new Error('encryptionNotConfigured');return createHmac('sha256',key).update(challenge+':'+code).digest('hex');}
 async parent(schoolId:string,phone:string){
  const owners=await this.db.tenant(schoolId,undefined,async tx=>(await tx.query("SELECT DISTINCT g.owner_id FROM guardians g JOIN memberships m ON m.school_id=g.school_id AND m.user_id=g.owner_id WHERE g.payload->>'phone'=$1 AND g.deleted_at IS NULL AND g.payload->>'canView'='true' AND m.role='parent' AND m.active=true",[phone])).rows);
  return this.begin(schoolId,owners.length===1?owners[0].owner_id:null,'parent',phone,'sms');
 }
 async staff(schoolId:string,userId:string,email:string){return this.begin(schoolId,userId,'staff',email,'email');}
 private async begin(schoolId:string,userId:string|null,purpose:string,destination:string,channel:'sms'|'email'){
  const challengeId=id(),code=String(randomInt(100000,1000000));await this.db.tenant(schoolId,userId??undefined,tx=>tx.query("INSERT INTO otp_challenges(id,school_id,user_id,purpose,code_hash,expires_at,created_by) VALUES($1,$2,$3,$4,$5,now()+interval '5 minutes',$3)",[challengeId,schoolId,userId,purpose,this.hash(challengeId,code)]));
  if(userId&&!this.db.embedded)await this.db.tenant(schoolId,userId,tx=>tx.query("INSERT INTO outbox_events(id,school_id,owner_id,status,payload,created_by) VALUES($1,$2,$3,'pending',$4,$3)",[id(),schoolId,userId,JSON.stringify({eventType:'authOtp',expiresAt:new Date(Date.now()+300000).toISOString(),encryptedDelivery:protectIdentitySecret(JSON.stringify({destination,code,channel}))})]));
  return{challengeId,expiresInSeconds:300,...(this.db.embedded&&userId?{demoCode:code}:{})};
 }
 async verify(schoolId:string,challengeId:string,code:string,purpose:string,expectedUser?:string){
  return this.db.tenant(schoolId,undefined,async tx=>{const challenge=(await tx.query('SELECT * FROM otp_challenges WHERE id=$1 FOR UPDATE',[challengeId])).rows[0];if(!challenge||challenge.purpose!==purpose||!challenge.user_id||challenge.consumed_at||challenge.attempts>=5||new Date(challenge.expires_at).getTime()<Date.now()||(expectedUser&&challenge.user_id!==expectedUser))return null;
   await tx.query('UPDATE otp_challenges SET attempts=attempts+1,version=version+1 WHERE id=$1',[challengeId]);const valid=timingSafeEqual(Buffer.from(challenge.code_hash,'hex'),Buffer.from(this.hash(challengeId,code),'hex'));if(!valid)return null;
   await tx.query('UPDATE otp_challenges SET consumed_at=now(),version=version+1 WHERE id=$1',[challengeId]);return{userId:challenge.user_id};
  });
 }
}
