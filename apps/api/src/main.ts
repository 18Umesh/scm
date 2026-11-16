import{seedNetaji}from '../../../packages/db/seed-netaji';
import{dispatchTeacherReminders}from '../../../packages/operations/teacher';
import 'dotenv/config';
import { createDatabase } from '../../../packages/db';
import{processOutbox,expirePrivacyExports}from'../../worker/outbox';
import { createApp } from './app';
async function main() {
  const embedded = (process.env.DATABASE_MODE ?? 'embedded') === 'embedded';
  const db = await createDatabase({dataDir:embedded ? '.data/netaji-campus' : undefined});
  if(embedded){await db.migrate();await seedNetaji(db);}
  const app = await createApp(db);
  const timers:ReturnType<typeof setInterval>[]=[];
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port,process.env.API_BIND ?? '127.0.0.1');
  console.log(`Campus API listening on ${port} (${embedded ? 'local demo' : 'PostgreSQL'})`);
  if(process.env.RUN_WORKER==='true'){let processing=false;const timer=setInterval(async()=>{if(processing)return;processing=true;try{for(const schoolId of new Set((await db.publicQuery('SELECT school_id FROM school_domains WHERE active=true LIMIT 100')).rows.map(r=>r.school_id))){await processOutbox(db,schoolId);await expirePrivacyExports(db,schoolId);await dispatchTeacherReminders(db,schoolId);}}catch{console.error('Outbox processing failed');}finally{processing=false;}},1000);timers.push(timer);timer.unref();}
  if(embedded&&process.env.RUN_WORKER!=='true'){let scheduling=false;const reminderTimer=setInterval(async()=>{if(scheduling)return;scheduling=true;try{const schools=await db.publicQuery('SELECT DISTINCT school_id FROM school_domains WHERE active=true LIMIT 100');for(const school of schools.rows)await dispatchTeacherReminders(db,school.school_id);}catch{console.error('Reminder scheduling failed');}finally{scheduling=false;}},15000);timers.push(reminderTimer);reminderTimer.unref();}
  let closing=false;const shutdown=async()=>{if(closing)return;closing=true;for(const timer of timers)clearInterval(timer);await app.close();await db.close();process.exit(0);};
  for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>void shutdown());
  process.on('message',message=>{if(message==='campus:shutdown')void shutdown();});
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Startup failed'); process.exit(1); });
