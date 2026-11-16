# Campus development rules

Source: [docs/BUILD_SPEC.md](docs/BUILD_SPEC.md). Build sequentially; document phase gates in docs/STATUS.md.

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

