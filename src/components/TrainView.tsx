import { ChevronDown, Pencil, Play, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import type { TrainingProgram, WorkoutTemplate } from '../types/program'
import type { WorkoutSession } from '../types/session'
import {
  getActiveSession,
  getLatestCompletedSession,
  getProgramSessionCount,
} from '../lib/sessions'
import {
  getProgramCurrentWeek,
  getExercisePrescription,
  getRemainingProgramSessions,
  getWorkingSetCount,
} from '../lib/programMetrics'
import { ModalFrame } from './ModalFrame'

interface TrainViewProps {
  program: TrainingProgram
  sessions: WorkoutSession[]
  nextWorkout: WorkoutTemplate
  selectedWorkoutId: string
  onSelectWorkout: (workoutId: string) => void
  onStartWorkout: (workout: WorkoutTemplate) => void
  onResumeWorkout: (session: WorkoutSession) => void
  onRepeatProgram?: () => void
  onSetCurrentWeek?: (weekNumber: number) => Promise<void>
}

export function TrainView({
  program,
  sessions,
  nextWorkout,
  selectedWorkoutId,
  onSelectWorkout,
  onStartWorkout,
  onResumeWorkout,
  onRepeatProgram,
  onSetCurrentWeek,
}: TrainViewProps) {
  const [weekDialogOpen, setWeekDialogOpen] = useState(false)
  const activeSession = getActiveSession(sessions)
  const completedCount = getProgramSessionCount(program.id, sessions)
  const sessionTarget = getRemainingProgramSessions(program)
  const remainingSessions = getRemainingProgramSessions(program, completedCount)
  const programComplete = remainingSessions === 0 && !activeSession
  const currentWeek = getProgramCurrentWeek(program, completedCount)
  const progressPercent = sessionTarget === 0
    ? 100
    : Math.min(100, (completedCount / sessionTarget) * 100)
  const selectedWorkout =
    program.workouts.find((workout) => workout.id === selectedWorkoutId) ?? nextWorkout
  const actionWorkout = activeSession
    ? program.workouts.find((workout) => workout.id === activeSession.workoutTemplateId) ??
      nextWorkout
    : selectedWorkout

  return (
    <div className="page-view train-view">
      <header className="app-header">
        <span className="wordmark">Liftlog</span>
        <p>{program.name}</p>
      </header>

      <section className="progress-block" aria-label="Program progress">
        <div className="progress-heading">
          <div>
            <span>Week</span>
            <span className="progress-value-with-action">
              <strong>{currentWeek} / {program.durationWeeks}</strong>
              {onSetCurrentWeek && !activeSession ? (
                <button
                  aria-label="Set current program week"
                  className="plain-icon-button compact-icon-button"
                  onClick={() => setWeekDialogOpen(true)}
                  title="Set current week"
                  type="button"
                >
                  <Pencil aria-hidden="true" size={14} />
                </button>
              ) : null}
            </span>
          </div>
          <div className="progress-number">
            <span>Logged</span>
            <strong>
              {Math.min(completedCount, sessionTarget)} / {sessionTarget}
            </strong>
          </div>
        </div>
        <div className="progress-track" aria-hidden="true">
          <span style={{ width: `${progressPercent}%` }} />
        </div>
        <p>
          {remainingSessions} sessions left. {program.liftingDaysPerWeek} workouts each week.
        </p>
      </section>

      <section className="next-workout" aria-labelledby="next-workout-heading">
        <span className="section-label">{activeSession ? 'In progress' : actionWorkout.id === nextWorkout.id ? 'Suggested workout' : 'Selected workout'}</span>
        <h1 id="next-workout-heading">{actionWorkout.shortTitle}</h1>
        <p>
          {actionWorkout.scheduledDay} / {getWorkingSetCount(actionWorkout, currentWeek)} working sets
        </p>
        {!activeSession ? (
          <div className="workout-chooser" aria-label="Choose workout">
            {program.workouts.map((workout) => (
              <button
                aria-label={`Select ${workout.shortTitle}`}
                aria-pressed={workout.id === selectedWorkout.id}
                key={workout.id}
                onClick={() => onSelectWorkout(workout.id)}
                title={workout.shortTitle}
                type="button"
              >
                Day {workout.dayNumber}
              </button>
            ))}
          </div>
        ) : null}
        <button
          className="primary-button"
          onClick={() =>
            activeSession ? onResumeWorkout(activeSession) : onStartWorkout(actionWorkout)
          }
          type="button"
        >
          <Play aria-hidden="true" fill="currentColor" size={17} />
          {activeSession ? 'Resume workout' : 'Start workout'}
        </button>
        {programComplete && onRepeatProgram && !activeSession ? (
          <button className="repeat-program-button" onClick={onRepeatProgram} type="button">
            <RotateCcw aria-hidden="true" size={15} />
            Start a new program cycle
          </button>
        ) : null}
      </section>

      <section className="week-section" aria-labelledby="week-heading">
        <div className="section-title-row">
          <h2 id="week-heading">Workouts</h2>
          <span>{program.liftingDaysPerWeek} days</span>
        </div>

        <div className="workout-list">
          {program.workouts.map((workout) => {
            const selected = workout.id === selectedWorkout.id
            const lastSession = getLatestCompletedSession(sessions, workout.id)

            return (
              <div className="workout-row-wrap" key={workout.id}>
                <button
                  aria-expanded={selected}
                  className="workout-row"
                  onClick={() => onSelectWorkout(workout.id)}
                  type="button"
                >
                  <span className="day-number">{workout.dayNumber}</span>
                  <span className="workout-row-copy">
                    <strong>{workout.shortTitle}</strong>
                    <small>
                      {workout.scheduledDay} / {getWorkingSetCount(workout, currentWeek)} sets
                      {lastSession ? ` / Last ${formatShortDate(lastSession)}` : ''}
                    </small>
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className="row-chevron"
                    data-open={selected}
                    size={18}
                  />
                </button>

                {selected ? (
                  <WorkoutOutline
                    activeSession={activeSession}
                    weekNumber={currentWeek}
                    workout={workout}
                    onResumeWorkout={onResumeWorkout}
                    onStartWorkout={onStartWorkout}
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      {weekDialogOpen && onSetCurrentWeek ? (
        <ProgramWeekDialog
          currentWeek={currentWeek}
          minimumWeek={Math.min(
            program.durationWeeks,
            Math.floor(completedCount / program.liftingDaysPerWeek) + 1,
          )}
          onClose={() => setWeekDialogOpen(false)}
          onSave={onSetCurrentWeek}
          totalWeeks={program.durationWeeks}
        />
      ) : null}
    </div>
  )
}

interface WorkoutOutlineProps {
  workout: WorkoutTemplate
  activeSession: WorkoutSession | undefined
  weekNumber: number
  onStartWorkout: (workout: WorkoutTemplate) => void
  onResumeWorkout: (session: WorkoutSession) => void
}

function WorkoutOutline({
  workout,
  activeSession,
  weekNumber,
  onStartWorkout,
  onResumeWorkout,
}: WorkoutOutlineProps) {
  return (
    <div className="workout-outline">
      <p className="outline-note">{workout.sourceSummary}</p>
      <ol>
        {workout.exercises.map((exercise) => {
          const prescription = getExercisePrescription(exercise, weekNumber)
          return (
            <li data-adjusted={prescription.overridden || undefined} key={exercise.id}>
              <span>{exercise.name}</span>
              <strong>
                {prescription.sets} x {prescription.reps}
              </strong>
              {prescription.overridden ? (
                <small className="prescription-source">
                  Week {weekNumber} adjustment / base program {exercise.sets} x {exercise.reps}
                </small>
              ) : null}
            </li>
          )
        })}
      </ol>
      <button
        className="secondary-button full-width"
        onClick={() =>
          activeSession ? onResumeWorkout(activeSession) : onStartWorkout(workout)
        }
        type="button"
      >
        {activeSession ? 'Resume current workout' : `Start ${workout.shortTitle}`}
      </button>
    </div>
  )
}

function ProgramWeekDialog({
  currentWeek,
  minimumWeek,
  onClose,
  onSave,
  totalWeeks,
}: {
  currentWeek: number
  minimumWeek: number
  onClose: () => void
  onSave: (weekNumber: number) => Promise<void>
  totalWeeks: number
}) {
  const [week, setWeek] = useState(String(currentWeek))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const value = Number(week)
    if (!Number.isSafeInteger(value) || value < minimumWeek || value > totalWeeks) {
      setError(`Enter week ${minimumWeek} to ${totalWeeks}.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave(value)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Program progress could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalFrame labelledBy="program-week-heading" bottom busy={busy} onClose={onClose}>
      <div className="sheet-heading">
        <div>
          <span className="section-label">Program progress</span>
          <h2 id="program-week-heading">Set current week</h2>
        </div>
        <button className="plain-icon-button" disabled={busy} onClick={onClose} title="Close" type="button">
          <X aria-hidden="true" size={20} />
          <span className="sr-only">Close</span>
        </button>
      </div>
      <label className="builder-field" htmlFor="current-program-week">
        <span>Current week</span>
        <input
          className="text-input"
          id="current-program-week"
          inputMode="numeric"
          max={totalWeeks}
          min={minimumWeek}
          onChange={(event) => setWeek(event.target.value)}
          type="number"
          value={week}
        />
      </label>
      <p className="sheet-note">Logged workouts stay intact. This only corrects where you are in the program.</p>
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
      <div className="sheet-actions">
        <button className="secondary-button" disabled={busy} onClick={onClose} type="button">Cancel</button>
        <button className="primary-button" disabled={busy} onClick={() => void save()} type="button">
          {busy ? 'Saving...' : 'Save week'}
        </button>
      </div>
    </ModalFrame>
  )
}

function formatShortDate(session: WorkoutSession): string {
  const date = new Date(session.completedAt ?? session.startedAt)
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}
