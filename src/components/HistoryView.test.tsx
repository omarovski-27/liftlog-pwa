import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
    expect(screen.getByText('All-time best')).toBeInTheDocument()
    expect(screen.getAllByText('20kg x 35.5 sec')).toHaveLength(3)
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

  it('opens a completed workout for correction', () => {
    const session = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    session.status = 'completed'
    session.completedAt = session.updatedAt
    const onEditSession = vi.fn()
    render(<HistoryView onEditSession={onEditSession} program={chestSpecializationProgram} sessions={[session]} />)
    fireEvent.click(screen.getByRole('button', { name: /Upper: Heavy Chest/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit workout' }))
    expect(onEditSession).toHaveBeenCalledWith(session)
  })

  it('offers previous-data import directly from History', async () => {
    const onMergeBackup = vi.fn().mockResolvedValue(undefined)
    const backup = {
      format: 'liftlog-backup',
      schemaVersion: 1,
      appVersion: '0.11.0',
      createdAt: '2026-09-27T10:00:00.000Z',
      data: {
        activeProgramId: chestSpecializationProgram.id,
        programVersions: [{
          id: 'history-import-version',
          programId: chestSpecializationProgram.id,
          version: 1,
          createdAt: '2026-09-27T10:00:00.000Z',
          reason: 'seed',
          program: chestSpecializationProgram,
        }],
        sessions: [],
        alternatives: [],
      },
    }
    render(<HistoryView onMergeBackup={onMergeBackup} program={chestSpecializationProgram} sessions={[]} />)
    const file = new File([JSON.stringify(backup)], 'liftlog-backup.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('Import previous data'), { target: { files: [file] } })
    expect(await screen.findByRole('dialog', { name: 'Import previous data' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Merge data' }))
    await waitFor(() => expect(onMergeBackup).toHaveBeenCalledOnce())
  })
})
