# Build Spec: Free, Ad-Supported School Management Platform

- **Working name:** Campus (rename any time)
- **First market:** Private K-12 schools in India, starting with Telangana and Andhra Pradesh
- **Business model:** Free for every school, parent, student and staff member. Paid for by controlled ads shown to adults.
- **Spec date:** 5 Nov 2026

---

## 0. How Claude Code must use this file

1. Read this whole file before writing code.
2. Create a short `CLAUDE.md` containing section 3 (Non-negotiable rules) and a pointer to this file.
3. Build one phase at a time from section 13. Do not start a phase until the previous exit criteria pass.
4. At the end of each phase: run all tests, update `docs/STATUS.md`, list what changed, and stop for review.
5. Ask before changing a rule in section 3 or adding any third-party SDK.
6. If this spec is silent, choose the simplest option and record it in `docs/DECISIONS.md`.
7. Never put real student data in seeds, tests, logs or screenshots.
8. Split each phase into small slices, and finish and test one slice before starting the next. Phase 2 is large, so plan its slices first and share the plan for review.
9. After the first read, reread only the sections a phase needs:

| Phase | Sections |
|---|---|
| 0 | 3, 8, 9, 21, 22 |
| 1 | 2, 4, 6, 9, 22 |
| 2 | 6, 7, 18, 19, 21 |
| 3 | 5, 6, 19 |
| 4 | 4, 18, 19 |
| 5 | 12, 14, 22 |
| 6 | 10, 11 |
| 7 | 5, 18, 19 |
| 8 and 9 | 4, 18, 19, 20, 22 |

---

## 1. Product decisions

| Decision | Why | Expected result |
|---|---|---|
| Student login has no ads and no third-party trackers | Indian law bans tracking and targeted ads at under-18s | Removes the largest legal risk |
| Ads appear for parents, teachers and school management | They are adults and the daily users | Increases impressions while children stay protected |
| Ads are built after the pilot, in two types | Google ads need no sales work; our own Ads module earns more per view | Lets the core product launch first with no ad rework |
| Every ad is a native card with a small label | Ads should feel part of the app, but Google and Indian rules do not allow hidden ads | Low annoyance while staying compliant |
| Staff ads appear on home dashboards only | Teachers and management work in these screens all day | Keeps daily work uninterrupted |
| Accounts and all finance screens have no ads | Financial records need a clean, trusted workspace | Protects trust in the finance system |
| Ad audiences are switchable by role | Management may object during the pilot | Lets ads be removed for a role without an app release |
| Student login is a small, separate module | Most school operations are for adults | Reduces child-data exposure and build effort |
| Fee, marks, health and safety screens never show ads | Ads there feel exploitative and reduce trust | Protects trust with parents |
| School data is never used to pick an ad | Schools own this data for education, not marketing | Keeps ads legally and commercially defensible |
| AI is added to every adult role, led by time-saving drafts | Staff workload and parent language gaps are the biggest daily problems | Gives schools a strong reason to switch |
| Student login has no AI in v1 | The module stays small and child data stays protected | Avoids the riskiest AI use |
| A person approves anything important that AI produces | AI can be wrong about children and money | Keeps schools accountable and avoids costly mistakes |
| Free OpenRouter models are used only where no personal data is involved | Many free hosts may log or train on prompts, and limits are low | Keeps AI cost near zero without exposing school data |
| AI spend has a per-school cap | Every AI call costs money on a free product | Stops AI use from outrunning ad revenue |
| Leave, staff attendance, cover and the School Feed are core features | Schools run on these every day | Drives daily staff use from the pilot onward |
| Every post must state its audience | Staff-only news must never reach parents | Prevents embarrassing leaks |
| Consumer-grade design is a release requirement | Parents compare every app with the best apps on their phone | Drives daily use and word of mouth |
| One adult mobile app for parents, teachers and management | People can hold several roles, and one app is simpler to build and review | One codebase and one store listing to maintain |
| The shared app changes to the school's brand after sign-in | Many schools will not have store accounts ready | Every school can launch on day one |
| App Factory builds a school-owned app automatically | Schools want their own store app and we should do no manual work | Self-serve app creation, published from the school's own accounts |
| Schools design their own login and home screens | School identity drives pride and adoption | Personalised apps with no custom code |
| Schools brand and launch themselves | Manual customisation does not scale on a free product | No sales or setup calls needed from us |
| Each school uses its own payment gateway account | The platform never holds school money | Reduces financial and regulatory risk |
| Self-serve setup and Excel import | Free cannot fund manual onboarding | Keeps cost to serve low |
| Push first; SMS and WhatsApp use the school's own account | Messaging is the main variable cost | Prevents cost growing with usage |
| Modular monolith on PostgreSQL | One codebase is easier to run and to build with Claude Code | Faster delivery and lower hosting cost |

---

## 2. Roles and logins

### Requested roles

- Parent
- Teacher
- Accounts
- HOD
- Principal

### Essential roles that were missing

| Role | Why it is needed |
|---|---|
| Student | Homework, timetable, results and notices for older students |
| School Admin / Office | Admissions, student records, certificates and setup |
| Management / Trustee | Owner view of fees, spending and approvals |
| Platform Super Admin | Runs the product across schools. Cannot browse school data without logged, time-limited access |

### Add when the matching module is enabled

| Role | Module |
|---|---|
| Vice Principal / Coordinator | Academics and substitutions |
| Class Teacher | A scope on Teacher, not a separate login |
| Exam Coordinator | Exams and report cards |
| Admissions / Front Office | Enquiries, applications and visitors |
| HR / Payroll Officer | Staff records, leave and salaries |
| Librarian | Library |
| Transport Manager | Routes, vehicles and fees |
| Driver / Bus Attendant | Trip start, stop and pickup marking |
| Hostel Warden | Hostel rooms, attendance and leave |
| Store / Inventory Manager | Purchases and stock |
| Nurse / Counsellor | Restricted health and counselling records |
| Gate / Security | Visitors and early pickup checks |
| Auditor | Read-only finance access for a set period |
| Group Admin | Multiple branches under one trust |
| Applicant Parent | Admission form and status only |
| Alumni | Certificates and transcript requests |
| Ad Reviewer (platform) | Approves sponsor ads. No access to school data |
| Support Agent (platform) | Logged help access, granted by the school |

### Identity rules

- One person has one account, with many memberships.
- A membership is `user + school + role + scope`.
- A teacher who is also a parent switches context without logging out.
- A parent with children in two schools uses one login.
- A scope can be a class, section, department, subject or branch.
- A role is a set of permissions. Schools can adjust permissions but cannot remove audit logs.

### Login methods

| User | Method |
|---|---|
| Parent | Registered phone, OTP once per device, then long-lived session |
| Staff | Phone or email with password; OTP on a new device |
| Accounts, Principal, Management | Mandatory second factor |
| Student | School-issued username and PIN; no phone required |
| Platform staff | SSO or passkey, second factor and IP allowlist |

---

## 3. Non-negotiable rules

### Data and privacy

1. A child is anyone under 18.
2. Student surfaces contain no ad SDK, analytics SDK, social pixel or third-party tracker.
3. Ads are never selected using any field about a child, a family, marks, attendance, fees, class, age or behaviour.
4. Ad requests may contain only: slot ID, app version, language and the school's city and state. Enforce this with a server-side allowlist.
5. School data is never sold, shared with advertisers or used to train models.
6. The school is treated as the data fiduciary and the platform as its processor, under a signed data processing agreement.
7. Do not store Aadhaar numbers by default.
8. APAAR fields are optional, with `not_provided`, `consented`, `declined` and `withdrawn` states. A refusal must never block admission or any other workflow.
9. Health and counselling records need a separate permission and access log.
10. Every read of sensitive data and every change to any record is written to an append-only audit log.

### Tenancy

11. Every school-owned table has `school_id` and PostgreSQL Row Level Security.
12. The application connects as a role that cannot bypass RLS.
13. Set the tenant per transaction with `SET LOCAL`.
14. A cross-school data leak is a release-blocking defect.

### Money

15. Store money as integer paise in `BIGINT`. Never use floating point.
16. Posted ledger entries and issued receipts cannot be edited or deleted. Corrections use reversal entries.
17. Every journal must balance, enforced by a database constraint or trigger.
18. Payment webhooks are verified and idempotent.
19. Receipt numbers are gapless per school, per financial year, per series.
20. Refunds, concessions and write-offs above a school-set limit need a second approver.

### Ads

21. Ads never appear on the screens listed in section 10.
22. No interstitial, rewarded, video-with-sound or pop-up ads.
23. Personalised ads stay off in every network configuration.
24. A failed ad must never slow down or block a screen.
25. Emergency notices always show without ads.
26. Every ad, Google or direct, is native in style and carries a visible, localised "Sponsored" label.

### Delivery

27. Every feature includes tests, permission checks and audit events.
28. Every list endpoint is paginated.
29. All user-facing text goes through translation files.

### AI

30. Every core workflow must work with AI switched off.
31. AI never makes final decisions on marks, admission, fees, concessions, discipline, hiring, pay or safety.
32. AI never sends a message, posts a ledger entry, publishes a result or changes a record without a person approving it.
33. AI acts with the signed-in user's permissions, through the same API checks. It never receives raw database access.
34. Only the data a task needs is sent to a model. Replace names and IDs with tokens wherever the task allows.
35. School data is never used to train models, and the provider contract must say so.
36. Uploaded files, messages and web content are untrusted input. Instructions inside them are never followed.
37. No AI feature uses face recognition, emotion detection or biometric data of children.
38. AI features never use school data to select ads, and AI chat screens show no ads.
39. Every AI answer that uses data shows its source, and every AI feature is labelled as AI.
40. Personal data about students, parents or staff is never sent to a free model endpoint. See the model tiers in section 18.

### Audience and notifications

41. Every post, calendar item and notification has an explicit audience. There is no silent default.
42. Audience rules are enforced on the server. Staff-only content must never appear in a parent or student API response.
43. Reasons for leave are visible only to the approvers and HR. Reports show leave type, never medical details.
44. A question paper can never be released before its exam has ended.

### Design and white-label

45. Customisation is configuration only. No school gets its own code or branch.
46. Every school setting must be available in the self-serve Brand Studio or school settings.
47. Every school brand must pass automatic contrast checks.
48. The school is resolved from the request host. Sessions, cookies and CORS are limited to that school's approved hosts.
49. Custom branding and domains go live only after school verification.
50. A school's logo or name must never appear inside an ad or suggest the school endorses it.
51. Do not copy the visual assets, layouts or brand of Swiggy, Zomato, Cult or any other company.
52. Every screen must pass the design review in section 21 before a phase can close.
53. Login and home designs are versioned JSON built from approved blocks. Schools can never add code.
54. Ad slots, privacy links, consent screens and required actions cannot be removed by a school.
55. School-owned apps are published only from the school's own developer accounts.
56. Store credentials are held in a secrets manager, encrypted per school, limited to the least access needed, and removable by the school at any time.

---

## 4. Modules

### Core (MVP)

- **School setup:** academic years, terms, classes, sections, subjects, houses, holidays, grading scales
- **Brand Studio:** name, logo, colours, domain and terminology (section 22)
- **Student records:** profile, guardians, documents, siblings, promotions, transfers, withdrawal, status history
- **Staff records:** profile, department, reporting manager, qualifications, documents, class and subject assignments
- **Import wizard:** Excel templates, column mapping, validation report, dry run, undo
- **Timetable:** manual builder, clash detection, published versions, and class, teacher and HOD timetables
- **Substitutions:** cover assignment when a teacher is on leave (section 19)
- **Student attendance:** daily or period-wise, offline capture, absence push alerts, correction with reason
- **Faculty and employee attendance:** all staff, late and half-day rules, corrections, monthly register (section 19)
- **Leave management:** staff and student leave, HOD routing, approvals, balances (section 19)
- **Homework and class diary:** assign, attach, acknowledge, submit, review
- **School Feed:** posts with a required audience, read receipts and emergency alerts (section 19)
- **Notification centre:** push events, preferences and delivery log (section 19)
- **Parent-teacher messaging:** office hours, moderation, no personal phone sharing, full school audit
- **School calendar:** holidays, exams, PTMs and events for parents, with staff-only items (section 19)
- **Exams and report cards:** exam setup, mark entry, moderation, approval, board-style templates, publishing
- **Fees and receipts:** section 5
- **Certificates:** transfer, bonafide, character and fee certificates with QR verification
- **Dashboards:** role-specific daily view
- **Reports:** student, teacher, leave and finance reports (section 19)

### Second wave

- Admissions pipeline and enquiry tracking
- Lesson plans and syllabus tracking
- PTM slot booking
- Accounting and expenses
- Payroll
- Transport and live bus location
- Library
- Inventory and purchasing
- Staff appraisal
- Compliance exports for UDISE+, CBSE and RTE reporting

### Later

- Hostel, health room, counselling and discipline
- Visitor and gate pass
- Canteen
- Alumni
- Multi-branch reporting
- Biometric and RFID attendance integrations
- Online classes through external meeting links
- Advanced AI features from section 18

---

## 5. School Finance Management System

### Fee management

- Fee heads: tuition, admission, annual, exam, transport, hostel, lab, activity, uniform, books
- Fee plans by class, category, stream or transport route
- Instalments: monthly, term-wise or custom
- Discounts: sibling, staff child, merit, scholarship, management concession
- RTE and fee-waiver categories
- Late fee rules with caps and approved waivers
- Advance payments, partial payments and credit notes
- Student fee statement and family statement

### Collection

- Counter payments: cash, cheque, DD, UPI, card, bank transfer
- Online payments through the school's own gateway account (Razorpay first, behind an adapter)
- Parent payment links
- Bounced cheque reversal and re-charge
- Receipt PDF, WhatsApp share and QR verification
- Cashier sessions with opening and closing balance
- Day-end close, with denomination count and variance
- Automatic bank settlement matching

### Accounting

- Double-entry ledger
- Chart of accounts template for Indian schools
- Separate financial year (April to March) and academic year
- Trust, society and branch cost centres
- Vouchers: receipt, payment, journal and contra
- Petty cash with limits
- Bank accounts and reconciliation by statement upload
- Fixed assets and depreciation
- Opening balance import
- Period lock after audit
- Tally export as the first accounting export

### Spending control

- Department budgets with HOD ownership
- Purchase request, approval, purchase order, goods receipt, bill, payment
- Vendor master and vendor ledger
- Approval limits by role and amount
- Bill attachment required before payment
- TDS tracking on vendor payments

### Payroll

- Salary structures and components
- Attendance and leave integration
- PF, ESI, professional tax and TDS, with rates held in dated configuration
- Payslips and salary register
- Bank payment file
- Staff loans and advances

### Tax handling

- Keep tax treatment on each fee head rather than in code.
- Default core school fees to exempt.
- Allow a taxable flag for items a school's accountant marks as taxable.
- Add a warning that the accountant must confirm tax treatment.

### Reports

- Daily collection and cashier report
- Fee dues and defaulters by class, with ageing
- Concession and refund registers
- Income and expenditure
- Receipts and payments
- Trial balance, balance sheet, cash book, bank book
- Budget against actual
- Payroll summary
- Fee forecast
- Audit trail by user and date
- Total Finance Report for Management (section 19)

### Finance approval flow

| Action | Maker | Approver | Final record |
|---|---|---|---|
| Fee concession | Accounts | Principal | Concession register |
| Refund | Accounts | Principal or Management | Reversal and payment voucher |
| Purchase request | Staff | HOD, then Principal | Purchase order |
| Vendor payment | Accounts | Principal or Management by limit | Payment voucher |
| Period lock | Accounts head | Management | Locked period |
| Unlock period | Management | Second Management user or Auditor | Audit entry |

---

## 6. Role access matrix

Key: **F** full, **A** approve, **R** read, **S** own scope, **O** own record or own child, **–** none.

| Area | Management | Principal | HOD | Teacher | Accounts | Admin Office | Parent | Student |
|---|---|---|---|---|---|---|---|---|
| School setup | A | F | – | – | – | F | – | – |
| Student records | R | F | S | S | R (fee fields) | F | O | O |
| Staff records | R | F | S | O | R (pay fields) | F | – | – |
| Student attendance | R | R | S | S | – | R | O | – |
| Staff attendance | R | F | S | O | R | F | – | – |
| Staff leave | R | A | A (department) | O | R (balances) | R | – | – |
| Student leave | – | R | R | A (class teacher) | – | R | O | – |
| Substitutions | R | A | S | O | – | R | – | – |
| Timetable | R | A | S | R | – | F | O | O |
| Homework | – | R | S | S | – | – | O | O |
| Exam marks | R | A | S | S | – | R | O (published) | O (published) |
| Feed: staff audience | R | F | S | R | R | F | – | – |
| Feed: parent audience | R | F | S | S | – | F | R | R (if targeted) |
| School calendar | R | F | R | R | R | F | R | R |
| Fees | R | A | – | – | F | R | O | – |
| Accounts and ledger | R | R | – | – | F | – | – | – |
| Budgets | A | A | S | – | F | – | – | – |
| Purchases | A | A | S | O | F | R | – | – |
| Payroll | A | R | – | O | F | – | – | – |
| Total finance reports | R | R | S (budget) | – | F | – | – | – |
| Teacher performance reports | R | R | S | O | – | – | – | – |
| Student performance reports | R | R | S | S | – | R | O | O (published) |
| Teacher leave reports | R | R | S | O | R | R | – | – |
| Audit logs | R | R | – | – | R (finance) | – | – | – |
| Ad preferences | F | F | – | – | – | – | – | – |

Tests must prove every cell of this matrix.

---

## 7. Role experience

### Parent

- Child switcher
- Today: attendance, homework, timetable, notices
- Fee dues and online payment
- Results, report cards and certificates
- Messages to teachers
- Transport status
- Leave application and consent slips
- School Feed and holiday calendar
- Push alerts for absence, exams and results
- Child performance reports

### Student

- Separate login, turned on by the school class by class; off by default
- Read-only: timetable, homework, published results and notices
- Everything else stays closed, including attendance, fees, messages, finance and other students' data
- No payments, no ads, no AI and no peer chat
- Younger students are served through the Parent app

### Teacher

- Today's classes and attendance in under 30 seconds
- Homework, marks and diary
- Class notices and parent messages
- Personal timetable, including today's cover classes
- Own attendance, leave requests and balances
- Payslip and substitution alerts
- Staff feed

### HOD

- Own teaching timetable, when the HOD teaches
- Leave approvals for the department
- Staff attendance and correction approvals
- Department timetable and substitution assignment
- Teacher performance and leave reports
- Lesson-plan and syllabus progress
- Marks moderation
- Teacher workload
- Department budget and purchase approvals

### Principal

- Morning view: attendance, staff absence, fee collection, alerts and pending approvals
- Academic performance by class
- Teacher and student performance reports
- Escalated leave approvals and leave reports
- Own teaching timetable, when the Principal teaches
- Approvals inbox
- School-wide and emergency posts

### Management

- Total Finance Report
- School performance summary
- Staffing, leave and attendance summary
- Approvals inbox

### Accounts

- Cash counter and day-end close
- Dues, reminders and defaulters
- Vouchers, vendors, bank matching, payroll and reports

---

## 8. Technical architecture

| Layer | Choice |
|---|---|
| Language | TypeScript everywhere |
| Repo | pnpm and Turborepo monorepo |
| API | NestJS modular monolith with OpenAPI |
| Adult web | Next.js as an installable web app for every school domain |
| Student web | Separate Next.js app, installable, at `/student` on the school's domain |
| Android and iOS | One React Native app with Expo for all adult roles |
| Mobile UI | Expo Router, Reanimated, FlashList and Expo Image |
| Web UI | Tailwind CSS with Radix primitives |
| Custom domains | Caddy on-demand TLS, or Cloudflare for SaaS if the cost is acceptable |
| Database | PostgreSQL with Row Level Security |
| ORM | Drizzle, with raw SQL migrations for RLS and triggers |
| Queue and cache | Redis with BullMQ |
| Files | S3-compatible storage in an Indian region, using signed URLs |
| PDFs | Server-rendered HTML to PDF in a worker |
| Notifications | Firebase Cloud Messaging plus channel adapters |
| Hosting | Containers in an Indian cloud region |
| AI | `packages/ai` gateway with an OpenRouter adapter, so models can be swapped |
| Search for AI | pgvector in PostgreSQL, filtered by `school_id` under RLS |
| Observability | Self-hosted or India-region logs and errors, with personal data scrubbed |

### Repository layout

```text
apps/
  api/
  web/            # staff, parent and admin web
  student/        # separate student web app with no third-party scripts
  mobile/         # one Android and iOS app for all adult roles
  worker/
  app-factory/    # automated store builds and listing kits for school-owned apps
  ads-service/    # separate service with no access to school tables
packages/
  auth/
  db/
  rbac/
  ledger/
  ui/
  theme/          # design tokens and per-school theme engine
  tenancy/        # host-to-school resolution
  i18n/
  validation/
  ai/
docs/
  STATUS.md
  DECISIONS.md
  DATA_MAP.md
```

### Architecture rules

- `ads-service` uses its own database credentials and cannot reach school schemas.
- `apps/student` has a strict Content Security Policy that blocks external scripts.
- `packages/ledger` is the only code allowed to write ledger tables.
- Modules communicate through public service interfaces and domain events, using an outbox table.
- Attendance and marks support offline capture and conflict handling.
- Target: usable on low-end Android phones and slow mobile networks.
- References to the Parent and Teacher apps mean role experiences inside the one mobile app.
- Languages at launch: English, Telugu and Hindi.

---

## 9. Core data model

### Platform

`groups`, `schools`, `school_settings`, `school_branding`, `school_domains`, `school_verifications`, `school_layouts`, `school_apps`, `school_app_builds`, `school_app_credentials`, `users`, `memberships`, `roles`, `permissions`, `role_permissions`, `sessions`, `audit_logs`, `consent_records`, `support_access_grants`, `data_requests`

### Academics

`academic_years`, `terms`, `classes`, `sections`, `subjects`, `students`, `guardians`, `student_guardians`, `enrollments`, `staff`, `departments`, `teaching_assignments`, `timetables`, `timetable_entries`, `substitutions`, `attendance_sessions`, `attendance_records`, `homework`, `homework_submissions`, `exams`, `exam_subjects`, `marks`, `grading_scales`, `report_cards`, `certificates`

### Communication

`posts`, `post_audiences`, `post_reads`, `post_approvals`, `conversations`, `messages`, `notification_events`, `notification_preferences`, `notification_deliveries`, `calendar_items`, `calendar_audiences`, `consent_slips`, `grievances`

### Staff operations

`staff_attendance`, `staff_attendance_corrections`, `leave_types`, `leave_balances`, `leave_requests`, `leave_approvals`, `approval_routes`, `student_leave_requests`, `duty_rosters`, `teacher_observations`, `pickup_authorizations`, `gate_passes`, `report_snapshots`

### Finance

`fee_heads`, `fee_plans`, `fee_plan_items`, `student_fee_assignments`, `fee_invoices`, `fee_invoice_lines`, `concessions`, `payments`, `payment_allocations`, `receipts`, `receipt_series`, `refunds`, `cashier_sessions`, `accounts`, `journals`, `journal_lines`, `financial_years`, `locked_periods`, `bank_accounts`, `bank_statement_lines`, `vendors`, `budgets`, `purchase_requests`, `purchase_orders`, `bills`, `payroll_runs`, `payslips`, `tax_settings`

### Ads, in the separate ads database

`ad_enquiries`, `advertisers`, `ad_orders`, `campaigns`, `creatives`, `ad_categories`, `slot_definitions`, `geo_targets`, `school_ad_rules`, `review_decisions`, `daily_ad_metrics`

### AI, inside each school's tenant

`ai_prompts`, `ai_requests`, `ai_approvals`, `ai_usage_daily`, `knowledge_documents`, `knowledge_chunks`

### Required table conventions

- Primary key: UUIDv7
- Columns: `school_id`, `created_at`, `updated_at`, `created_by`, `version`
- Soft delete only for non-financial records
- Retention period defined for every table in `docs/DATA_MAP.md`

---

## 10. Structured ad system

### Goal

Ads should feel like a natural part of the app: calm, useful and placed where people already browse. They are not disguised. Each one keeps a small "Sponsored" label.

### Two ad types

| | Type 1: Google Ads | Type 2: Our Ads module |
|---|---|---|
| How it works | Google fills the slot and pays us a revenue share | Businesses contact us and we run their ads |
| Who sells | Google | Us |
| Tool | AdMob native ads | Super Admin Ads module |
| Where | Parent and Teacher mobile apps | Parent and Teacher apps, and staff dashboards on web and mobile |
| Control | Global category blocks | Full approval, per city and per school blocks |
| Build order | First, because it needs no sales work | Second |

Both are built after the pilot (Phase 6). Phase 2 only reserves the space.

### Where ads may appear

All slots are native cards. There are no banners.

| Slot | Placement | Ad types | Rule |
|---|---|---|---|
| `parent_home_feed` | Between Parent home cards | Both | Maximum 1 per 5 feed cards |
| `parent_calendar_card` | End of the upcoming events list | Both | One per screen |
| `parent_gallery_card` | Between gallery albums | Both | One per screen |
| `teacher_home_card` | End of the Teacher mobile home screen | Both | Home screen only |
| `management_home_card` | End of Principal, HOD, Management and Admin Office home dashboards | Our Ads module only | Home dashboards only |

If no ad is available, the slot collapses and leaves no gap.

### Native design rules

- Use the app's own card shape, spacing, fonts and icon style.
- Place ads at natural pauses, after the main content has loaded.
- Use one image or logo, one short line and one quiet button.
- Do not use animation, autoplay, sound, flashing or countdowns.
- Match ads to the page and season, such as books and uniforms at session start. Never match them to a child or family.
- Show the "Sponsored" label on every ad, translated into the app language.
- Do not disguise ads as notices, school messages, buttons or navigation.
- Do not show an ad inside a list of school notices.
- Keep "Report this ad" in the card menu.
- Keep Google's AdChoices marker visible on Google ads.

### Where ads must never appear

- Login, onboarding and consent
- Fee, payment and receipt screens
- Attendance, absence alerts and leave
- Marks, report cards and certificates
- School Feed, notice detail and emergency alerts
- Push notifications
- Reports, leave approval and staff attendance screens
- Parent-teacher messages
- Transport and child location
- Health, counselling and discipline
- Every student screen
- Every Accounts screen and all finance, fee and payroll screens
- Attendance capture, marks entry, homework entry, approvals and record editing
- Any classroom display or projector mode, because children can see it

### Ad priority

1. **School content:** the school's own announcements, marked as school content
2. **Type 2:** paid direct ads from our Ads module
3. **Type 1:** Google native ads, non-personalised, in mobile apps only

### Allowed targeting

- School's city and state
- App language
- Slot and page context
- Date and time

### Banned targeting

- Child age, class, gender, marks, attendance or fees
- Parent income, occupation or profile
- Device advertising ID
- Lookalike or retargeting audiences
- Any segment built from school data

### Category controls

Always blocked:

- Alcohol, tobacco and vaping
- Gambling, betting and fantasy games
- Dating and adult content
- Loans, credit, crypto and speculative investments
- Weight-loss claims
- Political and religious ads
- Competing school and ERP ads
- Other inappropriate content

Allowed after review:

- Books, stationery, uniforms and school supplies
- Educational products and courses for parents to evaluate
- Children's health services, with claims checked
- Family banking and insurance, excluding credit
- Local family services and events

### School controls

- Preview approved sponsor ads
- Block categories or advertisers
- Use school content in place of a sponsor
- See aggregate ad counts for their school
- Network fallback uses global blocks; per-school blocking may be limited there, and the UI must say so

### Our Ads module (Type 2)

Start as an internal tool, because advertisers contact us directly.

- Public "Advertise with us" enquiry form
- Enquiry tracking: new, contacted, quoted, paid, live, finished
- Advertiser details and business verification
- Create campaign: creative, landing page, cities, schools, dates, budget
- Human review before anything goes live
- Pricing by fixed period or per 1,000 views
- Payment recorded by our team, with invoice
- Automatic start and stop by date or budget
- Shareable campaign report with views and clicks

Add a self-serve advertiser portal only after direct demand is proven.

### Frequency

- Maximum 2 ad impressions per app session
- Frequency cap handled on the device

### App store setup

- Keep Parent and Teacher apps separate from the student web app.
- Declare the one mobile app for adults in the Play Console.
- Set the maximum ad content rating to G, because children may use a parent's phone.
- Never add an ad SDK to anything children sign in to.
- On web, show only first-party sponsor cards from `ads-service`. Load no ad network scripts, because the web app also holds finance and student records.
- Network ads run only in the Parent and Teacher mobile apps.
- Remove the advertising ID permission from the Parent and Teacher apps unless the legal review accepts it. This may lower ad yield.
- If a native student app is built later, complete Google Play Families review first and keep it ad-free.

### Metrics

Store only aggregate daily counts per campaign, slot and city:

- Eligible requests, fills, impressions and clicks
- Revenue
- eCPM
- Revenue per school and revenue per 100 students
- Ad reports and blocks

---

## 11. Unit economics model

These figures are planning assumptions and must be replaced with pilot data.

### Example: 500-student school

- 400 active parent accounts
- 12 sessions per month per parent
- 2 ads per session
- **9,600 impressions per month**

| Scenario | Yield | Monthly | Yearly | Per student per year |
|---|---|---|---|---|
| Network ads only | ₹30 per 1,000 | ₹288 | ₹3,456 | ₹6.91 |
| 60% direct at ₹200, 40% network at ₹30 | Mixed | ₹1,267 | ₹15,206 | ₹30.41 |

- At the mixed yield, 300 schools produce about ₹45.6 lakh a year.
- Paid competitors at ₹6 to ₹10 per student per month charge ₹36,000 to ₹60,000 a year for 500 students.

### Effect of adding staff ads

Assumptions for the same school:

- 25 teachers, 40 sessions a month, 2 ads per session: 2,000 impressions
- 5 management users, 20 sessions a month, 2 ads per session: 200 impressions
- Total increase: 2,200 impressions a month, or about 23%

| Scenario | Extra revenue per year |
|---|---|
| Network ads only | ₹792 |
| 60% direct, 40% network | ₹3,485 |

Staff ads are a small addition. Parent volume and direct sponsors still decide the model.

### Conclusions

- Network ads alone are unlikely to fund support and hosting.
- Direct local sponsors are essential.
- Track `ad revenue per school` against `cost to serve per school` from the first pilot.
- If ads do not cover cost to serve by the target scale, revisit the model before spending on growth.

### Cost controls

| Cost | Control |
|---|---|
| OTP | One OTP per device, rate limits, push where possible |
| Messages | Push first; school-funded SMS and WhatsApp |
| Storage | File size limits, compression and archive policy |
| Support | In-product guides, video help and community support |
| Onboarding | Self-serve import and sample data |
| App builds | Runtime branding where possible; native rebuilds batched quarterly |
| Custom domains | Free subdomain by default; automatic certificates through Caddy to avoid per-domain fees |
| Compute | Modular monolith, caching and scheduled report generation |
| AI | Free OpenRouter models for non-personal tasks, cached results, overnight batches and a per-school cap |

---

## 12. Security, privacy and compliance

### Required controls

- TLS for all traffic and encryption at rest
- Field-level encryption for sensitive fields
- Short-lived access tokens and refresh token rotation
- Rate limits on login and OTP
- Signed URLs for all documents
- Malware scan on uploads
- Daily encrypted backups and tested restore
- Separate production and test data
- Dependency and secret scanning in CI
- Independent penetration test before public launch

### Privacy features

- Parent consent ledger with notice version, timestamp and method
- Privacy notice in English, Telugu and Hindi
- Data access, correction and deletion requests
- Grievance contact per school
- Retention schedule and automatic deletion jobs
- School data export on exit
- Breach runbook, with notification steps confirmed by a lawyer
- Data processing agreement in onboarding
- Bus location retained only for a short safety period

### Legal gate before launch

A qualified Indian data protection lawyer must review:

- The fiduciary and processor split
- The parent consent flow
- The ad design in section 10
- The privacy notice and processing agreement
- School verification, logo rights and branding terms
- The AI features, the model provider contract and any transfer of data outside India

The chartered accountant must review finance outputs.

---

## 13. Build phases

Each phase ends with passing tests and a working demo.

### Phase 0: Foundation

- Monorepo, CI, linting, type checks, Docker and environments
- Database migrations and RLS framework
- Auth, memberships, RBAC and audit logs
- Design system, translations and seed data
- AI gateway with per-school cap, usage log and global off switch
- Design tokens, theme engine and core components
- Host-based school resolution

**Exit criteria**

- Two demo schools run side by side.
- Automated tests prove no cross-school access.
- Tests prove permission denial by default.

### Phase 1: School setup and records

- School wizard and academic structure
- Students, guardians and staff
- Excel import with dry run and undo
- Role dashboards
- Public school sign-up and verification
- Brand Studio and free school subdomain
- AI: Excel column mapping and import error fixes

**Exit criteria**

- A 500-student school can be imported in under 30 minutes.
- A school can sign up, brand itself and go live on a free subdomain with no help from us.
- Import errors are shown row by row.

### Phase 2: Daily operations

- Attendance, timetable, homework and diary
- Notices and parent-teacher messages
- One mobile app with Parent and Teacher experiences, using school branding after sign-in
- Installable web app with each school's name and logo
- Today timeline
- Student web app
- Empty `AdSlot` component in approved slot positions, with no ad SDK
- Faculty and employee attendance
- Leave management with HOD routing
- Substitutions and teacher and HOD timetables
- School Feed with audience control
- School calendar
- Notification centre and absence alerts
- Teacher leave reports
- AI: notice translation and summaries, read-aloud, homework and notice drafts

**Exit criteria**

- A teacher can mark class attendance offline in under 30 seconds.
- Parents see attendance and receive a push notification within 5 minutes of submission.
- An approved leave reaches every affected period in the substitution screen.
- A teaching HOD sees classes and cover duties on one timetable.
- Tests prove a staff-only post never reaches a parent or student API.
- CI proves the student app has no ad or analytics dependency.
- Empty ad slots collapse and do not change any screen.

### Phase 3: Fees

- Fee heads, plans, invoices and concessions
- Counter collection and receipts
- Razorpay adapter and webhooks
- Cashier close and core fee reports
- First version of the Total Finance Report: collections, dues and concessions
- AI: fee reminder drafts

**Exit criteria**

- Replayed webhooks cannot duplicate a payment.
- Receipt numbers remain gapless under concurrent load.
- Fee totals reconcile with the ledger.

### Phase 4: Exams and certificates

- Exam setup, mark entry, approvals and report cards
- Exam alerts and question paper release lock
- Student performance reports
- Transfer and bonafide certificates
- HOD and Principal approval flows
- AI: report-card remarks, question-paper drafts and plain-language report cards

**Exit criteria**

- Published results are visible only to the correct parent and student.
- A question paper cannot be released before its exam ends.
- A locked result cannot change without an audited correction.

### Phase 5: Pilot release

- Deploy with 3 to 5 schools
- Self-serve custom domains
- Website login button snippet
- Login and Home Studio
- Monitoring, backups and restore test
- In-product help, privacy notices and school agreement
- Penetration test and legal review
- AI: support assistant and Principal morning brief

**Exit criteria**

- Daily active use is sustained for 30 days.
- No severity-1 privacy or finance defects remain open.
- Cost to serve is measured per school, including AI.
- A pilot school connects its own domain using only the in-product guide.
- Teachers accept most AI drafts with light edits.

### Phase 6: Ads

**6A: Shared ad layer**

- `ads-service`, slot rendering, category rules and role switches
- School ad controls
- Native card designs
- Aggregate reporting

**6B: Type 1, Google Ads**

- AdMob native ads in Parent and Teacher apps, non-personalised
- Custom native layouts matching the app

**6C: Type 2, our Ads module**

- Enquiry form and tracking
- Campaign manager in Super Admin
- Review queue, invoices and reports
- AI: creative screening for banned categories, always with human review

**Exit criteria**

- Automated tests prove banned screens render no ads.
- Tests prove ad requests reject any non-allowlisted field.
- Tests prove every rendered ad shows a "Sponsored" label.
- Ad failure does not slow any app screen.
- Direct ads take priority over Google ads.
- Legal review of the live ad flow is complete.

### Phase 7: Finance suite

- Double-entry accounting
- Budgets, purchases, vendors and bills
- Bank reconciliation
- Payroll
- Financial statements and Tally export
- Full Total Finance Report for Management
- AI: bill capture, bank-match suggestions, anomaly alerts and finance summaries

**Exit criteria**

- Trial balance always balances.
- Payroll and statutory calculations are tested against accountant-approved samples.
- Locked periods cannot be changed.

### Phase 8: Operations modules

- Admissions and lesson plans
- Teacher performance reports, once a term of data exists
- Features marked Phase 8 in section 20
- App Factory for Android, then iOS
- Transport and bus location
- Library and inventory
- Compliance exports
- AI: parent assistant, Ask Your School for staff, lesson plans and admissions FAQ

### Phase 9: Scale

- Multi-branch reporting
- Hostel, health, counselling and gate modules
- Biometric integrations
- Advanced AI: early-support signals, WhatsApp assistant and voice notes
- Features marked Phase 9 in section 20
- Automatic update rollout across school-owned apps
- Load testing and database partitioning for attendance, logs and notifications

---

## 14. Required automated tests

- Cross-school isolation on every endpoint
- Every permission cell in section 6
- Parent can access only linked children
- Student cannot access other students' data
- Ledger balancing and reversal
- Payment webhook replay and out-of-order events
- Concurrent receipt generation
- Offline sync conflicts
- APAAR refusal does not block any workflow
- Ad deny-list route test for every route and role
- Role switch test: turning off an ad audience stops its ads without an app release
- Classroom display mode renders no ads
- Student login stays disabled until the school enables it for that class
- Ad payload allowlist test
- "Sponsored" label test for both ad types in English, Telugu and Hindi
- Dependency scan that fails if `apps/student` adds an ad, analytics or tracking package
- Backup restore
- Layout JSON rejects unknown blocks, removed required items and hidden ad slots
- A layout publish reaches the app with no rebuild, and can be rolled back
- App Factory produces valid builds for 2 test schools, with no secrets in logs
- Same-user sessions cannot cross school domains
- Unverified domains and schools cannot go live
- Removing a domain's DNS falls back safely to the free subdomain
- Theme contrast passes for random school colours
- Ads never render a school's name or logo
- Screenshots at 360px, light and dark, in English, Telugu and Hindi
- Maestro mobile flows for sign-in, attendance, leave and fee payment
- Personal data cannot reach a free model endpoint
- Leave routing, escalation and balance updates
- Absence alert is corrected if attendance is corrected, and is skipped for approved leave
- Audience tests for feed, calendar and push
- AI respects role and tenant limits, including through prompt injection attempts
- AI cannot complete a protected action without approval
- Every core workflow passes with AI off
- Per-school AI cap pauses AI features only
- Model quality checks in English, Telugu and Hindi, run before any prompt or model change
- Accessibility and low-end device checks

---

## 15. Demand plan

### Target customer

- Private schools with 200 to 1,500 students
- Budget-conscious schools using Excel, registers or basic apps
- Schools in Hyderabad and Tier 2 and 3 cities across Telangana and Andhra Pradesh

### Why they switch

| Hook | Expected result |
|---|---|
| Free with no student cap | Removes the budget objection |
| Complete parent, teacher and finance apps | Beats limited free tiers |
| Self-serve Excel migration | Removes setup friction |
| Telugu and Hindi support | Improves parent and staff adoption |
| The school's own name, logo and web address, free | Paid white-label is often a premium feature |
| Consumer-grade app | Parents and teachers actually use it |
| AI that saves staff hours each week | Gives schools a reason to switch beyond price |
| Ad controls and an ad-free student experience | Answers the main objection to ad funding |
| DPDP-ready consent and audit features | Gives schools a reason to act before May 2027 |

### Launch timing

- Pilot before the new academic session.
- Target school decisions between January and March.
- Finish fees and records first, because schools feel those needs at session start.

### Growth loops

- A referral from one principal to another
- Public QR-verified certificates and receipts carrying a small product credit
- A public fee-reminder and report-card template library
- Trust and group rollouts across branches

### Launch metrics

- Schools activated
- Share of students imported
- Weekly active teachers
- Parent app activation
- Fees collected through the system
- Ad revenue per school
- Cost to serve per school
- School retention at 90 days

---

## 16. Open decisions

| Question | Default until decided |
|---|---|
| Should ads stay on for management? | Yes; review after the pilot using school feedback and revenue |
| Can a school turn off all ads? | No, but it can block categories and advertisers |
| Should a school be able to pay to remove ads? | Not offered, because the product promise is free for everyone |
| Should schools share direct-ad revenue? | Not in v1; test later as a growth lever |
| Will a native student app be built? | No; use the web app until demand is proven |
| Which paid or private model handles personal data? | Choose after testing Telugu and Hindi quality, cost and data terms |
| Should ads appear in the School Feed? | No; official posts stay ad-free, and ads stay on Parent home |
| Should students get an AI tutor? | No in this product; revisit only with legal review and a separate design |
| Can a school remove "Powered by"? | No; it stays small on sign-in and is a growth channel |
| Which product name appears in app stores? | Choose before Phase 2 |
| Who pays for app builds? | We do, within a limit of one school-requested build per month, plus scheduled updates |
| Can school-owned apps show Google ads? | Off until AdMob's position on our publisher ID in a school's app is confirmed; direct ads stay on |
| Which entity operates the platform? | Confirm before signing school agreements |

---

## 17. Reference notes

- DPDP Act section 9: covers verifiable parental consent, harm, and the ban on tracking and targeted advertising directed at children. Reported penalty for section 9 breaches: up to ₹200 crore.
- Substantive DPDP obligations commence around 13 May 2027.
- The Fourth Schedule educational institution exemption is limited to tracking and monitoring for educational activities or child safety. It does not create an advertising exemption.
- Supreme Court order of 20 July 2026, *Abhishek Baxi v. Union of India*: the APAAR consent form must allow refusal, and data must not be shared with private parties except as permitted by law.
- Google Play's Families policy and AdMob rules apply to apps with child audiences.
- Apple guideline 4.2.6, as quoted on Apple's forum: template-generated apps are rejected unless submitted directly by the provider of the app's content. Read the current guidelines before any per-school store build.
- Google says apps that only wrap a website can be treated as webview spam, so the mobile app must offer real native value.
- Apple organisation enrolment requires a legal entity, a D-U-N-S number and an organisation website. Expo pricing, Apple fees and Google's account rules should be rechecked before Phase 8.
- OpenRouter limits and provider data policies change often. The figures in section 18 are from third-party reports in October 2026 and must be checked against current documentation.
- AdMob native ads must carry an "Ad", "Advertisement" or "Sponsored" label and be clearly distinguished from content.
- India's Guidelines for Prevention and Regulation of Dark Patterns, 2023 list disguised advertisement as a dark pattern and apply to platforms, advertisers and sellers.
- All legal notes here are engineering input, not legal advice. Re-check them before launch.

---

## 18. AI layer

### Principles

- Use AI where it saves time, explains something or reduces errors.
- Use plain rules, statistics or a solver when they do the job better. They are cheaper and easier to check.
- AI drafts and suggests. People approve.
- Launch few features, measure use and expand what people keep.

### AI modes

| Mode | Meaning | Example |
|---|---|---|
| Draft | Person edits and approves | Report-card remark |
| Explain | Read-only help | Report card in Telugu |
| Suggest | Person accepts or rejects | Bank match |
| Alert | Flags something for review | Duplicate payment |
| Solve | Non-AI optimiser | Timetable |

### Parent

| Feature | Mode | Phase | Expected result |
|---|---|---|---|
| Translate notices into Telugu, Hindi and more | Explain | 2 | Parents understand school messages |
| Read notices aloud | Explain | 2 | Helps parents who prefer listening |
| Daily summary of notices, homework and dues | Explain | 2 | Less message overload |
| Report card explained simply | Explain | 4 | Better parent understanding and PTM talks |
| Parent assistant for school questions and own child's data | Explain | 8 | Fewer repeat calls to the office |
| Voice or local-language leave and message drafts | Draft | 8 | Easier communication with teachers |
| WhatsApp assistant through the school's account | Explain | 9 | Reaches parents who rarely open apps |

### Teacher

| Feature | Mode | Phase | Expected result |
|---|---|---|---|
| Homework, notice and diary drafts | Draft | 2 | Less daily writing |
| Report-card remarks | Draft | 4 | Saves hours each exam cycle |
| Question papers, worksheets and answer keys | Draft | 4 | Faster assessment preparation |
| Mark-sheet photo capture | Draft | 4 | Less manual entry, with teacher checks |
| Lesson plans from the school's syllabus | Draft | 8 | Faster planning |
| Parent reply drafts | Draft | 8 | Faster, calmer replies |
| Voice notes turned into class diary entries | Draft | 9 | Faster updates on a phone |

### HOD

| Feature | Mode | Phase | Expected result |
|---|---|---|---|
| Question-paper balance check | Suggest | 4 | Better coverage and difficulty mix |
| Result analysis by subject and topic | Explain | 4 | Finds where teaching support is needed |
| Syllabus gap alerts | Alert | 8 | Fewer rushed topics before exams |
| Teacher workload view | Alert | 8 | Fairer allocation |

### Principal and Management

| Feature | Mode | Phase | Expected result |
|---|---|---|---|
| Morning brief | Explain | 5 | Priorities visible in two minutes |
| Circular and speech drafts | Draft | 5 | Faster communication |
| Ask Your School: plain-English questions on school data | Explain | 8 | Answers without waiting for reports |
| Timetable suggestions | Solve | 8 | Fewer clashes |
| Teacher and student report summaries | Draft | 8 | Faster review meetings |
| Monthly management report | Draft | 8 | Saves report preparation time |
| Admissions forecast | Alert | 8 | Better seat and staff planning |
| Early-support signals for attendance or marks drops | Alert | 9 | Teachers can help sooner |

Early-support signal limits:

- Rule-based and explainable
- Shown only to authorised staff
- Never a score, label or prediction about a child's character or future
- Never shown to advertisers or used for ads
- Requires legal review before release

### Accounts

| Feature | Mode | Phase | Expected result |
|---|---|---|---|
| Fee reminder drafts by language and tone | Draft | 3 | Better collections with less staff effort |
| Bill photo to draft voucher | Draft | 7 | Less manual entry |
| Bank-match suggestions | Suggest | 7 | Faster reconciliation |
| Duplicate, unusual concession and cash variance alerts | Alert | 7 | Earlier error and fraud detection |
| Collection and cash-flow forecast | Alert | 7 | Better salary and spending planning |
| Plain-English report summaries | Explain | 7 | Management understands the numbers |

### Admin Office and Admissions

| Feature | Mode | Phase | Expected result |
|---|---|---|---|
| Excel column mapping and error fixes | Suggest | 1 | Faster self-serve onboarding |
| Paper form capture | Draft | 8 | Faster digitisation of records |
| Certificate and letter drafts | Draft | 8 | Faster office work |
| Admissions FAQ for applicants | Explain | 8 | Fewer repeat enquiries |
| Compliance data checks | Alert | 8 | Fewer reporting errors |

### Platform

| Feature | Mode | Phase | Expected result |
|---|---|---|---|
| In-product support assistant | Explain | 5 | Lowers support cost on a free product |
| Ad creative screening | Suggest | 6 | Faster, safer ad review |
| Ad copy help for local sponsors | Draft | 6 | Helps small businesses start campaigns |
| App text translation | Draft | 2 | Faster language rollout |

### Out of scope

- Student chatbot or AI tutor in this product
- Face-recognition attendance
- Emotion, attention or behaviour monitoring
- Automatic grading without teacher approval
- AI proctoring
- AI rankings of students or teachers
- Automated teacher appraisal, hiring or discipline decisions

### AI gateway

All AI calls go through `packages/ai`, which provides:

- Provider adapter and model routing by task and data tier
- Registry of allowed models, each with its verified data policy
- Queue that respects provider rate limits
- Permission check before any data is fetched
- Data minimiser and name tokeniser
- Versioned prompts
- Output checks and required approval state
- Per-school and per-user limits
- Caching and overnight batches
- Usage, cost and acceptance logs, with short retention for prompt content
- Global, per-school and per-feature switches

### Parent assistant rules

- Answers only from approved school content and the parent's linked children
- Cites the source and says when it does not know
- Hands off to the school for complaints, fees disputes and anything urgent
- Gives no medical, legal or counselling advice
- Shows a clear "AI assistant" label

### Model tiers

| Tier | Data | Model | Example features |
|---|---|---|---|
| 1 | No personal data | OpenRouter free models from the registry | Worksheets, question papers, lesson plans, circular drafts, ad copy, app text, translation of school-wide notices |
| 2 | Personal data | Paid or self-hosted model with no training, zero or short retention, and a signed data agreement | Report-card remarks, parent assistant, Ask Your School, fee reminders, mark-sheet and bill capture, report summaries |

- Scan Tier 1 input for names, phone numbers and IDs. If found, block the call or move it to Tier 2.
- Only use free models whose current data policy has been verified, and recheck the registry monthly.
- Free models can be withdrawn at any time, so every Tier 1 feature needs a backup model or a clear "try later" state.
- Validate quality in English, Telugu and Hindi before adding a model.

### Free-tier limits

Reported limits, October 2026. Confirm against OpenRouter's current documentation.

- 20 requests per minute
- 50 requests per day, or 1,000 per day after buying $10 of credits
- Assumption: a 500-student school needs about 60 requests a day
- Result: one account supports about 15 active schools

Controls:

- Translate each notice once per language and reuse the result.
- Cache worksheets, templates and summaries.
- Queue drafts and run bulk work overnight.

### Cost guardrail

- Tier 1 target: near zero cost.
- Tier 2 cap: under 20% of ad revenue per school, or about ₹58 to ₹253 per school per month at the section 11 examples.
- When a school reaches its cap, AI pauses until the next month and core features continue.
- Before each release, compare cost per use with this cap and with feature adoption.

---

## 19. Detailed daily workflows

### Faculty and employee attendance

- Covers teaching and non-teaching staff.
- Capture by mobile check-in, staffroom QR, office entry or later biometric import.
- Optional school-area check for mobile check-in, chosen by the school.
- Status: present, late, half day, on duty, on leave, absent, holiday.
- Staff request corrections; the HOD or reporting manager approves them.
- Approved leave updates attendance automatically.
- Monthly attendance register flows into payroll.

### Staff leave management

| Applicant | First approver | Next approver |
|---|---|---|
| Teacher | HOD | Principal, if above the school's day limit |
| HOD | Principal | Management, if above the limit |
| Principal | Management | – |
| Non-teaching staff | Reporting manager | Principal or Admin, by school rule |
| Teacher with no HOD | Vice Principal or Principal | – |

- Leave types are set by each school: casual, sick, earned, maternity, compensatory, on duty and unpaid.
- Support full day, half day, date range and attachments.
- Show balance, team absences and affected classes before approval.
- Exclude holidays and weekly offs according to school rules.
- Support approve, reject, return for changes and cancellation.
- If an approver does not respond in time, escalate. Never auto-approve.
- Support an urgent same-day leave request.
- Support an acting approver when the HOD is away.
- Unpaid leave flows into payroll.

### Student leave

- Parent applies in the app.
- Class teacher approves.
- Attendance shows leave, and no absence alert is sent.

### Assigning a substitute teacher

1. Leave is approved, or a teacher is marked absent.
2. The system lists every affected period.
3. It suggests free teachers, ranked by subject match, classes taught, cover count and daily load.
4. The HOD assigns cover. A coordinator handles cross-department cover.
5. The substitute gets a push alert.
6. That date's timetable changes for the teacher and class. The master timetable does not.
7. Unassigned periods alert the HOD and Principal.

- Cover assignment uses rules, not AI, so it works with no model available.
- Record cover counts, with an optional extra-period allowance.

### Timetables

- Class timetable for parents and students
- Personal timetable for every teacher
- Personal timetable for HODs and Principals who teach
- Maximum daily and weekly teaching load
- Today's view includes cover classes, duties and room changes

### School Feed

The person posting must choose who can see the post.

| Audience | Who sees it |
|---|---|
| Employees only | All staff, or chosen departments or roles |
| Parents only | All parents, or chosen classes and sections |
| Employees and parents | Both groups |
| Students | Only where the student login is enabled |
| Specific people | Named parents or staff |

- Show a preview before posting, such as "46 staff and 812 parents will see this."
- Mark staff-only posts with a clear "Staff only" badge.
- Post types: notice, photo, PDF, event, poll and emergency alert.
- Options: schedule, expiry, pin, required acknowledgement, push on or off.
- Teachers post to their own classes.
- School-wide posts need Principal or Admin approval.
- Comments are off by default.
- Authors see read counts.

### School calendar

- Parents see holidays, exams, PTMs, events and fee dates.
- Staff additionally see staff-only meetings, training and duties.
- Month and list views
- Filter by class
- Add to phone calendar
- Push alert if a holiday or exam date changes

### Notification centre

| Event | Who receives it | Timing | Can turn off? |
|---|---|---|---|
| Student absent | Parents | Within 5 minutes of attendance submission | No |
| Attendance corrected | Parents | Immediately | No |
| Student leaves early or is absent from later periods | Parents | Immediately | No |
| Exam timetable published | Parents | On publishing | Yes |
| Exam reminder | Parents | Day before | Yes |
| Question paper available after exam | Parents | After exam end | Yes |
| Marks or report card published | Parents | On publishing | No |
| Corrected answer sheets available | Parents | On publishing | Yes |
| Fee due | Parents | School schedule | Yes |
| New post | Audience | On publishing | Yes, except required posts |
| Calendar change | Audience | Immediately | Yes |
| Emergency alert | Audience | Immediately | No |
| Leave request and decision | Approver and applicant | Immediately | No |
| Cover assigned | Substitute teacher | Immediately | No |

- Send to every linked guardian who has notifications turned on.
- Group alerts for siblings.
- Respect quiet hours, except emergencies.
- Use the parent's chosen language.
- If absence push fails, optionally use the school's SMS or WhatsApp account.
- Log sent, delivered and opened status where the channel provides it.

### Reports

All reports support date and class filters, and PDF and Excel export. Reports use published or approved data only.

**Total Finance Report for Management**

- Income, expenditure and surplus
- Collection against target
- Dues and ageing
- Fee collection by class, head and payment mode
- Concessions, refunds and write-offs
- Cash and bank position
- Budget against actual, by department
- Payroll cost and share of income
- Vendor payables
- Fee income and cost per student
- Month, year and branch comparisons
- Fee and cash forecast
- Scheduled monthly PDF for Management

**Teacher performance report**

- Classes taken against scheduled
- Syllabus and lesson-plan completion
- Homework and marks submitted on time
- Class results, compared with the same class's earlier results
- Attendance, leave and cover classes taken
- HOD or Principal observations
- Training completed

Limits: visible to the teacher, HOD, Principal and Management. Used for review conversations. No automatic ranking or score decides appraisal, pay or action.

**Student performance report**

- Subject marks and term trends
- Exam comparison and class average
- Weak and strong topics
- Attendance and homework completion
- Co-curricular progress and teacher remarks
- Class, subject and school views for staff

Limits: parents see only their own child. Class position is shown only if the school enables it.

**Teacher leave report**

- Leave by teacher, department, type and month
- Balance and unpaid leave
- Pending and rejected requests
- Periods affected, covered and left uncovered
- Cover load by teacher

---

## 20. Additional features

### Add to the pilot if time allows

| Feature | Phase | Expected result |
|---|---|---|
| Academic year rollover and promotion wizard | 4 | Avoids rebuilding classes every year |
| Exam portions and date sheets | 4 | Answers one of parents' most common questions |
| Hall tickets, seating plans and invigilator duty | 4 | Saves exam-office work |
| Attendance shortfall alert at a school-set level | 4 | Warns families before exam eligibility is at risk |
| Multiple guardians, with restricted access where a school records it | 2 | Prevents information reaching the wrong person |
| Staff duty roster for gate, bus, lunch and exam duties | 2 | Replaces paper duty charts |
| Grievance tickets with status and timelines | 5 | Replaces untracked calls and complaints |

### Child safety

| Feature | Phase | Expected result |
|---|---|---|
| Authorised pickup list with photo | 8 | Stops release of a child to the wrong person |
| Early-exit gate pass with parent OTP or QR | 8 | Safer and traceable early departures |
| Emergency drill and headcount mode | 8 | Faster response in a real incident |
| Confidential safe-reporting channel | 8 | Gives children and staff a protected route, with restricted access |
| Vehicle fitness, insurance and driver licence expiry alerts | 8 | Reduces transport compliance risk |

### Growth and adoption

| Feature | Phase | Expected result |
|---|---|---|
| Free school website with admissions enquiry form | 8 | Strong free hook and a source of new school sign-ups |
| Digital ID cards and bulk ID printing | 8 | Immediate visible value for schools |
| PTM booking and feedback | 8 | Reduces queues and improves meetings |
| Book, uniform and supply lists | 8 | Useful to parents and a natural sponsor category |
| Photo consent and album sharing | 8 | Reduces risky WhatsApp sharing |
| Parent feedback surveys | 8 | Gives Principals early warning of problems |

### Staff and academics

| Feature | Phase | Expected result |
|---|---|---|
| Staff document expiry alerts | 8 | Avoids missed renewals |
| Question bank by chapter and difficulty | 8 | Reuse improves exam preparation |
| Remedial class tracking | 8 | Shows whether support is working |
| Training and professional development log | 8 | Supports review and compliance |
| Staff meeting minutes and action items | 9 | Makes follow-up visible |
| Sports, house points and achievements | 9 | Builds a broader student profile |
| Board-required public disclosure page | 9 | Saves website compliance work |

---

## 21. Design and user experience

### Quality bar

The app should feel as fast, clear and polished as India's best consumer apps. Learn from their interaction quality. Do not copy their look.

| Pattern to learn from | Where it applies | Expected result |
|---|---|---|
| Food-delivery home: what matters now, one tap away | Parent home shows today's status, dues and next action | No menu hunting |
| Live order tracking | School bus, leave approval and fee payment status | Fewer "what's happening?" calls |
| Two-tap checkout | UPI fee payment with saved details at the gateway | Faster collection |
| Personalised, tidy rails | Upcoming exams, homework and events | Important items stay visible |
| Fitness-app progress views | Child progress, attendance and class trends | Reports become easy to understand |
| Clear confirmation moments | Payment, leave sent and attendance submitted | People trust that the task is done |

### Signature element: the Today timeline

- The app's home is a live timeline of the school day.
- Parents see arrival, classes, homework, exams and bus status.
- Teachers see classes, cover duties, leave approvals and attendance still to mark.
- Principals see the school's day: absences, cover gaps, collections and approvals.
- Every card has one clear next action.

### Visual system

Each school's colour is the accent. The product's neutral base stays constant.

| Token | Default | Use |
|---|---|---|
| Ink | `#17233B` | Main text and icons |
| Mist | `#EEF2F7` | Page background |
| Surface | `#FFFFFF` | Cards and sheets |
| Slate | `#5D6B82` | Secondary text |
| Default brand | `#0F7C8A` | Accent until a school picks its own |
| Success | `#0F8A5F` | Present, paid, approved |
| Alert | `#D92D3A` | Absent, overdue, emergency |
| Amber | `#B76E00` | Pending, due soon |

- Typeface: Anek Latin, Anek Telugu and Anek Devanagari, so all three languages match.
- Use a real type scale and strong headings. Avoid walls of small grey text.
- Vary hierarchy. Do not make every item the same rounded card.
- Use the school's own photos in key moments.
- Provide light and dark themes.

### Interaction rules

- Show feedback within 100ms of every tap.
- Use optimistic updates for low-risk actions, with safe undo.
- Use skeleton screens for content, not spinners.
- Maximum 5 bottom tabs per role.
- Keep primary actions in thumb reach.
- Touch targets at least 48dp.
- Use bottom sheets for short tasks, pull to refresh and subtle haptics.
- Motion answers a person's action: open, confirm, change. Avoid decorative motion.
- Respect reduced-motion settings and lower animation on low-end phones.
- Empty states say what to do next.
- Errors say what happened and how to fix it.
- Copy is plain, short and sentence case in every language.

### Staff web

- Dense, fast tables with filters, bulk actions and saved views
- Keyboard shortcuts and a command search
- Works well at laptop widths and on tablets
- Long tasks show progress and can be resumed

### Performance budgets

| Measure | Target |
|---|---|
| Mobile cold start on a low-end Android phone | Under 2.5 seconds |
| Web largest content paint on slow 4G | Under 2.5 seconds |
| Screen change | Under 300ms |
| List scrolling | Smooth at 60fps on target devices |
| Android download size | Under 40 MB |

### Design review gate

Every screen must be checked for:

- Light and dark mode
- 360px phone and laptop widths
- English, Telugu and Hindi
- Loading, empty, error and offline states
- WCAG AA contrast and screen-reader labels
- A real low-end Android phone
- One clear primary action

---

## 22. White-label and self-serve launch

### Goal

A school can sign up, add its name, logo and website address, and launch by itself. We do no setup work.

### Where each school's brand appears

| Surface | Method | Expected result |
|---|---|---|
| School website address | `app.schoolname.com` points to our platform | Everything runs at the school's own address |
| Free fallback | `schoolname.campus.app`, replacing the domain once a product name is chosen | Live in minutes with no DNS work |
| Installable web app | Per-domain manifest, name and icon | School logo on the home screen on Android and iOS |
| Shared Android and iOS app | After sign-in or school QR, loads the school's theme | School identity inside a store-approved app |
| Documents | Receipts, report cards, certificates and emails | Consistent official branding |
| Sign-in and share links | School logo, name and photo | Parents trust what they see |

### Self-serve journey

1. School signs up on the public website.
2. School proves it is real: official website, recognition or UDISE details, and an authorised contact.
3. Brand Studio collects name, logo, colours, sign-in photo and terminology.
4. Live preview shows phone, web, receipt and report card.
5. School goes live on the free subdomain.
6. School enters its website address.
7. The system shows the exact DNS record, with guides for common providers and a link to send to its web person.
8. The system checks DNS, proves ownership, issues HTTPS automatically and turns the domain on.
9. Parents get a QR code and sign-up link for the school.

Target: under 30 minutes of school effort, excluding DNS changes by a third party.

### Brand Studio settings

- School name, short name and motto
- Logo, app icon and favicon, generated from one upload
- Brand colour suggested from the logo, with automatic contrast fixes
- Preset themes
- Login and home screen design (Login and Home Studio below)
- Terms such as Class or Grade, HOD or Coordinator
- Modules on or off
- Receipt, report card and certificate templates
- Reply-to email and support contact
- Preview before publish, and rollback to an earlier version

### Running on the school's website

| Option | How | Use |
|---|---|---|
| Subdomain (recommended) | `app.schoolname.com` by CNAME | Keeps the school's existing site untouched |
| Login button | Copy a link or button into the existing site | Quickest path for parents |
| Our free website | School points its main domain to us | For schools with no site or a poor one (section 20) |

- Do not run the system inside an iframe. It weakens sign-in security and mobile behaviour.
- The student app runs at `/student` on the same address.
- Only allow a main domain when the school uses our website, so its existing site is not replaced by accident.

### Technical design

- `packages/tenancy` maps each request host to a school, with caching.
- `school_domains` stores host, verification token, status, certificate state and last check.
- Verify ownership with a DNS TXT record.
- Issue certificates only for verified hosts in `school_domains`.
- Theme settings are versioned JSON, compiled to design tokens and cached on a CDN.
- Serve `manifest.webmanifest`, icons, Open Graph tags and page title per host.
- Use host-only cookies and an allowlist for CORS.
- Recheck DNS daily. If a domain stops pointing to us, disable it and fall back to the subdomain.
- Mark school portals as noindex, except public website pages.

### Mobile apps

**Recommended: one shared store app**

- One Android and iOS listing under our product name.
- Parents join by school QR, link or school code.
- After joining, the app shows the school's name, logo and colours.
- The icon and name on the phone remain ours.
- Ads, updates and reviews stay simple.

**School logo on the phone home screen**

- Use the installable web app from the school's domain.
- Android installs it from the browser.
- iPhone users add it from Safari.
- iPhone web push works only after adding it to the Home Screen, so the install guide must explain this.

**Upgrade: a school-owned store app, through App Factory**

The shared app stays available, so no school waits for store approval. See App Factory below.

Never publish many near-identical school apps under our own developer accounts. Apple can reject them, and the account itself may be at risk.

### Login and Home Studio

Schools design these screens themselves, with no rebuild. The change appears in the shared app, the school's app and the web app after publishing.

**Login screen**

- Choose a layout: photo, logo-led, split, or school-colour
- School photo or short looping background on web
- Welcome message in each language
- Logo size and position, within safe limits

**Home screen, per role**

- Drag approved blocks into order
- Choose quick actions
- Add a photo banner or carousel
- Add a Principal's message, upcoming events, gallery, achievements or useful links
- Save different layouts for parents, teachers and management

**Limits**

- The Today timeline stays visible on every home screen.
- Fee, attendance, notices and emergency access stay within one tap.
- Ad slots remain in fixed positions and cannot be hidden.
- Privacy, terms and "Powered by" stay in place.
- Every layout must pass contrast, text-size and image-size checks.
- No student names or photos in public login screens.

**Flow**

1. Edit on a live phone preview.
2. Scan a QR code to view it on a real phone.
3. Publish.
4. Roll back to any earlier version.

Expected result: schools feel the app is theirs, with no custom development or support work.

### App Factory

Yes, the app can be created automatically. Publishing still needs the school's own store accounts.

| Step | Who does it |
|---|---|
| Generate icon, splash, app ID, name and config from Brand Studio | Automatic |
| Build Android and iOS apps | Automatic with Expo EAS |
| Generate store text, screenshots and privacy answers | Automatic; school reviews |
| Show progress and exact next steps | Automatic |
| Create Google and Apple organisation accounts | School |
| Connect store access keys | School, with a guide |
| Create the store listing and first submission | School, with a guide; automate wherever store APIs allow |
| Send later updates to the stores | Automatic after setup |
| Store review | Google and Apple |

**Flow**

1. School clicks "Create my app" in Brand Studio.
2. Readiness check confirms verification, logo size, name, privacy URL and support contact.
3. App Factory creates a build configuration from versioned settings.
4. Android: build the upload file and generate the listing kit.
5. iOS: ask for the school's App Store Connect API key, then build and upload.
6. The dashboard guides the school through forms and submission.
7. School receives store links, plus a QR code for parents.

**Build states**

`draft`, `checks_failed`, `waiting_for_school`, `queued`, `building`, `ready_to_upload`, `uploaded`, `in_review`, `rejected`, `live`, `credentials_expired`

**School requirements**

| Item | Google Play | Apple App Store |
|---|---|---|
| Fee | $25 once | $99 a year, unless a waiver is approved |
| Legal entity | Required for an organisation account | Required |
| D-U-N-S number | Required | Required, except government organisations |
| Website | Needed in some flows | Required, on the organisation's domain |
| Work email | Recommended | Required, on the organisation's domain |

- If a school already has an organisation account, it pays no new fee and skips account setup. App Factory asks this first and goes straight to connecting store access.
- Apple's annual fee continues on an existing account. It must stay active or the app stops being available for new downloads and updates.
- A personal account should be replaced with an organisation account, so the listing shows the school and not an individual.
- Expect about 4 to 8 weeks for a new organisation account.
- Google's 12-tester closed test is reported to apply to personal accounts, not organisation accounts, so schools must use an organisation account.
- Apple offers fee waivers to accredited educational institutions. Apple's page does not mention India, so schools should apply and confirm.

**Issue handling**

- Show plain-language help for common failures.
- Add a "Get help" button that attaches the build log, with secrets removed.
- Schools contact us only when the guide cannot solve the issue.

**Updates**

- Layouts, colours, photos and content update at runtime, with no store release.
- Code updates use over-the-air updates where store rules allow, or a controlled self-hosted update server at scale.
- Native updates rebuild every school app in small batches.
- Stop the rollout if failures rise.

**Ads in school-owned apps**

- The school agreement must keep ads on and give the platform the ad revenue.
- The school must declare ads and data use correctly in its store listing.
- Direct ads from our Ads module work without any change.
- AdMob requires `app-ads.txt` at the store listing's developer website. Serve it from the school's app address, but confirm with Google that our publisher account can monetise a school-owned app before enabling it.

**Costs**

- Expo's listed usage cost is $1 for an Android build and $2 for an iOS build on medium workers.
- That is about $3 per school for one full release, or $12 a year for quarterly releases.
- Over-the-air update costs grow with active users, so review them before 50,000 monthly users.

**Store review risk**

- Apple's rule allows template apps when submitted by the content provider, but Apple can still reject apps it sees as too similar.
- Run the first 2 school apps as a test before promoting this feature.
- Keep the shared app as the fallback.

### Safety

- Verify schools before their branding or domain goes live, so nobody can impersonate a real school to collect parent data.
- The school confirms it has the right to use its logo.
- Support a report-impersonation link.
- Remove a domain record when a school leaves, so it cannot be taken over.
