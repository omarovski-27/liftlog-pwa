# LiftLog PWA

A phone-first progressive overload log for structured lifting programs. The app is seeded with Omar's 14-week chest specialization block.

## Current Features

- A local program library with create, edit, duplicate, switch, and persistent active-program selection.
- A visual ordered builder for workouts and exercises, including sets, rep targets, RIR, rest, set type, muscles, paired sets, and notes.
- Optional week-range overrides for sets and reps, resolved automatically in previews and workout rows.
- Local program JSON import from pasted AI output or a selected file, with validation and review in the visual builder.
- Clean program JSON export plus a copyable prompt for ChatGPT, Claude, or another external AI.
- Live workout, exercise, and working-set totals with inline validation.
- A direct current-week control for correcting mid-program progress without changing logged workouts.
- Four seeded workout templates that match every exercise, set count, and rep target in the PDF tables. The PDF's week 1-2 entry-dose guidance remains visible without guessing which exercise should lose a set.
- Active workout logging for weight, reps, RIR, completed sets, extra or removed sets, and notes.
- Automatic IndexedDB saving and recovery of an unfinished workout after reload.
- Previous-session values beside each current set, with a copy-last action.
- Exercise substitution with independent history per performed movement and a persistent default for future sessions.
- In-session exercise add/remove controls plus editable sets, rep targets, RIR, rest, weights, reps, and notes.
- Completed workout history with editable past sessions and a prominent previous-backup import flow.
- Per-exercise progress with top sets, all-time bests, prior-session change, and an eight-workout trend chart.
- A visible workout chooser that can start any program day instead of forcing sequence order.
- Personal-record detection when a completed workout improves estimated strength, volume, or reps.
- Program week, completed-session, remaining-session, phase, progression, and constraint views.
- Immutable program versions. Each workout records the version it used.
- Full JSON backup export with validated merge or exact replacement restore.
- Installable PWA metadata and an offline app-shell cache.
- In-app phone installation guidance with Android prompting, iPhone steps, and the current app link.
- A separate Physio section with private library import, candidate video links, editable weekly routines, partial session recovery, symptom check-ins, and history.
- Additive database version 8 and full-app backup version 2. Legacy v1 restores affect lifting only; divergent physio records stop a merge for review.

All workout records stay on the device. There is no account or paid service.

## Physio

Open **Physio → Exercises** to see the 20 built-in exercise definitions and their video links. No setup code, file transfer or import is needed. On an empty physio store, the app saves the bundled library locally once; concurrent/repeated startup does not duplicate it. Existing plans, edited doses, dispositions, schedules, sessions and symptom observations take precedence. Existing source-matching library entries with no demonstration can display the bundled candidate link without changing their stored targets or snapshots.

The **Daily** view provides seven separate day lists with numbered exercise cards and visible **Watch video** buttons. Technique/source details, custom session selection and symptom forms are secondary disclosures. When no weekdays have been configured, a clearly labeled draft rotation organizes 16 exercises into short groups, with a flexible optional Tuesday and four unclear variants in a review list. This is presentation only: it creates no treatment frequency, dose, approval or missed assignment. Existing saved weekday arrangements take precedence and paused/retired exercises stay excluded. Logging a draft list uses manual actual records; starting today's configured routine preserves required/optional occurrence flags. Browsing another day never rewrites an active session snapshot.

The exercise list, its supplied partial dose information and candidate demonstration links are intentionally public in this single-user app at Omar's request. Source screenshot filenames, screenshots, free-text notes, symptoms and logs are excluded from the bundle. Additional private records continue to stay on the device.

The library supplies no invented weekly schedule, missing dose or variant confirmation. In **Plan**, enter the instructions you have, confirm variants, choose dispositions and weekdays, then save an immutable version. Manual recording works without inventing targets. Pause to resume the same session; finish preserves partial and unrecorded outcomes. The first release supports one session per local day.

Demonstrations are educational candidates, labeled with provider, variant uncertainty, metadata check date and review status. They require internet; playback, captions and therapist equivalence are not guaranteed by a working link.

Backups include all five physio stores. Import is locked while either domain has an unfinished session. A replacement downloads a pre-restore backup first; keep it. A legacy replacement explicitly replaces lifting only. Devices have separate local stores, so transfer an exported file manually to use it on another device. This is not automatic sync.

Unknown observations remain unknown; there is no recovery score or automatic clinical progression. More advanced scheduling (multiple daily doses, rescheduling, shorter approved templates), timers, clinical reports and symptom/function charts are not implemented in this release. Updates wait until existing app windows close instead of forcing an active session to reload.

## Run Locally

```bash
npm install
npm run dev
```

Vite prints the local URL when it starts, usually `http://127.0.0.1:5173/`.

## Verify

```bash
npm run lint
npm run test
npm run build
```

## Phone Install Path

GitHub Pages deploys `main` to `https://omarovski-27.github.io/liftlog-pwa/` at no cost. Open that URL on the phone, then use the **Phone and offline** section in the Program tab. See `docs/PHONE_INSTALL.md` for installation and desktop-to-phone backup transfer.

## Project Shape

- `src/data/chestSpecializationProgram.ts`: immutable program prescription from the source PDF.
- `src/types/session.ts`: logged workout, exercise, set, and alternative records.
- `src/data/db.ts`: IndexedDB persistence.
- `src/lib/sessions.ts`: session creation, previous-performance lookup, progress, and volume.
- `src/lib/backups.ts`: backup validation, export, merge, and exact restore.
- `src/lib/programBuilder.ts`: program draft creation, copying, validation, ordering, and normalization.
- `src/lib/programImport.ts`: AI-friendly program JSON parsing, validation, export, and prompt generation.
- `src/lib/analytics.ts`: completed-set summaries, exercise trends, estimated strength, and personal records.
- `src/types/storage.ts`: versioned program and backup contracts.
- `src/components/ProgramBuilder.tsx`: phone-first visual program editor.
- `src/components/ProgramImport.tsx`: pasted or file-based program import and error review.
- `src/components/ProgramLibraryPanel.tsx`: active-program selection and program actions.
- `src/components/SessionView.tsx`: active workout logging and substitution flow.
- `src/components/HistoryView.tsx`: workout history and exercise progression dashboard.
- `src/components/BackupPanel.tsx`: backup controls and program-version history.
- `src/components/InstallPanel.tsx`: PWA installation status, prompt, platform steps, and app-link sharing.
- `.github/workflows/deploy-pages.yml`: verified free deployment to GitHub Pages.
