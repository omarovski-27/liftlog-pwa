# LiftLog PWA

A phone-first progressive overload log for structured lifting programs. The app is seeded with Omar's 14-week chest specialization block.

## Current Features

- A local program library with create, edit, duplicate, switch, and persistent active-program selection.
- A visual ordered builder for workouts and exercises, including sets, rep targets, RIR, rest, set type, muscles, paired sets, and notes.
- Optional week-range overrides for sets and reps, resolved automatically in previews and workout rows.
- Local program JSON import from pasted AI output or a selected file, with validation and review in the visual builder.
- Clean program JSON export plus a copyable prompt for ChatGPT, Claude, or another external AI.
- Live workout, exercise, and working-set totals with inline validation.
- A configurable starting week for accurate mid-program progress and remaining-session counts.
- Four seeded workout templates with the PDF's week 1-2 chest and direct-arm entry doses applied automatically.
- Active workout logging for weight, reps, RIR, completed sets, extra or removed sets, and notes.
- Automatic IndexedDB saving and recovery of an unfinished workout after reload.
- Previous-session values beside each current set, with a copy-last action.
- Exercise substitution that preserves the prescribed movement and optionally remembers alternatives.
- Completed workout history with weekly session, set, and training-volume summaries.
- Per-exercise progress with top sets, estimated one-rep max, prior-session change, and an eight-workout trend chart.
- Personal-record detection when a completed workout improves estimated strength, volume, or reps.
- Program week, completed-session, remaining-session, phase, progression, and constraint views.
- Immutable program versions. Each workout records the version it used.
- Full JSON backup export with validated merge or exact replacement restore.
- Installable PWA metadata and an offline app-shell cache.
- In-app phone installation guidance with Android prompting, iPhone steps, and the current app link.

All workout records stay on the device. There is no account or paid service.

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
