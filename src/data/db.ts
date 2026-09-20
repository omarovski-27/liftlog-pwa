import Dexie, { type Table } from 'dexie'
import type { TrainingProgram } from '../types/program'
import type { ExerciseAlternative, WorkoutSession } from '../types/session'
import type {
  AppSettings,
  ProgramVersion,
  ProgramVersionReason,
} from '../types/storage'
import { getExerciseMetric } from '../lib/setMetrics'
import { hasLoggedSetData } from '../lib/sessions'
import { ProgramDraftError, validateProgramDraft } from '../lib/programBuilder'
import { readRememberedSessions } from '../lib/sessionRecovery'

export class LiftLogDatabase extends Dexie {
  sessions!: Table<WorkoutSession, string>
  alternatives!: Table<ExerciseAlternative, string>
  programVersions!: Table<ProgramVersion, string>
  settings!: Table<AppSettings, string>

  constructor(name = 'liftlog') {
    super(name)
    this.version(1).stores({
      sessions:
        'id, programId, workoutTemplateId, status, startedAt, updatedAt, completedAt',
      alternatives: 'id, [programId+templateExerciseId], lastUsedAt',
    })
    this.version(2)
      .stores({
        sessions:
          'id, programId, workoutTemplateId, status, startedAt, updatedAt, completedAt, programVersion',
        alternatives: 'id, [programId+templateExerciseId], lastUsedAt',
        programVersions: 'id, programId, [programId+version], version, createdAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<WorkoutSession, string>('sessions')
          .toCollection()
          .modify((session) => {
            if (!session.programVersion) session.programVersion = 1
          })
      })
    this.version(3)
      .stores({
        sessions:
          'id, programId, workoutTemplateId, status, startedAt, updatedAt, completedAt, programVersion',
        alternatives: 'id, [programId+templateExerciseId], lastUsedAt',
        programVersions: 'id, programId, [programId+version], version, createdAt',
      })
      .upgrade(async (transaction) => {
        const table = transaction.table<ProgramVersion, string>('programVersions')
        const versions = await table.toArray()
        const { duplicateIds } = partitionProgramVersions(versions)

        if (duplicateIds.length > 0) await table.bulkDelete(duplicateIds)
      })
    this.version(4).stores({
      sessions:
        'id, programId, workoutTemplateId, status, startedAt, updatedAt, completedAt, programVersion',
      alternatives: 'id, [programId+templateExerciseId], lastUsedAt',
      programVersions: 'id, programId, [programId+version], version, createdAt',
      settings: 'id, activeProgramId, updatedAt',
    })
    this.version(5).stores({}).upgrade(async (transaction) => {
      const versions = await transaction.table<ProgramVersion, string>('programVersions').toArray()
      await transaction.table<WorkoutSession, string>('sessions').toCollection().modify((session) => {
        const version = versions.find((entry) => entry.programId === session.programId && entry.version === session.programVersion)
        const workout = version?.program.workouts.find((entry) => entry.id === session.workoutTemplateId)
        session.exercises.forEach((exercise) => {
          const template = workout?.exercises.find((entry) => entry.id === exercise.templateExerciseId)
          exercise.metric ??= getExerciseMetric({ ...template, ...exercise })
          if (!exercise.pair && template?.pair) exercise.pair = { ...template.pair }
        })
      })
    })
    this.version(6).stores({}).upgrade(async (transaction) => {
      const versions = await transaction.table<ProgramVersion, string>('programVersions').toArray()
      await transaction.table<WorkoutSession, string>('sessions').toCollection().modify((session) => {
        const version = versions.find(
          (entry) => entry.programId === session.programId && entry.version === session.programVersion,
        )
        const workout = version?.program.workouts.find(
          (entry) => entry.id === session.workoutTemplateId,
        )
        session.exercises.forEach((exercise) => {
          const template = workout?.exercises.find(
            (entry) => entry.id === exercise.templateExerciseId,
          )
          exercise.basePrescribedSets ??= template?.sets ?? exercise.prescribedSets
          exercise.baseRepTarget ??= template?.reps ?? exercise.repTarget
          exercise.prescriptionAdjusted ??=
            exercise.basePrescribedSets !== exercise.prescribedSets ||
            exercise.baseRepTarget !== exercise.repTarget
          if (session.status === 'completed') {
            exercise.sets.forEach((set) => {
              if (hasLoggedSetData(set)) set.completed = true
            })
          }
        })
      })
    })
  }
}

export const liftLogDb = new LiftLogDatabase()

export async function recoverRememberedSessions(): Promise<number> {
  const remembered = readRememberedSessions()
  if (remembered.length === 0) return 0

  return liftLogDb.transaction('rw', liftLogDb.sessions, async () => {
    let recovered = 0
    for (const session of remembered) {
      const existing = await liftLogDb.sessions.get(session.id)
      if (!existing || Date.parse(session.updatedAt) > Date.parse(existing.updatedAt)) {
        await liftLogDb.sessions.put(session)
        recovered += 1
      }
    }
    return recovered
  })
}

export async function loadProgramRecords(programId: string): Promise<{
  sessions: WorkoutSession[]
  alternatives: ExerciseAlternative[]
  programVersions: ProgramVersion[]
}> {
  const [sessions, alternatives, programVersions] = await Promise.all([
    liftLogDb.sessions.where('programId').equals(programId).toArray(),
    liftLogDb.alternatives.where('programId').equals(programId).toArray(),
    liftLogDb.programVersions.where('programId').equals(programId).toArray(),
  ])

  return { sessions, alternatives, programVersions }
}

export class SessionConflictError extends Error {
  constructor(message = 'This workout changed in another window. Reload the saved workout before continuing.') {
    super(message)
    this.name = 'SessionConflictError'
  }
}

export async function saveSession(session: WorkoutSession, expectedUpdatedAt?: string): Promise<void> {
  await liftLogDb.transaction('rw', liftLogDb.sessions, async () => {
    const existing = await liftLogDb.sessions.get(session.id)
    if (expectedUpdatedAt !== undefined && existing?.updatedAt !== expectedUpdatedAt) throw new SessionConflictError()
    if (existing?.status === 'completed' && session.status === 'active') throw new SessionConflictError()
    if (!existing && session.status === 'active' && await liftLogDb.sessions.where('status').equals('active').count() > 0) {
      throw new SessionConflictError('Another workout is already active in another window. Reload the saved workout.')
    }
    await liftLogDb.sessions.put(session)
  })
}

export async function deleteSession(sessionId: string, expectedUpdatedAt?: string): Promise<void> {
  await liftLogDb.transaction('rw', liftLogDb.sessions, async () => {
    const existing = await liftLogDb.sessions.get(sessionId)
    if (existing?.status === 'completed' || (expectedUpdatedAt !== undefined && existing?.updatedAt !== expectedUpdatedAt)) throw new SessionConflictError()
    await liftLogDb.sessions.delete(sessionId)
  })
}

export async function saveAlternative(alternative: ExerciseAlternative): Promise<void> {
  await liftLogDb.alternatives.put(alternative)
}

export async function getActiveProgramId(): Promise<string | undefined> {
  return (await liftLogDb.settings.get('app'))?.activeProgramId
}

export async function setActiveProgramId(programId: string): Promise<void> {
  await liftLogDb.transaction('rw', [liftLogDb.sessions, liftLogDb.settings], async () => {
    const active = await liftLogDb.sessions.where('status').equals('active').first()
    if (active && active.programId !== programId) throw new Error('Finish the active workout before switching programs.')
    await liftLogDb.settings.put({ id: 'app', activeProgramId: programId, updatedAt: new Date().toISOString() })
  })
}

export async function loadProgramLibrary(): Promise<ProgramVersion[]> {
  const versions = await liftLogDb.programVersions.toArray()
  const latestByProgram = new Map<string, ProgramVersion>()

  for (const version of versions) {
    const current = latestByProgram.get(version.programId)
    if (!current || getLatestProgramVersion([current, version])?.id === version.id) {
      latestByProgram.set(version.programId, version)
    }
  }

  return [...latestByProgram.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

export async function ensureProgramVersion(program: TrainingProgram): Promise<ProgramVersion> {
  return liftLogDb.transaction('rw', liftLogDb.programVersions, async () => {
    const versions = await liftLogDb.programVersions
      .where('programId')
      .equals(program.id)
      .toArray()
    const { duplicateIds, uniqueVersions } = partitionProgramVersions(versions)
    if (duplicateIds.length > 0) {
      await liftLogDb.programVersions.bulkDelete(duplicateIds)
    }

    const latest = getLatestProgramVersion(uniqueVersions)
    if (latest) {
      const incomingRevision = program.seedRevision ?? 1
      const storedRevision = latest.program.seedRevision ?? 1
      if (
        latest.reason === 'seed' &&
        latest.program.status === 'seed' &&
        incomingRevision > storedRevision
      ) {
        const updatedSeed: ProgramVersion = {
          id: makeVersionId(),
          programId: program.id,
          version: Math.max(...uniqueVersions.map((version) => version.version)) + 1,
          createdAt: new Date().toISOString(),
          reason: 'seed',
          basedOnVersion: latest.version,
          label: `Source program revision ${incomingRevision}`,
          program,
        }
        await liftLogDb.programVersions.add(updatedSeed)
        return updatedSeed
      }
      return latest
    }

    const seedVersion: ProgramVersion = {
      id: makeVersionId(),
      programId: program.id,
      version: 1,
      createdAt: new Date().toISOString(),
      reason: 'seed',
      label: 'Original program',
      program,
    }
    await liftLogDb.programVersions.add(seedVersion)
    return seedVersion
  })
}

export async function saveProgramVersion(
  program: TrainingProgram,
  reason: ProgramVersionReason,
  options: { basedOnVersion?: number; label?: string } = {},
): Promise<ProgramVersion> {
  const issues = validateProgramDraft(program)
  if (issues.length > 0) throw new ProgramDraftError(issues)
  return liftLogDb.transaction('rw', [liftLogDb.programVersions, liftLogDb.sessions], async () => {
    if (await liftLogDb.sessions.where('status').equals('active').count() > 0) throw new Error('Program changes are locked during an active workout.')
    const versions = await liftLogDb.programVersions
      .where('programId')
      .equals(program.id)
      .toArray()
    const nextVersion = Math.max(0, ...versions.map((version) => version.version)) + 1
    const record: ProgramVersion = {
      id: makeVersionId(),
      programId: program.id,
      version: nextVersion,
      createdAt: new Date().toISOString(),
      reason,
      basedOnVersion: options.basedOnVersion,
      label: options.label,
      program,
    }
    await liftLogDb.programVersions.add(record)
    return record
  })
}

export function getLatestProgramVersion(
  versions: ProgramVersion[],
): ProgramVersion | undefined {
  return versions.slice().sort((a, b) => {
    if (a.version !== b.version) return b.version - a.version
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })[0]
}

function makeVersionId(): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `program-version-${id}`
}

function partitionProgramVersions(versions: ProgramVersion[]): {
  duplicateIds: string[]
  uniqueVersions: ProgramVersion[]
} {
  const seen = new Set<string>()
  const duplicateIds: string[] = []
  const uniqueVersions: ProgramVersion[] = []

  versions
    .slice()
    .sort((a, b) => {
      const createdAtDifference =
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      return createdAtDifference || a.id.localeCompare(b.id)
    })
    .forEach((version) => {
      const key = JSON.stringify([version.programId, version.version])
      if (seen.has(key)) duplicateIds.push(version.id)
      else {
        seen.add(key)
        uniqueVersions.push(version)
      }
    })

  return { duplicateIds, uniqueVersions }
}
