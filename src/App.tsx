import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { BottomNav, type AppTab } from './components/BottomNav'
import { HistoryView } from './components/HistoryView'
import { ProgramImport } from './components/ProgramImport'
import {
  ProgramBuilder,
  type ProgramBuilderMode,
} from './components/ProgramBuilder'
import { ProgramView } from './components/ProgramView'
import { SessionView } from './components/SessionView'
import { TrainView } from './components/TrainView'
import { chestSpecializationProgram } from './data/chestSpecializationProgram'
import {
  deleteSession,
  ensureProgramVersion,
  getActiveProgramId,
  getLatestProgramVersion,
  liftLogDb,
  loadProgramLibrary,
  loadProgramRecords,
  saveAlternative,
  saveProgramVersion,
  saveSession,
  setActiveProgramId,
} from './data/db'
import { restoreBackup } from './lib/backups'
import { getSessionPersonalRecords } from './lib/analytics'
import {
  createEmptyProgram,
  createProgramCopy,
} from './lib/programBuilder'
import { serializeProgramFile } from './lib/programImport'
import { createWorkoutSession, getActiveSession, getNextWorkout } from './lib/sessions'
import { usePwaInstall } from './hooks/usePwaInstall'
import type { TrainingProgram, WorkoutTemplate } from './types/program'
import type { ExerciseAlternative, WorkoutSession } from './types/session'
import type {
  BackupRestoreMode,
  LiftLogBackup,
  ProgramVersion,
} from './types/storage'

const seedProgram = chestSpecializationProgram

interface WorkspaceSnapshot {
  program: TrainingProgram
  currentVersion: ProgramVersion
  programVersions: ProgramVersion[]
  sessions: WorkoutSession[]
  alternatives: ExerciseAlternative[]
  programLibrary: ProgramVersion[]
}

interface BuilderRequest {
  basedOnVersion?: number
  initialProgram: TrainingProgram
  mode: ProgramBuilderMode
  sourceName?: string
}

function App() {
  const [program, setProgram] = useState<TrainingProgram>(seedProgram)
  const [currentVersion, setCurrentVersion] = useState<ProgramVersion | null>(null)
  const [programVersions, setProgramVersions] = useState<ProgramVersion[]>([])
  const [programLibrary, setProgramLibrary] = useState<ProgramVersion[]>([])
  const [activeTab, setActiveTab] = useState<AppTab>('train')
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const [alternatives, setAlternatives] = useState<ExerciseAlternative[]>([])
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)
  const [selectedWorkoutId, setSelectedWorkoutId] = useState(seedProgram.workouts[0].id)
  const [notice, setNotice] = useState<string | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [builderRequest, setBuilderRequest] = useState<BuilderRequest | null>(null)
  const [programImportOpen, setProgramImportOpen] = useState(false)
  const install = usePwaInstall()

  const nextWorkout = useMemo(() => getNextWorkout(program, sessions), [program, sessions])
  const openSession = sessions.find((session) => session.id === openSessionId)

  useEffect(() => {
    let cancelled = false

    async function openWorkspace() {
      try {
        await ensureProgramVersion(seedProgram)
        const preferredProgramId = (await getActiveProgramId()) ?? seedProgram.id
        const snapshot = await readWorkspace(preferredProgramId)
        await setActiveProgramId(snapshot.program.id)
        if (!cancelled) applySnapshot(snapshot, true)
      } catch {
        if (!cancelled) {
          setStorageError('Workout data could not be opened on this device.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    function applySnapshot(snapshot: WorkspaceSnapshot, resumeActive: boolean) {
      setProgram(snapshot.program)
      setCurrentVersion(snapshot.currentVersion)
      setProgramVersions(snapshot.programVersions)
      setProgramLibrary(snapshot.programLibrary)
      setSessions(snapshot.sessions)
      setAlternatives(snapshot.alternatives)

      const activeSession = getActiveSession(snapshot.sessions)
      if (activeSession && resumeActive) {
        setOpenSessionId(activeSession.id)
        setSelectedWorkoutId(activeSession.workoutTemplateId)
      } else {
        setOpenSessionId(null)
        setSelectedWorkoutId(getNextWorkout(snapshot.program, snapshot.sessions).id)
      }
    }

    void openWorkspace()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  function applyWorkspace(snapshot: WorkspaceSnapshot, resumeActive = true) {
    setProgram(snapshot.program)
    setCurrentVersion(snapshot.currentVersion)
    setProgramVersions(snapshot.programVersions)
    setProgramLibrary(snapshot.programLibrary)
    setSessions(snapshot.sessions)
    setAlternatives(snapshot.alternatives)

    const activeSession = getActiveSession(snapshot.sessions)
    if (activeSession && resumeActive) {
      setOpenSessionId(activeSession.id)
      setSelectedWorkoutId(activeSession.workoutTemplateId)
    } else {
      setOpenSessionId(null)
      setSelectedWorkoutId(getNextWorkout(snapshot.program, snapshot.sessions).id)
    }
  }

  function upsertSession(session: WorkoutSession) {
    setSessions((current) => {
      const exists = current.some((item) => item.id === session.id)
      return exists
        ? current.map((item) => (item.id === session.id ? session : item))
        : [...current, session]
    })

    void saveSession(session).catch(() => {
      setStorageError('The latest change could not be saved.')
    })
  }

  function startWorkout(workout: WorkoutTemplate) {
    if (!currentVersion) return
    const existingActive = getActiveSession(sessions)
    if (existingActive) {
      setOpenSessionId(existingActive.id)
      return
    }

    const session = createWorkoutSession(
      program,
      workout,
      sessions,
      currentVersion.version,
    )
    upsertSession(session)
    setOpenSessionId(session.id)
    setSelectedWorkoutId(workout.id)
  }

  function resumeWorkout(session: WorkoutSession) {
    setOpenSessionId(session.id)
  }

  function changeOpenSession(updatedSession: WorkoutSession) {
    upsertSession({ ...updatedSession, updatedAt: new Date().toISOString() })
  }

  function finishOpenSession() {
    if (!openSession) return
    const completedAt = new Date().toISOString()
    const completedSession: WorkoutSession = {
      ...openSession,
      status: 'completed',
      completedAt,
      updatedAt: completedAt,
    }
    const nextSessions = sessions.map((session) =>
      session.id === completedSession.id ? completedSession : session,
    )
    const personalRecords = getSessionPersonalRecords(completedSession, sessions)

    upsertSession(completedSession)
    setSelectedWorkoutId(getNextWorkout(program, nextSessions).id)
    setOpenSessionId(null)
    setActiveTab('history')
    setNotice(
      personalRecords.length === 0
        ? 'Workout saved'
        : `Workout saved. ${personalRecords.length} exercise PR${personalRecords.length === 1 ? '' : 's'}`,
    )
  }

  function discardOpenSession() {
    if (!openSession) return
    const sessionId = openSession.id
    setSessions((current) => current.filter((session) => session.id !== sessionId))
    setOpenSessionId(null)
    setActiveTab('train')
    void deleteSession(sessionId).catch(() => {
      setStorageError('The unfinished workout could not be removed.')
    })
  }

  function replaceExercise(exerciseId: string, name: string, remember: boolean) {
    if (!openSession) return
    const targetExercise = openSession.exercises.find((exercise) => exercise.id === exerciseId)
    if (!targetExercise) return

    changeOpenSession({
      ...openSession,
      exercises: openSession.exercises.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, performedName: name } : exercise,
      ),
    })

    if (!remember || normalizeName(name) === normalizeName(targetExercise.originalName)) {
      return
    }

    const now = new Date().toISOString()
    const existing = alternatives.find(
      (alternative) =>
        alternative.programId === program.id &&
        alternative.templateExerciseId === targetExercise.templateExerciseId &&
        normalizeName(alternative.name) === normalizeName(name),
    )
    const alternative: ExerciseAlternative = existing
      ? { ...existing, name, lastUsedAt: now, timesUsed: existing.timesUsed + 1 }
      : {
          id: makeAlternativeId(),
          programId: program.id,
          templateExerciseId: targetExercise.templateExerciseId,
          name,
          createdAt: now,
          lastUsedAt: now,
          timesUsed: 1,
        }

    setAlternatives((current) => {
      const exists = current.some((item) => item.id === alternative.id)
      return exists
        ? current.map((item) => (item.id === alternative.id ? alternative : item))
        : [...current, alternative]
    })
    void saveAlternative(alternative).catch(() => {
      setStorageError('The alternative could not be remembered.')
    })
  }

  async function importBackup(backup: LiftLogBackup, mode: BackupRestoreMode) {
    if (getActiveSession(sessions)) {
      throw new Error('Finish or discard the active workout before restoring a backup.')
    }
    const result = await restoreBackup(backup, mode)
    const snapshot = await readWorkspace(result.preferredProgramId)
    applyWorkspace(snapshot)
    setStorageError(null)
    setNotice(mode === 'merge' ? 'Backup merged' : 'Backup restored')
  }

  async function restoreVersion(version: ProgramVersion) {
    if (getActiveSession(sessions)) {
      throw new Error('Finish or discard the active workout before restoring a version.')
    }

    const restored = await saveProgramVersion(version.program, 'restore', {
      basedOnVersion: version.version,
      label: `Restored from version ${version.version}`,
    })
    const snapshot = await readWorkspace(version.programId)
    applyWorkspace(snapshot, false)
    setStorageError(null)
    setNotice(`Version ${version.version} restored as version ${restored.version}`)
  }

  function createProgram() {
    if (getActiveSession(sessions)) return
    setBuilderRequest({
      initialProgram: createEmptyProgram(),
      mode: 'create',
    })
  }

  function openProgramImport() {
    if (getActiveSession(sessions)) return
    setProgramImportOpen(true)
  }

  function reviewImportedProgram(importedProgram: TrainingProgram) {
    setProgramImportOpen(false)
    setBuilderRequest({
      initialProgram: importedProgram,
      mode: 'import',
    })
  }

  function exportProgram(version: ProgramVersion) {
    try {
      const blob = new Blob([serializeProgramFile(version.program)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${fileSlug(version.program.name)}.liftlog.json`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setStorageError(null)
      setNotice('Program JSON exported')
    } catch {
      setStorageError('The program JSON could not be exported.')
    }
  }

  function editProgram() {
    if (getActiveSession(sessions) || !currentVersion) return
    setBuilderRequest({
      basedOnVersion: currentVersion.version,
      initialProgram: program,
      mode: 'edit',
    })
  }

  function duplicateProgram(version: ProgramVersion) {
    if (getActiveSession(sessions)) return
    setBuilderRequest({
      initialProgram: createProgramCopy(version.program),
      mode: 'duplicate',
      sourceName: version.program.name,
    })
  }

  async function saveBuiltProgram(nextProgram: TrainingProgram) {
    if (!builderRequest || getActiveSession(sessions)) {
      throw new Error('Program changes are locked during an active workout.')
    }

    const editing = builderRequest.mode === 'edit'
    const importing = builderRequest.mode === 'import'
    await saveProgramVersion(
      nextProgram,
      editing ? 'edit' : importing ? 'import' : 'create',
      {
      basedOnVersion: editing ? builderRequest.basedOnVersion : undefined,
      label: editing
        ? 'Edited in LiftLog'
        : importing
          ? 'Imported into LiftLog'
        : builderRequest.mode === 'duplicate'
          ? `Copied from ${builderRequest.sourceName}`
          : 'Created in LiftLog',
      },
    )
    await setActiveProgramId(nextProgram.id)
    const snapshot = await readWorkspace(nextProgram.id)
    applyWorkspace(snapshot, false)
    setBuilderRequest(null)
    setActiveTab('program')
    setStorageError(null)
    setNotice(
      editing ? 'Program changes saved' : importing ? 'Program imported' : 'Program created',
    )
  }

  async function switchProgram(programId: string) {
    if (programId === program.id || getActiveSession(sessions)) return
    try {
      const snapshot = await readWorkspace(programId)
      await setActiveProgramId(programId)
      applyWorkspace(snapshot)
      setStorageError(null)
      setNotice(`Now using ${snapshot.program.name}`)
    } catch {
      setStorageError('The selected program could not be opened.')
    }
  }

  if (loading || !currentVersion) {
    return (
      <main className="loading-screen">
        <span className="wordmark">Liftlog</span>
        <p>Opening logbook...</p>
      </main>
    )
  }

  if (builderRequest) {
    return (
      <ProgramBuilder
        initialProgram={builderRequest.initialProgram}
        key={`${builderRequest.mode}-${builderRequest.initialProgram.id}`}
        mode={builderRequest.mode}
        onCancel={() => setBuilderRequest(null)}
        onSave={saveBuiltProgram}
      />
    )
  }

  if (programImportOpen) {
    return (
      <ProgramImport
        onCancel={() => setProgramImportOpen(false)}
        onReview={reviewImportedProgram}
      />
    )
  }

  if (openSession) {
    return (
      <>
        <SessionView
          alternatives={alternatives}
          onBack={() => setOpenSessionId(null)}
          onChange={changeOpenSession}
          onDiscard={discardOpenSession}
          onFinish={finishOpenSession}
          onReplaceExercise={replaceExercise}
          session={openSession}
          sessions={sessions}
        />
        {storageError ? <StorageAlert message={storageError} /> : null}
      </>
    )
  }

  return (
    <main className="app-shell">
      <div className="app-content">
        {activeTab === 'train' ? (
          <TrainView
            nextWorkout={nextWorkout}
            onResumeWorkout={resumeWorkout}
            onSelectWorkout={setSelectedWorkoutId}
            onStartWorkout={startWorkout}
            program={program}
            selectedWorkoutId={selectedWorkoutId}
            sessions={sessions}
          />
        ) : null}
        {activeTab === 'history' ? (
          <HistoryView program={program} sessions={sessions} />
        ) : null}
        {activeTab === 'program' ? (
          <ProgramView
            canManagePrograms={!getActiveSession(sessions)}
            currentVersion={currentVersion}
            install={install}
            onCreateProgram={createProgram}
            onDuplicateProgram={duplicateProgram}
            onEditProgram={editProgram}
            onExportProgram={exportProgram}
            onImportProgram={openProgramImport}
            onRestoreBackup={importBackup}
            onRestoreVersion={restoreVersion}
            onSwitchProgram={switchProgram}
            program={program}
            programs={programLibrary}
            sessions={sessions}
            versions={programVersions}
          />
        ) : null}
      </div>
      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
      {notice ? (
        <div className="toast" role="status">
          {notice}
        </div>
      ) : null}
      {storageError ? <StorageAlert message={storageError} /> : null}
    </main>
  )
}

async function readWorkspace(preferredProgramId: string): Promise<WorkspaceSnapshot> {
  let allVersions = await liftLogDb.programVersions.toArray()
  if (allVersions.length === 0) {
    await ensureProgramVersion(seedProgram)
    allVersions = await liftLogDb.programVersions.toArray()
  }

  const preferredVersions = allVersions.filter(
    (version) => version.programId === preferredProgramId,
  )
  const fallbackVersion = allVersions
    .slice()
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0]
  const selectedVersion = getLatestProgramVersion(preferredVersions) ?? fallbackVersion
  if (!selectedVersion) throw new Error('No program version is available.')

  const records = await loadProgramRecords(selectedVersion.programId)
  const programLibrary = await loadProgramLibrary()
  return {
    program: selectedVersion.program,
    currentVersion: selectedVersion,
    programVersions: records.programVersions,
    sessions: records.sessions,
    alternatives: records.alternatives,
    programLibrary,
  }
}

function StorageAlert({ message }: { message: string }) {
  return (
    <div className="storage-alert" role="alert">
      {message}
    </div>
  )
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function makeAlternativeId(): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `alternative-${id}`
}

function fileSlug(value: string): string {
  const slug = value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'liftlog-program'
}

export default App
