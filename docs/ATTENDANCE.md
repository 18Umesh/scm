# Voice and screenshot attendance

Open http://netaji.localhost:3000, sign in as `anjali@netaji.school` with `NetajiDemo!2026`, then open My Classes > a class > Attendance roster.

The sample teacher is Anjali Sharma. The linked students include Aarav Reddy and Ananya Rao. These are synthetic sample names, not records of real people. The active Netaji pilot has ten pupils and starts without recorded attendance.

## Manual roster

Each student has two buttons: a tick for Present and a cross for Absent. Selecting one deselects the other. On narrow screens the symbols stay visible with accessible student-specific labels. The same two statuses apply to screenshot and voice drafts. Late, leave and other recognized statuses require a teacher to explicitly choose Present or Absent before applying the draft. Historical records are retained. Both review confirmations remain required before submission.

## Screenshot

1. Choose Import screenshot and select a PNG, JPEG or WebP under 6 MB / 16 megapixels.
2. Select English, Hindi+English or Telugu+English and choose Analyze screenshot.
3. Compare the image with the extracted text and suggested entries. Correct the student or status, or explicitly exclude an irrelevant/duplicate row.
4. Apply draft to roster. A missing student stays unmarked unless attendance was already recorded. Complete those rows manually.
5. Choose Save attendance. Check every student and status, tick the first confirmation and continue. Check the class, date and complete roster a second time, then tick the second confirmation and submit.

Clear printed names/admission numbers and explicit Present/Absent/P/A marks work best. Handwriting, bare ticks, crossed-out marks and blurry photos are not reliably interpreted; correct the text or use manual attendance. The recognizer never guesses that an omitted child is absent or present.

## Voice

Choose Voice attendance. Select a language and Start voice attendance, then allow the browser's microphone request. Say one name and status at a time, for example "Aarav Reddy absent", pause, then "Ananya Rao present". Stop listening, edit any transcription mistakes and choose Match to class roster. Resolve uncertain/duplicate entries, apply the draft, then complete the same two review steps.

Voice requires a secure context and a browser supporting on-device SpeechRecognition plus its installed language pack. If a local pack is downloadable the browser offers its download. If local recognition is unavailable or permission is denied, the screen explains this and offers screenshot, paste-list and manual alternatives. There is no cloud-recognition fallback. A listening session stops after one minute or when the dialog closes. See [on-device recognition](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API) for browser capability details.

## Data handling and deployment

Screenshot OCR runs in a browser worker using self-hosted Tesseract.js 7, WASM and language packs. No screenshot, audio or transcript is uploaded to the school API or an external model. These temporary inputs disappear when the dialog closes. Only the final attendance rows, source method and two confirmation flags reach the attendance endpoint; review metadata is audited. Existing tenant/class access, CSRF, optimistic versions, correction reasons and absence notifications still apply.

The OCR assets are under `apps/web/public/ocr`, with upstream licenses and a language-pack checksum manifest. `node scripts/prepare-ocr.mjs` recreates the worker/core files from installed dependencies and downloads missing language packs from a pinned tessdata_fast revision. Production must serve these static assets and retain the adult page's WASM/worker permissions. The root adult page can request microphone access; student pages retain microphone denial. Tesseract installation guidance is [upstream](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md).

Browser automation runs actual OCR against a generated sample screenshot, verifies zero external requests and zero attendance writes before both checks, and verifies the submitted review metadata. Voice automation substitutes a local recognizer to test the UI and local-only flag; actual microphones, accents, browser-model downloads and physical phones still need manual acceptance.
