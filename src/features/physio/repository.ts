import { liftLogDb } from '../../data/db'
import {
  emptyActual,
  type RehabData,
  type RehabExercise,
  type RehabPlanVersion,
  type RehabSession,
  type RehabCheckIn,
} from './types'
import { validatePlan, validateRehabData } from './validation'
import { defaultExercises } from './defaultLibrary'

export const rehabTables = () => [
  liftLogDb.rehabPlanVersions,
  liftLogDb.rehabDayPlans,
  liftLogDb.rehabSessions,
  liftLogDb.rehabCheckIns,
  liftLogDb.rehabSettings,
]
export async function readRehabData(): Promise<RehabData> {
  const [
    rehabPlanVersions,
    rehabDayPlans,
    rehabSessions,
    rehabCheckIns,
    rehabSettings,
  ] = await Promise.all(rehabTables().map((table) => table.toArray()))
  return {
    rehabPlanVersions,
    rehabDayPlans,
    rehabSessions,
    rehabCheckIns,
    rehabSettings,
  } as RehabData
}
export function localDay(timezone = 'Asia/Amman', date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  return ['year', 'month', 'day']
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join('-')
}
export function currentPlan(
  data: RehabData,
  date?: string,
): RehabPlanVersion | undefined {
  const setting = data.rehabSettings[0]
  return data.rehabPlanVersions
    .filter(
      (p) =>
        p.planId === setting?.activePlanId &&
        (!date || p.effectiveDate <= date),
    )
    .sort((a, b) => b.version - a.version)[0]
}
export const unfinishedSession = (data: RehabData) =>
  data.rehabSessions.find((s) => s.status === 'active' || s.status === 'paused')

export async function ensureDefaultRehabPlan(): Promise<RehabData> {
  return liftLogDb.transaction('rw', rehabTables(), async () => {
    const data = await readRehabData()
    // An existing library, restore or session always takes precedence over defaults.
    if (Object.values(data).some(records => records.length > 0)) return data
    const now = new Date().toISOString()
    const plan: RehabPlanVersion = {
      id: crypto.randomUUID(), planId: crypto.randomUUID(), version: 1,
      createdAt: now, effectiveDate: localDay(),
      source: 'private source inventory', exercises: defaultExercises(),
    }
    validatePlan(plan)
    await liftLogDb.rehabPlanVersions.add(plan)
    await liftLogDb.rehabSettings.add({ id: 'physio', activePlanId: plan.planId, timezone: 'Asia/Amman', updatedAt: now })
    return readRehabData()
  })
}
export async function savePlan(
  exercises: RehabExercise[],
  previous?: RehabPlanVersion,
  effectiveDate = localDay(),
): Promise<void> {
  await liftLogDb.transaction('rw', rehabTables(), async () => {
    const data = await readRehabData()
    if (unfinishedSession(data))
      throw new Error(
        'Finish the unfinished physio session before editing its plan.',
      )
    const latest = currentPlan(data)
    if (latest?.id !== previous?.id)
      throw new Error(
        'The physio plan changed in another window. Reload before editing.',
      )
    const plan: RehabPlanVersion = {
      id: crypto.randomUUID(),
      planId: previous?.planId ?? crypto.randomUUID(),
      version: (previous?.version ?? 0) + 1,
      createdAt: new Date().toISOString(),
      effectiveDate,
      source: previous ? 'user entered' : 'private source inventory',
      exercises,
    }
    validatePlan(plan)
    if (previous && effectiveDate < localDay(data.rehabSettings[0]?.timezone))
      throw new Error(
        'Plan edits must apply today or later; history keeps its snapshots.',
      )
    await liftLogDb.rehabPlanVersions.add(plan)
    await liftLogDb.rehabSettings.put({
      id: 'physio',
      activePlanId: plan.planId,
      timezone: data.rehabSettings[0]?.timezone ?? 'Asia/Amman',
      updatedAt: plan.createdAt,
    })
  })
}
export function scheduledExercises(
  plan: RehabPlanVersion | undefined,
  date: string,
) {
  if (!plan || date < plan.effectiveDate) return []
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return plan.exercises.filter(
    (e) =>
      ['active', 'optional'].includes(e.disposition) &&
      e.variantConfirmed &&
      e.weekdays.includes(day),
  )
}
export async function startSession(
  manualExerciseIds?: string[],
): Promise<RehabSession> {
  return liftLogDb.transaction('rw', rehabTables(), async () => {
    const data = await readRehabData()
    const unfinished = unfinishedSession(data)
    if (unfinished) return unfinished
    const timezone = data.rehabSettings[0]?.timezone ?? 'Asia/Amman'
    const date = localDay(timezone)
    const plan = currentPlan(data, date)
    if (!plan)
      throw new Error(
        'Import a physio inventory and choose a start date first.',
      )
    const existingDay = data.rehabDayPlans.find(
      (d) => d.planId === plan.planId && d.localDate === date,
    )
    if (existingDay) {
      const existing = data.rehabSessions.find(
        (s) => s.dayPlanId === existingDay.id,
      )
      if (existing) return existing
    }
    const chosen = manualExerciseIds
      ? plan.exercises.filter(
          (e) =>
            manualExerciseIds.includes(e.id) &&
            !['paused', 'retired'].includes(e.disposition),
        )
      : scheduledExercises(plan, date)
    if (!chosen.length)
      throw new Error(
        'No exercises selected. Use a rest check-in or choose exercises for manual logging.',
      )
    const now = new Date().toISOString()
    const day = existingDay ?? {
      id: crypto.randomUUID(),
      planId: plan.planId,
      planVersionId: plan.id,
      localDate: date,
      timezone,
      createdAt: now,
      occurrences: chosen.map((exercise) => ({
        id: crypto.randomUUID(),
        exercise: structuredClone(exercise),
        required: !manualExerciseIds && exercise.disposition === 'active',
      })),
    }
    const session: RehabSession = {
      id: crypto.randomUUID(),
      dayPlanId: day.id,
      revision: 0,
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
      status: 'active',
      logs: day.occurrences.map((o) => ({
        occurrenceId: o.id,
        outcome: 'not started',
        actual: emptyActual(),
        notes: '',
      })),
    }
    validateRehabData({
      ...data,
      rehabDayPlans: existingDay
        ? data.rehabDayPlans
        : [...data.rehabDayPlans, day],
      rehabSessions: [...data.rehabSessions, session],
    })
    if (!existingDay) await liftLogDb.rehabDayPlans.add(day)
    await liftLogDb.rehabSessions.add(session)
    return session
  })
}
export class RehabConflictError extends Error {}
export async function saveRehabSession(
  draft: RehabSession,
  expectedRevision: number,
): Promise<RehabSession> {
  return liftLogDb.transaction('rw', rehabTables(), async () => {
    const data = await readRehabData()
    const existing = data.rehabSessions.find((s) => s.id === draft.id)
    if (!existing || existing.revision !== expectedRevision)
      throw new RehabConflictError(
        'This physio session changed in another window. Export your unsaved draft or reload the saved session.',
      )
    if (['finished', 'abandoned'].includes(existing.status))
      throw new RehabConflictError(
        'This session is already finished. Reload its saved record.',
      )
    if (
      existing.dayPlanId !== draft.dayPlanId ||
      existing.startedAt !== draft.startedAt
    )
      throw new Error('Session identity cannot change.')
    const updated = {
      ...draft,
      revision: expectedRevision + 1,
      updatedAt: new Date().toISOString(),
    }
    validateRehabData({
      ...data,
      rehabSessions: data.rehabSessions.map((s) =>
        s.id === updated.id ? updated : s,
      ),
    })
    await liftLogDb.rehabSessions.put(updated)
    return updated
  })
}
export async function saveCheckIn(checkIn: RehabCheckIn): Promise<void> {
  await liftLogDb.transaction('rw', rehabTables(), async () => {
    const data = await readRehabData()
    validateRehabData({
      ...data,
      rehabCheckIns: [...data.rehabCheckIns, checkIn],
    })
    await liftLogDb.rehabCheckIns.add(checkIn)
  })
}
