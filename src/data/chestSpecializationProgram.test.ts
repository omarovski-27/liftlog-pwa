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

  it('does not guess which table rows to reduce for the optional entry dose', () => {
    expect(getWeeklySetsForMuscle(chestSpecializationProgram, 'chest', 1)).toBe(18)
    expect(getWeeklySetsForMuscle(chestSpecializationProgram, 'biceps', 1)).toBe(12)
    expect(getWeeklySetsForMuscle(chestSpecializationProgram, 'triceps', 1)).toBe(11)
    expect(getWeeklyWorkingSets(chestSpecializationProgram, 1)).toBe(111)
    expect(
      chestSpecializationProgram.workouts.map((workout) =>
        getWorkingSetCount(workout, 1),
      ),
    ).toEqual([25, 28, 27, 31])
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

  it('matches every exercise row in the source PDF', () => {
    expect(
      chestSpecializationProgram.workouts.map((workout) => ({
        title: workout.title,
        exercises: workout.exercises.map((exercise) => [
          exercise.name,
          exercise.sets,
          exercise.reps,
        ]),
      })),
    ).toEqual([
      {
        title: 'Day 1 - Upper: Heavy Chest',
        exercises: [
          ['Scapular push-up', 2, '10-15'],
          ['Incline DB press', 4, '6-10'],
          ['Flat DB press', 3, '8-12'],
          ['Chest-supported row', 4, '8-12'],
          ['Cable lateral raise', 3, '12-20'],
          ['Pull-up or lat pulldown', 3, '8-12'],
          ['Overhead triceps extension', 2, '10-15'],
          ['Incline DB curl', 2, '10-15'],
          ['Wrist curl', 2, '12-20'],
          ['Reverse wrist curl', 2, '12-20'],
          ['Face pull - light', 2, '15-20'],
        ],
      },
      {
        title: 'Day 2 - Lower A + Core + Arms',
        exercises: [
          ['Leg press', 4, '6-10'],
          ['Leg extension', 3, '10-15'],
          ['Romanian deadlift', 3, '6-10'],
          ['Seated leg curl', 3, '10-15'],
          ['Standing calf raise', 3, '8-15'],
          ['Cable crunch', 3, '10-15'],
          ['Pallof press', 3, '10-15/side'],
          ['Cable external rotation', 2, '15-20'],
          ['Cable curl', 3, '10-15'],
          ['Cable triceps pushdown', 3, '10-15'],
          ['Serratus wall slide', 2, '10-15'],
        ],
      },
      {
        title: 'Day 3 - Upper: Chest Hypertrophy',
        exercises: [
          ['Scapular push-up', 2, '10-15'],
          ['Incline machine or Smith press', 3, '8-12'],
          ['Flat machine press or weighted push-up', 3, '10-15'],
          ['Barbell row', 3, '6-10'],
          ['Cable flye', 2, '12-20'],
          ['Lat pulldown', 3, '8-12'],
          ['Face pull - heavy', 3, '12-20'],
          ['Lateral raise', 3, '12-20'],
          ['Hammer curl', 4, '10-15'],
          ['Cable triceps pushdown', 3, '10-15'],
          ['Serratus wall slide', 2, '10-15'],
        ],
      },
      {
        title: 'Day 4 - Lower B + Chest Pump + Arms + Core',
        exercises: [
          ['Leg press', 3, '10-15'],
          ['Leg extension', 2, '12-20'],
          ['Lying leg curl', 3, '10-15'],
          ['Hip thrust or back extension', 3, '10-15'],
          ['Seated calf raise', 3, '10-15'],
          ['Pec deck or cable flye', 3, '12-20'],
          ['DB or preacher curl', 3, '10-15'],
          ['Overhead cable extension', 3, '10-15'],
          ['Hanging knee or leg raise', 3, '8-15'],
          ['Ab wheel', 2, '6-12'],
          ["Farmer's carry", 3, '30-45 sec'],
        ],
      },
    ])
  })
})
