# School Accounts workspace

The Accounts role now opens a dedicated school workspace, with School Feed as the default on every login and reload. Desktop uses a sidebar; phones use a floating five-tab navigation bar. School branding, the staff welcome, calendar access and notifications are shared across the workspace.

## Available screens

- School Feed: authorised school posts and attachments. Accounts has read access; no messaging or ad containers are added.
- Fees: issued-fee totals, collections, concessions and outstanding balance; paginated invoice records and description search; a separate balances view with paid/due/overdue labels. Create a student invoice using rupees, save a draft, review it and explicitly issue it. Issuing makes it available to authorised linked parents through the existing workflow.
- Collections: select an issued invoice from Fees, inspect its remaining balance, record a received cash/UPI/card/bank/cheque/DD payment with a reference and review checkbox. The server validates remaining balance and uses an idempotency key. Numbered receipts can be downloaded as PDFs. CSV export covers the displayed receipt page.
- Reports: date-filtered income/expenses, surplus/deficit and balance-sheet figures, ledger CSV export, all-date trial balance, recent posted journals, simple balanced journal entry and reasoned journal reversal. Trial balance is explicitly labelled as all-date; balance-sheet values are as of the report date. Period locks and existing posting rules remain enforced.
- Account: staff identity, theme, display-language preference, role switching where available, and sign-out.

Finance tools open the existing authorised record workflows in a focused modal: fee categories, class fee plans and invoice generation, concessions, refunds, cash counter sessions, vendors, bills, purchases, budgets, payroll, payslips, bank statement reconciliation, imports and period locks. These retain their existing approval requirements and field validation. The additional records workflow still uses its existing paise field labels; the new invoice, payment and journal forms accept rupees.

The payment form records money already received; it does not initiate a card charge or bank transfer. No gateway, live banking integration or statutory payroll compliance engine is newly enabled by this UI. Existing payroll configuration requirements and school approval rules still apply.

## Local testing

Open http://localhost:3000, choose the Accounts sample account (`accounts@netaji.school`) and use the shared fictional password `NetajiDemo!2026`. The local Netaji Accounts and Principal sample accounts need no authenticator code. This exception does not apply to production or other schools.

At the user's request, the local Netaji demo now includes fictional finance examples. Existing records are retained. Setup runs once and does not overwrite later edits. Browser workflow tests mock financial writes; isolated database tests cover real posting, replay protection, tenant/parent isolation, receipt numbering, reconciliation and period locks.

## Fictional finance examples

Ten issued tuition invoices of ₹3,000 each, two draft transport invoices, seven collections, an approved ₹500 concession, a pending concession, and an approved ₹500 refund. Aarav Reddy is fully paid, Ananya Rao is partly paid, Vihaan Sharma is overdue and Arjun Nair has a future due date.

Initial totals: ₹30,000 billed, ₹16,500 collected, ₹500 concessions, ₹500 refunds and ₹13,500 outstanding. Posted expenses are ₹1,300: the paid ₹800 bill and ₹500 concession. Further examples include draft/escalated bills, a vendor, budget, purchase request, fee plan, cash counter and two bank-statement lines.

Three salary-slip drafts belong to an unposted payroll preview with unconfirmed fictional payroll settings. They do not affect the ledger. No money was moved. The one-time setup marker is `demo.financeInitializedV2`.
