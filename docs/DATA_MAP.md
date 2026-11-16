# Foundation data inventory and retention plan

Only fictional demo data is currently provisioned. Production retention must be agreed with schools and legal counsel before launch. The table below is a proposed policy, not a claim that automatic deletion jobs are already deployed.

| Table | Ownership / access | Contents | Proposed retention |
|---|---|---|---|
| `users` | Platform identity; internal auth service only | Account email, display name, salted password hash, optional TOTP secret | Account lifetime, deletion workflow pending |
| `schema_migrations` | Platform schema control; migration owner only | Applied migration filename and timestamp | Database lifetime |
| `school_domains` | Platform routing; approved host lookup only | Host, school UUID, verification/activation flags | Active agreement; revoke immediately on exit, then delete after 30 days |
| `schools` | Tenant, forced RLS | Fictional school name, locality, verification flag | Agreement lifetime + 90-day export window |
| `memberships` | Tenant, forced RLS | Account-role-scope association | Agreement lifetime + 90 days |
| `school_settings` | Tenant, forced RLS | AI switches, integer paise budget, student switch | Agreement lifetime + 90 days |
| `school_branding` | Tenant, forced RLS | Versioned accent colour | Agreement lifetime + 90 days |
| `sessions` | Tenant, forced RLS; opaque token hashes | Account, membership, approved host, CSRF hash, expiry, revocation | 8-hour validity; delete expired records after 30 days using a future privileged retention job |
| `audit_logs` | Tenant, forced RLS; append-only | Actor UUID, action, resource, resource UUID, timestamp, version metadata | Proposed 7 years, subject to school/legal agreement; privileged archival process required |
| `ai_requests` | Tenant, forced RLS | Task, status, tier, model, integer paise cost; no prompts/responses | 90 days; retain only agreed aggregate cost data beyond that |

Every application mutation to a tenant table is audited through a database trigger. Sensitive membership, audit and AI-usage list reads are explicitly logged. Credentials, prompts, request bodies, student data and model responses are excluded from audit/error logs. Demo TOTP is intentionally public and is not a production secret.

Field encryption, secret-manager-backed TOTP enrolment, consent ledger, school export/deletion requests, signed document URLs, retention jobs and backup encryption are required in later security work. Until those controls and the relevant operational modules exist, do not enter actual school personal data.

## Current operational data additions

Tenant tables now include academic/student/staff/guardian records, attendance/leave/cover, communication audiences, exams/marks, operational registers, configuration versions, OTP/device records and finance data. See migrations 0002-0012 for the physical table inventory. All use school_id and forced RLS. Row reads also apply active role/ownership/class/guardian scope in the service before pagination; restricted nurse/counsellor records are isolated by record type.

Leave reasons, health/counselling notes, TOTP secrets, queued OTP delivery and school app credentials are AES-GCM encrypted at rest in their respective paths. Session tokens, trusted-device tokens, OTP codes and one-use pickup authorization are stored as hashes/HMACs. Delivered/expired OTP payloads are cleared. Production requires configured encryption/signing keys; rotation and managed-secret integration are outstanding.

Finance stores integer paise in BIGINT, immutable captured payments/receipts and posted ledger entries. Parent finance access is checked against current guardian links. Raw callback bodies are used only for signature verification; credentials and OTP content are not printed to logs.

The separate ads database stores campaigns/reviews and aggregate contextual metrics. It has no school-database connection. AI metadata excludes prompts/responses, and the personal-data route remains blocked.

School-wide scheduled retention/deletion, encrypted backup restoration, object-storage deployment and complete policy-based minimization remain unfinished. Existing operational registers are not a substitute for those controls.

Report-card snapshots and encrypted privacy-export artifacts were added in migrations 0014-0015; bank reconciliation constraints are in 0016. Privacy exports are scoped to the requester's subject records, exclude health/counselling and question papers, expire in seven days and have authenticated download/read audits. Automated school-wide retention and deletion remain outstanding.

Parent workflow tables (0017-0022) include survey responses, acknowledgements, file metadata, meeting slots, case updates and privacy holds, all tenant-scoped with forced RLS and audit. File bytes live in private encrypted FILE_DIRECTORY, with metadata, record ownership and current guardian access checked on retrieval. Album access also rechecks depicted students and photo consent. Images are reencoded; PDFs require a configured scanner in production. Privacy decisions retain a reviewed reason; eligible anonymization queues file removal and disables only the student membership for that school. Shared global identities and required financial/academic records are preserved. Message payloads include sender/recipient role context to avoid staff-parent inbox mixing.

Migration 0023 adds forced-RLS/audited teacher_reminders, syllabus_units and assignment_checks tables. Teacher reminders are owner-only at the API, processed once under row locks and routed to the matching staff context. Syllabus assignment is restricted to HOD/Principal/Admin with teacher/class validation; only the assigned teacher updates completion through a versioned endpoint. Manual submission checks have one row per work/student, require assigned-class scope and use optimistic concurrency. Per-learner feed publication resolves current linked guardian accounts on the server. Syllabus metrics are evidence, not automated rankings.

Attendance assistance keeps screenshots, OCR text and voice transcripts in transient browser state. Only attendance entries and source/confirmation flags reach the API. The existing immutable audit log records attendance.reviewConfirmed. Self-hosted OCR language files contain only public model data, with pinned revision/checksums. Profile renaming is restricted to known placeholders in the fixed embedded demo schools and preserves custom edits and immutable snapshots.
