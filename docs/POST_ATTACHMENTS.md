# Teacher post attachments and school-owned storage

In My School Day or School Feed, open Post update. Photo, File and Link controls are below the message. A post can contain attachments without a caption. The recipient picker still supports all teaching classes, selected classes or individual students. Selected students' linked parents receive individual posts.

Up to five attachments are supported per post. Uploaded files together may be up to 6 MiB after photo preparation. Photos are resized to 1600 pixels and converted to WebP; server processing strips metadata and validates images again. Supported direct document formats are PDF, DOCX, XLSX, PPTX, UTF-8 TXT and CSV. Videos, executables, macro documents and general archives are excluded. Larger files can be shared using school-owned file links.

Parents see image previews and downloadable document cards on the home noticeboard and in the post detail. Downloads recheck the current school, post audience and parent/student relationships. Expired sessions can refresh before downloading. Files are not exposed in a public static directory. The post becomes visible only after its attachments are uploaded; failed posts are withdrawn and their staged files are removed.

## Storage choices

| Mode | File contents | Cost boundary |
|---|---|---|
| `local` | AES-GCM encrypted files in `FILE_DIRECTORY` | Demo computer or school-provided persistent disk/NAS; no separate object-storage service. Disk, backups and hosting still have a cost. |
| `school-drive` | AES-GCM encrypted blobs in each school's own Google Drive folder | The school supplies the account and available Drive capacity. The platform has no cloud file-storage account or paid fallback. App metadata and download traffic still use normal hosting resources. |
| `links-only` | Files remain in the school's Drive, OneDrive or other HTTPS file service | Only a display name and URL are saved here. No binary upload is accepted for posts. External sharing permissions and availability are controlled by the school/provider. |

Development defaults to local uploads. Production, without an explicit mode, allows direct post uploads only for a school with a valid Drive configuration. Set `POST_ATTACHMENT_STORAGE=links-only` to refuse all direct post uploads, including crafted API requests. A broken Drive connection never falls back to local storage. Existing legacy local files continue to download from their recorded storage location; configuring Drive does not automatically migrate old attachments.

School Drive uploads use a school account's delegated OAuth credentials, not a platform account or a service account's nonexistent personal Drive quota. A school-owned folder or shared-drive folder must be accessible to that OAuth grant. Files have opaque names and encrypted contents; recipients download through the authenticated school app without needing direct access to the Drive folder.

## Connect school-owned Google Drive

This integration is implemented but no real school account has been connected in this workspace. Deployment setup requires the school's administrator:

1. Enable the Drive API in the school's Google Cloud project and configure its OAuth consent/client. Use the school account's normal authorized OAuth process to grant offline access and obtain a refresh token. Prefer the `drive.file` scope and an app-created or explicitly selected folder accessible under that grant. A shared-drive folder also requires appropriate membership. Complete Google verification/Workspace administrator approval if applicable to the chosen deployment and scopes.
2. Provide the OAuth client ID, client secret, refresh token and folder ID through the deployment secret manager. Keep them out of browser settings, source control, screenshots and chat. No provider credentials are returned by the overview/files API.
3. Set `POST_ATTACHMENT_STORAGE=school-drive` and configure `SCHOOL_FILE_STORES`, keyed by school UUID. For the current local scenario that key is `019a6000-0000-7000-8000-000000000001`:

```json
{
  "019a6000-0000-7000-8000-000000000001": {
    "provider": "google-drive",
    "folderId": "SCHOOL_FOLDER_ID",
    "clientId": "SCHOOL_OAUTH_CLIENT_ID",
    "clientSecret": "FROM_SECRET_MANAGER",
    "refreshToken": "FROM_SECRET_MANAGER"
  }
}
```

4. Configure `FIELD_ENCRYPTION_KEY` and back it up securely. The encryption key, database metadata and school Drive contents are all required for recovery. Configure the existing HTTPS document scanner through `FILE_SCAN_URL` and `FILE_SCAN_TOKEN`; production document uploads fail closed without it. Inspect a sample photo/document, publish to a test family, and verify an actual download before accepting the live connection.
5. The default application quota is 1 GiB per school across private attachments (`FILE_SCHOOL_QUOTA_BYTES`). Choose an explicit quota appropriate to the school's storage allocation. Do not delete encrypted blobs directly from Drive except through a coordinated retention/recovery process: deleting them breaks the app's download references. Monitor provider outages, quota use, failed deletions and abandoned upload sessions; the mock tests do not constitute a live recovery drill.

The server uses OAuth refresh tokens, resumable Drive uploads and authenticated `alt=media` downloads. It retains provider/file IDs alongside attachment metadata, never image/document contents in the database. Files pass through server memory for validation, encryption and downloads, so storage separation does not eliminate application bandwidth/compute charges. There is no automatic OneDrive upload adapter in this implementation; school-owned OneDrive links already work. Automatic OneDrive uploads would require its own school OAuth connection and adapter.

## Avoiding a storage bill

Google currently offers Education Fundamentals at no charge to qualifying institutions, with a baseline 100 TB of pooled institutional storage. Eligibility, approval and the school's existing usage must be checked; this is not unlimited storage or a guarantee that any school account is free. [Google Education Fundamentals](https://edu.google.com/workspace-for-education/editions/education-fundamentals/), [storage availability](https://knowledge.workspace.google.com/admin/getting-started/editions/understand-storage-availability-and-usage).

Cloudflare R2's Standard free allowance is currently 10 GB-month plus limited request allowances; egress is free, but excess storage/operations are billable. It was researched as an alternative and has not been enabled or added as a platform storage dependency. [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

Relevant implementation references: [Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [OAuth offline access](https://developers.google.com/identity/protocols/oauth2/web-server#offline), [private Drive downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads).

## Verification

`tests/post-files.test.ts` uses an isolated database and temporary disk directory. It verifies recipient isolation, image conversion, encryption, PDF/XLSX downloads, locked published attachments, quotas, failed-post cleanup, links-only upload denial and a mocked school Drive upload/download/delete cycle without local copies. A separate mocked Drive outage proves there is no disk fallback. Real Drive credentials/network calls are not used in these tests.

The Netaji browser attachment check uses intercepted post/file fixtures to preserve the live demo data. It exercises mobile photo/file/link selection, removals, image preparation, accessible previews, teacher feed rendering, parent noticeboard attachments and a completed PDF download with byte verification. Screenshots are in `docs/screenshots/netaji-post-attachments-mobile.png` and `netaji-parent-post-attachments.png`.
