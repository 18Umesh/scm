# Student workspace

Open **http://localhost:3000/student** (or `/student` on the configured school domain). The main sign-in page also links to Student sign in. The public web server proxies the student frontend, so use port 3000 for the complete app, rather than the internal student frontend port 3001.

For the Netaji local demo, choose any of the ten students in the sample selector. Example: username **aarav.reddy**, PIN **240426**. All sample student usernames are in `packages/demo/students.ts`. These are synthetic development credentials, not production provisioning defaults.

## Available features

- School Feed opens first. Global Feed contains school-wide updates; My Feed contains authorised class/individual updates. Parent-only posts are excluded. Photos, school file links and attachments can be viewed/downloaded where access is granted.
- My Day shows the student's teacher, attendance percentage, subjects, timetable by weekday, daily attendance calendar, school events and Coming up. Attendance initially opens the latest recorded month; blank dates mean no record, not absence. It is a read-only student view.
- Homework has date/subject filters, class diary and assignment details in a modal, and downloadable practice sheets. Work is completed in notebooks at school; there is no homework submission flow.
- Results has subject marks, published-result totals, examination progress, school-issued report-card PDFs and a separate exam timetable with revision topics. Partial totals explicitly say how many subject results are published. Future question papers and unpublished marks remain hidden.
- Library shows resources attached to authorised, published diary/assignment entries, with subject filters and published online-class links. Private teacher AI materials are not automatically exposed to students.
- Top-bar profile and notifications show the student's own information and inbox. Sessions survive page refresh, refresh expired access tokens and can be signed out. Invalid/revoked sessions return to sign-in.
- Published school design settings apply to the student interface, including preset colours, shape, typography, density, navigation and feed media height. The UI supports mobile and desktop, native modal focus management, keyboard scrolling of result history and reduced motion.

## Administration and access

Student login must be enabled on a class before the Principal or school administrator can provision an account in School Studio → Student accounts. Submitting credentials for an existing student updates the username/PIN and revokes existing sessions. It does not create a second account. Keep PINs out of logs and chat messages. For production, distribute a unique PIN per student through the school's chosen process.

Disabling class login, archiving the student/class, or deactivating membership prevents access on subsequent requests. Student endpoints cannot access office configuration, finance or staff workspaces. Queries remain school-scoped, and the student account only sees its own attendance, marks and reports. Released exam papers are only visible after the exam ends.

The local seed enables Grade 4 A once, provisions ten students without replacing existing logins, and adds a class notice and downloadable fractions practice PDF. Subsequent starts preserve office changes, including disabled class login and reset PINs. Existing synthetic marks/attendance/calendar fixtures are reused; local database edits and uploads are not automatically part of a source-code transfer.

## Validation

`tests/student.test.ts` covers provisioning, own-record scope, class and notification isolation, private/future academic content, file access, login, CSRF, session rotation/revocation and office PIN reset. The student test in `tests/browser/netaji.spec.ts` exercises mobile navigation, restoration, diary modal, resource download, results, calendars, profile, notifications, sign-out, desktop layout and accessibility.
