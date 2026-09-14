import { describe, expect, it } from 'vitest'
import { chestSpecializationProgram } from '../data/chestSpecializationProgram'
import {
  createEmptyProgram,
  createProgramCopy,
  duplicateWorkout,
  finalizeProgramDraft,
  getProgramDraftMetrics,
  moveItem,
  validateProgramDraft,
} from './programBuilder'

describe('program builder', () => {
  it('normalizes a valid draft into a structured custom program', () => {
    const draft = createEmptyProgram()
    draft.name = '  Three Day Strength  '
    draft.workouts[0].shortTitle = '  Upper A  '
    draft.workouts[0].exercises[0].name = '  Bench press  '
    draft.workouts[0].exercises[0].muscleGroups = ['chest', 'triceps']
    draft.progressionRules = [' Add weight at 12 reps. ', '']

    const program = finalizeProgramDraft(draft)

    expect(program).toMatchObject({
      name: 'Three Day Strength',
      status: 'custom',
      liftingDaysPerWeek: 1,
    })
    expect(program.workouts[0]).toMatchObject({
      dayNumber: 1,
      title: 'Day 1 - Upper A',
      shortTitle: 'Upper A',
    })
    expect(program.workouts[0].exercises[0].name).toBe('Bench press')
    expect(program.progressionRules).toEqual(['Add weight at 12 reps.'])
    expect(program.weeklyLayout).toEqual([
      'Monday - Day 1 Upper A',
      'Sunday - Complete rest',
    ])
    expect(getProgramDraftMetrics(program)).toEqual({
      workouts: 1,
      exercises: 1,
      workingSets: 3,
    })
  })

  it('reports the exact missing fields in a new draft', () => {
    const issues = validateProgramDraft(createEmptyProgram())

    expect(issues.map((issue) => issue.path)).toEqual([
      'name',
      'workouts.0.exercises.0.name',
      'workouts.0.exercises.0.muscleGroups',
    ])
  })

  it('validates and normalizes non-overlapping week-specific prescriptions', () => {
    const draft = createEmptyProgram()
    draft.name = 'Phased Strength'
    const exercise = draft.workouts[0].exercises[0]
    exercise.name = 'Bench press'
    exercise.muscleGroups = ['chest']
    exercise.weekOverrides = [
      { startWeek: 5, endWeek: 6, reps: ' 4-6 ' },
      { startWeek: 1, endWeek: 2, sets: 2 },
    ]

    const program = finalizeProgramDraft(draft)

    expect(program.workouts[0].exercises[0].weekOverrides).toEqual([
      { startWeek: 1, endWeek: 2, sets: 2, reps: undefined },
      { startWeek: 5, endWeek: 6, reps: '4-6' },
    ])
    expect(getProgramDraftMetrics(program).workingSets).toBe(2)

    exercise.weekOverrides = [
      { startWeek: 1, endWeek: 3, sets: 2 },
      { startWeek: 3, endWeek: 4, reps: '6-8' },
    ]
    expect(validateProgramDraft(draft)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'workouts.0.exercises.0.weekOverrides.1.startWeek',
          message: 'Week range overlaps change 1.',
        }),
      ]),
    )
  })

  it('copies a program without sharing program, workout, exercise, or pair ids', () => {
    const copied = createProgramCopy(chestSpecializationProgram)
    const originalWorkoutIds = new Set(
      chestSpecializationProgram.workouts.map((workout) => workout.id),
    )
    const originalExerciseIds = new Set(
      chestSpecializationProgram.workouts.flatMap((workout) =>
        workout.exercises.map((exercise) => exercise.id),
      ),
    )
    const copiedPair = copied.workouts[0].exercises.filter(
      (exercise) => exercise.pair?.label === 'A' || exercise.pair?.label === 'B',
    ).slice(0, 2)

    expect(copied.id).not.toBe(chestSpecializationProgram.id)
    expect(copied.name).toBe('Chest Specialization Block Copy')
    expect(copied.status).toBe('custom')
    expect(copied.seedRevision).toBeUndefined()
    expect(copied.workouts.every((workout) => !originalWorkoutIds.has(workout.id))).toBe(true)
    expect(
      copied.workouts.every((workout) =>
        workout.exercises.every((exercise) => !originalExerciseIds.has(exercise.id)),
      ),
    ).toBe(true)
    expect(copiedPair[0].pair?.group).toBe(copiedPair[1].pair?.group)
    expect(copiedPair[0].pair?.group).not.toBe(
      chestSpecializationProgram.workouts[0].exercises[3].pair?.group,
    )
  })

  it('duplicates and reorders workouts without mutating the source list', () => {
    const source = chestSpecializationProgram.workouts.slice(0, 2)
    const duplicated = duplicateWorkout(source[0], 2)
    const reordered = moveItem(source, 0, 1)

    expect(duplicated.id).not.toBe(source[0].id)
    expect(duplicated.shortTitle).toBe('Upper Heavy Copy')
    expect(duplicated.exercises[0].id).not.toBe(source[0].exercises[0].id)
    expect(reordered.map((workout) => workout.id)).toEqual([source[1].id, source[0].id])
    expect(source[0].id).toBe('day-1-upper-heavy-chest')
  })
})
