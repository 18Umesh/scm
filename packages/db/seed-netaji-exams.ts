import type{Database}from'./index';
import{id}from'../auth';
import{NETAJI}from'../demo/netaji';

// Explicitly requested local demonstration data. Never resets marks entered by a tester.
export async function seedNetajiExams(db:Database){
 if(!db.embedded||process.env.NODE_ENV==='production')throw new Error('Exam sample data is local-only.');
 await db.admin.query('BEGIN');
 try{
  if((await db.admin.query("SELECT id FROM audit_logs WHERE school_id=$1 AND action='demo.examHistoryInitialized'",[NETAJI.schoolId])).rows.length){await db.admin.query('COMMIT');return;}
  const principal=NETAJI.accounts.find(a=>a.role==='principal')!;
  const classroom=(await db.admin.query("SELECT id FROM classes WHERE school_id=$1 AND payload->>'name'='Grade 4' AND payload->>'section'='A' AND deleted_at IS NULL",[NETAJI.schoolId])).rows[0];
  const students=(await db.admin.query("SELECT id FROM students WHERE school_id=$1 AND class_id=$2 AND deleted_at IS NULL ORDER BY payload->>'admissionNumber'",[NETAJI.schoolId,classroom.id])).rows;
  const specs=[
   {name:'Unit Test 1',type:'unitTest',date:'2026-06-25',max:25,pass:10,complete:true},
   {name:'Unit Test 2',type:'unitTest',date:'2026-07-24',max:25,pass:10,complete:true},
   {name:'Quarterly',type:'quarterly',date:'2026-09-18',max:100,pass:40,complete:true},
   {name:'Half Yearly',type:'halfYearly',date:'2026-10-23',max:100,pass:40,complete:true},
   {name:'Unit Test 3',type:'unitTest',date:'2026-11-06',max:25,pass:10,complete:false},
   {name:'Unit Test 4',type:'unitTest',date:'2026-11-09',max:25,pass:10,complete:false},
   {name:'Final Examination',type:'final',date:'2027-03-15',max:100,pass:40,complete:false}
  ];
  const put=async(table:string,owner:string,classId:string,studentId:string|null,payload:Record<string,unknown>,status:string,published:boolean)=>{
   const recordId=id();await db.admin.query(`INSERT INTO ${table}(id,school_id,owner_id,class_id,student_id,payload,status,published,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[recordId,NETAJI.schoolId,owner,classId,studentId,JSON.stringify(payload),status,published,principal.id]);return recordId;
  };
  for(const [subjectIndex,teacher]of NETAJI.accounts.filter(a=>a.role==='teacher').entries()){
   const subject=(await db.admin.query("SELECT id FROM subjects WHERE school_id=$1 AND payload->>'code'=$2 AND deleted_at IS NULL",[NETAJI.schoolId,['MATH','ENG','EVS'][subjectIndex]])).rows[0];
   for(const [index,spec]of specs.entries()){
    const examId=await put('exams',principal.id,classroom.id,null,{name:`${spec.name} (Demo)`,examType:spec.type,classId:classroom.id,subjectId:subject.id,date:spec.date,startTime:['09:00','10:15','11:30'][subjectIndex],endTime:['10:00','11:15','12:30'][subjectIndex],maxMarks:spec.max,passMarks:spec.pass,portions:'Fictional practice schedule and results for local testing.'},'published',true);
    if(index>4)continue;
    for(const [studentIndex,student]of students.entries()){
     if(!spec.complete&&studentIndex>2)continue;
     const base=[18,29,43,51,60,67,74,80,85,90][studentIndex];
     const score=Math.min(spec.max,Math.round((base+index*2+subjectIndex*2)/100*spec.max));
     await put('marks',teacher.id,classroom.id,student.id,{examId,studentId:student.id,subjectId:subject.id,classId:classroom.id,score,remarks:'Fictional demo result.'},spec.complete?'published':'draft',spec.complete);
    }
   }
  }
  for(const month of ['2026-06','2026-07','2026-09','2026-10']){
   let recorded=0;
   for(let day=1;recorded<12;day++){
    const date=month+'-'+String(day).padStart(2,'0');if([0,6].includes(new Date(date+'T12:00:00Z').getUTCDay()))continue;recorded++;
    for(const [index,student]of students.entries()){
     if((await db.admin.query("SELECT id FROM attendance_records WHERE school_id=$1 AND student_id=$2 AND payload->>'date'=$3 AND COALESCE(payload->>'period','0')='0' AND deleted_at IS NULL",[NETAJI.schoolId,student.id,date])).rows.length)continue;
     const absent=index===0?recorded%3===0:index===1?recorded%4===0:(recorded+index)%11===0;
     await put('attendance_records',NETAJI.accounts[0].id,classroom.id,student.id,{studentId:student.id,classId:classroom.id,date,period:0,attendance:absent?'absent':'present',reason:'Fictional demo attendance.'},'active',false);
    }
   }
  }
  await db.admin.query('INSERT INTO audit_logs(id,school_id,actor_id,action,resource,metadata) VALUES($1,$2,$3,$4,$5,$6)',[id(),NETAJI.schoolId,principal.id,'demo.examHistoryInitialized','exams',JSON.stringify({classes:1,students:10,subjects:3,demo:true})]);
  await db.admin.query('COMMIT');
 }catch(error){await db.admin.query('ROLLBACK');throw error;}
}
