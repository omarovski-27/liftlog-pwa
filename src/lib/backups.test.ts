import { describe, expect, it } from 'vitest'
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

  it('replaces local records with an exact backup snapshot', async () => {
    await ensureProgramVersion(chestSpecializationProgram)
    const cleanBackup = await createBackup()
    const localOnlySession = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [],
      1,
    )
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
