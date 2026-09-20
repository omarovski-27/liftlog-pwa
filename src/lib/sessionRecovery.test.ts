import { describe, expect, it } from 'vitest'
import { chestSpecializationProgram } from '../data/chestSpecializationProgram'
import { createWorkoutSession } from './sessions'
import {
  forgetRememberedSession,
  readRememberedSessions,
  rememberSession,
  replaceRememberedSessions,
} from './sessionRecovery'

describe('session recovery journal', () => {
  it('keeps the newest snapshot for a session and can forget a discarded workout', () => {
    const session = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [],
    )
    rememberSession(session)
    rememberSession({ ...session, updatedAt: '2026-09-20T10:00:00.000Z', sessionNotes: 'Latest' })

    expect(readRememberedSessions()).toHaveLength(1)
    expect(readRememberedSessions()[0].sessionNotes).toBe('Latest')

    forgetRememberedSession(session.id)
    expect(readRememberedSessions()).toEqual([])
  })

  it('replaces the journal after a backup restore', () => {
    const first = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    const second = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[1], [])

    replaceRememberedSessions([first, second])

    expect(readRememberedSessions().map((session) => session.id).sort()).toEqual(
      [first.id, second.id].sort(),
    )
  })

  it('ignores malformed local data', () => {
    localStorage.setItem('liftlog-session-recovery-v1', JSON.stringify({ schemaVersion: 1, sessions: [{ id: 'bad' }] }))
    expect(readRememberedSessions()).toEqual([])
  })
})
