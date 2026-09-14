import type {
  ExerciseKind,
  ExerciseTemplate,
  MuscleGroup,
  TrainingProgram,
  WorkoutTemplate,
} from '../types/program'
import { getWeeklyExerciseSlots, getWeeklyWorkingSets } from './programMetrics'

export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

export const MUSCLE_GROUPS: Array<{ label: string; value: MuscleGroup }> = [
  { label: 'Chest', value: 'chest' },
  { label: 'Back', value: 'back' },
  { label: 'Quads', value: 'quads' },
  { label: 'Hamstrings', value: 'hamstrings' },
  { label: 'Glutes', value: 'glutes' },
  { label: 'Calves', value: 'calves' },
  { label: 'Core', value: 'core' },
  { label: 'Biceps', value: 'biceps' },
  { label: 'Triceps', value: 'triceps' },
  { label: 'Shoulders', value: 'shoulders' },
  { label: 'Side delts', value: 'side-delts' },
  { label: 'Rear delts', value: 'rear-delts' },
  { label: 'Traps', value: 'traps' },
  { label: 'Forearms', value: 'forearms' },
  { label: 'Grip', value: 'grip' },
  { label: 'Prehab', value: 'prehab' },
]

export const EXERCISE_KINDS: Array<{ label: string; value: ExerciseKind }> = [
  { label: 'Working', value: 'working' },
  { label: 'Warm-up', value: 'warm-up' },
  { label: 'Prehab', value: 'prehab' },
]

export interface ProgramValidationIssue {
  path: string
  message: string
}

export interface ProgramDraftMetrics {
  workouts: number
  exercises: number
  workingSets: number
}

export class ProgramDraftError extends Error {
  issues: ProgramValidationIssue[]

  constructor(issues: ProgramValidationIssue[]) {
    super('The program has invalid or missing fields.')
    this.name = 'ProgramDraftError'
    this.issues = issues
  }
}

export function createEmptyProgram(): TrainingProgram {
  const workout = createEmptyWorkout(0)
  return {
    id: makeId('program'),
    name: '',
    source: 'Built in LiftLog',
    durationWeeks: 8,
    liftingDaysPerWeek: 1,
    wrestlingDaysPerWeek: '0',
    fullRestDay: 'Sunday',
    status: 'custom',
    currentWeek: 1,
    startedAt: new Date().toISOString(),
    phases: [],
    chestVolumeRamp: [],
    weeklyLayout: [],
    restIntervals: {},
    progressionRules: [],
    constraints: [],
    stopTriggers: [],
    workouts: [workout],
  }
}

export function cloneProgramForEdit(program: TrainingProgram): TrainingProgram {
  return clone(program)
}

export function createProgramCopy(program: TrainingProgram): TrainingProgram {
  const copied = clone(program)
  return {
    ...copied,
    id: makeId('program'),
    name: `${program.name} Copy`,
    source: `Duplicated from ${program.name}`,
    status: 'custom',
    currentWeek: 1,
    startedAt: new Date().toISOString(),
    phases: copied.phases.map((phase) => ({ ...phase, id: makeId('phase') })),
    workouts: copied.workouts.map((workout, index) =>
      copyWorkout(workout, index + 1),
    ),
  }
}

export function createEmptyWorkout(index: number): WorkoutTemplate {
  const shortTitle = `Workout ${index + 1}`
  return {
    id: makeId('workout'),
    dayNumber: index + 1,
    title: `Day ${index + 1} - ${shortTitle}`,
    shortTitle,
    scheduledDay: WEEKDAYS[index % WEEKDAYS.length],
    emphasis: '',
    sourceSummary: '',
    exercises: [createEmptyExercise()],
  }
}

export function createEmptyExercise(): ExerciseTemplate {
  return {
    id: makeId('exercise'),
    name: '',
    kind: 'working',
    muscleGroups: [],
    sets: 3,
    reps: '8-12',
    targetRir: '2',
    rest: '2 min',
    section: 'Main work',
  }
}

export function duplicateWorkout(
  workout: WorkoutTemplate,
  dayNumber: number,
): WorkoutTemplate {
  return copyWorkout(
    { ...workout, shortTitle: `${workout.shortTitle} Copy` },
    dayNumber,
  )
}

export function duplicateExercise(exercise: ExerciseTemplate): ExerciseTemplate {
  return {
    ...clone(exercise),
    id: makeId('exercise'),
    name: exercise.name ? `${exercise.name} Copy` : '',
  }
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items
  }

  const moved = items.slice()
  const [item] = moved.splice(from, 1)
  moved.splice(to, 0, item)
  return moved
}

export function getProgramDraftMetrics(program: TrainingProgram): ProgramDraftMetrics {
  return {
    workouts: program.workouts.length,
    exercises: getWeeklyExerciseSlots(program),
    workingSets: getWeeklyWorkingSets(program),
  }
}

export function validateProgramDraft(program: TrainingProgram): ProgramValidationIssue[] {
  const issues: ProgramValidationIssue[] = []
  if (!program.name.trim()) {
    issues.push({ path: 'name', message: 'Enter a program name.' })
  }
  if (!Number.isInteger(program.durationWeeks) || program.durationWeeks < 1) {
    issues.push({ path: 'durationWeeks', message: 'Duration must be at least 1 week.' })
  }
  if (program.durationWeeks > 104) {
    issues.push({ path: 'durationWeeks', message: 'Duration cannot exceed 104 weeks.' })
  }
  if (
    !Number.isInteger(program.currentWeek) ||
    program.currentWeek < 1 ||
    program.currentWeek > Math.max(1, program.durationWeeks)
  ) {
    issues.push({
      path: 'currentWeek',
      message: 'Starting week must fall within the program duration.',
    })
  }
  if (program.workouts.length === 0) {
    issues.push({ path: 'workouts', message: 'Add at least one workout.' })
  }
  if (program.workouts.length > 14) {
    issues.push({ path: 'workouts', message: 'A program can contain up to 14 workouts.' })
  }

  program.workouts.forEach((workout, workoutIndex) => {
    const workoutPath = `workouts.${workoutIndex}`
    if (!workout.shortTitle.trim()) {
      issues.push({ path: `${workoutPath}.shortTitle`, message: 'Enter a workout name.' })
    }
    if (!workout.scheduledDay.trim()) {
      issues.push({ path: `${workoutPath}.scheduledDay`, message: 'Choose a training day.' })
    }
    if (workout.exercises.length === 0) {
      issues.push({
        path: `${workoutPath}.exercises`,
        message: 'Add at least one exercise.',
      })
    }

    workout.exercises.forEach((exercise, exerciseIndex) => {
      const exercisePath = `${workoutPath}.exercises.${exerciseIndex}`
      if (!exercise.name.trim()) {
        issues.push({ path: `${exercisePath}.name`, message: 'Enter an exercise name.' })
      }
      if (!Number.isInteger(exercise.sets) || exercise.sets < 1 || exercise.sets > 99) {
        issues.push({
          path: `${exercisePath}.sets`,
          message: 'Sets must be a whole number from 1 to 99.',
        })
      }
      if (!exercise.reps.trim()) {
        issues.push({ path: `${exercisePath}.reps`, message: 'Enter a rep target.' })
      }
      if (!exercise.rest.trim()) {
        issues.push({ path: `${exercisePath}.rest`, message: 'Enter a rest interval.' })
      }
      if (exercise.muscleGroups.length === 0) {
        issues.push({
          path: `${exercisePath}.muscleGroups`,
          message: 'Choose at least one muscle group.',
        })
      }
      if (exercise.pair && !exercise.pair.group.trim()) {
        issues.push({
          path: `${exercisePath}.pair.group`,
          message: 'Enter a paired-set group.',
        })
      }
    })
  })

  return issues
}

export function finalizeProgramDraft(program: TrainingProgram): TrainingProgram {
  const issues = validateProgramDraft(program)
  if (issues.length > 0) throw new ProgramDraftError(issues)

  const workouts = program.workouts.map((workout, workoutIndex) => {
    const shortTitle = workout.shortTitle.trim()
    return {
      ...workout,
      dayNumber: workoutIndex + 1,
      title: `Day ${workoutIndex + 1} - ${shortTitle}`,
      shortTitle,
      scheduledDay: workout.scheduledDay.trim(),
      emphasis: workout.emphasis.trim(),
      sourceSummary: workout.sourceSummary.trim(),
      exercises: workout.exercises.map((exercise) => ({
        ...exercise,
        name: exercise.name.trim(),
        reps: exercise.reps.trim(),
        targetRir: cleanOptional(exercise.targetRir),
        rest: exercise.rest.trim(),
        notes: cleanOptional(exercise.notes),
        section: exercise.section.trim() || 'Main work',
        pair: exercise.pair
          ? { group: exercise.pair.group.trim(), label: exercise.pair.label }
          : undefined,
      })),
    }
  })

  return {
    ...clone(program),
    name: program.name.trim(),
    status: 'custom',
    liftingDaysPerWeek: workouts.length,
    workouts,
    weeklyLayout: buildWeeklyLayout(workouts, program.fullRestDay),
    progressionRules: cleanLines(program.progressionRules),
    constraints: cleanLines(program.constraints),
    stopTriggers: cleanLines(program.stopTriggers),
  }
}

function copyWorkout(
  workout: WorkoutTemplate,
  dayNumber: number,
): WorkoutTemplate {
  const pairGroups = new Map<string, string>()
  const shortTitle = workout.shortTitle
  return {
    ...clone(workout),
    id: makeId('workout'),
    dayNumber,
    title: `Day ${dayNumber} - ${shortTitle}`,
    shortTitle,
    exercises: workout.exercises.map((exercise) => {
      let pair = exercise.pair
      if (pair) {
        const group = pairGroups.get(pair.group) ?? makeId('pair')
        pairGroups.set(pair.group, group)
        pair = { ...pair, group }
      }
      return {
        ...clone(exercise),
        id: makeId('exercise'),
        pair,
      }
    }),
  }
}

function buildWeeklyLayout(workouts: WorkoutTemplate[], fullRestDay: string): string[] {
  const rows = workouts.map(
    (workout) =>
      `${workout.scheduledDay} - Day ${workout.dayNumber} ${workout.shortTitle}`,
  )
  if (
    fullRestDay &&
    fullRestDay !== 'None' &&
    !workouts.some((workout) => workout.scheduledDay === fullRestDay)
  ) {
    rows.push(`${fullRestDay} - Complete rest`)
  }
  return rows
}

function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.trim()
  return cleaned ? cleaned : undefined
}

function cleanLines(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean)
}

function makeId(prefix: string): string {
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `${prefix}-${value}`
}

function clone<T>(value: T): T {
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T)
}
