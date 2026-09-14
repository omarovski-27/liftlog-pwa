import { describe, expect, it } from 'vitest'
import { chestSpecializationProgram } from './chestSpecializationProgram'
import {
  getProgramCurrentWeek,
  getRemainingProgramSessions,
  getTotalProgramSessions,
  getWeeklyExerciseSlots,
  getWeeklySetsForMuscle,
  getWeeklyWorkingSets,
  getWorkingSetCount,
} from '../lib/programMetrics'

describe('chest specialization seed program', () => {
  it('captures the phase 1 app contract from the source program', () => {
    expect(chestSpecializationProgram.durationWeeks).toBe(14)
    expect(chestSpecializationProgram.liftingDaysPerWeek).toBe(4)
    expect(chestSpecializationProgram.workouts).toHaveLength(4)
    expect(getTotalProgramSessions(chestSpecializationProgram)).toBe(56)
    expect(getRemainingProgramSessions(chestSpecializationProgram)).toBe(56)
  })

  it('uses a mid-program starting week in progress totals', () => {
    const midProgramStart = { ...chestSpecializationProgram, currentWeek: 3 }

    expect(getRemainingProgramSessions(midProgramStart)).toBe(48)
    expect(getRemainingProgramSessions(midProgramStart, 5)).toBe(43)
    expect(getProgramCurrentWeek(midProgramStart, 5)).toBe(4)
  })

  it('keeps the as-written chest volume and weekly workload measurable', () => {
    expect(getWeeklySetsForMuscle(chestSpecializationProgram, 'chest')).toBe(18)
    expect(getWeeklyWorkingSets(chestSpecializationProgram)).toBe(111)
    expect(getWeeklyExerciseSlots(chestSpecializationProgram)).toBe(44)
  })

  it('applies the PDF entry-dose prescription in weeks 1 and 2', () => {
    expect(getWeeklySetsForMuscle(chestSpecializationProgram, 'chest', 1)).toBe(15)
    expect(getWeeklySetsForMuscle(chestSpecializationProgram, 'biceps', 1)).toBe(8)
    expect(getWeeklySetsForMuscle(chestSpecializationProgram, 'triceps', 1)).toBe(8)
    expect(getWeeklyWorkingSets(chestSpecializationProgram, 1)).toBe(101)
    expect(
      chestSpecializationProgram.workouts.map((workout) =>
        getWorkingSetCount(workout, 1),
      ),
    ).toEqual([24, 26, 23, 28])
  })

  it('preserves each lifting day and its working-set count', () => {
    expect(
      chestSpecializationProgram.workouts.map((workout) => [
        workout.title,
        getWorkingSetCount(workout),
      ]),
    ).toEqual([
      ['Day 1 - Upper: Heavy Chest', 25],
      ['Day 2 - Lower A + Core + Arms', 28],
      ['Day 3 - Upper: Chest Hypertrophy', 27],
      ['Day 4 - Lower B + Chest Pump + Arms + Core', 31],
    ])
  })
})
