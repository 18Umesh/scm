import ExcelJS from 'exceljs';
import {Readable} from 'node:stream';
import {z} from 'zod';
import type{Database}from '../db';
import {id,digest}from '../auth';
import {Operations,OperationError,type Actor}from './service';
import {definitions}from './registry';
export class Imports{
 constructor(private db:Database,private ops:Operations){}
 private allowed(ctx:Actor,key:string){return key==='bankStatements'?ctx.role==='accounts':['students','staff'].includes(key)&&['principal','admin'].includes(ctx.role);}
 async template(ctx:Actor,key:string){if(!this.allowed(ctx,key))throw new OperationError(403,'forbidden');const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet(key);sheet.addRow(definitions[key].fields.map(f=>f.key));sheet.getRow(1).font={bold:true};for(const column of sheet.columns)column.width=24;return Buffer.from(await workbook.xlsx.writeBuffer());}
 async preview(ctx:Actor,input:unknown){
  const body=z.object({module:z.enum(['students','staff','bankStatements']),format:z.enum(['xlsx','csv']),fileBase64:z.string().max(9*1024*1024),mapping:z.record(z.string(),z.string()).default({})}).strict().parse(input);
  if(!this.allowed(ctx,body.module))throw new OperationError(403,'forbidden');
  const file=Buffer.from(body.fileBase64,'base64');if(!file.length||file.length>6*1024*1024)throw new OperationError(400,'fileTooLarge');
  if(body.format==='xlsx'){
   let expanded=0,entries=0;
   for(let i=0;i<file.length-46;i++)if(file.readUInt32LE(i)===0x02014b50){expanded+=file.readUInt32LE(i+24);entries++;const length=file.readUInt16LE(i+28);const filename=file.subarray(i+46,i+46+length).toString();if(/vbaProject|\.bin$/i.test(filename))throw new OperationError(400,'unsafeSpreadsheet');}
   if(expanded>32*1024*1024||entries>2000)throw new OperationError(400,'fileTooLarge');
  }
  const workbook=new ExcelJS.Workbook();if(body.format==='xlsx')await workbook.xlsx.load(file as any);else await workbook.csv.read(Readable.from([file]));
  const sheet=workbook.worksheets[0];if(!sheet||sheet.rowCount>5001||sheet.columnCount>100)throw new OperationError(400,'invalidInput');
  const headers:string[]=[];sheet.getRow(1).eachCell({includeEmpty:true},(cell,col)=>{headers[col-1]=cell.text.trim();});
  const mapping:Record<string,string>={};const fields=definitions[body.module].fields;for(const header of headers){const normal=header.toLowerCase().replace(/[^a-z0-9]/g,'');const target=body.mapping[header]??fields.find(f=>f.key.toLowerCase()===normal)?.key;if(target)mapping[header]=target;}
  const errors:{row:number;field:string;code:string}[]=[];const rows:Record<string,any>[]=[];
  sheet.eachRow((row,index)=>{if(index===1||!row.hasValues)return;const value:Record<string,any>={};row.eachCell({includeEmpty:true},(cell,col)=>{const field=mapping[headers[col-1]];if(!field)return;if(cell.type===ExcelJS.ValueType.Formula){errors.push({row:index,field,code:'unsafeSpreadsheet'});return;}let v:any=cell.value instanceof Date?cell.value.toISOString().slice(0,10):cell.value;if(v&&typeof v==='object')v=cell.text;if(v===null||v==='')return;if(fields.find(f=>f.key===field)?.type==='money'&&typeof v==='number'){if(!Number.isSafeInteger(v)||v<0){errors.push({row:index,field,code:'invalidAmount'});return;}v=String(v);}if(fields.find(f=>f.key===field)?.type==='checkbox')v=String(v).toLowerCase()==='true'||v===1;value[field]=v;});rows.push({...value,__row:index});});
  return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
   const clean:Record<string,any>[]=[];const seen=new Set<string>();
   for(const raw of rows){const row=raw.__row;delete raw.__row;
    for(const [field,target]of Object.entries(definitions[body.module].references??{}))if(raw[field]&&!z.uuid().safeParse(raw[field]).success){const matches=(await tx.query(`SELECT id FROM ${definitions[target].table} WHERE payload->>'name'=$1 AND deleted_at IS NULL`,[String(raw[field])])).rows;if(matches.length===1)raw[field]=matches[0].id;}
    const parsed=definitions[body.module].schema.safeParse(raw);if(!parsed.success){for(const issue of parsed.error.issues)errors.push({row,field:issue.path.join('.'),code:'invalidInput'});continue;}
    const bank=body.module==='bankStatements';const unique=bank?JSON.stringify([parsed.data.date,parsed.data.reference,parsed.data.amountPaise,parsed.data.direction]):body.module==='students'?parsed.data.admissionNumber:parsed.data.employeeNumber;
    if(seen.has(String(unique)))errors.push({row,field:body.module==='students'?'admissionNumber':'employeeNumber',code:'duplicateRecord'});seen.add(String(unique));
    const uniqueField=bank?'reference':body.module==='students'?'admissionNumber':'employeeNumber';if(bank){if((await tx.query("SELECT id FROM bank_statement_lines WHERE payload->>'date'=$1 AND payload->>'reference'=$2 AND payload->>'amountPaise'=$3 AND payload->>'direction'=$4 AND deleted_at IS NULL",[parsed.data.date,parsed.data.reference,parsed.data.amountPaise,parsed.data.direction])).rows.length)errors.push({row,field:'reference',code:'duplicateRecord'});}else if((await tx.query(`SELECT id FROM ${definitions[body.module].table} WHERE payload->>$1=$2 AND deleted_at IS NULL`,[uniqueField,String(unique)])).rows.length)errors.push({row,field:uniqueField,code:'duplicateRecord'});
    for(const [field,target]of Object.entries(definitions[body.module].references??{})){const v=parsed.data[field];if(v&&!(await tx.query(`SELECT id FROM ${definitions[target].table} WHERE id=$1 AND deleted_at IS NULL`,[v])).rows.length)errors.push({row,field,code:'referenceNotFound'});}
    clean.push(parsed.data);
   }
   const batchId=id();const approvalToken=digest(JSON.stringify(clean)+tokenSalt());await tx.query("INSERT INTO import_batches(id,school_id,owner_id,status,payload,created_by) VALUES($1,$2,$3,'preview',$4,$3)",[batchId,ctx.schoolId,ctx.userId,JSON.stringify({module:body.module,rows:clean,errors,approvalToken,mapping})]);
   return{batchId,approvalToken,mapping,totalRows:rows.length,validRows:clean.length,errors,sample:clean.slice(0,5)};
  });
 }
 async commit(ctx:Actor,input:unknown){if(!['principal','admin','accounts'].includes(ctx.role))throw new OperationError(403,'forbidden');const body=z.object({batchId:z.uuid(),approvalToken:z.string().length(64)}).strict().parse(input);return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
  const batch=(await tx.query("SELECT * FROM import_batches WHERE id=$1 AND owner_id=$2 FOR UPDATE",[body.batchId,ctx.userId])).rows[0];if(!batch||batch.status!=='preview'||batch.payload.approvalToken!==body.approvalToken)throw new OperationError(409,'versionConflict');if(!this.allowed(ctx,batch.payload.module))throw new OperationError(403,'forbidden');if(batch.payload.errors.length)throw new OperationError(400,'importHasErrors');
  const ids:string[]=[];for(const row of batch.payload.rows){const inserted=await this.ops.insert(tx,ctx,batch.payload.module,row);ids.push(inserted.id);}
  await tx.query("UPDATE import_batches SET status='committed',payload=payload||$1::jsonb,version=version+1 WHERE id=$2",[JSON.stringify({recordIds:ids}),batch.id]);return{ok:true,imported:ids.length,batchId:batch.id};
 });}
 async undo(ctx:Actor,batchId:string){if(!['principal','admin','accounts'].includes(ctx.role))throw new OperationError(403,'forbidden');z.uuid().parse(batchId);return this.db.tenant(ctx.schoolId,ctx.userId,async tx=>{
  const batch=(await tx.query("SELECT * FROM import_batches WHERE id=$1 AND owner_id=$2 AND status='committed' FOR UPDATE",[batchId,ctx.userId])).rows[0];if(!batch)throw new OperationError(404,'notFound');
  if(!this.allowed(ctx,batch.payload.module))throw new OperationError(403,'forbidden');const ids=batch.payload.recordIds;const table=definitions[batch.payload.module].table;
  const modified=(await tx.query(`SELECT id FROM ${table} WHERE id=ANY($1::uuid[]) AND version<>1`,[ids])).rows;if(modified.length)throw new OperationError(409,'importInUse');
  for(const d of Object.values(definitions)){if(d.table===table)continue;const referenced=(await tx.query(`SELECT id FROM ${d.table} WHERE deleted_at IS NULL AND (student_id=ANY($1::uuid[]) OR staff_id=ANY($1::uuid[])) LIMIT 1`,[ids])).rows;if(referenced.length)throw new OperationError(409,'importInUse');}
  await tx.query(`UPDATE ${table} SET deleted_at=now(),version=version+1 WHERE id=ANY($1::uuid[])`,[ids]);await tx.query("UPDATE import_batches SET status='undone',version=version+1 WHERE id=$1",[batch.id]);return{ok:true};
 });}
}
function tokenSalt(){return id();}
