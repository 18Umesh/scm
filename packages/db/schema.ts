import { pgTable, uuid, text, boolean, integer, bigint, timestamp } from 'drizzle-orm/pg-core';
// Drizzle metadata for application tooling; security policies live in reviewed SQL.
export const schoolSettings = pgTable('school_settings', {
  id: uuid().primaryKey(), schoolId: uuid('school_id').notNull(),
  aiEnabled: boolean('ai_enabled').notNull().default(false),
  aiMonthlyCapPaise: bigint('ai_monthly_cap_paise', { mode: 'bigint' }).notNull(),
  studentEnabled: boolean('student_enabled').notNull().default(false),
  version: integer().notNull().default(1), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
});
export const schoolDomains = pgTable('school_domains', { host: text().primaryKey(), schoolId: uuid('school_id').notNull(), verified: boolean().notNull(), active: boolean().notNull() });
