import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Copy,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  EXERCISE_KINDS,
  MUSCLE_GROUPS,
  ProgramDraftError,
  WEEKDAYS,
  cloneProgramForEdit,
  createEmptyExercise,
  createEmptyWorkout,
  duplicateExercise,
  duplicateWorkout,
  finalizeProgramDraft,
  getProgramDraftMetrics,
  moveItem,
  validateProgramDraft,
  type ProgramValidationIssue,
} from '../lib/programBuilder'
import { getExercisePrescription, getWorkingSetCount } from '../lib/programMetrics'
import { getExerciseMetric, SET_METRICS } from '../lib/setMetrics'
import { ModalFrame } from './ModalFrame'
import type { ExerciseMetric } from '../types/program'
import type {
  ExerciseTemplate,
  MuscleGroup,
  TrainingProgram,
  WorkoutTemplate,
} from '../types/program'

export type ProgramBuilderMode = 'create' | 'edit' | 'duplicate' | 'import'

interface ProgramBuilderProps {
  initialProgram: TrainingProgram
  mode: ProgramBuilderMode
  onCancel: () => void
  onSave: (program: TrainingProgram) => Promise<void>
}

export function ProgramBuilder({
  initialProgram,
  mode,
  onCancel,
  onSave,
}: ProgramBuilderProps) {
  const [draft, setDraft] = useState(() => cloneProgramForEdit(initialProgram))
  const [openWorkoutId, setOpenWorkoutId] = useState<string | null>(
    mode === 'edit' ? null : initialProgram.workouts[0]?.id ?? null,
  )
  const [openExerciseId, setOpenExerciseId] = useState<string | null>(
    mode === 'edit' ? null : initialProgram.workouts[0]?.exercises[0]?.id ?? null,
  )
  const [issues, setIssues] = useState<ProgramValidationIssue[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [initialSignature] = useState(() => JSON.stringify(initialProgram))
  const metrics = useMemo(() => getProgramDraftMetrics(draft), [draft])
  const dirty = JSON.stringify(draft) !== initialSignature
  const title = mode === 'edit'
    ? 'Edit program'
    : mode === 'duplicate'
      ? 'Copy program'
      : mode === 'import'
        ? 'Review import'
        : 'New program'
  const saveLabel = mode === 'edit' ? 'Save' : mode === 'import' ? 'Import' : 'Create'

  function updateProgram(patch: Partial<TrainingProgram>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function updateWorkout(workoutId: string, next: WorkoutTemplate) {
    setDraft((current) => ({
      ...current,
      workouts: current.workouts.map((workout) =>
        workout.id === workoutId ? next : workout,
      ),
    }))
  }

  function addWorkout() {
    const workout = createEmptyWorkout(draft.workouts.length)
    setDraft((current) => ({ ...current, workouts: [...current.workouts, workout] }))
    setOpenWorkoutId(workout.id)
    setOpenExerciseId(workout.exercises[0].id)
  }

  function copyWorkoutAt(index: number) {
    const workout = duplicateWorkout(draft.workouts[index], index + 2)
    const workouts = draft.workouts.slice()
    workouts.splice(index + 1, 0, workout)
    updateProgram({ workouts })
    setOpenWorkoutId(workout.id)
    setOpenExerciseId(null)
  }

  function removeWorkout(index: number) {
    const workout = draft.workouts[index]
    const workouts = draft.workouts.filter((_, itemIndex) => itemIndex !== index)
    updateProgram({ workouts })
    if (openWorkoutId === workout.id) setOpenWorkoutId(workouts[index - 1]?.id ?? workouts[0]?.id ?? null)
  }

  function moveWorkout(index: number, direction: -1 | 1) {
    updateProgram({ workouts: moveItem(draft.workouts, index, index + direction) })
  }

  function requestCancel() {
    if (dirty) setDiscardOpen(true)
    else onCancel()
  }

  async function submitProgram(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaveError(null)
    const nextIssues = validateProgramDraft(draft)
    setIssues(nextIssues)
    if (nextIssues.length > 0) {
      revealIssue(nextIssues[0], draft, setOpenWorkoutId, setOpenExerciseId)
      return
    }

    setBusy(true)
    try {
      await onSave(finalizeProgramDraft(draft))
    } catch (caught) {
      if (caught instanceof ProgramDraftError) {
        setIssues(caught.issues)
      } else {
        setSaveError('The program could not be saved. Your current program was not changed.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="builder-screen">
      <header className="builder-topbar">
        <button
          aria-label="Back"
          className="plain-icon-button"
          onClick={requestCancel}
          title="Back"
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={20} />
        </button>
        <div>
          <span>Program builder</span>
          <strong>{title}</strong>
        </div>
        <button
          className="builder-save-button"
          disabled={busy}
          form="program-builder-form"
          type="submit"
        >
          <Save aria-hidden="true" size={16} />
          {saveLabel}
        </button>
      </header>

      <form className="builder-content" id="program-builder-form" onSubmit={submitProgram}>
        <section className="builder-metrics" aria-label="Program totals">
          <div>
            <span>Workouts</span>
            <strong>{metrics.workouts}</strong>
          </div>
          <div>
            <span>Exercises</span>
            <strong>{metrics.exercises}</strong>
          </div>
          <div>
            <span>Week {draft.currentWeek} sets</span>
            <strong>{metrics.workingSets}</strong>
          </div>
        </section>

        {issues.length > 0 ? (
          <div className="builder-alert" role="alert">
            <strong>{issues.length === 1 ? 'Fix 1 field' : `Fix ${issues.length} fields`}</strong>
            <span>{issues[0].message}</span>
          </div>
        ) : null}
        {saveError ? <div className="builder-alert" role="alert">{saveError}</div> : null}

        <section className="builder-section">
          <div className="builder-section-heading">
            <div>
              <span className="section-label">Setup</span>
              <h1>Program details</h1>
            </div>
          </div>

          <div className="builder-field-grid">
            <BuilderField
              error={findIssue(issues, 'name')}
              id="program-name"
              label="Program name"
              wide
            >
              <input
                aria-invalid={Boolean(findIssue(issues, 'name'))}
                className="text-input"
                id="program-name"
                onChange={(event) => updateProgram({ name: event.target.value })}
                placeholder="Strength block"
                value={draft.name}
              />
            </BuilderField>
            <BuilderField
              error={findIssue(issues, 'durationWeeks')}
              id="program-duration"
              label="Duration (weeks)"
            >
              <input
                aria-invalid={Boolean(findIssue(issues, 'durationWeeks'))}
                className="text-input"
                id="program-duration"
                inputMode="numeric"
                max="104"
                min="1"
                onChange={(event) =>
                  updateProgram({ durationWeeks: numberValue(event.target.value) })
                }
                type="number"
                value={draft.durationWeeks}
              />
            </BuilderField>
            <BuilderField
              error={findIssue(issues, 'currentWeek')}
              id="program-current-week"
              label="Starting week"
            >
              <input
                aria-invalid={Boolean(findIssue(issues, 'currentWeek'))}
                className="text-input"
                id="program-current-week"
                inputMode="numeric"
                max={Math.max(1, draft.durationWeeks)}
                min="1"
                onChange={(event) =>
                  updateProgram({ currentWeek: numberValue(event.target.value) })
                }
                type="number"
                value={draft.currentWeek}
              />
            </BuilderField>
            <BuilderField id="program-rest-day" label="Full rest day" wide>
              <select
                className="text-input"
                id="program-rest-day"
                onChange={(event) => updateProgram({ fullRestDay: event.target.value })}
                value={draft.fullRestDay}
              >
                <option value="None">None</option>
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </BuilderField>
            <BuilderField id="program-progression" label="Progression notes" wide>
              <textarea
                id="program-progression"
                onChange={(event) =>
                  updateProgram({ progressionRules: event.target.value.split('\n') })
                }
                placeholder="Add weight after reaching the top of the rep range."
                rows={3}
                value={draft.progressionRules.join('\n')}
              />
            </BuilderField>
            <BuilderField id="program-constraints" label="Constraints" wide>
              <textarea
                id="program-constraints"
                onChange={(event) =>
                  updateProgram({ constraints: event.target.value.split('\n') })
                }
                placeholder="One constraint per line"
                rows={3}
                value={draft.constraints.join('\n')}
              />
            </BuilderField>
          </div>
        </section>

        <section className="builder-section workout-builder-section">
          <div className="builder-section-heading">
            <div>
              <span className="section-label">Weekly order</span>
              <h2>Workouts</h2>
            </div>
            <button
              className="secondary-button compact-button"
              disabled={draft.workouts.length >= 14}
              onClick={addWorkout}
              type="button"
            >
              <Plus aria-hidden="true" size={16} />
              Add workout
            </button>
          </div>
          {findIssue(issues, 'workouts') ? (
            <p className="field-error">{findIssue(issues, 'workouts')}</p>
          ) : null}

          <div className="builder-workout-list">
            {draft.workouts.map((workout, index) => (
              <WorkoutEditor
                canCopy={draft.workouts.length < 14}
                durationWeeks={draft.durationWeeks}
                index={index}
                issues={issues}
                key={workout.id}
                onChange={(next) => updateWorkout(workout.id, next)}
                onCopy={() => copyWorkoutAt(index)}
                onMoveDown={() => moveWorkout(index, 1)}
                onMoveUp={() => moveWorkout(index, -1)}
                onRemove={() => removeWorkout(index)}
                onToggle={() =>
                  setOpenWorkoutId(openWorkoutId === workout.id ? null : workout.id)
                }
                open={openWorkoutId === workout.id}
                openExerciseId={openExerciseId}
                previewWeek={draft.currentWeek}
                setOpenExerciseId={setOpenExerciseId}
                total={draft.workouts.length}
                workout={workout}
              />
            ))}
          </div>
        </section>

        <button className="builder-bottom-save primary-button" disabled={busy} type="submit">
          <Save aria-hidden="true" size={17} />
          {saveLabel} program
        </button>
      </form>

      {discardOpen ? (
        <ModalFrame labelledBy="discard-program-heading" onClose={() => setDiscardOpen(false)}>
            <h2 id="discard-program-heading">Discard program changes?</h2>
            <p>The unsaved builder changes will be removed.</p>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                onClick={() => setDiscardOpen(false)}
                type="button"
              >
                Keep editing
              </button>
              <button className="danger-button" onClick={onCancel} type="button">
                Discard changes
              </button>
            </div>
        </ModalFrame>
      ) : null}
    </main>
  )
}

interface WorkoutEditorProps {
  canCopy: boolean
  durationWeeks: number
  index: number
  issues: ProgramValidationIssue[]
  onChange: (workout: WorkoutTemplate) => void
  onCopy: () => void
  onMoveDown: () => void
  onMoveUp: () => void
  onRemove: () => void
  onToggle: () => void
  open: boolean
  openExerciseId: string | null
  previewWeek: number
  setOpenExerciseId: (id: string | null) => void
  total: number
  workout: WorkoutTemplate
}

function WorkoutEditor({
  canCopy,
  durationWeeks,
  index,
  issues,
  onChange,
  onCopy,
  onMoveDown,
  onMoveUp,
  onRemove,
  onToggle,
  open,
  openExerciseId,
  previewWeek,
  setOpenExerciseId,
  total,
  workout,
}: WorkoutEditorProps) {
  const workoutPath = `workouts.${index}`
  const name = workout.shortTitle.trim() || `Workout ${index + 1}`
  const pairGroups = [...new Set(workout.exercises.flatMap((exercise) => exercise.pair ? [exercise.pair.group] : []))]

  function update(patch: Partial<WorkoutTemplate>) {
    onChange({ ...workout, ...patch })
  }

  function addExercise() {
    const exercise = createEmptyExercise()
    update({ exercises: [...workout.exercises, exercise] })
    setOpenExerciseId(exercise.id)
  }

  function updateExercise(exerciseId: string, next: ExerciseTemplate) {
    const priorGroup = workout.exercises.find((exercise) => exercise.id === exerciseId)?.pair?.group
    update({
      exercises: workout.exercises.map((exercise) =>
        exercise.id === exerciseId ? next
          : priorGroup !== undefined && next.pair && priorGroup !== next.pair.group && exercise.pair?.group === priorGroup
            ? { ...exercise, pair: { ...exercise.pair, group: next.pair.group } } : exercise,
      ),
    })
  }

  function copyExerciseAt(exerciseIndex: number) {
    const exercise = duplicateExercise(workout.exercises[exerciseIndex])
    const exercises = workout.exercises.slice()
    exercises.splice(exerciseIndex + 1, 0, exercise)
    update({ exercises })
    setOpenExerciseId(exercise.id)
  }

  function removeExercise(exerciseIndex: number) {
    const exercise = workout.exercises[exerciseIndex]
    const exercises = workout.exercises.filter((_, indexToKeep) => indexToKeep !== exerciseIndex)
    update({ exercises })
    if (openExerciseId === exercise.id) setOpenExerciseId(null)
  }

  function moveExercise(exerciseIndex: number, direction: -1 | 1) {
    update({
      exercises: moveItem(workout.exercises, exerciseIndex, exerciseIndex + direction),
    })
  }

  return (
    <article className="builder-workout" data-open={open}>
      <div className="builder-item-heading">
        <button
          aria-expanded={open}
          className="builder-disclosure"
          onClick={onToggle}
          type="button"
        >
          <span className="builder-order">{index + 1}</span>
          <span>
            <strong>{name}</strong>
            <small>
              {workout.scheduledDay} / {workout.exercises.length} exercises /{' '}
              {getWorkingSetCount(workout, previewWeek)} sets
            </small>
          </span>
          {open ? <ChevronUp aria-hidden="true" size={18} /> : <ChevronDown aria-hidden="true" size={18} />}
        </button>
        <div className="builder-item-tools">
          <IconButton
            disabled={index === 0}
            label={`Move ${name} up`}
            onClick={onMoveUp}
          >
            <ArrowUp aria-hidden="true" size={16} />
          </IconButton>
          <IconButton
            disabled={index === total - 1}
            label={`Move ${name} down`}
            onClick={onMoveDown}
          >
            <ArrowDown aria-hidden="true" size={16} />
          </IconButton>
          <IconButton
            disabled={!canCopy}
            label={`Duplicate ${name}`}
            onClick={onCopy}
          >
            <Copy aria-hidden="true" size={15} />
          </IconButton>
          <IconButton
            danger
            disabled={total === 1}
            label={`Delete ${name}`}
            onClick={onRemove}
          >
            <Trash2 aria-hidden="true" size={15} />
          </IconButton>
        </div>
      </div>

      {open ? (
        <div className="builder-item-body">
          <div className="builder-field-grid">
            <BuilderField
              error={findIssue(issues, `${workoutPath}.shortTitle`)}
              id={`${workout.id}-name`}
              label={`Workout ${index + 1} name`}
            >
              <input
                aria-invalid={Boolean(findIssue(issues, `${workoutPath}.shortTitle`))}
                className="text-input"
                id={`${workout.id}-name`}
                onChange={(event) => update({ shortTitle: event.target.value })}
                value={workout.shortTitle}
              />
            </BuilderField>
            <BuilderField
              error={findIssue(issues, `${workoutPath}.scheduledDay`)}
              id={`${workout.id}-day`}
              label={`Workout ${index + 1} training day`}
            >
              <select
                aria-invalid={Boolean(findIssue(issues, `${workoutPath}.scheduledDay`))}
                className="text-input"
                id={`${workout.id}-day`}
                onChange={(event) => update({ scheduledDay: event.target.value })}
                value={workout.scheduledDay}
              >
                {WEEKDAYS.map((day) => <option key={day} value={day}>{day}</option>)}
              </select>
            </BuilderField>
            <BuilderField id={`${workout.id}-focus`} label="Focus" wide>
              <input
                className="text-input"
                id={`${workout.id}-focus`}
                onChange={(event) => update({ emphasis: event.target.value })}
                placeholder="Heavy upper body"
                value={workout.emphasis}
              />
            </BuilderField>
            <BuilderField id={`${workout.id}-notes`} label="Workout notes" wide>
              <textarea
                id={`${workout.id}-notes`}
                onChange={(event) => update({ sourceSummary: event.target.value })}
                rows={2}
                value={workout.sourceSummary}
              />
            </BuilderField>
          </div>

          <div className="exercise-builder-heading">
            <div>
              <strong>Exercises</strong>
              <span>{workout.exercises.length} in this workout</span>
            </div>
            <button className="text-button" onClick={addExercise} type="button">
              <Plus aria-hidden="true" size={15} />
              Add exercise
            </button>
          </div>
          {findIssue(issues, `${workoutPath}.exercises`) ? (
            <p className="field-error">{findIssue(issues, `${workoutPath}.exercises`)}</p>
          ) : null}

          <div className="builder-exercise-list">
            {workout.exercises.map((exercise, exerciseIndex) => (
              <ExerciseEditor
                durationWeeks={durationWeeks}
                exercise={exercise}
                index={exerciseIndex}
                issues={issues}
                key={exercise.id}
                onChange={(next) => updateExercise(exercise.id, next)}
                onCopy={() => copyExerciseAt(exerciseIndex)}
                onMoveDown={() => moveExercise(exerciseIndex, 1)}
                onMoveUp={() => moveExercise(exerciseIndex, -1)}
                onRemove={() => removeExercise(exerciseIndex)}
                onToggle={() =>
                  setOpenExerciseId(openExerciseId === exercise.id ? null : exercise.id)
                }
                open={openExerciseId === exercise.id}
                path={`${workoutPath}.exercises.${exerciseIndex}`}
                pairGroupLabel={exercise.pair && /^(?:pair-|d\d+-pair-)/.test(exercise.pair.group) ? `Pair ${pairGroups.indexOf(exercise.pair.group) + 1}` : exercise.pair?.group}
                previewWeek={previewWeek}
                total={workout.exercises.length}
                workoutNumber={index + 1}
              />
            ))}
          </div>
        </div>
      ) : null}
    </article>
  )
}

interface ExerciseEditorProps {
  durationWeeks: number
  exercise: ExerciseTemplate
  index: number
  issues: ProgramValidationIssue[]
  onChange: (exercise: ExerciseTemplate) => void
  onCopy: () => void
  onMoveDown: () => void
  onMoveUp: () => void
  onRemove: () => void
  onToggle: () => void
  open: boolean
  path: string
  pairGroupLabel?: string
  previewWeek: number
  total: number
  workoutNumber: number
}

function ExerciseEditor({
  durationWeeks,
  exercise,
  index,
  issues,
  onChange,
  onCopy,
  onMoveDown,
  onMoveUp,
  onRemove,
  onToggle,
  open,
  path,
  pairGroupLabel,
  previewWeek,
  total,
  workoutNumber,
}: ExerciseEditorProps) {
  const name = exercise.name.trim() || `Exercise ${index + 1}`
  const weekOverrides = exercise.weekOverrides ?? []
  const previewPrescription = getExercisePrescription(exercise, previewWeek)
  const availableWeek = Array.from({ length: Math.max(0, Math.min(104, durationWeeks)) }, (_, offset) => offset + 1)
    .find((week) => !weekOverrides.some((override) => week >= override.startWeek && week <= override.endWeek))

  function update(patch: Partial<ExerciseTemplate>) {
    onChange({ ...exercise, ...patch })
  }

  function toggleMuscleGroup(group: MuscleGroup) {
    const selected = exercise.muscleGroups.includes(group)
    update({
      muscleGroups: selected
        ? exercise.muscleGroups.filter((item) => item !== group)
        : [...exercise.muscleGroups, group],
    })
  }

  function addWeekOverride() {
    if (availableWeek === undefined) return
    const startWeek = availableWeek
    update({
      weekOverrides: [
        ...weekOverrides,
        { startWeek, endWeek: startWeek, sets: exercise.sets },
      ],
    })
  }

  function updateWeekOverride(
    overrideIndex: number,
    patch: Partial<NonNullable<ExerciseTemplate['weekOverrides']>[number]>,
  ) {
    update({
      weekOverrides: weekOverrides.map((override, itemIndex) =>
        itemIndex === overrideIndex ? { ...override, ...patch } : override,
      ),
    })
  }

  function removeWeekOverride(overrideIndex: number) {
    const nextOverrides = weekOverrides.filter((_, itemIndex) => itemIndex !== overrideIndex)
    update({ weekOverrides: nextOverrides.length ? nextOverrides : undefined })
  }

  return (
    <article className="builder-exercise" data-open={open}>
      <div className="builder-exercise-summary">
        <button
          aria-expanded={open}
          className="builder-disclosure exercise-disclosure"
          onClick={onToggle}
          type="button"
        >
          <span className="builder-order">{index + 1}</span>
          <span>
            <strong>{name}</strong>
            <small>
              {previewPrescription.sets} x {previewPrescription.reps || 'reps'} /{' '}
              {previewPrescription.overridden ? `week ${previewWeek}` : exercise.rest || 'rest'}
            </small>
          </span>
          {open ? <ChevronUp aria-hidden="true" size={17} /> : <ChevronDown aria-hidden="true" size={17} />}
        </button>
        <div className="builder-item-tools exercise-tools">
          <IconButton
            disabled={index === 0}
            label={`Move ${name} up`}
            onClick={onMoveUp}
          >
            <ArrowUp aria-hidden="true" size={15} />
          </IconButton>
          <IconButton
            disabled={index === total - 1}
            label={`Move ${name} down`}
            onClick={onMoveDown}
          >
            <ArrowDown aria-hidden="true" size={15} />
          </IconButton>
          <IconButton label={`Duplicate ${name}`} onClick={onCopy}>
            <Copy aria-hidden="true" size={14} />
          </IconButton>
          <IconButton
            danger
            disabled={total === 1}
            label={`Delete ${name}`}
            onClick={onRemove}
          >
            <Trash2 aria-hidden="true" size={14} />
          </IconButton>
        </div>
      </div>

      {open ? (
        <div className="exercise-editor-body">
          <div className="builder-field-grid exercise-field-grid">
            <BuilderField
              error={findIssue(issues, `${path}.name`)}
              id={`${exercise.id}-name`}
              label={`Exercise ${index + 1} name`}
              wide
            >
              <input
                aria-invalid={Boolean(findIssue(issues, `${path}.name`))}
                className="text-input"
                id={`${exercise.id}-name`}
                onChange={(event) => update({ name: event.target.value })}
                placeholder="Bench press"
                value={exercise.name}
              />
            </BuilderField>
            <BuilderField
              error={findIssue(issues, `${path}.sets`)}
              id={`${exercise.id}-sets`}
              label="Sets"
            >
              <input
                aria-invalid={Boolean(findIssue(issues, `${path}.sets`))}
                className="text-input"
                id={`${exercise.id}-sets`}
                inputMode="numeric"
                max="99"
                min="1"
                onChange={(event) => update({ sets: numberValue(event.target.value) })}
                type="number"
                value={exercise.sets}
              />
            </BuilderField>
            <BuilderField
              error={findIssue(issues, `${path}.reps`)}
              id={`${exercise.id}-reps`}
              label={getExerciseMetric(exercise) === 'reps' ? 'Rep target' : 'Target'}
            >
              <input
                aria-invalid={Boolean(findIssue(issues, `${path}.reps`))}
                className="text-input"
                id={`${exercise.id}-reps`}
                onChange={(event) => update({ reps: event.target.value })}
                placeholder="8-12"
                value={exercise.reps}
              />
            </BuilderField>
            <BuilderField id={`${exercise.id}-metric`} label="Measure">
              <select className="text-input" id={`${exercise.id}-metric`} value={getExerciseMetric(exercise)} onChange={(event) => update({ metric: event.target.value as ExerciseMetric })}>
                {Object.entries(SET_METRICS).map(([value, definition]) => <option key={value} value={value}>{definition.label}</option>)}
              </select>
            </BuilderField>
            <BuilderField id={`${exercise.id}-rir`} label="Target RIR">
              <input
                className="text-input"
                id={`${exercise.id}-rir`}
                onChange={(event) => update({ targetRir: event.target.value })}
                placeholder="Optional"
                value={exercise.targetRir ?? ''}
              />
            </BuilderField>
            <BuilderField
              error={findIssue(issues, `${path}.rest`)}
              id={`${exercise.id}-rest`}
              label="Rest"
            >
              <input
                aria-invalid={Boolean(findIssue(issues, `${path}.rest`))}
                className="text-input"
                id={`${exercise.id}-rest`}
                onChange={(event) => update({ rest: event.target.value })}
                placeholder="2 min"
                value={exercise.rest}
              />
            </BuilderField>
            <BuilderField id={`${exercise.id}-section`} label="Section">
              <input
                className="text-input"
                id={`${exercise.id}-section`}
                onChange={(event) => update({ section: event.target.value })}
                placeholder="Main work"
                value={exercise.section}
              />
            </BuilderField>
          </div>

          <div className="week-override-section">
            <div className="week-override-heading">
              <div>
                <strong>Week-specific changes</strong>
                <span>Override the base sets or reps during selected weeks.</span>
              </div>
              <button
                className="text-button"
                disabled={weekOverrides.length >= 24 || availableWeek === undefined}
                onClick={addWeekOverride}
                type="button"
              >
                <Plus aria-hidden="true" size={15} />
                Add change
              </button>
            </div>
            {findIssue(issues, `${path}.weekOverrides`) ? (
              <p className="field-error">{findIssue(issues, `${path}.weekOverrides`)}</p>
            ) : null}
            {weekOverrides.length > 0 ? (
              <div className="week-override-list">
                {weekOverrides.map((override, overrideIndex) => {
                  const overridePath = `${path}.weekOverrides.${overrideIndex}`
                  return (
                    <div className="week-override-row" key={overrideIndex}>
                      <div className="week-override-row-heading">
                        <strong>Change {overrideIndex + 1}</strong>
                        <IconButton
                          danger
                          label={`Delete week-specific change ${overrideIndex + 1}`}
                          onClick={() => removeWeekOverride(overrideIndex)}
                        >
                          <Trash2 aria-hidden="true" size={14} />
                        </IconButton>
                      </div>
                      <div className="builder-field-grid override-field-grid">
                        <BuilderField
                          error={findIssue(issues, `${overridePath}.startWeek`)}
                          id={`${exercise.id}-override-${overrideIndex}-start`}
                          label="Start week"
                        >
                          <input
                            className="text-input"
                            id={`${exercise.id}-override-${overrideIndex}-start`}
                            inputMode="numeric"
                            max={Math.max(1, durationWeeks)}
                            min="1"
                            onChange={(event) =>
                              updateWeekOverride(overrideIndex, {
                                startWeek: numberValue(event.target.value),
                              })
                            }
                            type="number"
                            value={override.startWeek}
                          />
                        </BuilderField>
                        <BuilderField
                          error={findIssue(issues, `${overridePath}.endWeek`)}
                          id={`${exercise.id}-override-${overrideIndex}-end`}
                          label="End week"
                        >
                          <input
                            className="text-input"
                            id={`${exercise.id}-override-${overrideIndex}-end`}
                            inputMode="numeric"
                            max={Math.max(1, durationWeeks)}
                            min="1"
                            onChange={(event) =>
                              updateWeekOverride(overrideIndex, {
                                endWeek: numberValue(event.target.value),
                              })
                            }
                            type="number"
                            value={override.endWeek}
                          />
                        </BuilderField>
                        <BuilderField
                          error={findIssue(issues, `${overridePath}.sets`)}
                          id={`${exercise.id}-override-${overrideIndex}-sets`}
                          label="Sets"
                        >
                          <input
                            className="text-input"
                            id={`${exercise.id}-override-${overrideIndex}-sets`}
                            inputMode="numeric"
                            max="99"
                            min="1"
                            onChange={(event) =>
                              updateWeekOverride(overrideIndex, {
                                sets: optionalNumberValue(event.target.value),
                              })
                            }
                            placeholder="Base"
                            type="number"
                            value={override.sets ?? ''}
                          />
                        </BuilderField>
                        <BuilderField
                          error={findIssue(issues, `${overridePath}.reps`)}
                          id={`${exercise.id}-override-${overrideIndex}-reps`}
                          label="Rep target"
                        >
                          <input
                            className="text-input"
                            id={`${exercise.id}-override-${overrideIndex}-reps`}
                            onChange={(event) =>
                              updateWeekOverride(overrideIndex, {
                                reps: event.target.value || undefined,
                              })
                            }
                            placeholder="Base"
                            value={override.reps ?? ''}
                          />
                        </BuilderField>
                      </div>
                      {findIssue(issues, overridePath) ? (
                        <p className="field-error">{findIssue(issues, overridePath)}</p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>

          <fieldset className="builder-fieldset">
            <legend>Set type</legend>
            <div className="builder-segments" aria-label={`Workout ${workoutNumber} exercise ${index + 1} type`}>
              {EXERCISE_KINDS.map((kind) => (
                <button
                  aria-pressed={exercise.kind === kind.value}
                  key={kind.value}
                  onClick={() => update({ kind: kind.value })}
                  type="button"
                >
                  {kind.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="builder-fieldset">
            <legend>Muscle groups</legend>
            <div className="muscle-grid">
              {MUSCLE_GROUPS.map((group) => (
                <label className="muscle-option" key={group.value}>
                  <input
                    checked={exercise.muscleGroups.includes(group.value)}
                    onChange={() => toggleMuscleGroup(group.value)}
                    type="checkbox"
                  />
                  <span>{group.label}</span>
                </label>
              ))}
            </div>
            {findIssue(issues, `${path}.muscleGroups`) ? (
              <p className="field-error">{findIssue(issues, `${path}.muscleGroups`)}</p>
            ) : null}
          </fieldset>

          <label className="check-label pair-toggle">
            <input
              checked={Boolean(exercise.pair)}
              onChange={(event) =>
                update({
                  pair: event.target.checked
                    ? exercise.pair ?? { group: 'Pair 1', label: 'A' }
                    : undefined,
                })
              }
              type="checkbox"
            />
            Part of a paired set
          </label>
          {exercise.pair ? (
            <div className="builder-field-grid pair-fields">
              <BuilderField
                error={findIssue(issues, `${path}.pair.group`)}
                id={`${exercise.id}-pair-group`}
                label="Pair group"
              >
                <input
                  aria-invalid={Boolean(findIssue(issues, `${path}.pair.group`))}
                  className="text-input"
                  id={`${exercise.id}-pair-group`}
                  onChange={(event) =>
                    update({ pair: { ...exercise.pair!, group: event.target.value } })
                  }
                  value={pairGroupLabel ?? exercise.pair.group}
                />
              </BuilderField>
              <BuilderField id={`${exercise.id}-pair-label`} label="Position">
                <select
                  className="text-input"
                  id={`${exercise.id}-pair-label`}
                  onChange={(event) =>
                    update({
                      pair: {
                        ...exercise.pair!,
                        label: event.target.value as 'A' | 'B',
                      },
                    })
                  }
                  value={exercise.pair.label}
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                </select>
              </BuilderField>
            </div>
          ) : null}

          <BuilderField id={`${exercise.id}-notes`} label="Exercise notes" wide>
            <textarea
              id={`${exercise.id}-notes`}
              onChange={(event) => update({ notes: event.target.value })}
              rows={2}
              value={exercise.notes ?? ''}
            />
          </BuilderField>
        </div>
      ) : null}
    </article>
  )
}

function BuilderField({
  children,
  error,
  id,
  label,
  wide = false,
}: {
  children: React.ReactNode
  error?: string
  id: string
  label: string
  wide?: boolean
}) {
  return (
    <div className="builder-field" data-wide={wide || undefined}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  )
}

function IconButton({
  children,
  danger = false,
  disabled = false,
  label,
  onClick,
}: {
  children: React.ReactNode
  danger?: boolean
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-label={label}
      className={danger ? 'builder-icon-button danger-icon' : 'builder-icon-button'}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  )
}

function findIssue(issues: ProgramValidationIssue[], path: string): string | undefined {
  return issues.find((issue) => issue.path === path)?.message
}

function revealIssue(
  issue: ProgramValidationIssue,
  program: TrainingProgram,
  setWorkoutId: (id: string | null) => void,
  setExerciseId: (id: string | null) => void,
) {
  const workoutMatch = issue.path.match(/^workouts\.(\d+)/)
  if (!workoutMatch) return
  const workout = program.workouts[Number(workoutMatch[1])]
  if (!workout) return
  setWorkoutId(workout.id)

  const exerciseMatch = issue.path.match(/\.exercises\.(\d+)/)
  if (exerciseMatch) {
    setExerciseId(workout.exercises[Number(exerciseMatch[1])]?.id ?? null)
  }
}

function numberValue(value: string): number {
  return value === '' ? 0 : Number(value)
}

function optionalNumberValue(value: string): number | undefined {
  return value === '' ? undefined : Number(value)
}
