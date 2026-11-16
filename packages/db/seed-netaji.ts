import type{Database}from './index';
import{id,hashPassword,protectIdentitySecret}from'../auth';
import{NETAJI}from'../demo/netaji';
import{definitions}from'../operations/registry';
import{ensureAccounts}from'../ledger';
import{seedNetajiClasses}from './seed-netaji-classes';
import{seedNetajiExams}from './seed-netaji-exams';
import{seedNetajiFinance}from './seed-netaji-finance';
import{seedNetajiIncharge}from './seed-netaji-incharge';
import{seedNetajiParent}from './seed-netaji-parent';
import{seedNetajiTransport}from './seed-netaji-transport';

export async function seedNetaji(db:Database){
 if(!db.embedded||process.env.NODE_ENV==='production')throw new Error('Netaji sample setup is local-only.');
 const schools=(await db.admin.query('SELECT id FROM schools')).rows;
 if(schools.length){if(schools.length===1&&schools[0].id===NETAJI.schoolId){await seedNetajiClasses(db);await seedNetajiExams(db);await seedNetajiFinance(db);await seedNetajiIncharge(db);await seedNetajiParent(db);await seedNetajiTransport(db);return;}throw new Error('This database contains another demo. Use the dedicated .data/netaji-campus directory.');}
 await db.admin.query('BEGIN');
 try{
  const password=hashPassword(NETAJI.password),principal=NETAJI.accounts.find(a=>a.role==='principal')!,hod=NETAJI.accounts.find(a=>a.role==='hod')!,accounts=NETAJI.accounts.find(a=>a.role==='accounts')!;
  for(const person of NETAJI.accounts)await db.admin.query('INSERT INTO users(id,email,display_name,password_hash,totp_secret) VALUES($1,$2,$3,$4,$5)',[person.id,person.email,person.name,password,['principal','accounts'].includes(person.role)?protectIdentitySecret(NETAJI.totpSecret):null]);
  await db.admin.query('INSERT INTO schools(id,name,short_name,city,state,verified) VALUES($1,$2,$3,$4,$4,true)',[NETAJI.schoolId,NETAJI.name,NETAJI.shortName,'Not configured']);
  for(const host of ['localhost','127.0.0.1','10.0.2.2','netaji.localhost','netaji.campus.test'])await db.admin.query('INSERT INTO school_domains(host,school_id,verified,school_verified,active) VALUES($1,$2,true,true,true)',[host,NETAJI.schoolId]);
  for(const person of NETAJI.accounts)await db.admin.query('INSERT INTO memberships(id,school_id,user_id,role,scope,created_by) VALUES($1,$2,$3,$4,$5,$6)',[id(),NETAJI.schoolId,person.id,person.role,'{}',principal.id]);
  await db.admin.query('INSERT INTO school_settings(id,school_id,created_by) VALUES($1,$2,$3)',[id(),NETAJI.schoolId,principal.id]);
  await db.admin.query('INSERT INTO school_branding(id,school_id,accent,config,created_by) VALUES($1,$2,$3,$4,$5)',[id(),NETAJI.schoolId,'#315f50',JSON.stringify({name:NETAJI.name,shortName:NETAJI.shortName,motto:'Learning with purpose',logoPath:'/netaji-school.svg',logoWidth:1024,terms:{class:'Class',hod:'HOD'},demoScenario:'netaji-grade4'}),principal.id]);
  const put=async(key:string,payload:Record<string,any>,owner:string=principal.id,status=definitions[key].initialStatus??'active',published=false)=>{
   const recordId=id();await db.admin.query(`INSERT INTO ${definitions[key].table}(id,school_id,owner_id,class_id,student_id,staff_id,payload,status,published,audience,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[recordId,NETAJI.schoolId,owner,payload.classId??null,payload.studentId??null,payload.staffId??null,JSON.stringify(payload),status,published,payload.audience?JSON.stringify(payload.audience):null,principal.id]);return recordId;
  };
  const year=await put('academicYears',{name:'2026–2027',startDate:'2026-06-01',endDate:'2027-04-30'});
  await put('terms',{name:'Term 2',academicYearId:year,startDate:'2026-10-01',endDate:'2027-03-31'});
  const primary=await put('departments',{name:'Primary School',hodUserId:hod.id}),leadership=await put('departments',{name:'School Leadership'}),finance=await put('departments',{name:'Finance'});
  const staff=new Map<string,string>();
  for(const [index,person]of NETAJI.accounts.filter(a=>a.role!=='parent').entries()){
   const departmentId=person.role==='principal'?leadership:person.role==='accounts'?finance:primary;
   const managerUserId=person.role==='teacher'?hod.id:person.role==='principal'?undefined:principal.id;
   staff.set(person.id,await put('staff',{name:person.name,employeeNumber:'NPS-STAFF-'+String(index+1).padStart(2,'0'),userId:person.id,departmentId,...(managerUserId?{managerUserId}:{}),designation:person.role==='teacher'?person.subject+' Teacher':person.role==='hod'?'Head of Primary School':person.role==='principal'?'Principal':person.role==='incharge'?'Class Incharge':'Accounts Officer',joinedOn:'2026-06-01'},person.id));
  }
  const classId=await put('classes',{name:'Grade 4',section:'A',academicYearId:year,classTeacherId:staff.get(NETAJI.accounts[0].id),studentLoginEnabled:false});
  for(const person of NETAJI.accounts.filter(a=>['teacher','hod'].includes(a.role)))await db.admin.query('UPDATE memberships SET scope=$1 WHERE user_id=$2 AND school_id=$3',[JSON.stringify({classes:[classId],departments:[primary]}),person.id,NETAJI.schoolId]);
  for(const [index,name]of NETAJI.students.entries()){
   const studentId=await put('students',{name,admissionNumber:'NPS-4-'+String(index+1).padStart(3,'0'),classId,dateOfBirth:'2017-'+String(index%12+1).padStart(2,'0')+'-15',gender:'notProvided',apaarState:'not_provided'});
   if(index<3){const parent=NETAJI.accounts.filter(a=>a.role==='parent')[index];await put('guardians',{name:parent.name,studentId,classId,userId:parent.id,relationship:'guardian',phone:'+91000000010'+(index+1),canView:true,canPickup:false},parent.id);}
  }
  const times=[['09:00','09:45'],['09:50','10:35'],['10:50','11:35']];
  for(const [index,person]of NETAJI.accounts.filter(a=>a.role==='teacher').entries()){
   const subjectId=await put('subjects',{name:person.subject,code:['MATH','ENG','EVS'][index]});
   for(const weekday of [1,2,3,4,5])await put('timetable',{classId,subjectId,staffId:staff.get(person.id),weekday,period:index+1,startTime:times[index][0],endTime:times[index][1],room:'Grade 4 A'},principal.id,'published',true);
  }
  await put('feeHeads',{name:'Tuition',taxable:false,accountCode:'4000'},accounts.id);
  await ensureAccounts(db.admin,NETAJI.schoolId,accounts.id);
  await put('feed',{title:'Welcome to Grade 4',body:'Welcome to Netaji Public School. This space brings our Grade 4 teachers and families together.',postType:'notice',requiredAcknowledgement:false,audience:{kind:'both',classIds:[classId],roles:[],userIds:[]}},principal.id,'published',true);
  await db.admin.query('INSERT INTO audit_logs(id,school_id,actor_id,action,resource,metadata) VALUES($1,$2,$3,$4,$5,$6)',[id(),NETAJI.schoolId,principal.id,'demo.netajiInitialized','schools',JSON.stringify({students:10,teachers:3,hod:1,principal:1,accounts:1,parents:3})]);
  await db.admin.query('COMMIT');
 }catch(error){await db.admin.query('ROLLBACK');throw error;}
 await seedNetajiClasses(db);
 await seedNetajiExams(db);
 await seedNetajiFinance(db);
 await seedNetajiIncharge(db);
 await seedNetajiParent(db);await seedNetajiTransport(db);
}
