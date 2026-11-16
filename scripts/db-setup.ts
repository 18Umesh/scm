import 'dotenv/config';
import { createDatabase } from '../packages/db';
import{seedNetaji}from '../packages/db/seed-netaji';
async function main() {
  const db = await createDatabase({dataDir:'.data/netaji-campus'});
  try { await db.migrate(); if(db.embedded)await seedNetaji(db); console.log('Database migration complete.'); }
  finally { await db.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Database setup failed'); process.exit(1); });
