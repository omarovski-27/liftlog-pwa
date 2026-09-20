# LiftLog Audit

Audit completed for the 0.10.0 release.

## Scope

- Preserve existing local IndexedDB workout data across app updates.
- Validate the day-to-day phone workflow: start, log, adjust, finish, reopen, view history, and compare previous work.
- Verify custom program editing, immutable versions, import/export, backup restore, offline shell behavior, and 320px usability.

## User-Reported Issues Covered

- History now receives all saved sessions on the device, not only sessions for the currently active program. Train and next-workout logic still use the active program's sessions.
- The logger now has an exercise-level **Edit target** action for planned sets, reps/target, RIR, and rest. Adding/removing set rows also keeps the current-session planned set count in sync.
- Lowering planned sets cannot silently delete entered rows; the app asks the user to clear extra entries first.
- Program editing is more discoverable on phones with a visible **Edit** action in the Program library.
- Backup export stays disabled while session saves or remembered exercise alternatives are still pending.

## Data Preservation

- App deployments update static files and the service worker; they do not clear IndexedDB.
- Numeric weight, rep, duration, distance, and RIR entries now mark their set logged immediately. Finishing a workout also repairs any entered row whose checkmark was missed.
- Database version 6 repairs entered rows in older completed workouts so they become visible in History, Previous, and Progress.
- A synchronous local recovery journal shadows the latest 128 sessions before each IndexedDB write and is reconciled at startup. This protects a final phone edit if the app is suspended before the asynchronous write completes.
- The app requests persistent browser storage when supported.
- Logged workouts remain stored per device/browser/origin.
- The desktop in-app browser inspected during audit had 0 completed live sessions, so Omar's two real logged phone sessions were not available from that browser profile.
- To move or protect real phone data, export a backup from the phone/browser that contains the logs, then import that JSON where needed.

## Verification

- Typecheck: `npx tsc -b --pretty false`
- Lint: `npm run lint`
- Tests: `npm test`
- Latest full test result: 18 files passed, 128 tests passed.
- Production build: `npm run build`

## Notes

- The source PDF's exercise tables are exhaustively asserted in a regression test. The app uses those table values exactly; the separate week 1-2 entry-dose note remains guidance because the PDF does not assign its reductions to specific exercise rows.
- The workout logger shows both the most recent logged sets and the all-time best set for each exercise.
- Vitest runs files serially because the suite uses one shared fake IndexedDB database. Parallel files can clear data while another file is testing persistence.
- Phone installation itself remains device-specific manual QA: open the GitHub Pages URL in Safari/Chrome and install the PWA.
