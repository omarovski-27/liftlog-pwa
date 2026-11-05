import type { ReactNode } from 'react'
import { Play, ArrowUpRight } from 'lucide-react'
import { exerciseDemonstration, exerciseGroup, exerciseGroupNames } from './defaultLibrary'
import type { Dose, RehabExercise } from './types'
import { safeDemoUrl } from './validation'

function doseSummary(dose: Dose) {
  const parts = [
    dose.sets === null ? null : `${dose.sets} sets`,
    dose.reps === null ? null : `${dose.reps} reps`,
    dose.holdSecondsPerRep === null
      ? null
      : `${dose.holdSecondsPerRep}s hold / rep`,
    dose.durationSeconds === null ? null : `${dose.durationSeconds}s total`,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Sets / reps not provided'
}

export function VideoAction({ exercise }: { exercise: RehabExercise }) {
  const demo = exerciseDemonstration(exercise)
  return demo ? (
    <a
      className="physio-video-button"
      href={safeDemoUrl(demo.url)}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      aria-label={`Watch ${exercise.name} video ↗`}
    >
      <span className="physio-video-play">
        <Play size={15} fill="currentColor" aria-hidden="true" />
      </span>
      <span>Watch video</span>
      <ArrowUpRight size={17} aria-hidden="true" />
    </a>
  ) : (
    <span className="physio-video-missing">Video unavailable</span>
  )
}

export function ExerciseDetails({ exercise: e }: { exercise: RehabExercise }) {
  const demo = exerciseDemonstration(e)
  return (
    <details className="physio-technique">
      <summary>Technique & source</summary>
      <div>
        {e.sourceInstructions ? <p>{e.sourceInstructions}</p> : null}
        {e.notes ? <p>{e.notes}</p> : null}
        <dl>
          <div>
            <dt>Rep basis</dt>
            <dd>{e.dose.repBasis ?? 'Not confirmed'}</dd>
          </div>
          <div>
            <dt>Side</dt>
            <dd>{e.dose.side ?? 'Not confirmed'}</dd>
          </div>
          <div>
            <dt>Weekly frequency</dt>
            <dd>{e.dose.frequencyPerWeek ?? 'Not confirmed'}</dd>
          </div>
          <div>
            <dt>Target source</dt>
            <dd>{e.doseOrigin}</dd>
          </div>
          <div>
            <dt>Variant</dt>
            <dd>{e.variantConfirmed ? 'User confirmed' : 'Not confirmed'}</dd>
          </div>
        </dl>
        {e.sourceDoseText ? <p>Original dose: {e.sourceDoseText}</p> : null}
        {demo ? (
          <>
            <p>
              <strong>{demo.title}</strong>
              <br />
              {demo.provider}
            </p>
            <p>{demo.variant}</p>
            <p className="physio-small">
              {demo.status} · Metadata checked {demo.checkedOn}. {demo.reviewer}
              . Captions unknown. Video needs internet.
            </p>
          </>
        ) : (
          <p>Add a demonstration link in Plan.</p>
        )}
      </div>
    </details>
  )
}

export function ExerciseCard({
  exercise,
  index,
  status,
  children,
}: {
  exercise: RehabExercise
  index?: number
  status?: string
  children?: ReactNode
}) {
  const demo = exerciseDemonstration(exercise)
  return (
    <article className="physio-movement-card">
      <header className="physio-movement-heading">
        {index !== undefined ? (
          <span className="physio-movement-number">
            {String(index + 1).padStart(2, '0')}
          </span>
        ) : null}
        <div>
          <span className="physio-eyebrow">{exerciseGroupNames[exerciseGroup(exercise)]}</span>
          <h3>{exercise.name}</h3>
        </div>
        {status ? <span className="physio-outcome">{status}</span> : null}
      </header>
      <p className="physio-dose">{doseSummary(exercise.dose)}</p>
      <VideoAction exercise={exercise} />
      <div className="physio-card-caption">
        <span>
          {demo?.status === 'clinician supplied'
            ? 'Clinician-supplied link'
            : demo
              ? 'Demo variant to confirm'
              : 'Demonstration pending'}
        </span>
        {['paused', 'retired'].includes(exercise.disposition) ? (
          <span>{exercise.disposition}</span>
        ) : null}
      </div>
      <ExerciseDetails exercise={exercise} />
      {children}
    </article>
  )
}
