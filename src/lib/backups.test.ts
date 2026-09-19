import { describe, expect, it, vi } from 'vitest'
import { chestSpecializationProgram } from '../data/chestSpecializationProgram'
import {
  ensureProgramVersion,
  getActiveProgramId,
  getLatestProgramVersion,
  liftLogDb,
  saveProgramVersion,
  setActiveProgramId,
} from '../data/db'
import type { ExerciseAlternative } from '../types/session'
import type { LiftLogBackup, ProgramVersion } from '../types/storage'
import { createWorkoutSession } from './sessions'
import {
  createBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
  summarizeBackup,
} from './backups'

describe('program versions and backups', () => {
  it('rolls back every table when a replacement fails after deleting and adding records', async () => {
    await ensureProgramVersion(chestSpecializationProgram)
    await setActiveProgramId(chestSpecializationProgram.id)
    const original = await createBackup()
    vi.spyOn(liftLogDb.sessions, 'bulkAdd').mockRejectedValueOnce(new Error('Write failed'))
    await expect(restoreBackup(original, 'replace')).rejects.toThrow('Write failed')
    const after = await createBackup()
    expect(after.data).toEqual(original.data)
  })

  it('treats reordered JSON keys as the same immutable prescription', async () => {
    await ensureProgramVersion(chestSpecializationProgram)
    const backup = await createBackup()
    backup.data.programVersions[0].program = Object.fromEntries(Object.entries(backup.data.programVersions[0].program).reverse()) as typeof chestSpecializationProgram
    await restoreBackup(backup, 'merge')
    expect(await liftLogDb.programVersions.count()).toBe(1)
  })

  it('blocks backup imports while a workout is active', async () => {
    await ensureProgramVersion(chestSpecializationProgram)
    const backup = await createBackup()
    await liftLogDb.sessions.add(createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], []))
    await expect(restoreBackup(backup, 'replace')).rejects.toThrow(/active workout/)
    await expect(restoreBackup(backup, 'merge')).rejects.toThrow(/active workout/)
    expect(await liftLogDb.sessions.count()).toBe(1)
  })

  it.each([
    ['phase', (backup: LiftLogBackup) => { backup.data.programVersions[0].program.phases = [null as never] }, /phase/],
    ['volume ramp', (backup: LiftLogBackup) => { backup.data.programVersions[0].program.chestVolumeRamp[0].setsPerWeek = -1 }, /volume ramp/],
    ['workout identity', (backup: LiftLogBackup) => { backup.data.programVersions[0].program.workouts[1].id = backup.data.programVersions[0].program.workouts[0].id }, /duplicate workout/],
    ['exercise identity', (backup: LiftLogBackup) => { backup.data.programVersions[0].program.workouts[0].exercises[1].id = backup.data.programVersions[0].program.workouts[0].exercises[0].id }, /duplicate template exercise/],
    ['lifting frequency', (backup: LiftLogBackup) => { backup.data.programVersions[0].program.liftingDaysPerWeek = 7 }, /lifting days/],
    ['unknown muscle', (backup: LiftLogBackup) => { backup.data.programVersions[0].program.workouts[0].exercises[0].muscleGroups = ['unknown' as never] }, /muscle/],
  ])('rejects a malformed %s before any restore writes', async (_label, mutate, expected) => {
    await ensureProgramVersion(chestSpecializationProgram)
    const backup = await createBackup()
    mutate(backup)
    expect(() => parseBackup(serializeBackup(backup))).toThrow(expected)
    await expect(restoreBackup(backup, 'replace')).rejects.toThrow(expected)
    expect(await liftLogDb.programVersions.count()).toBe(1)
  })

  it('validates timed logs, nested set identities, and numeric limits', async () => {
    await ensureProgramVersion(chestSpecializationProgram)
    const session = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[3], [])
    const carry = session.exercises.find((exercise) => exercise.performedName === "Farmer's carry")!
    carry.sets[0].durationSeconds = 32.5
    carry.sets[0].completed = true
    await liftLogDb.sessions.add(session)
    const backup = await createBackup()
    expect(parseBackup(serializeBackup(backup)).data.sessions[0].exercises.find((exercise) => exercise.id === carry.id)?.sets[0].durationSeconds).toBe(32.5)
    const invalidRir = JSON.parse(serializeBackup(backup))
    invalidRir.data.sessions[0].exercises[0].sets[0].rir = 11
    expect(() => parseBackup(JSON.stringify(invalidRir))).toThrow(/RIR/)
    const fractionalReps = JSON.parse(serializeBackup(backup))
    fractionalReps.data.sessions[0].exercises[0].sets[0].reps = 8.5
    expect(() => parseBackup(JSON.stringify(fractionalReps))).toThrow(/reps/)
    const duplicates = JSON.parse(serializeBackup(backup))
    duplicates.data.sessions[0].exercises[0].sets[1].id = duplicates.data.sessions[0].exercises[0].sets[0].id
    expect(() => parseBackup(JSON.stringify(duplicates))).toThrow(/duplicate set/)
  })

  it('merges a newer session snapshot without reverting completed history to active', async () => {
    await ensureProgramVersion(chestSpecializationProgram)
    const session = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    session.status = 'completed'
    session.completedAt = '2026-09-01T10:00:00.000Z'
    session.updatedAt = session.completedAt
    await liftLogDb.sessions.add(session)
    const incoming = await createBackup()
    incoming.data.sessions[0].updatedAt = '2026-09-08T10:00:00.000Z'
    incoming.data.sessions[0].exercises[1].sets[0].weightKg = 42
    await restoreBackup(incoming, 'merge')
    expect((await liftLogDb.sessions.get(session.id))?.exercises[1].sets[0].weightKg).toBe(42)
    incoming.data.sessions[0].status = 'active'
    incoming.data.sessions[0].completedAt = undefined
    incoming.data.sessions[0].updatedAt = '2026-09-15T10:00:00.000Z'
    await restoreBackup(incoming, 'merge')
    expect((await liftLogDb.sessions.get(session.id))?.status).toBe('completed')
  })

  it('rejects a same-id session linked to a different program version', async () => {
    const firstVersion = await ensureProgramVersion(chestSpecializationProgram)
    const secondVersion = await saveProgramVersion(
      { ...chestSpecializationProgram, name: 'Chest Specialization Revised' },
      'edit',
      { basedOnVersion: firstVersion.version },
    )
    const session = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [],
      firstVersion.version,
    )
    session.status = 'completed'
    session.completedAt = session.updatedAt
    await liftLogDb.sessions.add(session)
    const incoming = await createBackup()
    incoming.data.sessions[0].programVersion = secondVersion.version

    await expect(restoreBackup(incoming, 'merge')).rejects.toThrow(
      /conflicts with a different local workout/,
    )
    expect((await liftLogDb.sessions.get(session.id))?.programVersion).toBe(
      firstVersion.version,
    )
  })

  it('rejects multiple active workouts in one incoming snapshot', async () => {
    await ensureProgramVersion(chestSpecializationProgram)
    const backup = await createBackup()
    backup.data.sessions = [0, 1].map((index) => createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[index], []))
    expect(() => parseBackup(serializeBackup(backup))).toThrow(/more than one active workout/)
  })

  it('creates one seed version and appends immutable program versions', async () => {
    const [first, repeated] = await Promise.all([
      ensureProgramVersion(chestSpecializationProgram),
      ensureProgramVersion(chestSpecializationProgram),
    ])
    const editedProgram = {
      ...chestSpecializationProgram,
      name: 'Chest Specialization Block - Revised',
    }
    const second = await saveProgramVersion(editedProgram, 'edit', {
      basedOnVersion: first.version,
      label: 'Changed program name',
    })
    await liftLogDb.programVersions.add({
      ...first,
      id: 'duplicate-seed-version',
      createdAt: '2026-09-14T12:00:00.000Z',
    })
    await ensureProgramVersion(chestSpecializationProgram)
    const versions = await liftLogDb.programVersions.toArray()

    expect(repeated.id).toBe(first.id)
    expect(versions).toHaveLength(2)
    expect(second.version).toBe(2)
    expect(getLatestProgramVersion(versions)?.program.name).toBe(
      'Chest Specialization Block - Revised',
    )
    expect(first.program.name).toBe('Chest Specialization Block')
  })

  it('uses the most recently created program when a backup has no active selection', async () => {
    const olderProgram = structuredClone(chestSpecializationProgram)
    olderProgram.id = 'older-high-version-program'
    olderProgram.name = 'Older high version'
    const newerProgram = structuredClone(chestSpecializationProgram)
    newerProgram.id = 'newer-low-version-program'
    newerProgram.name = 'Newer low version'
    const backup: LiftLogBackup = {
      format: 'liftlog-backup',
      schemaVersion: 1,
      appVersion: '0.8.0',
      createdAt: '2026-09-15T12:00:00.000Z',
      data: {
        programVersions: [
          {
            id: 'older-version',
            programId: olderProgram.id,
            version: 99,
            createdAt: '2026-09-01T12:00:00.000Z',
            reason: 'import',
            program: olderProgram,
          },
          {
            id: 'newer-version',
            programId: newerProgram.id,
            version: 1,
            createdAt: '2026-09-15T12:00:00.000Z',
            reason: 'import',
            program: newerProgram,
          },
        ],
        sessions: [],
        alternatives: [],
      },
    }

    const result = await restoreBackup(backup, 'replace')

    expect(result.preferredProgramId).toBe(newerProgram.id)
    expect(await getActiveProgramId()).toBe(newerProgram.id)
  })

  it('exports and validates every local record type', async () => {
    const version = await ensureProgramVersion(chestSpecializationProgram)
    await setActiveProgramId(chestSpecializationProgram.id)
    const session = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [],
      version.version,
    )
    const alternative: ExerciseAlternative = {
      id: 'alternative-test',
      programId: chestSpecializationProgram.id,
      templateExerciseId: 'd1-incline-db-press',
      name: 'Plate-loaded chest press',
      createdAt: '2026-09-13T10:00:00.000Z',
      lastUsedAt: '2026-09-13T10:00:00.000Z',
      timesUsed: 1,
    }
    await liftLogDb.sessions.add(session)
    await liftLogDb.alternatives.add(alternative)

    const backup = parseBackup(serializeBackup(await createBackup()))

    expect(backup.appVersion).toBe('0.9.0')
    expect(summarizeBackup(backup)).toEqual({
      programCount: 1,
      versionCount: 1,
      completedSessionCount: 0,
      activeSessionCount: 1,
      alternativeCount: 1,
    })
    expect(backup.data.sessions[0].programVersion).toBe(1)
    expect(backup.data.alternatives[0].name).toBe('Plate-loaded chest press')
    expect(backup.data.activeProgramId).toBe(chestSpecializationProgram.id)
  })

  it('rejects malformed JSON and broken program-version references', async () => {
    expect(() => parseBackup('not-json')).toThrow('This file is not valid JSON.')

    const version = await ensureProgramVersion(chestSpecializationProgram)
    const session = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [],
      version.version,
    )
    await liftLogDb.sessions.add(session)
    const backup = await createBackup()
    backup.data.sessions[0].programVersion = 99

    expect(() => parseBackup(serializeBackup(backup))).toThrow(
      /refers to a missing program version/,
    )
  })

  it('rejects a starting week beyond the program duration', async () => {
    await ensureProgramVersion(chestSpecializationProgram)
    const backup = await createBackup()
    backup.data.programVersions[0].program.currentWeek = 15

    expect(() => parseBackup(serializeBackup(backup))).toThrow(
      /current week exceeds its duration/,
    )
  })

  it('rejects a week-specific prescription outside the program duration', async () => {
    await ensureProgramVersion(chestSpecializationProgram)
    const backup = await createBackup()
    backup.data.programVersions[0].program.workouts[0].exercises[2].weekOverrides = [
      { startWeek: 1, endWeek: 15, sets: 2 },
    ]

    expect(() => parseBackup(serializeBackup(backup))).toThrow(/range is invalid/)
  })

  it('replaces local records with an exact backup snapshot', async () => {
    await ensureProgramVersion(chestSpecializationProgram)
    const cleanBackup = await createBackup()
    const localOnlySession = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [],
      1,
    )
    localOnlySession.status = 'completed'
    localOnlySession.completedAt = localOnlySession.updatedAt
    await liftLogDb.sessions.add(localOnlySession)

    await restoreBackup(cleanBackup, 'replace')

    expect(await liftLogDb.sessions.count()).toBe(0)
    expect(await liftLogDb.programVersions.count()).toBe(1)
    expect(await getActiveProgramId()).toBe(chestSpecializationProgram.id)
  })

  it('renumbers a colliding imported version and keeps its session linked', async () => {
    await ensureProgramVersion(chestSpecializationProgram)
    const foreignVersion: ProgramVersion = {
      id: 'foreign-version',
      programId: chestSpecializationProgram.id,
      version: 1,
      createdAt: '2026-09-13T12:00:00.000Z',
      reason: 'import',
      label: 'Gym copy',
      program: chestSpecializationProgram,
    }
    const foreignSession = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[1],
      [],
      1,
    )
    const backup: LiftLogBackup = {
      format: 'liftlog-backup',
      schemaVersion: 1,
      appVersion: '0.3.0',
      createdAt: '2026-09-13T12:05:00.000Z',
      data: {
        programVersions: [foreignVersion],
        sessions: [foreignSession],
        alternatives: [],
      },
    }

    await restoreBackup(backup, 'merge')

    const versions = await liftLogDb.programVersions
      .where('programId')
      .equals(chestSpecializationProgram.id)
      .sortBy('version')
    const importedSession = await liftLogDb.sessions.get(foreignSession.id)
    expect(versions.map((version) => version.version)).toEqual([1, 2])
    expect(versions[1].reason).toBe('import')
    expect(importedSession?.programVersion).toBe(2)
  })

  it('keeps local records when a merged backup contains the same ids', async () => {
    const version = await ensureProgramVersion(chestSpecializationProgram)
    const localSession = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [],
      version.version,
    )
    localSession.exercises[0].sets[0].weightKg = 42
    localSession.status = 'completed'
    localSession.completedAt = localSession.updatedAt
    const localAlternative: ExerciseAlternative = {
      id: 'local-alternative',
      programId: chestSpecializationProgram.id,
      templateExerciseId: 'd1-incline-db-press',
      name: 'Local press',
      createdAt: '2026-09-14T12:00:00.000Z',
      lastUsedAt: '2026-09-14T12:05:00.000Z',
      timesUsed: 3,
    }
    await liftLogDb.sessions.add(localSession)
    await liftLogDb.alternatives.add(localAlternative)

    const staleBackup = await createBackup()
    staleBackup.data.programVersions[0].label = 'Stale program label'
    staleBackup.data.sessions[0].exercises[0].sets[0].weightKg = 10
    staleBackup.data.alternatives[0].timesUsed = 1

    await restoreBackup(staleBackup, 'merge')

    expect((await liftLogDb.programVersions.get(version.id))?.label).toBe(
      'Original program',
    )
    expect((await liftLogDb.sessions.get(localSession.id))?.exercises[0].sets[0].weightKg)
      .toBe(42)
    expect((await liftLogDb.alternatives.get(localAlternative.id))?.timesUsed).toBe(3)
  })
})
