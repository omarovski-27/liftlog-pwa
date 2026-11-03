import type { RehabExercise } from './types'

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
// A draft organization of the supplied library, not a treatment frequency or dose.
// Ambiguous variants stay in a separate review list. No personal activity calendar
// or symptom data is included in this public default.
const rotation = [
  {
    title: 'Knee & hip',
    ids: ['half-kneel-dorsiflexion', 'side-lying-clam', 'glute-bridge'],
  },
  { title: 'Neck & upper back', ids: ['deep-neck-flexion', 'prone-t'] },
  {
    title: 'Flexible day · balance & foot',
    ids: ['single-leg-balance', 'toe-towel-crunches'],
  },
  { title: 'Core control', ids: ['bird-dog', 'dead-bug'] },
  {
    title: 'Knee control',
    ids: ['single-leg-balance-step-downs', 'lateral-band-walks'],
  },
  {
    title: 'Upper body & trunk',
    ids: ['prone-y', 'front-plank', 'foam-roll-chest-expansion'],
  },
  {
    title: 'Back mobility',
    ids: ['cat-and-camel', 'quad-rock-back-deep-breath'],
  },
]

export interface DailyRoutine {
  weekday: number
  title: string
  exercises: RehabExercise[]
  source: 'draft' | 'saved'
}

export function weeklyRoutines(exercises: RehabExercise[]): DailyRoutine[] {
  const hasSavedDays = exercises.some(
    (exercise) => exercise.weekdays.length > 0,
  )
  const available = exercises.filter(
    (exercise) => !['paused', 'retired'].includes(exercise.disposition),
  )
  return rotation.map((day, weekday) => ({
    weekday,
    title: hasSavedDays ? 'Your day plan' : day.title,
    source: hasSavedDays ? 'saved' : 'draft',
    exercises: hasSavedDays
      ? available.filter((exercise) => exercise.weekdays.includes(weekday))
      : day.ids.flatMap((id) => {
          const exercise = available.find((entry) => entry.id === id)
          return exercise ? [exercise] : []
        }),
  }))
}

export function unassignedExercises(
  exercises: RehabExercise[],
  routines: DailyRoutine[],
) {
  const assigned = new Set(
    routines.flatMap((day) => day.exercises.map((exercise) => exercise.id)),
  )
  return exercises.filter((exercise) => !assigned.has(exercise.id))
}
