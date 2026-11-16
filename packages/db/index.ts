import{lockLocalDatabase}from './local-lock';
import { PGlite } from '@electric-sql/pglite';
import { Pool, type PoolClient } from 'pg';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
export type Row = Record<string, any>;
export interface Queryable { query<T extends Row = Row>(text: string, params?: any[]): Promise<{ rows: T[] }> }
export interface Database {
  tenant<T>(schoolId: string, actorId: string | undefined, fn: (tx: Queryable) => Promise<T>): Promise<T>;
  publicQuery<T extends Row = Row>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
  admin: Queryable;
  migrate(): Promise<void>;
  close(): Promise<void>;
  embedded: boolean;
}
export async function createDatabase(options: { mode?: string; dataDir?: string; url?: string; adminUrl?: string } = {}): Promise<Database> {
  const embedded = (options.mode ?? process.env.DATABASE_MODE ?? 'embedded') === 'embedded';
  if (embedded && process.env.NODE_ENV === 'production') throw new Error('Embedded database is forbidden in production');
  if (embedded && options.dataDir) await mkdir(options.dataDir,{recursive:true});
  const unlock=embedded&&options.dataDir?lockLocalDatabase(options.dataDir):undefined;
  const pglite = embedded ? new PGlite(options.dataDir) : undefined;
  const pool = embedded ? undefined : new Pool({ connectionString: options.url ?? process.env.DATABASE_URL, max: 10 });
  const adminPool = !embedded && (options.adminUrl ?? process.env.DATABASE_ADMIN_URL) ? new Pool({ connectionString: options.adminUrl ?? process.env.DATABASE_ADMIN_URL, max: 1 }) : undefined;
  const admin: Queryable = pglite ?? adminPool ?? { query: async () => { throw new Error('Admin connection is only available to the migration command'); } };
  if (pool) {
    const role = (await pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname = current_user')).rows[0];
    if (!role || role.rolsuper || role.rolbypassrls) { await pool.end(); await adminPool?.end(); throw new Error('Application database role must not bypass RLS'); }
  }
  return {
    embedded, admin,
    async publicQuery<T extends Row>(sql: string, params: any[] = []) {
      if (pglite) return pglite.transaction(async tx => { await tx.exec('SET LOCAL ROLE campus_app'); return tx.query<T>(sql, params); });
      return pool!.query<T>(sql, params);
    },
    async tenant<T>(schoolId: string, actorId: string | undefined, fn: (tx: Queryable) => Promise<T>) {
      if (!/^[0-9a-f-]{36}$/i.test(schoolId)) throw new Error('Invalid tenant');
      const run = async (tx: Queryable) => {
        // set_config(..., true) is parameterised SET LOCAL: cleared at transaction end.
        await tx.query("SELECT set_config('app.school_id',$1,true), set_config('app.actor_id',$2,true)", [schoolId, actorId ?? '']);
        if (pglite) await tx.query('SET LOCAL ROLE campus_app');
        return fn(tx);
      };
      if (pglite) return pglite.transaction(run);
      const client: PoolClient = await pool!.connect();
      try { await client.query('BEGIN'); const value = await run(client); await client.query('COMMIT'); return value; }
      catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    },
    async migrate() {
      await admin.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      const directory=resolve('packages/db/migrations');
      const files=(await readdir(directory)).filter(name=>/^\d{4}_[a-z_]+\.sql$/.test(name)).sort();
      for(const name of files) {
        if((await admin.query('SELECT name FROM schema_migrations WHERE name=$1',[name])).rows.length)continue;
        const source=await readFile(resolve(directory,name),'utf8');
        if(!/^BEGIN;/m.test(source)||!/COMMIT;\s*$/.test(source))throw new Error('Migrations must declare a transaction');
        // Filename is restricted above; record success in the migration's own transaction.
        const sql=source.replace(/COMMIT;\s*$/,`INSERT INTO schema_migrations(name) VALUES('${name}');\nCOMMIT;`);
        if(pglite)await pglite.exec(sql);else await admin.query(sql);
      }
    },
    async close() { try{await pglite?.close(); await pool?.end(); await adminPool?.end();}finally{unlock?.();} }
  };
}
