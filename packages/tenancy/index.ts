import type { Database } from '../db';
export function normalizeHost(host: string): string | null {
  // IPv6 is intentionally not an approved school host. Reject lists, paths, Unicode and userinfo.
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host) || host.includes('..')) return null;
  const value = host.toLowerCase().split(':')[0];
  if (value.length > 253 || value.startsWith('.') || value.endsWith('.')) return null;
  return value;
}
export class TenantResolver {
  constructor(private db: Database) {}
  async resolve(rawHost: string) {
    const host = normalizeHost(rawHost); if (!host) return null;
    const result = await this.db.publicQuery<{ school_id: string }>('SELECT school_id FROM school_domains WHERE host=$1 AND verified=true AND school_verified=true AND active=true',[host]);
    if(!result.rows[0])return null;
    const schoolId=result.rows[0].school_id;
    const school=await this.db.tenant(schoolId,undefined,tx=>tx.query('SELECT verified FROM schools'));
    return school.rows[0]?.verified ? { schoolId,host } : null;
  }
}
