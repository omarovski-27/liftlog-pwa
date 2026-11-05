import { CalendarDays, ChevronRight } from 'lucide-react'
import { ExerciseCard } from './ExerciseCard'
import type { RehabExercise } from './types'
import { WEEKDAYS, weeklyRoutines, unassignedExercises } from './weeklyRotation'

export function DailyPrograms({
  exercises,
  selectedDay,
  onSelectDay,
  todayDay,
  todayLabel,
  onLogDay,
  onResume,
  busy,
  hasUnfinished,
  canLog,
  configuredCount = 0,
}: {
  exercises: RehabExercise[]
  selectedDay: number
  onSelectDay: (day: number) => void
  todayDay: number
  todayLabel: string
  onLogDay: (ids: string[], configured?: boolean) => void
  onResume: () => void
  busy: boolean
  hasUnfinished: boolean
  canLog: boolean
  configuredCount?: number
}) {
  const routines = weeklyRoutines(exercises)
  const selected = routines[selectedDay]
  const unassigned = unassignedExercises(exercises, routines)
  const configuredToday =
    selected.source === 'saved' &&
    selectedDay === todayDay &&
    configuredCount > 0
  return (
    <section className="physio-daily-programs" aria-label="Daily programs">
      <div className="physio-week-heading">
        <span>
          <CalendarDays size={17} aria-hidden="true" />
          Your week
        </span>
        <small>{todayLabel}</small>
      </div>
      <div className="physio-week-strip" aria-label="Choose a day">
        {routines.map((day) => (
          <button
            type="button"
            key={day.weekday}
            aria-label={`${WEEKDAYS[day.weekday]} program`}
            aria-pressed={selectedDay === day.weekday}
            onClick={() => onSelectDay(day.weekday)}
          >
            <span>{WEEKDAYS[day.weekday].slice(0, 3)}</span>
            <strong>{day.exercises.length || '—'}</strong>
            {todayDay === day.weekday ? <i aria-label="Today" /> : null}
          </button>
        ))}
      </div>
      <div className="physio-day-hero">
        <span className="physio-eyebrow">
          {WEEKDAYS[selectedDay]}
          {selectedDay === todayDay ? ' · Today' : ''}
        </span>
        <h2>{selected.title}</h2>
        <p>
          {selected.exercises.length} exercises<span>•</span>
          {selected.source === 'draft'
            ? 'Draft day split'
            : 'Your saved arrangement'}
        </p>
      </div>
      {selected.source === 'draft' ? (
        <details className="physio-rotation-note">
          <summary>Draft grouping · confirm frequency & doses</summary>
          <p>
            Knee, hip, ankle, foot and balance exercises stay together. Core and
            back exercises share a group; neck and upper-body work have their own
            group. Repeated lists are for organization, not confirmed treatment
            frequency. Use
            your physiotherapist’s instructions for what to perform and how
            often. Missing doses stay blank. Exercises with unclear variants
            remain below for review.
          </p>
        </details>
      ) : null}
      {selected.source === 'draft' && selectedDay === 2 ? (
        <p className="physio-flex-note">
          Rest or check in today. No exercises are assigned in this draft.
        </p>
      ) : null}
      {hasUnfinished ? (
        <button
          className="physio-main-action"
          type="button"
          disabled={busy}
          onClick={onResume}
        >
          Resume your unfinished session
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      ) : selected.exercises.length ? (
        <button
          className="physio-main-action"
          type="button"
          disabled={busy || !canLog}
          onClick={() =>
            onLogDay(
              selected.exercises.map((exercise) => exercise.id),
              configuredToday,
            )
          }
        >
          {configuredToday
            ? `Start configured routine · ${configuredCount}`
            : selected.source === 'saved' && selectedDay === todayDay
              ? 'Log unconfirmed work manually'
              : selectedDay === todayDay
                ? 'Log today’s exercise list'
                : 'Log this list today'}
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      ) : (
        <div className="physio-rest-card">
          <h3>Rest or check-in</h3>
          <p>
            No exercises assigned to this day. You can record a check-in below.
          </p>
        </div>
      )}
      {configuredToday && configuredCount < selected.exercises.length ? (
        <p className="physio-flex-note">
          {configuredCount} configured items will be included. Remaining items
          are listed for review.
        </p>
      ) : null}
      <div className="physio-movement-list">
        {selected.exercises.map((exercise, index) => (
          <ExerciseCard exercise={exercise} index={index} key={exercise.id} />
        ))}
      </div>
      {unassigned.length ? (
        <details className="physio-unassigned">
          <summary>
            {unassigned.length} other exercises · review or arrange
          </summary>
          <p>
            These stay in your library. Confirm unclear variants before adding
            them to a routine. Paused or retired items stay out of day lists.
          </p>
          {unassigned.map((exercise, index) => (
            <ExerciseCard exercise={exercise} index={index} key={exercise.id} />
          ))}
        </details>
      ) : null}
    </section>
  )
}
