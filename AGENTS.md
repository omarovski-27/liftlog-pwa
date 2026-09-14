# LiftLog PWA

## Purpose

Mobile-first progressive overload tracker for Omar's lifting programs. The app includes a structured chest-specialization seed, a visual program builder, a local program library, and workout logging.

## Stack

- React 19
- TypeScript
- Vite
- Vitest + Testing Library
- Plain CSS

## Commands

- `npm run dev` - start local development server
- `npm run build` - typecheck and produce the production bundle
- `npm run lint` - run oxlint
- `npm run test` - run unit/component tests once
- `npm run preview` - serve the production build locally

## Project Rules

- Keep the app phone-first and fast.
- Program data should stay structured; do not bury workouts in display-only strings.
- Keep workout templates separate from logged sessions so substitutions never erase the original prescription.
- Persist program versions, the active-program setting, sessions, and remembered exercise alternatives in IndexedDB through the data layer.
- Treat builder saves as immutable program versions; copies receive new program, workout, exercise, phase, and paired-set identities.
- Keep the public `liftlog-program` JSON contract free of internal ids and route imports through validation and builder review.
- Derive analytics only from completed sets in completed sessions; skipped exercises must not appear as prior performance.
- Lock program creation, editing, switching, version restores, and backup imports while a workout is active.
- Keep exported backups versioned and validate every record before writing imported data.
- Keep the logging screen dense, plain, and usable at 320px without horizontal scrolling.
- Prefer local-first behavior and free deployment paths.
- Build GitHub Pages with `VITE_BASE_PATH=/liftlog-pwa/`; keep local development rooted at `/`.
- The service-worker install test must prove hashed assets are cached under the GitHub Pages subpath.
- Verify changes with lint, tests, and a production build before calling work complete.

## Import Contract

- `docs/PROGRAM_IMPORT.md` documents the public JSON shape for external AI tools.
- `src/lib/programImport.ts` is the authoritative parser and serializer.
