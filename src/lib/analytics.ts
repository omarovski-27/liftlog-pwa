import type { TrainingProgram } from '../types/program'
import type { SetLog, WorkoutSession } from '../types/session'
import { getProgramCurrentWeek } from './programMetrics'

export interface ExercisePerformancePoint {
  id: string
  sessionId: string
  date: string
  weekNumber: number
  workoutTitle: string
  topSet: SetLog
  completedSets: number
  totalReps: number
  volumeKg: number
  estimatedOneRepMaxKg: number | null
}

export interface ExerciseTrend {
  key: string
  name: string
  points: ExercisePerformancePoint[]
  latest: ExercisePerformancePoint
  previous?: ExercisePerformancePoint
  bestEstimatedOneRepMaxKg: number | null
  bestVolumeKg: number
  bestTotalReps: number
}

export interface TrainingSummary {
  workouts: number
  completedSets: number
  volumeKg: number
  uniqueExercises: number
}

export function getTrainingSummary(sessions: WorkoutSession[]): TrainingSummary {
  const completedSessions = sessions.filter((session) => session.status === 'completed')
  const completedSets = completedSessions.flatMap((session) =>
    session.exercises.flatMap((exercise) =>
      exercise.sets.filter((set) => set.completed),
    ),
  )
  const exerciseKeys = new Set<string>()

  completedSessions.forEach((session) => {
    session.exercises.forEach((exercise) => {
      if (exercise.sets.some((set) => set.completed)) {
        exerciseKeys.add(normalizeExerciseName(exercise.performedName))
      }
    })
  })

  return {
    workouts: completedSessions.length,
    completedSets: completedSets.length,
    volumeKg: completedSets.reduce(
      (total, set) =>
        total + (set.weightKg !== null && set.reps !== null ? set.weightKg * set.reps : 0),
      0,
    ),
    uniqueExercises: exerciseKeys.size,
  }
}

export function getCurrentProgramWeekSessions(
  program: TrainingProgram,
  sessions: WorkoutSession[],
): { currentWeek: number; completed: number; target: number } {
  const completedSessions = sessions.filter(
    (session) => session.status === 'completed' && session.programId === program.id,
  )
  const currentWeek = getProgramCurrentWeek(program, completedSessions.length)
  return {
    currentWeek,
    completed: completedSessions.filter((session) => session.weekNumber === currentWeek).length,
    target: program.liftingDaysPerWeek,
  }
}

export function getExerciseTrends(sessions: WorkoutSession[]): ExerciseTrend[] {
  const pointsByExercise = new Map<
    string,
    { name: string; points: ExercisePerformancePoint[] }
  >()
  const completedSessions = sessions
    .filter((session) => session.status === 'completed')
    .slice()
    .sort((a, b) => sessionTime(a) - sessionTime(b))

  completedSessions.forEach((session) => {
    const sessionExercises = new Map<string, { name: string; sets: SetLog[] }>()
    session.exercises.forEach((exercise) => {
      const sets = exercise.sets.filter(
        (set) => set.completed && set.reps !== null && set.reps > 0,
      )
      if (sets.length === 0) return

      const key = normalizeExerciseName(exercise.performedName)
      const current = sessionExercises.get(key)
      if (current) current.sets.push(...sets)
      else sessionExercises.set(key, { name: exercise.performedName.trim(), sets: sets.slice() })
    })

    sessionExercises.forEach(({ name, sets }, key) => {
      const current = pointsByExercise.get(key) ?? { name, points: [] }
      current.name = name
      current.points.push(createPerformancePoint(session, key, sets))
      pointsByExercise.set(key, current)
    })
  })

  return [...pointsByExercise.entries()]
    .map(([key, value]) => {
      const latest = value.points[value.points.length - 1]
      const estimatedValues = value.points
        .map((point) => point.estimatedOneRepMaxKg)
        .filter((number): number is number => number !== null)
      return {
        key,
        name: value.name,
        points: value.points,
        latest,
        previous: value.points[value.points.length - 2],
        bestEstimatedOneRepMaxKg: estimatedValues.length > 0
          ? Math.max(...estimatedValues)
          : null,
        bestVolumeKg: Math.max(...value.points.map((point) => point.volumeKg)),
        bestTotalReps: Math.max(...value.points.map((point) => point.totalReps)),
      }
    })
    .sort((a, b) => {
      const timeDifference = Date.parse(b.latest.date) - Date.parse(a.latest.date)
      return timeDifference || a.name.localeCompare(b.name)
    })
}

export function getSessionPersonalRecords(
  session: WorkoutSession,
  previousSessions: WorkoutSession[],
): string[] {
  const previousByKey = new Map(
    getExerciseTrends(previousSessions).map((trend) => [trend.key, trend]),
  )
  const currentTrends = getExerciseTrends([{ ...session, status: 'completed' }])

  return currentTrends.flatMap((current) => {
    const previous = previousByKey.get(current.key)
    if (!previous) return []
    const point = current.latest
    const strengthRecord =
      point.estimatedOneRepMaxKg !== null &&
      (previous.bestEstimatedOneRepMaxKg === null ||
        point.estimatedOneRepMaxKg > previous.bestEstimatedOneRepMaxKg + 0.05)
    const volumeRecord = point.volumeKg > 0 && point.volumeKg > previous.bestVolumeKg + 0.05
    const repRecord =
      point.estimatedOneRepMaxKg === null && point.totalReps > previous.bestTotalReps
    return strengthRecord || volumeRecord || repRecord ? [current.name] : []
  })
}

function createPerformancePoint(
  session: WorkoutSession,
  key: string,
  sets: SetLog[],
): ExercisePerformancePoint {
  const topSet = sets.slice().sort(compareSets)[0]
  const weightedSets = sets.filter(
    (set): set is SetLog & { weightKg: number; reps: number } =>
      set.weightKg !== null && set.reps !== null,
  )
  return {
    id: `${session.id}:${key}`,
    sessionId: session.id,
    date: session.completedAt ?? session.updatedAt,
    weekNumber: session.weekNumber,
    workoutTitle: session.workoutTitle,
    topSet,
    completedSets: sets.length,
    totalReps: sets.reduce((total, set) => total + (set.reps ?? 0), 0),
    volumeKg: weightedSets.reduce(
      (total, set) => total + set.weightKg * set.reps,
      0,
    ),
    estimatedOneRepMaxKg: weightedSets.length > 0
      ? Math.max(...weightedSets.map(estimatedOneRepMax))
      : null,
  }
}

function compareSets(a: SetLog, b: SetLog): number {
  const aEstimate = a.weightKg !== null && a.reps !== null ? estimatedOneRepMax(a) : -1
  const bEstimate = b.weightKg !== null && b.reps !== null ? estimatedOneRepMax(b) : -1
  if (aEstimate !== bEstimate) return bEstimate - aEstimate
  if ((a.weightKg ?? -1) !== (b.weightKg ?? -1)) return (b.weightKg ?? -1) - (a.weightKg ?? -1)
  return (b.reps ?? -1) - (a.reps ?? -1)
}

function estimatedOneRepMax(set: SetLog): number {
  if (set.weightKg === null || set.reps === null) return 0
  return set.weightKg * (1 + set.reps / 30)
}

function normalizeExerciseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function sessionTime(session: WorkoutSession): number {
  return Date.parse(session.completedAt ?? session.updatedAt ?? session.startedAt)
}
