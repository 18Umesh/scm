# Netaji Public School pilot

Campus is currently configured locally for **Netaji Public School, Grade 4 A**: ten students, three teachers, one HOD, one Principal, one Accounts user and three parent logins.

## Start

Requires Node.js 24:

```powershell
npx --yes pnpm@10.32.1 install --frozen-lockfile
npx --yes pnpm@10.32.1 dev
```

Open **http://netaji.localhost:3000** or **http://localhost:3000**. Choose a Sample account on the sign-in screen. All sample account passwords are `NetajiDemo!2026`.

[Account list, students, parent links and reporting structure](docs/NETAJI_SETUP.md)

The seeded Netaji Principal and Accounts sample accounts use email and password alone in the non-production embedded demo. Production and other schools retain second-factor requirements.

The active database is `.data/netaji-campus`. The previous two-school database is retained inactive at `.data/campus`; its accounts and hosts are not loaded. Reopening the app preserves changes. No student logins or additional parent accounts are created.

Teachers report to HOD, HOD reports to Principal, and Accounts reports separately to Principal. Each parent can see only their own linked child. Finance has its chart of accounts and Tuition fee head ready, with no invented charges or payments. Detailed role access can be refined one role at a time.

## Checks and scope

[Testing guide](docs/TESTING.md) - [Voice/screenshot attendance](docs/ATTENDANCE.md) - [Current implementation status](docs/STATUS.md)

```powershell
npx --yes pnpm@10.32.1 lint
npx --yes pnpm@10.32.1 typecheck
npx --yes pnpm@10.32.1 test
npx --yes pnpm@10.32.1 test:browser
npx --yes pnpm@10.32.1 build
```

This is a responsive local pilot with synthetic identities and a sample school crest. The entire BUILD_SPEC is not production-complete. Native device acceptance and live provider/store integrations remain separate work.


Teacher posts now support photos, downloadable documents and school-owned file links. The local demo uses encrypted files on disk. Production can upload encrypted attachments into a school's own Google Drive or run in links-only mode, without a platform-owned file bucket. Live Drive credentials are not configured. See [post attachments and storage setup](docs/POST_ATTACHMENTS.md).


All active accounts now open School Feed after sign-in or restoring a session. Teachers can select My School Day for timelines, classes and reminders; the feed preview has been removed from that page. Parent and staff views use the same post-card presentation. The native app and student portal also select Feed first, without enabling any disabled student logins.

## Continue in Codex Cloud

Read [the current project handoff](docs/CODEX_CLOUD_HANDOFF.md) for the latest implemented features, limitations and verification. Create a Codex Cloud environment from this repository using Node.js 24 and pnpm 10.32.1. Install with `pnpm install --frozen-lockfile`, copy `.env.example` to `.env` for the synthetic demo, then run `pnpm dev`. Configure real provider keys separately in cloud environment secrets.
