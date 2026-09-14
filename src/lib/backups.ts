import { liftLogDb } from '../data/db'
import type { ExerciseTemplate, TrainingProgram, WorkoutTemplate } from '../types/program'
import type { ExerciseAlternative, ExerciseLog, SetLog, WorkoutSession } from '../types/session'
import type {
  BackupRestoreMode,
  LiftLogBackup,
  ProgramVersion,
  ProgramVersionReason,
} from '../types/storage'

export const MAX_BACKUP_BYTES = 25 * 1024 * 1024

export interface BackupSummary {
  programCount: number
  versionCount: number
  completedSessionCount: number
  activeSessionCount: number
  alternativeCount: number
}

export interface BackupRestoreResult extends BackupSummary {
  mode: BackupRestoreMode
  preferredProgramId: string
}

export async function createBackup(): Promise<LiftLogBackup> {
  const data = await liftLogDb.transaction(
    'r',
    [
      liftLogDb.programVersions,
      liftLogDb.sessions,
      liftLogDb.alternatives,
      liftLogDb.settings,
    ],
    async () => {
      const settings = await liftLogDb.settings.get('app')
      return {
        activeProgramId: settings?.activeProgramId,
        programVersions: await liftLogDb.programVersions.toArray(),
        sessions: await liftLogDb.sessions.toArray(),
        alternatives: await liftLogDb.alternatives.toArray(),
      }
    },
  )

  return {
    format: 'liftlog-backup',
    schemaVersion: 1,
    appVersion: '0.7.1',
    createdAt: new Date().toISOString(),
    data,
  }
}

export function serializeBackup(backup: LiftLogBackup): string {
  return `${JSON.stringify(backup, null, 2)}\n`
}

export function parseBackup(raw: string): LiftLogBackup {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('This file is not valid JSON.')
  }

  assertRecord(value, 'Backup')
  assertEqual(value.format, 'liftlog-backup', 'Backup format is not supported.')
  assertEqual(value.schemaVersion, 1, 'Backup schema version is not supported.')
  assertString(value.appVersion, 'Backup app version')
  assertDate(value.createdAt, 'Backup creation date')
  assertRecord(value.data, 'Backup data')
  assertArray(value.data.programVersions, 'Program versions')
  assertArray(value.data.sessions, 'Sessions')
  assertArray(value.data.alternatives, 'Alternatives')

  if (value.data.programVersions.length === 0) {
    throw new Error('The backup does not contain a program.')
  }

  value.data.programVersions.forEach((item, index) =>
    assertProgramVersion(item, `Program version ${index + 1}`),
  )
  value.data.sessions.forEach((item, index) => assertSession(item, `Session ${index + 1}`))
  value.data.alternatives.forEach((item, index) =>
    assertAlternative(item, `Alternative ${index + 1}`),
  )

  const programVersions = value.data.programVersions as ProgramVersion[]
  const sessions = value.data.sessions as WorkoutSession[]
  const alternatives = value.data.alternatives as ExerciseAlternative[]

  assertUniqueIds(programVersions, 'program version')
  assertUniqueIds(sessions, 'session')
  assertUniqueIds(alternatives, 'alternative')

  const versionKeys = new Set(
    programVersions.map((version) => `${version.programId}:${version.version}`),
  )
  if (versionKeys.size !== programVersions.length) {
    throw new Error('The backup contains duplicate program version numbers.')
  }

  for (const session of sessions) {
    if (!versionKeys.has(`${session.programId}:${session.programVersion}`)) {
      throw new Error(`Session ${session.id} refers to a missing program version.`)
    }
  }

  const programIds = new Set(programVersions.map((version) => version.programId))
  if (value.data.activeProgramId !== undefined) {
    assertString(value.data.activeProgramId, 'Active program id')
    if (!programIds.has(value.data.activeProgramId)) {
      throw new Error('The active program refers to a missing program.')
    }
  }
  for (const alternative of alternatives) {
    if (!programIds.has(alternative.programId)) {
      throw new Error(`Alternative ${alternative.id} refers to a missing program.`)
    }
  }

  return value as unknown as LiftLogBackup
}

export function summarizeBackup(backup: LiftLogBackup): BackupSummary {
  return {
    programCount: new Set(backup.data.programVersions.map((version) => version.programId)).size,
    versionCount: backup.data.programVersions.length,
    completedSessionCount: backup.data.sessions.filter(
      (session) => session.status === 'completed',
    ).length,
    activeSessionCount: backup.data.sessions.filter((session) => session.status === 'active')
      .length,
    alternativeCount: backup.data.alternatives.length,
  }
}

export async function restoreBackup(
  backup: LiftLogBackup,
  mode: BackupRestoreMode,
): Promise<BackupRestoreResult> {
  const summary = summarizeBackup(backup)
  const latestIncomingVersion = backup.data.programVersions.slice().sort(compareVersions)[0]
  const preferredProgramId = backup.data.activeProgramId ?? latestIncomingVersion.programId

  await liftLogDb.transaction(
    'rw',
    [
      liftLogDb.programVersions,
      liftLogDb.sessions,
      liftLogDb.alternatives,
      liftLogDb.settings,
    ],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          liftLogDb.programVersions.clear(),
          liftLogDb.sessions.clear(),
          liftLogDb.alternatives.clear(),
          liftLogDb.settings.clear(),
        ])
        await liftLogDb.programVersions.bulkAdd(backup.data.programVersions)
        await liftLogDb.sessions.bulkAdd(backup.data.sessions)
        await liftLogDb.alternatives.bulkAdd(backup.data.alternatives)
        await liftLogDb.settings.put({
          id: 'app',
          activeProgramId: preferredProgramId,
          updatedAt: new Date().toISOString(),
        })
        return
      }

      const [existingVersions, existingSessions, existingAlternatives] = await Promise.all([
        liftLogDb.programVersions.toArray(),
        liftLogDb.sessions.toArray(),
        liftLogDb.alternatives.toArray(),
      ])
      const { versionsToAdd, versionNumberMap } = mergeProgramVersions(
        existingVersions,
        backup.data.programVersions,
      )
      const existingSessionIds = new Set(existingSessions.map((session) => session.id))
      const existingAlternativeIds = new Set(
        existingAlternatives.map((alternative) => alternative.id),
      )
      const sessionsToAdd = backup.data.sessions
        .filter((session) => !existingSessionIds.has(session.id))
        .map((session) => ({
          ...session,
          programVersion:
            versionNumberMap.get(`${session.programId}:${session.programVersion}`) ??
            session.programVersion,
        }))
      const alternativesToAdd = backup.data.alternatives.filter(
        (alternative) => !existingAlternativeIds.has(alternative.id),
      )

      if (versionsToAdd.length > 0) {
        await liftLogDb.programVersions.bulkAdd(versionsToAdd)
      }
      if (sessionsToAdd.length > 0) await liftLogDb.sessions.bulkAdd(sessionsToAdd)
      if (alternativesToAdd.length > 0) {
        await liftLogDb.alternatives.bulkAdd(alternativesToAdd)
      }
      await liftLogDb.settings.put({
        id: 'app',
        activeProgramId: preferredProgramId,
        updatedAt: new Date().toISOString(),
      })
    },
  )

  return {
    ...summary,
    mode,
    preferredProgramId,
  }
}

function mergeProgramVersions(
  existing: ProgramVersion[],
  incoming: ProgramVersion[],
): {
  versionsToAdd: ProgramVersion[]
  versionNumberMap: Map<string, number>
} {
  const existingById = new Map(existing.map((version) => [version.id, version]))
  const usedVersions = new Map<string, Set<number>>()
  const maximumVersions = new Map<string, number>()
  const versionNumberMap = new Map<string, number>()

  for (const version of existing) {
    const used = usedVersions.get(version.programId) ?? new Set<number>()
    used.add(version.version)
    usedVersions.set(version.programId, used)
    maximumVersions.set(
      version.programId,
      Math.max(maximumVersions.get(version.programId) ?? 0, version.version),
    )
  }

  const versionsToAdd: ProgramVersion[] = []
  for (const version of incoming.slice().sort((a, b) => a.version - b.version)) {
    const key = `${version.programId}:${version.version}`
    const sameRecord = existingById.get(version.id)
    if (sameRecord) {
      versionNumberMap.set(key, sameRecord.version)
      continue
    }

    const used = usedVersions.get(version.programId) ?? new Set<number>()
    let nextVersion = version.version
    if (used.has(nextVersion)) {
      nextVersion = (maximumVersions.get(version.programId) ?? 0) + 1
    }
    used.add(nextVersion)
    usedVersions.set(version.programId, used)
    maximumVersions.set(
      version.programId,
      Math.max(maximumVersions.get(version.programId) ?? 0, nextVersion),
    )
    versionNumberMap.set(key, nextVersion)

    versionsToAdd.push(
      nextVersion === version.version
        ? version
        : {
            ...version,
            version: nextVersion,
            reason: 'import' as const,
            basedOnVersion: version.version,
            label: version.label ? `${version.label} (imported)` : 'Imported version',
          },
    )
  }

  return { versionsToAdd, versionNumberMap }
}

function assertProgramVersion(value: unknown, label: string): asserts value is ProgramVersion {
  assertRecord(value, label)
  assertString(value.id, `${label} id`)
  assertString(value.programId, `${label} program id`)
  assertPositiveInteger(value.version, `${label} number`)
  assertDate(value.createdAt, `${label} creation date`)
  assertOneOf<ProgramVersionReason>(
    value.reason,
    ['seed', 'create', 'edit', 'import', 'restore'],
    `${label} reason`,
  )
  if (value.basedOnVersion !== undefined) {
    assertPositiveInteger(value.basedOnVersion, `${label} based-on version`)
  }
  if (value.label !== undefined) assertString(value.label, `${label} label`)
  assertTrainingProgram(value.program, `${label} program`)
  if (value.program.id !== value.programId) {
    throw new Error(`${label} has inconsistent program ids.`)
  }
}

function assertTrainingProgram(value: unknown, label: string): asserts value is TrainingProgram {
  assertRecord(value, label)
  assertString(value.id, `${label} id`)
  assertString(value.name, `${label} name`)
  assertString(value.source, `${label} source`)
  assertPositiveInteger(value.durationWeeks, `${label} duration`)
  assertPositiveInteger(value.liftingDaysPerWeek, `${label} lifting days`)
  assertString(value.wrestlingDaysPerWeek, `${label} wrestling days`)
  assertString(value.fullRestDay, `${label} rest day`)
  assertOneOf(value.status, ['seed', 'custom'], `${label} status`)
  assertPositiveInteger(value.currentWeek, `${label} current week`)
  if (value.currentWeek > value.durationWeeks) {
    throw new Error(`${label} current week exceeds its duration.`)
  }
  assertArray(value.phases, `${label} phases`)
  assertArray(value.chestVolumeRamp, `${label} volume ramp`)
  assertStringArray(value.weeklyLayout, `${label} weekly layout`)
  assertRecord(value.restIntervals, `${label} rest intervals`)
  assertStringArray(Object.values(value.restIntervals), `${label} rest interval values`)
  assertStringArray(value.progressionRules, `${label} progression rules`)
  assertStringArray(value.constraints, `${label} constraints`)
  assertStringArray(value.stopTriggers, `${label} stop triggers`)
  assertArray(value.workouts, `${label} workouts`)
  if (value.workouts.length === 0) throw new Error(`${label} has no workouts.`)
  value.workouts.forEach((workout, index) =>
    assertWorkoutTemplate(workout, `${label} workout ${index + 1}`),
  )
}

function assertWorkoutTemplate(value: unknown, label: string): asserts value is WorkoutTemplate {
  assertRecord(value, label)
  assertString(value.id, `${label} id`)
  assertPositiveInteger(value.dayNumber, `${label} day number`)
  assertString(value.title, `${label} title`)
  assertString(value.shortTitle, `${label} short title`)
  assertString(value.scheduledDay, `${label} scheduled day`)
  assertString(value.emphasis, `${label} emphasis`)
  assertString(value.sourceSummary, `${label} summary`)
  assertArray(value.exercises, `${label} exercises`)
  if (value.exercises.length === 0) throw new Error(`${label} has no exercises.`)
  value.exercises.forEach((exercise, index) =>
    assertExerciseTemplate(exercise, `${label} exercise ${index + 1}`),
  )
}

function assertExerciseTemplate(value: unknown, label: string): asserts value is ExerciseTemplate {
  assertRecord(value, label)
  assertString(value.id, `${label} id`)
  assertString(value.name, `${label} name`)
  assertOneOf(value.kind, ['warm-up', 'working', 'prehab'], `${label} kind`)
  assertStringArray(value.muscleGroups, `${label} muscle groups`)
  assertPositiveInteger(value.sets, `${label} sets`)
  assertString(value.reps, `${label} reps`)
  assertString(value.rest, `${label} rest`)
  assertString(value.section, `${label} section`)
  if (value.targetRir !== undefined) assertString(value.targetRir, `${label} target RIR`)
  if (value.notes !== undefined) assertString(value.notes, `${label} notes`)
  if (value.pair !== undefined) {
    assertRecord(value.pair, `${label} pairing`)
    assertString(value.pair.group, `${label} pairing group`)
    assertOneOf(value.pair.label, ['A', 'B'], `${label} pairing label`)
  }
}

function assertSession(value: unknown, label: string): asserts value is WorkoutSession {
  assertRecord(value, label)
  assertString(value.id, `${label} id`)
  assertString(value.programId, `${label} program id`)
  assertString(value.workoutTemplateId, `${label} workout id`)
  assertString(value.workoutTitle, `${label} title`)
  assertPositiveInteger(value.workoutDayNumber, `${label} day number`)
  assertPositiveInteger(value.programVersion, `${label} program version`)
  assertPositiveInteger(value.weekNumber, `${label} week`)
  assertOneOf(value.status, ['active', 'completed'], `${label} status`)
  assertDate(value.startedAt, `${label} start date`)
  assertDate(value.updatedAt, `${label} update date`)
  if (value.completedAt !== undefined) assertDate(value.completedAt, `${label} completion date`)
  assertString(value.sessionNotes, `${label} notes`, true)
  assertArray(value.exercises, `${label} exercises`)
  value.exercises.forEach((exercise, index) =>
    assertExerciseLog(exercise, `${label} exercise ${index + 1}`),
  )
}

function assertExerciseLog(value: unknown, label: string): asserts value is ExerciseLog {
  assertRecord(value, label)
  assertString(value.id, `${label} id`)
  assertString(value.templateExerciseId, `${label} template id`)
  assertString(value.originalName, `${label} original name`)
  assertString(value.performedName, `${label} performed name`)
  assertOneOf(value.kind, ['warm-up', 'working', 'prehab'], `${label} kind`)
  assertPositiveInteger(value.prescribedSets, `${label} prescribed sets`)
  assertString(value.repTarget, `${label} rep target`)
  assertString(value.rest, `${label} rest`)
  if (value.targetRir !== undefined) assertString(value.targetRir, `${label} target RIR`)
  if (value.prescriptionNotes !== undefined) {
    assertString(value.prescriptionNotes, `${label} prescription notes`, true)
  }
  assertString(value.sessionNotes, `${label} session notes`, true)
  assertArray(value.sets, `${label} sets`)
  value.sets.forEach((set, index) => assertSetLog(set, `${label} set ${index + 1}`))
}

function assertSetLog(value: unknown, label: string): asserts value is SetLog {
  assertRecord(value, label)
  assertString(value.id, `${label} id`)
  assertPositiveInteger(value.number, `${label} number`)
  assertOptionalNumber(value.weightKg, `${label} weight`)
  assertOptionalNumber(value.reps, `${label} reps`)
  assertOptionalNumber(value.rir, `${label} RIR`)
  if (typeof value.completed !== 'boolean') throw new Error(`${label} completion is invalid.`)
}

function assertAlternative(value: unknown, label: string): asserts value is ExerciseAlternative {
  assertRecord(value, label)
  assertString(value.id, `${label} id`)
  assertString(value.programId, `${label} program id`)
  assertString(value.templateExerciseId, `${label} exercise id`)
  assertString(value.name, `${label} name`)
  assertDate(value.createdAt, `${label} creation date`)
  assertDate(value.lastUsedAt, `${label} last-used date`)
  assertPositiveInteger(value.timesUsed, `${label} use count`)
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} is missing or invalid.`)
  }
}

function assertArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a list.`)
}

function assertString(value: unknown, label: string, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
    throw new Error(`${label} is missing or invalid.`)
  }
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  assertArray(value, label)
  if (!value.every((item) => typeof item === 'string')) {
    throw new Error(`${label} contains an invalid value.`)
  }
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`${label} is missing or invalid.`)
  }
}

function assertOptionalNumber(value: unknown, label: string): asserts value is number | null {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    throw new Error(`${label} is invalid.`)
  }
}

function assertDate(value: unknown, label: string): asserts value is string {
  assertString(value, label)
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} is invalid.`)
}

function assertEqual<T>(value: unknown, expected: T, message: string): asserts value is T {
  if (value !== expected) throw new Error(message)
}

function assertOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): asserts value is T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`${label} is invalid.`)
  }
}

function assertUniqueIds(items: Array<{ id: string }>, label: string) {
  const ids = new Set(items.map((item) => item.id))
  if (ids.size !== items.length) throw new Error(`The backup contains duplicate ${label} ids.`)
}

function compareVersions(a: ProgramVersion, b: ProgramVersion): number {
  if (a.version !== b.version) return b.version - a.version
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}
