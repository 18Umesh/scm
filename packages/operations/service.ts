import { z } from 'zod';
import type { Database, Queryable, Row } from '../db';
import { id, token,hashPassword,protectIdentitySecret,readIdentitySecret } from '../auth';
import {roles,type Role} from '../validation';
import { pagination } from '../validation';
import { definitions, moduleAccess, type Definition, type Audience, type Area } from './registry';
import { createCipheriv, createDecipheriv, createHash, randomBytes,timingSafeEqual } from 'node:crypto';
import {postByCodes}from '../ledger';
import{buildReportCard}from './report-cards';
import{marksOpen}from './exam-progress';
import{teachingSubjectsSql,teachingSubjects,classTeacherSql}from './teaching-subjects';
export type Actor={schoolId:string;userId:string;role:Role;membershipId:string};
export class OperationError extends Error{constructor(public status:number,public code:string){super(code);}}
export type RecordRow=Row & {id:string;school_id:string;owner_id:string|null;class_id:string|null;student_id:string|null;staff_id:string|null;status:string;payload:Record<string,any>;audience:Audience|null;published:boolean;version:number;created_at:string|Date};
const parentModules=new Set(['consentNotices','ptmSlots','timetable','students','guardians','attendance','studentLeave','homework','submissions','feed','calendar','messages','notifications','exams','marks','certificates','invoices','ptm','grievances','consents','dataRequests','pickup','gatePasses','safety','achievements','surveys','albums','supplies','holidays','notificationPreferences','reportCards']);
const parentCreates=new Set(['studentLeave','submissions','messages','ptm','grievances','consents','dataRequests','safety','notificationPreferences','pickup','gatePasses','certificates']);
const staffOwnCreates=new Set(['leave','staffAttendance','messages','grievances','dataRequests','safety','training','purchases','notificationPreferences']);
const communications=new Set(['consentNotices','feed','calendar','surveys','albums','supplies','holidays']);
const financial=new Set(['feeHeads','feePlans','invoices','concessions','refunds','cashier','vendors','budgets','purchases','bills','payroll','payslips','bankStatements','taxSettings','periodLocks']);
const dateRange=(start:string,end:string)=>{const days:string[]=[];for(let d=new Date(start+'T00:00:00Z');d<=new Date(end+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1)){if(days.length>=366)throw new OperationError(400,'invalidInput');days.push(d.toISOString().slice(0,10));}return days;};
function encryptionKey(schoolId:string){const secret=process.env.FIELD_ENCRYPTION_KEY??(process.env.NODE_ENV==='production'?'':'fictional-local-development-key');if(!secret)throw new OperationError(503,'encryptionNotConfigured');return createHash('sha256').update(secret+':'+schoolId).digest();}
function encrypt(value:string,schoolId:string){const nonce=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',encryptionKey(schoolId),nonce);const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return `enc:${nonce.toString('base64url')}:${ciphertext.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}`;}
function decrypt(value:string,schoolId:string){if(!value.startsWith('enc:'))return value;const [,nonce,ciphertext,tag]=value.split(':');const cipher=createDecipheriv('aes-256-gcm',encryptionKey(schoolId),Buffer.from(nonce,'base64url'));cipher.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([cipher.update(Buffer.from(ciphertext,'base64url')),cipher.final()]).toString('utf8');}
export class Operations {
  constructor(private db:Database,private features:{messagingEnabled?:boolean}={}){}
  moduleEnabled(key:string){return key!=='messages'||this.features.messagingEnabled===true;}
  definition(key:string):Definition{if(!this.moduleEnabled(key)||!Object.hasOwn(definitions,key))throw new OperationError(404,'notFound');return definitions[key];}
  async catalog(ctx:Actor){
    return Object.entries(definitions).filter(([key,d])=>this.canRead(ctx,key,d.area)).map(([key,d])=>({key,area:d.area,fields:d.fields,access:moduleAccess(ctx.role,key),canCreate:this.canCreate(ctx,key,d),actions:d.actions??[]}));
  }
  async today(ctx:Actor){
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const keys=['students','timetable','attendance','staffAttendance','leave','cover','homework','feed','calendar','notifications'];
    const values:Record<string,any>={};for(const key of keys)if(this.canRead(ctx,key,this.definition(key).area))values[key]=await this.list(ctx,key,{limit:['feed','calendar','notifications'].includes(key)?5:100});
    const weekday=new Date(day+'T00:00:00Z').getUTCDay();
    const ownStaff=await this.db.tenant(ctx.schoolId,ctx.userId,async tx=>(await tx.query('SELECT id FROM staff WHERE owner_id=$1 AND deleted_at IS NULL',[ctx.userId])).rows[0]?.id);
    let periods=(values.timetable?.data??[]).filter((r:RecordRow)=>r.published&&r.payload.weekday===weekday&&(!ownStaff||r.staff_id===ownStaff));
    const coverToday=(values.cover?.data??[]).filter((r:RecordRow)=>r.payload.date===day&&r.staff_id);
    if(ownStaff){periods=periods.filter((p:RecordRow)=>!coverToday.some((c:RecordRow)=>c.payload.timetableId===p.id&&c.staff_id!==ownStaff));for(const cover of coverToday.filter((c:RecordRow)=>c.staff_id===ownStaff)){const source=(values.timetable?.data??[]).find((p:RecordRow)=>p.id===cover.payload.timetableId);if(source&&!periods.some((p:RecordRow)=>p.id===source.id))periods.push({...source,id:cover.id,staff_id:ownStaff,payload:{...source.payload,isCover:true}});}}
    periods.sort((a:RecordRow,b:RecordRow)=>a.payload.startTime.localeCompare(b.payload.startTime));
    const attendance=(values.attendance?.data??[]).filter((r:RecordRow)=>r.payload.date===day);
    const classNames=await this.lookup(ctx,'classes').catch(()=>({data:[]}));const subjectNames=await this.lookup(ctx,'subjects').catch(()=>({data:[]}));
    return{date:day,studentCount:values.students?.total??null,attendance,periods,homework:values.homework?.data??[],feed:values.feed?.data??[],events:values.calendar?.data??[],notifications:values.notifications?.data??[],leave:values.leave?.data??[],cover:values.cover?.data??[],classes:classNames.data,subjects:subjectNames.data};
  }
  async lookup(ctx:Actor,key:string){
    if(key==='recipients'&&!this.moduleEnabled('messages'))throw new OperationError(404,'notFound');
    if(key==='recipients'&&ctx.role!=='parent')return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{const scope=await this.scope(tx,ctx);return{data:(await tx.query("SELECT DISTINCT m.user_id id,u.display_name label FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.active=true AND m.user_id<>$1 AND (m.role IN ('principal','admin') OR (m.role='parent' AND ($2::boolean OR m.user_id IN (SELECT owner_id FROM guardians WHERE class_id=ANY($3::uuid[]) AND deleted_at IS NULL AND payload->>'canView'='true')))) LIMIT 100",[ctx.userId,['principal','admin'].includes(ctx.role),scope.classes])).rows};});
    if(key==='students'&&['nurse','counsellor','librarian','hostelWarden','security'].includes(ctx.role))return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
      await this.audit(tx,ctx,'sensitive.read','studentDirectory');return{data:(await tx.query("SELECT id,payload->>'name' AS label FROM students WHERE deleted_at IS NULL ORDER BY payload->>'name' LIMIT 100")).rows};
    });
    if(key==='staff'&&ctx.role==='security')return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>({data:(await tx.query("SELECT id,payload->>'name' AS label FROM staff WHERE deleted_at IS NULL ORDER BY payload->>'name' LIMIT 100")).rows}));
    if(key==='recipients'&&ctx.role==='parent')return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{const scope=await this.scope(tx,ctx);return{data:(await tx.query("SELECT DISTINCT m.user_id AS id,u.display_name AS label FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.active=true AND (m.role IN ('principal','admin') OR m.user_id IN (SELECT s.owner_id FROM staff s WHERE s.id IN (SELECT staff_id FROM timetable_entries WHERE class_id=ANY($1::uuid[]) AND published=true) OR s.id IN (SELECT (payload->>'classTeacherId')::uuid FROM classes WHERE id=ANY($1::uuid[])))) LIMIT 100",[scope.studentClasses])).rows};});
    const d=this.definition(key);
    if(this.canRead(ctx,key,d.area)){const result=await this.list(ctx,key,{page:1,limit:100});return{data:result.data.map(row=>({id:row.id,label:row.payload.name??row.payload.title??row.payload.description??row.id,payload:key==='students'?{classId:row.class_id}:undefined})),total:result.total};}
    const safe=['classes','subjects','academicYears','terms','departments','vendors'];
    if(safe.includes(key)&&!['student','platformSuperAdmin','supportAgent','adReviewer'].includes(ctx.role)&&(ctx.role!=='parent'||['classes','subjects'].includes(key)))return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
      const scope=await this.scope(tx,ctx);const constrained=key==='classes'&&['parent','teacher','hod','incharge'].includes(ctx.role);const filter=constrained?' AND id=ANY($1::uuid[])':'';
      return{data:(await tx.query(`SELECT id,${key==='classes'?"concat_ws(' ',payload->>'name',payload->>'section')":"payload->>'name'"} AS label FROM ${d.table} WHERE deleted_at IS NULL${filter} ORDER BY payload->>'name' LIMIT 100`,filter?[ctx.role==='parent'?scope.studentClasses:scope.classes]:[])).rows};
    });
    if(key==='staff'&&ctx.role==='parent')return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
      const scope=await this.scope(tx,ctx);return{data:(await tx.query("SELECT DISTINCT s.id,s.payload->>'name' AS label FROM staff s WHERE s.deleted_at IS NULL AND (s.id IN (SELECT staff_id FROM timetable_entries WHERE class_id=ANY($1::uuid[]) AND published=true) OR s.id IN (SELECT (payload->>'classTeacherId')::uuid FROM classes WHERE id=ANY($1::uuid[]))) LIMIT 100",[scope.studentClasses])).rows};
    });
    throw new OperationError(403,'forbidden');
  }
  canRead(ctx:Actor,key:string,_area:Area){return this.moduleEnabled(key)&&moduleAccess(ctx.role,key)!=='none'&&(ctx.role!=='parent'||parentModules.has(key))&&(ctx.role!=='student'||!!definitions[key].student);}
  canCreate(ctx:Actor,key:string,d:Definition){
    if(ctx.role==='student')return false;
    if(!this.canRead(ctx,key,d.area)||['notifications'].includes(key))return false;
    if(ctx.role==='parent')return parentCreates.has(key);
    if(ctx.role==='incharge'&&!['syllabus','cover','leave','feed','notificationPreferences'].includes(key))return false;
    if(key==='leave')return true;if(key==='syllabus')return ['hod','incharge','principal','admin'].includes(ctx.role);
    if(['students','guardians'].includes(key)&&!['principal','admin'].includes(ctx.role))return false;
    const mode=moduleAccess(ctx.role,key);
    if(mode==='full'||mode==='scope')return true;
    if(staffOwnCreates.has(key)&&mode==='own')return true;
    return ctx.role==='principal'&&['exams','certificates','studentLeave','cover','budgets'].includes(key);
  }
  private async scope(tx:Queryable,ctx:Actor){
    const m=(await tx.query('SELECT scope FROM memberships WHERE id=$1 AND user_id=$2 AND active=true',[ctx.membershipId,ctx.userId])).rows[0];if(!m)throw new OperationError(403,'forbidden');
    const classes=(m.scope.classes??[]).filter((v:unknown)=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v));
    const staff=(await tx.query("SELECT id,payload FROM staff WHERE owner_id=$1 AND deleted_at IS NULL",[ctx.userId])).rows[0];
    const children=ctx.role==='student'?(await tx.query("SELECT id FROM students WHERE owner_id=$1 AND deleted_at IS NULL AND status='active'",[ctx.userId])).rows.map(r=>r.id):(await tx.query("SELECT student_id FROM guardians WHERE owner_id=$1 AND deleted_at IS NULL AND payload->>'canView'='true'",[ctx.userId])).rows.map(r=>r.student_id);
    const studentClasses=children.length?(await tx.query("SELECT DISTINCT class_id FROM students WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL AND status='active'",[children])).rows.map(r=>r.class_id):[];
    return {classes,staff,children,studentClasses,departmentId:staff?.payload.departmentId};
  }
  private async predicate(tx:Queryable,ctx:Actor,key:string,params:any[]){
    const d=this.definition(key);if(!this.canRead(ctx,key,d.area))throw new OperationError(403,'forbidden');
    const scope=await this.scope(tx,ctx);const clauses=['deleted_at IS NULL'];if(key==='consentNotices')clauses.push("payload->>'documentKind'='consentNotice'");if(key==='health')clauses.push("COALESCE(payload->>'recordType','health')='"+(ctx.role==='counsellor'?'counselling':'health')+"'");const put=(value:any)=>{params.push(value);return `$${params.length}`;};
    if(ctx.role==='parent'||ctx.role==='student'){
      if(communications.has(key))clauses.push("published=true");
      else if(['homework','exams','timetable','onlineClasses','ptmSlots'].includes(key))clauses.push(`published=true AND class_id=ANY(${put(scope.studentClasses)}::uuid[])`);
      else if(key==='notificationPreferences')clauses.push(`owner_id=${put(ctx.userId)}`);
      else if(key==='messages')clauses.push(`((owner_id=${put(ctx.userId)} AND payload->>'senderRole'=${put(ctx.role)}) OR (payload->>'recipientUserId'=${put(ctx.userId)} AND payload->>'recipientRole'=${put(ctx.role)}))`);
      else if(key==='notifications')clauses.push(`owner_id=${put(ctx.userId)} AND audience->>'kind' IN ('parents','both','people')`);
      else if(['grievances','dataRequests','safety','notificationPreferences'].includes(key))clauses.push(`owner_id=${put(ctx.userId)}`);
      else if(key==='students')clauses.push(`id=ANY(${put(scope.children)}::uuid[])`);
      else if(key==='guardians')clauses.push(`owner_id=${put(ctx.userId)}`);
      else clauses.push(`student_id=ANY(${put(scope.children)}::uuid[])`);
      if(key==='invoices')clauses.push("status='issued'");
      if(['marks','reportCards','achievements'].includes(key))clauses.push('published=true');
      if(key==='certificates')clauses.push(`(published=true OR owner_id=${put(ctx.userId)})`);
    }else{
      const mode=moduleAccess(ctx.role,key);
      if(key==='notificationPreferences')clauses.push(`owner_id=${put(ctx.userId)}`);
      else if(key==='messages')clauses.push(`((owner_id=${put(ctx.userId)} AND payload->>'senderRole'=${put(ctx.role)}) OR (payload->>'recipientUserId'=${put(ctx.userId)} AND payload->>'recipientRole'=${put(ctx.role)}))`);
      else if(key==='notifications')clauses.push(`owner_id=${put(ctx.userId)} AND audience->>'kind' IN ('staff','both','people')`);
      else if(['grievances','safety'].includes(key)&&['teacher','incharge'].includes(ctx.role)){
        const assigned=ctx.role==='teacher'?`EXISTS(SELECT 1 FROM students cs JOIN classes cc ON cc.id=cs.class_id JOIN staff ct ON ct.id=(cc.payload->>'classTeacherId')::uuid WHERE cs.id=${d.table}.student_id AND cs.deleted_at IS NULL AND cc.deleted_at IS NULL AND ct.deleted_at IS NULL AND ct.owner_id=${put(ctx.userId)})`:`EXISTS(SELECT 1 FROM students cs WHERE cs.id=${d.table}.student_id AND cs.deleted_at IS NULL AND cs.class_id=ANY(${put(scope.classes)}::uuid[]))`;
        clauses.push(`(owner_id=${put(ctx.userId)} OR (payload->>'requesterRole'='parent' AND ${assigned}))`);
      }
      else if(mode==='scope'&&!communications.has(key)){
        if(ctx.role==='incharge'&&key==='classes')clauses.push(`id=ANY(${put(scope.classes)}::uuid[])`);
        else if(ctx.role==='incharge'&&['staff','staffAttendance'].includes(key)){const target=key==='staff'?'id':'staff_id';clauses.push(`(${target} IN (SELECT staff_id FROM timetable_entries WHERE class_id=ANY(${put(scope.classes)}::uuid[]) AND published=true AND deleted_at IS NULL) OR ${target}=${put(scope.staff?.id??null)}::uuid)`);}
        else if(d.area==='budgets'||key==='purchases')clauses.push(`payload->>'departmentId'=${put(scope.departmentId??'')}`);
        else if(d.area==='staff')clauses.push(`payload->>'departmentId'=${put(scope.departmentId??'')}`);
        else if(d.area==='cover')clauses.push(`(class_id=ANY(${put(scope.classes)}::uuid[]) OR owner_id=${put(ctx.userId)})`);
        else clauses.push(`(class_id=ANY(${put(scope.classes)}::uuid[]) OR owner_id=${put(ctx.userId)} OR staff_id=${put(scope.staff?.id??null)}::uuid)`);
      }else if(mode==='own'){
        if(key==='staff')clauses.push(`owner_id=${put(ctx.userId)}`);
        else clauses.push(`(owner_id=${put(ctx.userId)} OR staff_id=${put(scope.staff?.id??null)}::uuid)`);
      }
      if(ctx.role==='teacher'&&key==='studentLeave')clauses.push(`(payload->>'approverUserId'=${put(ctx.userId)} OR owner_id=${put(ctx.userId)})`);
      if(['hod','incharge'].includes(ctx.role)&&key==='leave')clauses.push(`(payload->>'approverUserId'=${put(ctx.userId)} OR owner_id=${put(ctx.userId)})`);
    }
    if(ctx.role==='incharge'&&key==='leave')clauses.push(`(staff_id IN (SELECT staff_id FROM timetable_entries WHERE class_id=ANY(${put(scope.classes)}::uuid[]) AND published=true AND deleted_at IS NULL) OR owner_id=${put(ctx.userId)})`);
    if(ctx.role==='incharge'&&['students','attendance','timetable','homework','exams','marks','syllabus','cover'].includes(key))clauses.push(`class_id=ANY(${put(scope.classes)}::uuid[])`);
    if(ctx.role==='teacher'&&['exams','marks'].includes(key)){
      clauses.push(`${d.table}.class_id=ANY(${put(scope.classes)}::uuid[])`);
      const teacherUser=put(ctx.userId);
      clauses.push(`(${d.table}.payload->>'subjectId' IN (${teachingSubjectsSql(teacherUser,d.table+'.class_id')}) OR EXISTS(${classTeacherSql(teacherUser,d.table+'.class_id')}))`);
    }
    // A full report card contains all-subject results, so it follows the same
    // class-teacher restriction as the all-subject History dashboard.
    if(ctx.role==='teacher'&&key==='reportCards'){
      clauses.push(`${d.table}.class_id=ANY(${put(scope.classes)}::uuid[])`);
      clauses.push(`EXISTS(${classTeacherSql(put(ctx.userId),d.table+'.class_id')})`);
    }
    if(communications.has(key)){
      const user=put(ctx.userId)+'::uuid';const role=put(ctx.role);const classIds=put(ctx.role==='parent'||ctx.role==='student'?scope.studentClasses:scope.classes);
      const kind=ctx.role==='parent'?"audience->>'kind' IN ('parents','both','people')":ctx.role==='student'?"audience->>'kind'='students'":"audience->>'kind' IN ('staff','parents','both','people')";
      const audience=`(${kind} AND (jsonb_array_length(COALESCE(audience->'roles','[]'))=0 OR audience->'roles' ? ${role}::text) AND (jsonb_array_length(COALESCE(audience->'classIds','[]'))=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(audience->'classIds') a(value) WHERE a.value=ANY(${classIds}::text[]))) AND (audience->>'kind'<>'people' OR audience->'userIds' ? ${user}::text))`;
      clauses.push(ctx.role==='parent'||ctx.role==='student'?audience:`(owner_id=${user} OR ${audience} OR ${role} IN ('principal','admin','management'))`);
      if(!['principal','admin','management'].includes(ctx.role))clauses.push(`(published=true OR owner_id=${user})`);
      clauses.push("(payload->>'publishAt' IS NULL OR (payload->>'publishAt')::timestamptz<=now() OR owner_id="+user+")");
      clauses.push("(payload->>'expiresAt' IS NULL OR (payload->>'expiresAt')::timestamptz>now() OR owner_id="+user+")");
    }
    return clauses.join(' AND ');
  }
  async list(ctx:Actor,key:string,query:unknown){
    const d=this.definition(key);const {page,limit}=pagination.parse(query);const search=z.object({search:z.string().max(100).optional(),classId:z.string().uuid().optional(),status:z.string().max(40).optional(),studentId:z.uuid().optional(),date:z.iso.date().optional()}).parse(query);
    return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
      const params:any[]=[];let where=await this.predicate(tx,ctx,key,params);
      if(search.studentId){params.push(search.studentId);where+=key==='students'?` AND id=$${params.length}`:` AND (student_id=$${params.length} OR payload->>'studentId'=$${params.length}::text)`;}
      if(search.classId){params.push(search.classId);where+=` AND class_id=$${params.length}`;}
      if(search.date){params.push(search.date);where+=` AND payload->>'date'=$${params.length}`;}
      if(search.status){params.push(search.status);where+=` AND status=$${params.length}`;}
      if(search.search){params.push(`%${search.search.replaceAll('%','\\%').replaceAll('_','\\_')}%`);where+=` AND (concat_ws(' ',payload->>'name',payload->>'title',payload->>'admissionNumber',payload->>'employeeNumber',payload->>'reference',payload->>'description') ILIKE $${params.length})`;}
      const total=(await tx.query(`SELECT count(*)::int AS n FROM ${d.table} WHERE ${where}`,params)).rows[0].n;
      const result=await tx.query<RecordRow>(`SELECT * FROM ${d.table} WHERE ${where} ORDER BY created_at DESC,id LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,limit,(page-1)*limit]);
      await this.audit(tx,ctx,'sensitive.read',d.table);
      return {data:await Promise.all(result.rows.map(row=>this.redact(tx,ctx,key,row))),total,page,limit};
    });
  }
  async get(ctx:Actor,key:string,recordId:string){z.uuid().parse(recordId);return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
    const params:any[]=[];const where=await this.predicate(tx,ctx,key,params);params.push(recordId);
    const row=(await tx.query<RecordRow>(`SELECT * FROM ${this.definition(key).table} WHERE ${where} AND id=$${params.length}`,params)).rows[0];if(!row)throw new OperationError(404,'notFound');
    await this.audit(tx,ctx,'sensitive.read',this.definition(key).table,recordId);return this.redact(tx,ctx,key,row);
  });}
  private async redact(tx:Queryable,ctx:Actor,key:string,row:RecordRow){
    if(key==='gatePasses'){row={...row,payload:{...row.payload}};delete row.payload.pickupTokenHash;delete row.payload.pickupTokenExpiresAt;}
    const r={...row,payload:{...row.payload}};
    if(key==='exams'&&ctx.role==='teacher'&&r.payload.questionPaper&&(!r.class_id||!(await teachingSubjects(tx,ctx.userId,r.class_id)).includes(r.payload.subjectId)))delete r.payload.questionPaper;
    if(key==='feed')r.payload.acknowledged=!!(await tx.query("SELECT id FROM post_acknowledgements WHERE owner_id=$1 AND payload->>'postId'=$2",[ctx.userId,row.id])).rows.length;
    if(key==='feed'&&row.payload.postType==='poll'){r.payload.myPollVote=(await tx.query("SELECT version,payload FROM survey_responses WHERE owner_id=$1 AND payload->>'surveyId'=$2 AND deleted_at IS NULL",[ctx.userId,row.id])).rows[0]??null;r.payload.pollTotals=(await tx.query("SELECT payload->'answers'->>0 AS choice,count(*)::int votes FROM survey_responses WHERE payload->>'surveyId'=$1 AND deleted_at IS NULL GROUP BY payload->'answers'->>0",[row.id])).rows;}
    if(key==='surveys'){const response=(await tx.query("SELECT id,version,payload,updated_at FROM survey_responses WHERE owner_id=$1 AND payload->>'surveyId'=$2 AND deleted_at IS NULL",[ctx.userId,row.id])).rows[0];r.payload.myResponse=response??null;}
    if(key==='health'&&r.payload.notes)r.payload.notes=decrypt(r.payload.notes,ctx.schoolId);
    if(['leave','studentLeave'].includes(key)&&r.payload.reason){
      const canSee=r.owner_id===ctx.userId||r.payload.approverUserId===ctx.userId||ctx.role==='hr';
      if(canSee)r.payload.reason=decrypt(r.payload.reason,ctx.schoolId);else delete r.payload.reason;
    }
    if(ctx.role==='accounts'&&key==='students')r.payload=Object.fromEntries(['name','admissionNumber','classId'].map(k=>[k,r.payload[k]]));
    if(ctx.role==='accounts'&&key==='staff')r.payload=Object.fromEntries(['name','employeeNumber','designation'].map(k=>[k,r.payload[k]]));
    if(key==='exams'&&r.status!=='paperReleased'&&!['principal','hod','teacher','admin'].includes(ctx.role))delete r.payload.questionPaper;
    if(key==='exams'&&ctx.role==='parent'&&r.payload.questionPaper){
      const end=new Date(`${r.payload.date}T${r.payload.endTime}:00+05:30`);if(Date.now()<end.getTime())delete r.payload.questionPaper;
    }
    return r;
  }
  async create(ctx:Actor,key:string,input:unknown){const d=this.definition(key);if(!this.canCreate(ctx,key,d))throw new OperationError(403,'forbidden');const payload=d.schema.parse(input);return this.db.tenant(ctx.schoolId,ctx.userId,tx=>this.insert(tx,ctx,key,payload));}
  async provisionStudent(ctx:Actor,input:unknown){if(!['principal','admin'].includes(ctx.role))throw new OperationError(403,'forbidden');const body=z.object({studentId:z.uuid(),username:z.string().regex(/^[a-zA-Z0-9._-]{3,40}$/),pin:z.string().regex(/^\d{6,10}$/)}).strict().parse(input);return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
    const student=(await tx.query("SELECT s.id,c.payload->>'studentLoginEnabled' AS enabled FROM students s JOIN classes c ON c.id=s.class_id WHERE s.id=$1 AND s.deleted_at IS NULL",[body.studentId])).rows[0];if(student?.enabled!=='true')throw new OperationError(409,'studentLoginDisabled');
    const result=(await tx.query('SELECT provision_student_login($1,$2,$3) AS id',[body.studentId,body.username,hashPassword(body.pin)])).rows[0];return{userId:result.id,username:body.username};
  });}
  async provisionGuardian(ctx:Actor,input:unknown){
    if(!['principal','admin'].includes(ctx.role))throw new OperationError(403,'forbidden');
    const body=z.object({studentId:z.uuid(),name:z.string().trim().min(2).max(150),phone:z.string().regex(/^\+[1-9][0-9]{9,14}$/),relationship:z.enum(['mother','father','guardian']),canPickup:z.boolean().default(false)}).strict().parse(input);
    return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
      if(!(await tx.query("SELECT id FROM students WHERE id=$1 AND deleted_at IS NULL AND status='active' FOR SHARE",[body.studentId])).rows.length)throw new OperationError(404,'notFound');
      const email=createHash('sha256').update(body.phone).digest('hex')+'@phone.identity.campus.invalid';
      const known=(await tx.query("SELECT g.owner_id FROM guardians g JOIN memberships m ON m.user_id=g.owner_id AND m.role='parent' AND m.active=true WHERE g.deleted_at IS NULL AND g.payload->>'phone'=$1 LIMIT 1",[body.phone])).rows[0];
      const userId=known?.owner_id??(await tx.query('SELECT provision_guardian_account($1,$2,$3) AS id',[email,body.name,hashPassword(token())])).rows[0].id;
      const existing=(await tx.query("SELECT id FROM guardians WHERE owner_id=$1 AND student_id=$2 AND deleted_at IS NULL",[userId,body.studentId])).rows[0];
      if(existing)throw new OperationError(409,'guardianAlreadyLinked');
      const guardian=await this.insert(tx,ctx,'guardians',{...body,userId,canView:true});return{userId,guardian};
    });
  }
  async provisionStaff(ctx:Actor,input:unknown){if(!['principal','admin'].includes(ctx.role))throw new OperationError(403,'forbidden');const body=z.object({email:z.email().transform(v=>v.toLowerCase()),name:z.string().min(2).max(100),password:z.string().min(12).max(128),role:z.enum(roles),totpSecret:z.string().regex(/^[A-Z2-7]{16,64}$/).optional(),scope:z.object({classes:z.array(z.uuid()).max(100).default([]),departments:z.array(z.uuid()).max(100).default([]),expiresAt:z.iso.datetime().optional()}).strict().default({classes:[],departments:[]})}).strict().parse(input);
    if(['student','parent','platformSuperAdmin','supportAgent','adReviewer','applicantParent','alumni'].includes(body.role))throw new OperationError(403,'forbidden');
    if(['principal','management','accounts','hr','auditor'].includes(body.role)&&!body.totpSecret)throw new OperationError(400,'mfaRequired');
    if(body.role==='auditor'&&(!body.scope.expiresAt||new Date(body.scope.expiresAt).getTime()<=Date.now()||new Date(body.scope.expiresAt).getTime()>Date.now()+90*86400000))throw new OperationError(400,'invalidDateRange');
    return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{for(const classId of body.scope.classes)if(!(await tx.query('SELECT id FROM classes WHERE id=$1 AND deleted_at IS NULL',[classId])).rows.length)throw new OperationError(400,'referenceNotFound');for(const department of body.scope.departments)if(!(await tx.query('SELECT id FROM departments WHERE id=$1 AND deleted_at IS NULL',[department])).rows.length)throw new OperationError(400,'referenceNotFound');const result=(await tx.query('SELECT provision_staff_account($1,$2,$3,$4,$5,$6) AS id',[body.email,body.name,hashPassword(body.password),body.role,body.totpSecret?protectIdentitySecret(body.totpSecret):null,JSON.stringify(body.scope)])).rows[0];return{userId:result.id,role:body.role};});
  }
  async classTeachers(ctx:Actor){
    if(!['hod','incharge','vicePrincipal','principal','admin'].includes(ctx.role))throw new OperationError(403,'forbidden');
    return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
      const scope=await this.scope(tx,ctx),limited=['hod','incharge','vicePrincipal'].includes(ctx.role);
      const classes=(await tx.query<RecordRow>("SELECT * FROM classes WHERE deleted_at IS NULL"+(limited?' AND id=ANY($1::uuid[])':'')+" ORDER BY payload->>'name',payload->>'section'",limited?[scope.classes]:[])).rows;
      const staff=(await tx.query("SELECT s.id,s.payload->>'name' name,m.scope->'classes' classes FROM staff s JOIN memberships m ON m.user_id=s.owner_id AND m.active=true AND m.role='teacher' WHERE s.deleted_at IS NULL AND s.status='active'")).rows;
      await this.audit(tx,ctx,'sensitive.read','classTeacherAppointments');
      return{data:classes.map(c=>({id:c.id,version:c.version,name:c.payload.name+' '+c.payload.section,classTeacherId:c.payload.classTeacherId??null,classTeacherName:staff.find(s=>s.id===c.payload.classTeacherId)?.name??null,candidates:[...new Map(staff.filter(s=>(s.classes??[]).includes(c.id)).map(s=>[s.id,{id:s.id,name:s.name}])).values()]}))};
    });
  }
  async appointClassTeacher(ctx:Actor,input:unknown){
    if(!['hod','incharge','vicePrincipal','principal','admin'].includes(ctx.role))throw new OperationError(403,'forbidden');
    const body=z.object({classId:z.uuid(),staffId:z.uuid().nullable(),version:z.number().int().positive(),reason:z.string().trim().min(3).max(1000)}).strict().parse(input);
    return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
      const scope=await this.scope(tx,ctx);if(['hod','incharge','vicePrincipal'].includes(ctx.role)&&!scope.classes.includes(body.classId))throw new OperationError(404,'notFound');
      const classroom=(await tx.query<RecordRow>('SELECT * FROM classes WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[body.classId])).rows[0];if(!classroom)throw new OperationError(404,'notFound');
      if(classroom.version!==body.version)throw new OperationError(409,'versionConflict');
      if(body.staffId&&!(await tx.query("SELECT s.id FROM staff s JOIN memberships m ON m.user_id=s.owner_id AND m.active=true AND m.role='teacher' WHERE s.id=$1 AND s.deleted_at IS NULL AND s.status='active' AND (m.scope->'classes') ? $2",[body.staffId,body.classId])).rows.length)throw new OperationError(400,'teacherNotAssigned');
      const payload={...classroom.payload};if(body.staffId)payload.classTeacherId=body.staffId;else delete payload.classTeacherId;
      const updated=(await tx.query<RecordRow>('UPDATE classes SET payload=$1,version=version+1,updated_at=now() WHERE id=$2 RETURNING *',[JSON.stringify(payload),classroom.id])).rows[0];
      await this.audit(tx,ctx,'classTeacher.appointed','classes',classroom.id,{previous:classroom.payload.classTeacherId??null,staffId:body.staffId,reason:body.reason});
      return{id:updated.id,version:updated.version,classTeacherId:body.staffId};
    });
  }
  async bulkMarks(ctx:Actor,input:unknown){
    if(!['teacher','hod'].includes(ctx.role))throw new OperationError(403,'forbidden');
    const body=z.object({examId:z.uuid(),action:z.enum(['save','submit']),entries:z.array(z.object({studentId:z.uuid(),score:z.number().int().min(0).max(1000),version:z.number().int().nonnegative()}).strict()).min(1).max(100)}).strict().parse(input);
    if(new Set(body.entries.map(e=>e.studentId)).size!==body.entries.length)throw new OperationError(400,'duplicateMarks');
    return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[ctx.schoolId+':exam-marks:'+body.examId]);
      const exam=await this.lockVisible(tx,ctx,'exams',body.examId);
      const scope=await this.scope(tx,ctx);if(!scope.classes.includes(exam.class_id))throw new OperationError(403,'forbidden');
      await this.requireTeachingSubject(tx,ctx,exam.class_id,exam.payload.subjectId);
      if(!marksOpen(exam))throw new OperationError(409,'marksNotOpen');
      const roster=(await tx.query("SELECT id FROM students WHERE class_id=$1 AND status='active' AND deleted_at IS NULL FOR SHARE",[exam.class_id])).rows;
      if(body.entries.some(e=>!roster.some(s=>s.id===e.studentId)))throw new OperationError(400,'classMismatch');
      if(body.action==='submit'&&roster.some(s=>!body.entries.some(e=>e.studentId===s.id)))throw new OperationError(400,'incompleteMarks');
      const result=[];
      for(const entry of body.entries){
        const previous=(await tx.query<RecordRow>("SELECT * FROM marks WHERE payload->>'examId'=$1 AND student_id=$2 AND deleted_at IS NULL FOR UPDATE",[exam.id,entry.studentId])).rows[0];
        if((previous?.version??0)!==entry.version)throw new OperationError(409,'versionConflict');
        if(previous&&previous.status!=='draft'){
          if(previous.payload.score!==entry.score)throw new OperationError(409,'recordLocked');
          result.push(previous);continue;
        }
        if(previous&&previous.owner_id!==ctx.userId&&ctx.role!=='teacher')throw new OperationError(403,'forbidden');
        const payload={...(previous?.payload??{}),examId:exam.id,studentId:entry.studentId,subjectId:exam.payload.subjectId,score:entry.score};
        let saved:RecordRow;
        if(previous){const checked=await this.validate(tx,ctx,'marks',payload,previous);saved=(await tx.query<RecordRow>('UPDATE marks SET payload=$1,version=version+1,updated_at=now() WHERE id=$2 RETURNING *',[JSON.stringify(checked),previous.id])).rows[0];}
        else saved=await this.insert(tx,ctx,'marks',payload);
        if(body.action==='submit')saved=(await tx.query<RecordRow>("UPDATE marks SET status='submitted',version=version+1,updated_at=now() WHERE id=$1 RETURNING *",[saved.id])).rows[0];
        result.push(saved);
      }
      await this.audit(tx,ctx,'marks.'+(body.action==='submit'?'submitted':'saved'),'exams',exam.id,{count:result.length});
      return{data:result,count:result.length};
    });
  }
  async bulkAttendance(ctx:Actor,input:unknown){
    if(!this.canCreate(ctx,'attendance',this.definition('attendance')))throw new OperationError(403,'forbidden');
    const body=z.object({review:z.object({source:z.enum(['manual','voice','image']),checkedRows:z.literal(true),checkedRegister:z.literal(true)}).strict().optional(),entries:z.array(z.object({payload:this.definition('attendance').schema,recordId:z.uuid().optional(),version:z.number().int().positive().optional(),reason:z.string().min(3).max(1000).optional()}).strict()).min(1).max(100)}).strict().parse(input);
    return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
      const results=[];
      for(const entry of body.entries){
        const payload=await this.validate(tx,ctx,'attendance',entry.payload);
        await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[ctx.schoolId+':'+payload.studentId+':'+payload.date+':'+payload.period]);
        const existing=(await tx.query<RecordRow>("SELECT * FROM attendance_records WHERE student_id=$1 AND payload->>'date'=$2 AND payload->>'period'=$3 AND deleted_at IS NULL FOR UPDATE",[payload.studentId,payload.date,String(payload.period)])).rows[0];
        if(existing){
          if(existing.payload.attendance===payload.attendance&&existing.class_id===payload.classId){results.push({id:existing.id,version:existing.version,replayed:true});continue;}
          if(entry.recordId!==existing.id||entry.version!==existing.version)throw new OperationError(409,'versionConflict');
          if(!entry.reason)throw new OperationError(400,'correctionReasonRequired');
          const updated=(await tx.query<RecordRow>('UPDATE attendance_records SET payload=$1,version=version+1,updated_at=now() WHERE id=$2 RETURNING *',[JSON.stringify(payload),existing.id])).rows[0];
          await this.attendanceEvents(tx,ctx,updated,true);await this.audit(tx,ctx,'record.corrected','attendance_records',updated.id,{reason:entry.reason});results.push({id:updated.id,version:updated.version});
        }else{
          if(entry.recordId)throw new OperationError(409,'versionConflict');
          const inserted=await this.insert(tx,ctx,'attendance',payload);results.push({id:inserted.id,version:inserted.version});
        }
      }
      if(body.review)await this.audit(tx,ctx,'attendance.reviewConfirmed','attendance_records',undefined,{...body.review,count:results.length});
      return{data:results,count:results.length};
    });
  }
  async update(ctx:Actor,key:string,recordId:string,input:unknown){
    const d=this.definition(key);const body=z.object({version:z.number().int().positive(),payload:d.schema,reason:z.string().min(3).max(1000).optional()}).strict().parse(input);
    if(!this.canCreate(ctx,key,d))throw new OperationError(403,'forbidden');z.uuid().parse(recordId);
    return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
      if(key==='marks')await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[ctx.schoolId+':exam-marks:'+body.payload.examId]);
      const row=await this.lockVisible(tx,ctx,key,recordId);
      if(row.version!==body.version)throw new OperationError(409,'versionConflict');
      if(['stock','loans'].includes(key))throw new OperationError(409,'recordLocked');
      if(['issued','posted','paid','approved','published','paperReleased','matched','submitted','escalated','ordered','received','closed','anonymized'].includes(row.status)||key==='consents')throw new OperationError(409,'recordLocked');
      if(row.owner_id!==ctx.userId&&!['principal','admin','accounts'].includes(ctx.role)&&!(key==='marks'&&ctx.role==='teacher'))throw new OperationError(403,'forbidden');
      if(['attendance','staffAttendance'].includes(key)&&!body.reason)throw new OperationError(400,'correctionReasonRequired');
      const payload=await this.validate(tx,ctx,key,body.payload,row);
      const updated=(await tx.query<RecordRow>(`UPDATE ${d.table} SET payload=$1,class_id=$2,student_id=$3,staff_id=$4,audience=$5,version=version+1,updated_at=now() WHERE id=$6 RETURNING *`,[JSON.stringify(payload),payload.classId??null,payload.studentId??null,payload.staffId??null,payload.audience?JSON.stringify(payload.audience):null,recordId])).rows[0];
      if(body.reason)await this.audit(tx,ctx,'record.corrected',d.table,recordId,{reason:body.reason});
      if(key==='attendance')await this.attendanceEvents(tx,ctx,updated,true);
      if(key==='cover'&&payload.staffId){const person=(await tx.query('SELECT owner_id FROM staff WHERE id=$1',[payload.staffId])).rows[0];await tx.query("UPDATE substitutions SET status='assigned' WHERE id=$1",[updated.id]);updated.status='assigned';if(person?.owner_id)await this.notify(tx,ctx,person.owner_id,'coverAssigned',payload.date,{coverId:updated.id});}
      return this.redact(tx,ctx,key,updated);
    });
  }
  async remove(ctx:Actor,key:string,recordId:string,version:number){
    const d=this.definition(key);if(financial.has(key)||!this.canCreate(ctx,key,d)||!['principal','admin'].includes(ctx.role))throw new OperationError(403,'forbidden');
    return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{const row=await this.lockVisible(tx,ctx,key,recordId);if(row.version!==version)throw new OperationError(409,'versionConflict');if(row.published||['approved','issued'].includes(row.status))throw new OperationError(409,'recordLocked');await tx.query(`UPDATE ${d.table} SET deleted_at=now(),version=version+1 WHERE id=$1`,[recordId]);return{ok:true};});
  }
  private async lockVisible(tx:Queryable,ctx:Actor,key:string,recordId:string){const params:any[]=[];const where=await this.predicate(tx,ctx,key,params);params.push(recordId);const row=(await tx.query<RecordRow>(`SELECT * FROM ${this.definition(key).table} WHERE ${where} AND id=$${params.length} FOR UPDATE`,params)).rows[0];if(!row)throw new OperationError(404,'notFound');return row;}
  async insert(tx:Queryable,ctx:Actor,key:string,input:Record<string,any>,extras:{status?:string;published?:boolean;ownerId?:string}={}){
    const d=this.definition(key);const payload=await this.validate(tx,ctx,key,input);
    let owner=extras.ownerId??ctx.userId;if(key==='staff'&&payload.userId)owner=payload.userId;if(key==='guardians')owner=payload.userId;
    const row=(await tx.query<RecordRow>(`INSERT INTO ${d.table}(id,school_id,owner_id,class_id,student_id,staff_id,status,payload,audience,published,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[id(),ctx.schoolId,owner,payload.classId??null,payload.studentId??null,payload.staffId??null,extras.status??d.initialStatus??'active',JSON.stringify(payload),payload.audience?JSON.stringify(payload.audience):null,extras.published??false,ctx.userId])).rows[0];
    if(key==='attendance')await this.attendanceEvents(tx,ctx,row,false);
    if(['grievances','safety'].includes(key)&&ctx.role==='parent'&&row.student_id){for(const recipient of await this.caseRecipients(tx,row.student_id))await this.notify(tx,ctx,recipient.user_id,'Parent concern: '+row.payload.title,row.payload.description,{recordId:row.id,module:key,studentId:row.student_id,audience:{kind:'staff',roles:[recipient.role],classIds:[],userIds:[]}});}
    if(key==='cover'&&payload.staffId){const person=(await tx.query('SELECT owner_id FROM staff WHERE id=$1',[payload.staffId])).rows[0];if(person?.owner_id)await this.notify(tx,ctx,person.owner_id,'coverAssigned',payload.date,{coverId:row.id});}
    if(key==='messages')await this.notify(tx,ctx,payload.recipientUserId,'messageReceived',payload.body,{studentId:payload.studentId,audience:{kind:payload.recipientRole==='parent'?'parents':'staff',classIds:[],roles:[payload.recipientRole],userIds:[]}});
    return this.redact(tx,ctx,key,row);
  }
  private async requireTeachingSubject(tx:Queryable,ctx:Actor,classId:string|null,subjectId:string){
    if(ctx.role==='teacher'&&(!classId||!(await teachingSubjects(tx,ctx.userId,classId)).includes(subjectId)))throw new OperationError(403,'subjectNotAssigned');
  }
  private async validate(tx:Queryable,ctx:Actor,key:string,input:Record<string,any>,previous?:RecordRow){
    const d=this.definition(key);const p={...input};const scope=await this.scope(tx,ctx);
    if(key==='marks'){
      if(previous&&(p.examId!==previous.payload.examId||p.studentId!==previous.student_id))throw new OperationError(409,'recordLocked');
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[ctx.schoolId+':exam-marks:'+p.examId]);
      const exam=(await tx.query<RecordRow>('SELECT * FROM exams WHERE id=$1 AND deleted_at IS NULL FOR SHARE',[p.examId])).rows[0];
      if(!exam)throw new OperationError(400,'referenceNotFound');
      await this.requireTeachingSubject(tx,ctx,exam.class_id,exam.payload.subjectId);
      if(!marksOpen(exam))throw new OperationError(409,'marksNotOpen');
      const child=(await tx.query<RecordRow>("SELECT * FROM students WHERE id=$1 AND status='active' AND deleted_at IS NULL FOR SHARE",[p.studentId])).rows[0];
      if(!child||child.class_id!==exam.class_id)throw new OperationError(400,'classMismatch');
      if((await tx.query("SELECT id FROM marks WHERE payload->>'examId'=$1 AND student_id=$2 AND deleted_at IS NULL AND ($3::uuid IS NULL OR id<>$3)",[p.examId,p.studentId,previous?.id??null])).rows.length)throw new OperationError(409,'duplicateMarks');
    }
    for(const [field,target] of Object.entries(d.references??{}))if(p[field]){
      const lock=({ptm:'staffId',loans:'bookId',stock:'itemId',hostelAllocations:'roomId',cover:'staffId'}as Record<string,string>)[key]===field?'UPDATE':'SHARE';
      const r=(await tx.query<RecordRow>(`SELECT * FROM ${this.definition(target).table} WHERE id=$1 AND deleted_at IS NULL FOR ${lock}`,[p[field]])).rows[0];if(!r)throw new OperationError(400,'referenceNotFound');
      if(field==='studentId'){if(p.classId&&r.class_id&&p.classId!==r.class_id)throw new OperationError(400,'classMismatch');p.classId=r.class_id??p.classId;}
      if(field==='examId'){p.classId=r.class_id;if(p.score>r.payload.maxMarks||p.subjectId!==r.payload.subjectId)throw new OperationError(400,'invalidMarks');}
    }
    if(p.startDate&&p.endDate&&p.startDate>p.endDate)throw new OperationError(400,'invalidDateRange');
    if(p.startTime&&p.endTime&&p.startTime>=p.endTime)throw new OperationError(400,'invalidDateRange');
    if(p.effectiveFrom&&p.effectiveTo&&p.effectiveFrom>p.effectiveTo)throw new OperationError(400,'invalidDateRange');
    if(key==='syllabus'){if(p.startDate>p.dueDate)throw new OperationError(400,'invalidDateRange');if(previous?.status==='completed')throw new OperationError(409,'recordLocked');const assigned=(await tx.query("SELECT m.id FROM staff s JOIN memberships m ON m.user_id=s.owner_id AND m.active=true AND m.role IN ('teacher','hod') WHERE s.id=$1 AND (m.scope->'classes') ? $2",[p.staffId,p.classId])).rows;if(!assigned.length)throw new OperationError(400,'teacherNotAssigned');}
    if(ctx.role==='incharge'&&key==='syllabus'){const assigned=(await tx.query("SELECT id FROM timetable_entries WHERE class_id=$1 AND staff_id=$2 AND payload->>'subjectId'=$3 AND published=true AND deleted_at IS NULL",[p.classId,p.staffId,p.subjectId])).rows;if(!assigned.length)throw new OperationError(400,'subjectNotAssigned');}
    if(key==='homework'&&p.workType==='diary')await this.requireTeachingSubject(tx,ctx,p.classId,p.subjectId);
    if(key==='exams'){await this.requireTeachingSubject(tx,ctx,p.classId,p.subjectId);if(p.passMarks>p.maxMarks)throw new OperationError(400,'invalidMarks');}
    if(ctx.role==='parent'){
      if(['pickup','gatePasses'].includes(key)&&!(await tx.query("SELECT id FROM guardians WHERE owner_id=$1 AND student_id=$2 AND deleted_at IS NULL AND payload->>'canView'='true' AND payload->>'canPickup'='true'",[ctx.userId,p.studentId])).rows.length)throw new OperationError(403,'forbidden');
      if(p.studentId&&!scope.children.includes(p.studentId))throw new OperationError(403,'forbidden');
      if(!p.studentId&&!['grievances','dataRequests','safety','notificationPreferences'].includes(key))throw new OperationError(403,'forbidden');
    }
    if(['teacher','hod','incharge'].includes(ctx.role)){
      if(p.classId&&!scope.classes.includes(p.classId))throw new OperationError(403,'forbidden');
      if(['leave','staffAttendance','training'].includes(key)&&p.staffId!==scope.staff?.id)throw new OperationError(403,'forbidden');
      if(['homework','timetable','exams','marks','attendance','submissions','lessonPlans'].includes(key)&&!scope.classes.includes(p.classId))throw new OperationError(403,'forbidden');
    }
    if(p.userId){const user=(await tx.query('SELECT id FROM users WHERE id=$1 AND EXISTS(SELECT 1 FROM memberships WHERE user_id=$1 AND active=true)',[p.userId])).rows[0];if(!user)throw new OperationError(400,'referenceNotFound');}
    if(p.audience){
      for(const classId of p.audience.classIds)if(!(await tx.query('SELECT id FROM classes WHERE id=$1 AND deleted_at IS NULL',[classId])).rows.length)throw new OperationError(400,'referenceNotFound');
      if(['teacher','hod','incharge'].includes(ctx.role)&&(!p.audience.classIds.length||p.audience.classIds.some((v:string)=>!scope.classes.includes(v))))throw new OperationError(403,'forbidden');
      if(p.audience.kind==='students'){const enabled=(await tx.query("SELECT id FROM classes WHERE id=ANY($1::uuid[]) AND payload->>'studentLoginEnabled'='true'",[p.audience.classIds])).rows;if(!p.audience.classIds.length||enabled.length!==p.audience.classIds.length)throw new OperationError(400,'studentLoginDisabled');}
      if(p.audience.kind==='people')for(const uid of p.audience.userIds)if(!(await tx.query('SELECT id FROM memberships WHERE user_id=$1 AND active=true LIMIT 1',[uid])).rows.length)throw new OperationError(400,'referenceNotFound');
    }
    if(key==='feed'&&p.postType==='poll'){const options=p.pollOptions?.split('\n').map((v:string)=>v.trim()).filter(Boolean)??[];if(options.length<2||options.length>10||new Set(options).size!==options.length)throw new OperationError(400,'invalidPollOptions');p.pollOptions=options.join('\n');}
    if(key==='calendar'&&p.eventType==='staffMeeting'&&!['staff','people'].includes(p.audience.kind))throw new OperationError(400,'audienceRequired');
    if(key==='consents'&&ctx.role==='parent'){p.method='app';const notice=(await tx.query("SELECT id,audience FROM knowledge_documents WHERE published=true AND deleted_at IS NULL AND payload->>'documentKind'='consentNotice' AND payload->>'purpose'=$1 AND payload->>'noticeVersion'=$2",[p.purpose,p.noticeVersion])).rows[0];if(!notice||!['parents','both','people'].includes(notice.audience?.kind)||(notice.audience?.classIds?.length&&!notice.audience.classIds.includes(p.classId))||(notice.audience?.roles?.length&&!notice.audience.roles.includes('parent'))||(notice.audience?.kind==='people'&&!notice.audience.userIds.includes(ctx.userId)))throw new OperationError(400,'consentNoticeRequired');}
    if(key==='gatePasses'){const pickup=(await tx.query("SELECT student_id,status FROM pickup_authorizations WHERE id=$1 AND deleted_at IS NULL",[p.pickupId])).rows[0];if(!pickup||pickup.student_id!==p.studentId||pickup.status!=='approved')throw new OperationError(400,'pickupVerificationRequired');}
    if(key==='submissions'){const homework=(await tx.query("SELECT class_id,published,payload FROM homework WHERE id=$1 AND deleted_at IS NULL",[p.homeworkId])).rows[0];if(ctx.role==='parent'&&homework?.payload.dueDate<new Date().toISOString().slice(0,10))throw new OperationError(409,'homeworkClosed');if(!homework?.published||homework.class_id!==p.classId)throw new OperationError(403,'forbidden');}
    if(key==='ptm'&&ctx.role==='parent'){const slot=p.slotId?(await tx.query("SELECT payload FROM ptm_slots WHERE id=$1 AND published=true AND deleted_at IS NULL",[p.slotId])).rows[0]:null;if(!slot||slot.payload.staffId!==p.staffId||slot.payload.classId!==p.classId||slot.payload.date!==p.date||slot.payload.startTime!==p.startTime||slot.payload.endTime!==p.endTime)throw new OperationError(400,'meetingSlotRequired');const related=(await tx.query("SELECT id FROM staff WHERE id=$1 AND (id IN (SELECT staff_id FROM timetable_entries WHERE class_id=$2 AND published=true AND deleted_at IS NULL) OR id IN (SELECT (payload->>'classTeacherId')::uuid FROM classes WHERE id=$2))",[p.staffId,p.classId])).rows;if(!related.length)throw new OperationError(403,'forbidden');}
    if(key==='albums'&&!p.photoConsentConfirmed)throw new OperationError(400,'consentRequired');
    if(['leave','studentLeave'].includes(key)){
      const rules=(await tx.query('SELECT operations_config FROM school_settings')).rows[0].operations_config;
      const holidays=(await tx.query("SELECT payload->>'date' AS date FROM calendar_items WHERE published=true AND deleted_at IS NULL AND payload->>'eventType'='holiday' UNION SELECT payload->>'date' AS date FROM holidays WHERE published=true AND deleted_at IS NULL")).rows.map(r=>r.date);
      const start=p.startDate,end=p.endDate;const days=dateRange(start,end).filter(day=>!rules.weeklyOffs.includes(new Date(day+'T00:00:00Z').getUTCDay())&&!holidays.includes(day));if(!days.length)throw new OperationError(400,'invalidDateRange');p.effectiveDates=days;p.escalationHalfDays=rules.leaveEscalationHalfDays;
      if(key==='leave'){
        const staff=(await tx.query<RecordRow>('SELECT * FROM staff WHERE id=$1',[p.staffId])).rows[0];
        if(!staff?.owner_id)throw new OperationError(400,'staffAccountRequired');
        const own=staff.owner_id===ctx.userId;if(!own&&!['principal','admin'].includes(ctx.role))throw new OperationError(403,'forbidden');
        const department=staff.payload.departmentId?(await tx.query<RecordRow>('SELECT * FROM departments WHERE id=$1',[staff.payload.departmentId])).rows[0]:null;
        const role=(await tx.query('SELECT role FROM memberships WHERE user_id=$1 AND active=true ORDER BY role',[staff.owner_id])).rows.find(r=>['teacher','hod','principal','admin'].includes(r.role))?.role;
        const routeRole=role==='principal'?'management':role==='hod'?'principal':'principal';
        const principal=(await tx.query('SELECT user_id FROM memberships WHERE role=$1 AND active=true AND user_id<>$2 LIMIT 1',[routeRole,staff.owner_id])).rows[0];
        p.approverUserId=staff.payload.managerUserId??(role==='teacher'?department?.payload.hodUserId:null)??principal?.user_id;
        if(!p.approverUserId||p.approverUserId===ctx.userId)throw new OperationError(400,'approverNotConfigured');
        p.dayUnits=days.length*(p.halfDay?1:2);p.approvalStage=1;
        const overlaps=(await tx.query("SELECT id FROM leave_requests WHERE staff_id=$1 AND deleted_at IS NULL AND status IN ('pending','escalated','approved') AND payload->>'startDate'<=$2 AND payload->>'endDate'>=$3 AND ($4::uuid IS NULL OR id<>$4)",[p.staffId,end,start,previous?.id??null])).rows;if(overlaps.length)throw new OperationError(409,'leaveOverlap');
      }else{
        const student=(await tx.query<RecordRow>('SELECT * FROM students WHERE id=$1',[p.studentId])).rows[0];const klass=(await tx.query<RecordRow>('SELECT * FROM classes WHERE id=$1',[student.class_id])).rows[0];const teacher=klass?.payload.classTeacherId?(await tx.query<RecordRow>('SELECT * FROM staff WHERE id=$1',[klass.payload.classTeacherId])).rows[0]:null;
        p.approverUserId=teacher?.owner_id;if(!p.approverUserId)throw new OperationError(400,'approverNotConfigured');
      }
      p.reason=encrypt(p.reason,ctx.schoolId);
    }
    if(['timetable','cover','ptm'].includes(key)){
      if(key==='timetable'){
        for(const resource of [p.classId,p.staffId,'room:'+p.room].sort())await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[ctx.schoolId+':timetable:'+p.weekday+':'+resource]);
        const clashes=(await tx.query("SELECT id FROM timetable_entries WHERE deleted_at IS NULL AND payload->>'weekday'=$1 AND payload->>'startTime'<$2 AND payload->>'endTime'>$3 AND (staff_id=$4 OR class_id=$5 OR payload->>'room'=$6) AND ($7::uuid IS NULL OR id<>$7)",[String(p.weekday),p.endTime,p.startTime,p.staffId,p.classId,p.room,previous?.id??null])).rows;if(clashes.length)throw new OperationError(409,'timetableClash');
      }
      if(key==='cover'){
        const original=(await tx.query<RecordRow>('SELECT * FROM timetable_entries WHERE id=$1',[p.timetableId])).rows[0];p.classId=original.class_id;p.originalStaffId=original.staff_id;
        if(!original.published||(['teacher','hod','incharge'].includes(ctx.role)&&!scope.classes.includes(p.classId)))throw new OperationError(403,'forbidden');
        if(ctx.role==='incharge'&&!(await tx.query('SELECT id FROM timetable_entries WHERE staff_id=$1 AND class_id=ANY($2::uuid[]) AND published=true AND deleted_at IS NULL LIMIT 1',[p.staffId,scope.classes])).rows.length)throw new OperationError(403,'forbidden');
        if(new Date(p.date+'T00:00:00Z').getUTCDay()!==original.payload.weekday)throw new OperationError(400,'invalidDateRange');
        const busy=(await tx.query("SELECT id FROM timetable_entries WHERE staff_id=$1 AND deleted_at IS NULL AND published=true AND payload->>'weekday'=$2 AND payload->>'startTime'<$3 AND payload->>'endTime'>$4",[p.staffId,String(original.payload.weekday),original.payload.endTime,original.payload.startTime])).rows;
        if(busy.length)throw new OperationError(409,'timetableClash');
        const absent=(await tx.query("SELECT id FROM leave_requests WHERE staff_id=$1 AND status='approved' AND payload->>'startDate'<=$2 AND payload->>'endDate'>=$2",[p.staffId,p.date])).rows;if(absent.length)throw new OperationError(409,'staffUnavailable');
        const other=(await tx.query("SELECT s.id FROM substitutions s JOIN timetable_entries t ON t.id=(s.payload->>'timetableId')::uuid WHERE s.staff_id=$1 AND s.payload->>'date'=$2 AND s.deleted_at IS NULL AND t.payload->>'startTime'<$3 AND t.payload->>'endTime'>$4 AND ($5::uuid IS NULL OR s.id<>$5)",[p.staffId,p.date,original.payload.endTime,original.payload.startTime,previous?.id??null])).rows;if(other.length)throw new OperationError(409,'timetableClash');
      }
    }
    if(key==='attendance'){
      const student=(await tx.query<RecordRow>('SELECT * FROM students WHERE id=$1',[p.studentId])).rows[0];if(student.class_id!==p.classId)throw new OperationError(400,'classMismatch');
      const leave=(await tx.query("SELECT id FROM student_leave_requests WHERE student_id=$1 AND status='approved' AND payload->>'startDate'<=$2 AND payload->>'endDate'>=$2",[p.studentId,p.date])).rows;
      if(leave.length)p.attendance='leave';
    }
    if(['dataRequests','grievances','safety'].includes(key))p.requesterRole=previous?.payload.requesterRole??ctx.role;
    if(key==='grading'&&p.minimum>p.maximum)throw new OperationError(400,'invalidMarks');
    if(key==='ptm'){
      await tx.query('SELECT id FROM staff WHERE id=$1 FOR UPDATE',[p.staffId]);
      const overlaps=(await tx.query("SELECT id FROM ptm_bookings WHERE deleted_at IS NULL AND status='booked' AND payload->>'date'=$1 AND payload->>'startTime'<$2 AND payload->>'endTime'>$3 AND (staff_id=$4 OR student_id=$5) AND ($6::uuid IS NULL OR id<>$6)",[p.date,p.endTime,p.startTime,p.staffId,p.studentId,previous?.id??null])).rows;if(overlaps.length)throw new OperationError(409,'bookingConflict');
    }
    if(key==='loans'){
      const book=(await tx.query<RecordRow>('SELECT * FROM library_books WHERE id=$1 FOR UPDATE',[p.bookId])).rows[0];const loans=(await tx.query("SELECT count(*)::int n FROM library_loans WHERE payload->>'bookId'=$1 AND status='issued' AND deleted_at IS NULL",[p.bookId])).rows[0].n;
      if(loans>=book.payload.copies&&!previous)throw new OperationError(409,'noCopiesAvailable');
    }
    if(key==='stock'){
      const item=(await tx.query<RecordRow>('SELECT * FROM inventory_items WHERE id=$1 FOR UPDATE',[p.itemId])).rows[0];const stock=(await tx.query("SELECT COALESCE(sum((payload->>'quantity')::bigint * CASE WHEN payload->>'direction'='in' THEN 1 ELSE -1 END),0)::text AS n FROM stock_movements WHERE payload->>'itemId'=$1 AND deleted_at IS NULL",[p.itemId])).rows[0];if(p.direction==='out'&&BigInt(item.payload.openingQuantity)+BigInt(stock.n)<BigInt(p.quantity))throw new OperationError(409,'insufficientStock');
    }
    if(key==='hostelAllocations'){
      const room=(await tx.query<RecordRow>('SELECT * FROM hostel_rooms WHERE id=$1 FOR UPDATE',[p.roomId])).rows[0];const occupied=(await tx.query("SELECT count(*)::int n FROM hostel_allocations WHERE payload->>'roomId'=$1 AND deleted_at IS NULL AND status='active' AND payload->>'startDate'<=$2 AND payload->>'endDate'>=$3 AND ($4::uuid IS NULL OR id<>$4)",[p.roomId,p.endDate,p.startDate,previous?.id??null])).rows[0].n;if(occupied>=room.payload.capacity)throw new OperationError(409,'roomFull');
    }
    if(key==='health'){if(p.recordType!==(ctx.role==='counsellor'?'counselling':'health'))throw new OperationError(403,'forbidden');p.notes=encrypt(p.notes,ctx.schoolId);}
    if(key==='messages'){
      const recipient=(await tx.query('SELECT role FROM memberships WHERE user_id=$1 AND active=true',[p.recipientUserId])).rows;if(!recipient.length)throw new OperationError(400,'referenceNotFound');p.senderRole=ctx.role;const linkedParent=p.studentId&&(await tx.query("SELECT id FROM guardians WHERE owner_id=$1 AND student_id=$2 AND deleted_at IS NULL AND payload->>'canView'='true'",[p.recipientUserId,p.studentId])).rows.length;p.recipientRole=ctx.role==='parent'?['principal','admin','teacher','hod'].find(role=>recipient.some(r=>r.role===role)):linkedParent&&recipient.some(r=>r.role==='parent')?'parent':recipient.find(r=>r.role!=='student')?.role;if(!p.recipientRole)throw new OperationError(403,'forbidden');
      if(ctx.role==='parent'&&recipient.some(r=>['teacher','hod'].includes(r.role))&&!recipient.some(r=>['principal','admin'].includes(r.role))){const assigned=(await tx.query("SELECT id FROM staff WHERE owner_id=$1 AND deleted_at IS NULL AND (id IN (SELECT staff_id FROM timetable_entries WHERE class_id=$2 AND published=true AND deleted_at IS NULL) OR id IN (SELECT (payload->>'classTeacherId')::uuid FROM classes WHERE id=$2))",[p.recipientUserId,p.classId])).rows;if(!assigned.length)throw new OperationError(403,'forbidden');}
      if(ctx.role==='parent'&&!recipient.some(r=>['teacher','hod','principal','admin'].includes(r.role)))throw new OperationError(403,'forbidden');
      if(['teacher','hod'].includes(ctx.role)&&recipient.some(r=>r.role==='parent')){if(!p.studentId||!scope.classes.includes(p.classId))throw new OperationError(403,'forbidden');const linked=(await tx.query("SELECT id FROM guardians WHERE owner_id=$1 AND student_id=$2 AND deleted_at IS NULL AND payload->>'canView'='true'",[p.recipientUserId,p.studentId])).rows;if(!linked.length)throw new OperationError(403,'forbidden');}
    }
    if(['concessions','invoices','refunds','feePlans','bills','budgets','purchases'].includes(key)&&BigInt(p.amountPaise)<=0n)throw new OperationError(400,'invalidAmount');
    if(key==='payroll'&&BigInt(p.deductionsPaise)>BigInt(p.grossPaise))throw new OperationError(400,'invalidAmount');
    return p;
  }
  private async attendanceEvents(tx:Queryable,ctx:Actor,row:RecordRow,correction:boolean){
    if(row.payload.attendance==='leave'&&!correction)return;
    if(row.payload.attendance!=='absent'&&!correction)return;
    const guardians=(await tx.query("SELECT DISTINCT owner_id FROM guardians WHERE student_id=$1 AND deleted_at IS NULL AND payload->>'canView'='true'",[row.student_id])).rows;
    for(const g of guardians)await this.notify(tx,ctx,g.owner_id,correction?'attendanceCorrected':'studentAbsent',row.payload.date,{studentId:row.student_id,attendanceId:row.id,status:row.payload.attendance});
  }
  async caseRecipients(tx:Queryable,studentId:string){return(await tx.query("SELECT DISTINCT m.user_id,m.role FROM memberships m JOIN students s ON s.id=$1 JOIN classes c ON c.id=s.class_id WHERE m.active=true AND s.deleted_at IS NULL AND c.deleted_at IS NULL AND ((m.role='incharge' AND m.scope->'classes' ? s.class_id::text) OR (m.role='teacher' AND EXISTS(SELECT 1 FROM staff t WHERE t.id=(c.payload->>'classTeacherId')::uuid AND t.owner_id=m.user_id AND t.deleted_at IS NULL)))",[studentId])).rows;}
  async notify(tx:Queryable,ctx:Actor,recipient:string,title:string,body:string,extra:Record<string,unknown>={}){
    const audience=extra.audience??{kind:['studentAbsent','attendanceCorrected'].includes(title)?'parents':['leaveDecision','coverAssigned'].includes(title)?'staff':'both',classIds:[],roles:[],userIds:[]};
    const nid=id();await tx.query("INSERT INTO notification_events(id,school_id,owner_id,status,payload,audience,created_by) VALUES($1,$2,$3,'unread',$4,$5,$6)",[nid,ctx.schoolId,recipient,JSON.stringify({title,body,recipientUserId:recipient,eventType:title,...extra}),JSON.stringify(audience),ctx.userId]);
    await tx.query("INSERT INTO outbox_events(id,school_id,owner_id,status,payload,created_by) VALUES($1,$2,$3,'pending',$4,$3)",[id(),ctx.schoolId,ctx.userId,JSON.stringify({notificationId:nid,recipientUserId:recipient,channel:'push',eventType:title})]);
  }
  async privacyExport(ctx:Actor,exportId:string){z.uuid().parse(exportId);return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
    const row=(await tx.query("SELECT * FROM privacy_exports WHERE id=$1 AND status='ready' AND deleted_at IS NULL AND (payload->>'expiresAt')::timestamptz>now()",[exportId])).rows[0];
    if(!row||(row.owner_id!==ctx.userId&&!['principal','admin'].includes(ctx.role)))throw new OperationError(404,'notFound');
    if(row.student_id&&row.owner_id===ctx.userId&&!(await tx.query("SELECT id FROM guardians WHERE owner_id=$1 AND student_id=$2 AND deleted_at IS NULL AND payload->>'canView'='true'",[ctx.userId,row.student_id])).rows.length)throw new OperationError(403,'forbidden');
    await this.audit(tx,ctx,'privacy.exportDownloaded','privacy_exports',exportId);return JSON.parse(readIdentitySecret(row.payload.encryptedContent));
  });}
  private async preparePrivacyExport(tx:Queryable,ctx:Actor,row:RecordRow){
    if(!['principal','admin'].includes(ctx.role)||!['export','access'].includes(row.payload.requestType)||row.status!=='open')throw new OperationError(403,'forbidden');
    const membership=(await tx.query("SELECT id,role FROM memberships WHERE user_id=$1 AND active=true AND role<>'student' AND ($2::text IS NULL OR role=$2) ORDER BY (role='parent') DESC LIMIT 1",[row.owner_id,row.payload.requesterRole??null])).rows[0];if(!membership)throw new OperationError(403,'forbidden');
    const owner:Actor={schoolId:ctx.schoolId,userId:row.owner_id!,membershipId:membership.id,role:membership.role};
    if(row.student_id&&(owner.role!=='parent'||!(await tx.query("SELECT id FROM guardians WHERE owner_id=$1 AND student_id=$2 AND deleted_at IS NULL AND payload->>'canView'='true'",[row.owner_id,row.student_id])).rows.length))throw new OperationError(403,'forbidden');
    const records:Record<string,unknown>={};
    const keys=owner.role==='parent'?['students','guardians','attendance','studentLeave','marks','reportCards','certificates','invoices','consents']:['staff','leave','staffAttendance','payslips','training'];
    for(const key of keys){if(!this.canRead(owner,key,this.definition(key).area))continue;const params:any[]=[];let where=await this.predicate(tx,owner,key,params);
      if(row.student_id){params.push(row.student_id);where+=key==='students'?` AND id=$${params.length}`:` AND student_id=$${params.length}`;}
      if(owner.role!=='parent'){params.push(row.owner_id);where+=` AND (owner_id=$${params.length} OR staff_id IN (SELECT id FROM staff WHERE owner_id=$${params.length} AND deleted_at IS NULL))`;}
      const found=(await tx.query<RecordRow>(`SELECT * FROM ${this.definition(key).table} WHERE ${where} ORDER BY created_at,id LIMIT 10001`,params)).rows;if(found.length>10000)throw new OperationError(413,'exportTooLarge');
      records[key]=await Promise.all(found.map(async record=>{const clean=await this.redact(tx,owner,key,record);return{id:clean.id,status:clean.status,data:clean.payload};}));
    }
    const content=JSON.stringify({format:'campus.subject-export.v1',generatedAt:new Date().toISOString(),requestId:row.id,studentId:row.student_id,records});if(Buffer.byteLength(content)>32*1024*1024)throw new OperationError(413,'exportTooLarge');
    const exportId=id();await tx.query("INSERT INTO privacy_exports(id,school_id,owner_id,student_id,status,payload,created_by) VALUES($1,$2,$3,$4,'ready',$5,$6)",[exportId,ctx.schoolId,row.owner_id,row.student_id,JSON.stringify({requestId:row.id,expiresAt:new Date(Date.now()+7*86400000).toISOString(),encryptedContent:protectIdentitySecret(content)}),ctx.userId]);return exportId;
  }
  async action(ctx:Actor,key:string,recordId:string,input:unknown){
    const d=this.definition(key);const body=z.object({action:z.string().min(1),version:z.number().int().positive(),reason:z.string().max(1000).optional(),classId:z.uuid().optional(),journalId:z.uuid().optional(),pickupToken:z.string().min(30).max(200).optional()}).strict().parse(input);
    if(ctx.role==='incharge'&&!['leave','feed','notifications'].includes(key)&&!(['grievances','safety'].includes(key)&&body.action==='resolve'))throw new OperationError(403,'forbidden');
    if(!(d.actions??[]).includes(body.action))throw new OperationError(400,'invalidAction');
    return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
      const row=await this.lockVisible(tx,ctx,key,recordId);if(row.version!==body.version)throw new OperationError(409,'versionConflict');
      const a=body.action;if(ctx.role==='parent'&&key==='pickup'&&a==='revoke'&&row.owner_id!==ctx.userId)throw new OperationError(403,'forbidden');let next='';let publish=row.published;const p={...row.payload};const mode=moduleAccess(ctx.role,key);
      const approver=['principal','management'].includes(ctx.role)||(ctx.role==='hod'&&mode==='scope');
      if(ctx.role==='incharge'&&key==='syllabus'){const assigned=(await tx.query("SELECT id FROM timetable_entries WHERE class_id=$1 AND staff_id=$2 AND payload->>'subjectId'=$3 AND published=true AND deleted_at IS NULL",[p.classId,p.staffId,p.subjectId])).rows;if(!assigned.length)throw new OperationError(400,'subjectNotAssigned');}
    if(key==='homework'&&p.workType==='diary')await this.requireTeachingSubject(tx,ctx,row.class_id,p.subjectId);
      if(key==='marks'){const exam=(await tx.query<RecordRow>('SELECT * FROM exams WHERE id=$1 AND deleted_at IS NULL',[p.examId])).rows[0];if(!exam)throw new OperationError(404,'notFound');await this.requireTeachingSubject(tx,ctx,exam.class_id,exam.payload.subjectId);if(!marksOpen(exam))throw new OperationError(409,'marksNotOpen');}
      if(key==='dataRequests'&&a==='prepareExport'){p.exportId=await this.preparePrivacyExport(tx,ctx,row);next='resolved';
      }else if(key==='feePlans'&&a==='generateInvoices'){
        if(ctx.role!=='accounts')throw new OperationError(403,'forbidden');
        const students=(await tx.query("SELECT id FROM students WHERE class_id=$1 AND status='active' AND deleted_at IS NULL ORDER BY id FOR SHARE",[row.class_id])).rows;let createdCount=0,existingCount=0;
        for(const child of students){if((await tx.query("SELECT id FROM fee_invoices WHERE student_id=$1 AND payload->>'feePlanId'=$2 AND deleted_at IS NULL",[child.id,row.id])).rows.length){existingCount++;continue;}
          const invoice=await this.insert(tx,ctx,'invoices',{studentId:child.id,feeHeadId:p.feeHeadId,amountPaise:p.amountPaise,dueDate:p.dueDate,description:p.name});
          await tx.query("UPDATE fee_invoices SET payload=payload||$1::jsonb WHERE id=$2",[JSON.stringify({feePlanId:row.id}),invoice.id]);createdCount++;
        }
        await this.audit(tx,ctx,'feePlan.invoicesGenerated',d.table,row.id,{createdCount,existingCount});return{createdCount,existingCount};
      }else if(key==='gatePasses'&&a==='createPickupPass'){
        if(ctx.role!=='parent'||row.status!=='approved')throw new OperationError(403,'forbidden');
        if(!(await tx.query("SELECT id FROM guardians WHERE owner_id=$1 AND student_id=$2 AND deleted_at IS NULL AND payload->>'canView'='true' AND payload->>'canPickup'='true'",[ctx.userId,row.student_id])).rows.length)throw new OperationError(403,'forbidden');
        const pickupToken=token();const expiresAt=new Date(Date.now()+300000).toISOString();
        await tx.query("UPDATE gate_passes SET payload=payload||$1::jsonb,version=version+1 WHERE id=$2",[JSON.stringify({pickupTokenHash:createHash('sha256').update(pickupToken).digest('hex'),pickupTokenExpiresAt:expiresAt}),row.id]);
        await this.audit(tx,ctx,'pickup.passCreated',d.table,row.id);return{pickupToken,expiresAt,version:row.version+1};
      }else if(a==='acknowledge'){
        if(key==='notifications'){if(row.owner_id!==ctx.userId)throw new OperationError(403,'forbidden');next='read';}
        else {if(!row.published)throw new OperationError(409,'recordLocked');await tx.query("INSERT INTO post_acknowledgements(id,school_id,owner_id,status,payload,created_by) VALUES($1,$2,$3,'acknowledged',$4,$3) ON CONFLICT DO NOTHING",[id(),ctx.schoolId,ctx.userId,JSON.stringify({postId:row.id,acknowledgedAt:new Date().toISOString()})]);await this.audit(tx,ctx,'post.acknowledged',d.table,row.id);return{ok:true};}
      }else if(['leave','studentLeave'].includes(key)){
        if(a==='cancel'){if(row.owner_id!==ctx.userId||!['pending','returned'].includes(row.status))throw new OperationError(403,'forbidden');next='cancelled';}
        else {if(p.approverUserId!==ctx.userId||row.owner_id===ctx.userId)throw new OperationError(403,'forbidden');if(!['pending','escalated'].includes(row.status))throw new OperationError(409,'recordLocked');
          if(a==='approve'){
            if(key==='leave'&&p.dayUnits>p.escalationHalfDays&&['hod','incharge'].includes(ctx.role)){
              const principal=(await tx.query("SELECT user_id FROM memberships WHERE role='principal' AND active=true AND user_id<>$1 LIMIT 1",[row.owner_id])).rows[0];if(!principal)throw new OperationError(400,'approverNotConfigured');p.approverUserId=principal.user_id;p.approvalStage=2;next='escalated';
            }else {next='approved';await this.approveLeave(tx,ctx,key,row);}
          }else if(a==='reject')next='rejected';else if(a==='return')next='returned';else throw new OperationError(400,'invalidAction');
        }
        if(row.owner_id)await this.notify(tx,ctx,row.owner_id,'leaveDecision',next,{leaveId:row.id});
      }else if(key==='students'){
        if(!['principal','admin'].includes(ctx.role))throw new OperationError(403,'forbidden');
        if(a==='withdraw'){if(!body.reason)throw new OperationError(400,'correctionReasonRequired');next='withdrawn';p.withdrawalReason=body.reason;}
        else {if(!body.classId||!(await tx.query('SELECT id FROM classes WHERE id=$1 AND deleted_at IS NULL',[body.classId])).rows.length)throw new OperationError(400,'referenceNotFound');p.classId=body.classId;next='active';}
      }else if(a==='publish'){
        if(row.published)throw new OperationError(409,'recordLocked');
        if(['marks','exams','reportCards'].includes(key)){if(ctx.role!=='principal'||row.status!=='approved')throw new OperationError(403,'approvalRequired');}
        else if(communications.has(key)){if(!['principal','admin'].includes(ctx.role)&&(!p.audience?.classIds.length||row.owner_id!==ctx.userId||!['teacher','hod','incharge'].includes(ctx.role)))throw new OperationError(403,'approvalRequired');}
        else if(!this.canCreate(ctx,key,d)&&ctx.role!=='principal')throw new OperationError(403,'forbidden');
        if(key==='feed'){p.attachmentCount=(await tx.query("SELECT count(*)::int n FROM parent_files WHERE payload->>'module'='feed' AND payload->>'recordId'=$1 AND status='ready' AND deleted_at IS NULL",[row.id])).rows[0].n;if(!p.body?.trim()&&!p.attachmentCount&&!(p.links??[]).length)throw new OperationError(400,'invalidInput');}
        next='published';publish=true;
        if(communications.has(key))await this.publishNotifications(tx,ctx,row);
      }else if(a==='approve'){
        if(!approver&&!(ctx.role==='admin'&&['certificates','pickup','gatePasses','visitors','alumniRequests'].includes(key))&&!(ctx.role==='security'&&key==='visitors')&&!(ctx.role==='teacher'&&key==='studentLeave'))throw new OperationError(403,'forbidden');
        if(row.created_by===ctx.userId&&['concessions','refunds','budgets','purchases','bills','payroll','periodLocks'].includes(key))throw new OperationError(403,'secondApproverRequired');
        if(!['draft','pending','submitted','waiting','escalated'].includes(row.status))throw new OperationError(409,'recordLocked');
        next='approved';
        if(key==='pickup'&&!(await tx.query("SELECT id FROM parent_files WHERE payload->>'module'='pickup' AND payload->>'recordId'=$1 AND payload->>'mime' LIKE 'image/%' AND deleted_at IS NULL",[row.id])).rows.length)throw new OperationError(400,'pickupPhotoRequired');
        if(['budgets','purchases','bills','payroll','concessions','refunds'].includes(key)){
          if((p.approvals??[]).some((approval:{userId:string})=>approval.userId===ctx.userId))throw new OperationError(403,'secondApproverRequired');
          if(p.requiredApproverRole&&p.requiredApproverRole!==ctx.role)throw new OperationError(403,'approvalRouteRequired');
          const rules=(await tx.query('SELECT operations_config FROM school_settings')).rows[0].operations_config;const amount=BigInt(p.amountPaise??p.grossPaise);
          if(['hod','incharge'].includes(ctx.role)){if(!['budgets','purchases'].includes(key))throw new OperationError(403,'forbidden');next='escalated';p.requiredApproverRole='principal';}
          else if(amount>BigInt(rules.approvalLimitPaise)){
            if(ctx.role==='principal'){next='escalated';p.requiredApproverRole='management';}
            else if(ctx.role!=='management'||row.status!=='escalated'||p.requiredApproverRole!=='management')throw new OperationError(403,'approvalRouteRequired');
          }
          p.approvals=[...(p.approvals??[]),{userId:ctx.userId,role:ctx.role,at:new Date().toISOString(),limitPaise:rules.approvalLimitPaise}];if(next==='approved')delete p.requiredApproverRole;
        }
        if(key==='reportCards'){if(ctx.role!=='principal')throw new OperationError(403,'forbidden');p.snapshot=await buildReportCard(tx,ctx,row);p.verificationToken=token();}
        if(key==='concessions'&&next==='approved'){
          const invoice=(await tx.query("SELECT * FROM fee_invoices WHERE id=$1 AND status='issued' FOR UPDATE",[p.invoiceId])).rows[0];if(!invoice||invoice.student_id!==row.student_id)throw new OperationError(400,'referenceNotFound');
          const paid=BigInt((await tx.query('SELECT COALESCE(sum(amount_paise),0)::text n FROM payments WHERE invoice_id=$1',[invoice.id])).rows[0].n);
          const granted=BigInt((await tx.query("SELECT COALESCE(sum((payload->>'amountPaise')::bigint),0)::text n FROM concessions WHERE status='approved' AND payload->>'invoiceId'=$1",[invoice.id])).rows[0].n);
          if(paid+granted+BigInt(p.amountPaise)>BigInt(invoice.payload.amountPaise))throw new OperationError(400,'invalidAmount');
          p.journalId=await postByCodes(tx,ctx.schoolId,ctx.userId,{date:new Date().toISOString().slice(0,10),description:'Approved fee concession',debitCode:'5000',creditCode:'1100',amountPaise:p.amountPaise});
        }
        if(key==='refunds'&&next==='approved'){
          const receipt=(await tx.query('SELECT r.*,p.student_id,p.invoice_id FROM receipts r JOIN payments p ON p.id=r.payment_id WHERE r.id=$1',[p.receiptId])).rows[0];if(!receipt||receipt.student_id!==row.student_id)throw new OperationError(400,'referenceNotFound');
          await tx.query('SELECT id FROM fee_invoices WHERE id=$1 FOR UPDATE',[receipt.invoice_id]);
          const refunded=BigInt((await tx.query("SELECT COALESCE(sum((payload->>'amountPaise')::bigint),0)::text n FROM refunds WHERE status='approved' AND payload->>'receiptId'=$1",[p.receiptId])).rows[0].n);
          if(refunded+BigInt(p.amountPaise)>BigInt(receipt.amount_paise))throw new OperationError(400,'invalidAmount');
          p.journalId=await postByCodes(tx,ctx.schoolId,ctx.userId,{date:new Date().toISOString().slice(0,10),description:'Approved fee refund',debitCode:'1100',creditCode:'1000',amountPaise:p.amountPaise});
        }
      }else if(a==='reject'){
        if(!approver&&!(ctx.role==='admin'&&['admissions','visitors','alumniRequests','dataRequests'].includes(key))&&!(ctx.role==='security'&&key==='visitors'))throw new OperationError(403,'forbidden');if(!['draft','pending','submitted','waiting','escalated','open','enquiry','contacted','offered'].includes(row.status))throw new OperationError(409,'recordLocked');if(!body.reason||body.reason.trim().length<3)throw new OperationError(400,'correctionReasonRequired');next='rejected';
      }else if(a==='releasePaper'){
        if(ctx.role!=='principal'||!row.published)throw new OperationError(403,'forbidden');
        if(new Date(`${p.date}T${p.endTime}:00+05:30`).getTime()>Date.now())throw new OperationError(409,'examNotEnded');next='paperReleased';
      }else if(a==='issue'){
        if(key==='certificates'){if(!['principal','admin'].includes(ctx.role)||row.status!=='approved')throw new OperationError(403,'approvalRequired');p.verificationToken=token();next='issued';publish=true;}
        else {if(ctx.role!=='accounts'||row.status!=='draft')throw new OperationError(403,'forbidden');p.journalId=await postByCodes(tx,ctx.schoolId,ctx.userId,{date:new Date().toISOString().slice(0,10),description:'Issued fee invoice',debitCode:'1100',creditCode:'4000',amountPaise:p.amountPaise});next='issued';publish=true;}
      }else if(a==='pay'||a==='post'){
        if(ctx.role!=='accounts'||row.status!=='approved'||!['bills','payroll'].includes(key))throw new OperationError(403,'approvalRequired');
        if(key==='payroll'){
          const config=(await tx.query("SELECT payload FROM tax_settings WHERE id=$1 AND payload->>'accountantConfirmed'='true'",[p.statutoryConfigurationId])).rows[0];
          if(!config||p.month+'-01'<config.payload.effectiveFrom||p.month+'-01'>config.payload.effectiveTo)throw new OperationError(400,'statutoryConfigRequired');
        }
        p.journalId=await postByCodes(tx,ctx.schoolId,ctx.userId,{date:new Date().toISOString().slice(0,10),description:key==='bills'?'Approved vendor bill payment':'Approved payroll posting',debitCode:'5000',creditCode:key==='bills'?'1000':'2100',amountPaise:key==='bills'?p.amountPaise:p.grossPaise});next=key==='bills'?'paid':'posted';
      }else{
        const transitions:Record<string,Record<string,[string[],string]>>={
          marks:{submit:[['draft'],'submitted']},submissions:{review:[['submitted'],'reviewed']},
          purchases:{order:[['approved'],'ordered'],receive:[['ordered'],'received']},
          loans:{return:[['issued'],'returned']},trips:{start:[['scheduled'],'inProgress'],complete:[['inProgress'],'completed']},
          ptm:{complete:[['booked'],'completed'],cancel:[['booked'],'cancelled']},
          admissions:{contact:[['enquiry'],'contacted'],offer:[['contacted'],'offered'],admit:[['offered'],'admitted']},
          grievances:{resolve:[['open'],'resolved'],reopen:[['resolved'],'open']},dataRequests:{resolve:[['open'],'resolved']},safety:{resolve:[['open'],'resolved']},
          pickup:{revoke:[['approved'],'revoked']},gatePasses:{release:[['approved'],'released'],cancel:[['pending','approved'],'cancelled']},
          lessonPlans:{complete:[['active'],'completed']},bankStatements:{reconcile:[['unmatched'],'matched']},cashier:{close:[['open'],'closed']},
          enrollments:{complete:[['active'],'completed']},visitors:{checkIn:[['approved'],'checkedIn'],checkOut:[['checkedIn'],'checkedOut']},
          canteen:{complete:[['ordered'],'completed'],cancel:[['ordered'],'cancelled']},alumniRequests:{complete:[['approved'],'completed']},drills:{complete:[['planned'],'completed']}
        };
        if(!this.canCreate(ctx,key,d)&&!(['grievances','safety'].includes(key)&&a==='resolve'&&ctx.role==='incharge'&&p.requesterRole==='parent'&&row.owner_id!==ctx.userId)&&!['principal','management'].includes(ctx.role))throw new OperationError(403,'forbidden');
        const transition=transitions[key]?.[a];if(!transition)throw new OperationError(400,'invalidAction');
        if(!transition[0].includes(row.status))throw new OperationError(409,'recordLocked');
        if(['resolve','admit','offer','order','receive','release','reconcile','close'].includes(a)&&!(['grievances','safety'].includes(key)&&a==='resolve'&&['teacher','incharge'].includes(ctx.role)&&p.requesterRole==='parent'&&row.owner_id!==ctx.userId)&&!['principal','admin','accounts'].includes(ctx.role)&&!(key==='gatePasses'&&a==='release'&&ctx.role==='security'))throw new OperationError(403,'forbidden');
        if(a==='reconcile'){
          if(ctx.role!=='accounts')throw new OperationError(403,'forbidden');if(!body.journalId)throw new OperationError(400,'referenceNotFound');
          const journal=(await tx.query('SELECT id FROM journals WHERE id=$1 AND posted=true FOR UPDATE',[body.journalId])).rows[0];if(!journal)throw new OperationError(400,'referenceNotFound');
          const cash=(await tx.query("SELECT COALESCE(sum(l.debit_paise-l.credit_paise),0)::text amount FROM journal_lines l JOIN accounts a ON a.id=l.account_id WHERE l.journal_id=$1 AND a.code='1000'",[body.journalId])).rows[0];const expected=BigInt(p.amountPaise)*(p.direction==='credit'?1n:-1n);if(BigInt(cash.amount)!==expected)throw new OperationError(400,'bankAmountMismatch');
          if((await tx.query("SELECT id FROM bank_statement_lines WHERE status='matched' AND payload->>'journalId'=$1 AND deleted_at IS NULL",[body.journalId])).rows.length)throw new OperationError(409,'journalAlreadyMatched');p.journalId=body.journalId;
        }
        if(key==='gatePasses'&&a==='release'){
          if(!['security','admin','principal'].includes(ctx.role)||!body.pickupToken||!p.pickupTokenHash||new Date(p.pickupTokenExpiresAt).getTime()<Date.now())throw new OperationError(409,'pickupVerificationRequired');
          const received=createHash('sha256').update(body.pickupToken).digest();if(!timingSafeEqual(received,Buffer.from(p.pickupTokenHash,'hex')))throw new OperationError(403,'invalidPickupPass');
          const pickup=(await tx.query("SELECT id FROM pickup_authorizations WHERE id=$1 AND student_id=$2 AND status='approved' AND deleted_at IS NULL",[p.pickupId,row.student_id])).rows[0];if(!pickup)throw new OperationError(403,'pickupVerificationRequired');
          const schoolDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(p.date!==schoolDay)throw new OperationError(409,'pickupVerificationRequired');
          delete p.pickupTokenHash;delete p.pickupTokenExpiresAt;p.releasedAt=new Date().toISOString();p.releasedBy=ctx.userId;
        }
        if(key==='dataRequests'&&a==='resolve'){if(['export','access'].includes(p.requestType))throw new OperationError(409,'prepareExportRequired');if(p.requestType==='deletion')throw new OperationError(409,'retentionReviewRequired');if(!body.reason||body.reason.length<10)throw new OperationError(400,'correctionReasonRequired');p.resolution=body.reason;}
        if(key==='admissions'&&a==='admit'){
          if(!['principal','admin'].includes(ctx.role))throw new OperationError(403,'forbidden');
          if(!p.classId||!p.admissionNumber||!p.dateOfBirth||!p.gender||!p.guardianName||!/^\+[1-9][0-9]{9,14}$/.test(p.phone))throw new OperationError(400,'admissionDetailsRequired');
          const child=await this.insert(tx,ctx,'students',{name:p.name,admissionNumber:p.admissionNumber,classId:p.classId,dateOfBirth:p.dateOfBirth,gender:p.gender,apaarState:'not_provided'});
          const klass=(await tx.query('SELECT payload FROM classes WHERE id=$1',[p.classId])).rows[0];const year=(await tx.query('SELECT payload FROM academic_years WHERE id=$1',[klass.payload.academicYearId])).rows[0];
          await this.insert(tx,ctx,'enrollments',{studentId:child.id,classId:p.classId,academicYearId:klass.payload.academicYearId,startDate:year.payload.startDate,endDate:year.payload.endDate});
          const known=(await tx.query("SELECT g.owner_id FROM guardians g JOIN memberships m ON m.user_id=g.owner_id AND m.role='parent' AND m.active=true WHERE g.deleted_at IS NULL AND g.payload->>'phone'=$1 LIMIT 1",[p.phone])).rows[0];const guardianId=known?.owner_id??(await tx.query('SELECT provision_guardian_account($1,$2,$3) AS id',[createHash('sha256').update(p.phone).digest('hex')+'@phone.identity.campus.invalid',p.guardianName,hashPassword(token())])).rows[0].id;
          await this.insert(tx,ctx,'guardians',{studentId:child.id,userId:guardianId,name:p.guardianName,relationship:'guardian',phone:p.phone,canView:true,canPickup:false});p.studentId=child.id;
        }
        if(['grievances','safety'].includes(key)&&a==='resolve'){if(!body.reason||body.reason.trim().length<3)throw new OperationError(400,'correctionReasonRequired');p.resolution=body.reason;if(row.owner_id)await this.notify(tx,ctx,row.owner_id,'caseResolved',body.reason,{recordId:row.id,audience:{kind:p.requesterRole==='parent'?'parents':'staff',classIds:[],roles:[],userIds:[]}});}
        if(key==='submissions'&&a==='review')p.feedback=body.reason??'Reviewed by your teacher.';
        next=transition[1];
      }
      const result=(await tx.query<RecordRow>(`UPDATE ${d.table} SET status=$1,published=$2,payload=$3,class_id=$4,student_id=COALESCE($6,student_id),version=version+1,updated_at=now() WHERE id=$5 RETURNING *`,[next,publish,JSON.stringify(p),p.classId??row.class_id,row.id,p.studentId??null])).rows[0];
      await this.audit(tx,ctx,`workflow.${a}`,d.table,row.id,body.reason?{reason:body.reason}:{});return this.redact(tx,ctx,key,result);
    });
  }
  private async approveLeave(tx:Queryable,ctx:Actor,key:string,row:RecordRow){
    const days=row.payload.effectiveDates??dateRange(row.payload.startDate,row.payload.endDate).filter(day=>new Date(day+'T00:00:00Z').getUTCDay()!==0);
    if(key==='leave'){
      if(row.payload.leaveType!=='unpaid'){
        const used=(await tx.query("SELECT COALESCE(sum((payload->>'dayUnits')::int),0)::int n FROM leave_requests WHERE staff_id=$1 AND status='approved' AND payload->>'leaveType'=$2 AND left(payload->>'startDate',4)=$3",[row.staff_id,row.payload.leaveType,row.payload.startDate.slice(0,4)])).rows[0].n;
        const rules=(await tx.query('SELECT operations_config FROM school_settings')).rows[0].operations_config;
        if(used+row.payload.dayUnits>rules.leaveAllowanceHalfDays)throw new OperationError(409,'insufficientLeaveBalance');
      }
      const periods=(await tx.query<RecordRow>('SELECT * FROM timetable_entries WHERE staff_id=$1 AND published=true AND deleted_at IS NULL',[row.staff_id])).rows;
      for(const day of days){
        const existing=(await tx.query("SELECT id FROM staff_attendance WHERE staff_id=$1 AND payload->>'date'=$2 AND deleted_at IS NULL",[row.staff_id,day])).rows[0];
        if(existing)await tx.query("UPDATE staff_attendance SET payload=jsonb_set(payload,'{attendance}','\"onLeave\"'),version=version+1 WHERE id=$1",[existing.id]);
        else await tx.query("INSERT INTO staff_attendance(id,school_id,owner_id,staff_id,status,payload,created_by) VALUES($1,$2,$3,$4,'active',$5,$6)",[id(),ctx.schoolId,row.owner_id,row.staff_id,JSON.stringify({staffId:row.staff_id,date:day,attendance:'onLeave'}),ctx.userId]);
        for(const period of periods.filter(p=>p.payload.weekday===new Date(day+'T00:00:00Z').getUTCDay()))await tx.query("INSERT INTO substitutions(id,school_id,owner_id,class_id,status,payload,created_by) VALUES($1,$2,$3,$4,'unassigned',$5,$3)",[id(),ctx.schoolId,ctx.userId,period.class_id,JSON.stringify({date:day,timetableId:period.id,originalStaffId:row.staff_id,leaveId:row.id}),]);
      }
    }else for(const day of days){
      const existing=(await tx.query("SELECT id FROM attendance_records WHERE student_id=$1 AND payload->>'date'=$2 AND deleted_at IS NULL",[row.student_id,day])).rows;
      for(const attendance of existing)await tx.query("UPDATE attendance_records SET payload=jsonb_set(payload,'{attendance}','\"leave\"'),version=version+1 WHERE id=$1",[attendance.id]);
    }
  }
  private async publishNotifications(tx:Queryable,ctx:Actor,row:RecordRow){
    const audience=row.audience!;let roles:string[]=audience.kind==='staff'?['teacher','hod','principal','admin','accounts','management']:audience.kind==='parents'?['parent']:audience.kind==='students'?['student']:['teacher','hod','principal','admin','accounts','management','parent'];
    if(audience.roles.length)roles=roles.filter(r=>audience.roles.includes(r as Role));
    const members=(await tx.query('SELECT DISTINCT user_id FROM memberships WHERE active=true AND role=ANY($1::text[])',[roles])).rows;
    for(const member of members){
      if(audience.kind==='people'&&!audience.userIds.includes(member.user_id))continue;
      if(audience.classIds.length){const match=(await tx.query("SELECT id FROM guardians WHERE owner_id=$1 AND class_id=ANY($2::uuid[]) AND deleted_at IS NULL AND payload->>'canView'='true' UNION ALL SELECT id FROM memberships WHERE user_id=$1 AND scope->'classes' ?| $3::text[]",[member.user_id,audience.classIds,audience.classIds])).rows;if(!match.length)continue;}
      await this.notify(tx,ctx,member.user_id,row.payload.postType==='emergency'?'emergency':row.payload.title||'School update',row.payload.body??row.payload.description??'',{recordId:row.id,audience});
    }
  }
  async audit(tx:Queryable,ctx:Actor,action:string,resource:string,resourceId?:string,metadata:Record<string,unknown>={}){await tx.query('INSERT INTO audit_logs(id,school_id,actor_id,action,resource,resource_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)',[id(),ctx.schoolId,ctx.userId,action,resource,resourceId??null,JSON.stringify(metadata)]);}
}
