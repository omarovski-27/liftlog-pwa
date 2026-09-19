import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
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
import { ModalFrame } from './components/ModalFrame'
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
  SessionConflictError,
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
import { getRemainingProgramSessions } from './lib/programMetrics'
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
  allSessions: WorkoutSession[]
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
  const [allSessions, setAllSessions] = useState<WorkoutSession[]>([])
  const [alternatives, setAlternatives] = useState<ExerciseAlternative[]>([])
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)
  const [selectedWorkoutId, setSelectedWorkoutId] = useState(seedProgram.workouts[0].id)
  const [notice, setNotice] = useState<string | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [openAttempt, setOpenAttempt] = useState(0)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [pendingStorageWrites, setPendingStorageWrites] = useState(0)
  const [sessionBusy, setSessionBusy] = useState(false)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const latestSave = useRef(0)
  const savedSessionDates = useRef(new Map<string, string>())
  const [saveConflict, setSaveConflict] = useState(false)
  const [confirmReload, setConfirmReload] = useState(false)
  const [builderRequest, setBuilderRequest] = useState<BuilderRequest | null>(null)
  const [programImportOpen, setProgramImportOpen] = useState(false)
  const install = usePwaInstall()

  const nextWorkout = useMemo(() => getNextWorkout(program, sessions), [program, sessions])
  const openSession = sessions.find((session) => session.id === openSessionId)

  useEffect(() => {
    let cancelled = false

    async function openWorkspace() {
      setLoading(true)
      setStorageError(null)
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
      setAllSessions(snapshot.allSessions)
      savedSessionDates.current = new Map(snapshot.allSessions.map((session) => [session.id, session.updatedAt]))
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
  }, [openAttempt])

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
    setAllSessions(snapshot.allSessions)
    savedSessionDates.current = new Map(snapshot.allSessions.map((session) => [session.id, session.updatedAt]))
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

  function updateSessionState(session: WorkoutSession) {
    setSessions((current) => {
      if (session.programId !== program.id) return current
      const exists = current.some((item) => item.id === session.id)
      return exists
        ? current.map((item) => (item.id === session.id ? session : item))
        : [...current, session]
    })
    setAllSessions((current) => {
      const exists = current.some((item) => item.id === session.id)
      return exists
        ? current.map((item) => (item.id === session.id ? session : item))
        : [...current, session]
    })
  }

  function queueSessionOperation(operation: () => Promise<void>): Promise<void> {
    const pending = saveQueue.current.catch(() => {}).then(operation)
    saveQueue.current = pending
    return pending
  }

  function persistSession(session: WorkoutSession): Promise<void> {
    const saveNumber = ++latestSave.current
    setSaveState('saving')
    const pending = queueSessionOperation(async () => {
      await saveSession(session, savedSessionDates.current.get(session.id))
      savedSessionDates.current.set(session.id, session.updatedAt)
    })
    void pending.then(
      () => {
        if (saveNumber !== latestSave.current) return
        setSaveState('saved')
        setSaveConflict(false)
        setStorageError(null)
      },
      (error: unknown) => {
        if (saveNumber !== latestSave.current) return
        setSaveState('error')
        setSaveConflict(error instanceof SessionConflictError)
        setStorageError(error instanceof SessionConflictError ? error.message : 'The latest change could not be saved. Keep this app open and retry.')
      },
    )
    return pending
  }

  function upsertSession(session: WorkoutSession) {
    updateSessionState(session)
    void persistSession(session).catch(() => {})
  }

  function retrySessionSave() {
    if (saveConflict) return
    const session = getActiveSession(sessions)
    if (session) void persistSession(session).catch(() => {})
  }

  function trackBackgroundWrite(operation: Promise<void>, errorMessage: string) {
    setPendingStorageWrites((count) => count + 1)
    void operation
      .catch(() => {
        setStorageError(errorMessage)
      })
      .finally(() => {
        setPendingStorageWrites((count) => Math.max(0, count - 1))
      })
  }

  function startWorkout(workout: WorkoutTemplate) {
    if (!currentVersion) return
    const existingActive = getActiveSession(sessions)
    if (existingActive) {
      setOpenSessionId(existingActive.id)
      return
    }
    if (getRemainingProgramSessions(program, sessions.filter((session) => session.programId === program.id && session.status === 'completed').length) === 0) return

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
    upsertSession({ ...updatedSession, updatedAt: nextSessionTimestamp(updatedSession) })
  }

  async function finishOpenSession() {
    if (!openSession || sessionBusy) return
    setSessionBusy(true)
    const completedAt = nextSessionTimestamp(openSession)
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

    try {
      await persistSession(completedSession)
      updateSessionState(completedSession)
      setSelectedWorkoutId(getNextWorkout(program, nextSessions).id)
      setOpenSessionId(null)
      setActiveTab('history')
      setNotice(
        personalRecords.length === 0
          ? 'Workout saved'
          : `Workout saved. ${personalRecords.length} exercise PR${personalRecords.length === 1 ? '' : 's'}`,
      )
    } catch {
      // The active in-memory session remains available for a retry.
    } finally {
      setSessionBusy(false)
    }
  }

  async function discardOpenSession() {
    if (!openSession || sessionBusy) return
    setSessionBusy(true)
    const sessionId = openSession.id
    try {
      await queueSessionOperation(() => deleteSession(sessionId, savedSessionDates.current.get(sessionId)))
      setSessions((current) => current.filter((session) => session.id !== sessionId))
      setAllSessions((current) => current.filter((session) => session.id !== sessionId))
      setOpenSessionId(null)
      setActiveTab('train')
      setStorageError(null)
      setSaveState('saved')
    } catch (error) {
      setSaveState('error')
      setSaveConflict(error instanceof SessionConflictError)
      setStorageError(error instanceof SessionConflictError ? error.message : 'The unfinished workout could not be removed.')
    } finally {
      setSessionBusy(false)
    }
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
    trackBackgroundWrite(saveAlternative(alternative), 'The alternative could not be remembered.')
  }

  async function importBackup(backup: LiftLogBackup, mode: BackupRestoreMode) {
    if (getActiveSession(sessions)) {
      throw new Error('Finish or discard the active workout before restoring a backup.')
    }
    const snapshot = await changeProgramWorkspace(async () => (await restoreBackup(backup, mode)).preferredProgramId)
    applyWorkspace(snapshot)
    setStorageError(null)
    setNotice(mode === 'merge' ? 'Backup merged' : 'Backup restored')
  }

  async function reloadSavedWorkout() {
    setConfirmReload(false)
    setLoading(true)
    ++latestSave.current
    await saveQueue.current.catch(() => {})
    setSaveConflict(false)
    setSaveState('saved')
    setOpenAttempt((attempt) => attempt + 1)
  }

  async function restoreVersion(version: ProgramVersion) {
    if (getActiveSession(sessions)) {
      throw new Error('Finish or discard the active workout before restoring a version.')
    }

    const snapshot = await changeProgramWorkspace(async () => {
      await saveProgramVersion(version.program, 'restore', {
        basedOnVersion: version.version,
        label: `Restored from version ${version.version}`,
      })
      return version.programId
    })
    applyWorkspace(snapshot, false)
    setStorageError(null)
    setNotice(`Version ${version.version} restored as version ${snapshot.currentVersion.version}`)
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
    const snapshot = await changeProgramWorkspace(async () => {
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
      return nextProgram.id
    })
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
      const snapshot = await changeProgramWorkspace(async () => programId)
      applyWorkspace(snapshot)
      setStorageError(null)
      setNotice(`Now using ${snapshot.program.name}`)
    } catch {
      setStorageError('The selected program could not be opened.')
    }
  }

  if (loading) {
    return (
      <main className="loading-screen">
        <span className="wordmark">Liftlog</span>
        <p>Opening logbook...</p>
      </main>
    )
  }

  if (!currentVersion) {
    return (
      <main className="loading-screen">
        <span className="wordmark">Liftlog</span>
        <p role="alert">{storageError ?? 'Workout data could not be opened on this device.'}</p>
        <button className="secondary-button" onClick={() => setOpenAttempt((attempt) => attempt + 1)} type="button">
          <RotateCcw aria-hidden="true" size={16} />
          Retry
        </button>
      </main>
    )
  }

  const reloadDialog = confirmReload ? <ModalFrame labelledBy="reload-heading" onClose={() => setConfirmReload(false)}>
    <h2 id="reload-heading">Reload saved workout?</h2>
    <p>Unsaved changes in this window will be replaced by the saved workout.</p>
    <div className="dialog-actions">
      <button className="secondary-button" onClick={() => setConfirmReload(false)} type="button">Keep this window</button>
      <button className="danger-button" onClick={() => void reloadSavedWorkout()} type="button">Reload saved workout</button>
    </div>
  </ModalFrame> : null

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
          busy={sessionBusy}
          locked={saveConflict}
          onBack={() => setOpenSessionId(null)}
          onChange={changeOpenSession}
          onDiscard={discardOpenSession}
          onFinish={finishOpenSession}
          onReplaceExercise={replaceExercise}
          session={openSession}
          saveState={saveState}
          sessions={sessions}
        />
        {storageError ? <StorageAlert message={storageError} onRetry={!saveConflict && saveState === 'error' && !sessionBusy ? retrySessionSave : undefined} onReload={saveConflict ? () => setConfirmReload(true) : undefined} /> : null}
        {reloadDialog}
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
            onRepeatProgram={() => duplicateProgram(currentVersion)}
            onSelectWorkout={setSelectedWorkoutId}
            onStartWorkout={startWorkout}
            program={program}
            selectedWorkoutId={selectedWorkoutId}
            sessions={sessions}
          />
        ) : null}
        {activeTab === 'history' ? (
          <HistoryView program={program} sessions={allSessions} />
        ) : null}
        {activeTab === 'program' ? (
          <ProgramView
            canManagePrograms={!getActiveSession(sessions)}
            canExportBackup={saveState === 'saved' && pendingStorageWrites === 0}
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
      {storageError ? <StorageAlert message={storageError} onRetry={!saveConflict && saveState === 'error' ? retrySessionSave : undefined} onReload={saveConflict ? () => setConfirmReload(true) : undefined} /> : null}
      {reloadDialog}
    </main>
  )
}

async function readWorkspace(preferredProgramId: string): Promise<WorkspaceSnapshot> {
  const activeSession = getActiveSession(await liftLogDb.sessions.where('status').equals('active').toArray())
  preferredProgramId = activeSession?.programId ?? preferredProgramId
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
  const allSessions = await liftLogDb.sessions.toArray()
  const programLibrary = await loadProgramLibrary()
  return {
    program: selectedVersion.program,
    currentVersion: selectedVersion,
    programVersions: records.programVersions,
    sessions: records.sessions,
    allSessions,
    alternatives: records.alternatives,
    programLibrary,
  }
}

async function changeProgramWorkspace(operation: () => Promise<string>): Promise<WorkspaceSnapshot> {
  return liftLogDb.transaction('rw', [liftLogDb.programVersions, liftLogDb.sessions, liftLogDb.alternatives, liftLogDb.settings], async () => {
    if (await liftLogDb.sessions.where('status').equals('active').count() > 0) throw new Error('Finish or discard the active workout before changing programs or restoring data.')
    const snapshot = await readWorkspace(await operation())
    await setActiveProgramId(snapshot.program.id)
    return snapshot
  })
}

function StorageAlert({ message, onRetry, onReload }: { message: string; onRetry?: () => void; onReload?: () => void }) {
  return (
    <div className="storage-alert" role="alert">
      {message}
      {onRetry ? (
        <button className="text-button" onClick={onRetry} type="button">
          <RotateCcw aria-hidden="true" size={15} />
          Retry saving
        </button>
      ) : null}
      {onReload ? <button className="text-button" onClick={onReload} type="button"><RotateCcw aria-hidden="true" size={15} />Reload saved workout</button> : null}
    </div>
  )
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function nextSessionTimestamp(session: WorkoutSession): string {
  return new Date(Math.max(Date.now(), Date.parse(session.updatedAt) + 1)).toISOString()
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
