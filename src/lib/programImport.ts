import type {
  ExerciseKind,
  ExerciseMetric,
  ExerciseWeekOverride,
  MuscleGroup,
  PairLabel,
  TrainingProgram,
} from '../types/program'
import {
  MUSCLE_GROUPS,
  WEEKDAYS,
  createEmptyExercise,
  createEmptyProgram,
  createEmptyWorkout,
  finalizeProgramDraft,
  validateProgramDraft,
} from './programBuilder'
import { getExerciseMetric } from './setMetrics'

export const PROGRAM_IMPORT_FORMAT = 'liftlog-program'
export const PROGRAM_IMPORT_SCHEMA_VERSION = 1
export const MAX_PROGRAM_IMPORT_BYTES = 2 * 1024 * 1024

export interface LiftLogProgramFile {
  format: typeof PROGRAM_IMPORT_FORMAT
  schemaVersion: typeof PROGRAM_IMPORT_SCHEMA_VERSION
  name: string
  durationWeeks: number
  startingWeek: number
  fullRestDay: string
  progression: string[]
  constraints: string[]
  stopTriggers: string[]
  workouts: Array<{
    name: string
    day: string
    focus?: string
    notes?: string
    exercises: Array<{
      name: string
      sets: number
      reps: string
      metric?: ExerciseMetric
      rir?: string
      rest: string
      type: ExerciseKind
      muscles: MuscleGroup[]
      section?: string
      notes?: string
      weekOverrides?: Array<{
        startWeek: number
        endWeek: number
        sets?: number
        reps?: string
      }>
      pair?: {
        group: string
        position: PairLabel
      }
    }>
  }>
}

export class ProgramImportError extends Error {
  issues: string[]

  constructor(issues: string[]) {
    super(issues[0] ?? 'The program file is invalid.')
    this.name = 'ProgramImportError'
    this.issues = issues
  }
}

export function parseProgramImport(raw: string): TrainingProgram {
  if (new TextEncoder().encode(raw).byteLength > MAX_PROGRAM_IMPORT_BYTES) throw new ProgramImportError(['Program files must be 2 MB or smaller.'])
  const value = parseJson(raw)
  if (!isRecord(value)) {
    throw new ProgramImportError(['The program JSON must contain one object.'])
  }

  const issues: string[] = []
  if (value.format !== PROGRAM_IMPORT_FORMAT) {
    issues.push(`Format must be "${PROGRAM_IMPORT_FORMAT}".`)
  }
  if (value.schemaVersion !== PROGRAM_IMPORT_SCHEMA_VERSION) {
    issues.push(`Schema version must be ${PROGRAM_IMPORT_SCHEMA_VERSION}.`)
  }

  const name = requiredString(value.name, 'Program name', issues)
  const durationWeeks = integerInRange(
    value.durationWeeks,
    'Duration weeks',
    1,
    104,
    issues,
  )
  const startingWeek = integerInRange(
    value.startingWeek ?? 1,
    'Starting week',
    1,
    Math.max(1, durationWeeks),
    issues,
  )
  const fullRestDay = normalizeDay(
    value.fullRestDay ?? 'None',
    'Full rest day',
    issues,
    true,
  )
  const progressionRules = lineList(value.progression, 'Progression', issues)
  const constraints = lineList(value.constraints, 'Constraints', issues)
  const stopTriggers = lineList(value.stopTriggers, 'Stop triggers', issues)

  const workoutValues = arrayValue(value.workouts, 'Workouts', issues)
  if (workoutValues.length === 0) issues.push('Add at least one workout.')
  if (workoutValues.length > 14) issues.push('A program can contain up to 14 workouts.')

  const workouts = workoutValues.map((entry, workoutIndex) => {
    const path = `Workout ${workoutIndex + 1}`
    const workout = createEmptyWorkout(workoutIndex)
    if (!isRecord(entry)) {
      issues.push(`${path} must be an object.`)
      return workout
    }

    workout.shortTitle = requiredString(entry.name, `${path} name`, issues)
    workout.scheduledDay = normalizeDay(
      entry.day ?? WEEKDAYS[workoutIndex % WEEKDAYS.length],
      `${path} day`,
      issues,
    )
    workout.emphasis = optionalString(entry.focus, `${path} focus`, issues) ?? ''
    workout.sourceSummary = optionalString(entry.notes, `${path} notes`, issues) ?? ''

    const exerciseValues = arrayValue(entry.exercises, `${path} exercises`, issues)
    if (exerciseValues.length === 0) issues.push(`${path} needs at least one exercise.`)
    workout.exercises = exerciseValues.map((exerciseEntry, exerciseIndex) => {
      const exercisePath = `${path}, exercise ${exerciseIndex + 1}`
      const exercise = createEmptyExercise()
      if (!isRecord(exerciseEntry)) {
        issues.push(`${exercisePath} must be an object.`)
        return exercise
      }

      const kind = normalizeExerciseKind(exerciseEntry.type, exercisePath, issues)
      exercise.name = requiredString(exerciseEntry.name, `${exercisePath} name`, issues)
      exercise.sets = integerInRange(
        exerciseEntry.sets,
        `${exercisePath} sets`,
        1,
        99,
        issues,
      )
      exercise.reps = targetString(exerciseEntry.reps, `${exercisePath} reps`, issues)
      if (exerciseEntry.metric !== undefined) {
        if (exerciseEntry.metric === 'reps' || exerciseEntry.metric === 'seconds' || exerciseEntry.metric === 'meters') {
          exercise.metric = exerciseEntry.metric
        } else {
          issues.push(`${exercisePath} metric must be reps, seconds, or meters.`)
        }
      }
      exercise.targetRir = optionalTargetString(
        exerciseEntry.rir,
        `${exercisePath} RIR`,
        issues,
      )
      exercise.rest = optionalString(exerciseEntry.rest, `${exercisePath} rest`, issues)
        ?? '2 min'
      exercise.kind = kind
      exercise.muscleGroups = normalizeMuscles(
        exerciseEntry.muscles,
        exercisePath,
        issues,
      )
      exercise.section = optionalString(
        exerciseEntry.section,
        `${exercisePath} section`,
        issues,
      ) ?? defaultSection(kind)
      exercise.notes = optionalString(exerciseEntry.notes, `${exercisePath} notes`, issues)
      exercise.weekOverrides = normalizeWeekOverrides(
        exerciseEntry.weekOverrides,
        exercisePath,
        durationWeeks,
        issues,
      )
      exercise.pair = normalizePair(exerciseEntry.pair, exercisePath, issues)
      return exercise
    })

    return workout
  })

  if (issues.length > 0) throw new ProgramImportError(issues)

  const program = createEmptyProgram()
  const draft = {
    ...program,
    name,
    source: 'Imported from LiftLog JSON',
    durationWeeks,
    currentWeek: startingWeek,
    fullRestDay,
    progressionRules,
    constraints,
    stopTriggers,
    workouts,
  }
  const draftIssues = validateProgramDraft(draft)
  if (draftIssues.length > 0) throw new ProgramImportError(draftIssues.map((issue) => issue.message))
  return finalizeProgramDraft(draft)
}

export function createProgramFile(program: TrainingProgram): LiftLogProgramFile {
  return {
    format: PROGRAM_IMPORT_FORMAT,
    schemaVersion: PROGRAM_IMPORT_SCHEMA_VERSION,
    name: program.name,
    durationWeeks: program.durationWeeks,
    startingWeek: program.currentWeek,
    fullRestDay: program.fullRestDay,
    progression: program.progressionRules,
    constraints: program.constraints,
    stopTriggers: program.stopTriggers,
    workouts: program.workouts.map((workout) => {
      const pairNames = new Map<string, string>()
      return {
        name: workout.shortTitle,
        day: workout.scheduledDay,
        focus: workout.emphasis || undefined,
        notes: workout.sourceSummary || undefined,
        exercises: workout.exercises.map((exercise) => {
          let pair: LiftLogProgramFile['workouts'][number]['exercises'][number]['pair']
          if (exercise.pair) {
            const group = pairNames.get(exercise.pair.group) ?? `Pair ${pairNames.size + 1}`
            pairNames.set(exercise.pair.group, group)
            pair = { group, position: exercise.pair.label }
          }
          return {
            name: exercise.name,
            sets: exercise.sets,
            reps: exercise.reps,
            metric: getExerciseMetric(exercise),
            rir: exercise.targetRir,
            rest: exercise.rest,
            type: exercise.kind,
            muscles: exercise.muscleGroups,
            section: exercise.section || undefined,
            notes: exercise.notes,
            weekOverrides: exercise.weekOverrides?.map((override) => ({ ...override })),
            pair,
          }
        }),
      }
    }),
  }
}

export function serializeProgramFile(program: TrainingProgram): string {
  return `${JSON.stringify(createProgramFile(program), null, 2)}\n`
}

export function getAiProgramPrompt(): string {
  const example: LiftLogProgramFile = {
    format: PROGRAM_IMPORT_FORMAT,
    schemaVersion: PROGRAM_IMPORT_SCHEMA_VERSION,
    name: 'My Strength Block',
    durationWeeks: 8,
    startingWeek: 1,
    fullRestDay: 'Sunday',
    progression: ['Add weight after all sets reach the top of the rep range.'],
    constraints: [],
    stopTriggers: [],
    workouts: [
      {
        name: 'Upper A',
        day: 'Monday',
        focus: 'Heavy upper body',
        exercises: [
          {
            name: 'Bench press',
            sets: 4,
            reps: '6-10',
            rir: '2',
            rest: '3 min',
            type: 'working',
            muscles: ['chest', 'triceps'],
            section: 'Main work',
            weekOverrides: [{ startWeek: 1, endWeek: 2, sets: 3 }],
          },
        ],
      },
    ],
  }
  const muscles = MUSCLE_GROUPS.map((group) => group.value).join(', ')

  return [
    'Convert the lifting program I provide into LiftLog JSON.',
    'Return only valid JSON with no commentary or markdown fences.',
    `Use only these muscle values: ${muscles}.`,
    'Exercise type must be working, warm-up, or prehab.',
    'Exercise metric must be reps, seconds, or meters. Keep the target in reps (for example "30-45 sec") and use the matching metric for timed or distance exercises.',
    'For week-specific sets or reps, add weekOverrides with startWeek, endWeek, and the fields that change.',
    'For supersets, add pair: {"group":"Pair 1","position":"A"} to both exercises and use position B on the second exercise.',
    'Follow this exact shape:',
    JSON.stringify(example, null, 2),
  ].join('\n')
}

function parseJson(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) throw new ProgramImportError(['Paste or choose a program JSON file.'])
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  try {
    return JSON.parse(fenced?.[1]?.trim() ?? trimmed) as unknown
  } catch {
    throw new ProgramImportError([
      'The JSON could not be read. Check its quotation marks, commas, and brackets.',
    ])
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, label: string, issues: string[]): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  issues.push(`${label} is required.`)
  return ''
}

function optionalString(
  value: unknown,
  label: string,
  issues: string[],
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'string') return value.trim() || undefined
  issues.push(`${label} must be text.`)
  return undefined
}

function targetString(value: unknown, label: string, issues: string[]): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return requiredString(value, label, issues)
}

function optionalTargetString(
  value: unknown,
  label: string,
  issues: string[],
): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return optionalString(value, label, issues)
}

function integerInRange(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  issues: string[],
): number {
  const number = typeof value === 'string' && /^\d+$/.test(value.trim())
    ? Number(value)
    : value
  if (Number.isInteger(number) && (number as number) >= minimum && (number as number) <= maximum) {
    return number as number
  }
  issues.push(`${label} must be a whole number from ${minimum} to ${maximum}.`)
  return minimum
}

function arrayValue(value: unknown, label: string, issues: string[]): unknown[] {
  if (Array.isArray(value)) return value
  issues.push(`${label} must be a list.`)
  return []
}

function lineList(value: unknown, label: string, issues: string[]): string[] {
  if (value === undefined || value === null || value === '') return []
  if (typeof value === 'string') {
    return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value.map((item) => item.trim()).filter(Boolean)
  }
  issues.push(`${label} must be a list of text lines.`)
  return []
}

function normalizeDay(
  value: unknown,
  label: string,
  issues: string[],
  allowNone = false,
): string {
  if (allowNone && (value === null || normalizeKey(value) === 'none')) return 'None'
  const key = normalizeKey(value)
  const aliases = new Map<string, string>([
    ['mon', 'Monday'],
    ['tue', 'Tuesday'],
    ['tues', 'Tuesday'],
    ['wed', 'Wednesday'],
    ['thu', 'Thursday'],
    ['thur', 'Thursday'],
    ['thurs', 'Thursday'],
    ['fri', 'Friday'],
    ['sat', 'Saturday'],
    ['sun', 'Sunday'],
    ...WEEKDAYS.map((day) => [day.toLocaleLowerCase(), day] as [string, string]),
  ])
  const day = aliases.get(key)
  if (day) return day
  issues.push(`${label} must be a weekday${allowNone ? ' or None' : ''}.`)
  return allowNone ? 'None' : 'Monday'
}

function normalizeExerciseKind(
  value: unknown,
  path: string,
  issues: string[],
): ExerciseKind {
  if (value === undefined || value === null || value === '') return 'working'
  const key = normalizeKey(value).replace(/\s+/g, '-')
  if (key === 'working' || key === 'work') return 'working'
  if (key === 'warm-up' || key === 'warmup') return 'warm-up'
  if (key === 'prehab' || key === 'rehab') return 'prehab'
  issues.push(`${path} type must be working, warm-up, or prehab.`)
  return 'working'
}

function normalizeMuscles(value: unknown, path: string, issues: string[]): MuscleGroup[] {
  if (!Array.isArray(value)) {
    issues.push(`${path} muscles must be a list.`)
    return []
  }

  const aliases: Record<string, MuscleGroup> = {
    abs: 'core',
    abdominals: 'core',
    back: 'back',
    bicep: 'biceps',
    biceps: 'biceps',
    calf: 'calves',
    calves: 'calves',
    chest: 'chest',
    core: 'core',
    delts: 'shoulders',
    forearm: 'forearms',
    forearms: 'forearms',
    glute: 'glutes',
    glutes: 'glutes',
    grip: 'grip',
    hamstring: 'hamstrings',
    hamstrings: 'hamstrings',
    hams: 'hamstrings',
    lats: 'back',
    pecs: 'chest',
    prehab: 'prehab',
    quad: 'quads',
    quadriceps: 'quads',
    quads: 'quads',
    rehab: 'prehab',
    shoulders: 'shoulders',
    'side-delts': 'side-delts',
    traps: 'traps',
    tricep: 'triceps',
    triceps: 'triceps',
    'anterior delts': 'shoulders',
    'front delts': 'shoulders',
    'lateral delts': 'side-delts',
    'posterior delts': 'rear-delts',
    'rear-delts': 'rear-delts',
    'rear delts': 'rear-delts',
    'rotator cuff': 'prehab',
    'side delts': 'side-delts',
    'upper back': 'back',
  }
  const muscles: MuscleGroup[] = []
  value.forEach((item) => {
    const muscle = aliases[normalizeKey(item)]
    if (!muscle) {
      issues.push(`${path} has an unknown muscle value: ${String(item)}.`)
    } else if (!muscles.includes(muscle)) {
      muscles.push(muscle)
    }
  })
  if (muscles.length === 0 && value.length === 0) {
    issues.push(`${path} needs at least one muscle.`)
  }
  return muscles
}

function normalizePair(
  value: unknown,
  path: string,
  issues: string[],
): { group: string; label: PairLabel } | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) {
    issues.push(`${path} pair must contain a group and position.`)
    return undefined
  }
  const group = requiredString(value.group, `${path} pair group`, issues)
  const position = typeof value.position === 'string'
    ? value.position.trim().toLocaleUpperCase()
    : ''
  if (position !== 'A' && position !== 'B') {
    issues.push(`${path} pair position must be A or B.`)
    return group ? { group, label: 'A' } : undefined
  }
  return group ? { group, label: position } : undefined
}

function normalizeWeekOverrides(
  value: unknown,
  path: string,
  durationWeeks: number,
  issues: string[],
): ExerciseWeekOverride[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) {
    issues.push(`${path} weekOverrides must be a list.`)
    return undefined
  }
  if (value.length > 24) {
    issues.push(`${path} weekOverrides can contain no more than 24 changes.`)
  }

  const overrides = value.slice(0, 24).map((entry, index) => {
    const overridePath = `${path}, week change ${index + 1}`
    if (!isRecord(entry)) {
      issues.push(`${overridePath} must be an object.`)
      return { startWeek: 1, endWeek: 1 }
    }

    const startWeek = integerInRange(
      entry.startWeek,
      `${overridePath} startWeek`,
      1,
      Math.max(1, durationWeeks),
      issues,
    )
    const endWeek = integerInRange(
      entry.endWeek,
      `${overridePath} endWeek`,
      1,
      Math.max(1, durationWeeks),
      issues,
    )
    if (endWeek < startWeek) {
      issues.push(`${overridePath} endWeek must be on or after startWeek.`)
    }
    const sets = entry.sets === undefined || entry.sets === null || entry.sets === ''
      ? undefined
      : integerInRange(entry.sets, `${overridePath} sets`, 1, 99, issues)
    const reps = optionalTargetString(entry.reps, `${overridePath} reps`, issues)
    if (sets === undefined && reps === undefined) {
      issues.push(`${overridePath} must change sets or reps.`)
    }

    return { startWeek, endWeek, sets, reps }
  })

  overrides.forEach((override, index) => {
    const overlappingIndex = overrides.findIndex(
      (other, otherIndex) =>
        otherIndex < index &&
        override.startWeek <= other.endWeek &&
        override.endWeek >= other.startWeek,
    )
    if (overlappingIndex >= 0) {
      issues.push(
        `${path}, week change ${index + 1} overlaps week change ${overlappingIndex + 1}.`,
      )
    }
  })

  return overrides.length ? overrides : undefined
}

function defaultSection(kind: ExerciseKind): string {
  if (kind === 'warm-up') return 'Warm-up'
  if (kind === 'prehab') return 'Prehab'
  return 'Main work'
}

function normalizeKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase() : ''
}
