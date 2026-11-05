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
const lowerLimb = {
  title: 'Lower limb · knee, hip & foot',
  ids: [
    'half-kneel-dorsiflexion',
    'side-lying-clam',
    'glute-bridge',
    'lateral-band-walks',
    'single-leg-balance-step-downs',
    'single-leg-balance',
    'toe-towel-crunches',
  ],
}
const upperBody = {
  title: 'Neck & upper body',
  ids: ['deep-neck-flexion', 'prone-t', 'prone-y', 'foam-roll-chest-expansion'],
}
const coreAndBack = {
  title: 'Core & back',
  ids: [
    'cat-and-camel',
    'quad-rock-back-deep-breath',
    'bird-dog',
    'dead-bug',
    'front-plank',
  ],
}
// Reuse complete region groups so lower-limb or trunk work is never fragmented
// between different draft lists. Repetition is display-only, not a prescription.
const rotation = [
  lowerLimb,
  upperBody,
  { title: 'Flexible day · rest or check-in', ids: [] },
  coreAndBack,
  lowerLimb,
  upperBody,
  coreAndBack,
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
