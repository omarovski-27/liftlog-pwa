import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import Dexie from 'dexie'
import { describe, expect, it, vi } from 'vitest'
import { chestSpecializationProgram } from '../../data/chestSpecializationProgram'
import {
  ensureProgramVersion,
  LiftLogDatabase,
  liftLogDb,
  setActiveProgramId,
} from '../../data/db'
import {
  createBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
} from '../../lib/backups'
import { createWorkoutSession } from '../../lib/sessions'
import { PhysioView } from './PhysioView'
import * as repository from './repository'
import { emptyDose, type RehabExercise } from './types'
import { parseInventory, safeDemoUrl, validateRehabData } from './validation'

const exercise = (): RehabExercise => ({
  id: 'practice',
  name: 'Practice movement',
  group: 'back_core_hip',
  disposition: 'awaiting clarification',
  dose: emptyDose(),
  doseOrigin: 'source screenshot',
  sourceDoseText: null,
  sourceImages: ['synthetic.png'],
  sourceInstructions: '',
  notes: '',
  variantConfirmed: false,
  weekdays: [],
  demo: null,
})
async function seed() {
  await repository.savePlan([exercise()])
  return (await repository.readRehabData()).rehabPlanVersions[0]
}
async function session() {
  await seed()
  return repository.startSession(['practice'])
}
async function finish() {
  const active = await session()
  return repository.saveRehabSession(
    { ...active, status: 'finished', finishedAt: new Date().toISOString() },
    active.revision,
  )
}
function inventory() {
  return {
    format: 'liftlog-physio-source-inventory',
    inventorySchemaVersion: 1,
    preparedOn: '2026-11-01',
    sourceProgrammeDate: '2026-11-01',
    privacy: 'Synthetic fixture',
    compatibility: 'Development input',
    notMedicalPrescription: 'Unknown dose',
    uniqueExerciseCount: 1,
    exercises: [
      {
        sourceId: 'practice',
        sourceName: 'Practice movement',
        proposedUiGroup: 'back_core_hip',
        groupingOrigin: 'organizational proposal',
        sourceImages: ['synthetic.png'],
        nameVerification: 'synthetic',
        visibleDoseText: null,
        dose: emptyDose(),
        doseStatus: 'unknown',
        routineStatus: 'unconfigured',
        variantReviewStatus: 'unknown',
        demonstration: { url: null, verificationStatus: 'not_verified' },
        completedSessions: [],
      },
    ],
  }
}

describe('physio storage integrity', () => {
  it('upgrades a populated version-7 database without touching a live lifting session', async () => {
    const name = `physio-upgrade-${crypto.randomUUID()}`
    const old = new Dexie(name)
    old
      .version(7)
      .stores({
        sessions: 'id, status',
        alternatives: 'id',
        programVersions: 'id',
        settings: 'id',
      })
    const active = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [],
    )
    await old.table('sessions').add(active)
    await old
      .table('settings')
      .put({ id: 'app', activeProgramId: active.programId })
    old.close()
    const upgraded = new LiftLogDatabase(name)
    try {
      expect(await upgraded.sessions.get(active.id)).toEqual(active)
      expect(await upgraded.settings.get('app')).toMatchObject({
        activeProgramId: active.programId,
      })
      expect(await upgraded.rehabSessions.count()).toBe(0)
    } finally {
      await upgraded.delete()
    }
  })
  it('keeps missing dose and actual values null and creates no prescribed schedule', async () => {
    const plan = await seed()
    expect(plan.exercises[0]).toMatchObject({
      disposition: 'awaiting clarification',
      weekdays: [],
      dose: emptyDose(),
    })
    await expect(repository.startSession()).rejects.toThrow(
      /No exercises selected/,
    )
    const active = await repository.startSession(['practice'])
    expect(active.logs[0].actual.reps).toBeNull()
    expect(active.logs[0].outcome).toBe('not started')
  })
  it('atomically deduplicates rapid starts and allows an active lifting workout independently', async () => {
    await seed()
    const lifting = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [],
    )
    await liftLogDb.sessions.add(lifting)
    const [a, b] = await Promise.all([
      repository.startSession(['practice']),
      repository.startSession(['practice']),
    ])
    expect(a.id).toBe(b.id)
    expect(await liftLogDb.rehabDayPlans.count()).toBe(1)
    expect(await liftLogDb.sessions.get(lifting.id)).toEqual(lifting)
  })
  it('preserves actual zeroes in partial sessions and rejects stale writes', async () => {
    const original = await session()
    const saved = await repository.saveRehabSession(
      {
        ...original,
        status: 'paused',
        logs: original.logs.map((l) => ({
          ...l,
          outcome: 'partial',
          actual: { ...l.actual, reps: 0 },
        })),
      },
      0,
    )
    expect(saved.revision).toBe(1)
    await expect(repository.saveRehabSession(original, 0)).rejects.toThrow(
      /another window/,
    )
    const resumed = await repository.startSession(['practice'])
    expect(resumed.id).toBe(original.id)
    expect(resumed.logs[0]).toMatchObject({
      outcome: 'partial',
      actual: { reps: 0 },
    })
  })
  it('keeps target snapshots immutable across future plan edits and lifting program switches', async () => {
    const done = await finish()
    const before = await repository.readRehabData()
    const plan = before.rehabPlanVersions[0]
    await repository.savePlan(
      [
        {
          ...exercise(),
          doseOrigin: 'user entered',
          dose: { ...emptyDose(), reps: 17 },
        },
      ],
      plan,
    )
    await setActiveProgramId('another-lifting-program')
    const after = await repository.readRehabData()
    expect(after.rehabPlanVersions).toHaveLength(2)
    expect(after.rehabDayPlans[0]).toEqual(before.rehabDayPlans[0])
    expect(after.rehabSessions[0]).toEqual(done)
    expect(after.rehabSettings[0].activePlanId).toBe(plan.planId)
  })
  it('does not overwrite same-day completed work or resurrect a finished session', async () => {
    const done = await finish()
    expect((await repository.startSession(['practice'])).id).toBe(done.id)
    await expect(
      repository.saveRehabSession(
        { ...done, status: 'active', finishedAt: null },
        done.revision,
      ),
    ).rejects.toThrow(/finished/)
  })
  it('uses the Amman local day across UTC midnight', () => {
    expect(
      repository.localDay('Asia/Amman', new Date('2026-11-03T22:30:00Z')),
    ).toBe('2026-11-04')
    expect(
      repository.localDay('Asia/Amman', new Date('2026-11-03T00:15:00Z')),
    ).toBe('2026-11-03')
  })
})

describe('physio input and backup validation', () => {
  it('imports source provenance and partial dose without manufacturing missing fields', () => {
    const source = inventory()
    source.exercises[0].dose = {
      ...emptyDose(),
      sets: 3,
      reps: 10,
      holdSecondsPerRep: 5,
    }
    const [entry] = parseInventory(JSON.stringify(source))
    expect(entry.dose).toMatchObject({
      sets: 3,
      reps: 10,
      holdSecondsPerRep: 5,
      repBasis: null,
      frequencyPerWeek: null,
    })
    expect(entry.weekdays).toEqual([])
    expect(entry.variantConfirmed).toBe(false)
  })
  it('rejects duplicate source identities, unknown executable fields and historical completions', () => {
    const source = inventory()
    source.exercises.push(source.exercises[0])
    source.uniqueExerciseCount = 2
    expect(() => parseInventory(JSON.stringify(source))).toThrow(/Duplicate/)
    expect(() =>
      parseInventory(JSON.stringify({ ...inventory(), script: 'run' })),
    ).toThrow(/Unsupported/)
    const historical = inventory() as unknown as {
      exercises: { completedSessions: unknown[] }[]
    }
    historical.exercises[0].completedSessions = [{ date: '2026-10-01' }]
    expect(() => parseInventory(JSON.stringify(historical))).toThrow(
      /historical/,
    )
  })
  it('restricts demonstrations to direct video URLs without tracking parameters', () => {
    expect(safeDemoUrl('https://youtu.be/abcdefghijk?health=secret')).toBe(
      'https://www.youtube.com/watch?v=abcdefghijk',
    )
    for (const url of [
      'javascript:alert(1)',
      'https://youtube.com.evil.test/watch?v=abcdefghijk',
      'https://www.youtube.com/results?search_query=exercise',
      'http://vimeo.com/123',
      'https://user:pass@vimeo.com/123',
    ])
      expect(() => safeDemoUrl(url)).toThrow()
  })
  it('round-trips all five stores in v2 and merges identical records idempotently', async () => {
    await ensureProgramVersion(chestSpecializationProgram)
    const done = await finish()
    const now = new Date().toISOString()
    await repository.saveCheckIn({
      id: 'observation',
      localDate: repository.localDay(),
      timezone: 'Asia/Amman',
      observedAt: now,
      recordedAt: now,
      region: 'knee_lower_limb',
      pain: 0,
      swelling: null,
      instability: false,
      response: 'after',
      sessionId: done.id,
      notes: 'Synthetic observation',
    })
    const before = await repository.readRehabData()
    const backup = parseBackup(serializeBackup(await createBackup()))
    expect(backup.schemaVersion).toBe(2)
    await restoreBackup(backup, 'replace')
    await restoreBackup(backup, 'merge')
    await restoreBackup(backup, 'merge')
    expect(await repository.readRehabData()).toEqual(before)
  })
  it.each(['merge', 'replace'] as const)(
    'keeps physio intact for v1 %s',
    async (mode) => {
      await ensureProgramVersion(chestSpecializationProgram)
      await finish()
      const before = await repository.readRehabData()
      const backup = await createBackup()
      backup.schemaVersion = 1
      delete backup.data.rehab
      await restoreBackup(backup, mode)
      expect(await repository.readRehabData()).toEqual(before)
    },
  )
  it('rejects divergent physio records and leaves lifting and physio unchanged', async () => {
    await ensureProgramVersion(chestSpecializationProgram)
    await finish()
    const original = await createBackup()
    const incoming = structuredClone(original)
    incoming.data.rehab!.rehabPlanVersions[0].exercises[0].notes =
      'Different edit'
    await expect(restoreBackup(incoming, 'merge')).rejects.toThrow(
      /Physio conflict/,
    )
    expect((await createBackup()).data).toEqual(original.data)
  })
  it('rolls back physio writes when lifting restore fails later in the same transaction', async () => {
    await ensureProgramVersion(chestSpecializationProgram)
    await finish()
    const original = await createBackup()
    const incoming = structuredClone(original)
    incoming.data.rehab!.rehabCheckIns = []
    vi.spyOn(liftLogDb.sessions, 'bulkAdd').mockRejectedValueOnce(
      new Error('Disk failure'),
    )
    await expect(restoreBackup(incoming, 'replace')).rejects.toThrow(
      'Disk failure',
    )
    expect((await createBackup()).data).toEqual(original.data)
  })
  it('rejects dangling references and malicious video links before any restore writes', async () => {
    await ensureProgramVersion(chestSpecializationProgram)
    await finish()
    const backup = await createBackup()
    backup.data.rehab!.rehabSessions[0].dayPlanId = 'missing'
    expect(() => parseBackup(serializeBackup(backup))).toThrow(/reference/)
    const data = await repository.readRehabData()
    data.rehabPlanVersions[0].exercises[0].demo = {
      url: 'javascript:bad()',
      title: '',
      provider: '',
      variant: '',
      reviewer: '',
      checkedOn: '2026-11-03',
      status: 'candidate',
    }
    expect(() => validateRehabData(data)).toThrow(/HTTPS/)
  })
  it('locks restores while either paused or active physio is unfinished', async () => {
    await ensureProgramVersion(chestSpecializationProgram)
    const backup = await createBackup()
    const active = await session()
    await repository.saveRehabSession({ ...active, status: 'paused' }, 0)
    await expect(restoreBackup(backup, 'replace')).rejects.toThrow(
      /unfinished physio/,
    )
  })
})

describe('physio user flow', () => {
  it('finds a valid recovery after earlier malformed and orphaned entries', async () => {
    const active = await session()
    localStorage.setItem('liftlog-physio-recovery-v1:invalid', '{broken')
    localStorage.setItem('liftlog-physio-recovery-v1:orphaned', JSON.stringify({ session: { ...active, id: 'deleted-session' }, expectedRevision: 0 }))
    const draft = structuredClone(active); draft.logs[0].actual.reps = 12
    localStorage.setItem('liftlog-physio-recovery-v1:valid', JSON.stringify({ session: draft, expectedRevision: 0 }))
    render(<PhysioView onUnsavedChange={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Recover draft' }))
    await waitFor(async () => expect((await repository.readRehabData()).rehabSessions[0].logs[0].actual.reps).toBe(12))
    expect(localStorage.getItem('liftlog-physio-recovery-v1:invalid')).toBe('{broken')
    expect(localStorage.getItem('liftlog-physio-recovery-v1:orphaned')).not.toBeNull()
  })
  it('matches restored logs by occurrence ID even when their array order changes', async () => {
    await repository.savePlan([
      exercise(),
      { ...exercise(), id: 'second', name: 'Second movement' },
    ])
    const active = await repository.startSession(['practice', 'second'])
    active.logs[0].actual.reps = 7
    active.logs[1].actual.reps = 13
    active.logs.reverse()
    await liftLogDb.rehabSessions.put(active)
    render(<PhysioView onUnsavedChange={vi.fn()} />)
    expect(
      await screen.findByLabelText('Practice movement actual Reps'),
    ).toHaveValue(7)
    expect(screen.getByLabelText('Second movement actual Reps')).toHaveValue(13)
    fireEvent.change(screen.getByLabelText('Practice movement actual Reps'), {
      target: { value: '8' },
    })
    await waitFor(async () =>
      expect(
        (await repository.readRehabData()).rehabSessions[0].logs.find(
          (l) => l.occurrenceId === active.logs[1].occurrenceId,
        )?.actual.reps,
      ).toBe(8),
    )
  })
  it('allows correction of invalid actual values without locking or losing the saved draft', async () => {
    await session()
    render(<PhysioView onUnsavedChange={vi.fn()} />)
    const reps = await screen.findByLabelText('Practice movement actual Reps')
    fireEvent.change(reps, { target: { value: '-1' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('whole numbers')
    expect(reps).not.toBeDisabled()
    fireEvent.change(reps, { target: { value: '4' } })
    await waitFor(async () =>
      expect(
        (await repository.readRehabData()).rehabSessions[0].logs[0].actual.reps,
      ).toBe(4),
    )
  })
  it('does not clear a recovery entry owned by another window after saving', async () => {
    await session()
    render(<PhysioView onUnsavedChange={vi.fn()} />)
    const reps = await screen.findByLabelText('Practice movement actual Reps')
    const other = 'liftlog-physio-recovery-v1:another-window'
    localStorage.setItem(other, 'untouched recovery evidence')
    fireEvent.change(reps, { target: { value: '5' } })
    await waitFor(async () =>
      expect(
        (await repository.readRehabData()).rehabSessions[0].logs[0].actual.reps,
      ).toBe(5),
    )
    expect(localStorage.getItem(other)).toBe('untouched recovery evidence')
  })
  it('links a next-day response to a completed session after remount', async () => {
    const done = await finish()
    render(<PhysioView onUnsavedChange={vi.fn()} />)
    const when = await screen.findByLabelText('When')
    fireEvent.change(when, { target: { value: 'next day' } })
    fireEvent.change(screen.getByLabelText('Related physio session'), {
      target: { value: done.id },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save check-in' }))
    await screen.findByText('Check-in saved on this device.')
    expect((await repository.readRehabData()).rehabCheckIns[0]).toMatchObject({
      sessionId: done.id,
      response: 'next day',
      pain: null,
    })
  })
  it('records only actual input and resumes the same partial session after remount', async () => {
    await session()
    const view = render(<PhysioView onUnsavedChange={vi.fn()} />)
    const reps = await screen.findByLabelText('Practice movement actual Reps')
    expect(reps).toHaveValue(null)
    fireEvent.change(reps, { target: { value: '7' } })
    await waitFor(() =>
      expect(screen.getByText(/Saved on this device/)).toBeInTheDocument(),
    )
    view.unmount()
    render(<PhysioView onUnsavedChange={vi.fn()} />)
    expect(
      await screen.findByLabelText('Practice movement actual Reps'),
    ).toHaveValue(7)
    expect(
      (await repository.readRehabData()).rehabSessions[0].logs[0].outcome,
    ).toBe('not started')
  })
  it('exposes failed writes and retries the retained draft without fake Saved status', async () => {
    await session()
    vi.spyOn(repository, 'saveRehabSession').mockRejectedValueOnce(
      new Error('Temporary write failure'),
    )
    render(<PhysioView onUnsavedChange={vi.fn()} />)
    fireEvent.change(
      await screen.findByLabelText('Practice movement actual Reps'),
      { target: { value: '9' } },
    )
    await screen.findByText('Save failed — draft retained')
    expect(
      (await repository.readRehabData()).rehabSessions[0].logs[0].actual.reps,
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    await waitFor(async () =>
      expect(
        (await repository.readRehabData()).rehabSessions[0].logs[0].actual.reps,
      ).toBe(9),
    )
  })
})
