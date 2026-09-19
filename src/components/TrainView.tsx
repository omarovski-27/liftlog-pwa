import { ChevronDown, Play, RotateCcw } from 'lucide-react'
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

interface TrainViewProps {
  program: TrainingProgram
  sessions: WorkoutSession[]
  nextWorkout: WorkoutTemplate
  selectedWorkoutId: string
  onSelectWorkout: (workoutId: string) => void
  onStartWorkout: (workout: WorkoutTemplate) => void
  onResumeWorkout: (session: WorkoutSession) => void
  onRepeatProgram?: () => void
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
}: TrainViewProps) {
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
    : nextWorkout

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
            <strong>
              {currentWeek} / {program.durationWeeks}
            </strong>
          </div>
          <div className="progress-number">
            <span>Completed</span>
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

      {programComplete ? (
        <section className="next-workout" aria-labelledby="complete-heading">
          <span className="section-label">{program.durationWeeks} weeks</span>
          <h1 id="complete-heading">Program complete</h1>
          {onRepeatProgram ? <button className="primary-button" onClick={onRepeatProgram} type="button"><RotateCcw aria-hidden="true" size={17} />Repeat program</button> : null}
        </section>
      ) : <section className="next-workout" aria-labelledby="next-workout-heading">
        <span className="section-label">{activeSession ? 'In progress' : 'Next workout'}</span>
        <h1 id="next-workout-heading">{actionWorkout.shortTitle}</h1>
        <p>
          {actionWorkout.scheduledDay} / {getWorkingSetCount(actionWorkout, currentWeek)} working sets
        </p>
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
      </section>}

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
                    complete={programComplete}
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
    </div>
  )
}

interface WorkoutOutlineProps {
  workout: WorkoutTemplate
  activeSession: WorkoutSession | undefined
  complete: boolean
  weekNumber: number
  onStartWorkout: (workout: WorkoutTemplate) => void
  onResumeWorkout: (session: WorkoutSession) => void
}

function WorkoutOutline({
  workout,
  activeSession,
  complete,
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
            </li>
          )
        })}
      </ol>
      {complete ? null : <button
        className="secondary-button full-width"
        onClick={() =>
          activeSession ? onResumeWorkout(activeSession) : onStartWorkout(workout)
        }
        type="button"
      >
        {activeSession ? 'Resume current workout' : `Start ${workout.shortTitle}`}
      </button>}
    </div>
  )
}

function formatShortDate(session: WorkoutSession): string {
  const date = new Date(session.completedAt ?? session.startedAt)
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}
