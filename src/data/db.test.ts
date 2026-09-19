import { describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import {
  deleteSession,
  ensureProgramVersion,
  liftLogDb,
  LiftLogDatabase,
  saveProgramVersion,
  saveSession,
  setActiveProgramId,
} from './db'
import { chestSpecializationProgram } from './chestSpecializationProgram'
import { createWorkoutSession } from '../lib/sessions'

describe('program seed revisions', () => {
  it('upgrades existing timed and paired logs without changing entered values', async () => {
    const name = `liftlog-upgrade-test-${crypto.randomUUID()}`
    const old = new Dexie(name)
    old.version(4).stores({ sessions: 'id, status', programVersions: 'id, programId', alternatives: 'id', settings: 'id' })
    const session = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[3], [])
    session.exercises.forEach((exercise) => { delete exercise.metric; delete exercise.pair })
    const carry = session.exercises.find((exercise) => exercise.performedName === "Farmer's carry")!
    carry.sets[0].reps = 32.5
    carry.sets[0].weightKg = 20
    carry.sets[0].completed = true
    await old.table('programVersions').add({ id: 'old-version', programId: chestSpecializationProgram.id, version: 1, program: chestSpecializationProgram })
    await old.table('sessions').add(session)
    old.close()
    const upgraded = new LiftLogDatabase(name)
    try {
      const restored = await upgraded.sessions.get(session.id)
      const restoredCarry = restored?.exercises.find((exercise) => exercise.id === carry.id)
      expect(restoredCarry?.metric).toBe('seconds')
      expect(restoredCarry?.sets).toEqual(carry.sets)
      expect(restored?.exercises[0].pair).toEqual(chestSpecializationProgram.workouts[3].exercises[0].pair)
    } finally { await upgraded.delete() }
  })

  it('prevents two windows from creating different active workouts', async () => {
    const first = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    const second = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[1], [])
    const results = await Promise.allSettled([saveSession(first), saveSession(second)])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(await liftLogDb.sessions.where('status').equals('active').count()).toBe(1)
  })

  it('rejects stale saves and stale discards after another window has changed a workout', async () => {
    const session = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    await saveSession(session)
    const changed = { ...session, updatedAt: '2026-09-15T10:00:01.000Z', sessionNotes: 'Saved in the other window' }
    await saveSession(changed, session.updatedAt)
    await expect(saveSession({ ...session, sessionNotes: 'Stale copy' }, session.updatedAt)).rejects.toThrow(/another window/)
    await expect(deleteSession(session.id, session.updatedAt)).rejects.toThrow(/another window/)
    expect((await liftLogDb.sessions.get(session.id))?.sessionNotes).toBe('Saved in the other window')
  })

  it('locks program edits and program switching while any workout is active', async () => {
    await ensureProgramVersion(chestSpecializationProgram)
    await setActiveProgramId(chestSpecializationProgram.id)
    const session = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [],
    )
    await saveSession(session)

    await expect(
      saveProgramVersion(
        { ...chestSpecializationProgram, name: 'Unsafe edit' },
        'edit',
      ),
    ).rejects.toThrow(/locked during an active workout/)
    await expect(setActiveProgramId('another-program')).rejects.toThrow(
      /active workout/,
    )
    expect(await liftLogDb.programVersions.count()).toBe(1)
  })

  it('adds a new immutable version when the bundled seed prescription advances', async () => {
    const oldSeed = {
      ...chestSpecializationProgram,
      seedRevision: 1,
      workouts: chestSpecializationProgram.workouts.map((workout) => ({
        ...workout,
        exercises: workout.exercises.map(({ weekOverrides: _weekOverrides, ...exercise }) =>
          exercise,
        ),
      })),
    }

    const original = await ensureProgramVersion(oldSeed)
    const updated = await ensureProgramVersion(chestSpecializationProgram)
    const versions = await liftLogDb.programVersions
      .where('programId')
      .equals(chestSpecializationProgram.id)
      .sortBy('version')

    expect(original.version).toBe(1)
    expect(updated).toMatchObject({
      version: 2,
      basedOnVersion: 1,
      label: 'Source program revision 2',
    })
    expect(versions).toHaveLength(2)
    expect(versions[1].program.workouts[0].exercises[2].weekOverrides).toEqual([
      { startWeek: 1, endWeek: 2, sets: 2 },
    ])
  })
})
