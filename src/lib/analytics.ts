import type { ExerciseMetric, TrainingProgram } from '../types/program'
import type { SetLog, WorkoutSession } from '../types/session'
import { getProgramCurrentWeek } from './programMetrics'
import { getExerciseMetric, getSetQuantity } from './setMetrics'
import { getSessionVolume } from './sessions'

export interface ExercisePerformancePoint {
  metric: ExerciseMetric
  id: string
  sessionId: string
  date: string
  weekNumber: number
  workoutTitle: string
  topSet: SetLog
  completedSets: number
  totalQuantity: number
  volumeKg: number
  estimatedOneRepMaxKg: number | null
}

export interface ExerciseTrend {
  metric: ExerciseMetric
  key: string
  name: string
  points: ExercisePerformancePoint[]
  latest: ExercisePerformancePoint
  previous?: ExercisePerformancePoint
  best: ExercisePerformancePoint
  bestEstimatedOneRepMaxKg: number | null
  bestVolumeKg: number
  bestTotalQuantity: number
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
    volumeKg: completedSessions.reduce((total, session) => total + getSessionVolume(session), 0),
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
    completed: Math.min(
      program.liftingDaysPerWeek,
      completedSessions.filter((session) => session.weekNumber === currentWeek).length,
    ),
    target: program.liftingDaysPerWeek,
  }
}

export function getExerciseTrends(sessions: WorkoutSession[]): ExerciseTrend[] {
  const pointsByExercise = new Map<
    string,
    { name: string; metric: ExerciseMetric; points: ExercisePerformancePoint[] }
  >()
  const completedSessions = sessions
    .filter((session) => session.status === 'completed')
    .slice()
    .sort((a, b) => sessionTime(a) - sessionTime(b))

  completedSessions.forEach((session) => {
    const sessionExercises = new Map<string, { name: string; metric: ExerciseMetric; sets: SetLog[] }>()
    session.exercises.forEach((exercise) => {
      const metric = getExerciseMetric(exercise)
      const sets = exercise.sets.filter((set) => {
        const quantity = getSetQuantity(set, metric)
        return set.completed && quantity !== null && quantity > 0
      })
      if (sets.length === 0) return

      const key = `${normalizeExerciseName(exercise.performedName)}:${metric}`
      const current = sessionExercises.get(key)
      if (current) current.sets.push(...sets)
      else sessionExercises.set(key, { name: exercise.performedName.trim(), metric, sets: sets.slice() })
    })

    sessionExercises.forEach(({ name, metric, sets }, key) => {
      const current = pointsByExercise.get(key) ?? { name, metric, points: [] }
      current.name = name
      current.points.push(createPerformancePoint(session, key, sets, metric))
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
        metric: value.metric,
        name: value.name,
        points: value.points,
        latest,
        previous: value.points[value.points.length - 2],
        best: value.points
          .slice()
          .sort((a, b) => compareSets(a.topSet, b.topSet, value.metric))[0],
        bestEstimatedOneRepMaxKg: estimatedValues.length > 0
          ? Math.max(...estimatedValues)
          : null,
        bestVolumeKg: Math.max(...value.points.map((point) => point.volumeKg)),
        bestTotalQuantity: Math.max(...value.points.map((point) => point.totalQuantity)),
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
      point.estimatedOneRepMaxKg === null && point.totalQuantity > previous.bestTotalQuantity
    return strengthRecord || volumeRecord || repRecord ? [current.name] : []
  })
}

function createPerformancePoint(
  session: WorkoutSession,
  key: string,
  sets: SetLog[],
  metric: ExerciseMetric,
): ExercisePerformancePoint {
  const topSet = sets.slice().sort((a, b) => compareSets(a, b, metric))[0]
  const weightedSets = sets.filter(
    (set): set is SetLog & { weightKg: number; reps: number } =>
      metric === 'reps' && set.weightKg !== null && set.weightKg > 0 && set.reps !== null,
  )
  return {
    id: `${session.id}:${key}`,
    metric,
    sessionId: session.id,
    date: session.completedAt ?? session.updatedAt,
    weekNumber: session.weekNumber,
    workoutTitle: session.workoutTitle,
    topSet,
    completedSets: sets.length,
    totalQuantity: sets.reduce((total, set) => total + (getSetQuantity(set, metric) ?? 0), 0),
    volumeKg: weightedSets.reduce(
      (total, set) => total + set.weightKg * set.reps,
      0,
    ),
    estimatedOneRepMaxKg: weightedSets.length > 0
      ? Math.max(...weightedSets.map(estimatedOneRepMax))
      : null,
  }
}

function compareSets(a: SetLog, b: SetLog, metric: ExerciseMetric): number {
  if (metric !== 'reps') return (getSetQuantity(b, metric) ?? 0) - (getSetQuantity(a, metric) ?? 0) || (b.weightKg ?? 0) - (a.weightKg ?? 0)
  const aEstimate = a.weightKg !== null && a.weightKg > 0 && a.reps !== null ? estimatedOneRepMax(a) : -1
  const bEstimate = b.weightKg !== null && b.weightKg > 0 && b.reps !== null ? estimatedOneRepMax(b) : -1
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
