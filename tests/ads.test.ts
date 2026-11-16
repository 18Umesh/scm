import{test}from'node:test';
import assert from'node:assert/strict';
import{adRequest,campaignSchema,AdsService}from'../apps/ads-service/src/service';
import{PGlite}from'@electric-sql/pglite';
import{slotAllowed}from'../packages/ads';
import{SchoolAds}from'../packages/operations/ads';
import type{Database}from'../packages/db';
import type{Actor}from'../packages/operations/service';
test('ad payload accepts only context allowlist and blocks school or child data',()=>{const value={slotId:'parent_home_feed',appVersion:'0.2.0',language:'en',city:'Hyderabad',state:'Telangana'};assert.ok(adRequest.safeParse(value).success);for(const key of['schoolId','studentId','age','fees','marks','advertisingId','class','parentIncome'])assert.ok(!adRequest.safeParse({...value,[key]:'forbidden'}).success,key);});
test('every sensitive screen and student/accounts role denies ads',()=>{const routes=['login','attendance','leave','fees','payments','receipts','marks','reports','messages','health','homework','editing','feed','emergency','ai','payroll','transport'];for(const role of['parent','teacher','principal','hod','management','admin','accounts','student']as const)for(const route of routes)for(const slot of['parent_home_feed','teacher_home_card','management_home_card'])assert.equal(slotAllowed(role,route,slot),false,`${role}:${route}:${slot}`);for(const role of['student','accounts']as const)assert.equal(slotAllowed(role,'home','parent_home_feed'),false);assert.equal(slotAllowed('teacher','home','teacher_home_card',true),false);assert.equal(slotAllowed('parent','home','parent_home_feed'),true);});
test('feed and class directory slots are allowed only in their intended adult contexts',()=>{
 for(const role of ['parent','teacher','hod','principal','management','admin']as const)assert.equal(slotAllowed(role,'feed','school_feed_native'),true);
 assert.equal(slotAllowed('teacher','classes','teacher_classes_card'),true);assert.equal(slotAllowed('teacher','marks','teacher_classes_card'),false);assert.equal(slotAllowed('student','feed','school_feed_native'),false);assert.equal(slotAllowed('accounts','feed','school_feed_native'),false);assert.equal(slotAllowed('teacher','feed','school_feed_native',true),false);
});

test('campaigns cannot select banned categories or suggest school endorsement',()=>{const value={advertiser:'Fictional Books',headline:'Read together',body:'A fictional sponsor for testing',landingUrl:'https://example.invalid',category:'books',city:'',state:'',startsOn:'2026-11-01',endsOn:'2026-11-30',budgetPaise:'10000',pricePerThousandPaise:'100',schoolEndorsement:false};assert.ok(campaignSchema.safeParse(value).success);for(const category of['loans','gambling','political','crypto','alcohol'])assert.ok(!campaignSchema.safeParse({...value,category}).success);assert.ok(!campaignSchema.safeParse({...value,schoolEndorsement:true}).success);});
test('mock ad serving is local-only, respects role and route restrictions and makes no external requests',async()=>{
 const previous={demo:process.env.ADS_DEMO_MODE,enabled:process.env.ADS_ENABLED,node:process.env.NODE_ENV},fetch=globalThis.fetch;
 let requests=0;globalThis.fetch=async()=>{requests++;throw new Error('Unexpected external ad request');};
 try{
  process.env.ADS_DEMO_MODE='true';process.env.ADS_ENABLED='false';process.env.NODE_ENV='test';
  const ads=new SchoolAds({embedded:true}as Database),actor={role:'teacher'}as Actor;
  const input={slotId:'teacher_home_card',route:'home',language:'en',appVersion:'test'};
  const result=await ads.slot(actor,input);assert.ok(result.ad?.demo);assert.equal('examples'in result?result.examples?.length:0,3);
  assert.deepEqual(await ads.slot({...actor,role:'accounts'},input),{ad:null});assert.deepEqual(await ads.slot({...actor,role:'student'},input),{ad:null});
  assert.deepEqual(await ads.slot(actor,{...input,route:'calendar'}),{ad:null});
  assert.equal((await ads.metric(actor,{campaignId:result.ad!.id,slotId:input.slotId,event:'click'})).demo,true);
  process.env.NODE_ENV='production';assert.deepEqual(await ads.slot(actor,input),{ad:null});
  process.env.NODE_ENV='test';assert.deepEqual(await new SchoolAds({embedded:false}as Database).slot(actor,input),{ad:null});assert.equal(requests,0);
 }finally{
  globalThis.fetch=fetch;
  for(const [key,value]of Object.entries({ADS_DEMO_MODE:previous.demo,ADS_ENABLED:previous.enabled,NODE_ENV:previous.node})){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});
test('approved media campaigns retain their creative and count video events independently of impressions',async()=>{
 const db=new PGlite();try{
  await db.exec("CREATE TABLE campaigns(id text PRIMARY KEY,payload jsonb,status text DEFAULT 'pending',reviewer text,created_at timestamptz DEFAULT now());CREATE TABLE daily_ad_metrics(id text PRIMARY KEY,campaign_id text,slot_id text,city text,day date,impressions integer DEFAULT 0,clicks integer DEFAULT 0,video_starts integer DEFAULT 0,video_completions integer DEFAULT 0);");
  const service=new AdsService(db),media={type:'video',src:'https://school.example/ads/video.mp4',poster:'https://school.example/ads/poster.png',alt:'Activity kit demonstration'};
  const campaign={advertiser:'Fictional supplies',headline:'Create and discover',body:'An example activity kit.',landingUrl:'https://school.example/offer',category:'stationery',city:'',state:'',startsOn:'2020-01-01',endsOn:'2099-12-31',budgetPaise:'10000',pricePerThousandPaise:'100',schoolEndorsement:false,media};
  assert.equal(campaignSchema.safeParse({...campaign,media:{...media,src:'javascript:alert(1)'}}).success,false);
  const saved=await service.createCampaign(campaign);await service.review({id:saved.id,decision:'approved',reviewer:'Test reviewer',claimsChecked:true,noSchoolIdentity:true});
  const served=await service.serve({slotId:'school_feed_native',appVersion:'test',language:'en',city:'Hyderabad',state:'Telangana'});assert.deepEqual(served?.media,media);
  for(const event of['impression','click','video_start','video_complete'])await service.metric({campaignId:saved.id,slotId:'school_feed_native',city:'Hyderabad',event});
  const row=(await db.query<{impressions:number;clicks:number;video_starts:number;video_completions:number}>('SELECT impressions,clicks,video_starts,video_completions FROM daily_ad_metrics')).rows[0];assert.deepEqual(row,{impressions:1,clicks:1,video_starts:1,video_completions:1});
 }finally{await db.close();}
});
