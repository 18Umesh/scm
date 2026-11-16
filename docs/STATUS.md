# Implementation status

**Active local pilot:** Netaji Public School, Grade 4 A, ten students and nine logins (three teachers, HOD, Principal, Accounts and three parents). The prior two-school accounts are inactive. See [NETAJI_SETUP.md](NETAJI_SETUP.md) for current credentials and relationships. Role permissions retain their existing baseline for the next review.


Updated 12 November 2026. The user's follow-up requests continued implementation across phases without stopping for phase reviews. Requirements remain in `docs/BUILD_SPEC.md`.

This is a substantial working implementation, **not a complete implementation of every requirement in the specification**. A catalog module means authorized records and listed workflows exist, not that every advanced feature in that domain is complete. No phase is declared production-ready.

| Area | Implemented | Remaining work |
|---|---|---|
| Platform | Nest API, adult/student Next apps, native Expo app, SQL migrations, tenant RLS, audit, permissions, themes, three-language dictionaries | Distributed limits/replay protection, platform SSO/passkeys, recovery, support grants, scale testing |
| Onboarding | Signup/DPA confirmation, manual verification CLI, academic structure, student/staff/guardian records, phone-based guardian linking, staff provisioning, Excel/CSV preview/commit/undo | Actual verification service, phone-change/recovery, broader imports, asset uploads/malware scanning |
| Daily work | Timetable clash checks, bulk attendance, corrections, offline browser queue, absence alerts, staff attendance, encrypted leave, routing/balances/escalation, cover gaps/assignment, homework, feed/audiences, calendar, messages | Acting/delegated approvers, approved-leave cancellation, attendance desk beyond 100 students, full schedule overrides, duty conflicts |
| Notifications | Transactional outbox, recipient/class access rechecks, quiet hours/preferences, bounded retries, encrypted OTP, school-owned HTTPS push/SMS/email adapters | Native device-token registration, direct FCM/APNs adapters, multilingual templates, BullMQ/Redis transport, monitoring |
| Students | Separate PIN login, class enablement, withdrawal checks, read-only timetable/homework/results/notices; no fees, ads, AI or attendance | Recovery, full offline experience, manual accessibility review |
| Fees | Fee heads/plans, idempotent class invoice generation, invoice issue/accrual, counter collections, immutable gapless receipts, QR verification/PDF, concessions/refunds, parent gateway links, raw HMAC webhooks/replay protection | Late fees/reminders, advance credits, outstanding payment-link cancellation, settlements, actual gateway sandbox acceptance |
| Accounting | Integer paise, DB-enforced balanced immutable journals, reversals, period locks, trial balance, dated P&L/balance sheet, bank import/exact reconciliation, approval limits, vendor/budget/purchase/bill registers, controlled payments/payroll posting | Chart editor, budget encumbrances, three-way matching, ageing, multi-bank matching, cash-flow statements/Tally export, statutory payroll and payslip generation |
| Exams | Subject-restricted entry/history, HOD/incharge class teacher appointments and all-subject class-teacher summaries, calendar-linked published schedules and exam types, server-enforced day-after mark entry, atomic class-wide drafts/submission, student marks/attendance history graphs and class dashboard, submit/approve/publish, paper release lock, performance reports, immutable approved report-card snapshots/PDF, approved certificates/PDF | Assessment weighting and advanced report-card templates, moderation reopening/history, cumulative reports, all requested indicators |
| Operations | Atomic admissions-to-student/enrollment/guardian conversion, library availability/returns, stock validation, vehicles/trips, PTM bookings, approved encrypted privacy exports/expiry, privacy registers, hostel capacity, encrypted nurse/counsellor records, visitors, one-use parent pickup pass | GPS/biometrics, bus subscriptions, scheduled retention policies, object-storage deployment, advanced hostel/health workflows |
| Branding/domains | Identity settings, versioned theme/rollback, role layout editor, mandatory blocks, actual DNS TXT/CNAME checks, ownership-loss disable, Caddy TLS authorization | Image processing, all login layouts, public school website, recurring DNS checks, production ingress test |
| Mobile/App Factory | Native Today/modules/forms/actions, OTP, roles, secure CSRF persistence and serialized refresh/restore, system dark mode, Android/iOS JS exports, readiness checks, encrypted credential records | Native persistent-cookie/device acceptance, full mobile parity, device tests, APK/IPA automation, secret manager, EAS worker/store submission, signed OTA/rollback |
| Ads | Native image/video School Feed ads, a My Classes directory placement, local-only media demos with offer preview, example rotation and hide/report controls on adult home pages; isolated live service/database, review API, strict contextual payload, category/role/route restrictions, aggregate metrics, labelled adult home cards, failure collapse; off by default | School/reviewer/admin UI, durable classroom mode, campaign billing/enquiry workflow, Google integration/legal approval |
| AI | Off-by-default gateway, input guard, caps, metadata logs, draft review; personal tier blocked | Approved models, paid/private provider, role assistants, workflow integration, multilingual quality tests |
| Release | Local demo, CI/container configuration, SQL security checks, browser/axe checks | Pilot, Docker execution, encrypted backup/restore drill, incident monitoring, penetration/legal/accounting reviews, real Android/native-speaker/screen-reader reviews |

## Verification evidence

- 94 tests pass on embedded PostgreSQL, including role/tenant/audience isolation, finance invariants, imports, OTP, student restrictions, gate replay, guardian linking, admissions conversion, report-card snapshots, privacy exports, reconciliation and spending approvals.
- 62 tests pass on standalone PostgreSQL 17.11 with a restricted non-owner runtime role after migrations 0001-0016 (previous baseline; the new parent workflows currently have embedded PostgreSQL evidence).
- ESLint, root/adult/student/native TypeScript checks, both optimized Next builds and Android/iOS Hermes JS exports pass.
- The five baseline Netaji browser checks pass together, covering all nine logins, old-account rejection, the ten-student roster, parent isolation, HOD/Principal/Accounts access, responsive accessibility and local screenshot OCR with two review gates. The previous nine-check browser run belongs to the archived two-school scenario.
- JS exports are not APK/IPA or physical-device tests. Persistent cookie behavior still needs native-device acceptance.
- Dependency scan: zero high/critical and three moderate transitive advisories. No incompatible major overrides were applied silently.
- Docker unavailable locally; containers and hosted CI not executed.

Seeds/tests use fictional data. Live messages, payments, external AI, ads and store submissions have not been exercised. Setup and manual steps: `docs/TESTING.md`.

## Parent portal and responsive design

The parent experience now uses five focused sections, a child switcher, a school-day dashboard, compact cards and mobile bottom navigation. Desktop users can open an interactive mobile preview at 360/390/768 pixels. The staff workspace also has tighter spacing and a clearer school navigation. Native Expo screens are separate and have not received this web redesign.

Working parent workflows include timetable, homework submission/editing and private attachments, published results and report-card PDFs, invoice balances, receipts, certificate requests/PDFs, named message recipients/replies, persisted notice acknowledgements, polls, surveys, consent-controlled private photo albums, calendar, leave, published PTM slot booking/cancellation, pickup requests with photos, gate-pass QR codes, concern/safety conversations, preferences, privacy exports and reviewed privacy decisions. School-side forms support attachments, meeting slots, consent notices, replies and deletion review. Teacher/parent message contexts remain separate for people with both roles.

Private files are encrypted on disk, authorized on every download, reencoded for image safety and bounded by upload/record/school limits. Photo consent withdrawal immediately blocks album access. Production PDF uploads require an HTTPS scanner. Deletion review can retain with a documented date, restrict optional processing or anonymize eligible withdrawn student records; retained financial/academic records, active holds and open allocations block anonymization. Shared identities across schools are preserved.

Only the fixed embedded fictional schools expose the explicit test-payment button. It posts a real local ledger/receipt entry marked fictional; no provider or money movement occurs. Real gateway, SMS and push delivery still require school-owned configuration and integration acceptance.

## Teacher workspace follow-up

A dedicated teacher web experience now replaces the generic Today/record navigation for the teacher role: school branding, named welcome, Your Timeline, My Classes, floating navigation with School Feed, a month calendar with private reminders, attendance roster, exam/mark statistics and draft submission, diary/assignments with manual submission checks and digital answer review, targeted class/family posts, leave balances/requests and account/mobile preview. HOD-assigned syllabus units carry planned and actual completion dates into teacher performance evidence. Reminder scheduling runs in the local API and the production worker; push delivery still requires provider configuration. Native screens retain their existing design.

Teacher verification covers owner-only reminders and once-only delivery, assigned-class access, HOD assignment and dated progress, performance evidence, class/family publication, assignment concurrency, exam statistics and the embedded single-writer guard. TypeScript checks cover API/shared code plus adult, student and native clients. Production builds remain web builds; physical-device/native acceptance remains separate.

## Attendance assistance and realistic demo profiles

Teacher attendance supports local screenshot OCR (self-hosted Tesseract.js/WASM with English/Hindi/Telugu data), on-device-only browser voice recognition and pasted lists. Uncertain, duplicate and conflicting rows require correction; missing students are not inferred. Two separate teacher confirmations precede submission, with source and confirmation metadata in the audit log. No screenshot/audio/transcript is sent to the API or external models. Printed clear registers work best; handwriting/ticks require manual correction. Automated OCR uses the real engine; voice UI uses a recognizer stub and still needs actual browser/microphone/language-pack acceptance. See ATTENDANCE.md.

Demo profiles now use natural synthetic names (Anjali Sharma, Priya Reddy, Aarav Reddy, Ananya Reddy and others). Existing IDs and links remain intact, custom names are preserved, and immutable historical snapshots retain their original issued values.

## Focused Netaji pilot

Startup and db:setup use an independent .data/netaji-campus directory with one school, one class, ten pupils, six staff records and three single-child guardian links. Previous demo data is retained inactive. The seed is atomic, local-only and idempotent, preserving later edits. Existing MFA remains for Principal/Accounts. Finance begins without synthetic charges. Five focused browser tests replace the historical live-demo scenario; the isolated legacy unit/security fixtures remain for regression and tenant isolation.


## Teacher school-day redesign (6 November 2026)

My School Day now has a clickable week strip, lesson cards with attendance and diary actions, a full classroom card with assignment and syllabus shortcuts, family-message and posting actions, private reminders, and published school updates. Desktop uses two columns and mobile stacks the timeline before My Classes. School branding, the named welcome and floating navigation remain. Empty sections use real state rather than fabricated activity. Light and dark layouts were checked at 360, 390, 1024 and 1440 pixels, including automated accessibility checks and screenshots in docs/screenshots.

Attendance now uses mutually exclusive Present/tick and Absent/cross buttons across teacher and operations rosters and assisted drafts. Unsupported recognized statuses require explicit correction. Both confirmation checks remain before saving. Historical database states are retained.

Recoverable read errors are separate from mutation errors and clear after a successful read. Safe GET requests have bounded retries during development API reloads; mutations are never automatically replayed. ESLint, root/web/student/native type checks, 94 service tests and both optimized web builds pass. All seven Netaji browser checks pass across the five-check baseline run and two targeted additions: school-day interactions/themes and recovery from a simulated classroom outage. The recovery check confirms that retrying reloads all ten pupils and removes the read-error banner.


### Multiple teaching classes

My School Day displays every assigned class in a compact two-column selector when a teacher has multiple classes. Each entry shows class/section, scheduled subjects and student count. Selecting an entry reveals its classroom tools and updates the diary/assignment shortcuts. The initial selection follows the first lesson today, falling back to the first assigned class. The timeline still includes every lesson today. The six-class browser fixture verifies all six entries and lessons, mobile/desktop overflow, accessible selection and diary navigation to the selected class. This is a browser-only fixture; the Netaji pilot remains Grade 4 A. Lint, all workspace type checks, the existing three-teacher browser check and the six-class browser check pass.


### Live six-class teaching preview

At the user's request, Anjali now has six actual local assignments: Grade 4 A/B, Grade 5 A/B and Grade 6 A/B. Mathematics lessons are published Monday-Friday at 09:00, 09:50, 10:50, 11:40, 13:00 and 13:50, without teacher overlaps. The HOD can see all six. The original ten pupils and three guardian links remain in Grade 4 A; new classes contain no pupils. The additive local seed is repeatable and preserves existing records. Its isolated database test passes, including duplicate prevention, scope, unchanged pupil/guardian counts and timetable overlap checks.

All eight current Netaji browser checks pass together after assigning the additional classes; ESLint and workspace type checks also pass.


### School update composer layout

Fixed the shared checkbox label direction that stacked checkboxes above their text. The school update composer now uses three compact class columns on desktop, two on mobile, selected tile styling, an indeterminate select-all state and a selected-class count. Its title/close control and Cancel/Publish actions remain visible while only the form body scrolls. The class change still clears any previously selected individual family. Browser checks verify 1115x850, 390x700 and 360x600 viewports, light/dark accessibility, individual targeting reset and the submitted class selection using an intercepted write (no demo post published). The related school-day interaction check, lint and all workspace type checks pass. Screenshots are in docs/screenshots/netaji-post-composer-*.png.


### Minimal mobile post composer (supersedes the form layout above)

Teacher posts now use a full-screen phone composer with the teacher identity, one recipient pill, a message area and a Post action. There is no title field, class checklist or family dropdown in the writing view. The pill opens a separate searchable Classes/Students picker: all teaching classes, one or multiple classes, or one or multiple individual students. Done applies the recipients, while Back discards picker edits and preserves the draft. Posts opened from a class default to that class; posts from School Feed or My School Day default to all assigned classes.

The teacher API accepts title-free messages and multiple student IDs, rechecks every student/class/guardian link, deduplicates recipients and retains tenant/class boundaries. Individual posts go only to selected students' linked families. Empty titles are omitted from teacher/parent feed cards. Existing titled posts and the prior single-student API format continue to work. Browser writes during validation are intercepted, so no test notices were published in the live sample.

Validation: 91 service tests pass, including the new title-free multiple-student isolation test. The mobile composer interaction check covers all/one/multiple classes and individual pupils, draft preservation, 360/390/1115 widths and light/dark accessibility. Screenshots: netaji-minimal-post-*.png and netaji-recipient-*-mobile.png.

Final verification for the minimal composer: all nine Netaji browser checks pass together; lint, workspace type checks and the adult production build passed. Local health returned ok.


### Post images, documents and school-owned storage

The minimal composer now supports Photo, File and Link actions, draft previews/removal, attachment-only posts, client/server photo compression, PDFs, modern Office documents and text/CSV files. Teacher and parent feeds render attachment cards and authenticated downloads; parent downloads can refresh an expired session. Up to five attachments and 6 MiB of uploaded content per post, plus a configurable school storage quota, bound growth. Posts stage privately and publish after upload completion; errors withdraw the draft and remove staged files. Generic publishing rechecks actual attachment counts.

The user chose school-owned Google Drive/OneDrive. Google Drive direct uploads, private reads and deletion are implemented with per-school server-side OAuth configuration and encrypted blobs; no persistent local copy or paid fallback is made in that mode. The Drive account is not connected, so live cloud acceptance is pending school credentials. OneDrive is currently supported through school-owned links, not an automatic upload adapter. Links-only mode rejects binary post uploads; the local demo remains usable on encrypted disk. School account quotas and normal hosting/network costs still apply. Details and primary-source cost research: docs/POST_ATTACHMENTS.md.

Verification: 98 service tests pass, including seven attachment/storage checks. All ten Netaji browser checks pass together; an additional attachment-browser rerun confirms the parent download completes and matches the PDF bytes. Drive interactions are mocked in automated tests; no school account, paid service or external message was used. Lint, root/adult/student/native type checks and both optimized web builds pass. Screenshots are in docs/screenshots/netaji-post-attachments-mobile.png and netaji-parent-post-attachments.png.


### My School Day post card

A profile-style Share an update card now appears above Your Timeline only in My School Day. It shows teacher initials and supported attachment formats and opens the existing minimal composer with recipients, photo/file uploads and links. The previous lower posting shortcut was moved to this card; classroom and School Feed posting actions remain available in their existing contexts. The layout uses the current school colors and supports light/dark themes. The responsive browser check verifies the card is above the timeline at 360, 1024 and 1440 pixels and absent in the classroom view.

Verification for the post-card placement: four relevant browser workflows pass, including mobile attachment/download and recipient selection. Lint and all workspace type checks pass.


### Family messaging disabled

At the user's request, general family messaging is removed from teacher My School Day, School Feed and Account, and from the parent home/actions/navigation. The parent home action now opens School Feed. The old teacher messaging component and parent reply form are removed. Student leave requests remain available through a dedicated Account screen without a messaging inbox. Teacher diary and assignment shortcuts use a compact two-column layout.

Messaging is disabled by default in Operations: catalog/module menus omit it, message read/write/action/export routes are unavailable, and the recipient directory is blocked. API documentation also omits the disabled module. Previously stored records are preserved. An explicit constructor feature option is used only by the retained legacy messaging-isolation tests; the running API does not enable it. Posts, attachments, notifications and structured school requests remain available.

Lint, root/adult/student/native type checks and all 98 service tests pass. Browser checks verify the absence of messaging controls, 404 responses from read/write/recipient routes, and access to the separate student leave screen.

Final checks: both optimized web builds pass. Ten existing browser workflows pass; the new messaging-disable check passes on its targeted rerun after a transient development startup error.


### School Feed is the landing page

Teacher, parent and general staff workspaces now select School Feed after sign-in and session restoration; role switches also reset to Feed. A shared web feed presents published posts, private attachment downloads, school links, acknowledgements and parent post details/polls. Staff feeds load more posts through pagination. Existing audience/class/tenant access remains on the server; an account with no permitted updates sees an empty feed.

The feed preview is removed from teacher My School Day, parent Home and staff Today. Teacher timelines, class tools, reminders and the post-entry card remain under My School Day. Parent navigation names its updates section School Feed. Native Expo login/restore/role-switch and the separate student portal also select Feed first; this does not enable any disabled Netaji student login or complete native attachment/device acceptance.

The new browser scenario checks all nine accounts on sign-in and reload, confirms feed previews are absent from day/home pages and audits teacher/parent/principal mobile layouts. Lint, workspace type checks and both optimized web builds are part of the validation for this change.

Validation result: all nine accounts pass the dedicated login/reload/feed-readiness check, including mobile accessibility for teacher, parent and principal. Eleven existing browser workflows also pass. Lint, root/adult/student/native type checks and both optimized web builds pass. Native physical-device acceptance remains pending.


Teacher LMS research and proposed delivery scope are recorded in [TEACHING_STUDIO_PROPOSAL.md](TEACHING_STUDIO_PROPOSAL.md). This is a proposal; source-backed lesson-pack generation and the full LMS are not implemented or enabled by the current UI changes.
