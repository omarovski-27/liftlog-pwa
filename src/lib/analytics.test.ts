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
