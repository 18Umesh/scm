# Continue the School Management System in Codex Cloud

This is a handoff of the current local project, not an export of the original chat. Read this document before continuing. Later user requirements take precedence over the original BUILD_SPEC and older, sometimes stale, documentation.

## Project and start

Campus is a TypeScript/pnpm monorepo with Next.js web and student portals, a Nest/Express API, shared packages, PostgreSQL/PGlite, and an Expo native client. Use Node.js 24 and pnpm 10.32.1.

```sh
npx --yes pnpm@10.32.1 install --frozen-lockfile
cp .env.example .env
npx --yes pnpm@10.32.1 dev
```

Development web runs on port 3000, student portal on 3001 and API on 4000. Health check: `http://localhost:3000/api/health`. `localhost:3000` resolves to the Netaji demo. In a hosted preview, check the configured tenant hostname and proxy behaviour before changing tenancy rules. Keep NODE_ENV=development and DATABASE_MODE=embedded for this synthetic demo. The API migrates and seeds `.data/netaji-campus` on first startup. Never run two API writers on that data directory. Production requires real PostgreSQL and configured providers.

## Sample users

Shared fictional password: `NetajiDemo!2026`. Account definitions live in `packages/demo/netaji.ts`. There are ten students and eleven staff/parent/driver accounts. Anjali (Mathematics), Ravi (English), Farah (EVS), HOD Meera, Principal Kavitha, Accounts Neha, Incharge Sanjay, driver Ramesh and three parents. Priya has two linked children: Aarav and Diya. Seeded additional classes allow teachers to preview multiple class cards.

The seeded Netaji Principal and Accounts users sign in with password alone in non-production embedded mode. Other privileged users/schools and production keep second-factor requirements. The server advertises password-only demo emails in bootstrap. The newest browser tests cover these logins, reload and access to App Design.

## Current implemented scope

- School Feed is the default landing page for active roles. Posts support scoped classes/students and downloadable files/photos. No family messaging feature is offered. Mock ads blend into feed cards.
- Teacher: timeline, assigned classes, present/absent roster, voice/OCR attendance drafts with review, subject-scoped exams/marks/history, class-teacher broader reporting access, title-free Diary, assignments/submission tracking, leave, syllabus and AI Teaching Studio with editable materials and exam question papers.
- Accounts: invoices, collections, receipts, reconciliation, reports and an immutable balanced ledger with seeded fictional examples.
- Incharge: assigned-class academic oversight and concerns handling.
- Parent: child switching, Global/My Feed scopes, attendance/school-calendar toggle and coming-up events, dated homework/timetable, redesigned Report Card/Exam Timetable, online-fee checkout integration and local demo payments, top-bar notifications/profile, settings and live bus tracking. Removed parent settings include pickup, gate passes, consents, privacy requests, leave and family contacts. Concerns & Safety are combined and reach the class teacher/incharge.
- Driver: assigned buses, explicit start/location sharing/end trip, authenticated GPS updates and a clearly labelled local simulated trip. Foreground GPS is subject to browser/device limits. Parent tracking is guardian/student/vehicle scoped and hides stale locations.
- School Design Studio: Principal → Brand studio → App Design. Four A–D presets (expressive, lavender, blue, minimal), colours, type, text size, radius, density, floating/fixed navigation, feed density, sample mobile/desktop/role previews, private drafts, reviewed publish, version conflict checks and rollback. Current demo retains its existing appearance until someone publishes a design. Published settings style role web apps; native configuration consumes the same schema/tokens and an immutable design snapshot.

## Important limits

App Factory records requests, validates configuration and exports public build manifests. It does not generate signed APK/IPA files or submit to stores. Native JS bundle export has passed, but native device acceptance and full web/native feature parity are unfinished. School-owned Google Drive/OneDrive storage was chosen; local encrypted attachments and Drive/link integration exist, but live school provider setup still requires credentials. OpenRouter AI needs a key supplied separately through environment secrets. Live payments, store submissions and other external providers need their own configuration. Do not describe the entire original BUILD_SPEC as production-complete.

## Recent validation on Windows

- 53 service tests across design, operations, Netaji, parent and transport suites passed.
- 23 foundation/auth/security tests passed after the demo Principal login fix.
- Design Studio, four mobile design presets/accessibility/overflow and Principal/Accounts login browser checks passed.
- Root/web/mobile TypeScript and changed-source ESLint passed.
- Web production build and Expo Android/iOS JavaScript bundle exports passed.

Run checks relevant to changes; do not assume previous Windows validation substitutes for testing the new cloud environment. Browser tooling may require `pnpm exec playwright install --with-deps chromium`.

## Useful references

Read `docs/SCHOOL_DESIGN_STUDIO.md`, `docs/PARENT_WORKSPACE.md`, `docs/BUS_TRACKING.md`, `docs/TEACHING_STUDIO.md` if present, `docs/NETAJI_SETUP.md` and current source/tests. Follow applicable AGENTS.md files. Older README/status/account-count descriptions may be stale. Original BUILD_SPEC is a reference; later changes in this handoff and subsequent user prompts override it.

## Transfer boundaries

The source bundle deliberately excludes `.env`, credentials, local databases and uploads, dependencies, compiled output, test artifacts and editor/session state. A fresh cloud demo regenerates the synthetic data; it will not contain local testing edits or uploaded attachments. Reconfigure required secrets in the cloud environment without pasting keys into prompts. No live credentials or raw chat history should be committed.

Suggested first cloud prompt: "Read docs/CODEX_CLOUD_HANDOFF.md, install dependencies, start the Netaji demo, verify health and Principal login, then tell me what preview URL I can test. Preserve existing features and wait for my next product requirement after verification."
