import'dotenv/config';
import{Pool}from 'pg';
import{z}from'zod';
import{id}from'../packages/auth';
async function main(){
 const schoolId=z.uuid().parse(process.argv[2]);const actor=z.uuid().parse(process.env.ADMIN_ACTOR_ID);
 if(!process.env.DATABASE_ADMIN_URL)throw new Error('A separate migration/reviewer database URL is required');
 if(process.argv[3]!=='--approve-reviewed-documents')throw new Error('Review recognition, authorised contact, DPA and logo rights before using --approve-reviewed-documents');
 const pool=new Pool({connectionString:process.env.DATABASE_ADMIN_URL,max:1});const client=await pool.connect();try{
  await client.query('BEGIN');const record=(await client.query('SELECT * FROM school_verifications WHERE school_id=$1 FOR UPDATE',[schoolId])).rows[0];if(!record||record.status!=='pending')throw new Error('No pending verification exists');
  await client.query('UPDATE schools SET verified=true,version=version+1 WHERE id=$1',[schoolId]);await client.query("UPDATE school_verifications SET status='approved',payload=payload||$1::jsonb,version=version+1 WHERE school_id=$2",[JSON.stringify({reviewer:actor,reviewedAt:new Date().toISOString()}),schoolId]);
  await client.query('UPDATE school_domains SET verified=true,school_verified=true,active=true WHERE school_id=$1',[schoolId]);await client.query("INSERT INTO audit_logs(id,school_id,actor_id,action,resource,resource_id) VALUES($1,$2,$3,'school.verified','school_verifications',$4)",[id(),schoolId,actor,record.id]);await client.query('COMMIT');console.log('Reviewed school activated.');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Verification failed');process.exit(1);});
