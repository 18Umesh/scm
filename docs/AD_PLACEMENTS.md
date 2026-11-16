# Advertising placements and revenue plan

Updated 12 November 2026. Rich-media local previews are implemented; paid network integration and advertiser billing are separate production work.

All placements now default to the compact sponsored-post treatment, including My School Day. Cards are capped at 820px wide and use the shorter media treatment described below.

## Implemented placements

| Surface | Format and behaviour |
|---|---|
| School Feed | Compact post-style image/video cards for eligible adult roles, with a short caption, shallow landscape media area and inline offer button. Media is 180px high on normal phone viewports and 220px on desktop, rather than a tall portrait takeover. Advertiser identity and Sponsored label remain explicit; school posts and acknowledgement actions remain separate. |
| Teacher My Classes directory | One media card below the class list. Opening an individual classroom removes this directory placement. |
| Teacher My School Day | Inline media placement after the day content. |
| Parent Home | A media card using the existing home slot. |
| Allowed staff Today pages | Existing management home placement now supports image/video creatives. |

Live feed placement starts after three organic posts and repeats after six more, with at most three slots in the loaded feed. The small local demo also inserts a preview after its first/second post, so the format can be tested without creating fake school updates. Empty feeds do not receive ad-only content. The live UI currently reserves a maximum of six ad displays per session; mock examples bypass caps for testing.

Demo controls cycle between an image ad, a playable video ad and another image example. Video uses tap-to-play, muted initial playback, inline controls, a poster and no eager video download. Playback pauses when the card moves out of view or the browser tab is hidden. App impression events wait for at least half the card to be visible (one second for images, two seconds for video); these are application counters, not certified/billable network measurements. Video start/completion events are supported in the separate ads service. No student, score, fee or identity fields are added to ad requests.

## Next surfaces to evaluate

1. General school-events/community listings: a local event or activity sponsor between event groups.
2. Parent calendar overview: a footer card after general events, visually separated from calendar controls and exam actions.
3. Resource-library browsing: teaching-material sponsors in the future library, separated from lesson preparation and teaching modes.
4. Parent gallery index: an advertiser-owned card outside the school-photo grid, with explicit attribution and no suggestion that pictured children endorse it.
5. An optional offers directory: adults deliberately browse approved book, stationery, educational product and family-event offers. This needs a real directory, merchant review and commercial terms, rather than a screen containing only ads.

Student and Accounts contexts and core attendance, marks, fees, private records, forms and classroom work remain outside the implemented placements. Ads do not cover floating navigation, block task completion, or imitate school updates. This keeps essential work usable while building repeatable browsing inventory.

## What to measure

Compare formats and placements using eligible traffic, fill/show rates, viewable impressions, click-through, video starts/completions, hide/report rates, return visits and realized revenue. Revenue is monetized impressions / 1000 multiplied by realized eCPM; higher eCPM alone does not prove higher overall revenue. Test actual demand and retention before increasing density. Include creative storage and media-delivery costs when comparing net revenue per thousand sessions.

Potential commercial models are approved local direct sponsorships and a suitable programmatic network, subject to provider acceptance. Direct sponsorship needs campaign review, availability, reporting, invoicing and refunds/credits. The current mock clicks/reports and video examples are previews; no advertiser is being billed.

## Primary sources consulted

- [Google: native ad elements](https://support.google.com/admanager/answer/6366845?cfPlatform=android&hl=en&webview=1): native styling requires explicit ad attribution.
- [Google: ad placement policies](https://support.google.com/adsense/answer/1346295?hl=en-GB): placement should avoid confusion with navigation/download controls and accidental clicks.
- [Google: AdMob optimization](https://support.google.com/admob/answer/7457611?hl=en): allowing suitable media types can expand advertiser bidding; this is not a promise that every video placement earns more.
- [Google: earnings diagnostics](https://support.google.com/admob/checklist/10424733?hl=en): impressions, eCPM, match and show rates all matter.

Actual creatives currently use local same-origin assets. Production media hosting must use the app origin or an approved creative host with matching CSP and provider integration. Adding HTTPS media fields to direct campaigns does not activate Google ads, a native-mobile SDK, or arbitrary third-party trackers. See [AD_CREATIVES.md](AD_CREATIVES.md) for asset provenance and the generation prompt.
