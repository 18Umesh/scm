# School App Design Studio

School administrators can select and customise a design after registration, before requesting an Android or iOS build. Published settings also style the existing web app.

## Try it locally

Open http://netaji.localhost:3000, sign in as the principal, and open **Brand studio → App Design**.

Choose one of the four concepts:

| Option | Design |
| --- | --- |
| A | Modern & Expressive |
| B | Soft & Colourful |
| C | Bold Blue |
| D | Minimal & Professional |

Customise primary and accent colours, typography, text size, card shape, spacing, navigation and feed density. Preview parent, teacher, accounts and driver examples on mobile and desktop. Preview content is fictional; the preview is a design sample rather than a complete copy of every role screen.

**Save draft** keeps the work private to school administrators. **Publish school design** applies the reviewed design to authenticated web workspaces after their next bootstrap or refresh. Publishing requires a verified school. Existing schools keep their current appearance until they publish a design. Identity/logo settings remain in School Identity.

Published branding versions are immutable and can be restored through the branding history. Concurrent edits are rejected rather than overwriting a newer version. School and role permissions apply to every configuration request. Inputs accept validated design settings, not executable CSS or JavaScript; unreadable primary colours are adjusted for contrast.

## Native application configuration

In **App Factory**, review the published version and request an app using the school's organisation account. Pending design drafts must be published or discarded first. Each request captures the exact branding and design version, so later changes do not modify an earlier build request.

When the request passes configuration checks, **Download build configuration** exports a public JSON manifest. It contains the school identity, application identifier and design snapshot, without store credentials.

The Expo app consumes this file through `apps/mobile/app.config.ts`:

```powershell
$env:SCHOOL_APP_MANIFEST_PATH = 'D:\school-build\school-app-manifest.json'
$env:SCHOOL_API_ORIGIN = 'https://your-school.example.com'
$env:SCHOOL_APP_ICON_PATH = 'D:\school-build\app-icon.png'
```

Run the existing Expo build process from `apps/mobile` with these settings. The API origin must use HTTPS except for local development addresses. The icon path is optional. The shared design schema and tokens live in `packages/theme/design.ts`; the native app reads the build snapshot and the authenticated school's published settings.

**Build limitation:** App Factory currently validates configuration and records requests. It does not invoke a signing service, generate signed APK/IPA binaries, or submit to Google Play or the App Store. A configured native build pipeline and school-owned signing/store credentials are still required. JavaScript bundle export validates the native application but is not a signed installable application.

## Validation

`tests/school-design.test.ts` checks schema safety, contrast adjustment, tenant isolation, draft/publish/version behaviour, branding preservation, build snapshots and Expo configuration. The two design tests in `tests/browser/netaji.spec.ts` exercise the editor and all four published mobile web presets, including accessibility and overflow checks. Browser writes are intercepted; these checks do not publish a design to the local Netaji school.
