import type {Queryable} from '../db';
import {OperationError,type Actor,type RecordRow} from './service';

export async function buildReportCard(tx:Queryable,ctx:Actor,row:RecordRow){
 const p=row.payload;
 const student=(await tx.query("SELECT payload,class_id FROM students WHERE id=$1 AND deleted_at IS NULL FOR SHARE",[row.student_id])).rows[0];
 const year=(await tx.query("SELECT id,payload FROM academic_years WHERE id=$1 AND deleted_at IS NULL FOR SHARE",[p.academicYearId])).rows[0];
 if(!student||!year)throw new OperationError(400,'referenceNotFound');
 let from=year.payload.startDate,to=year.payload.endDate;
 if(p.termId){const term=(await tx.query("SELECT payload FROM terms WHERE id=$1 AND deleted_at IS NULL FOR SHARE",[p.termId])).rows[0];if(!term||term.payload.academicYearId!==year.id)throw new OperationError(400,'termYearMismatch');from=term.payload.startDate;to=term.payload.endDate;}
 const assessments=(await tx.query("SELECT e.id,e.payload,m.payload AS mark,s.payload->>'name' AS subject FROM exams e JOIN subjects s ON s.id=(e.payload->>'subjectId')::uuid LEFT JOIN marks m ON m.payload->>'examId'=e.id::text AND m.student_id=$1 AND m.published=true AND m.deleted_at IS NULL WHERE e.class_id=$2 AND e.published=true AND e.deleted_at IS NULL AND e.payload->>'date'>=$3 AND e.payload->>'date'<=$4 ORDER BY e.payload->>'date',e.id",[row.student_id,student.class_id,from,to])).rows;
 if(!assessments.length||assessments.some(a=>!a.mark))throw new OperationError(409,'incompleteMarks');
 const bands=(await tx.query("SELECT payload FROM grading_scales WHERE payload->>'name'=$1 AND deleted_at IS NULL ORDER BY (payload->>'minimum')::numeric DESC",[p.gradingScale])).rows.map(r=>r.payload);
 if(!bands.length)throw new OperationError(400,'gradingScaleRequired');
 const grades:Record<string,{subjectId:string;subject:string;score:number;maximum:number;assessments:number}>={};
 for(const a of assessments){const subjectId=a.payload.subjectId;const subject=grades[subjectId]??={subjectId,subject:a.subject,score:0,maximum:0,assessments:0};subject.score+=a.mark.score;subject.maximum+=a.payload.maxMarks;subject.assessments++;}
 const subjectGrades=Object.values(grades).map(s=>{const percentageBasisPoints=Math.floor(s.score*10000/s.maximum);const grade=bands.find(b=>percentageBasisPoints>=Math.round(b.minimum*100)&&percentageBasisPoints<=Math.round(b.maximum*100));if(!grade)throw new OperationError(400,'gradingScaleGap');return{...s,percentageBasisPoints,grade:grade.grade};});
 const attendance=(await tx.query("SELECT payload->>'attendance' AS attendance,count(*)::int n FROM attendance_records WHERE student_id=$1 AND deleted_at IS NULL AND payload->>'period'='0' AND payload->>'date'>=$2 AND payload->>'date'<=$3 GROUP BY payload->>'attendance'",[row.student_id,from,to])).rows;
 const school=(await tx.query('SELECT name,city,state FROM schools')).rows[0];
 return{schemaVersion:1,school,student:{name:student.payload.name,admissionNumber:student.payload.admissionNumber},academicYear:year.payload.name,from,to,subjects:subjectGrades,totalScore:subjectGrades.reduce((n,s)=>n+s.score,0),totalMaximum:subjectGrades.reduce((n,s)=>n+s.maximum,0),attendance,assessmentCount:assessments.length,remarks:p.remarks,approvedBy:ctx.userId,approvedAt:new Date().toISOString()};
}
