# Incharge workspace

Sanjay Rao (`incharge@netaji.school`) is the local Incharge example, assigned to Grade 4 A and B. Password: `NetajiDemo!2026`. No authenticator code is required. Existing HOD, teacher and school-head accounts and reporting lines remain in place. The sample selector now contains ten accounts.

The Incharge role is a separate membership role. Principal/Admin provisioning supports it with an assigned class scope. It has no finance, payroll, health, counselling, school-settings-edit or mark-entry access.

## Screens

- School Feed is the default on login/reload. An Incharge can publish text updates to one or more assigned classes; school-wide publishing is blocked. School Feed visibility continues to follow class and recipient permissions. No messaging service is introduced.
- My Classes lists only assigned sections. Class pages show a read-only attendance register for a selected date, published all-subject exam results, mark-entry completeness, syllabus progress and published Diary/Assignments. Missing attendance is labelled Not recorded. Class pass rate uses complete published results and requires passing every subject; incomplete students are excluded from its percentage.
- My Teachers shows teachers with published timetable assignments in the coordinated classes, their scoped weekly periods and syllabus evidence. Figures describe recorded work, not automatic rankings.
- Assign syllabus selects an assigned class, a teacher teaching that class, and that teacher's published subject. It saves a planned start, deadline and learning expectations. The assigned teacher updates actual progress and completion using the existing teacher workflow.
- Class teacher appointments are restricted to assigned sections and eligible teachers. Appointment grants the existing all-subject class overview; it never grants entry of another teacher's subject marks.
- Review Desk shows overdue units, cover arrangements and leave requests explicitly routed to the Incharge. Existing teacher-to-HOD routing is not silently changed. Leave approval requires the configured approver, prevents self-approval and preserves escalation rules. Incharge's own requests route to the configured manager.
- Account provides profile, display preferences, own leave requests, role switching if applicable and sign-out. Calendar/timetable/cover tools and own notifications are accessible from the workspace.

## Local examples and checks

The additional account and three syllabus examples are additive and seeded once: a completed Mathematics unit, an English unit in progress and an overdue Environmental Studies unit. Existing students, finance records, teacher class assignments and parent links are preserved.

Service tests cover out-of-scope reads, denied finance/marks access, syllabus class/subject checks, class-teacher appointments, class-only feed publishing and explicit leave routing. Browser checks cover mobile/desktop navigation, ten-pupil roster, subject-aware syllabus form, three-teacher workload, accessibility, appointments, feed landing/reload and the finance-access denial.
