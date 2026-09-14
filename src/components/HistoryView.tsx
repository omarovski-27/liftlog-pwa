import { ChevronDown, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  getCurrentProgramWeekSessions,
  getExerciseTrends,
  getTrainingSummary,
  type ExercisePerformancePoint,
  type ExerciseTrend,
} from '../lib/analytics'
import {
  getCompletedSessions,
  getSessionSetProgress,
  getSessionVolume,
} from '../lib/sessions'
import type { TrainingProgram } from '../types/program'
import type { WorkoutSession } from '../types/session'

interface HistoryViewProps {
  program: TrainingProgram
  sessions: WorkoutSession[]
}

export function HistoryView({ program, sessions }: HistoryViewProps) {
  const completedSessions = getCompletedSessions(sessions)
  const summary = useMemo(() => getTrainingSummary(sessions), [sessions])
  const trends = useMemo(() => getExerciseTrends(sessions), [sessions])
  const weekProgress = getCurrentProgramWeekSessions(program, sessions)
  const [mode, setMode] = useState<'sessions' | 'progress'>('sessions')
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)
  const [selectedExerciseKey, setSelectedExerciseKey] = useState('')
  const selectedTrend =
    trends.find((trend) => trend.key === selectedExerciseKey) ?? trends[0]

  return (
    <div className="page-view history-view">
      <header className="page-header">
        <span className="section-label">Logbook</span>
        <h1>History</h1>
        <p>{completedSessions.length} completed workouts</p>
      </header>

      <section className="history-summary" aria-label="Training summary">
        <div>
          <span>This week</span>
          <strong>
            {weekProgress.completed} / {weekProgress.target}
          </strong>
        </div>
        <div>
          <span>Sets</span>
          <strong>{summary.completedSets}</strong>
        </div>
        <div>
          <span>Volume</span>
          <strong>{formatCompactVolume(summary.volumeKg)}</strong>
        </div>
      </section>

      <div className="history-mode-tabs" aria-label="History view" role="tablist">
        <button
          aria-selected={mode === 'sessions'}
          onClick={() => setMode('sessions')}
          role="tab"
          type="button"
        >
          Sessions
        </button>
        <button
          aria-selected={mode === 'progress'}
          onClick={() => setMode('progress')}
          role="tab"
          type="button"
        >
          Progress
        </button>
      </div>

      {mode === 'sessions' ? (
        <SessionHistory
          completedSessions={completedSessions}
          onToggle={setOpenSessionId}
          openSessionId={openSessionId}
        />
      ) : (
        <ExerciseProgress
          onSelect={setSelectedExerciseKey}
          selectedTrend={selectedTrend}
          trends={trends}
        />
      )}
    </div>
  )
}

interface SessionHistoryProps {
  completedSessions: WorkoutSession[]
  onToggle: (sessionId: string | null) => void
  openSessionId: string | null
}

function SessionHistory({
  completedSessions,
  onToggle,
  openSessionId,
}: SessionHistoryProps) {
  if (completedSessions.length === 0) {
    return (
      <div className="empty-state">
        <h2>No workouts yet</h2>
        <p>Your finished sessions will appear here.</p>
      </div>
    )
  }

  return (
    <div className="history-list">
      {completedSessions.map((session) => {
        const open = openSessionId === session.id
        const setProgress = getSessionSetProgress(session)
        const volume = getSessionVolume(session)

        return (
          <article className="history-entry" key={session.id}>
            <button
              aria-expanded={open}
              className="history-row"
              onClick={() => onToggle(open ? null : session.id)}
              type="button"
            >
              <time dateTime={session.completedAt}>{formatHistoryDate(session)}</time>
              <span className="history-copy">
                <strong>{shortenWorkoutTitle(session.workoutTitle)}</strong>
                <small>
                  {setProgress.completed} sets / {formatVolume(volume)}
                </small>
              </span>
              <ChevronDown
                aria-hidden="true"
                className="row-chevron"
                data-open={open}
                size={18}
              />
            </button>

            {open ? <HistoryDetail session={session} /> : null}
          </article>
        )
      })}
    </div>
  )
}

interface ExerciseProgressProps {
  onSelect: (key: string) => void
  selectedTrend?: ExerciseTrend
  trends: ExerciseTrend[]
}

function ExerciseProgress({ onSelect, selectedTrend, trends }: ExerciseProgressProps) {
  if (!selectedTrend) {
    return (
      <div className="empty-state">
        <h2>No exercise data yet</h2>
        <p>Complete a set to begin an exercise trend.</p>
      </div>
    )
  }

  const change = describeChange(selectedTrend)
  const chart = getChart(selectedTrend)

  return (
    <div className="exercise-progress">
      <label className="progress-exercise-picker">
        <span>Exercise</span>
        <select
          className="text-input"
          onChange={(event) => onSelect(event.target.value)}
          value={selectedTrend.key}
        >
          {trends.map((trend) => (
            <option key={trend.key} value={trend.key}>
              {trend.name}
            </option>
          ))}
        </select>
      </label>

      <section className="trend-overview" aria-labelledby="exercise-trend-heading">
        <div className="trend-heading">
          <div>
            <span className="section-label">Latest performance</span>
            <h2 id="exercise-trend-heading">{selectedTrend.name}</h2>
          </div>
          <span>{selectedTrend.points.length} sessions</span>
        </div>

        <div className="trend-metrics">
          <div>
            <span>Top set</span>
            <strong>{formatTopSet(selectedTrend.latest)}</strong>
          </div>
          <div>
            <span>Est. max</span>
            <strong>{formatEstimatedMax(selectedTrend.latest)}</strong>
          </div>
          <div data-tone={change.tone}>
            <span>Vs previous</span>
            <strong>
              {change.tone === 'positive' ? (
                <TrendingUp aria-hidden="true" size={15} />
              ) : null}
              {change.tone === 'negative' ? (
                <TrendingDown aria-hidden="true" size={15} />
              ) : null}
              {change.label}
            </strong>
          </div>
        </div>
      </section>

      <section className="trend-chart-section" aria-label={chart.label}>
        <div className="trend-chart-heading">
          <strong>{chart.label}</strong>
          <span>Last {chart.points.length}</span>
        </div>
        <div className="trend-chart">
          {chart.points.map(({ point, value, height }) => (
            <div className="trend-column" key={point.id}>
              <span
                aria-label={`${formatChartDate(point.date)}: ${formatChartValue(value, chart.weighted)}`}
                className="trend-bar"
                style={{ height: `${height}%` }}
                title={formatChartValue(value, chart.weighted)}
              />
              <small>{formatChartDate(point.date)}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="trend-history" aria-label="Exercise history">
        {selectedTrend.points
          .slice()
          .reverse()
          .slice(0, 8)
          .map((point) => (
            <div key={point.id}>
              <time dateTime={point.date}>{formatPointDate(point.date)}</time>
              <span>
                <strong>{formatTopSet(point)}</strong>
                <small>
                  {point.completedSets} sets / {point.totalReps} reps /{' '}
                  {formatVolume(point.volumeKg)}
                </small>
              </span>
              <em>W{point.weekNumber}</em>
            </div>
          ))}
      </section>
    </div>
  )
}

function HistoryDetail({ session }: { session: WorkoutSession }) {
  return (
    <div className="history-detail">
      {session.exercises.map((exercise) => {
        const completedSets = exercise.sets.filter((set) => set.completed)
        if (completedSets.length === 0) {
          return null
        }

        return (
          <div className="history-exercise" key={exercise.id}>
            <div>
              <strong>{exercise.performedName}</strong>
              {exercise.performedName !== exercise.originalName ? (
                <small>Instead of {exercise.originalName}</small>
              ) : null}
            </div>
            <p>{completedSets.map((set) => formatSet(set)).join(' / ')}</p>
          </div>
        )
      })}
      {session.sessionNotes ? <p className="history-note">{session.sessionNotes}</p> : null}
    </div>
  )
}

function describeChange(trend: ExerciseTrend): {
  label: string
  tone: 'positive' | 'negative' | 'neutral'
} {
  const { latest, previous } = trend
  if (!previous) return { label: 'First entry', tone: 'neutral' }
  if (
    latest.estimatedOneRepMaxKg !== null &&
    previous.estimatedOneRepMaxKg !== null &&
    previous.estimatedOneRepMaxKg > 0
  ) {
    const percent =
      ((latest.estimatedOneRepMaxKg - previous.estimatedOneRepMaxKg) /
        previous.estimatedOneRepMaxKg) *
      100
    return {
      label: `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`,
      tone: toneFor(percent),
    }
  }

  const reps = latest.totalReps - previous.totalReps
  return {
    label: `${reps > 0 ? '+' : ''}${reps} reps`,
    tone: toneFor(reps),
  }
}

function getChart(trend: ExerciseTrend): {
  label: string
  weighted: boolean
  points: Array<{ point: ExercisePerformancePoint; value: number; height: number }>
} {
  const recent = trend.points.slice(-8)
  const weighted = recent.some((point) => point.estimatedOneRepMaxKg !== null)
  const values = recent.map((point) =>
    weighted ? point.estimatedOneRepMaxKg ?? 0 : point.totalReps,
  )
  const maximum = Math.max(1, ...values)
  return {
    label: weighted ? 'Estimated strength trend' : 'Completed reps trend',
    weighted,
    points: recent.map((point, index) => ({
      point,
      value: values[index],
      height: Math.max(8, Math.round((values[index] / maximum) * 100)),
    })),
  }
}

function toneFor(value: number): 'positive' | 'negative' | 'neutral' {
  if (value > 0.05) return 'positive'
  if (value < -0.05) return 'negative'
  return 'neutral'
}

function formatTopSet(point: ExercisePerformancePoint): string {
  const set = point.topSet
  const effort = set.rir === null ? '' : ` @${set.rir}`
  if (set.weightKg === null) return `${set.reps ?? '-'} reps${effort}`
  return `${formatNumber(set.weightKg)}kg x ${set.reps ?? '-'}${effort}`
}

function formatEstimatedMax(point: ExercisePerformancePoint): string {
  return point.estimatedOneRepMaxKg === null
    ? '-'
    : `${formatNumber(point.estimatedOneRepMaxKg)}kg`
}

function formatSet(set: WorkoutSession['exercises'][number]['sets'][number]): string {
  const weight = set.weightKg === null ? '-' : `${formatNumber(set.weightKg)}kg`
  const reps = set.reps === null ? '-' : set.reps
  return `${weight} x ${reps}${set.rir === null ? '' : ` @${set.rir}`}`
}

function formatVolume(volume: number): string {
  return `${Math.round(volume).toLocaleString()} kg`
}

function formatCompactVolume(volume: number): string {
  if (volume >= 1000) return `${formatNumber(volume / 1000)}k kg`
  return `${Math.round(volume)} kg`
}

function formatNumber(value: number): string {
  return Number(value.toFixed(1)).toLocaleString()
}

function formatHistoryDate(session: WorkoutSession): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(session.completedAt ?? session.startedAt))
}

function formatPointDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function formatChartDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(value))
}

function formatChartValue(value: number, weighted: boolean): string {
  return weighted ? `${formatNumber(value)}kg estimated max` : `${value} reps`
}

function shortenWorkoutTitle(title: string): string {
  return title.replace(/^Day \d+ - /, '')
}
