import { describe, expect, it } from 'vitest'
import { chestSpecializationProgram } from '../data/chestSpecializationProgram'
import {
  copyPreviousSets,
  createWorkoutSession,
  getLatestExercisePerformance,
  getNextWorkout,
  getSessionSetProgress,
  getSessionVolume,
} from './sessions'

describe('workout sessions', () => {
  it('creates editable rows for every prescribed set', () => {
    const session = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [],
    )

    expect(session.status).toBe('active')
    expect(session.programVersion).toBe(1)
    expect(session.exercises).toHaveLength(11)
    expect(getSessionSetProgress(session)).toEqual({ completed: 0, total: 28 })
    expect(session.exercises[1].sets).toHaveLength(4)
    expect(session.exercises[2].sets).toHaveLength(2)
  })

  it('uses the base prescription after a week override ends', () => {
    const completedSessions = Array.from({ length: 8 }, () => ({
      ...createWorkoutSession(
        chestSpecializationProgram,
        chestSpecializationProgram.workouts[0],
        [],
      ),
      status: 'completed' as const,
    }))
    const session = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      completedSessions,
    )

    expect(session.weekNumber).toBe(3)
    expect(session.exercises[2].sets).toHaveLength(3)
    expect(getSessionSetProgress(session)).toEqual({ completed: 0, total: 29 })
  })

  it('applies a week-specific rep target without changing the base set count', () => {
    const program = structuredClone(chestSpecializationProgram)
    program.workouts[0].exercises[1].weekOverrides = [
      { startWeek: 1, endWeek: 1, reps: '10-12' },
    ]

    const session = createWorkoutSession(program, program.workouts[0], [])

    expect(session.exercises[1].prescribedSets).toBe(4)
    expect(session.exercises[1].repTarget).toBe('10-12')
  })

  it('numbers sessions from the configured starting week', () => {
    const midProgramStart = { ...chestSpecializationProgram, currentWeek: 5 }
    const completedSessions = Array.from({ length: 4 }, () => {
      const session = createWorkoutSession(
        midProgramStart,
        midProgramStart.workouts[0],
        [],
      )
      session.status = 'completed'
      return session
    })

    expect(
      createWorkoutSession(midProgramStart, midProgramStart.workouts[0], []).weekNumber,
    ).toBe(5)
    expect(
      createWorkoutSession(
        midProgramStart,
        midProgramStart.workouts[0],
        completedSessions,
      ).weekNumber,
    ).toBe(6)
  })

  it('uses the last completed workout to choose the next template', () => {
    const session = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [],
    )
    session.status = 'completed'
    session.completedAt = new Date().toISOString()

    expect(getNextWorkout(chestSpecializationProgram, [session]).id).toBe(
      'day-2-lower-a-core-arms',
    )
  })

  it('finds previous performance for the same exercise across workout days', () => {
    const previousSession = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[1],
      [],
    )
    previousSession.status = 'completed'
    previousSession.completedAt = '2026-09-10T12:00:00.000Z'
    const currentSession = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[2],
      [previousSession],
    )
    const currentExercise = currentSession.exercises.find(
      (exercise) => exercise.templateExerciseId === 'd3-cable-triceps-pushdown',
    )!
    const previousExercise = previousSession.exercises.find(
      (exercise) => exercise.templateExerciseId === 'd2-cable-triceps-pushdown',
    )!
    previousExercise.sets[0] = {
      ...previousExercise.sets[0],
      completed: true,
      weightKg: 20,
      reps: 12,
    }

    const previous = getLatestExercisePerformance(
      [previousSession, currentSession],
      currentSession,
      currentExercise,
    )

    expect(previous?.exercise.templateExerciseId).toBe('d2-cable-triceps-pushdown')
  })

  it('ignores exercises that were skipped in a completed workout', () => {
    const previousSession = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [],
    )
    previousSession.status = 'completed'
    previousSession.completedAt = '2026-09-10T12:00:00.000Z'
    const currentSession = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [previousSession],
    )

    expect(
      getLatestExercisePerformance(
        [previousSession, currentSession],
        currentSession,
        currentSession.exercises[1],
      ),
    ).toBeUndefined()
  })

  it('copies previous values without falsely completing the current set', () => {
    const previous = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [],
    ).exercises[1]
    previous.sets[0] = {
      ...previous.sets[0],
      weightKg: 30,
      reps: 10,
      rir: 2,
      completed: true,
    }

    const current = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [],
    ).exercises[1]
    const copied = copyPreviousSets(current, previous)

    expect(copied.sets[0]).toMatchObject({
      weightKg: 30,
      reps: 10,
      rir: 2,
      completed: false,
    })
  })

  it('does not copy skipped rows or overwrite current performance', () => {
    const previous = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], []).exercises[1]
    previous.sets[0] = { ...previous.sets[0], weightKg: 30, reps: 10, completed: true }
    previous.sets[1] = { ...previous.sets[1], weightKg: 99, reps: 99, completed: false }
    const current = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], []).exercises[1]
    current.sets[0] = { ...current.sets[0], weightKg: 35, reps: 8, completed: true }

    const copied = copyPreviousSets(current, previous)
    expect(copied.sets[0]).toMatchObject({ weightKg: 35, reps: 8, completed: true })
    expect(copied.sets[1]).toMatchObject({ weightKg: null, reps: null })
  })

  it('prefers actual exercise identity over a more recent substituted prescription', () => {
    const actual = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    actual.status = 'completed'
    actual.completedAt = '2026-09-01T10:00:00.000Z'
    actual.exercises[1].sets[0].completed = true
    const substitute = structuredClone(actual)
    substitute.id = 'substitute-session'
    substitute.completedAt = '2026-09-08T10:00:00.000Z'
    substitute.exercises[1].performedName = 'Machine press'
    const current = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])

    expect(getLatestExercisePerformance([actual, substitute], current, current.exercises[1])?.session.id).toBe(actual.id)
    expect(copyPreviousSets(current.exercises[1], substitute.exercises[1])).toEqual(current.exercises[1])
  })

  it('calculates volume from completed, fully entered sets only', () => {
    const session = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [],
    )
    session.exercises[1].sets[0] = {
      ...session.exercises[1].sets[0],
      weightKg: 30,
      reps: 10,
      completed: true,
    }
    session.exercises[1].sets[1] = {
      ...session.exercises[1].sets[1],
      weightKg: 30,
      reps: 10,
      completed: false,
    }

    expect(getSessionVolume(session)).toBe(300)
  })
})
