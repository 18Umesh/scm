import type { Request, Response } from 'express';
import { ZodError, z } from 'zod';
import type { Database, Queryable } from '../../../packages/db';
import { TenantResolver } from '../../../packages/tenancy';
import { allowed, permissions, type Permission } from '../../../packages/rbac';
import { id, token, digest, verifyPassword, verifyTotp, RateLimiter, hashPassword,readIdentitySecret } from '../../../packages/auth';
import { AiGateway, AiError, OpenRouterAdapter } from '../../../packages/ai';
import { loginInput, switchInput, pagination, aiInput, aiSettingsInput, themeInput, roles, type Role } from '../../../packages/validation';
import { safeAccent } from '../../../packages/theme';
import {readDesign,normalizeDesign} from '../../../packages/theme/design';
import {Operations,OperationError} from '../../../packages/operations/service';
import {Finance} from '../../../packages/operations/finance';
import {OperationsHttp} from './operations-http';
import{OtpService}from '../../../packages/auth/otp';
import{NETAJI}from '../../../packages/demo/netaji';

export class HttpError extends Error { constructor(public status: number,public code: string) { super(code); } }
type Tenant = { schoolId:string; host:string };
type Context = Tenant & { userId:string; membershipId:string; role:Role; sessionId:string; csrfHash:string; mfa:boolean };
const sensitiveRoles = new Set(['principal','management','accounts','hr','auditor']);
export const endpoints: { method: string; path: string; permission?: Permission }[] = [
  {method:'get',path:'/public/bootstrap'}, {method:'post',path:'/auth/login'},
  {method:'get',path:'/public/verify'},
  {method:'post',path:'/student/auth/login'},
  {method:'post',path:'/auth/otp/request'},{method:'post',path:'/auth/otp/verify'},
  {method:'get',path:'/auth/me'}, {method:'post',path:'/auth/logout'},
  {method:'post',path:'/auth/refresh'}, {method:'post',path:'/auth/context'},
  {method:'get',path:'/dashboard',permission:'dashboard.read'},
  {method:'get',path:'/memberships',permission:'memberships.read'},
  {method:'get',path:'/audit',permission:'audit.read'},
  {method:'get',path:'/settings',permission:'settings.read'},
  {method:'put',path:'/settings/ai',permission:'ai.configure'},
  {method:'put',path:'/settings/theme',permission:'settings.write'},
  {method:'get',path:'/ai/usage',permission:'ai.draft'},
  {method:'post',path:'/ai/drafts',permission:'ai.draft'}
];
export class CampusService {
  private localPasswordDemo(schoolId:string,userId:string){return this.db.embedded&&process.env.NODE_ENV!=='production'&&schoolId===NETAJI.schoolId&&NETAJI.accounts.some(a=>['accounts','principal'].includes(a.role)&&a.id===userId);}
  private requiresMfa(schoolId:string,userId:string,role:string){return sensitiveRoles.has(role)&&!this.localPasswordDemo(schoolId,userId);}
  private resolver: TenantResolver;
  private limiter = new RateLimiter();
  private ai: AiGateway;
  private operations: OperationsHttp;
  private finance: Finance;
  private otp:OtpService;
  private dummyPassword = hashPassword('unused-constant-timing-work');
  constructor(public db: Database) {
    this.otp=new OtpService(db);
    this.finance=new Finance(db);
    this.operations=new OperationsHttp(db,new Operations(db),this.finance);
    this.resolver = new TenantResolver(db);
    this.ai = new AiGateway(db,() => process.env.AI_ENABLED === 'true',process.env.OPENROUTER_API_KEY ? new OpenRouterAdapter(process.env.OPENROUTER_API_KEY) : undefined);
  }
  async handle(req: Request,res: Response) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Robots-Tag','noindex, nofollow');
    try {
      const path = req.path.replace(/^\/api/,'') || '/';
      if (path === '/health' && req.method === 'GET') { await this.db.publicQuery('SELECT 1'); return res.json({status:'ok'}); }
      if (path === '/openapi.json' && req.method === 'GET') return res.json(this.openapi());
      if(path==='/public/schools'&&req.method==='POST'){
        const host=(req.headers.host??'').toLowerCase().split(':')[0];if(!(process.env.PLATFORM_HOSTS??'localhost,127.0.0.1').split(',').includes(host))throw new HttpError(403,'originDenied');
        if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw new HttpError(403,'originDenied');if(!this.limiter.take('signup:'+req.socket.remoteAddress,5,3600000))throw new HttpError(429,'rateLimited');
        const data=z.object({name:z.string().min(3).max(150),shortName:z.string().min(2).max(40),city:z.string().min(2).max(100),state:z.string().min(2).max(100),slug:z.string().regex(/^[a-z][a-z0-9-]{2,40}$/),email:z.email().transform(v=>v.toLowerCase()),contactName:z.string().min(2).max(100),password:z.string().min(12).max(128),officialWebsite:z.url().refine(v=>v.startsWith('https://')),recognitionReference:z.string().min(3).max(100),dpaAccepted:z.literal(true),logoRightsConfirmed:z.literal(true)}).strict().parse(req.body);
        const schoolId=id();await this.db.publicQuery('SELECT register_school($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[schoolId,id(),data.email,data.contactName,hashPassword(data.password),data.name,data.shortName,data.city,data.state,data.slug+'.'+(process.env.SCHOOL_DOMAIN_SUFFIX??'campus.app'),JSON.stringify({officialWebsite:data.officialWebsite,recognitionReference:data.recognitionReference,dpaAccepted:true,dpaVersion:'draft-2026-11-05',logoRightsConfirmed:true,submittedAt:new Date().toISOString()})]);return res.status(201).json({schoolId,status:'pending_verification',host:data.slug+'.'+(process.env.SCHOOL_DOMAIN_SUFFIX??'campus.app')});
      }
      if(path==='/internal/tls-allowed'&&req.method==='GET'){const domain=z.string().max(253).parse(req.query.domain);const school=await this.resolver.resolve(domain);return res.status(school?200:403).json({allowed:!!school});}
      const endpoint = endpoints.find(e => e.path === path && e.method === req.method.toLowerCase())??(this.operations.matches(path,req.method)||path==='/payments/webhook'?{path,method:req.method.toLowerCase()}:undefined);
      if (!endpoint) throw new HttpError(404,'notFound');
      const tenant = await this.resolver.resolve(req.headers.host ?? '');
      if (!tenant) throw new HttpError(404,'schoolNotFound');
      if (req.headers.origin) {
        let origin: URL;
        try { origin = new URL(req.headers.origin); } catch { throw new HttpError(403,'originDenied'); }
        if (origin.host.toLowerCase() !== req.headers.host?.toLowerCase() || !['http:','https:'].includes(origin.protocol) || (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:')) throw new HttpError(403,'originDenied');
      }
      if (!['GET','HEAD'].includes(req.method) && req.headers['content-type']?.split(';')[0] !== 'application/json') throw new HttpError(415,'jsonRequired');
      if (path === '/public/bootstrap') return res.json(await this.bootstrap(tenant));
      if(path==='/public/verify'){
        const input=z.object({kind:z.enum(['receipt','certificate','reportCard']),id:z.uuid(),token:z.string().min(20).max(100)}).parse(req.query);
        const verified=await this.db.tenant(tenant.schoolId,undefined,async tx=>{
          const card=input.kind==='reportCard'?(await tx.query("SELECT id,payload->'snapshot'->>'approvedAt' AS approved_at FROM report_cards WHERE id=$1 AND payload->>'verificationToken'=$2 AND status='published' AND published=true",[input.id,input.token])).rows[0]:undefined;
          const record=input.kind==='reportCard'?card:input.kind==='receipt'?(await tx.query('SELECT id,number::text,financial_year,created_at FROM receipts WHERE id=$1 AND verification_token=$2',[input.id,input.token])).rows[0]:(await tx.query("SELECT id,payload->>'issuedOn' AS issued_on,payload->>'certificateType' AS certificate_type FROM certificates WHERE id=$1 AND payload->>'verificationToken'=$2 AND status='issued' AND published=true",[input.id,input.token])).rows[0];
          if(!record)throw new HttpError(404,'notFound');const school=(await tx.query('SELECT name FROM schools')).rows[0];return{valid:true,kind:input.kind,document:record,school:school.name};
        });return res.json(verified);
      }
      if (path === '/auth/login') return await this.login(req,res,tenant);
      if(path==='/student/auth/login')return await this.studentLogin(req,res,tenant);
      if(path==='/auth/otp/request'){
        const input=z.object({phone:z.string().regex(/^\+?[0-9]{10,15}$/)}).strict().parse(req.body);if(!this.limiter.take(`parent-otp:${tenant.host}:${input.phone}`,3,300000)||!this.limiter.take(`otp-ip:${req.socket.remoteAddress}`,20,300000))throw new HttpError(429,'rateLimited');return res.status(202).json(await this.otp.parent(tenant.schoolId,input.phone));
      }
      if(path==='/auth/otp/verify'){
        const input=z.object({challengeId:z.uuid(),code:z.string().regex(/^\d{6}$/)}).strict().parse(req.body);if(!this.limiter.take(`otp-verify:${input.challengeId}`,6,300000))throw new HttpError(429,'rateLimited');const result=await this.otp.verify(tenant.schoolId,input.challengeId,input.code,'parent');if(!result)throw new HttpError(401,'invalidOtp');
        const values=await this.db.tenant(tenant.schoolId,result.userId,async tx=>{const membership=(await tx.query("SELECT id FROM memberships WHERE user_id=$1 AND role='parent' AND active=true",[result.userId])).rows[0];if(!membership)throw new HttpError(403,'forbidden');return this.createSession(tx,tenant,result.userId,membership.id,false,new Date(Date.now()+30*86400000).toISOString());});this.cookies(res,values);return res.json({ok:true,csrfToken:values.csrf});
      }
      if(path==='/payments/webhook'&&req.method==='POST')return res.json(await this.finance.webhook(tenant.schoolId,(req as Request & {rawBody:Buffer}).rawBody,String(req.headers['x-razorpay-signature']??''),String(req.headers['x-razorpay-event-id']??'')));
      const ctx = await this.authenticate(req,tenant,path === '/auth/refresh');
      if (req.method !== 'GET' && digest(String(req.headers['x-csrf-token'] ?? '')) !== ctx.csrfHash) throw new HttpError(403,'csrfFailed');
      if (endpoint.permission && !allowed(ctx.role,endpoint.permission)) {
        await this.audit(ctx,'permission.denied',path); throw new HttpError(403,'forbidden');
      }
      if(this.operations.matches(path,req.method))return await this.operations.handle(ctx,path,req,res);
      if (path === '/auth/me') return res.json(await this.me(ctx));
      if (path === '/auth/logout') {
        await this.db.tenant(ctx.schoolId,ctx.userId,tx => tx.query('UPDATE sessions SET revoked_at=now(),version=version+1 WHERE id=$1',[ctx.sessionId]));
        this.clearCookies(res); return res.json({ok:true});
      }
      if (path === '/auth/refresh') {
        const values = await this.db.tenant(ctx.schoolId,ctx.userId,async tx => {
          const active = (await tx.query('SELECT * FROM sessions WHERE id=$1 AND revoked_at IS NULL FOR UPDATE',[ctx.sessionId])).rows[0];
          if (!active) throw new HttpError(401,'signInRequired');
          await tx.query('UPDATE sessions SET revoked_at=now(),version=version+1 WHERE id=$1',[ctx.sessionId]);
          return this.createSession(tx,ctx,ctx.userId,ctx.membershipId,ctx.mfa,active.refresh_expires_at);
        });
        this.cookies(res,values); return res.json({ok:true,csrfToken:values.csrf});
      }
      if (path === '/auth/context') {
        const input = switchInput.parse(req.body);
        const values = await this.db.tenant(ctx.schoolId,ctx.userId,async tx => {
          const membership = (await tx.query('SELECT * FROM memberships WHERE id=$1 AND user_id=$2 AND active=true',[input.membershipId,ctx.userId])).rows[0];
          if (!membership) throw new HttpError(403,'forbidden');
          if (this.requiresMfa(ctx.schoolId,ctx.userId,membership.role) && !ctx.mfa) throw new HttpError(403,'mfaRequired');
          await tx.query('UPDATE sessions SET revoked_at=now(),version=version+1 WHERE id=$1',[ctx.sessionId]);
          await this.writeAudit(tx,ctx,'context.switched','memberships',membership.id);
          return this.createSession(tx,ctx,ctx.userId,membership.id,ctx.mfa);
        });
        this.cookies(res,values); return res.json({ok:true,csrfToken:values.csrf});
      }
      if (path === '/dashboard') return res.json(await this.db.tenant(ctx.schoolId,ctx.userId,async tx => {
        const counts = (await tx.query("SELECT count(*)::int AS memberships,count(DISTINCT user_id)::int AS people FROM memberships WHERE active=true")).rows[0];
        const audit = (await tx.query('SELECT count(*)::int AS total FROM audit_logs')).rows[0];
        const settings = (await tx.query('SELECT student_enabled,ai_enabled FROM school_settings')).rows[0];
        return {phase:0,counts:allowed(ctx.role,'memberships.read') ? counts : null,auditEvents:allowed(ctx.role,'audit.read') ? audit.total : null,studentEnabled:settings.student_enabled,aiEnabled:settings.ai_enabled && process.env.AI_ENABLED === 'true',asOf:new Date().toISOString()};
      }));
      if (path === '/memberships') {
        const {page,limit} = pagination.parse(req.query);
        const role=z.enum(roles).optional().parse(req.query.role);
        return res.json(await this.db.tenant(ctx.schoolId,ctx.userId,async tx => {
          await this.writeAudit(tx,ctx,'sensitive.read','memberships');
          const data = (await tx.query('SELECT m.id,m.role,m.scope,m.active,m.created_at,u.display_name FROM memberships m JOIN users u ON u.id=m.user_id WHERE ($3::text IS NULL OR m.role=$3) ORDER BY m.created_at,m.id LIMIT $1 OFFSET $2',[limit,(page-1)*limit,role ?? null])).rows;
          const total = (await tx.query('SELECT count(*)::int AS n FROM memberships WHERE ($1::text IS NULL OR role=$1)',[role ?? null])).rows[0].n;
          return {data,page,limit,total};
        }));
      }
      if (path === '/audit') {
        const {page,limit} = pagination.parse(req.query);
        return res.json(await this.db.tenant(ctx.schoolId,ctx.userId,async tx => {
          await this.writeAudit(tx,ctx,'sensitive.read','audit_logs');
          const data = (await tx.query('SELECT id,action,resource,resource_id,created_at,actor_id FROM audit_logs ORDER BY created_at DESC,id DESC LIMIT $1 OFFSET $2',[limit,(page-1)*limit])).rows;
          const total = (await tx.query('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n;
          return {data,page,limit,total};
        }));
      }
      if (path === '/settings') return res.json(await this.db.tenant(ctx.schoolId,ctx.userId,async tx => {
        const settings = (await tx.query('SELECT ai_enabled,ai_monthly_cap_paise::text,student_enabled,version FROM school_settings')).rows[0];
        return {...settings,globalAiEnabled:process.env.AI_ENABLED === 'true',providerReady:false};
      }));
      if (path === '/settings/ai') {
        const input = aiSettingsInput.parse(req.body);
        const result = await this.db.tenant(ctx.schoolId,ctx.userId,tx => tx.query('UPDATE school_settings SET ai_enabled=$1,ai_monthly_cap_paise=$2,version=version+1,updated_at=now() WHERE version=$3 RETURNING version',[input.enabled,input.monthlyCapPaise,input.version]));
        if (!result.rows.length) throw new HttpError(409,'versionConflict');
        return res.json({ok:true,version:result.rows[0].version});
      }
      if (path === '/settings/theme') {
        const input = themeInput.parse(req.body);
        const result = await this.db.tenant(ctx.schoolId,ctx.userId,async tx => {
          await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[ctx.schoolId]);
          const school = (await tx.query('SELECT verified FROM schools FOR UPDATE')).rows[0];
          if (!school.verified) throw new HttpError(403,'schoolNotVerified');
          const current = (await tx.query('SELECT max(version)::int AS n FROM school_branding')).rows[0].n;
          if (current !== input.version) throw new HttpError(409,'versionConflict');
          const previous=(await tx.query('SELECT config FROM school_branding ORDER BY version DESC LIMIT 1')).rows[0]?.config??{};const existingDesign=readDesign(previous.design);const design=existingDesign?normalizeDesign({...existingDesign,primary:input.accent}):null;const accent=design?.primary??safeAccent(input.accent);
          await tx.query('INSERT INTO school_branding(id,school_id,accent,version,created_by,config) VALUES($1,$2,$3,$4,$5,$6)',[id(),ctx.schoolId,accent,current+1,ctx.userId,JSON.stringify({...previous,...(design?{design}:{})})]);
          return {accent,version:current+1};
        });
        return res.json(result);
      }
      if (path === '/ai/usage') {
        const {page,limit} = pagination.parse(req.query);
        return res.json(await this.db.tenant(ctx.schoolId,ctx.userId,async tx => {
          await this.writeAudit(tx,ctx,'sensitive.read','ai_requests');
          const privileged = allowed(ctx.role,'ai.configure');
          const filter = privileged ? '' : 'WHERE user_id=$3';
          const params = privileged ? [limit,(page-1)*limit] : [limit,(page-1)*limit,ctx.userId];
          const data = (await tx.query(`SELECT id,task,status,cost_paise::text,created_at FROM ai_requests ${filter} ORDER BY created_at DESC,id LIMIT $1 OFFSET $2`,params)).rows;
          const total = (await tx.query(`SELECT count(*)::int AS n FROM ai_requests ${privileged ? '' : 'WHERE user_id=$1'}`,privileged ? [] : [ctx.userId])).rows[0].n;
          return {data,page,limit,total};
        }));
      }
      if (path === '/ai/drafts') {
        if (!this.limiter.take(`ai:${ctx.schoolId}:${ctx.userId}`,10)) throw new HttpError(429,'rateLimited');
        const result = await this.ai.request(ctx.schoolId,ctx.userId,ctx.role,aiInput.parse(req.body));
        return res.status(result.ok ? 200 : 422).json(result);
      }
      throw new HttpError(404,'notFound');
    } catch(error) {
      if(error instanceof OperationError)return res.status(error.status).json({code:error.code});
      if(error instanceof Error&&['unbalancedJournal','periodLocked','notFound','messagingNotConfigured','messagingUnavailable','encryptionNotConfigured'].includes(error.message))return res.status(409).json({code:error.message});
      if(error&&typeof error==='object'&&'code' in error&&error.code==='23505')return res.status(409).json({code:'duplicateRecord'});
      if (error instanceof HttpError) return res.status(error.status).json({code:error.code});
      if (error instanceof ZodError) return res.status(400).json({code:'invalidInput',fields:error.issues.map(i => i.path.join('.'))});
      if (error instanceof AiError) return res.status(403).json({code:error.code});
      // Deliberately exclude request bodies, SQL parameters, tokens and personal data.
      console.error(JSON.stringify({event:'request.failed',type:error instanceof Error ? error.name : 'unknown'}));
      return res.status(500).json({code:'serverError'});
    }
  }
  private async bootstrap(tenant: Tenant) {
    return this.db.tenant(tenant.schoolId,undefined,async tx => {
      const school = (await tx.query('SELECT id,name,short_name,city,state,verified FROM schools')).rows[0];
      const theme = (await tx.query('SELECT accent,version,config FROM school_branding WHERE published=true ORDER BY version DESC LIMIT 1')).rows[0];
      return {school,theme,demo:this.db.embedded,passwordOnlyDemoEmails:NETAJI.accounts.filter(a=>this.localPasswordDemo(tenant.schoolId,a.id)).map(a=>a.email),studentEnabled:false};
    });
  }
  private async login(req: Request,res: Response,tenant: Tenant) {
    const input = loginInput.parse(req.body);
    if (!this.limiter.take(`login-ip:${req.socket.remoteAddress}:${tenant.host}`,15) || !this.limiter.take(`login-user:${tenant.host}:${input.email}`,8)) throw new HttpError(429,'rateLimited');
    const user = (await this.db.publicQuery('SELECT * FROM users WHERE email=$1',[input.email])).rows[0];
    const valid = verifyPassword(input.password,user?.password_hash ?? this.dummyPassword);
    if (!user || !valid) { await this.db.tenant(tenant.schoolId,undefined,tx => this.writeAudit(tx,tenant,'auth.failed','sessions')); throw new HttpError(401,'invalidCredentials'); }
    let otpVerified=false;
    if(input.loginChallengeId){const proof=await this.otp.verify(tenant.schoolId,input.loginChallengeId,input.code??'','staff',user.id);if(!proof)throw new HttpError(401,'invalidOtp');otpVerified=true;}
    const deviceRaw=(req.headers.cookie??'').split(';').map(v=>v.trim()).find(v=>v.startsWith('campus_device='))?.slice('campus_device='.length);
    const device=await this.db.tenant(tenant.schoolId,user.id,async tx=>deviceRaw?(await tx.query('SELECT id FROM auth_devices WHERE user_id=$1 AND device_hash=$2 AND host=$3 AND expires_at>now()',[user.id,digest(deviceRaw),tenant.host])).rows[0]:null);
    const requireDevice=(process.env.NODE_ENV==='production'||process.env.REQUIRE_DEVICE_OTP==='true')&&!device;
    const values = await this.db.tenant(tenant.schoolId,user.id,async tx => {
      const memberships = (await tx.query("SELECT * FROM memberships WHERE user_id=$1 AND active=true AND role<>'student' ORDER BY CASE WHEN role='parent' THEN 1 ELSE 0 END,id",[user.id])).rows;
      if (!memberships.length) throw new HttpError(401,'invalidCredentials');
      if (process.env.NODE_ENV==='production' && memberships.every(m=>m.role==='parent')) throw new HttpError(403,'forbidden');
      if(memberships.some(m=>['platformSuperAdmin','supportAgent','adReviewer'].includes(m.role)))throw new HttpError(403,'platformSsoRequired');
      const mfa = !this.localPasswordDemo(tenant.schoolId,user.id) && !!user.totp_secret && !!input.code && verifyTotp(readIdentitySecret(user.totp_secret),input.code);
      if (memberships.some(m => this.requiresMfa(tenant.schoolId,user.id,m.role)) && !mfa) throw new HttpError(401,'mfaRequired');
      if(requireDevice&&!mfa&&!otpVerified&&!this.localPasswordDemo(tenant.schoolId,user.id))return{needsOtp:true as const};
      // Prevent reuse of a valid TOTP within its 30-second window on this instance.
      if (mfa && !this.limiter.take(`totp:${user.id}:${input.code}`,1,90000)) throw new HttpError(401,'mfaRequired');
      await this.writeAudit(tx,{...tenant,userId:user.id},'auth.signed_in','sessions');
      const deviceToken=token();await tx.query("INSERT INTO auth_devices(id,school_id,user_id,device_hash,host,expires_at,created_by) VALUES($1,$2,$3,$4,$5,now()+interval '30 days',$3)",[id(),tenant.schoolId,user.id,digest(deviceToken),tenant.host]);
      return{...await this.createSession(tx,tenant,user.id,memberships[0].id,mfa),deviceToken};
    });
    if('needsOtp'in values){const challenge=await this.otp.staff(tenant.schoolId,user.id,user.email);return res.json({requiresOtp:true,...challenge});}
    res.cookie('campus_device',values.deviceToken,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:30*86400000});
    this.cookies(res,values); return res.json({ok:true,csrfToken:values.csrf});
  }
  private async studentLogin(req:Request,res:Response,tenant:Tenant){
    const input=z.object({username:z.string().regex(/^[a-zA-Z0-9._-]{3,40}$/),pin:z.string().regex(/^\d{6,10}$/)}).strict().parse(req.body);
    if(!this.limiter.take(`student:${tenant.host}:${input.username}`,8))throw new HttpError(429,'rateLimited');
    const user=(await this.db.publicQuery('SELECT * FROM users WHERE email=$1',[input.username.toLowerCase()+'@'+tenant.schoolId+'.student.local'])).rows[0];
    if(!verifyPassword(input.pin,user?.password_hash??this.dummyPassword)||!user)throw new HttpError(401,'invalidCredentials');
    const values=await this.db.tenant(tenant.schoolId,user.id,async tx=>{
      const membership=(await tx.query("SELECT m.id FROM memberships m JOIN students s ON s.owner_id=m.user_id AND s.school_id=m.school_id JOIN classes c ON c.id=s.class_id AND c.school_id=m.school_id WHERE m.user_id=$1 AND m.role='student' AND m.active=true AND s.deleted_at IS NULL AND s.status='active' AND c.payload->>'studentLoginEnabled'='true'",[user.id])).rows[0];if(!membership)throw new HttpError(403,'studentLoginDisabled');
      return this.createSession(tx,tenant,user.id,membership.id,false);
    });this.cookies(res,values);return res.json({ok:true,csrfToken:values.csrf});
  }
  private async authenticate(req: Request,tenant: Tenant,refresh: boolean): Promise<Context> {
    const cookies = Object.fromEntries((req.headers.cookie ?? '').split(';').map(p => p.trim().split('=')).filter(p => p.length===2));
    const raw = cookies[this.cookieName()]; if (!raw || raw.length > 100) throw new HttpError(401,'signInRequired');
    return this.db.tenant(tenant.schoolId,undefined,async tx => {
      const session = (await tx.query(`SELECT s.*,m.role,m.active,m.scope AS membership_scope FROM sessions s JOIN memberships m ON m.id=s.membership_id AND m.school_id=s.school_id AND m.user_id=s.user_id WHERE s.token_hash=$1 AND s.host=$2 AND s.revoked_at IS NULL AND ${refresh ? 's.refresh_expires_at' : 's.expires_at'} > now()`,[digest(raw),tenant.host])).rows[0];
      if (!session || !session.active || (this.requiresMfa(tenant.schoolId,session.user_id,session.role) && !session.mfa_verified)) throw new HttpError(401,'signInRequired');
      if(session.role==='auditor'&&(!session.membership_scope.expiresAt||new Date(session.membership_scope.expiresAt).getTime()<=Date.now()))throw new HttpError(403,'forbidden');
      if(session.role==='student'&&!(await tx.query("SELECT s.id FROM students s JOIN classes c ON c.id=s.class_id WHERE s.owner_id=$1 AND s.deleted_at IS NULL AND s.status='active' AND c.payload->>'studentLoginEnabled'='true'",[session.user_id])).rows.length)throw new HttpError(403,'studentLoginDisabled');
      return {...tenant,userId:session.user_id,membershipId:session.membership_id,role:session.role,sessionId:session.id,csrfHash:session.csrf_hash,mfa:session.mfa_verified};
    });
  }
  private async me(ctx: Context) {
    return this.db.tenant(ctx.schoolId,ctx.userId,async tx => {
      await this.writeAudit(tx,ctx,'sensitive.read','users',ctx.userId);
      const user = (await tx.query('SELECT display_name FROM users WHERE id=$1',[ctx.userId])).rows[0];
      const memberships = (await tx.query("SELECT id,role,scope FROM memberships WHERE user_id=$1 AND active=true AND role<>'student' ORDER BY role",[ctx.userId])).rows;
      const school = (await tx.query('SELECT id,name,short_name,city,state,verified FROM schools')).rows[0];
      const theme = (await tx.query('SELECT accent,version,config FROM school_branding WHERE published=true ORDER BY version DESC LIMIT 1')).rows[0];
      const layout=(await tx.query("SELECT payload FROM school_layouts WHERE payload->>'role'=$1 AND published=true ORDER BY created_at DESC LIMIT 1",[ctx.role])).rows[0]?.payload;
      return {user:{id:ctx.userId,displayName:user.display_name},membershipId:ctx.membershipId,role:ctx.role,permissions:permissions(ctx.role),memberships,school,theme,layout,demo:this.db.embedded};
    });
  }
  private async createSession(tx: Queryable,tenant: Tenant,userId: string,membershipId: string,mfa: boolean,refreshExpires?: string) {
    const sessionToken = token(); const csrf = token();
    await tx.query("INSERT INTO sessions(id,school_id,user_id,membership_id,token_hash,csrf_hash,host,mfa_verified,expires_at,refresh_expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '15 minutes',COALESCE($9::timestamptz,now()+interval '8 hours'),$3)",[id(),tenant.schoolId,userId,membershipId,digest(sessionToken),digest(csrf),tenant.host,mfa,refreshExpires ?? null]);
    return {sessionToken,csrf,maxAgeMs:refreshExpires?Math.max(0,new Date(refreshExpires).getTime()-Date.now()):8*3600000};
  }
  private cookieName() { return process.env.NODE_ENV === 'production' ? '__Host-campus_session' : 'campus_session'; }
  private cookies(res: Response,values: {sessionToken:string;csrf:string;maxAgeMs?:number}) {
    const config = {secure:process.env.NODE_ENV==='production',sameSite:'strict' as const,path:'/',maxAge:values.maxAgeMs??8*3600000};
    res.cookie(this.cookieName(),values.sessionToken,{...config,httpOnly:true});
    res.cookie('campus_csrf',values.csrf,{...config,httpOnly:false});
  }
  private clearCookies(res: Response) { for (const name of [this.cookieName(),'campus_csrf']) res.clearCookie(name,{path:'/',secure:process.env.NODE_ENV==='production',sameSite:'strict'}); }
  private async audit(ctx: Context,action: string,resource: string) { await this.db.tenant(ctx.schoolId,ctx.userId,tx => this.writeAudit(tx,ctx,action,resource)); }
  private async writeAudit(tx: Queryable,ctx: Tenant & {userId?:string},action: string,resource: string,resourceId?: string) {
    await tx.query('INSERT INTO audit_logs(id,school_id,actor_id,action,resource,resource_id) VALUES($1,$2,$3,$4,$5,$6)',[id(),ctx.schoolId,ctx.userId ?? null,action,resource,resourceId ?? null]);
  }
  openapi() {
    const paths: Record<string,any> = {};
    const bodies:Record<string,z.ZodType>={'/auth/login':loginInput,'/auth/context':switchInput,'/settings/ai':aiSettingsInput,'/settings/theme':themeInput,'/ai/drafts':aiInput};
    for (const e of endpoints) {
      paths[`/api${e.path}`] ??= {};
      paths[`/api${e.path}`][e.method] = {summary:e.path,security:e.path.startsWith('/public') || e.path==='/auth/login' ? [] : [{session:[]}], 'x-permission':e.permission, responses:{'200':{description:'Success'},'400':{description:'Invalid input'},'401':{description:'Sign in required'},'403':{description:'Permission denied'}}};
      const operation=paths[`/api${e.path}`][e.method];
      operation.parameters=[];
      if(bodies[e.path])operation.requestBody={required:true,content:{'application/json':{schema:z.toJSONSchema(bodies[e.path],{io:'input'})}}};
      if(e.method!=='get'&&e.path!=='/auth/login')operation.parameters.push({in:'header',name:'X-CSRF-Token',required:true,schema:{type:'string'},description:'Readable campus_csrf cookie value; server verifies stored hash.'});
      if(['/memberships','/audit','/ai/usage'].includes(e.path))operation.parameters.push({in:'query',name:'page',schema:{type:'integer',minimum:1,default:1}},{in:'query',name:'limit',schema:{type:'integer',minimum:1,maximum:100,default:20}});
      if(e.path==='/memberships')operation.parameters.push({in:'query',name:'role',schema:{type:'string',enum:roles}});
    }
    return {openapi:'3.1.0',info:{title:'Campus school API',version:'0.2.0'},paths:{...paths,...this.operations.openapi()},components:{securitySchemes:{session:{type:'apiKey',in:'cookie',name:this.cookieName()}}}};
  }
}
