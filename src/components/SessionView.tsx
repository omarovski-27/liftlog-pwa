import { ArrowLeft, Check, Copy, MoreHorizontal, Minus, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  copyPreviousSets,
  getLatestExercisePerformance,
  getSessionSetProgress,
} from '../lib/sessions'
import type { ExerciseAlternative, ExerciseLog, WorkoutSession } from '../types/session'

interface SessionViewProps {
  session: WorkoutSession
  sessions: WorkoutSession[]
  alternatives: ExerciseAlternative[]
  onBack: () => void
  onChange: (session: WorkoutSession) => void
  onFinish: () => void
  onDiscard: () => void
  onReplaceExercise: (exerciseId: string, name: string, remember: boolean) => void
}

export function SessionView({
  session,
  sessions,
  alternatives,
  onBack,
  onChange,
  onFinish,
  onDiscard,
  onReplaceExercise,
}: SessionViewProps) {
  const [now, setNow] = useState(() => new Date(session.startedAt).getTime())
  const [swapExerciseId, setSwapExerciseId] = useState<string | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const progress = getSessionSetProgress(session)
  const swapExercise = session.exercises.find((exercise) => exercise.id === swapExerciseId)

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
    field: 'weightKg' | 'reps' | 'rir',
    value: number | null,
  ) {
    updateExercise(exerciseId, (exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) =>
        set.id === setId ? { ...set, [field]: value } : set,
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
      sets: [
        ...exercise.sets,
        {
          id: makeSetId(),
          number: exercise.sets.length + 1,
          weightKg: null,
          reps: null,
          rir: null,
          completed: false,
        },
      ],
    }))
  }

  function removeLastSet(exerciseId: string) {
    updateExercise(exerciseId, (exercise) => ({
      ...exercise,
      sets: exercise.sets.slice(0, -1),
    }))
  }

  return (
    <main className="session-view">
      <header className="session-topbar">
        <button className="plain-icon-button" onClick={onBack} title="Back" type="button">
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
        <button className="finish-button" onClick={() => setConfirmFinish(true)} type="button">
          Finish
        </button>
      </header>

      <div className="session-heading">
        <span className="section-label">Week {session.weekNumber}</span>
        <h1>{session.workoutTitle}</h1>
      </div>

      <div className="log-exercise-list">
        {session.exercises.map((exercise, exerciseIndex) => {
          const previousPerformance = getLatestExercisePerformance(
            sessions,
            session,
            exercise,
          )
          const previousExercise = previousPerformance?.exercise

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
                  <button
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
                  </button>
                </div>
              ) : null}

              <div className="set-table" aria-label={`${exercise.performedName} sets`}>
                <div className="set-table-head">
                  <span>Set</span>
                  <span>Previous</span>
                  <span>kg</span>
                  <span>Reps</span>
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
                      <span className="previous-set">{formatPreviousSet(previousSet)}</span>
                      <NumberInput
                        ariaLabel={`${exercise.performedName} set ${set.number} weight`}
                        max={999}
                        onChange={(value) => updateSet(exercise.id, set.id, 'weightKg', value)}
                        step="0.5"
                        value={set.weightKg}
                      />
                      <NumberInput
                        ariaLabel={`${exercise.performedName} set ${set.number} reps`}
                        max={999}
                        onChange={(value) => updateSet(exercise.id, set.id, 'reps', value)}
                        step="1"
                        value={set.reps}
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
                {exercise.sets.length > 1 ? (
                  <button
                    className="text-button muted-button"
                    onClick={() => removeLastSet(exercise.id)}
                    type="button"
                  >
                    <Minus aria-hidden="true" size={15} />
                    Remove last
                  </button>
                ) : null}
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

      {confirmFinish ? (
        <ConfirmDialog
          confirmLabel="Finish workout"
          description={`${progress.completed} of ${progress.total} sets are marked complete.`}
          onCancel={() => setConfirmFinish(false)}
          onConfirm={onFinish}
          title="Finish this workout?"
        />
      ) : null}

      {confirmDiscard ? (
        <ConfirmDialog
          confirmLabel="Discard"
          danger
          description="This removes the unfinished workout and its entries."
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={onDiscard}
          title="Discard this workout?"
        />
      ) : null}
    </main>
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
  return (
    <input
      aria-label={ariaLabel}
      className="set-input"
      inputMode="decimal"
      max={max}
      min="0"
      onChange={(event) => onChange(toOptionalNumber(event.target.value))}
      step={step}
      type="number"
      value={value ?? ''}
    />
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
  const trimmedName = name.trim()

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="swap-heading"
        aria-modal="true"
        className="bottom-sheet"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
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
          autoFocus
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

        <div className="sheet-actions">
          {exercise.performedName !== exercise.originalName ? (
            <button
              className="secondary-button"
              onClick={() => onUse(exercise.originalName, false)}
              type="button"
            >
              Use prescribed
            </button>
          ) : null}
          <button
            className="primary-button"
            disabled={!trimmedName}
            onClick={() => onUse(trimmedName, remember)}
            type="button"
          >
            Use exercise
          </button>
        </div>
      </section>
    </div>
  )
}

interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <div className="modal-backdrop centered" role="presentation" onMouseDown={onCancel}>
      <section
        aria-labelledby="confirm-heading"
        aria-modal="true"
        className="confirm-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 id="confirm-heading">{title}</h2>
        <p>{description}</p>
        <div className="dialog-actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className={danger ? 'danger-button' : 'primary-button'}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}

function toOptionalNumber(value: string): number | null {
  if (value === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatPreviousSet(
  set: WorkoutSession['exercises'][number]['sets'][number] | undefined,
): string {
  if (!set || (set.weightKg === null && set.reps === null)) {
    return '-'
  }

  const weight = set.weightKg ?? '-'
  const reps = set.reps ?? '-'
  return `${weight} x ${reps}${set.rir === null ? '' : ` @${set.rir}`}`
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
