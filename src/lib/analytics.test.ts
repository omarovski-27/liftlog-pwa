import { describe, expect, it } from 'vitest'
import { chestSpecializationProgram } from '../data/chestSpecializationProgram'
import type { WorkoutSession } from '../types/session'
import { createWorkoutSession } from './sessions'
import {
  getCurrentProgramWeekSessions,
  getExerciseTrends,
  getSessionPersonalRecords,
  getTrainingSummary,
} from './analytics'

function completedPressSession(
  id: string,
  completedAt: string,
  weight: number,
  reps: number,
  weekNumber = 1,
): WorkoutSession {
  const session = createWorkoutSession(
    chestSpecializationProgram,
    chestSpecializationProgram.workouts[0],
    [],
  )
  session.id = id
  session.status = 'completed'
  session.completedAt = completedAt
  session.updatedAt = completedAt
  session.weekNumber = weekNumber
  const press = session.exercises.find(
    (exercise) => exercise.templateExerciseId === 'd1-incline-db-press',
  )!
  press.sets[0] = {
    ...press.sets[0],
    completed: true,
    weightKg: weight,
    reps,
    rir: 2,
  }
  return session
}

describe('training analytics', () => {
  it('tracks timed and distance exercises without rep volume or strength estimates', () => {
    const first = completedPressSession('timed-first', '2026-09-01T10:00:00.000Z', 20, 30)
    const second = completedPressSession('timed-second', '2026-09-08T10:00:00.000Z', 20, 30)
    first.exercises[1].metric = 'seconds'
    second.exercises[1].metric = 'seconds'
    second.exercises[1].sets[0].reps = null
    second.exercises[1].sets[0].durationSeconds = 35.5
    const trend = getExerciseTrends([first, second])[0]
    expect(trend).toMatchObject({ metric: 'seconds', bestTotalQuantity: 35.5, bestVolumeKg: 0, bestEstimatedOneRepMaxKg: null })
    expect(trend.latest.totalQuantity).toBe(35.5)
    expect(getTrainingSummary([first, second]).volumeKg).toBe(0)
    expect(getSessionPersonalRecords(second, [first])).toContain('Incline DB press')
    const distance = completedPressSession('distance', '2026-09-15T10:00:00.000Z', 20, 30)
    distance.exercises[1].metric = 'meters'
    distance.exercises[1].sets[0].reps = null
    distance.exercises[1].sets[0].distanceMeters = 40
    expect(getExerciseTrends([first, second, distance])).toHaveLength(2)
    expect(getExerciseTrends([distance])[0].latest.totalQuantity).toBe(40)
  })

  it('treats zero external load as reps-only performance, not a zero strength estimate', () => {
    const first = completedPressSession('bodyweight-first', '2026-09-01T10:00:00.000Z', 0, 10)
    const second = completedPressSession('bodyweight-second', '2026-09-08T10:00:00.000Z', 0, 12)
    expect(getExerciseTrends([first, second])[0].latest.estimatedOneRepMaxKg).toBeNull()
    expect(getSessionPersonalRecords(second, [first])).toContain('Incline DB press')
  })

  it('summarizes only completed sets from completed workouts', () => {
    const completed = completedPressSession(
      'completed',
      '2026-09-01T10:00:00.000Z',
      30,
      10,
    )
    const active = completedPressSession(
      'active',
      '2026-09-02T10:00:00.000Z',
      100,
      10,
    )
    active.status = 'active'

    expect(getTrainingSummary([completed, active])).toEqual({
      workouts: 1,
      completedSets: 1,
      volumeKg: 300,
      uniqueExercises: 1,
    })
  })

  it('builds chronological exercise trends and latest comparisons', () => {
    const first = completedPressSession('first', '2026-09-01T10:00:00.000Z', 30, 8)
    const second = completedPressSession('second', '2026-09-08T10:00:00.000Z', 32.5, 9, 2)

    const trend = getExerciseTrends([second, first]).find(
      (entry) => entry.name === 'Incline DB press',
    )!

    expect(trend.points.map((point) => point.sessionId)).toEqual(['first', 'second'])
    expect(trend.latest.topSet).toMatchObject({ weightKg: 32.5, reps: 9 })
    expect(trend.previous?.topSet).toMatchObject({ weightKg: 30, reps: 8 })
    expect(trend.bestEstimatedOneRepMaxKg).toBeCloseTo(42.25)
  })

  it('counts the current program week after complete training weeks', () => {
    const sessions = Array.from({ length: 4 }, (_, index) =>
      completedPressSession(
        `week-one-${index}`,
        `2026-09-0${index + 1}T10:00:00.000Z`,
        30,
        8,
      ),
    )

    expect(getCurrentProgramWeekSessions(chestSpecializationProgram, sessions)).toEqual({
      currentWeek: 2,
      completed: 0,
      target: 4,
    })
  })

  it('never shows more completed sessions than the weekly target', () => {
    const sessions = Array.from({ length: 8 }, (_, index) =>
      completedPressSession(
        `duplicate-week-${index}`,
        `2026-09-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
        30,
        8,
        3,
      ),
    )

    expect(getCurrentProgramWeekSessions(chestSpecializationProgram, sessions)).toEqual({
      currentWeek: 3,
      completed: 4,
      target: 4,
    })
  })

  it('detects strength and volume records but not a first performance', () => {
    const first = completedPressSession('first', '2026-09-01T10:00:00.000Z', 30, 8)
    const stronger = completedPressSession('stronger', '2026-09-08T10:00:00.000Z', 32.5, 9)
    const weaker = completedPressSession('weaker', '2026-09-15T10:00:00.000Z', 25, 8)

    expect(getSessionPersonalRecords(first, [])).toEqual([])
    expect(getSessionPersonalRecords(stronger, [first])).toContain('Incline DB press')
    expect(getSessionPersonalRecords(weaker, [first, stronger])).not.toContain(
      'Incline DB press',
    )
  })
})
