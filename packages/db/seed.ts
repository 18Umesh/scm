import type { Database } from './index';
import{sampleNames}from './demo-names';
import { hashPassword, id } from '../auth';
export const DEMO = {
  schools: ['019a5000-0000-7000-8000-000000000001', '019a5000-0000-7000-8000-000000000002'],
  users: { admin: '019a5000-0000-7000-8000-000000000010', teacher: '019a5000-0000-7000-8000-000000000011', parent: '019a5000-0000-7000-8000-000000000012', principal: '019a5000-0000-7000-8000-000000000013' },
  password: 'CampusDemo!2026', totpSecret: 'JBSWY3DPEHPK3PXP'
};
export async function seed(db: Database) {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seed forbidden in production');
  if ((await db.admin.query('SELECT id FROM schools LIMIT 1')).rows.length) return;
  const password = hashPassword(DEMO.password);
  for (const [role,userId] of Object.entries(DEMO.users)) {
    await db.admin.query('INSERT INTO users(id,email,display_name,password_hash,totp_secret) VALUES($1,$2,$3,$4,$5)', [userId,`${role}@demo.campus.test`,sampleNames[role as keyof typeof sampleNames],password,role === 'principal' ? DEMO.totpSecret : null]);
  }
  for (let i=0; i<2; i++) {
    const schoolId = DEMO.schools[i];
    await db.admin.query('INSERT INTO schools(id,name,short_name,city,state,verified) VALUES($1,$2,$3,$4,$5,true)', [schoolId,i ? 'Riverdale Demo School' : 'Greenfield Demo School',i ? 'Riverdale' : 'Greenfield',i ? 'Vijayawada' : 'Hyderabad',i ? 'Andhra Pradesh' : 'Telangana']);
    const hosts = i ? ['riverdale.localhost','riverdale.campus.test'] : ['localhost','127.0.0.1','10.0.2.2','greenfield.localhost','greenfield.campus.test'];
    for (const host of hosts) await db.admin.query('INSERT INTO school_domains(host,school_id,verified,school_verified,active) VALUES($1,$2,true,true,true)',[host,schoolId]);
    for (const [role,userId] of Object.entries(DEMO.users)) {
      await db.admin.query('INSERT INTO memberships(id,school_id,user_id,role,scope) VALUES($1,$2,$3,$4,$5)',[id(),schoolId,userId,role,JSON.stringify(role==='teacher'? { classes: ['demo-class-a'] }: {})]);
    }
    // The same person is also a parent. Context switching never changes host/school.
    await db.admin.query("INSERT INTO memberships(id,school_id,user_id,role) VALUES($1,$2,$3,'parent')",[id(),schoolId,DEMO.users.teacher]);
    await db.admin.query('INSERT INTO school_settings(id,school_id) VALUES($1,$2)',[id(),schoolId]);
    await db.admin.query('INSERT INTO school_branding(id,school_id,accent) VALUES($1,$2,$3)',[id(),schoolId,i ? '#6D48A5' : '#0F7C8A']);
  }
}
