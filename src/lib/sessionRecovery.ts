import type { WorkoutSession } from '../types/session'

const JOURNAL_KEY = 'liftlog-session-recovery-v1'
const MAX_JOURNAL_SESSIONS = 128

interface SessionJournal {
  schemaVersion: 1
  sessions: WorkoutSession[]
}

export function rememberSession(session: WorkoutSession): void {
  const sessions = readSessionJournal().filter((entry) => entry.id !== session.id)
  sessions.push(session)
  writeSessionJournal(sessions)
}

export function forgetRememberedSession(sessionId: string): void {
  writeSessionJournal(readSessionJournal().filter((session) => session.id !== sessionId))
}

export function replaceRememberedSessions(sessions: WorkoutSession[]): void {
  writeSessionJournal(sessions)
}

export function readRememberedSessions(): WorkoutSession[] {
  return readSessionJournal()
}

function readSessionJournal(): WorkoutSession[] {
  try {
    const raw = globalThis.localStorage?.getItem(JOURNAL_KEY)
    if (!raw) return []
    const value = JSON.parse(raw) as Partial<SessionJournal>
    if (value.schemaVersion !== 1 || !Array.isArray(value.sessions)) return []
    return value.sessions.filter(isRecoverableSession)
  } catch {
    return []
  }
}

function writeSessionJournal(sessions: WorkoutSession[]): void {
  try {
    const newest = sessions
      .filter(isRecoverableSession)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, MAX_JOURNAL_SESSIONS)
    const journal: SessionJournal = { schemaVersion: 1, sessions: newest }
    globalThis.localStorage?.setItem(JOURNAL_KEY, JSON.stringify(journal))
  } catch {
    // IndexedDB remains the primary store when local storage is unavailable or full.
  }
}

function isRecoverableSession(value: unknown): value is WorkoutSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<WorkoutSession>
  return (
    typeof session.id === 'string' &&
    typeof session.programId === 'string' &&
    typeof session.workoutTemplateId === 'string' &&
    typeof session.workoutTitle === 'string' &&
    Number.isSafeInteger(session.workoutDayNumber) &&
    Number.isSafeInteger(session.programVersion) &&
    Number.isSafeInteger(session.weekNumber) &&
    (session.status === 'active' || session.status === 'completed') &&
    typeof session.startedAt === 'string' &&
    Number.isFinite(Date.parse(session.startedAt)) &&
    typeof session.updatedAt === 'string' &&
    Number.isFinite(Date.parse(session.updatedAt)) &&
    (session.completedAt === undefined || Number.isFinite(Date.parse(session.completedAt))) &&
    typeof session.sessionNotes === 'string' &&
    Array.isArray(session.exercises) &&
    session.exercises.every((exercise) =>
      Boolean(
        exercise &&
        typeof exercise.id === 'string' &&
        typeof exercise.templateExerciseId === 'string' &&
        typeof exercise.performedName === 'string' &&
        Array.isArray(exercise.sets) &&
        exercise.sets.every((set) =>
          Boolean(
            set &&
            typeof set.id === 'string' &&
            Number.isSafeInteger(set.number) &&
            typeof set.completed === 'boolean',
          ),
        ),
      ),
    )
  )
}
