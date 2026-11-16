import type {Database} from './index';
import {NETAJI} from '../demo/netaji';
import {Operations,type Actor} from '../operations/service';
import {Finance} from '../operations/finance';
import {definitions} from '../operations/registry';

// Explicitly requested fictional examples. Add once, resume incomplete setup and
// preserve existing financial records. All posting uses the normal school APIs.
export async function seedNetajiFinance(db:Database){
 if(!db.embedded||process.env.NODE_ENV==='production')throw new Error('Finance examples are local-only.');
 const schoolId=NETAJI.schoolId;
 if((await db.admin.query("SELECT id FROM audit_logs WHERE school_id=$1 AND action='demo.financeInitializedV2'",[schoolId])).rows.length)return;
 const school=(await db.admin.query('SELECT id FROM schools WHERE id=$1',[schoolId])).rows[0];if(!school)throw new Error('Netaji school must be initialised first.');
 const actor=async(role:'accounts'|'principal'):Promise<Actor>=>{const person=NETAJI.accounts.find(a=>a.role===role)!;const m=(await db.admin.query('SELECT id FROM memberships WHERE school_id=$1 AND user_id=$2 AND role=$3 AND active=true',[schoolId,person.id,role])).rows[0];if(!m)throw new Error('Demo finance membership missing');return{schoolId,userId:person.id,membershipId:m.id,role};};
 const accounts=await actor('accounts'),principal=await actor('principal');const ops=new Operations(db),finance=new Finance(db);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());
 const offset=(days:number)=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
 const ensure=async(key:string,field:string,value:string,payload:Record<string,unknown>)=>{
  const old=(await db.admin.query(`SELECT * FROM ${definitions[key].table} WHERE school_id=$1 AND payload->>$2=$3 AND deleted_at IS NULL`,[schoolId,field,value])).rows[0];
  return old??ops.create(accounts,key,payload);
 };
 const act=async(key:string,row:any,action:string,who:Actor,states:string[])=>states.includes(row.status)?ops.action(who,key,row.id,{action,version:row.version,reason:'Fictional local demonstration.'}):row;
 const tuition=(await db.admin.query("SELECT * FROM fee_heads WHERE school_id=$1 AND payload->>'name'='Tuition' AND deleted_at IS NULL",[schoolId])).rows[0]??await ensure('feeHeads','name','Tuition (Demo)',{name:'Tuition (Demo)',taxable:false,accountCode:'4000'});
 const transport=await ensure('feeHeads','name','Transport (Demo)',{name:'Transport (Demo)',taxable:false,accountCode:'4000'});
 const classroom=(await db.admin.query("SELECT id FROM classes WHERE school_id=$1 AND payload->>'name'='Grade 4' AND payload->>'section'='A' AND deleted_at IS NULL",[schoolId])).rows[0];
 const students=(await db.admin.query("SELECT * FROM students WHERE school_id=$1 AND class_id=$2 AND deleted_at IS NULL ORDER BY payload->>'admissionNumber'",[schoolId,classroom.id])).rows;
 if(students.length!==10)throw new Error('Finance examples expect the ten Grade 4 pupils.');
 const invoices:any[]=[],receiptIds=new Map<number,string>();
 const amounts=[300000,150000,0,300000,100000,300000,0,200000,300000,0];
 for(const [i,student] of students.entries()){
  const description=`Tuition fee — ${student.payload.name} (Demo)`;
  const draft=await ensure('invoices','description',description,{studentId:student.id,feeHeadId:tuition.id,amountPaise:'300000',dueDate:offset(i===6?10:-5),description});
  await act('invoices',draft,'issue',accounts,['draft']);invoices.push(draft);
  if(amounts[i]){
   const payment=await finance.collect(accounts,{invoiceId:draft.id,amountPaise:String(amounts[i]),mode:['cash','upi','bankTransfer'][i%3],reference:`DEMO ONLY — NO MONEY MOVED — NPS-4-${String(i+1).padStart(3,'0')}`,idempotencyKey:`netaji-finance-v1-tuition-${student.id}`});
   receiptIds.set(i,payment.receiptId??payment.receipt_id);
  }
 }
 const concession=await ensure('concessions','reason','Fictional learning support concession (Demo)',{studentId:students[4].id,invoiceId:invoices[4].id,amountPaise:'50000',reason:'Fictional learning support concession (Demo)'});
 await act('concessions',concession,'approve',principal,['pending']);
 await ensure('concessions','reason','Fictional sibling concession awaiting review (Demo)',{studentId:students[9].id,invoiceId:invoices[9].id,amountPaise:'30000',reason:'Fictional sibling concession awaiting review (Demo)'});
 const refund=await ensure('refunds','reason','Fictional receipt refund example; balance reopens (Demo)',{studentId:students[8].id,receiptId:receiptIds.get(8),amountPaise:'50000',reason:'Fictional receipt refund example; balance reopens (Demo)'});
 await act('refunds',refund,'approve',principal,['pending']);
 await ensure('invoices','description','Transport fee — Aarav Reddy (Demo draft)',{studentId:students[0].id,feeHeadId:transport.id,amountPaise:'80000',dueDate:offset(15),description:'Transport fee — Aarav Reddy (Demo draft)'});
 await ensure('invoices','description','Transport fee — Ananya Rao (Demo draft)',{studentId:students[1].id,feeHeadId:transport.id,amountPaise:'80000',dueDate:offset(15),description:'Transport fee — Ananya Rao (Demo draft)'});
 await ensure('feePlans','name','Grade 4 transport instalment (Demo)',{name:'Grade 4 transport instalment (Demo)',classId:classroom.id,feeHeadId:transport.id,amountPaise:'80000',dueDate:offset(20)});
 const vendor=await ensure('vendors','name','Sri Lakshmi School Supplies (Demo)',{name:'Sri Lakshmi School Supplies (Demo)'});
 const expense=await ensure('bills','billNumber','DEMO-STATIONERY-001',{vendorId:vendor.id,amountPaise:'240000',billNumber:'DEMO-STATIONERY-001',date:today,attachmentReference:'Fictional classroom stationery; no supplier payment made.'});
 const approved=await act('bills',expense,'approve',principal,['draft']);await act('bills',approved,'pay',accounts,['approved']);
 const smallBill=await ensure('bills','billNumber','DEMO-ART-003',{vendorId:vendor.id,amountPaise:'80000',billNumber:'DEMO-ART-003',date:today,attachmentReference:'Fictional art supplies; no supplier payment made.'});
 const smallApproved=await act('bills',smallBill,'approve',principal,['draft']);await act('bills',smallApproved,'pay',accounts,['approved']);
 await ensure('bills','billNumber','DEMO-LIBRARY-002',{vendorId:vendor.id,amountPaise:'180000',billNumber:'DEMO-LIBRARY-002',date:today,attachmentReference:'Fictional library supplies, awaiting approval.'});
 const department=(await db.admin.query("SELECT id FROM departments WHERE school_id=$1 AND payload->>'name'='Primary School' AND deleted_at IS NULL",[schoolId])).rows[0];
 await ensure('budgets','name','Primary classroom resources (Demo)',{name:'Primary classroom resources (Demo)',departmentId:department.id,amountPaise:'2500000',financialYear:'2026-27'});
 await ensure('purchases','title','Reading corner supplies (Demo)',{title:'Reading corner supplies (Demo)',departmentId:department.id,vendorId:vendor.id,amountPaise:'180000',description:'Fictional purchase request for Grade 4 books and learning supplies.'});
 await ensure('cashier','reason','Fictional opening cash counter (Demo)',{date:today,openingPaise:'500000',reason:'Fictional opening cash counter (Demo)'});
 const receiptJournal=(await db.admin.query('SELECT journal_id FROM receipts WHERE id=$1',[receiptIds.get(1)])).rows[0];
 await ensure('bankStatements','reference','DEMO-UPI-ANANYA-001',{date:today,reference:'DEMO-UPI-ANANYA-001',amountPaise:'150000',direction:'credit',journalId:receiptJournal.journal_id});
 await ensure('bankStatements','reference','DEMO-UNMATCHED-002',{date:today,reference:'DEMO-UNMATCHED-002',amountPaise:'45000',direction:'debit'});
 const config=await ensure('taxSettings','name','Fictional payroll settings — not accountant confirmed (Demo)',{name:'Fictional payroll settings — not accountant confirmed (Demo)',effectiveFrom:today,effectiveTo:offset(365),rateBasisPoints:0,accountantConfirmed:false});
 const payroll=await ensure('payroll','name','Teacher salary preview (Demo — unposted)',{name:'Teacher salary preview (Demo — unposted)',month:today.slice(0,7),grossPaise:'10000000',deductionsPaise:'1000000',statutoryConfigurationId:config.id});
 for(const [i,person] of NETAJI.accounts.filter(a=>a.role==='teacher').entries()){
  const staff=(await db.admin.query('SELECT id FROM staff WHERE school_id=$1 AND owner_id=$2 AND deleted_at IS NULL',[schoolId,person.id])).rows[0];
  const exists=(await db.admin.query("SELECT id FROM payslips WHERE school_id=$1 AND staff_id=$2 AND payload->>'payrollId'=$3 AND deleted_at IS NULL",[schoolId,staff.id,payroll.id])).rows.length;
  if(!exists)await ops.create(accounts,'payslips',{staffId:staff.id,payrollId:payroll.id,grossPaise:['3500000','3300000','3200000'][i],deductionsPaise:['350000','330000','320000'][i]});
 }
 await db.tenant(schoolId,accounts.userId,tx=>ops.audit(tx,accounts,'demo.financeInitializedV2','schools',schoolId,{fictional:true,students:10,issuedInvoices:10,draftInvoices:2,payments:7}));
}
