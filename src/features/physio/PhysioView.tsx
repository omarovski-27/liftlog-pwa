import { useEffect, useRef, useState } from 'react'
import {
  currentPlan,
  ensureDefaultRehabPlan,
  localDay,
  readRehabData,
  RehabConflictError,
  saveCheckIn,
  savePlan,
  saveRehabSession,
  scheduledExercises,
  startSession,
  unfinishedSession,
} from './repository'
import {
  DISPOSITIONS,
  GROUPS,
  OUTCOMES,
  emptyRehabData,
  type Dose,
  type RehabCheckIn,
  type RehabData,
  type RehabExercise,
  type RehabPlanVersion,
  type RehabSession,
} from './types'
import { parseInventory, safeDemoUrl, validateRehabData } from './validation'
import { exerciseDemonstration, exerciseGroup, exerciseGroupNames } from './defaultLibrary'
import { ExerciseCard, ExerciseDetails, VideoAction } from './ExerciseCard'
import { DailyPrograms } from './DailyPrograms'
import './physio.css'

const groupNames = {
  knee_lower_limb: 'Knee / lower limb',
  back_core_hip: 'Back / core / hip',
  shoulder_neck_chest: 'Shoulder / neck / chest',
}
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const draftKey = 'liftlog-physio-recovery-v1'
type Page = 'Today' | 'Plan' | 'Exercises' | 'Progress'
type Recovery = {
  session: RehabSession
  expectedRevision: number
  key?: string
}

export function PhysioView({
  onUnsavedChange,
}: {
  onUnsavedChange: (value: boolean) => void
}) {
  const [data, setData] = useState<RehabData>(emptyRehabData)
  const [page, setPage] = useState<Page>('Today')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingImport, setPendingImport] = useState<RehabExercise[] | null>(
    null,
  )
  const [planDraft, setPlanDraft] = useState<RehabExercise[] | null>(null)
  const [effectiveDate, setEffectiveDate] = useState(localDay())
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState('all')
  const [selected, setSelected] = useState<string[]>([])
  const [selectedDay, setSelectedDay] = useState(() => new Date(`${localDay()}T12:00:00Z`).getUTCDay())
  const [browseWeek, setBrowseWeek] = useState(false)
  const [session, setSession] = useState<RehabSession | null>(null)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>(
    'saved',
  )
  const [conflict, setConflict] = useState(false)
  const [recovery, setRecovery] = useState<Recovery | null>(null)
  const queue = useRef(Promise.resolve())
  const revision = useRef(0)
  const latestDraft = useRef<RehabSession | null>(null)
  const saveFailed = useRef(false)
  const saveNumber = useRef(0)
  const alive = useRef(true)
  const writerKey = useRef(`${draftKey}:${crypto.randomUUID()}`)
  const recoveredKey = useRef<string | null>(null)
  const plan = currentPlan(data)
  const timezone = data.rehabSettings[0]?.timezone ?? 'Asia/Amman'
  const today = localDay(timezone)
  const duePlan = currentPlan(data, today)
  const due = scheduledExercises(duePlan, today)
  const day = data.rehabDayPlans.find((d) => d.id === session?.dayPlanId)
  const dirty = saveState !== 'saved' || Boolean(planDraft) || Boolean(recovery)

  useEffect(() => {
    alive.current = true
    void ensureDefaultRehabPlan()
      .then((snapshot) => {
        if (!alive.current) return
        setData(snapshot)
        const unfinished = unfinishedSession(snapshot)
        if (unfinished) {
          setSession(unfinished)
          latestDraft.current = unfinished
          revision.current = unfinished.revision
        }
        try {
          for (const recoveryKey of Object.keys(localStorage).filter(key => key.startsWith(draftKey))) {
            try {
              const stored = localStorage.getItem(recoveryKey)
              if (!stored) continue
              const candidate = JSON.parse(stored) as Recovery
              if (!Number.isInteger(candidate.expectedRevision) || candidate.expectedRevision < 0) continue
              if (!candidate.session || !snapshot.rehabSessions.some(item => item.id === candidate.session.id)) continue
              validateRehabData({ ...snapshot, rehabSessions: snapshot.rehabSessions.map(item => item.id === candidate.session.id ? candidate.session : item) })
              setRecovery({ ...candidate, key: recoveryKey })
              break
            } catch { /* Preserve malformed/orphaned evidence and inspect later recovery entries. */ }
          }
        } catch {
          setError(
            'A recovery draft could not be read. Your saved records are unchanged.',
          )
        }
        setReady(true)
      })
      .catch(() => {
        setError('Physio data could not be opened. Reload to retry.')
        setReady(true)
      })
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    onUnsavedChange(dirty)
  }, [dirty, onUnsavedChange])
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty])

  async function action(work: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await work()
      return true
    } catch (caught) {
      setError(message(caught))
      return false
    } finally {
      setBusy(false)
    }
  }
  function remember(draft: RehabSession) {
    try {
      localStorage.setItem(
        writerKey.current,
        JSON.stringify({ session: draft, expectedRevision: revision.current }),
      )
    } catch {
      /* The DB remains authoritative; a failed DB write exposes draft export. */
    }
  }
  function persist(draft: RehabSession) {
    latestDraft.current = draft
    setSession(draft)
    remember(draft)
    setSaveState('saving')
    const sequence = ++saveNumber.current
    queue.current = queue.current.then(async () => {
      if (saveFailed.current) return
      try {
        const saved = await saveRehabSession(draft, revision.current)
        revision.current = saved.revision
        if (latestDraft.current) remember(latestDraft.current)
        if (sequence === saveNumber.current) {
          latestDraft.current = saved
          setSession(saved)
          setSaveState('saved')
          removeRecovery(writerKey.current)
          if (recoveredKey.current) {
            removeRecovery(recoveredKey.current)
            recoveredKey.current = null
          }
          setData((current) => ({
            ...current,
            rehabSessions: current.rehabSessions.map((item) =>
              item.id === saved.id ? saved : item,
            ),
          }))
        }
      } catch (caught) {
        saveFailed.current = true
        setSaveState('error')
        setError(message(caught))
        setConflict(caught instanceof RehabConflictError)
      }
    })
    return queue.current
  }
  async function selectInventory(file?: File) {
    if (!file) return
    await action(async () => {
      if (file.size > 2 * 1024 * 1024)
        throw new Error('Inventory must be smaller than 2 MB.')
      setPendingImport(parseInventory(await file.text()))
    })
  }
  async function begin(manual = false, exerciseIds?: string[]) {
    await action(async () => {
      const started = await startSession(manual ? exerciseIds ?? selected : undefined)
      setSession(started)
      latestDraft.current = started
      revision.current = started.revision
      setData(await readRehabData())
      setPage('Today')
      setBrowseWeek(false)
    })
  }
  function updateLog(
    occurrenceId: string,
    change: Partial<RehabSession['logs'][number]>,
  ) {
    const draft = latestDraft.current
    if (!draft || saveFailed.current || recovery) return
    if (
      change.actual &&
      Object.values(change.actual).some(
        (value) =>
          typeof value === 'number' &&
          (!Number.isInteger(value) || value < 0 || value > 100000),
      )
    ) {
      setError(
        'Actual values must be whole numbers from 0 to 100000. Please correct the field.',
      )
      return
    }
    setError('')
    void persist({
      ...draft,
      logs: draft.logs.map((log) =>
        log.occurrenceId === occurrenceId ? { ...log, ...change } : log,
      ),
    })
  }
  async function changeLifecycle(status: RehabSession['status']) {
    const draft = latestDraft.current
    if (!draft || saveFailed.current) return
    await persist({
      ...draft,
      status,
      finishedAt: ['finished', 'abandoned'].includes(status)
        ? new Date().toISOString()
        : null,
    })
  }
  async function reloadSaved() {
    await queue.current
    const snapshot = await readRehabData()
    const saved =
      snapshot.rehabSessions.find((s) => s.id === latestDraft.current?.id) ??
      unfinishedSession(snapshot) ??
      null
    setData(snapshot)
    setSession(saved)
    latestDraft.current = saved
    revision.current = saved?.revision ?? 0
    saveFailed.current = false
    setConflict(false)
    setError('')
    setSaveState('saved')
    setRecovery(null)
    removeRecovery(writerKey.current)
    if (recovery?.key) removeRecovery(recovery.key)
  }
  if (!ready) return <p role="status">Opening physio log…</p>
  return (
    <div className="page-view physio-view">
      <header className="page-header">
        <span className="section-label">Your rehabilitation log</span>
        <h1>Physio</h1>
        <p>
          {new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone }).format(new Date(`${today}T12:00:00Z`))}
        </p>
      </header>
      <nav className="physio-tabs" aria-label="Physio navigation">
        {(['Today', 'Plan', 'Exercises', 'Progress'] as Page[]).map((item) => (
          <button
            type="button"
            key={item}
            aria-current={page === item ? 'page' : undefined}
            disabled={saveState !== 'saved' || Boolean(recovery)}
            onClick={() => setPage(item)}
          >
            {item === 'Today' ? 'Daily' : item}
          </button>
        ))}
      </nav>
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
      {recovery ? (
        <section className="physio-card">
          <h2>Unsaved physio draft found</h2>
          <p>
            Keep a copy before replacing it. A newer saved revision must be
            reviewed separately.
          </p>
          <div className="physio-actions">
            <button
              type="button"
              onClick={() => download('physio-unsaved-draft.json', recovery)}
            >
              Download draft
            </button>
            <button type="button" onClick={() => void action(reloadSaved)}>
              Use saved record
            </button>
            <button
              type="button"
              disabled={
                data.rehabSessions.find((s) => s.id === recovery.session.id)
                  ?.revision !== recovery.expectedRevision
              }
              onClick={() => {
                revision.current = recovery.expectedRevision
                recoveredKey.current = recovery.key ?? null
                setRecovery(null)
                void persist(recovery.session)
              }}
            >
              Recover draft
            </button>
          </div>
        </section>
      ) : null}
      {saveState === 'error' ? (
        <section className="physio-card">
          <h2>Save failed — draft retained</h2>
          <p>
            Saved data has not been replaced. Keep this screen open or download
            the draft.
          </p>
          <div className="physio-actions">
            <button
              type="button"
              onClick={() =>
                download('physio-unsaved-draft.json', latestDraft.current)
              }
            >
              Download draft
            </button>
            {!conflict ? (
              <button
                type="button"
                onClick={() => {
                  saveFailed.current = false
                  setError('')
                  if (latestDraft.current) void persist(latestDraft.current)
                }}
              >
                Retry save
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    'Replace this unsaved draft with the saved record? Download it first if you want to keep it.',
                  )
                )
                  void action(reloadSaved)
              }}
            >
              Reload saved record
            </button>
          </div>
        </section>
      ) : null}
      {!plan && !pendingImport ? (
        <section className="physio-card">
          <h2>Open a saved exercise library</h2>
          <p>
            Import the source inventory JSON. It stays on this device. Targets
            and frequency that are absent from your source remain unconfirmed.
          </p>
          <label className="physio-file">
            Choose physio inventory
            <input
              aria-label="Choose physio inventory"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => {
                void selectInventory(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
        </section>
      ) : null}
      {pendingImport ? (
        <section className="physio-card">
          <h2>Review {pendingImport.length} exercises</h2>
          <p>
            No schedule or past completions will be created. Video links are
            educational candidates; playback and your prescribed variant have
            not been checked.
          </p>
          <ul>
            {pendingImport.map((e) => (
              <li key={e.id}>
                {e.name} · {doseText(e.dose)}
              </li>
            ))}
          </ul>
          <label>
            Start date
            <input
              aria-label="Physio start date"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </label>
          <div className="physio-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await savePlan(pendingImport, undefined, effectiveDate)
                  setData(await readRehabData())
                  setPendingImport(null)
                })
              }
            >
              Add exercises
            </button>
            <button type="button" onClick={() => setPendingImport(null)}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}
      {page === 'Today' && plan ? (
        <>
          {(!session || !['active', 'paused'].includes(session.status) || browseWeek) ? <DailyPrograms
            exercises={(duePlan ?? plan).exercises}
            selectedDay={selectedDay} onSelectDay={setSelectedDay}
            todayDay={new Date(`${today}T12:00:00Z`).getUTCDay()}
            todayLabel={today}
            busy={busy || saveState !== 'saved' || Boolean(recovery)}
            hasUnfinished={Boolean(unfinishedSession(data))}
            canLog={!(session?.finishedAt && day?.localDate === today) && Boolean(duePlan)}
            configuredCount={due.length}
            onLogDay={(ids, configured) => { void begin(!configured, ids) }}
            onResume={() => { setBrowseWeek(false); if (session?.status === 'paused') void changeLifecycle('active') }}
          /> : <div className="physio-session-toolbar"><span className="physio-eyebrow">Your current session</span><button type="button" onClick={() => setBrowseWeek(true)}>Browse daily lists</button></div>}
          {session && day ? (
            <section className="physio-card physio-session-panel">
              <h2>{day.localDate} · session</h2>
              <p role="status">
                {saveState === 'saved'
                  ? 'Saved on this device'
                  : saveState === 'saving'
                    ? 'Saving…'
                    : 'Save failed'}{' '}
                ·{' '}
                {session.logs.filter((l) => l.outcome !== 'not started').length}{' '}
                / {session.logs.length} recorded
              </p>
              <p>
                Targets are separate from actual work. Finishing leaves
                unrecorded exercises unrecorded.
              </p>
              {day.occurrences.map((occurrence, index) => {
                const log = session.logs.find(
                  (entry) => entry.occurrenceId === occurrence.id,
                )!
                const locked =
                  busy ||
                  saveState === 'error' ||
                  Boolean(recovery) ||
                  ['finished', 'abandoned', 'paused'].includes(session.status)
                return (
                  <ExerciseCard exercise={occurrence.exercise} index={index} status={log.outcome} key={occurrence.id}>
                    <details className="physio-log-fields" open={index === 0}>
                    <summary>Log actual work</summary>
                    <fieldset disabled={locked}>
                      <legend>Actual work</legend>
                      <div className="physio-fields">
                        {(
                          [
                            'sets',
                            'reps',
                            'holdSecondsPerRep',
                            'durationSeconds',
                            'breaths',
                            'steps',
                          ] as const
                        ).map((field) => (
                          <label key={field}>
                            {fieldLabel(field)}
                            <input
                              aria-label={`${occurrence.exercise.name} actual ${fieldLabel(field)}`}
                              inputMode="numeric"
                              type="number"
                              min="0"
                              max="100000"
                              step="1"
                              value={log.actual[field] ?? ''}
                              onChange={(e) =>
                                updateLog(occurrence.id, {
                                  actual: {
                                    ...log.actual,
                                    [field]: nullableInput(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                        ))}
                        <label>
                          Side
                          <select
                            value={log.actual.side ?? ''}
                            onChange={(e) =>
                              updateLog(occurrence.id, {
                                actual: {
                                  ...log.actual,
                                  side: (e.target.value ||
                                    null) as Dose['side'],
                                },
                              })
                            }
                          >
                            <option value="">Unknown</option>
                            {['left', 'right', 'bilateral', 'alternating'].map(
                              (side) => (
                                <option key={side}>{side}</option>
                              ),
                            )}
                          </select>
                        </label>
                      </div>
                      <label>
                        Setup / equipment
                        <input
                          maxLength={2000}
                          value={log.actual.setup}
                          onChange={(e) =>
                            updateLog(occurrence.id, {
                              actual: { ...log.actual, setup: e.target.value },
                            })
                          }
                          placeholder="Band, step height, assistance…"
                        />
                      </label>
                      <label>
                        Outcome
                        <select
                          aria-label={`${occurrence.exercise.name} outcome`}
                          value={log.outcome}
                          onChange={(e) =>
                            updateLog(occurrence.id, {
                              outcome: e.target.value as typeof log.outcome,
                            })
                          }
                        >
                          {OUTCOMES.map((outcome) => (
                            <option key={outcome}>{outcome}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Notes / reason
                        <textarea
                          maxLength={2000}
                          value={log.notes}
                          onChange={(e) =>
                            updateLog(occurrence.id, { notes: e.target.value })
                          }
                        />
                      </label>
                    </fieldset>
                    </details>
                  </ExerciseCard>
                )
              })}
              <div className="physio-actions">
                {session.status === 'active' ? (
                  <>
                    <button
                      type="button"
                      disabled={saveState !== 'saved' || busy}
                      onClick={() => void changeLifecycle('paused')}
                    >
                      Pause
                    </button>
                    <button
                      type="button"
                      disabled={saveState !== 'saved' || busy}
                      onClick={() => void changeLifecycle('finished')}
                    >
                      Finish session as recorded
                    </button>
                  </>
                ) : session.status === 'paused' ? (
                  <button
                    type="button"
                    disabled={busy || saveState !== 'saved'}
                    onClick={() => void changeLifecycle('active')}
                  >
                    Resume
                  </button>
                ) : (
                  <p>
                    Session {session.status}. Actual outcomes are preserved
                    above.
                  </p>
                )}
              </div>
            </section>
          ) : null}
          {!unfinishedSession(data) ? (
            <details className="physio-card physio-custom-session">
              <summary>Build a custom session</summary>
              <p>
                Choose only exercises you intend to record. This does not
                confirm a prescription or schedule. One session per day can be
                resumed until finished.
              </p>
              {plan.exercises
                .filter((e) => !['paused', 'retired'].includes(e.disposition))
                .map((e) => (
                  <label className="physio-check" key={e.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(e.id)}
                      onChange={(event) =>
                        setSelected((ids) =>
                          event.target.checked
                            ? [...ids, e.id]
                            : ids.filter((id) => id !== e.id),
                        )
                      }
                    />
                    {e.name}
                  </label>
                ))}
              <button
                type="button"
                disabled={
                  busy ||
                  !selected.length ||
                  Boolean(session?.finishedAt && day?.localDate === today)
                }
                onClick={() => void begin(true)}
              >
                Start selected exercises
              </button>
            </details>
          ) : null}
          <details className="physio-checkin-panel"><summary>Symptom check-in <span>Optional</span></summary><CheckInForm
            sessions={data.rehabSessions.map((item) => ({
              id: item.id,
              date:
                data.rehabDayPlans.find((d) => d.id === item.dayPlanId)
                  ?.localDate ?? '',
              status: item.status,
            }))}
            disabled={busy || saveState !== 'saved' || Boolean(recovery)}
            sessionId={session?.id ?? null}
            timezone={timezone}
            onSave={(checkIn) =>
              action(async () => {
                await saveCheckIn(checkIn)
                setData(await readRehabData())
              })
            }
          /></details>
          {data.rehabSessions.some(
            (s) =>
              s.finishedAt &&
              (data.rehabDayPlans.find((d) => d.id === s.dayPlanId)
                ?.localDate ?? today) < today &&
              !data.rehabCheckIns.some(
                (c) => c.sessionId === s.id && c.response === 'next day',
              ),
          ) ? (
            <p>
              There is a finished session without a next-day response. Missing
              observations stay unknown.
            </p>
          ) : null}
        </>
      ) : null}
      {page === 'Plan' && plan ? (
        <section className="physio-card">
          <h2>Plan version {plan.version}</h2>
          <p>
            Effective {plan.effectiveDate}. Scheduling choices and edited
            targets are user entered, not therapist approval. No automatic
            increases.
          </p>
          {!planDraft ? (
            <>
              <button
                type="button"
                disabled={busy || Boolean(unfinishedSession(data))}
                onClick={() => {
                  setPlanDraft(structuredClone(plan.exercises))
                  setEffectiveDate(today)
                }}
              >
                Edit future routine
              </button>
              {unfinishedSession(data) ? (
                <p>
                  Finish the current physio session before editing the plan.
                </p>
              ) : null}
              <details className="physio-plan-coverage"><summary>Exercise frequency & coverage</summary><Coverage plan={plan} /></details>
            </>
          ) : (
            <>
              <label>
                Effective date
                <input
                  type="date"
                  min={today}
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </label>
              {planDraft.map((e, index) => (
                <PlanExercise
                  key={e.id}
                  exercise={e}
                  index={index}
                  count={planDraft.length}
                  onChange={(updated) =>
                    setPlanDraft((list) =>
                      list!.map((item) => (item.id === e.id ? updated : item)),
                    )
                  }
                  onMove={(direction) =>
                    setPlanDraft((list) => {
                      const result = [...list!]
                      ;[result[index], result[index + direction]] = [
                        result[index + direction],
                        result[index],
                      ]
                      return result
                    })
                  }
                />
              ))}
              <div className="physio-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await savePlan(planDraft, plan, effectiveDate)
                      setData(await readRehabData())
                      setPlanDraft(null)
                    })
                  }
                >
                  Save new plan version
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPlanDraft(null)}
                >
                  Cancel edits
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}
      {page === 'Exercises' && plan ? (
        <>
          <label>
            Find an exercise
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            Group
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="all">All groups</option>
              {GROUPS.map((g) => (
                <option key={g} value={g}>
                  {exerciseGroupNames[g]}
                </option>
              ))}
            </select>
          </label>
          <p className="physio-library-count">{plan.exercises.length} library entries · tap Watch video for a demonstration</p>
          {plan.exercises
            .filter(
              (e) =>
                e.name.toLowerCase().includes(search.toLowerCase()) &&
                (group === 'all' || exerciseGroup(e) === group),
            )
            .sort((a, b) => GROUPS.indexOf(exerciseGroup(a)) - GROUPS.indexOf(exerciseGroup(b)))
            .map((e) => (
              <ExerciseCard exercise={e} key={e.id} />
            ))}
        </>
      ) : null}
      {page === 'Progress' && plan ? <PhysioHistory data={data} /> : null}
    </div>
  )
}

function doseText(dose: Dose) {
  const parts = [
    dose.sets === null ? null : `${dose.sets} sets`,
    dose.reps === null ? null : `${dose.reps} reps`,
    dose.holdSecondsPerRep === null
      ? null
      : `${dose.holdSecondsPerRep}s hold per rep`,
    dose.durationSeconds === null ? null : `${dose.durationSeconds}s total`,
  ].filter(Boolean)
  return parts.length
    ? `${parts.join(' · ')} · ${dose.repBasis ?? 'rep basis unconfirmed'} · ${dose.side ?? 'side unconfirmed'}`
    : 'Dose not confirmed'
}
function ExerciseInfo({ exercise }: { exercise: RehabExercise }) {
  return <div className="physio-info"><VideoAction exercise={exercise} /><ExerciseDetails exercise={exercise} /></div>
}
function PlanExercise({
  exercise: e,
  index,
  count,
  onChange,
  onMove,
}: {
  exercise: RehabExercise
  index: number
  count: number
  onChange: (e: RehabExercise) => void
  onMove: (direction: number) => void
}) {
  const [url, setUrl] = useState(exerciseDemonstration(e)?.url ?? '')
  const [urlError, setUrlError] = useState('')
  return (
    <details className="physio-exercise">
      <summary>
        {e.name}
        <span>{e.disposition}</span>
      </summary>
      <label>
        Disposition
        <select
          value={e.disposition}
          onChange={(event) =>
            onChange({
              ...e,
              disposition: event.target.value as RehabExercise['disposition'],
            })
          }
        >
          {DISPOSITIONS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>
      <label className="physio-check">
        <input
          type="checkbox"
          checked={e.variantConfirmed}
          onChange={(event) =>
            onChange({ ...e, variantConfirmed: event.target.checked })
          }
        />
        I have confirmed the intended exercise variant
      </label>
      <fieldset>
        <legend>User-selected days</legend>
        <div className="physio-days">
          {dayNames.map((name, day) => (
            <label key={name}>
              <input
                type="checkbox"
                checked={e.weekdays.includes(day)}
                onChange={(event) =>
                  onChange({
                    ...e,
                    weekdays: event.target.checked
                      ? [...e.weekdays, day].sort()
                      : e.weekdays.filter((d) => d !== day),
                  })
                }
              />
              {name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="physio-fields">
        {(
          [
            'sets',
            'reps',
            'holdSecondsPerRep',
            'durationSeconds',
            'restSeconds',
            'frequencyPerWeek',
          ] as const
        ).map((field) => (
          <label key={field}>
            {fieldLabel(field)}
            <input
              type="number"
              min="0"
              max={field === 'frequencyPerWeek' ? 100 : 100000}
              step="1"
              value={e.dose[field] ?? ''}
              onChange={(event) =>
                onChange({
                  ...e,
                  doseOrigin: 'user entered',
                  dose: {
                    ...e.dose,
                    [field]: nullableInput(event.target.value),
                  },
                })
              }
            />
          </label>
        ))}
        <label>
          Rep basis
          <select
            value={e.dose.repBasis ?? ''}
            onChange={(event) =>
              onChange({
                ...e,
                doseOrigin: 'user entered',
                dose: {
                  ...e.dose,
                  repBasis: (event.target.value || null) as Dose['repBasis'],
                },
              })
            }
          >
            <option value="">Unconfirmed</option>
            <option>total</option>
            <option>per side</option>
          </select>
        </label>
        <label>
          Side
          <select
            value={e.dose.side ?? ''}
            onChange={(event) =>
              onChange({
                ...e,
                doseOrigin: 'user entered',
                dose: {
                  ...e.dose,
                  side: (event.target.value || null) as Dose['side'],
                },
              })
            }
          >
            <option value="">Unconfirmed</option>
            {['left', 'right', 'bilateral', 'alternating'].map((side) => (
              <option key={side}>{side}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Personal instructions / equipment / notes
        <textarea
          value={e.notes}
          maxLength={2000}
          onChange={(event) => onChange({ ...e, notes: event.target.value })}
        />
      </label>
      <label>
        Video URL
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      {urlError ? <p role="alert">{urlError}</p> : null}
      <button
        type="button"
        onClick={() => {
          try {
            const normalized = safeDemoUrl(url)
            onChange({
              ...e,
              demo: {
                url: normalized,
                title: e.name,
                provider: 'User supplied link',
                variant: 'Variant not reviewed',
                checkedOn: localDay(),
                reviewer: 'User link entry; playback not assessed',
                status: 'user supplied',
              },
            })
            setUrlError('')
          } catch (caught) {
            setUrlError(message(caught))
          }
        }}
      >
        Use this video
      </button>
      <div className="physio-actions">
        <button type="button" disabled={index === 0} onClick={() => onMove(-1)}>
          Move up
        </button>
        <button
          type="button"
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          Move down
        </button>
      </div>
      <ExerciseInfo exercise={e} />
    </details>
  )
}
function Coverage({ plan }: { plan: RehabPlanVersion }) {
  return (
    <div className="physio-coverage">
      <h3>Weekly coverage</h3>
      {plan.exercises.map((e) => (
        <p key={e.id}>
          <strong>{e.name}</strong>
          <br />
          {e.disposition} · assigned {e.weekdays.length} days · source frequency{' '}
          {e.dose.frequencyPerWeek ?? 'not confirmed'}
          {e.dose.frequencyPerWeek !== null &&
          e.dose.frequencyPerWeek !== e.weekdays.length
            ? ' · frequency mismatch — review'
            : ''}
          {!e.variantConfirmed && e.weekdays.length
            ? ' · held: variant unconfirmed'
            : ''}
        </p>
      ))}
    </div>
  )
}
function CheckInForm({
  timezone,
  sessionId,
  sessions,
  disabled,
  onSave,
}: {
  timezone: string
  sessionId: string | null
  sessions: { id: string; date: string; status: string }[]
  disabled: boolean
  onSave: (c: RehabCheckIn) => Promise<boolean | undefined>
}) {
  const [region, setRegion] =
    useState<RehabCheckIn['region']>('knee_lower_limb')
  const [pain, setPain] = useState('')
  const [swelling, setSwelling] = useState('')
  const [instability, setInstability] = useState('')
  const [response, setResponse] = useState<RehabCheckIn['response']>('before')
  const [notes, setNotes] = useState('')
  const [linkedId, setLinkedId] = useState<string | null>(null)
  const relatedId = linkedId ?? sessionId ?? ''
  const [saved, setSaved] = useState(false)
  const submitting = useRef(false)
  return (
    <form
      className="physio-card"
      onSubmit={(event) => {
        event.preventDefault()
        if (submitting.current) return
        submitting.current = true
        setSaved(false)
        const now = new Date().toISOString()
        void onSave({
          id: crypto.randomUUID(),
          localDate: localDay(timezone),
          timezone,
          observedAt: now,
          recordedAt: now,
          region,
          pain: nullableInput(pain),
          swelling: swelling === '' ? null : swelling === 'yes',
          instability: instability === '' ? null : instability === 'yes',
          response,
          sessionId: relatedId || null,
          notes,
        })
          .then((success) => {
            setSaved(Boolean(success))
            if (success) {
              setPain('')
              setSwelling('')
              setInstability('')
              setNotes('')
            }
          })
          .finally(() => {
            submitting.current = false
          })
      }}
    >
      <h2>Optional symptom check-in</h2>
      <p>Blank means unknown. A zero is a recorded response.</p>
      {saved ? <p role="status">Check-in saved on this device.</p> : null}
      <fieldset disabled={disabled}>
        <legend>Observation</legend>
        <label>
          Region
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as typeof region)}
          >
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {groupNames[g]}
              </option>
            ))}
          </select>
        </label>
        <label>
          When
          <select
            value={response}
            onChange={(e) => {
              const value = e.target.value as typeof response
              setResponse(value)
              if (value === 'next day')
                setLinkedId(
                  sessions
                    .filter(
                      (item) =>
                        item.status === 'finished' &&
                        item.date < localDay(timezone),
                    )
                    .sort((a, b) => b.date.localeCompare(a.date))[0]?.id ?? '',
                )
            }}
          >
            {['before', 'after', 'next day', 'rest'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Related physio session
          <select
            required={response === 'next day' && sessions.length > 0}
            value={relatedId}
            onChange={(e) => setLinkedId(e.target.value)}
          >
            <option value="">No session / rest check-in</option>
            {sessions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.date} · {item.status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pain 0–10 (optional)
          <input
            type="number"
            min="0"
            max="10"
            step="1"
            value={pain}
            onChange={(e) => setPain(e.target.value)}
          />
        </label>
        <label>
          Swelling
          <select
            value={swelling}
            onChange={(e) => setSwelling(e.target.value)}
          >
            <option value="">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label>
          Giving way / slipping / instability
          <select
            value={instability}
            onChange={(e) => setInstability(e.target.value)}
          >
            <option value="">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label>
          Symptoms / function / training context
          <textarea
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <button type="submit">Save check-in</button>
      </fieldset>
    </form>
  )
}
export function PhysioHistory({ data }: { data: RehabData }) {
  const sessions = data.rehabSessions
    .slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return (
    <section className="physio-history">
      <h2>Physio history</h2>
      <p>
        {sessions.length} sessions · {data.rehabCheckIns.length} symptom
        observations. These records do not measure clinical recovery.
      </p>
      {!sessions.length ? <p>No physio sessions recorded.</p> : null}
      {sessions.map((session) => {
        const day = data.rehabDayPlans.find((d) => d.id === session.dayPlanId)
        return (
          <details className="physio-card" key={session.id}>
            <summary>
              {day?.localDate} · {session.status}
            </summary>
            {session.logs.map((log) => {
              const e = day?.occurrences.find(
                (o) => o.id === log.occurrenceId,
              )?.exercise
              return (
                <div className="physio-history-entry" key={log.occurrenceId}>
                  <strong>{e?.name}</strong>
                  <p>{log.outcome}</p>
                  <p>Target: {e ? doseText(e.dose) : 'unknown'}</p>
                  <p>
                    Actual:{' '}
                    {Object.entries(log.actual)
                      .filter(([, value]) => value !== null && value !== '')
                      .map(([key, value]) => `${fieldLabel(key)}: ${value}`)
                      .join(' · ') || 'not recorded'}
                  </p>
                  {log.notes ? <p>{log.notes}</p> : null}
                </div>
              )
            })}
          </details>
        )
      })}
      <h3>Symptom observations</h3>
      {!data.rehabCheckIns.length ? (
        <p>No observations. Pain is unknown.</p>
      ) : (
        data.rehabCheckIns
          .slice()
          .reverse()
          .map((c) => (
            <div className="physio-card" key={c.id}>
              <strong>
                {c.localDate} · {groupNames[c.region]} · {c.response}
              </strong>
              <p>
                Pain: {c.pain ?? 'unknown'} · swelling: {flag(c.swelling)} ·
                instability: {flag(c.instability)}
              </p>
              <p>{c.notes}</p>
            </div>
          ))
      )}
    </section>
  )
}
function nullableInput(value: string) {
  return value === '' ? null : Number(value)
}
function flag(value: boolean | null) {
  return value === null ? 'unknown' : value ? 'yes' : 'no'
}
function fieldLabel(key: string) {
  return (
    (
      {
        holdSecondsPerRep: 'Hold seconds per rep',
        durationSeconds: 'Total seconds',
        frequencyPerWeek: 'Frequency / week',
        restSeconds: 'Rest seconds',
        repBasis: 'Rep basis',
      } as Record<string, string>
    )[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
  )
}
function message(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : 'Physio data could not be saved.'
}
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function removeRecovery(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* Saved IndexedDB records remain authoritative. */
  }
}
