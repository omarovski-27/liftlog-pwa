import type { ExerciseKind } from './program'

export interface SetLog {
  id: string
  number: number
  weightKg: number | null
  reps: number | null
  rir: number | null
  completed: boolean
}

export interface ExerciseLog {
  id: string
  templateExerciseId: string
  originalName: string
  performedName: string
  kind: ExerciseKind
  prescribedSets: number
  repTarget: string
  targetRir?: string
  rest: string
  prescriptionNotes?: string
  sessionNotes: string
  sets: SetLog[]
}

export interface WorkoutSession {
  id: string
  programId: string
  workoutTemplateId: string
  workoutTitle: string
  workoutDayNumber: number
  programVersion: number
  weekNumber: number
  status: 'active' | 'completed'
  startedAt: string
  updatedAt: string
  completedAt?: string
  sessionNotes: string
  exercises: ExerciseLog[]
}

export interface ExerciseAlternative {
  id: string
  programId: string
  templateExerciseId: string
  name: string
  createdAt: string
  lastUsedAt: string
  timesUsed: number
}
