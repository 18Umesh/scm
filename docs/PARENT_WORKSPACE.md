# Parent app

The app opens on School Feed. A floating bar on desktop and mobile provides Home, School Day, Results, Fees and School Feed. The school crest and name appear in the header. The top-right profile opens Settings and sign-out.

## Screens

- School Feed has Global Feed for school-wide posts and My Feed for the selected child's class or individual updates. Sorting and pagination run after server audience checks. New individual teacher posts include child recipient IDs to distinguish siblings. Legacy posts retain guardian/class audiences.
- School Day contains Attendance, Timetable and Homework. Homework is browsed by due date, with date shortcuts, Diary text and attachments. Completed work is handed in at school; parents have no submission controls.
- Results contains Report Card and Exam Timetable. The report matrix shows subject marks across published exams and labels pending results. Official reports open with PDF downloads. Timetables group subject papers under exam name/date.
- Settings contains Child profile, Parent-teacher meetings, Certificates, Bus Tracking, Concerns & Safety and App preferences. School Calendar is accessible in School Day > Attendance. Notifications open from the header bell beside the profile. Surveys and albums are absent from parent navigation. Direct messaging stays disabled.
- Fees lists linked-child balances, online payment when configured, local test payments and downloadable receipts.

## Payments

Configure server-only SCHOOL_GATEWAYS, keyed by school UUID, with the school's Razorpay keyId, keySecret and webhookSecret. Enable provider capture and configure the existing signed payment webhook for the school domain. Never expose secrets to browser settings.

Standard Checkout opens over the app. Orders use the outstanding balance after payments, approved concessions and refunds. Success is verified against the saved order, guardian access, HMAC and provider-fetched payment amount, currency and captured status. Authorized payments remain pending. Callback and webhook share idempotency to prevent duplicate receipts. Provider failures never imply success.

Without gateway credentials the app explains that online payments are unavailable. Local Netaji demo users can review and confirm a clearly labelled fictional payment; this creates a local demo receipt without charging money. Live payments have not been exercised in this workspace.

## Testing locally

Open http://localhost:3000. Select a parent Sample account, using NetajiDemo!2026. Three parents are linked to separate children. Examples include a school-wide post, class posts, five classwork entries, grouped examinations, attendance and published report cards. Additive seeds preserve existing teacher and finance records.

Validation covers parent, operations and Netaji service tests, mobile navigation, PDF downloads, child isolation, test-payment review, accessibility, TypeScript, ESLint and production web compilation. Automated checks use fictional provider responses and never move real money.

## Report card design

The Results report opens with an examination selector and latest complete published result, an overall score ring, publication count and change in percentage points. Subject cards show marks, normalized percentages, pass thresholds and prior-exam changes. The interactive history uses complete exams only; unpublished results remain pending. Compare all examinations expands the subject matrix. Official report cards open in a redesigned preview with school remarks and the existing PDF download. Layout is checked at 360, 390, 768 and 1440 pixels, including accessibility and pending-result behavior.

## Combined attendance and school calendar

School Day > Attendance now includes an Attendance / School Calendar toggle. Each view remembers its browsed month. Attendance shows only recorded daily registers, with present, absent and percentage totals. School mode shows published holidays, class/school events and grouped subject exam dates, with selectable day details. Coming up remains visible in either mode and is scoped to the selected child. Calendar and holiday records are loaded across all pages. School Calendar is no longer listed in Settings.

## Header notifications

The bell beside the profile opens the parent notification inbox on desktop and mobile. It loads all pages of notifications for the current parent account, across linked children, with an unread indicator, refresh, timestamps and mark-as-read actions. Notifications no longer appear in Settings; app notification preferences remain there. Server recipient and role checks still apply.

## Simplified Settings and parent reports

Settings now contains Child profile, Parent-teacher meetings, Certificates, Bus Tracking, Concerns & Safety and App preferences. Leave requests, family contacts, consent choices, privacy requests and gate passes are removed from parent navigation; historical records are preserved. The Home leave shortcut now opens Concerns & Safety.

Concerns & Safety combines existing school concerns and safety reports, with a report-type choice in one form and one history. Creating a child-linked parent report notifies the appointed class teacher and all active incharges assigned to that class. Parent follow-ups notify both; staff replies and resolutions notify the parent. Class teachers and scoped incharges can review, reply and resolve through their Notifications > Open parent concerns & safety. Incharge also has a Review desk entry; teacher has an Account entry. Unrelated teachers and incharges outside the class cannot access these reports. This is report tracking, not general direct messaging.

## Bus tracking and children

Bus Tracking replaces Pickup Authorisations in Settings and is also available on Home and directly from the profile menu. Priya has two linked demo children (Aarav Reddy and Diya Menon), with both switches visible together. All student-specific views follow the selected child. See BUS_TRACKING.md for the driver login, GPS permissions, live/demo modes and setup APIs.
