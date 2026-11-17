import {StudentWorkflows} from '../../../packages/operations/student';
import type{Request,Response}from 'express';
import {z}from 'zod';
import type{Database}from '../../../packages/db';
import {Operations,OperationError,type Actor}from '../../../packages/operations/service';
import {Finance}from '../../../packages/operations/finance';
import {Imports}from '../../../packages/operations/imports';
import {definitions}from '../../../packages/operations/registry';
import {translate,type Language}from '../../../packages/i18n';
import ExcelJS from 'exceljs';
import {Configuration}from '../../../packages/operations/configuration';
import{Reports}from '../../../packages/operations/reports';
import{renderPdf}from '../../worker/pdf';
import QRCode from 'qrcode';
import{formatPaise}from '../../../packages/ui/money';
import{ParentWorkflows}from '../../../packages/operations/parent';
import{ParentFiles}from '../../../packages/operations/files';
import{TeacherWorkflows,dispatchTeacherReminders}from '../../../packages/operations/teacher';
import{TeachingStudio}from '../../../packages/operations/teaching-studio';
import{Transport}from '../../../packages/operations/transport';
import{InchargeWorkflows}from '../../../packages/operations/incharge';
import{SchoolAds}from '../../../packages/operations/ads';
const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export class OperationsHttp{
 private student:StudentWorkflows;private teacher:TeacherWorkflows;private parent:ParentWorkflows;private files:ParentFiles;
 private imports:Imports;
 private config:Configuration;
 private reports:Reports;
 private transport:Transport;private ads:SchoolAds;private incharge:InchargeWorkflows;private studio:TeachingStudio;
 constructor(private db:Database,private ops:Operations,private finance:Finance){this.student=new StudentWorkflows(db,ops);this.transport=new Transport(db,ops);this.teacher=new TeacherWorkflows(db,ops);this.parent=new ParentWorkflows(db,ops);this.files=new ParentFiles(db,ops);this.imports=new Imports(db,ops);this.config=new Configuration(db);this.reports=new Reports(ops,finance);this.ads=new SchoolAds(db);this.incharge=new InchargeWorkflows(db,ops);this.studio=new TeachingStudio(db,ops);}
 openapi(){const paths:Record<string,any>={};for(const[key,d]of Object.entries(definitions)){if(!this.ops.moduleEnabled(key))continue;
   const base='/api/operations/records/'+key;
   paths[base]={get:{summary:key,security:[{session:[]}],parameters:[{in:'query',name:'page',schema:{type:'integer',minimum:1}},{in:'query',name:'limit',schema:{type:'integer',minimum:1,maximum:100}}],responses:{200:{description:'Paginated records'},403:{description:'Permission denied'}}},post:{summary:'Create '+key,security:[{session:[]}],requestBody:{required:true,content:{'application/json':{schema:z.toJSONSchema(d.schema,{io:'input'})}}},responses:{201:{description:'Created'},400:{description:'Validation failed'},403:{description:'Permission denied'}}}};
   paths[base+'/{id}']={get:{summary:'Read '+key,security:[{session:[]}],parameters:[{in:'path',name:'id',required:true,schema:{type:'string',format:'uuid'}}],responses:{200:{description:'Record'},404:{description:'Not found in authorized scope'}}},put:{summary:'Update '+key,security:[{session:[]}],parameters:[{in:'path',name:'id',required:true,schema:{type:'string',format:'uuid'}}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['version','payload'],properties:{version:{type:'integer',minimum:1},payload:z.toJSONSchema(d.schema,{io:'input'}),reason:{type:'string'}}}}}},responses:{200:{description:'Updated'},409:{description:'Version conflict or locked record'}}}};
  }return paths;}
 matches(path:string,method:string){return (['GET','POST','PUT','DELETE'].includes(method)&&/^\/operations\/(student\/(overview|feed|notifications)|transport\/(vehicles|driver|assign|session|location)|catalog|today|incharge\/overview|classTeachers|teacher\/(lms(?:\/(generate|save))?|overview|class\/[a-f0-9-]+|reminders(?:\/[a-f0-9-]+)?|syllabus\/[a-f0-9-]+|tracking|marks|post)|parent\/(bus|feed|learning|submit|book|slots|polls\/[a-f0-9-]+|privacy\/[a-f0-9-]+\/review|surveys\/[a-f0-9-]+(?:\/responses)?|cases\/[a-zA-Z]+\/[a-f0-9-]+)|files(?:\/(upload|[a-f0-9-]+))?|privacyExports\/[a-f0-9-]+|ads\/(slot|metric)|documents\/(receipt|certificate|reportCard)\/[a-f0-9-]+|reports\/[a-zA-Z]+|configuration|configuration\/(design|appManifest|save|rollback|layout|rules|domains|requestDomain|verifyDomain|appRequest|credentials|appBuilds)|studentAccounts|staffAccounts|guardianAccounts|attendance\/bulk|lookups\/[a-zA-Z]+|records\/[a-zA-Z]+(?:\/[a-f0-9-]+(?:\/actions)?)?|imports\/(preview|commit|undo|template)|finance\/(verify|demoPayment|invoiceBalances|overview|accounts|collect|receipts|trialBalance|statements|journals|journal|reverse|order|paymentLink)|exports\/[a-zA-Z]+)$/.test(path));}
 async handle(ctx:Actor,path:string,req:Request,res:Response){
  const parts=path.split('/');const group=parts[2];const key=parts[3];
  if(group==='student'){if(key==='overview'&&req.method==='GET')return res.json(await this.student.overview(ctx));if(key==='feed'&&req.method==='GET')return res.json(await this.student.feed(ctx,req.query));if(key==='notifications'&&req.method==='POST')return res.json(await this.student.readNotification(ctx,req.body));}
  if(group==='transport'){if(key==='driver'&&req.method==='POST')return res.json(await this.transport.assignDriver(ctx,req.body));if(key==='vehicles'&&req.method==='GET')return res.json(await this.transport.vehicles(ctx));if(key==='assign'&&req.method==='POST')return res.json(await this.transport.assign(ctx,req.body));if(key==='session'&&req.method==='POST')return res.json(await this.transport.session(ctx,req.body));if(key==='location'&&req.method==='POST')return res.json(await this.transport.location(ctx,req.body));}
  if(group==='incharge'&&key==='overview'&&req.method==='GET')return res.json(await this.incharge.overview(ctx,req.query));
  if(group==='classTeachers'&&req.method==='GET')return res.json(await this.ops.classTeachers(ctx));
  if(group==='classTeachers'&&req.method==='POST')return res.json(await this.ops.appointClassTeacher(ctx,req.body));
  if(group==='teacher'){
   if(key==='lms'){
    if(req.method==='GET')return res.json(await this.studio.list(ctx,z.uuid().parse(req.query.classId)));
    if(req.method==='POST'&&parts[4]==='generate')return res.json(await this.studio.generate(ctx,req.body));
    if(req.method==='POST'&&parts[4]==='save')return res.json(await this.studio.save(ctx,req.body));
   }
   if(key==='overview'&&req.method==='GET'){if(!['teacher','hod'].includes(ctx.role))throw new OperationError(403,'forbidden');await dispatchTeacherReminders(this.db,ctx.schoolId);return res.json(await this.teacher.overview(ctx));}
   if(key==='class'&&req.method==='GET')return res.json(await this.teacher.classroom(ctx,parts[4]));
   if(key==='reminders'&&req.method==='POST')return res.json(await this.teacher.reminder(ctx,req.body,parts[4]));
   if(key==='syllabus'&&req.method==='POST')return res.json(await this.teacher.progress(ctx,parts[4],req.body));
   if(key==='marks'&&req.method==='POST')return res.json(await this.ops.bulkMarks(ctx,req.body));
   if(key==='tracking'&&req.method==='POST')return res.json(await this.teacher.track(ctx,req.body));
   if(key==='post'&&req.method==='POST')return res.json(await this.teacher.post(ctx,req.body));
  }
  if(group==='parent'){
   if(key==='bus'&&req.method==='GET')return res.json(await this.transport.parent(ctx,req.query));
   if(key==='feed'&&req.method==='GET')return res.json(await this.parent.feed(ctx,req.query));
   if(key==='learning'&&req.method==='GET')return res.json(await this.parent.learning(ctx,req.query));
   if(key==='privacy'&&parts[5]==='review'&&req.method==='POST'){const result=await this.parent.reviewDeletion(ctx,parts[4],req.body);for(const fileId of result.eraseIds)await this.files.erase(ctx.schoolId,fileId);return res.json({ok:result.ok,status:result.status});}
   if(key==='slots'&&req.method==='GET')return res.json(await this.parent.slots(ctx,z.uuid().parse(req.query.studentId)));
   if(key==='book'&&req.method==='POST')return res.json(await this.parent.book(ctx,req.body));
   if(key==='submit'&&req.method==='POST')return res.json(await this.parent.submit(ctx,req.body));
   if(key==='polls'&&req.method==='POST')return res.json(await this.parent.vote(ctx,parts[4],req.body));
   if(key==='surveys'){if(parts[5]==='responses'&&req.method==='GET')return res.json(await this.parent.responses(ctx,parts[4]));if(req.method==='POST')return res.json(await this.parent.respond(ctx,parts[4],req.body));}
   if(key==='cases')return res.json(await this.parent.updates(ctx,parts[4],parts[5],req.method==='POST'?req.body:undefined));
  }
  if(group==='files'){
   if(key==='upload'&&req.method==='POST')return res.status(201).json(await this.files.upload(ctx,req.body));
   if(!key&&req.method==='GET')return res.json(await this.files.list(ctx,z.string().parse(req.query.module),z.uuid().parse(req.query.recordId)));
   if(key&&req.method==='DELETE')return res.json(await this.files.remove(ctx,key));
   if(key&&req.method==='GET'){const file=await this.files.download(ctx,key);res.type(file.mime);const ascii=file.filename.replace(/[^\x20-\x7e]/g,'_');const encoded=encodeURIComponent(file.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16));res.setHeader('Content-Disposition',`${file.mime.startsWith('image/')&&req.query.download!=='1'?'inline':'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`);if(file.mime==='application/pdf')res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");return res.send(file.buffer);}
  }
  if(group==='catalog'&&req.method==='GET')return res.json({data:await this.ops.catalog(ctx)});
  if(group==='privacyExports'&&req.method==='GET'){const data=await this.ops.privacyExport(ctx,z.uuid().parse(key));res.type('json');res.setHeader('Content-Disposition',`attachment; filename="campus-data-export-${key}.json"`);return res.send(JSON.stringify(data,null,2));}
  if(group==='today'&&req.method==='GET')return res.json(await this.ops.today(ctx));
  if(group==='ads'&&key==='slot'&&req.method==='POST')return res.json(await this.ads.slot(ctx,req.body));
  if(group==='ads'&&key==='metric'&&req.method==='POST')return res.json(await this.ads.metric(ctx,req.body));
  if(group==='reports'&&req.method==='GET')return res.json(await this.reports.get(ctx,key,req.query));
  if(group==='documents'&&req.method==='GET'){
    const lang=z.enum(['en','te','hi']).default('en').parse(req.query.lang);const documentId=z.uuid().parse(parts[4]);const format=z.enum(['html','pdf']).default('html').parse(req.query.format);let html='';let verifyToken='';
    if(key==='receipt'){
      const receipt=await this.finance.receiptDocument(ctx,documentId);verifyToken=receipt.verification_token;
      html=`${receipt.mode==='demo'?'<p style="padding:12px;border:2px solid #9b6430;font-weight:bold">FICTIONAL LOCAL TEST ? NO MONEY MOVED</p>':''}<h1>${escape(receipt.school.name)}</h1><p>${escape(receipt.school.city)}, ${escape(receipt.school.state)}</p><h2>${escape(translate(lang,'receipt'))} ${escape(receipt.series)}/${escape(receipt.financial_year)}/${escape(receipt.number)}</h2><dl><dt>${escape(translate(lang,'student'))}</dt><dd>${escape(receipt.student.name)} (${escape(receipt.student.admissionNumber)})</dd><dt>${escape(translate(lang,'amountPaise'))}</dt><dd>${escape(formatPaise(receipt.paise,lang))}</dd><dt>${escape(translate(lang,'mode'))}</dt><dd>${escape(receipt.mode)}</dd><dt>${escape(translate(lang,'reference'))}</dt><dd>${escape(receipt.reference)}</dd></dl>`;
    }else if(key==='reportCard'){
      const record=await this.ops.get(ctx,'reportCards',documentId);if(record.status!=='published')throw new OperationError(409,'recordLocked');const snapshot=record.payload.snapshot;verifyToken=record.payload.verificationToken;
      html=`<h1>${escape(snapshot.school.name)}</h1><h2>${escape(translate(lang,'reportCards'))}</h2><p>${escape(snapshot.student.name)} (${escape(snapshot.student.admissionNumber)})</p><p>${escape(snapshot.academicYear)}: ${escape(snapshot.from)} - ${escape(snapshot.to)}</p><table><thead><tr><th>${escape(translate(lang,'subjects'))}</th><th>${escape(translate(lang,'score'))}</th><th>${escape(translate(lang,'maxMarks'))}</th><th>${escape(translate(lang,'grade'))}</th></tr></thead><tbody>${snapshot.subjects.map((s:any)=>`<tr><td>${escape(s.subject)}</td><td>${escape(s.score)}</td><td>${escape(s.maximum)}</td><td>${escape(s.grade)}</td></tr>`).join('')}</tbody></table><p>${escape(snapshot.remarks)}</p>`;
    }else{
      const record=await this.ops.get(ctx,'certificates',documentId);if(record.status!=='issued')throw new OperationError(409,'recordLocked');verifyToken=record.payload.verificationToken;
      const data=await this.db.tenant(ctx.schoolId,ctx.userId,async tx=>({school:(await tx.query('SELECT name,city,state FROM schools')).rows[0],student:(await tx.query('SELECT payload FROM students WHERE id=$1',[record.student_id])).rows[0]}));
      html=`<h1>${escape(data.school.name)}</h1><h2>${escape(translate(lang,record.payload.certificateType))}</h2><p>${escape(data.student.payload.name)} · ${escape(data.student.payload.admissionNumber)}</p><p>${escape(record.payload.reason)}</p><p>${escape(record.payload.issuedOn)}</p>`;
    }
    const protocol=process.env.NODE_ENV==='production'?'https':'http';const link=`${protocol}://${req.headers.host}/api/public/verify?kind=${key}&id=${documentId}&token=${encodeURIComponent(verifyToken)}`;
    const qr=await QRCode.toDataURL(link,{width:160,margin:2});html=`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escape(translate(lang,key))}</title><style>body{font-family:system-ui;color:#17233b;padding:30px;line-height:1.8}dt{font-weight:bold}dd{margin-bottom:15px}img{width:160px}</style></head><body>${html}<img src="${qr}" alt="${escape(translate(lang,'verifyDocument'))}"><p>${escape(translate(lang,'poweredBy'))}</p></body></html>`;
    if(format==='pdf'){res.type('application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${key}-${documentId}.pdf"`);return res.send(await renderPdf(html,lang));}
    res.type('html');return res.send(html);
  }
  if(group==='configuration'){
   if(key==='design'&&req.method==='POST')return res.json(await this.config.design(ctx,req.body));
   if(key==='appManifest'&&req.method==='GET'){res.setHeader('Content-Disposition','attachment; filename=school-app-manifest.json');return res.json(await this.config.appManifest(ctx,z.uuid().parse(req.query.buildId)));}
    if(!key&&req.method==='GET')return res.json(await this.config.get(ctx));
    if(key==='save'&&req.method==='POST')return res.json(await this.config.save(ctx,req.body));
    if(key==='rollback'&&req.method==='POST')return res.json(await this.config.rollback(ctx,req.body));
    if(key==='layout'&&req.method==='POST')return res.json(await this.config.layout(ctx,req.body));
    if(key==='rules'&&req.method==='POST')return res.json(await this.config.rules(ctx,req.body));
    if(key==='domains'&&req.method==='GET')return res.json(await this.config.domains(ctx));
    if(key==='requestDomain'&&req.method==='POST')return res.json(await this.config.requestDomain(ctx,req.body));
    if(key==='verifyDomain'&&req.method==='POST')return res.json(await this.config.verifyDomain(ctx,req.body));
    if(key==='appRequest'&&req.method==='POST')return res.json(await this.config.appRequest(ctx,req.body));
    if(key==='credentials'&&req.method==='POST')return res.json(await this.config.credentials(ctx,req.body));
    if(key==='appBuilds'&&req.method==='GET')return res.json(await this.config.appBuilds(ctx));
  }
  if(group==='guardianAccounts'&&req.method==='POST')return res.json(await this.ops.provisionGuardian(ctx,req.body));
  if(group==='staffAccounts'&&req.method==='POST')return res.json(await this.ops.provisionStaff(ctx,req.body));
  if(group==='studentAccounts'&&req.method==='POST')return res.json(await this.ops.provisionStudent(ctx,req.body));
  if(group==='attendance'&&key==='bulk'&&req.method==='POST')return res.json(await this.ops.bulkAttendance(ctx,req.body));
  if(group==='lookups'&&req.method==='GET')return res.json(await this.ops.lookup(ctx,key));
  if(group==='records'){
   const recordId=parts[4];
   if(recordId)z.uuid().parse(recordId);
   if(req.method==='GET')return res.json(recordId?await this.ops.get(ctx,key,recordId):await this.ops.list(ctx,key,req.query));
   if(req.method==='POST'&&parts[5]==='actions'){const result=await this.ops.action(ctx,key,recordId,req.body);if('pickupToken'in result&&result.pickupToken)return res.json({...result,qrCode:await QRCode.toDataURL(JSON.stringify({gatePassId:recordId,token:result.pickupToken}),{width:240,margin:2})});return res.json(result);}
   if(req.method==='POST'&&!recordId)return res.status(201).json(await this.ops.create(ctx,key,req.body));
   if(req.method==='PUT'&&recordId)return res.json(await this.ops.update(ctx,key,recordId,req.body));
   if(req.method==='DELETE'&&recordId)return res.json(await this.ops.remove(ctx,key,recordId,z.object({version:z.number().int().positive()}).parse(req.body).version));
  }
  if(group==='imports'){
   if(key==='preview'&&req.method==='POST')return res.json(await this.imports.preview(ctx,req.body));
   if(key==='commit'&&req.method==='POST')return res.json(await this.imports.commit(ctx,req.body));
   if(key==='undo'&&req.method==='POST')return res.json(await this.imports.undo(ctx,z.object({batchId:z.uuid()}).parse(req.body).batchId));
   if(key==='template'&&req.method==='GET'){const name=z.enum(['students','staff','bankStatements']).parse(req.query.module);res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="${name}-template.xlsx"`);return res.send(await this.imports.template(ctx,name));}
  }
  if(group==='finance'){
   if(key==='demoPayment'&&req.method==='POST')return res.json(await this.finance.demoPayment(ctx,req.body));
   if(key==='invoiceBalances'&&req.method==='GET')return res.json(await this.finance.invoiceBalances(ctx,req.query));
   if(key==='statements'&&req.method==='GET')return res.json(await this.finance.statements(ctx,req.query));
   if(key==='journals'&&req.method==='GET')return res.json(await this.finance.journals(ctx,req.query));
   if(key==='overview'&&req.method==='GET')return res.json(await this.finance.overview(ctx));
   if(key==='accounts'&&req.method==='GET')return res.json(await this.finance.accounts(ctx));
   if(key==='collect'&&req.method==='POST')return res.json(await this.finance.collect(ctx,req.body));
   if(key==='receipts'&&req.method==='GET')return res.json(await this.finance.receipts(ctx,req.query));
   if(key==='trialBalance'&&req.method==='GET')return res.json(await this.finance.trialBalance(ctx,req.query));
   if(key==='journal'&&req.method==='POST')return res.json(await this.finance.journal(ctx,req.body));
   if(key==='reverse'&&req.method==='POST')return res.json(await this.finance.reverse(ctx,req.body));
   if(key==='paymentLink'&&req.method==='POST')return res.json(await this.finance.paymentLink(ctx,req.body));
   if(key==='verify'&&req.method==='POST')return res.json(await this.finance.verifyPayment(ctx,req.body));
   if(key==='order'&&req.method==='POST')return res.json(await this.finance.createOrder(ctx,req.body));
  }
  if(group==='exports'&&req.method==='GET'){
   const format=z.enum(['xlsx','csv','html','pdf']).default('xlsx').parse(req.query.format);const lang=z.enum(['en','te','hi']).default('en').parse(req.query.lang) as Language;const t=(s:string)=>translate(lang,s);
   const d=definitions[key];if(!d)throw new OperationError(404,'notFound');
   // Bounded export follows the same authorization and pagination as the UI.
   const list=await this.ops.list(ctx,key,{...req.query,limit:100});const fields=d.fields.filter(f=>f.key!=='reason'||!['leave','studentLeave'].includes(key));
   if(format==='html'||format==='pdf'){
    const school=await this.db.tenant(ctx.schoolId,ctx.userId,async tx=>(await tx.query('SELECT name FROM schools')).rows[0]);
    res.type('html');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
    const html=`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escape(school.name)} - ${escape(t(key))}</title><style>body{font-family:system-ui;padding:30px;color:#17233b}table{border-collapse:collapse;width:100%}td,th{padding:10px;border:1px solid #ccc;text-align:left}p{color:#5d6b82}@media print{body{padding:0}}</style></head><body><h1>${escape(school.name)}</h1><h2>${escape(t(key))}</h2><p>${list.page} / ${Math.max(1,Math.ceil(list.total/100))} · ${list.total}</p><table><thead><tr>${fields.map(f=>`<th>${escape(t(f.key))}</th>`).join('')}</tr></thead><tbody>${list.data.map(row=>`<tr>${fields.map(f=>`<td>${escape(row.payload[f.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
    if(format==='pdf'){res.type('application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${key}.pdf"`);return res.send(await renderPdf(html,lang));}return res.send(html);
   }
   const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet(key.slice(0,31));sheet.addRow(fields.map(f=>t(f.key)));
   for(const row of list.data)sheet.addRow(fields.map(f=>{const v=row.payload[f.key];return typeof v==='object'?JSON.stringify(v):typeof v==='string'&&/^[=+@-]/.test(v)?'\''+v:v??'';}));
   for(const column of sheet.columns)column.width=25;
   res.type(format==='csv'?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="${key}.${format}"`);
   return res.send(Buffer.from(format==='csv'?await workbook.csv.writeBuffer():await workbook.xlsx.writeBuffer()));
  }
  throw new OperationError(405,'notFound');
 }
}
