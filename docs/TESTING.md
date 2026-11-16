# Local testing

The active pilot is **Netaji Public School, Grade 4 A**, with ten students and nine accounts. See [all logins, students and reporting lines](NETAJI_SETUP.md).

## Start

Requires Node 24. From `D:\SchoolManagementSystem`:

```powershell
npx --yes pnpm@10.32.1 install --frozen-lockfile
npx --yes pnpm@10.32.1 dev
```

Open http://netaji.localhost:3000. Choose a Sample account in the sign-in form, or enter an email from the setup guide and password `NetajiDemo!2026`. Principal and Accounts use the demo password only on this local Netaji server.

## Pilot checks

1. Sign in as each teacher. My Classes must show Grade 4 A with exactly ten students. The timetable shows their assigned subject.
2. Open the attendance roster. Voice, screenshot and pasted-list input prepare drafts; two explicit checks precede submission. The detailed guide is [ATTENDANCE.md](ATTENDANCE.md).
3. Sign in as each of the three parents. Each must see one linked child and no other student's record.
4. Sign in as HOD and inspect staff/student records and Syllabus. Three teachers report to the HOD; the HOD reports to Principal.
5. Sign in as Principal, then Accounts, using the shared demo password. Finance starts with a chart of accounts and zero charges/collections. Configure real testing fee amounts explicitly later.
6. Check a phone viewport, or use Teacher Account > Mobile preview.
7. Try the old `teacher@demo.campus.test` credentials: sign-in must fail. The old school hosts are no longer active.

## Automated checks

```powershell
npx --yes pnpm@10.32.1 lint
npx --yes pnpm@10.32.1 typecheck
npx --yes pnpm@10.32.1 test
npx --yes pnpm@10.32.1 test:browser
npx --yes pnpm@10.32.1 build
```

Unit/security tests use isolated fictional databases, including the legacy two-school fixture for tenant isolation. Browser tests now target the focused Netaji pilot; they do not populate fake attendance, payments or extra pupils. The historical browser files are retained for reference but are not the active scenario.

Active data persists in `.data/netaji-campus`; the previous `.data/campus` is an inactive backup. Never start a second API against the same embedded directory. Source reloads close the database before reopening it.

Native Expo exports and integrations keep their existing implementation limits: this pilot is verified in the responsive web app, not on physical phones or signed APK/IPA builds. Live gateway, SMS and push adapters need school-owned configuration; none are exercised by the setup. See [STATUS.md](STATUS.md) for platform gaps and [LEGACY_TESTING.md](LEGACY_TESTING.md) for prior workflow context.


### Teacher school-day review

Open http://netaji.localhost:3000 and sign in as anjali@netaji.school / NetajiDemo!2026. School Feed opens first; choose My School Day, check Your Timeline, click any weekday to open School Calendar, and use the classroom shortcuts. Add reminder and the Share an update card open their working dialogs. Student leave requests are under Account; direct family messaging is disabled. Attendance uses tick/cross buttons with two review steps. Account > Mobile preview opens the existing phone preview; Account also switches light/dark theme. The additional automated browser checks cover shortcuts, 360/1024/1440 widths, dark-theme accessibility and recovery after a simulated classroom service outage. No sample attendance is submitted by these checks.


### Mobile teacher posts

Open Post an update on My School Day, or Post update in School Feed. Type the message directly; no title is required. Tap the recipient pill below the teacher name. Classes lets you choose all, one or several assigned classes; Students lets you search by name, class or admission number and select individual students. Tap Done to apply, or Back to retain the previous audience. Tap Post to publish. Individual students need linked guardian accounts to receive the update. The seeded first three Grade 4 A pupils have linked parents.


### Post attachment acceptance

Sign in as anjali@netaji.school, open Post update and use Photo/File/Link. Try a photo and PDF, remove an attachment, choose Grade 4 A or Aarav Reddy, and post with or without a caption. Sign in as priya@netaji.school to view/download the Aarav post; another linked family must not see an individually targeted post. Files currently use the local encrypted demo directory. For school-owned Google Drive and links-only production modes, follow [POST_ATTACHMENTS.md](POST_ATTACHMENTS.md); no live school OAuth connection is configured in this workspace. Automated browser attachment fixtures are intercepted to avoid adding test posts to the local demo.


### Default School Feed

Sign in with any of the nine Netaji accounts: School Feed should open first. Refresh the browser or switch role and confirm the feed is still the landing page. The teacher's My School Day page must show the post-entry card, timeline, classes and reminders without a feed preview. Parent Home and staff Today also omit their old feed previews. Parent School Feed supports child selection, post details/polls/acknowledgements and attachment downloads. The Expo app's login, session restoration and role switch now select Feed; its device behavior still needs physical-device acceptance. The student portal also opens Feed if a student login is enabled; Netaji student logins remain disabled.


Exam workflow: `npx --yes pnpm@10.32.1 exec tsx --test tests/exams.test.ts` checks schedule/date locks on generic and class APIs, class scope, zero vs missing marks, atomic rollback, stale versions, duplicate prevention, approval privacy and repeatable demo initialization. `npx --yes pnpm@10.32.1 test:browser --grep "scheduled exams"` exercises the responsive exam sheet, draft/submit review UI, class metrics, student subject filtering and accessible graphs. Browser mark mutations are intercepted; service tests perform actual isolated database writes. See NETAJI_SETUP.md for manual local test steps and demo dates. Physical phone/native parity is not claimed by these web viewport checks.


Diary and mock ads: `npx --yes pnpm@10.32.1 test:browser --grep "diary has no title|mock ad containers|six assigned classrooms"` checks all three teacher subjects, title-free Diary publishing, retained Assignment fields, removal of the standalone shortcuts, desktop/mobile ad sizing and local offer/report/hide interactions. Diary/ad mutations in the browser fixture are previews; isolated service tests verify actual Diary persistence and linked-parent visibility. Mock-ad API tests verify no external requests and that previews are unavailable in production/PostgreSQL and for blocked roles/routes.
