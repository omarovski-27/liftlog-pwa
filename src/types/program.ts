export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'biceps'
  | 'triceps'
  | 'shoulders'
  | 'side-delts'
  | 'rear-delts'
  | 'traps'
  | 'forearms'
  | 'prehab'
  | 'grip'

export type ExerciseKind = 'warm-up' | 'working' | 'prehab'

export type ProgramStatus = 'seed' | 'custom'

export type PairLabel = 'A' | 'B'

export interface ProgramPhase {
  id: string
  name: string
  weeks: string
  nutrition: string
  chestSets: string
  focus: string
}

export interface ChestVolumeRamp {
  weeks: string
  setsPerWeek: number
  label: string
  note: string
}

export interface ExerciseTemplate {
  id: string
  name: string
  kind: ExerciseKind
  muscleGroups: MuscleGroup[]
  sets: number
  reps: string
  targetRir?: string
  rest: string
  notes?: string
  section: string
  pair?: {
    group: string
    label: PairLabel
  }
}

export interface WorkoutTemplate {
  id: string
  dayNumber: number
  title: string
  shortTitle: string
  scheduledDay: string
  emphasis: string
  sourceSummary: string
  exercises: ExerciseTemplate[]
}

export interface TrainingProgram {
  id: string
  name: string
  source: string
  durationWeeks: number
  liftingDaysPerWeek: number
  wrestlingDaysPerWeek: string
  fullRestDay: string
  status: ProgramStatus
  currentWeek: number
  startedAt?: string
  phases: ProgramPhase[]
  chestVolumeRamp: ChestVolumeRamp[]
  weeklyLayout: string[]
  restIntervals: Record<string, string>
  progressionRules: string[]
  constraints: string[]
  stopTriggers: string[]
  workouts: WorkoutTemplate[]
}
