import{adSlots,adEvents}from'../../../packages/ads';
import{PGlite}from'@electric-sql/pglite';
import{Pool}from'pg';
import{z}from'zod';
import{randomUUID,timingSafeEqual}from'node:crypto';
export const adRequest=z.object({slotId:z.enum(adSlots),appVersion:z.string().max(30),language:z.enum(['en','te','hi']),city:z.string().min(1).max(100),state:z.string().min(1).max(100)}).strict();
export const categories=['books','stationery','uniforms','educationalProducts','familyServices','familyEvents']as const;
export const campaignSchema=z.object({advertiser:z.string().min(2).max(100),headline:z.string().min(3).max(100),body:z.string().min(3).max(300),landingUrl:z.url().refine(v=>v.startsWith('https://')),category:z.enum(categories),city:z.string().max(100),state:z.string().max(100),startsOn:z.iso.date(),endsOn:z.iso.date(),budgetPaise:z.string().regex(/^\d{1,12}$/),pricePerThousandPaise:z.string().regex(/^\d{1,9}$/),schoolEndorsement:z.literal(false),media:z.object({type:z.enum(['image','video']),src:z.url().refine(v=>v.startsWith('https://')),alt:z.string().min(1).max(300),poster:z.url().refine(v=>v.startsWith('https://')).optional(),captions:z.url().refine(v=>v.startsWith('https://')).optional()}).strict().optional()}).strict();
type Db={query(sql:string,params?:any[]):Promise<{rows:any[]}>};
export class AdsService{
 private db:Db;
 constructor(db:Db){this.db=db;}
 static async create(){
  if(!process.env.ADS_DATABASE_URL&&process.env.NODE_ENV==='production')throw new Error('A separate Ads database is required');
  const db:Db=process.env.ADS_DATABASE_URL?new Pool({connectionString:process.env.ADS_DATABASE_URL}):new PGlite('.data/ads');
  const ddl=`CREATE TABLE IF NOT EXISTS campaigns(id text PRIMARY KEY,payload jsonb NOT NULL,status text NOT NULL DEFAULT 'pending',reviewer text,created_at timestamptz NOT NULL DEFAULT now());CREATE TABLE IF NOT EXISTS daily_ad_metrics(id text PRIMARY KEY,campaign_id text NOT NULL,slot_id text NOT NULL,city text NOT NULL,day date NOT NULL,impressions integer NOT NULL DEFAULT 0,clicks integer NOT NULL DEFAULT 0);ALTER TABLE daily_ad_metrics ADD COLUMN IF NOT EXISTS video_starts integer NOT NULL DEFAULT 0;ALTER TABLE daily_ad_metrics ADD COLUMN IF NOT EXISTS video_completions integer NOT NULL DEFAULT 0;CREATE TABLE IF NOT EXISTS ad_enquiries(id text PRIMARY KEY,payload jsonb NOT NULL,status text NOT NULL DEFAULT 'new',created_at timestamptz NOT NULL DEFAULT now());`;
  if(db instanceof PGlite)await db.exec(ddl);else await db.query(ddl);
  return new AdsService(db);
 }
 async createCampaign(input:unknown){const value=campaignSchema.parse(input);if(value.startsOn>value.endsOn)throw new Error('invalidDateRange');const campaignId=randomUUID();await this.db.query('INSERT INTO campaigns(id,payload) VALUES($1,$2)',[campaignId,JSON.stringify(value)]);return{id:campaignId,status:'pending'};}
 async review(input:unknown){const body=z.object({id:z.uuid(),decision:z.enum(['approved','rejected']),reviewer:z.string().min(2).max(100),claimsChecked:z.literal(true),noSchoolIdentity:z.literal(true)}).strict().parse(input);await this.db.query('UPDATE campaigns SET status=$1,reviewer=$2 WHERE id=$3 AND status=$4',[body.decision,body.reviewer,body.id,'pending']);return{ok:true};}
 async list(query:unknown){const page=z.object({page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(100).default(20)}).parse(query);return{data:(await this.db.query('SELECT id,payload,status,reviewer,created_at FROM campaigns ORDER BY created_at DESC LIMIT $1 OFFSET $2',[page.limit,(page.page-1)*page.limit])).rows,...page};}
 async serve(input:unknown){const request=adRequest.parse(input);const date=new Date().toISOString().slice(0,10);const rows=(await this.db.query("SELECT c.id,c.payload FROM campaigns c WHERE c.status='approved' AND c.payload->>'startsOn'<=$1 AND c.payload->>'endsOn'>=$1 AND (c.payload->>'city'='' OR c.payload->>'city'=$2) AND (c.payload->>'state'='' OR c.payload->>'state'=$3) ORDER BY c.created_at LIMIT 20",[date,request.city,request.state])).rows;
  for(const row of rows){const metrics=(await this.db.query('SELECT COALESCE(sum(impressions),0)::text n FROM daily_ad_metrics WHERE campaign_id=$1',[row.id])).rows[0];const cost=BigInt(metrics.n)*BigInt(row.payload.pricePerThousandPaise)/1000n;if(cost>=BigInt(row.payload.budgetPaise))continue;return{id:row.id,advertiser:row.payload.advertiser,headline:row.payload.headline,body:row.payload.body,landingUrl:row.payload.landingUrl,category:row.payload.category,media:row.payload.media,label:{en:'Sponsored',te:'ప్రాయోజితం',hi:'प्रायोजित'}[request.language]};}
  return null;
 }
 async metric(input:unknown){const body=z.object({campaignId:z.uuid(),slotId:adRequest.shape.slotId,city:z.string().max(100),event:z.enum(adEvents)}).strict().parse(input);if(body.event==='report')return{ok:true};
  const exists=(await this.db.query("SELECT id FROM campaigns WHERE id=$1 AND status='approved'",[body.campaignId])).rows[0];if(!exists)throw new Error('notFound');
  const day=new Date().toISOString().slice(0,10);const metricId=[body.campaignId,body.slotId,body.city,day].join(':');await this.db.query('INSERT INTO daily_ad_metrics(id,campaign_id,slot_id,city,day,impressions,clicks,video_starts,video_completions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET impressions=daily_ad_metrics.impressions+EXCLUDED.impressions,clicks=daily_ad_metrics.clicks+EXCLUDED.clicks,video_starts=daily_ad_metrics.video_starts+EXCLUDED.video_starts,video_completions=daily_ad_metrics.video_completions+EXCLUDED.video_completions',[metricId,body.campaignId,body.slotId,body.city,day,body.event==='impression'?1:0,body.event==='click'?1:0,body.event==='video_start'?1:0,body.event==='video_complete'?1:0]);return{ok:true};
 }
 async enquiry(input:unknown){const value=z.object({businessName:z.string().min(2).max(100),contactEmail:z.email(),city:z.string().min(1).max(100),message:z.string().min(3).max(1000),privacyAccepted:z.literal(true)}).strict().parse(input);const enquiryId=randomUUID();await this.db.query('INSERT INTO ad_enquiries(id,payload) VALUES($1,$2)',[enquiryId,JSON.stringify(value)]);return{id:enquiryId,status:'new'};}
}
export function adminTokenValid(value:string){const expected=process.env.ADS_ADMIN_TOKEN;if(!expected||value.length!==expected.length)return false;return timingSafeEqual(Buffer.from(value),Buffer.from(expected));}
