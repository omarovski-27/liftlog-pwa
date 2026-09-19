import { ArrowLeft, Check, Copy, MoreHorizontal, Minus, Pencil, Plus, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import {
  copyPreviousSets,
  getLatestExercisePerformance,
  getSessionSetProgress,
} from '../lib/sessions'
import type { ExerciseAlternative, ExerciseLog, SetLog, WorkoutSession } from '../types/session'
import type { ExerciseMetric } from '../types/program'
import { getExerciseMetric, getSetQuantity, SET_METRICS, type SetQuantityField } from '../lib/setMetrics'
import { ModalFrame } from './ModalFrame'

interface SessionViewProps {
  session: WorkoutSession
  sessions: WorkoutSession[]
  alternatives: ExerciseAlternative[]
  busy?: boolean
  locked?: boolean
  saveState?: 'saved' | 'saving' | 'error'
  onBack: () => void
  onChange: (session: WorkoutSession) => void
  onFinish: () => void | Promise<void>
  onDiscard: () => void | Promise<void>
  onReplaceExercise: (exerciseId: string, name: string, remember: boolean) => void
}

export function SessionView({
  session,
  sessions,
  alternatives,
  busy = false,
  locked = false,
  saveState = 'saved',
  onBack,
  onChange,
  onFinish,
  onDiscard,
  onReplaceExercise,
}: SessionViewProps) {
  const [now, setNow] = useState(Date.now)
  const [swapExerciseId, setSwapExerciseId] = useState<string | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [removeExerciseId, setRemoveExerciseId] = useState<string | null>(null)
  const [targetExerciseId, setTargetExerciseId] = useState<string | null>(null)
  const progress = getSessionSetProgress(session)
  const swapExercise = session.exercises.find((exercise) => exercise.id === swapExerciseId)
  const removeExercise = session.exercises.find((exercise) => exercise.id === removeExerciseId)
  const targetExercise = session.exercises.find((exercise) => exercise.id === targetExerciseId)
  const pairGroups = [...new Set(session.exercises.flatMap((exercise) => exercise.pair ? [exercise.pair.group] : []))]

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  function updateExercise(
    exerciseId: string,
    updater: (exercise: ExerciseLog) => ExerciseLog,
  ) {
    onChange({
      ...session,
      exercises: session.exercises.map((exercise) =>
        exercise.id === exerciseId ? updater(exercise) : exercise,
      ),
    })
  }

  function updateSet(
    exerciseId: string,
    setId: string,
    field: 'weightKg' | SetQuantityField | 'rir',
    value: number | null,
  ) {
    updateExercise(exerciseId, (exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) =>
        set.id === setId ? { ...set, ...(field === 'durationSeconds' || field === 'distanceMeters' ? { reps: null } : {}), [field]: value } : set,
      ),
    }))
  }

  function toggleSet(exerciseId: string, setId: string) {
    updateExercise(exerciseId, (exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) =>
        set.id === setId ? { ...set, completed: !set.completed } : set,
      ),
    }))
  }

  function addSet(exerciseId: string) {
    updateExercise(exerciseId, (exercise) => ({
      ...exercise,
      prescribedSets: Math.max(exercise.prescribedSets, exercise.sets.length + 1),
      sets: [
        ...exercise.sets,
        {
          id: makeSetId(),
          number: exercise.sets.length + 1,
          weightKg: null,
          reps: null,
          durationSeconds: null,
          distanceMeters: null,
          rir: null,
          completed: false,
        },
      ],
    }))
  }

  function removeLastSet(exerciseId: string) {
    if ((session.exercises.find((exercise) => exercise.id === exerciseId)?.sets.length ?? 0) <= 1) return
    updateExercise(exerciseId, (exercise) => ({
      ...exercise,
      prescribedSets: Math.min(exercise.prescribedSets, exercise.sets.length - 1),
      sets: renumberSets(exercise.sets.slice(0, -1)),
    }))
  }

  function requestRemoveLastSet(exercise: ExerciseLog) {
    const last = exercise.sets[exercise.sets.length - 1]
    if (last && hasSetEntries(last)) setRemoveExerciseId(exercise.id)
    else removeLastSet(exercise.id)
  }

  return (
    <main className="session-view">
      <header className="session-topbar">
        <button className="plain-icon-button" disabled={busy} onClick={onBack} title="Back" type="button">
          <ArrowLeft aria-hidden="true" size={22} />
          <span className="sr-only">Back</span>
        </button>
        <div>
          <strong>{shortenWorkoutTitle(session.workoutTitle)}</strong>
          <span>
            {formatElapsed(now - new Date(session.startedAt).getTime())} / {progress.completed} of{' '}
            {progress.total} sets
          </span>
        </div>
        <button className="finish-button" disabled={busy || locked} onClick={() => setConfirmFinish(true)} type="button">
          Finish
        </button>
      </header>

      <div className="session-heading">
        <span className="section-label">Week {session.weekNumber}</span>
        <h1>{session.workoutTitle}</h1>
        <span className="session-save-state" data-state={saveState}>
          {saveState === 'saving' ? 'Saving changes...' : saveState === 'error' ? 'Changes not saved' : 'Saved on this device'}
        </span>
      </div>

      <fieldset className="session-fields" disabled={busy || locked}>
      <div className="log-exercise-list">
        {session.exercises.map((exercise, exerciseIndex) => {
          const previousPerformance = getLatestExercisePerformance(
            sessions,
            session,
            exercise,
          )
          const previousExercise = previousPerformance?.exercise
          const metric = getExerciseMetric(exercise)
          const quantity = SET_METRICS[metric]

          return (
            <section className="log-exercise" key={exercise.id}>
              <div className="exercise-log-heading">
                <span className="exercise-order">{exerciseIndex + 1}</span>
                <div>
                  <h2>{exercise.performedName}</h2>
                  {exercise.performedName !== exercise.originalName ? (
                    <p>Prescribed: {exercise.originalName}</p>
                  ) : null}
                </div>
                <button
                  className="plain-icon-button exercise-menu"
                  onClick={() => setSwapExerciseId(exercise.id)}
                  title="Change exercise"
                  type="button"
                >
                  <MoreHorizontal aria-hidden="true" size={21} />
                  <span className="sr-only">Change {exercise.performedName}</span>
                </button>
              </div>

              <div className="prescription-row">
                <span>
                  {exercise.prescribedSets} x {exercise.repTarget}
                </span>
                {exercise.targetRir ? <span>{exercise.targetRir} RIR</span> : null}
                <span>{exercise.rest} rest</span>
                <span>{formatKind(exercise.kind)}</span>
                {exercise.pair ? <span>Superset {pairGroups.indexOf(exercise.pair.group) + 1}{exercise.pair.label}</span> : null}
                <button
                  aria-label={`Edit target for ${exercise.performedName}`}
                  className="text-button prescription-edit-button"
                  onClick={() => setTargetExerciseId(exercise.id)}
                  type="button"
                >
                  <Pencil aria-hidden="true" size={13} />
                  Edit target
                </button>
              </div>

              {exercise.prescriptionNotes ? (
                <p className="prescription-note">{exercise.prescriptionNotes}</p>
              ) : null}

              {previousExercise ? (
                <div className="last-session-line">
                  <span>
                    Last: {previousExercise.performedName}
                    {previousPerformance
                      ? ` / ${formatSessionDate(previousPerformance.session)}`
                      : ''}
                  </span>
                  {sameExerciseName(exercise.performedName, previousExercise.performedName) && metric === getExerciseMetric(previousExercise) ? <button
                    className="text-button"
                    onClick={() =>
                      updateExercise(exercise.id, (current) =>
                        copyPreviousSets(current, previousExercise),
                      )
                    }
                    type="button"
                  >
                    <Copy aria-hidden="true" size={14} />
                    Copy last
                  </button> : null}
                </div>
              ) : null}

              <div className="set-table" aria-label={`${exercise.performedName} sets`}>
                <div className="set-table-head">
                  <span>Set</span>
                  <span>Previous</span>
                  <span>kg</span>
                  <span>{quantity.column}</span>
                  <span>RIR</span>
                  <span className="sr-only">Done</span>
                </div>

                {exercise.sets.map((set, setIndex) => {
                  const previousSet = previousExercise?.sets[setIndex]
                  return (
                    <div
                      className="set-row"
                      data-completed={set.completed}
                      key={set.id}
                    >
                      <span className="set-number">{set.number}</span>
                      <span className="previous-set">{formatPreviousSet(previousSet, previousExercise ? getExerciseMetric(previousExercise) : metric)}</span>
                      <NumberInput
                        ariaLabel={`${exercise.performedName} set ${set.number} weight`}
                        max={999}
                        onChange={(value) => updateSet(exercise.id, set.id, 'weightKg', value)}
                        step="any"
                        value={set.weightKg}
                      />
                      <NumberInput
                        ariaLabel={`${exercise.performedName} set ${set.number} ${quantity.label.toLocaleLowerCase()}`}
                        max={quantity.max}
                        onChange={(value) => updateSet(exercise.id, set.id, quantity.field, value)}
                        step={quantity.step}
                        value={getSetQuantity(set, metric)}
                      />
                      <NumberInput
                        ariaLabel={`${exercise.performedName} set ${set.number} RIR`}
                        max={10}
                        onChange={(value) => updateSet(exercise.id, set.id, 'rir', value)}
                        step="0.5"
                        value={set.rir}
                      />
                      <button
                        aria-label={`Mark ${exercise.performedName} set ${set.number} ${set.completed ? 'incomplete' : 'complete'}`}
                        aria-pressed={set.completed}
                        className="set-complete-button"
                        onClick={() => toggleSet(exercise.id, set.id)}
                        type="button"
                      >
                        <Check aria-hidden="true" size={18} strokeWidth={2.4} />
                      </button>
                    </div>
                  )
                })}
              </div>

              <div className="exercise-actions">
                <button className="text-button" onClick={() => addSet(exercise.id)} type="button">
                  <Plus aria-hidden="true" size={15} />
                  Add set
                </button>
                  <button
                    className="text-button muted-button"
                    disabled={exercise.sets.length <= 1}
                    onClick={() => requestRemoveLastSet(exercise)}
                    type="button"
                  >
                    <Minus aria-hidden="true" size={15} />
                    Remove last
                  </button>
              </div>

              <details className="exercise-note-field" open={Boolean(exercise.sessionNotes)}>
                <summary>Exercise note</summary>
                <textarea
                  aria-label={`${exercise.performedName} note`}
                  onChange={(event) =>
                    updateExercise(exercise.id, (current) => ({
                      ...current,
                      sessionNotes: event.target.value,
                    }))
                  }
                  placeholder="Optional"
                  rows={2}
                  value={exercise.sessionNotes}
                />
              </details>
            </section>
          )
        })}
      </div>

      <section className="session-notes">
        <label htmlFor="session-notes">Workout note</label>
        <textarea
          id="session-notes"
          onChange={(event) => onChange({ ...session, sessionNotes: event.target.value })}
          placeholder="Optional"
          rows={3}
          value={session.sessionNotes}
        />
      </section>

      <button className="discard-button" onClick={() => setConfirmDiscard(true)} type="button">
        Discard workout
      </button>
      </fieldset>

      {swapExercise ? (
        <ExerciseSwapSheet
          alternatives={alternatives.filter(
            (alternative) => alternative.templateExerciseId === swapExercise.templateExerciseId,
          )}
          exercise={swapExercise}
          onClose={() => setSwapExerciseId(null)}
          onUse={(name, remember) => {
            onReplaceExercise(swapExercise.id, name, remember)
            setSwapExerciseId(null)
          }}
        />
      ) : null}

      {targetExercise ? (
        <TargetEditSheet
          exercise={targetExercise}
          onClose={() => setTargetExerciseId(null)}
          onSave={(nextExercise) => {
            updateExercise(targetExercise.id, () => nextExercise)
            setTargetExerciseId(null)
          }}
        />
      ) : null}

      {confirmFinish ? (
        <ConfirmDialog
          busy={busy}
          confirmLabel="Finish workout"
          description={`${progress.completed} of ${progress.total} sets are marked complete.`}
          onCancel={() => setConfirmFinish(false)}
          onConfirm={() => {
            const close = () => setConfirmFinish(false)
            void Promise.resolve(onFinish()).then(close, close)
          }}
          title="Finish this workout?"
        />
      ) : null}

      {confirmDiscard ? (
        <ConfirmDialog
          busy={busy}
          confirmLabel="Discard"
          danger
          description="This removes the unfinished workout and its entries."
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            const close = () => setConfirmDiscard(false)
            void Promise.resolve(onDiscard()).then(close, close)
          }}
          title="Discard this workout?"
        />
      ) : null}
      {removeExercise ? <ConfirmDialog title="Remove this set?" description={`${removeExercise.performedName}: set ${removeExercise.sets.length} and its entries will be removed.`} confirmLabel="Remove set" danger onCancel={() => setRemoveExerciseId(null)} onConfirm={() => { removeLastSet(removeExercise.id); setRemoveExerciseId(null) }} /> : null}
    </main>
  )
}

interface TargetEditSheetProps {
  exercise: ExerciseLog
  onClose: () => void
  onSave: (exercise: ExerciseLog) => void
}

function TargetEditSheet({ exercise, onClose, onSave }: TargetEditSheetProps) {
  const [sets, setSets] = useState(String(exercise.prescribedSets))
  const [repTarget, setRepTarget] = useState(exercise.repTarget)
  const [targetRir, setTargetRir] = useState(exercise.targetRir ?? '')
  const [rest, setRest] = useState(exercise.rest)
  const [error, setError] = useState<string | null>(null)
  const metric = getExerciseMetric(exercise)

  function submit() {
    const nextSetCount = Number(sets)
    const nextRepTarget = repTarget.trim()
    const nextRest = rest.trim()
    const nextTargetRir = targetRir.trim()
    if (!Number.isSafeInteger(nextSetCount) || nextSetCount < 1 || nextSetCount > 99) {
      setError('Enter 1 to 99 planned sets.')
      return
    }
    if (!nextRepTarget) {
      setError(metric === 'reps' ? 'Enter a rep target.' : `Enter a ${SET_METRICS[metric].label.toLocaleLowerCase()} target.`)
      return
    }
    if (!nextRest) {
      setError('Enter a rest target.')
      return
    }
    if (nextSetCount < exercise.sets.length && exercise.sets.slice(nextSetCount).some(hasSetEntries)) {
      setError('Clear the extra set entries before lowering the target.')
      return
    }

    onSave({
      ...exercise,
      prescribedSets: nextSetCount,
      repTarget: nextRepTarget,
      targetRir: nextTargetRir || undefined,
      rest: nextRest,
      sets: resizeSets(exercise.sets, nextSetCount),
    })
  }

  return (
    <ModalFrame labelledBy="target-heading" bottom onClose={onClose}>
      <div className="sheet-heading">
        <div>
          <span className="section-label">{exercise.performedName}</span>
          <h2 id="target-heading">Edit target</h2>
        </div>
        <button className="plain-icon-button" onClick={onClose} title="Close" type="button">
          <X aria-hidden="true" size={21} />
          <span className="sr-only">Close</span>
        </button>
      </div>

      <div className="target-editor-grid">
        <label className="builder-field" htmlFor="target-sets">
          <span>Planned sets</span>
          <input
            className="text-input"
            id="target-sets"
            inputMode="numeric"
            max="99"
            min="1"
            onChange={(event) => setSets(event.target.value)}
            type="number"
            value={sets}
          />
        </label>
        <label className="builder-field" htmlFor="target-reps">
          <span>{metric === 'reps' ? 'Rep target' : `${SET_METRICS[metric].label} target`}</span>
          <input
            className="text-input"
            id="target-reps"
            onChange={(event) => setRepTarget(event.target.value)}
            value={repTarget}
          />
        </label>
        <label className="builder-field" htmlFor="target-rir">
          <span>Target RIR</span>
          <input
            className="text-input"
            id="target-rir"
            onChange={(event) => setTargetRir(event.target.value)}
            placeholder="Optional"
            value={targetRir}
          />
        </label>
        <label className="builder-field" htmlFor="target-rest">
          <span>Rest</span>
          <input
            className="text-input"
            id="target-rest"
            onChange={(event) => setRest(event.target.value)}
            value={rest}
          />
        </label>
      </div>

      {error ? <p className="inline-error" role="alert">{error}</p> : null}

      <div className="sheet-actions">
        <button className="secondary-button" onClick={onClose} type="button">
          Cancel
        </button>
        <button className="primary-button" onClick={submit} type="button">
          Save target
        </button>
      </div>
    </ModalFrame>
  )
}

interface NumberInputProps {
  ariaLabel: string
  value: number | null
  max: number
  step: string
  onChange: (value: number | null) => void
}

function NumberInput({ ariaLabel, value, max, step, onChange }: NumberInputProps) {
  const [entryRejected, setEntryRejected] = useState(false)
  const errorId = useId()
  const message = `Entry ignored. Enter ${step === '1' ? 'a whole number' : 'a number'} from 0 to ${max}, or leave blank.`
  return (
    <>
    <input
      aria-describedby={entryRejected ? errorId : undefined}
      aria-label={ariaLabel}
      className="set-input"
      data-invalid={entryRejected || undefined}
      inputMode={step === '1' ? 'numeric' : 'decimal'}
      max={max}
      min="0"
      onChange={(event) => {
        const number = toOptionalNumber(event.target.value)
        if (number !== null && (number < 0 || number > max || (step === '1' && !Number.isInteger(number)))) {
          setEntryRejected(true)
          return
        }
        setEntryRejected(false)
        onChange(number)
      }}
      step={step}
      style={value !== null && String(value).length > 5 ? { fontSize: `${Math.max(10, 80 / String(value).length)}px` } : undefined}
      type="number"
      value={value ?? ''}
      title={entryRejected ? message : value === null ? undefined : String(value)}
    />
    {entryRejected ? <span className="sr-only" id={errorId} role="alert">{message}</span> : null}
    </>
  )
}

interface ExerciseSwapSheetProps {
  exercise: ExerciseLog
  alternatives: ExerciseAlternative[]
  onClose: () => void
  onUse: (name: string, remember: boolean) => void
}

function ExerciseSwapSheet({
  exercise,
  alternatives,
  onClose,
  onUse,
}: ExerciseSwapSheetProps) {
  const [name, setName] = useState(
    exercise.performedName === exercise.originalName ? '' : exercise.performedName,
  )
  const [remember, setRemember] = useState(true)
  const [relabelConfirmed, setRelabelConfirmed] = useState(false)
  const trimmedName = name.trim()
  const hasEntries = exercise.sets.some(hasSetEntries)

  return (
    <ModalFrame labelledBy="swap-heading" bottom onClose={onClose}>
        <div className="sheet-heading">
          <div>
            <span className="section-label">Prescribed: {exercise.originalName}</span>
            <h2 id="swap-heading">Change exercise</h2>
          </div>
          <button className="plain-icon-button" onClick={onClose} title="Close" type="button">
            <X aria-hidden="true" size={21} />
            <span className="sr-only">Close</span>
          </button>
        </div>

        {alternatives.length > 0 ? (
          <div className="saved-alternatives">
            <span>Saved alternatives</span>
            {alternatives
              .slice()
              .sort((a, b) => b.timesUsed - a.timesUsed)
              .map((alternative) => (
                <button
                  data-selected={trimmedName === alternative.name}
                  key={alternative.id}
                  onClick={() => setName(alternative.name)}
                  type="button"
                >
                  {alternative.name}
                </button>
              ))}
          </div>
        ) : null}

        <label className="field-label" htmlFor="alternative-name">
          Exercise name
        </label>
        <input
          data-autofocus
          className="text-input"
          id="alternative-name"
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Plate-loaded chest press"
          type="text"
          value={name}
        />

        <label className="check-label">
          <input
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            type="checkbox"
          />
          <span>Remember alternative</span>
        </label>

        {hasEntries ? <>
          <p className="restore-warning">Changing the exercise name also relabels its existing sets.</p>
          <label className="check-label"><input type="checkbox" checked={relabelConfirmed} onChange={(event) => setRelabelConfirmed(event.target.checked)} /><span>Relabel existing sets</span></label>
        </> : null}

        <div className="sheet-actions">
          {exercise.performedName !== exercise.originalName ? (
            <button
              className="secondary-button"
              disabled={hasEntries && !relabelConfirmed}
              onClick={() => onUse(exercise.originalName, false)}
              type="button"
            >
              Use prescribed
            </button>
          ) : null}
          <button
            className="primary-button"
            disabled={!trimmedName || (hasEntries && trimmedName !== exercise.performedName && !relabelConfirmed)}
            onClick={() => onUse(trimmedName, remember)}
            type="button"
          >
            Use exercise
          </button>
        </div>
    </ModalFrame>
  )
}

interface ConfirmDialogProps {
  busy?: boolean
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}

function ConfirmDialog({
  busy = false,
  title,
  description,
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <ModalFrame labelledBy="confirm-heading" busy={busy} onClose={onCancel}>
        <h2 id="confirm-heading">{title}</h2>
        <p>{description}</p>
        <div className="dialog-actions">
          <button className="secondary-button" disabled={busy} onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className={danger ? 'danger-button' : 'primary-button'}
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? 'Saving...' : confirmLabel}
          </button>
        </div>
    </ModalFrame>
  )
}

function toOptionalNumber(value: string): number | null {
  if (value === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function hasSetEntries(set: SetLog): boolean {
  return set.completed || set.weightKg !== null || set.reps !== null || set.rir !== null || set.durationSeconds != null || set.distanceMeters != null
}

function resizeSets(sets: SetLog[], count: number): SetLog[] {
  if (count <= sets.length) return renumberSets(sets.slice(0, count))
  return [
    ...renumberSets(sets),
    ...Array.from({ length: count - sets.length }, (_, index) =>
      createEmptyLoggedSet(sets.length + index + 1),
    ),
  ]
}

function renumberSets(sets: SetLog[]): SetLog[] {
  return sets.map((set, index) => ({ ...set, number: index + 1 }))
}

function createEmptyLoggedSet(number: number): SetLog {
  return {
    id: makeSetId(),
    number,
    weightKg: null,
    reps: null,
    durationSeconds: null,
    distanceMeters: null,
    rir: null,
    completed: false,
  }
}

function formatPreviousSet(
  set: WorkoutSession['exercises'][number]['sets'][number] | undefined,
  metric: ExerciseMetric,
): string {
  if (!set?.completed || (set.weightKg === null && getSetQuantity(set, metric) === null)) {
    return '-'
  }

  const weight = set.weightKg ?? '-'
  const count = getSetQuantity(set, metric) ?? '-'
  const unit = metric === 'reps' ? '' : ` ${SET_METRICS[metric].unit}`
  return `${weight} x ${count}${unit}${set.rir === null ? '' : ` @${set.rir}`}`
}

function sameExerciseName(a: string, b: string): boolean {
  return a.trim().replace(/\s+/g, ' ').toLocaleLowerCase() === b.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatSessionDate(session: WorkoutSession): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(session.completedAt ?? session.startedAt),
  )
}

function formatKind(kind: ExerciseLog['kind']): string {
  if (kind === 'warm-up') return 'Warm-up'
  if (kind === 'prehab') return 'Prehab'
  return 'Working'
}

function shortenWorkoutTitle(title: string): string {
  return title.replace(/^Day \d+ - /, '')
}

function makeSetId(): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `set-${id}`
}
