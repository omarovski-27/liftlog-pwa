import Dexie, { type Table } from 'dexie'
import type { TrainingProgram } from '../types/program'
import type { ExerciseAlternative, WorkoutSession } from '../types/session'
import type {
  AppSettings,
  ProgramVersion,
  ProgramVersionReason,
} from '../types/storage'

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
  }
}

export const liftLogDb = new LiftLogDatabase()

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

export async function saveSession(session: WorkoutSession): Promise<void> {
  await liftLogDb.sessions.put(session)
}

export async function deleteSession(sessionId: string): Promise<void> {
  await liftLogDb.sessions.delete(sessionId)
}

export async function saveAlternative(alternative: ExerciseAlternative): Promise<void> {
  await liftLogDb.alternatives.put(alternative)
}

export async function getActiveProgramId(): Promise<string | undefined> {
  return (await liftLogDb.settings.get('app'))?.activeProgramId
}

export async function setActiveProgramId(programId: string): Promise<void> {
  await liftLogDb.settings.put({
    id: 'app',
    activeProgramId: programId,
    updatedAt: new Date().toISOString(),
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
  return liftLogDb.transaction('rw', liftLogDb.programVersions, async () => {
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
