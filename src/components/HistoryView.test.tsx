import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HistoryView } from './HistoryView'
import { chestSpecializationProgram } from '../data/chestSpecializationProgram'
import { createWorkoutSession } from '../lib/sessions'

describe('completed workout history', () => {
  it('shows seconds and meters in chart labels and never invents a strength value', () => {
    const session = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[3], [])
    session.status = 'completed'
    session.completedAt = session.updatedAt
    const carry = session.exercises.find((exercise) => exercise.performedName === "Farmer's carry")!
    carry.sets[0] = { ...carry.sets[0], weightKg: 20, durationSeconds: 35.5, completed: true }
    render(<HistoryView program={chestSpecializationProgram} sessions={[session]} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Progress' }))
    expect(screen.getByRole('region', { name: 'Completed seconds trend' })).toBeInTheDocument()
    expect(screen.getByTitle('35.5 sec')).toBeInTheDocument()
    expect(screen.getAllByText('20kg x 35.5 sec')).toHaveLength(2)
    expect(screen.queryByText('40kg')).not.toBeInTheDocument()
  })

  it('retains exact quarter-kilo loads and notes, including notes on skipped exercises', () => {
    const session = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    session.status = 'completed'
    session.completedAt = session.updatedAt
    session.exercises[1].sets[0] = { ...session.exercises[1].sets[0], weightKg: 32.25, reps: 9, completed: true }
    session.exercises[1].sessionNotes = 'Seat 2, controlled tempo.'
    session.exercises[2].sessionNotes = 'Skipped because the bench was unavailable.'
    render(<HistoryView program={chestSpecializationProgram} sessions={[session]} />)
    fireEvent.click(screen.getByRole('button', { name: /Upper: Heavy Chest/ }))

    expect(screen.getByText('32.25kg x 9')).toBeInTheDocument()
    expect(screen.getByText('Seat 2, controlled tempo.')).toBeInTheDocument()
    expect(screen.getByText('Skipped because the bench was unavailable.')).toBeInTheDocument()
  })
})
