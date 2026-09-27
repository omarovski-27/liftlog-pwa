import { ChevronDown, Pencil, TrendingDown, TrendingUp, Upload, X } from 'lucide-react'
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
import type { ExerciseMetric, TrainingProgram } from '../types/program'
import { getExerciseMetric, getSetQuantity, SET_METRICS } from '../lib/setMetrics'
import type { WorkoutSession } from '../types/session'
import { MAX_BACKUP_BYTES, parseBackup, summarizeBackup } from '../lib/backups'
import type { LiftLogBackup } from '../types/storage'
import { ModalFrame } from './ModalFrame'

interface HistoryViewProps {
  program: TrainingProgram
  sessions: WorkoutSession[]
  onEditSession?: (session: WorkoutSession) => void
  onMergeBackup?: (backup: LiftLogBackup) => Promise<void>
}

export function HistoryView({ onEditSession, onMergeBackup, program, sessions }: HistoryViewProps) {
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
        {onMergeBackup ? <HistoryRecoveryButton onMerge={onMergeBackup} /> : null}
      </header>

      <section className="history-summary" aria-label="Training summary">
        <div>
          <span>Week {weekProgress.currentWeek}</span>
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
          editableProgramId={program.id}
          onEditSession={onEditSession}
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

function HistoryRecoveryButton({ onMerge }: { onMerge: (backup: LiftLogBackup) => Promise<void> }) {
  const [pending, setPending] = useState<{ backup: LiftLogBackup; fileName: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function selectFile(file: File | undefined) {
    if (!file) return
    setError(null)
    if (file.size > MAX_BACKUP_BYTES) {
      setError('The backup is larger than 25 MB.')
      return
    }
    try {
      setPending({ backup: parseBackup(await readFile(file)), fileName: file.name })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The backup could not be read.')
    }
  }

  async function merge() {
    if (!pending || busy) return
    setBusy(true)
    setError(null)
    try {
      await onMerge(pending.backup)
      setPending(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The backup could not be merged.')
    } finally {
      setBusy(false)
    }
  }

  const summary = pending ? summarizeBackup(pending.backup) : null
  return (
    <>
      <label className="secondary-button history-import-button" htmlFor="history-backup-upload">
        <Upload aria-hidden="true" size={15} />
        Import previous data
      </label>
      <input
        accept="application/json,.json"
        className="sr-only"
        id="history-backup-upload"
        onChange={(event) => {
          void selectFile(event.target.files?.[0])
          event.target.value = ''
        }}
        type="file"
      />
      {error && !pending ? <p className="inline-error" role="alert">{error}</p> : null}
      {pending && summary ? (
        <ModalFrame labelledBy="history-import-heading" busy={busy} onClose={() => setPending(null)}>
          <div className="sheet-heading">
            <div>
              <span className="section-label">{pending.fileName}</span>
              <h2 id="history-import-heading">Import previous data</h2>
            </div>
            <button className="plain-icon-button" disabled={busy} onClick={() => setPending(null)} title="Close" type="button">
              <X aria-hidden="true" size={20} />
              <span className="sr-only">Close</span>
            </button>
          </div>
          <dl className="backup-summary">
            <div><dt>Finished</dt><dd>{summary.completedSessionCount}</dd></div>
            <div><dt>Active</dt><dd>{summary.activeSessionCount}</dd></div>
            <div><dt>Alternatives</dt><dd>{summary.alternativeCount}</dd></div>
          </dl>
          <p className="sheet-note">Existing workouts stay in place. Matching records are updated only when the backup copy is newer.</p>
          {error ? <p className="inline-error" role="alert">{error}</p> : null}
          <div className="dialog-actions">
            <button className="secondary-button" disabled={busy} onClick={() => setPending(null)} type="button">Cancel</button>
            <button className="primary-button" disabled={busy} onClick={() => void merge()} type="button">
              {busy ? 'Importing...' : 'Merge data'}
            </button>
          </div>
        </ModalFrame>
      ) : null}
    </>
  )
}

interface SessionHistoryProps {
  completedSessions: WorkoutSession[]
  editableProgramId: string
  onEditSession?: (session: WorkoutSession) => void
  onToggle: (sessionId: string | null) => void
  openSessionId: string | null
}

function SessionHistory({
  completedSessions,
  editableProgramId,
  onEditSession,
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

            {open ? (
              <HistoryDetail
                editable={session.programId === editableProgramId}
                onEdit={onEditSession ? () => onEditSession(session) : undefined}
                session={session}
              />
            ) : null}
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
              {trend.name}{trends.some((other) => other.key !== trend.key && other.name === trend.name) ? ` (${SET_METRICS[trend.metric].label})` : ''}
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
            <span>All-time best</span>
            <strong>{formatTopSet(selectedTrend.best)}</strong>
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
                aria-label={`${formatChartDate(point.date)}: ${formatChartValue(value, chart.weighted, point.metric)}`}
                className="trend-bar"
                style={{ height: `${height}%` }}
                title={formatChartValue(value, chart.weighted, point.metric)}
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
                  {point.completedSets} sets / {point.totalQuantity} {SET_METRICS[point.metric].unit} /{' '}
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

function HistoryDetail({
  editable,
  onEdit,
  session,
}: {
  editable: boolean
  onEdit?: () => void
  session: WorkoutSession
}) {
  return (
    <div className="history-detail">
      {session.exercises.map((exercise) => {
        const completedSets = exercise.sets.filter((set) => set.completed)
        if (completedSets.length === 0 && !exercise.sessionNotes) {
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
            <p>{completedSets.length > 0 ? completedSets.map((set) => formatSet(set, getExerciseMetric(exercise))).join(' / ') : 'No completed sets'}</p>
            {exercise.sessionNotes ? <p className="history-exercise-note">{exercise.sessionNotes}</p> : null}
          </div>
        )
      })}
      {session.sessionNotes ? <p className="history-note">{session.sessionNotes}</p> : null}
      {editable && onEdit ? (
        <button className="secondary-button full-width edit-history-button" onClick={onEdit} type="button">
          <Pencil aria-hidden="true" size={15} />
          Edit workout
        </button>
      ) : null}
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

  const reps = latest.totalQuantity - previous.totalQuantity
  return {
    label: `${reps > 0 ? '+' : ''}${formatLoad(reps)} ${SET_METRICS[trend.metric].unit}`,
    tone: toneFor(reps),
  }
}

function getChart(trend: ExerciseTrend): {
  label: string
  weighted: boolean
  points: Array<{ point: ExercisePerformancePoint; value: number; height: number }>
} {
  const weighted = trend.latest.estimatedOneRepMaxKg !== null
  const recent = trend.points.filter((point) => !weighted || point.estimatedOneRepMaxKg !== null).slice(-8)
  const values = recent.map((point) =>
    weighted ? point.estimatedOneRepMaxKg ?? 0 : point.totalQuantity,
  )
  const maximum = Math.max(1, ...values)
  return {
    label: weighted ? 'Estimated strength trend' : `Completed ${trend.metric === 'meters' ? 'distance' : trend.metric} trend`,
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
  const quantity = getSetQuantity(set, point.metric) ?? '-'
  const unit = SET_METRICS[point.metric].unit
  if (set.weightKg === null) return `${quantity} ${unit}${effort}`
  return `${formatLoad(set.weightKg)}kg x ${quantity}${point.metric === 'reps' ? '' : ` ${unit}`}${effort}`
}

function formatSet(set: WorkoutSession['exercises'][number]['sets'][number], metric: ExerciseMetric): string {
  const weight = set.weightKg === null ? '-' : `${formatLoad(set.weightKg)}kg`
  const quantity = getSetQuantity(set, metric) ?? '-'
  return `${weight} x ${quantity}${metric === 'reps' ? '' : ` ${SET_METRICS[metric].unit}`}${set.rir === null ? '' : ` @${set.rir}`}`
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

function formatLoad(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 10 })
}

function formatHistoryDate(session: WorkoutSession): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(session.completedAt ?? session.startedAt))
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
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

function formatChartValue(value: number, weighted: boolean, metric: ExerciseMetric): string {
  return weighted ? `${formatNumber(value)}kg estimated max` : `${formatLoad(value)} ${SET_METRICS[metric].unit}`
}

function shortenWorkoutTitle(title: string): string {
  return title.replace(/^Day \d+ - /, '')
}
