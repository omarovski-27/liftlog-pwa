import { liftLogDb } from '../data/db'
import type { ExerciseTemplate, TrainingProgram, WorkoutTemplate } from '../types/program'
import type { ExerciseAlternative, ExerciseLog, SetLog, WorkoutSession } from '../types/session'
import type {
  BackupRestoreMode,
  LiftLogBackup,
  ProgramVersion,
  ProgramVersionReason,
} from '../types/storage'
import { MUSCLE_GROUPS, validateProgramDraft } from './programBuilder'
import { getExerciseMetric } from './setMetrics'
import { hasLoggedSetData } from './sessions'

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
    appVersion: '0.10.0',
    createdAt: new Date().toISOString(),
    data,
  }
}

export function serializeBackup(backup: LiftLogBackup): string {
  return `${JSON.stringify(backup, null, 2)}\n`
}

export function parseBackup(raw: string): LiftLogBackup {
  if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) throw new Error('The backup is larger than 25 MB.')
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
  if (sessions.filter((session) => session.status === 'active').length > 1) {
    throw new Error('The backup contains more than one active workout.')
  }

  const versionKeys = new Set(
    programVersions.map((version) => `${version.programId}:${version.version}`),
  )
  if (versionKeys.size !== programVersions.length) {
    throw new Error('The backup contains duplicate program version numbers.')
  }
  for (const version of programVersions) {
    if (version.basedOnVersion !== undefined && (!versionKeys.has(`${version.programId}:${version.basedOnVersion}`) || version.basedOnVersion >= version.version)) {
      throw new Error(`Program version ${version.id} refers to an invalid based-on version.`)
    }
  }

  for (const session of sessions) {
    if (!versionKeys.has(`${session.programId}:${session.programVersion}`)) {
      throw new Error(`Session ${session.id} refers to a missing program version.`)
    }
    const version = programVersions.find((entry) => entry.programId === session.programId && entry.version === session.programVersion)!
    const workout = version.program.workouts.find((entry) => entry.id === session.workoutTemplateId)
    if (!workout) throw new Error(`Session ${session.id} refers to a missing workout.`)
    if (session.weekNumber > version.program.durationWeeks) throw new Error(`Session ${session.id} week exceeds its program duration.`)
    for (const exercise of session.exercises) {
      const template = workout.exercises.find((entry) => entry.id === exercise.templateExerciseId)
      if (!template) {
        throw new Error(`Session ${session.id} refers to a missing template exercise.`)
      }
      exercise.metric ??= getExerciseMetric({ ...template, ...exercise })
      if (!exercise.pair && template.pair) exercise.pair = { ...template.pair }
      exercise.basePrescribedSets ??= template.sets
      exercise.baseRepTarget ??= template.reps
      exercise.prescriptionAdjusted ??=
        exercise.basePrescribedSets !== exercise.prescribedSets ||
        exercise.baseRepTarget !== exercise.repTarget
      if (session.status === 'completed') {
        exercise.sets.forEach((set) => {
          if (hasLoggedSetData(set)) set.completed = true
        })
      }
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
    if (!programVersions.some((version) => version.programId === alternative.programId && version.program.workouts.some((workout) => workout.exercises.some((exercise) => exercise.id === alternative.templateExerciseId)))) {
      throw new Error(`Alternative ${alternative.id} refers to a missing template exercise.`)
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
  backup = parseBackup(serializeBackup(backup))
  if (mode !== 'merge' && mode !== 'replace') throw new Error('Choose merge or replace for the backup restore.')
  const summary = summarizeBackup(backup)
  const latestIncomingVersion = backup.data.programVersions
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
  const preferredProgramId = backup.data.sessions.find((session) => session.status === 'active')?.programId
    ?? backup.data.activeProgramId ?? latestIncomingVersion.programId

  await liftLogDb.transaction(
    'rw',
    [
      liftLogDb.programVersions,
      liftLogDb.sessions,
      liftLogDb.alternatives,
      liftLogDb.settings,
    ],
    async () => {
      if (await liftLogDb.sessions.where('status').equals('active').count() > 0) {
        throw new Error('Finish or discard the active workout before restoring a backup.')
      }
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
      const existingBySessionId = new Map(existingSessions.map((session) => [session.id, session]))
      const existingByAlternativeId = new Map(existingAlternatives.map((alternative) => [alternative.id, alternative]))
      const sessionsToSave = backup.data.sessions
        .map((session) => ({
          ...session,
          programVersion:
            versionNumberMap.get(`${session.programId}:${session.programVersion}`) ??
            session.programVersion,
        }))
        .filter((session) => {
          const local = existingBySessionId.get(session.id)
          if (!local) return true
          if (
            local.programId !== session.programId ||
            local.programVersion !== session.programVersion ||
            local.workoutTemplateId !== session.workoutTemplateId
          ) {
            throw new Error('A backup session id conflicts with a different local workout.')
          }
          if (local.status === 'completed' && session.status === 'active') return false
          return (local.status === 'active' && session.status === 'completed') || Date.parse(session.updatedAt) > Date.parse(local.updatedAt)
        })
      const mergedSessions = new Map(existingBySessionId)
      sessionsToSave.forEach((session) => mergedSessions.set(session.id, session))
      if ([...mergedSessions.values()].filter((session) => session.status === 'active').length > 1) {
        throw new Error('Finish the active workout before merging another active workout.')
      }
      const alternativesToSave = backup.data.alternatives.flatMap((alternative) => {
        const local = existingByAlternativeId.get(alternative.id)
        if (!local) return [alternative]
        if (local.programId !== alternative.programId || local.templateExerciseId !== alternative.templateExerciseId) {
          throw new Error('A backup alternative id conflicts with a different local exercise.')
        }
        return Date.parse(alternative.lastUsedAt) > Date.parse(local.lastUsedAt)
          ? [{ ...alternative, timesUsed: Math.max(local.timesUsed, alternative.timesUsed) }]
          : []
      })

      if (versionsToAdd.length > 0) {
        await liftLogDb.programVersions.bulkAdd(versionsToAdd)
      }
      if (sessionsToSave.length > 0) await liftLogDb.sessions.bulkPut(sessionsToSave)
      if (alternativesToSave.length > 0) {
        await liftLogDb.alternatives.bulkPut(alternativesToSave)
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
      if (sameRecord.programId !== version.programId || JSON.stringify(canonicalValue(sameRecord.program)) !== JSON.stringify(canonicalValue(version.program))) {
        throw new Error('A backup program version id conflicts with a different local prescription.')
      }
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
            label: version.label ? `${version.label} (imported)` : 'Imported version',
          },
    )
  }

  return {
    versionsToAdd: versionsToAdd.map((version) => ({
      ...version,
      basedOnVersion: version.basedOnVersion === undefined ? undefined
        : versionNumberMap.get(`${version.programId}:${version.basedOnVersion}`) ?? version.basedOnVersion,
    })),
    versionNumberMap,
  }
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
  if (value.durationWeeks > 104) throw new Error(`${label} duration exceeds 104 weeks.`)
  assertPositiveInteger(value.liftingDaysPerWeek, `${label} lifting days`)
  assertString(value.wrestlingDaysPerWeek, `${label} wrestling days`)
  assertString(value.fullRestDay, `${label} rest day`)
  assertOneOf(value.status, ['seed', 'custom'], `${label} status`)
  assertPositiveInteger(value.currentWeek, `${label} current week`)
  if (value.seedRevision !== undefined) {
    assertPositiveInteger(value.seedRevision, `${label} seed revision`)
  }
  if (value.currentWeek > value.durationWeeks) {
    throw new Error(`${label} current week exceeds its duration.`)
  }
  assertArray(value.phases, `${label} phases`)
  value.phases.forEach((phase, index) => {
    const phaseLabel = `${label} phase ${index + 1}`
    assertRecord(phase, phaseLabel)
    assertString(phase.id, `${phaseLabel} id`)
    for (const field of ['name', 'weeks', 'nutrition', 'chestSets', 'focus']) assertString(phase[field], `${phaseLabel} ${field}`, true)
  })
  assertUniqueIds(value.phases as Array<{ id: string }>, 'phase')
  assertArray(value.chestVolumeRamp, `${label} volume ramp`)
  value.chestVolumeRamp.forEach((ramp, index) => {
    const rampLabel = `${label} volume ramp ${index + 1}`
    assertRecord(ramp, rampLabel)
    for (const field of ['weeks', 'label', 'note']) assertString(ramp[field], `${rampLabel} ${field}`, true)
    if (!Number.isInteger(ramp.setsPerWeek) || (ramp.setsPerWeek as number) < 0) throw new Error(`${rampLabel} sets are invalid.`)
  })
  if (value.startedAt !== undefined) assertDate(value.startedAt, `${label} start date`)
  assertStringArray(value.weeklyLayout, `${label} weekly layout`)
  assertRecord(value.restIntervals, `${label} rest intervals`)
  assertStringArray(Object.values(value.restIntervals), `${label} rest interval values`)
  assertStringArray(value.progressionRules, `${label} progression rules`)
  assertStringArray(value.constraints, `${label} constraints`)
  assertStringArray(value.stopTriggers, `${label} stop triggers`)
  assertArray(value.workouts, `${label} workouts`)
  if (value.workouts.length === 0) throw new Error(`${label} has no workouts.`)
  if (value.workouts.length > 14 || value.workouts.length !== value.liftingDaysPerWeek) throw new Error(`${label} lifting days do not match its workouts.`)
  const durationWeeks = value.durationWeeks
  value.workouts.forEach((workout, index) =>
    assertWorkoutTemplate(workout, `${label} workout ${index + 1}`, durationWeeks),
  )
  const workouts = value.workouts as WorkoutTemplate[]
  assertUniqueIds(workouts, 'workout')
  assertUniqueIds(workouts.flatMap((workout) => workout.exercises), 'template exercise')
  if (workouts.some((workout, index) => workout.dayNumber !== index + 1)) throw new Error(`${label} workout day numbers are not in order.`)
  const issues = validateProgramDraft(value as unknown as TrainingProgram)
  if (issues.length > 0) throw new Error(`${label}: ${issues[0].message}`)
}

function assertWorkoutTemplate(
  value: unknown,
  label: string,
  durationWeeks: number,
): asserts value is WorkoutTemplate {
  assertRecord(value, label)
  assertString(value.id, `${label} id`)
  assertPositiveInteger(value.dayNumber, `${label} day number`)
  assertString(value.title, `${label} title`)
  assertString(value.shortTitle, `${label} short title`)
  assertString(value.scheduledDay, `${label} scheduled day`)
  assertString(value.emphasis, `${label} emphasis`, true)
  assertString(value.sourceSummary, `${label} summary`, true)
  assertArray(value.exercises, `${label} exercises`)
  if (value.exercises.length === 0) throw new Error(`${label} has no exercises.`)
  value.exercises.forEach((exercise, index) =>
    assertExerciseTemplate(exercise, `${label} exercise ${index + 1}`, durationWeeks),
  )
}

function assertExerciseTemplate(
  value: unknown,
  label: string,
  durationWeeks: number,
): asserts value is ExerciseTemplate {
  assertRecord(value, label)
  assertString(value.id, `${label} id`)
  assertString(value.name, `${label} name`)
  assertOneOf(value.kind, ['warm-up', 'working', 'prehab'], `${label} kind`)
  if (value.metric !== undefined) assertOneOf(value.metric, ['reps', 'seconds', 'meters'], `${label} metric`)
  assertStringArray(value.muscleGroups, `${label} muscle groups`)
  if (value.muscleGroups.length === 0 || value.muscleGroups.some((muscle) => !MUSCLE_GROUPS.some((entry) => entry.value === muscle))) {
    throw new Error(`${label} muscle groups are invalid.`)
  }
  assertPositiveInteger(value.sets, `${label} sets`)
  if (value.sets > 99) throw new Error(`${label} sets exceed 99.`)
  assertString(value.reps, `${label} reps`)
  assertString(value.rest, `${label} rest`)
  assertString(value.section, `${label} section`)
  if (value.targetRir !== undefined) assertString(value.targetRir, `${label} target RIR`)
  if (value.notes !== undefined) assertString(value.notes, `${label} notes`)
  if (value.weekOverrides !== undefined) {
    assertArray(value.weekOverrides, `${label} week overrides`)
    if (value.weekOverrides.length > 24) {
      throw new Error(`${label} has too many week overrides.`)
    }
    const weekOverrides = value.weekOverrides
    weekOverrides.forEach((override, index) => {
      const overrideLabel = `${label} week override ${index + 1}`
      assertRecord(override, overrideLabel)
      assertPositiveInteger(override.startWeek, `${overrideLabel} start`)
      assertPositiveInteger(override.endWeek, `${overrideLabel} end`)
      const startWeek = override.startWeek
      const endWeek = override.endWeek
      if (endWeek < startWeek || endWeek > durationWeeks) {
        throw new Error(`${overrideLabel} range is invalid.`)
      }
      if (override.sets !== undefined) {
        assertPositiveInteger(override.sets, `${overrideLabel} sets`)
        if (override.sets > 99) throw new Error(`${overrideLabel} sets exceed 99.`)
      }
      if (override.reps !== undefined) assertString(override.reps, `${overrideLabel} reps`)
      if (override.sets === undefined && override.reps === undefined) {
        throw new Error(`${overrideLabel} does not change sets or reps.`)
      }
      const overlaps = weekOverrides.some((other, otherIndex) => {
        if (otherIndex >= index || typeof other !== 'object' || other === null) return false
        const prior = other as Record<string, unknown>
        return (
          typeof prior.startWeek === 'number' &&
          typeof prior.endWeek === 'number' &&
          startWeek <= prior.endWeek &&
          endWeek >= prior.startWeek
        )
      })
      if (overlaps) throw new Error(`${overrideLabel} overlaps an earlier range.`)
    })
  }
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
  if (value.status === 'completed' && value.completedAt === undefined) throw new Error(`${label} has no completion date.`)
  assertString(value.sessionNotes, `${label} notes`, true)
  assertArray(value.exercises, `${label} exercises`)
  value.exercises.forEach((exercise, index) =>
    assertExerciseLog(exercise, `${label} exercise ${index + 1}`),
  )
  assertUniqueIds(value.exercises as ExerciseLog[], 'logged exercise')
  assertUniqueIds((value.exercises as ExerciseLog[]).flatMap((exercise) => exercise.sets), 'set')
}

function assertExerciseLog(value: unknown, label: string): asserts value is ExerciseLog {
  assertRecord(value, label)
  assertString(value.id, `${label} id`)
  assertString(value.templateExerciseId, `${label} template id`)
  assertString(value.originalName, `${label} original name`)
  assertString(value.performedName, `${label} performed name`)
  assertOneOf(value.kind, ['warm-up', 'working', 'prehab'], `${label} kind`)
  if (value.metric !== undefined) assertOneOf(value.metric, ['reps', 'seconds', 'meters'], `${label} metric`)
  if (value.pair !== undefined) {
    assertRecord(value.pair, `${label} pairing`)
    assertString(value.pair.group, `${label} pairing group`)
    assertOneOf(value.pair.label, ['A', 'B'], `${label} pairing label`)
  }
  assertPositiveInteger(value.prescribedSets, `${label} prescribed sets`)
  if (value.prescribedSets > 99) throw new Error(`${label} prescribed sets exceed 99.`)
  if (value.basePrescribedSets !== undefined) {
    assertPositiveInteger(value.basePrescribedSets, `${label} base prescribed sets`)
    if (value.basePrescribedSets > 99) throw new Error(`${label} base prescribed sets exceed 99.`)
  }
  assertString(value.repTarget, `${label} rep target`)
  if (value.baseRepTarget !== undefined) assertString(value.baseRepTarget, `${label} base rep target`)
  if (value.prescriptionAdjusted !== undefined && typeof value.prescriptionAdjusted !== 'boolean') {
    throw new Error(`${label} prescription adjustment is invalid.`)
  }
  assertString(value.rest, `${label} rest`)
  if (value.targetRir !== undefined) assertString(value.targetRir, `${label} target RIR`)
  if (value.prescriptionNotes !== undefined) {
    assertString(value.prescriptionNotes, `${label} prescription notes`, true)
  }
  assertString(value.sessionNotes, `${label} session notes`, true)
  assertArray(value.sets, `${label} sets`)
  value.sets.forEach((set, index) => assertSetLog(set, `${label} set ${index + 1}`, getExerciseMetric(value as unknown as ExerciseLog)))
  if ((value.sets as SetLog[]).some((set, index) => set.number !== index + 1)) throw new Error(`${label} set numbers are not in order.`)
}

function assertSetLog(value: unknown, label: string, metric: string): asserts value is SetLog {
  assertRecord(value, label)
  assertString(value.id, `${label} id`)
  assertPositiveInteger(value.number, `${label} number`)
  assertOptionalNumber(value.weightKg, `${label} weight`, 999)
  assertOptionalNumber(value.reps, `${label} reps`, metric === 'reps' ? 999 : metric === 'seconds' ? 86400 : 100000)
  if (metric === 'reps' && value.reps !== null && !Number.isInteger(value.reps)) throw new Error(`${label} reps must be a whole number.`)
  if (value.durationSeconds !== undefined) assertOptionalNumber(value.durationSeconds, `${label} seconds`, 86400)
  if (value.distanceMeters !== undefined) assertOptionalNumber(value.distanceMeters, `${label} distance`, 100000)
  assertOptionalNumber(value.rir, `${label} RIR`, 10)
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
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${label} is missing or invalid.`)
  }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonicalValue(entry)]))
  }
  return value
}

function assertOptionalNumber(value: unknown, label: string, maximum = Infinity): asserts value is number | null {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum)) {
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
