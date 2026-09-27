import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { chestSpecializationProgram } from '../data/chestSpecializationProgram'
import { createWorkoutSession } from '../lib/sessions'
import { TrainView } from './TrainView'

describe('program completion', () => {
  it('allows any workout after completion and also offers a fresh program cycle', () => {
    const program = { ...chestSpecializationProgram, durationWeeks: 1 }
    const sessions = program.workouts.map((workout) => {
      const session = createWorkoutSession(program, workout, [])
      return { ...session, status: 'completed' as const, completedAt: session.startedAt }
    })
    const onStart = vi.fn()
    const onRepeat = vi.fn()
    function Harness() {
      const [selectedWorkoutId, setSelectedWorkoutId] = useState(program.workouts[0].id)
      return <TrainView program={program} sessions={sessions} nextWorkout={program.workouts[0]} selectedWorkoutId={selectedWorkoutId} onSelectWorkout={setSelectedWorkoutId} onStartWorkout={onStart} onResumeWorkout={() => {}} onRepeatProgram={onRepeat} />
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Select Upper Pump' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start workout' }))
    expect(onStart).toHaveBeenCalledWith(program.workouts[2])
    fireEvent.click(screen.getByRole('button', { name: 'Start a new program cycle' }))
    expect(onRepeat).toHaveBeenCalledOnce()
  })

  it('sets the current program week directly', async () => {
    const onSetCurrentWeek = vi.fn().mockResolvedValue(undefined)
    render(<TrainView program={chestSpecializationProgram} sessions={[]} nextWorkout={chestSpecializationProgram.workouts[0]} selectedWorkoutId={chestSpecializationProgram.workouts[0].id} onSelectWorkout={() => {}} onStartWorkout={() => {}} onResumeWorkout={() => {}} onSetCurrentWeek={onSetCurrentWeek} />)

    fireEvent.click(screen.getByRole('button', { name: 'Set current program week' }))
    fireEvent.change(screen.getByLabelText('Current week'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save week' }))

    await waitFor(() => expect(onSetCurrentWeek).toHaveBeenCalledWith(5))
  })
})
