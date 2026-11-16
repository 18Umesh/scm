import{dispatchTeacherReminders}from '../../packages/operations/teacher';
import'dotenv/config';
import{createDatabase}from'../../packages/db';
import{processOutbox,expirePrivacyExports}from'./outbox';
async function main(){if((process.env.DATABASE_MODE??'embedded')==='embedded')throw new Error('Use the API embedded worker for the local database; standalone workers require PostgreSQL');const db=await createDatabase();let stopping=false;for(const signal of['SIGINT','SIGTERM']as const)process.on(signal,()=>{stopping=true;});while(!stopping){const schools=(await db.publicQuery('SELECT DISTINCT school_id FROM school_domains WHERE active=true LIMIT 100')).rows;for(const school of schools){await processOutbox(db,school.school_id);await expirePrivacyExports(db,school.school_id);await dispatchTeacherReminders(db,school.school_id);}await new Promise(resolve=>setTimeout(resolve,1000));}await db.close();}
main().catch(()=>{console.error('Worker startup failed');process.exit(1);});
