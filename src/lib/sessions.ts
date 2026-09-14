import type { TrainingProgram, WorkoutTemplate } from '../types/program'
import type { ExerciseLog, SetLog, WorkoutSession } from '../types/session'
import { getProgramCurrentWeek } from './programMetrics'

function makeId(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `${prefix}-${id}`
}

export function createWorkoutSession(
  program: TrainingProgram,
  workout: WorkoutTemplate,
  sessions: WorkoutSession[],
  programVersion = 1,
): WorkoutSession {
  const now = new Date().toISOString()
  const completedCount = sessions.filter(
    (session) => session.programId === program.id && session.status === 'completed',
  ).length
  const weekNumber = getProgramCurrentWeek(program, completedCount)

  return {
    id: makeId('session'),
    programId: program.id,
    workoutTemplateId: workout.id,
    workoutTitle: workout.title,
    workoutDayNumber: workout.dayNumber,
    programVersion,
    weekNumber,
    status: 'active',
    startedAt: now,
    updatedAt: now,
    sessionNotes: '',
    exercises: workout.exercises.map((exercise) => ({
      id: makeId('exercise'),
      templateExerciseId: exercise.id,
      originalName: exercise.name,
      performedName: exercise.name,
      kind: exercise.kind,
      prescribedSets: exercise.sets,
      repTarget: exercise.reps,
      targetRir: exercise.targetRir,
      rest: exercise.rest,
      prescriptionNotes: exercise.notes,
      sessionNotes: '',
      sets: Array.from({ length: exercise.sets }, (_, index) =>
        createEmptySet(index + 1),
      ),
    })),
  }
}

export function createEmptySet(number: number): SetLog {
  return {
    id: makeId('set'),
    number,
    weightKg: null,
    reps: null,
    rir: null,
    completed: false,
  }
}

export function getCompletedSessions(sessions: WorkoutSession[]): WorkoutSession[] {
  return sessions
    .filter((session) => session.status === 'completed')
    .sort((a, b) => getSessionTime(b) - getSessionTime(a))
}

export function getActiveSession(sessions: WorkoutSession[]): WorkoutSession | undefined {
  return sessions
    .filter((session) => session.status === 'active')
    .sort((a, b) => getSessionTime(b) - getSessionTime(a))[0]
}

export function getLatestCompletedSession(
  sessions: WorkoutSession[],
  workoutTemplateId: string,
): WorkoutSession | undefined {
  return getCompletedSessions(sessions).find(
    (session) => session.workoutTemplateId === workoutTemplateId,
  )
}

export function getLatestExercisePerformance(
  sessions: WorkoutSession[],
  currentSession: WorkoutSession,
  currentExercise: ExerciseLog,
): { session: WorkoutSession; exercise: ExerciseLog } | undefined {
  const completedSessions = getCompletedSessions(sessions).filter(
    (session) => session.programId === currentSession.programId,
  )
  const currentName = normalizeExerciseName(currentExercise.performedName)

  for (const session of completedSessions) {
    const exercise = session.exercises.find(
      (entry) =>
        entry.sets.some((set) => set.completed) &&
        (normalizeExerciseName(entry.performedName) === currentName ||
          normalizeExerciseName(entry.originalName) === currentName),
    )
    if (exercise) {
      return { session, exercise }
    }
  }

  for (const session of completedSessions) {
    const exercise = session.exercises.find(
      (entry) =>
        entry.templateExerciseId === currentExercise.templateExerciseId &&
        entry.sets.some((set) => set.completed),
    )
    if (exercise) {
      return { session, exercise }
    }
  }

  return undefined
}

export function getNextWorkout(
  program: TrainingProgram,
  sessions: WorkoutSession[],
): WorkoutTemplate {
  const latestSession = getCompletedSessions(sessions).find(
    (session) => session.programId === program.id,
  )

  if (!latestSession) {
    return program.workouts[0]
  }

  const latestIndex = program.workouts.findIndex(
    (workout) => workout.id === latestSession.workoutTemplateId,
  )

  return program.workouts[(latestIndex + 1 + program.workouts.length) % program.workouts.length]
}

export function getProgramSessionCount(
  programId: string,
  sessions: WorkoutSession[],
): number {
  return sessions.filter(
    (session) => session.programId === programId && session.status === 'completed',
  ).length
}

export function getSessionSetProgress(session: WorkoutSession): {
  completed: number
  total: number
} {
  const sets = session.exercises.flatMap((exercise) => exercise.sets)
  return {
    completed: sets.filter((set) => set.completed).length,
    total: sets.length,
  }
}

export function getSessionVolume(session: WorkoutSession): number {
  return session.exercises.reduce(
    (sessionTotal, exercise) =>
      sessionTotal +
      exercise.sets.reduce((exerciseTotal, set) => {
        if (!set.completed || set.weightKg === null || set.reps === null) {
          return exerciseTotal
        }

        return exerciseTotal + set.weightKg * set.reps
      }, 0),
    0,
  )
}

export function copyPreviousSets(
  exercise: ExerciseLog,
  previousExercise: ExerciseLog,
): ExerciseLog {
  return {
    ...exercise,
    sets: exercise.sets.map((set, index) => {
      const previousSet = previousExercise.sets[index]
      if (!previousSet) {
        return set
      }

      return {
        ...set,
        weightKg: previousSet.weightKg,
        reps: previousSet.reps,
        rir: previousSet.rir,
      }
    }),
  }
}

function getSessionTime(session: WorkoutSession): number {
  return new Date(session.completedAt ?? session.updatedAt ?? session.startedAt).getTime()
}

function normalizeExerciseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}
