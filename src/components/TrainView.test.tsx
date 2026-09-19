import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { chestSpecializationProgram } from '../data/chestSpecializationProgram'
import { createWorkoutSession } from '../lib/sessions'
import { TrainView } from './TrainView'

describe('program completion', () => {
  it('shows completion instead of offering another workout and allows a fresh repeat', () => {
    const program = { ...chestSpecializationProgram, durationWeeks: 1 }
    const sessions = program.workouts.map((workout) => {
      const session = createWorkoutSession(program, workout, [])
      return { ...session, status: 'completed' as const, completedAt: session.startedAt }
    })
    const onStart = vi.fn()
    const onRepeat = vi.fn()
    render(<TrainView program={program} sessions={sessions} nextWorkout={program.workouts[0]} selectedWorkoutId={program.workouts[0].id} onSelectWorkout={() => {}} onStartWorkout={onStart} onResumeWorkout={() => {}} onRepeatProgram={onRepeat} />)
    expect(screen.getByRole('heading', { name: 'Program complete' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Start/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Repeat program' }))
    expect(onRepeat).toHaveBeenCalledOnce()
    expect(onStart).not.toHaveBeenCalled()
  })
})
