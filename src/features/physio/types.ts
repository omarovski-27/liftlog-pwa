export const GROUPS = [
  'knee_lower_limb',
  'back_core_hip',
  'shoulder_neck_chest',
] as const
export type Region = (typeof GROUPS)[number]
export const DISPOSITIONS = [
  'awaiting clarification',
  'active',
  'optional',
  'paused',
  'retired',
] as const
export const OUTCOMES = [
  'not started',
  'in progress',
  'completed with dose unknown',
  'completed modified',
  'partial',
  'skipped',
  'stopped due to symptoms',
  'deferred',
] as const
export type Outcome = (typeof OUTCOMES)[number]
export interface Dose {
  sets: number | null
  reps: number | null
  holdSecondsPerRep: number | null
  durationSeconds: number | null
  repBasis: 'total' | 'per side' | null
  side: 'left' | 'right' | 'bilateral' | 'alternating' | null
  restSeconds: number | null
  frequencyPerWeek: number | null
}
export interface Demo {
  url: string
  title: string
  provider: string
  variant: string
  checkedOn: string
  reviewer: string
  status: 'candidate' | 'user supplied' | 'clinician supplied'
}
export interface RehabExercise {
  id: string
  name: string
  group: Region
  disposition: (typeof DISPOSITIONS)[number]
  dose: Dose
  doseOrigin: 'source screenshot' | 'user entered'
  sourceDoseText: string | null
  sourceImages: string[]
  sourceInstructions: string
  notes: string
  variantConfirmed: boolean
  weekdays: number[]
  demo: Demo | null
}
export interface RehabPlanVersion {
  id: string
  planId: string
  version: number
  createdAt: string
  effectiveDate: string
  source: 'private source inventory' | 'user entered'
  exercises: RehabExercise[]
}
export interface RehabOccurrence {
  id: string
  exercise: RehabExercise
  required: boolean
}
export interface RehabDayPlan {
  id: string
  planId: string
  planVersionId: string
  localDate: string
  timezone: string
  createdAt: string
  occurrences: RehabOccurrence[]
}
export interface ActualDose {
  sets: number | null
  reps: number | null
  holdSecondsPerRep: number | null
  durationSeconds: number | null
  breaths: number | null
  steps: number | null
  side: Dose['side']
  setup: string
}
export interface RehabLog {
  occurrenceId: string
  outcome: Outcome
  actual: ActualDose
  notes: string
}
export interface RehabSession {
  id: string
  dayPlanId: string
  revision: number
  startedAt: string
  updatedAt: string
  finishedAt: string | null
  status: 'active' | 'paused' | 'finished' | 'abandoned'
  logs: RehabLog[]
}
export interface RehabCheckIn {
  id: string
  localDate: string
  timezone: string
  observedAt: string
  recordedAt: string
  region: Region
  pain: number | null
  swelling: boolean | null
  instability: boolean | null
  response: 'before' | 'after' | 'next day' | 'rest'
  sessionId: string | null
  notes: string
}
export interface RehabSettings {
  id: 'physio'
  activePlanId: string
  timezone: string
  updatedAt: string
}
export interface RehabData {
  rehabPlanVersions: RehabPlanVersion[]
  rehabDayPlans: RehabDayPlan[]
  rehabSessions: RehabSession[]
  rehabCheckIns: RehabCheckIn[]
  rehabSettings: RehabSettings[]
}
export const emptyDose = (): Dose => ({
  sets: null,
  reps: null,
  holdSecondsPerRep: null,
  durationSeconds: null,
  repBasis: null,
  side: null,
  restSeconds: null,
  frequencyPerWeek: null,
})
export const emptyActual = (): ActualDose => ({
  sets: null,
  reps: null,
  holdSecondsPerRep: null,
  durationSeconds: null,
  breaths: null,
  steps: null,
  side: null,
  setup: '',
})
export const emptyRehabData = (): RehabData => ({
  rehabPlanVersions: [],
  rehabDayPlans: [],
  rehabSessions: [],
  rehabCheckIns: [],
  rehabSettings: [],
})
