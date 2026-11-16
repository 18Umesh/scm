# Teaching Studio: teacher LMS proposal

Prepared 12 November 2026. This is a researched product proposal, not a claim that the LMS or live AI generation is implemented.

## What other platforms offer

| Platform | Verified capabilities relevant to this project |
|---|---|
| [Google Classroom with Gemini](https://support.google.com/edu/classroom/answer/15410566?hl=en-GB) | Lesson outlines, quizzes, presentations, audio lessons, reading-level adaptation, vocabulary, rubrics and translation. Availability depends on enabled features and device. |
| [Toddle AI](https://www.toddleapp.com/ai/) | Curriculum and lesson design, differentiated materials, assessment building, grading assistance, report comments and school-data insights, with teacher review. |
| [Canvas IgniteAI](https://community.instructure.com/en/kb/articles/664510-what-are-the-available-ai-features-in-canvas) | Question authoring, rubrics, standards alignment, reassessment suggestions, discussion insights, translation and study tools. Institutions must enable the relevant features. |

These are vendor-documented capabilities, not independent performance benchmarks. A basic lesson-plan generator would match an existing feature category. Our proposed advantage is a complete preparation-to-teaching-to-assessment workflow that uses this school's actual timetable and HOD-approved curriculum. No claim of being ten times better is verified.

## Experience

Place **Teaching Studio inside each class**, linked from the syllabus and a **Prepare lesson** action on a scheduled lesson. Keep the existing floating navigation compact. Its four views are **Plan**, **Create**, **Teach** and **Progress**. Class, grade, teaching subject and lesson duration are automatically filled from published assignments. A teacher with multiple assigned subjects can choose between those subjects.

Example: Anjali opens Grade 4 Mathematics, selects a HOD-assigned Fractions unit, and prepares tomorrow's 45-minute lesson. One reviewed teaching pack contains objectives, prerequisite checks, timed teaching notes, worked examples, classroom activities, a worksheet, a private answer key, an exit ticket and a Diary draft. She edits it, chooses what to release and confirms what was actually taught afterwards.

## Recommended features

| Capability | Proposed behaviour | Priority |
|---|---|---|
| Curriculum library | HOD-approved syllabus, textbook edition, chapters, learning outcomes, teaching dates and approved sources. Sources are versioned. | First release |
| Source-backed preparation | Drafts cite the uploaded chapter/page or approved resource used. Missing evidence is flagged; invented page citations are rejected. Teacher verifies extraction from scanned materials. | First release |
| Lesson and weekly study plans | Plan a lesson, chapter, week or term around real periods, holidays, exams, syllabus due dates and available preparation time. | First release |
| Complete teaching packs | Objectives, prerequisite checks, explanation, worked examples, common misconceptions, timed activities, board notes, practice and exit tickets. | First release |
| Editable resource builder | Worksheets, quizzes, vocabulary, reading passages, activities, rubrics and teacher answer keys. Regenerate one section while retaining teacher edits elsewhere. | First release |
| Differentiation | Teacher-selected support, standard and extension versions with accessible formatting, language simplification and local examples. Avoid permanent ability labels. | First release |
| Local language support | English, Telugu and Hindi teaching notes and worksheets, preserving terminology and allowing teacher correction of translations. | First release |
| Teaching mode | A phone/projector-friendly lesson view with next-step cards, timer, board prompts, revealable worked answers and printable notes. Answer keys stay private. | First release |
| Existing workflow integration | Explicit actions to create Diary or Assignment drafts, attach a resource or prepare a class feed post. Publishing uses existing permissions and review. No family messaging is introduced. | First release |
| Evidence of delivery | Keep Planned, Reviewed, Taught and Assessed separate. Generating or publishing a plan never marks syllabus completion automatically. | First release |
| Question bank and exam blueprints | Tag items with subject, chapter, outcome, marks, difficulty and question type. Draft scheduled-exam papers and private marking schemes that respect the school's blueprint. | Next |
| Topic mastery and reteaching | Use question-level or rubric evidence to identify concepts requiring support and draft a follow-up plan. Overall subject scores alone cannot establish a specific misconception. | Next |
| Absence catch-up | Draft catch-up material from lessons actually marked taught on absence dates; teacher chooses recipients and approves release. | Next |
| Substitute-teacher packs | Prepare lesson context, materials and activities for approved cover periods. | Next |
| Reuse across classes | Reuse a reviewed pack across appropriate sections, keeping local edits and versions. Grade or syllabus differences require deliberate adaptation. | Next |
| Resource library and collaboration | Private drafts, HOD review, approved department templates, search by outcome and version history. | Next |
| Print and offline use | Download a reviewed lesson pack and worksheets for teaching without an active connection; reconcile completion updates when connected. | Next |
| Presentations and visual aids | Generate editable slide content and diagrams from reviewed material. Image/audio/video generation are separately metered features. | Later |
| Interactive practice | Teacher-created short practice activities and feedback with an explicit release flow; active student access requires a separate rollout. | Later |

## Permissions and quality

- Subject teachers prepare and assess their assigned teaching subjects. Class-teacher appointment grants the existing broader class overview, not permission to enter another teacher's subject marks.
- HOD/incharge controls syllabus assignments, shared templates and any required plan review. Principal sees appropriate school-level summaries.
- Teacher edits, review, release and actual delivery are auditable. AI drafts never change marks, attendance, syllabus status or publication state without the corresponding authorized action.
- Every source/document is treated as content, not as instructions to the AI or server. School/class access is rechecked when retrieving sources and rendering a saved pack.
- Initial generation can use curriculum and non-personal class context. Named-student, submission and private performance processing needs a separately configured school-approved provider route. The current repository's AI gateway blocks personal-data requests and has no enabled verified model; this must be addressed before those later features are promised as live.
- HOD performance evidence should show planning, delivery, assessment and revision dates. Do not turn AI usage or generated document counts into automatic teacher rankings.

## Cost and storage

Use school-owned Drive storage for binary resources, keeping content metadata, permissions and versions in the application database. OneDrive links are supported now; automatic OneDrive uploads remain an implementation task. Provider access and school storage quotas still apply.

Use a configurable school AI account, request limits, per-school budgets, reusable reviewed templates, cached curriculum extraction and optional section-level regeneration. Show usage to the school. Provider usage, retrieval/indexing, application hosting and bandwidth are distinct from attachment storage; school-owned storage does not make AI free.

## Delivery and acceptance

1. Build the curriculum/source library, editable manual plans, pack preview, permission checks and connection to existing Diary/Assignments.
2. Connect a real approved provider; add source-backed generation, section editing, teacher review, usage accounting and repeatable quality tests. Do not present canned demo text as live AI.
3. Add outcome-linked assessment evidence, reteaching/catch-up workflows, collaboration and richer media after first-release acceptance.

Measure the improvement against a teacher's existing workflow: time to a reviewed lesson pack, source accuracy, amount of teacher correction, preparation coverage and successful use in class. A proposed pilot target is a reviewed pack within 5-10 minutes for a supported chapter; this is a target to test, not a demonstrated saving. Check all three Grade 4 teachers and a class-teacher account, desktop and phone, provider failure, low connectivity, permissions and school cost caps.
