import type { Queryable } from '../db';
import { id } from '../auth';
export type JournalLine={accountId:string;debitPaise:string;creditPaise:string};
export async function ensureAccounts(tx:Queryable,schoolId:string,actorId?:string){for(const [code,name,kind]of[['1000','Cash and bank','asset'],['1100','Fees receivable','asset'],['4000','School fee income','income'],['5000','School expenses','expense'],['2100','Payroll payable','liability']])await tx.query('INSERT INTO accounts(id,school_id,code,name,kind,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(school_id,code) DO NOTHING',[id(),schoolId,code,name,kind,actorId??null]);}
export async function postByCodes(tx:Queryable,schoolId:string,actorId:string,input:{date:string;description:string;debitCode:string;creditCode:string;amountPaise:string}){
 await ensureAccounts(tx,schoolId,actorId);const chart=(await tx.query('SELECT id,code FROM accounts WHERE code=ANY($1::text[])',[[input.debitCode,input.creditCode]])).rows;
 return postJournal(tx,schoolId,actorId,{date:input.date,description:input.description,lines:[{accountId:chart.find(r=>r.code===input.debitCode)!.id,debitPaise:input.amountPaise,creditPaise:'0'},{accountId:chart.find(r=>r.code===input.creditCode)!.id,debitPaise:'0',creditPaise:input.amountPaise}]});
}
export function balanced(lines:JournalLine[]){let debit=0n,credit=0n;if(lines.length<2)return false;for(const line of lines){if(!/^\d+$/.test(line.debitPaise)||!/^\d+$/.test(line.creditPaise))return false;const d=BigInt(line.debitPaise),c=BigInt(line.creditPaise);if(!((d>0n&&c===0n)||(c>0n&&d===0n)))return false;debit+=d;credit+=c;}return debit>0n&&debit===credit;}
export async function postJournal(tx:Queryable,schoolId:string,actorId:string|undefined,input:{date:string;description:string;lines:JournalLine[];reversalOf?:string}){
 if(!balanced(input.lines))throw new Error('unbalancedJournal');
 const locked=(await tx.query("SELECT id FROM locked_periods WHERE status='approved' AND deleted_at IS NULL AND payload->>'startDate'<=$1 AND payload->>'endDate'>=$1",[input.date])).rows;if(locked.length)throw new Error('periodLocked');
 const journalId=id();await tx.query('INSERT INTO journals(id,school_id,date,description,created_by,reversal_of) VALUES($1,$2,$3,$4,$5,$6)',[journalId,schoolId,input.date,input.description,actorId??null,input.reversalOf??null]);
 for(const line of input.lines)await tx.query('INSERT INTO journal_lines(id,school_id,journal_id,account_id,debit_paise,credit_paise,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[id(),schoolId,journalId,line.accountId,line.debitPaise,line.creditPaise,actorId??null]);
 await tx.query('UPDATE journals SET posted=true,version=version+1 WHERE id=$1',[journalId]);return journalId;
}
export async function reverseJournal(tx:Queryable,schoolId:string,actorId:string,journalId:string,date:string,reason:string){
 const journal=(await tx.query('SELECT * FROM journals WHERE id=$1 AND posted=true FOR UPDATE',[journalId])).rows[0];if(!journal)throw new Error('notFound');
 const lines=(await tx.query('SELECT account_id,debit_paise::text,credit_paise::text FROM journal_lines WHERE journal_id=$1',[journalId])).rows;
 return postJournal(tx,schoolId,actorId,{date,description:reason,reversalOf:journalId,lines:lines.map(line=>({accountId:line.account_id,debitPaise:line.credit_paise,creditPaise:line.debit_paise}))});
}
