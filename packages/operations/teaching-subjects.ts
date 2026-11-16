import type{Queryable}from'../db';

// Only school-published teaching assignments grant access. Class-teacher status,
// draft timetable entries and ownership of old marks do not grant subject access.
// Arguments are internal SQL expressions/parameter placeholders, never user input.
export const teachingSubjectsSql=(user:string,classId:string)=>`SELECT DISTINCT t.payload->>'subjectId' FROM timetable_entries t JOIN staff s ON s.id=t.staff_id JOIN subjects subject ON subject.id::text=t.payload->>'subjectId' WHERE s.owner_id=${user}::uuid AND s.deleted_at IS NULL AND s.status='active' AND t.class_id=${classId}::uuid AND t.published=true AND t.deleted_at IS NULL AND subject.deleted_at IS NULL`;
export async function teachingSubjects(tx:Queryable,userId:string,classId:string){
 return(await tx.query(`SELECT subject_id FROM (${teachingSubjectsSql('$1','$2')}) AS assigned(subject_id)`,[userId,classId])).rows.map(r=>r.subject_id as string);
}
export const classTeacherSql=(user:string,classId:string)=>`SELECT 1 FROM classes classroom JOIN staff class_teacher ON class_teacher.id::text=classroom.payload->>'classTeacherId' WHERE classroom.id=${classId}::uuid AND classroom.deleted_at IS NULL AND class_teacher.owner_id=${user}::uuid AND class_teacher.deleted_at IS NULL AND class_teacher.status='active'`;
export async function isClassTeacher(tx:Queryable,userId:string,classId:string){
 return(await tx.query(`SELECT EXISTS(${classTeacherSql('$1','$2')}) AS appointed`,[userId,classId])).rows[0].appointed as boolean;
}
