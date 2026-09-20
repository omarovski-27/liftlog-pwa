import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionView } from './SessionView'
import { chestSpecializationProgram } from '../data/chestSpecializationProgram'
import { createWorkoutSession } from '../lib/sessions'
import type { WorkoutSession } from '../types/session'

function Logger({ initial, previous = [] }: { initial: WorkoutSession; previous?: WorkoutSession[] }) {
  const [session, setSession] = useState(initial)
  return <SessionView session={session} sessions={previous} alternatives={[]} onBack={() => {}} onChange={setSession} onFinish={() => {}} onDiscard={() => {}} onReplaceExercise={() => {}} />
}

describe('daily workout logger', () => {
  it('requires confirmation before removing a set with entries and protects the final row', () => {
    const session = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    session.exercises = [session.exercises[1]]
    session.exercises[0].sets = session.exercises[0].sets.slice(0, 2)
    session.exercises[0].sets[1].weightKg = 30
    render(<Logger initial={session} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove last' }))
    expect(screen.getByRole('dialog', { name: 'Remove this set?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByLabelText('Incline DB press set 2 weight')).toHaveValue(30)
    fireEvent.click(screen.getByRole('button', { name: 'Remove last' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove set' }))
    expect(screen.queryByLabelText('Incline DB press set 2 weight')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove last' })).toBeDisabled()
  })

  it('requires acknowledgement before a substitution relabels existing entries', () => {
    const session = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    session.exercises[1].sets[0].weightKg = 30
    const replace = vi.fn()
    render(<SessionView session={session} sessions={[]} alternatives={[]} onBack={() => {}} onChange={() => {}} onFinish={() => {}} onDiscard={() => {}} onReplaceExercise={replace} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change Incline DB press' }))
    fireEvent.change(screen.getByLabelText('Exercise name'), { target: { value: 'Machine press' } })
    expect(screen.getByRole('button', { name: 'Use exercise' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Relabel existing sets' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use exercise' }))
    expect(replace).toHaveBeenCalledWith(session.exercises[1].id, 'Machine press', true)
  })

  it('edits the planned target for the current workout and resizes blank set rows', () => {
    const session = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    session.exercises = [session.exercises[2]]
    render(<Logger initial={session} />)

    expect(screen.getByText('3 x 8-12')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit target for Flat DB press' }))
    fireEvent.change(screen.getByLabelText('Planned sets'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Rep target'), { target: { value: '10-12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save target' }))

    expect(screen.getByText('4 x 10-12')).toBeInTheDocument()
    expect(screen.getByLabelText('Flat DB press set 4 weight')).toBeInTheDocument()
  })

  it('shows the base prescription when the current week uses a set override', () => {
    const program = structuredClone(chestSpecializationProgram)
    program.workouts[0].exercises[2].weekOverrides = [
      { startWeek: 1, endWeek: 2, sets: 2 },
    ]
    const session = createWorkoutSession(program, program.workouts[0], [])
    session.exercises = [session.exercises[2]]
    render(<Logger initial={session} />)

    expect(screen.getByText('2 x 8-12')).toBeInTheDocument()
    expect(screen.getByText('Week 1 adjustment / base program 3 x 8-12')).toBeInTheDocument()
  })

  it('marks a set logged as soon as a number is entered', () => {
    const session = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    session.exercises = [session.exercises[1]]
    render(<Logger initial={session} />)

    fireEvent.change(screen.getByLabelText('Incline DB press set 1 weight'), {
      target: { value: '35' },
    })

    expect(
      screen.getByRole('button', { name: 'Mark Incline DB press set 1 incomplete' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not lower planned sets by deleting rows that already have entries', () => {
    const session = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    session.exercises = [session.exercises[2]]
    render(<Logger initial={session} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add set' }))
    fireEvent.change(screen.getByLabelText('Flat DB press set 3 weight'), {
      target: { value: '30' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Edit target for Flat DB press' }))
    fireEvent.change(screen.getByLabelText('Planned sets'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save target' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Clear the extra set entries')
    expect(screen.getByLabelText('Flat DB press set 3 weight')).toHaveValue(30)
  })

  it('logs seconds separately from reps and keeps legacy counts clearable', () => {
    const session = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[3], [])
    const carry = session.exercises.find((exercise) => exercise.performedName === "Farmer's carry")!
    carry.sets[0].reps = 30
    const onChange = vi.fn()
    render(<SessionView session={session} sessions={[]} alternatives={[]} onBack={() => {}} onChange={onChange} onFinish={() => {}} onDiscard={() => {}} onReplaceExercise={() => {}} />)
    const seconds = screen.getByLabelText("Farmer's carry set 1 seconds")
    expect(seconds).toHaveValue(30)
    expect(screen.queryByLabelText("Farmer's carry set 1 reps")).not.toBeInTheDocument()
    fireEvent.change(seconds, { target: { value: '35.5' } })
    const changed = onChange.mock.lastCall![0] as WorkoutSession
    expect(changed.exercises.find((exercise) => exercise.id === carry.id)!.sets[0]).toMatchObject({ durationSeconds: 35.5, reps: null })
    fireEvent.change(seconds, { target: { value: '' } })
    expect(onChange.mock.lastCall![0].exercises.find((exercise: { id: string }) => exercise.id === carry.id).sets[0]).toMatchObject({ durationSeconds: null, reps: null })
  })

  it('shows paired-set positions in the logger', () => {
    const session = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    render(<Logger initial={session} />)
    expect(screen.getByText('Superset 1A')).toBeInTheDocument()
    expect(screen.getByText('Superset 1B')).toBeInTheDocument()
  })

  it('shows elapsed time immediately when reopening an older active session', () => {
    const session = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    session.startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    render(<Logger initial={session} />)
    expect(screen.getByText(/10:0[01] \/ 0 of 29 sets/)).toBeInTheDocument()
  })

  it('does not display values from an uncompleted previous set', () => {
    const previous = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    previous.status = 'completed'
    previous.exercises[1].sets[0].completed = true
    previous.exercises[1].sets[1] = { ...previous.exercises[1].sets[1], weightKg: 99, reps: 99 }
    const current = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    render(<Logger initial={current} previous={[previous]} />)
    expect(within(screen.getByLabelText('Incline DB press sets')).queryByText('99 x 99')).not.toBeInTheDocument()
  })

  it('shows both the previous set rows and the all-time best set', () => {
    const older = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    older.status = 'completed'
    older.completedAt = '2026-09-01T10:00:00.000Z'
    older.exercises[1].sets[0] = { ...older.exercises[1].sets[0], weightKg: 40, reps: 10, rir: 1, completed: true }
    const latest = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    latest.status = 'completed'
    latest.completedAt = '2026-09-08T10:00:00.000Z'
    latest.exercises[1].sets[0] = { ...latest.exercises[1].sets[0], weightKg: 37.5, reps: 8, rir: 2, completed: true }
    const current = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    current.exercises = [current.exercises[1]]

    render(<Logger initial={current} previous={[older, latest]} />)

    expect(screen.getByText('37.5 x 8 @2')).toBeInTheDocument()
    expect(screen.getByText(/Last: 1 logged set/)).toBeInTheDocument()
    expect(screen.getByText(/Best set: 40 x 10 @1/)).toBeInTheDocument()
  })

  it('accepts optional decimal loads but rejects negative loads, fractional reps, and out-of-range RIR', () => {
    const session = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    render(<Logger initial={session} />)
    const weight = screen.getByLabelText('Incline DB press set 1 weight')
    const reps = screen.getByLabelText('Incline DB press set 1 reps')
    const rir = screen.getByLabelText('Incline DB press set 1 RIR')
    fireEvent.change(weight, { target: { value: '32.25' } })
    expect(weight).toHaveValue(32.25)
    fireEvent.change(weight, { target: { value: '-5' } })
    expect(weight).toHaveValue(32.25)
    fireEvent.change(reps, { target: { value: '8.5' } })
    expect(reps).toHaveValue(null)
    fireEvent.change(rir, { target: { value: '11' } })
    expect(rir).toHaveValue(null)
    fireEvent.change(weight, { target: { value: '' } })
    expect(weight).toHaveValue(null)
  })
})
