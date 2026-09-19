import type { ExerciseMetric } from '../types/program'
import type { SetLog } from '../types/session'

export const SET_METRICS = {
  reps: { label: 'Reps', column: 'Reps', unit: 'reps', field: 'reps', step: '1', max: 999 },
  seconds: { label: 'Seconds', column: 'Sec', unit: 'sec', field: 'durationSeconds', step: 'any', max: 86400 },
  meters: { label: 'Distance', column: 'm', unit: 'm', field: 'distanceMeters', step: 'any', max: 100000 },
} as const

export type SetQuantityField = typeof SET_METRICS[ExerciseMetric]['field']

export function getExerciseMetric(exercise: { metric?: ExerciseMetric; repTarget?: string; reps?: string }): ExerciseMetric {
  if (exercise.metric) return exercise.metric
  const target = exercise.repTarget ?? exercise.reps ?? ''
  if (/\d\s*(?:sec(?:onds?)?|s)\b/i.test(target)) return 'seconds'
  if (/\d\s*(?:m|meters?|metres?)\b/i.test(target)) return 'meters'
  return 'reps'
}

export function getSetQuantity(set: SetLog, metric: ExerciseMetric): number | null {
  // Earlier logs stored timed/distance targets in the sole reps field.
  if (metric === 'seconds') return set.durationSeconds ?? set.reps
  if (metric === 'meters') return set.distanceMeters ?? set.reps
  return set.reps
}
