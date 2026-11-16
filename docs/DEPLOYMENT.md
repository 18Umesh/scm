# Deployment and operation notes

The default local start is `pnpm dev`. PostgreSQL production mode is a separate path; it must never fall back to embedded storage or demo provisioning.

## PostgreSQL roles

- Migration owner: owns the schema and installs reviewed migrations; never serves HTTP requests.
- `campus_app`: NOLOGIN privilege group, no superuser/bypass, limited table privileges.
- `campus_runtime`: login role inheriting `campus_app`; no schema ownership, superuser, bypass, role creation or database creation.

`infra/postgres-init.sh` provisions those roles in a fresh Compose database. Then the one-shot `migrate` service runs `db:setup`. The API receives only `DATABASE_URL`, not the admin URL. The migration job requires both URLs, and production must not provision demo data.

Supply `POSTGRES_PASSWORD` and `CAMPUS_DATABASE_PASSWORD` using a secrets manager or an ignored local `.env`. For the sample Compose URL interpolation, use URL-safe generated passwords; percent-encode other password characters in connection strings. `docker compose up --build` is a local topology check, not a deployment to an Indian cloud region.

The production database starts empty: no hosts/users/schools are approved automatically. A reviewed provisioning tool or the future signup/verification workflow must create them. Public onboarding is Phase 1.

## Ingress and hosts

Only the web port is published, on loopback. A deployment needs an HTTPS ingress, approved school-domain records and correct Host forwarding. Never accept arbitrary `X-Forwarded-Host`, arbitrary Origins, wildcard cookies or tenant IDs supplied by request bodies. Keep API, Redis and PostgreSQL on a private network. School domains and school verification must both be approved before resolution succeeds.

The student process is independently built and rewritten under `/student`. If its internal URL differs, set `STUDENT_URL` **when building** Next.js; rewrites are build-time configuration. `API_URL` is read by the server-side API proxy at runtime. API Host forwarding uses an explicit allowlist of request headers and never forwards arbitrary client proxy headers.

## Verification before real data

Run CI against PostgreSQL 17 with restricted credentials, test Compose startup and empty-host failure, inspect runtime role privileges, confirm HTTP security headers under the actual ingress and verify that admin credentials are absent from app containers. Run backups/restores, independent penetration testing and the data-protection/accounting reviews in the specification. This environment has no Docker binary, so no container execution is claimed.

The in-process rate limiter must move to Redis before horizontal scale. TOTP enrolment/recovery and field encryption, parent/new-device OTP delivery, production sessions on mobile, secret scanning and stronger nonce-based production CSP need follow-up before launch. Inline scripts remain allowed for the Next.js bootstrap; all external script hosts are blocked, particularly on the student app.

## AI

Leave `AI_ENABLED=false`. A reviewed contract and data policy, monthly registry freshness, zero-cost accounting verification and multilingual quality suite are prerequisites to enabling an OpenRouter model. No model is currently registered. Do not use personal school content with free endpoints. The gateway does not execute write actions and exposes no raw SQL or autonomous tools.

## Restore and incidents

No managed backup or incident integration is yet deployed. Phase 5 must supply encrypted backups, tested recovery objectives and the reviewed breach runbook. Do not treat this local demo as an operational school system.

## Operational integrations added

The current public signup endpoint creates an unverified school. The reviewed verification CLI is `scripts/verify-school.ts`; no signup is automatically trusted. Domain requests require actual TXT/CNAME ownership checks. `infra/Caddyfile` is supplied for TLS authorization but has not been exercised in a deployed ingress.

Production must supply AUTH_ENCRYPTION_KEY, AUTH_OTP_SECRET and FIELD_ENCRYPTION_KEY through a secrets manager. Never use demo secrets. SCHOOL_GATEWAYS is a school-id-keyed JSON object containing Razorpay keyId, keySecret and webhookSecret. The callback URL is `/api/payments/webhook` on the school's approved host; forward the exact raw body and Razorpay signature/event-id headers.

SCHOOL_MESSAGING maps school IDs to sms/email adapters with HTTPS url and apiKey. SCHOOL_PUSH maps school IDs to HTTPS deliveryUrl and apiKey. The worker sends OTP destination/template/code/expiry to messaging adapters and recipient/title/body/audience to push adapters. Production adapters must authenticate requests, enforce provider idempotency and meet the school's data-processing requirements. Native token enrollment/direct FCM/APNs integrations are unfinished.

Run `node dist/apps/worker/main.js` against PostgreSQL to process outbox delivery. RUN_WORKER=true enables local API processing with embedded storage. Do not launch a standalone worker against the same PGlite directory as the API. Current delivery retries are bounded with backoff; final failures need operator review. Quiet hours use the school's current India timezone.

The separate ads service requires its own ADS_DATABASE_URL in production and an ADS_ADMIN_TOKEN. School API forwarding requires ADS_ENABLED=true and ADS_SERVICE_URL; defaults keep it off. No Google ad SDK is installed. App Factory build automation and platform SSO/passkeys are not implemented. Existing statements above listing OTP, encryption or school signup as wholly absent describe the earlier foundation snapshot and are superseded here.

## Private attachments

Persist FILE_DIRECTORY on a private volume shared by API and outbox worker, and back it up consistently with PostgreSQL. Files use school-scoped AES-256-GCM with FIELD_ENCRYPTION_KEY; retain the key in the secret manager for restore. Never expose this directory through the web server. Default per-school quota is 1 GiB (FILE_SCHOOL_QUOTA_BYTES); individual uploads are limited to 6 MiB. Production PDF uploads require FILE_SCAN_URL (HTTPS) and FILE_SCAN_TOKEN; scanner must return HTTP success and JSON {"clean":true}. Images are decoded, stripped and reencoded. Monitor volume capacity and fileErase outbox failures. Object storage and distributed file-volume rollout remain deployment work.
