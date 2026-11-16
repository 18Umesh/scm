import{z}from'zod';
import type{Database}from'../db';
import{slotAllowed,adSlots,adRoutes,adEvents,type AdRole}from'../ads';
import{OperationError,type Actor}from'./service';
import{demoAds}from'../ads/demo';
const input=z.object({slotId:z.enum(adSlots),route:z.enum(adRoutes),language:z.enum(['en','te','hi']),appVersion:z.string().max(30)}).strict();
export class SchoolAds{
 constructor(private db:Database){}
 private demo(){return this.db.embedded&&process.env.NODE_ENV!=='production'&&process.env.ADS_DEMO_MODE==='true';}
 async slot(ctx:Actor,value:unknown){const body=input.parse(value);if(!slotAllowed(ctx.role as AdRole,body.route,body.slotId))return{ad:null};
  if(this.demo())return{ad:demoAds[ctx.role==='teacher'?1:0],examples:demoAds};
  if(process.env.ADS_ENABLED!=='true')return{ad:null};
  let roles:Record<string,boolean>;try{roles=JSON.parse(process.env.AD_ROLE_SWITCHES??'{}');}catch{return{ad:null};}if(roles[ctx.role]===false)return{ad:null};
  const school=await this.db.tenant(ctx.schoolId,ctx.userId,async tx=>(await tx.query('SELECT city,state FROM schools')).rows[0]);
  try{const response=await fetch((process.env.ADS_SERVICE_URL??'http://127.0.0.1:4010')+'/serve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slotId:body.slotId,language:body.language,appVersion:body.appVersion,city:school.city,state:school.state}),signal:AbortSignal.timeout(300)});if(!response.ok)return{ad:null};const result=await response.json()as any;return{ad:result.ad??null};}catch{return{ad:null};}
 }
 async metric(ctx:Actor,value:unknown){if(['student','accounts'].includes(ctx.role))throw new OperationError(403,'forbidden');const body=z.object({campaignId:z.uuid(),slotId:input.shape.slotId,event:z.enum(adEvents)}).strict().parse(value);if(this.demo()&&demoAds.some(ad=>ad.id===body.campaignId))return{ok:true,demo:true};if(process.env.ADS_ENABLED!=='true')return{ok:true};const city=await this.db.tenant(ctx.schoolId,ctx.userId,async tx=>(await tx.query('SELECT city FROM schools')).rows[0].city);try{await fetch((process.env.ADS_SERVICE_URL??'http://127.0.0.1:4010')+'/metrics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,city}),signal:AbortSignal.timeout(300)});}catch{/* Ads never block educational workflows. */}return{ok:true};}
}
