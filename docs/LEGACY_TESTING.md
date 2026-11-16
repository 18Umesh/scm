# Historical two-school testing guide

The accounts and hosts below are inactive in the current application. The active pilot is documented in [NETAJI_SETUP.md](NETAJI_SETUP.md). This guide preserves prior implementation/testing context only.

# Local testing

Use fictional records. The coverage and unfinished features are listed in [STATUS.md](STATUS.md).

## Start

Node 24 is required. From `D:\SchoolManagementSystem`:

```powershell
npx --yes pnpm@10.32.1 install --frozen-lockfile
npx --yes pnpm@10.32.1 dev
```

Open http://greenfield.localhost:3000. Riverdale is http://riverdale.localhost:3000. Local storage persists in `.data/campus`; do not run another embedded API/worker against that same directory. The API uses port 4000, adult web 3000, student web 3001.

All demo passwords: `CampusDemo!2026`.

| Email | Context |
|---|---|
| admin@demo.campus.test | School records, setup, imports, account linking |
| teacher@demo.campus.test | Assigned class, homework, leave; also a separate parent context |
| parent@demo.campus.test | Two linked children, published notices, invoices, leave, own requests |
| hod@demo.campus.test | Department scope and teacher leave approvals |
| principal@demo.campus.test | Approvals, exam release and school settings |
| accounts@demo.campus.test | Invoices, counter collections, ledger and financial registers |
| management@demo.campus.test | Oversight and approvals |

Principal, Accounts and Management require a six-digit TOTP from the **fictional demo secret** `JBSWY3DPEHPK3PXP` (SHA-1, 30 seconds). For parent OTP choose the phone option and use `+910000000001`; embedded mode shows a demo code. Teacher-parent phone: `+910000000002`.

## Suggested walkthrough

1. Sign in as Admin, open **School modules** and choose a module. Add/edit records through the Details dialog. Required references must already exist. Changing a published/approved/posted record is deliberately restricted.
2. Create a student with a unique admission number and class. To test admissions conversion, fill the structured admission fields and guardian phone/name, then Contact, Offer and Admit; the student, enrolment and guardian link are created atomically. Declining APAAR is supported. In **Brand studio -> Link parent account**, link a fictional international phone to the student. Sign in with that phone using OTP.
3. Import students/staff with the template under **Imports**. Upload CSV/XLSX, inspect errors and preview, commit explicitly, then undo before imported rows are changed or referenced.
4. Sign in as Teacher, open **Attendance desk**, choose the assigned class/date, load the roster and submit. Corrections require a reason. To test offline, load the roster first, disconnect, submit, reconnect, then sync. Conflicting versions must be resolved by reloading.
5. Request teacher leave on a working weekday. Approve as HOD; requests above the configured threshold escalate to Principal. Inspect staff attendance and unassigned cover. Assign available substitutes through the Cover record's staff field.
6. Publish homework for the assigned class. Publish a staff-only feed post as Admin. Switch to Parent: that post must be absent, including through record URLs. Publish a parent/both notice with an explicit audience to make it visible.
7. As Accounts create a fee plan and use Generate draft invoices for class; replay must create no duplicates. Issue the draft invoice. Collect a partial payment using the Finance tab. Inspect/download the receipt and trial balance. Try an unbalanced journal or writing into a locked period; both must fail. Concessions/refunds require another approver.
8. As Principal create/approve/publish an exam. As Teacher enter and submit marks; Principal approves and publishes. Parent sees only published results. A future question paper must stay hidden. Configure a named grading scale, create a Report card for the student/year/term, approve as Principal, then publish and download. Approval fails until every published assessment in the period has a published mark. Reports are under the Reports tab.
9. Library: create one-copy book, issue it, then try issuing another copy before return. Inventory: try a stock-out above available stock. Both must reject excess allocation.
10. Restricted records: provision Nurse and Counsellor accounts in Brand studio. Each sees its own record type; standard school roles cannot open the Health module.
11. Pickup: office creates and approves a pickup authorization and gate pass for today. A linked guardian with pickup permission creates a five-minute pickup pass. Security/office enters that pass to release. A second use, wrong code, wrong child or wrong day must fail.
12. Student: enable student login on the class, then create a username/PIN in Brand studio. Open `/student`. Only timetable, homework, published marks and notices are available. Student login starts disabled for all demo classes.
13. Open the second school host and repeat sign-in: records, sessions, configuration and money must remain separate.

## Native app

```powershell
npx --yes pnpm@10.32.1 --filter @campus/mobile dev
```

Use a compatible Expo development client. Android emulator defaults to `http://10.0.2.2:4000`; iOS simulator uses localhost. Physical devices require a configured HTTPS school API origin; USB testing can use `adb reverse tcp:4000 tcp:4000` and localhost. A JavaScript export is verified; no signed native binary or store upload is supplied.

## Integrations

Live payment links require `SCHOOL_GATEWAYS` with school-owned Razorpay credentials. Webhooks must reach `/api/payments/webhook on the school host` and preserve the raw body/signature. Local counter payments work without a gateway. OTP/push production delivery requires school-owned adapters and a worker; embedded OTP uses fictional demo codes.

Custom domains require real TXT and CNAME records and HTTPS ingress. App Factory currently records readiness/credential state; it does not build or submit store apps. AI and ads default off. See STATUS for the other unfinished functionality before testing it as complete.

## Automated checks

```powershell
npx --yes pnpm@10.32.1 lint
npx --yes pnpm@10.32.1 typecheck
npx --yes pnpm@10.32.1 test
npx --yes pnpm@10.32.1 build
npx --yes pnpm@10.32.1 test:browser
```

The PostgreSQL suite uses two dedicated empty databases: `TEST_DATABASE_URL` / `TEST_DATABASE_ADMIN_URL` for foundation tests and `OPERATIONS_TEST_DATABASE_URL` / `OPERATIONS_TEST_DATABASE_ADMIN_URL` for operations tests. Never point these at a real school database. Browser tests mutate the fictional local demo and save screenshots/traces under ignored `test-results/`.


## Additional completed workflows

- Accounts can import bank CSV/XLSX using the Bank statements template. Reconcile a line by entering a posted journal ID in Details, then choosing Reconcile. Signed cash movement must match exactly; duplicate matching and editing matched lines are blocked. Posted journal IDs and financial statements are available in Finance.
- Spending above the school's approval limit requires Principal, then Management, before Accounts can pay. The Details dialog identifies the required next approver. Self-approval is blocked.
- A parent can create an Access/Export data request for a linked child. Office/Principal uses Prepare approved data export. The encrypted result is downloadable by the requester or office for seven days; expired content is removed by the worker. Deletion uses an Admin/Principal review with a written reason: retain until a date, restrict optional processing, or anonymize eligible withdrawn records. Financial/academic retention, active holds and open allocations block anonymization.
- Native session restoration and serialized refresh are implemented using SecureStore for the origin/CSRF pair and native HttpOnly cookies. Physical-device cookie persistence still requires acceptance testing.

## Parent desktop and mobile acceptance

Sign in at http://greenfield.localhost:3000 with `parent@demo.campus.test` / `CampusDemo!2026`. Use Mobile preview or browser device emulation; no separate mobile URL is required. Home, Learning, Fees, Connect and My family share the same live data.

1. Switch children and check the timetable and published results.
2. Open "Patterns all around us", submit an answer and attach a fictional PNG/JPEG/WebP or PDF. Teacher can review it and provide feedback.
3. Answer the school survey, vote in the noticeboard poll and acknowledge a notice. Reopening preserves the response.
4. Open the school garden album. Withdraw photo consent in My family and verify that gallery files become unavailable; restore consent to continue gallery tests.
5. Book an available parent-teacher slot, then cancel it and check availability again.
6. In Fees use "Test payment - no real money" if an invoice has a balance; download the resulting PDF receipt. This feature is restricted to the embedded fictional schools.
7. Send a message or concern; reply from the corresponding staff role. Check the parent conversation and notifications.
8. Request pickup with a fictional portrait; office approves before issuing a gate pass. Test the QR/token once, then verify replay rejection.

Automated parent browser checks also exercise the preview iframe, phone navigation, attachment upload, surveys, albums and receipt download. The design suite checks 360/1440 pixel widths in three languages and light/dark themes. Screenshots are under `docs/screenshots/`; no physical-device or native-screen acceptance is implied.

## Teacher school-day workspace

Sign in as `teacher@demo.campus.test` / `CampusDemo!2026` at http://greenfield.localhost:3000. The teacher workspace has the school's configured logo/accent and a named welcome. My School Day starts with Your Timeline, then My Classes. Its floating navigation includes My School Day, My Classes, School Feed, Leave and Account. Mobile preview is under Account.

- Open School Calendar in the header. Select any date to see school events and private personal tasks; add, edit, complete or cancel a reminder. Times use India time. Due reminders become in-app notifications once, with background scheduling every 15 seconds in embedded local development. Production needs RUN_WORKER=true; external push also needs the school's push adapter.
- Open a class from My Classes or the timeline. Save the attendance roster; changing recorded attendance requires a reason. Exams & marks shows exam history, mean score, pass count and marks-entry coverage. Save draft marks, then submit for approval; school approval/publication remains separate.
- Use Diary for homework and Assignments for assigned work. Publish a new item, open it and mark each learner submitted/not submitted. Online answers, attachments and teacher feedback are shown alongside the manual checklist.
- School Feed > Post update can select all taught classes, individual classes, or one learner's family. Parent visibility is enforced by current guardian links and the selected class. Private posts never become school-wide posts.
- Leave shows the configured annual allowance, approved usage, pending days and remaining days; apply for leave and follow its routed status. Current policy uses the same configured allowance for each paid leave type; this screen reflects that existing policy.
- Sign in as HOD (`hod@demo.campus.test`), open School modules > Syllabus and assign a topic, class, subject, teacher, start date and due date. The teacher can mark pending/in progress/completed with actual date and notes. HOD's Teacher performance report includes assigned/completed/on-time/overdue syllabus counts; they inform human review rather than an automatic rank.

The demo crest is a fallback. A school's configured Brand studio logoPath and accent take precedence. This is a responsive teacher web workspace, not a redesigned Expo native screen.

Teacher screenshots: [desktop](screenshots/teacher-desktop.png), [phone](screenshots/teacher-mobile-viewport.png), [dark phone](screenshots/teacher-mobile-dark.png). Family messages and student leave approvals are under School Feed / Account; More school tools retains the existing staff modules. School Calendar also includes published assigned-class exams and school holidays. The local database now rejects a second writer, and API source reloads close the database before restarting. Do not run a second API against `.data/campus`.

## Assisted attendance and sample names

Voice, local screenshot OCR, uncertainty resolution and the two mandatory review screens are described in [ATTENDANCE.md](ATTENDANCE.md). Demo profiles now use natural synthetic names; credentials and linked record IDs remain the same. Automated voice uses a recognizer stub; physical microphone/model/language acceptance remains manual.
