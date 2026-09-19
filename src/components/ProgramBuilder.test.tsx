import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createEmptyProgram, createEmptyExercise } from '../lib/programBuilder'
import { ProgramBuilder } from './ProgramBuilder'
import type { TrainingProgram } from '../types/program'

function validDraft() {
  const draft = createEmptyProgram()
  draft.name = 'Audit program'
  draft.workouts[0].shortTitle = 'Carry day'
  draft.workouts[0].exercises[0].name = 'Carry'
  draft.workouts[0].exercises[0].muscleGroups = ['grip']
  return draft
}

describe('program editor controls', () => {
  it('keeps a cleared optional RIR clear through workout copies and saving', async () => {
    const save = vi.fn(async (_program: TrainingProgram) => {})
    render(<ProgramBuilder initialProgram={validDraft()} mode="create" onCancel={() => {}} onSave={save} />)
    fireEvent.change(screen.getByLabelText('Target RIR'), { target: { value: '' } })
    expect(screen.getByLabelText('Target RIR')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Carry day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create program' }))
    await waitFor(() => expect(save).toHaveBeenCalledOnce())
    const saved = save.mock.calls[0][0]
    expect(saved.workouts.every((workout) => workout.exercises[0].targetRir === undefined)).toBe(true)
  })

  it('adds week changes into a gap and disables them once all weeks are covered', () => {
    const draft = validDraft()
    draft.durationWeeks = 3
    draft.workouts[0].exercises[0].weekOverrides = [{ startWeek: 2, endWeek: 3, sets: 2 }]
    render(<ProgramBuilder initialProgram={draft} mode="create" onCancel={() => {}} onSave={async () => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add change' }))
    expect(screen.getAllByLabelText('Start week')[1]).toHaveValue(1)
    expect(screen.getByRole('button', { name: 'Add change' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete week-specific change 2' }))
    expect(screen.getByRole('button', { name: 'Add change' })).toBeEnabled()
  })

  it('duplicates, reorders, and removes draft exercises without sharing paired-set positions', async () => {
    const draft = validDraft()
    draft.workouts[0].exercises[0].pair = { group: 'Pair 1', label: 'A' }
    const second = { ...createEmptyExercise(), name: 'Walk', muscleGroups: ['grip' as const], pair: { group: 'Pair 1', label: 'B' as const } }
    draft.workouts[0].exercises.push(second)
    const save = vi.fn(async (_program: TrainingProgram) => {})
    render(<ProgramBuilder initialProgram={draft} mode="create" onCancel={() => {}} onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Carry' }))
    expect(screen.getByLabelText('Part of a paired set')).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Move Carry Copy down' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Carry Copy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create program' }))
    await waitFor(() => expect(save).toHaveBeenCalledOnce())
    expect(save.mock.calls[0][0].workouts[0].exercises.map((exercise) => exercise.name)).toEqual(['Carry', 'Walk'])
  })

  it('shows readable pair names and renames both positions together', async () => {
    const draft = validDraft()
    draft.workouts[0].exercises[0].pair = { group: 'pair-internal-identity', label: 'A' }
    draft.workouts[0].exercises.push({ ...createEmptyExercise(), name: 'Walk', muscleGroups: ['grip'], pair: { group: 'pair-internal-identity', label: 'B' } })
    const save = vi.fn(async (_program: TrainingProgram) => {})
    render(<ProgramBuilder initialProgram={draft} mode="create" onCancel={() => {}} onSave={save} />)
    expect(screen.getByLabelText('Pair group')).toHaveValue('Pair 1')
    fireEvent.change(screen.getByLabelText('Pair group'), { target: { value: 'Carries' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create program' }))
    await waitFor(() => expect(save).toHaveBeenCalledOnce())
    expect(save.mock.calls[0][0].workouts[0].exercises.map((exercise) => exercise.pair?.group)).toEqual(['Carries', 'Carries'])
  })

  it('does not lose unsaved changes when cancel is rejected', () => {
    const cancel = vi.fn()
    render(<ProgramBuilder initialProgram={validDraft()} mode="create" onCancel={cancel} onSave={async () => {}} />)
    fireEvent.change(screen.getByLabelText('Program name'), { target: { value: 'Changed name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText('Program name')).toHaveValue('Changed name')
    expect(cancel).not.toHaveBeenCalled()
  })
})
