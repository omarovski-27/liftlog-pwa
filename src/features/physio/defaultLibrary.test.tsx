import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { liftLogDb } from '../../data/db'
import { chestSpecializationProgram } from '../../data/chestSpecializationProgram'
import { createWorkoutSession } from '../../lib/sessions'
import { PhysioView } from './PhysioView'
import { defaultExercises, exerciseDemonstration } from './defaultLibrary'
import { ensureDefaultRehabPlan, readRehabData, savePlan, startSession } from './repository'
import { emptyDose, type RehabExercise } from './types'

const custom = (): RehabExercise => ({ id: 'custom', name: 'Custom exercise', group: 'back_core_hip', disposition: 'paused', dose: { ...emptyDose(), reps: 7 }, doseOrigin: 'user entered', sourceDoseText: null, sourceImages: [], sourceInstructions: '', notes: 'User note', variantConfirmed: true, weekdays: [2], demo: null })

describe('built-in physio library', () => {
  it('includes all 20 source names with direct demos and only source-present dosing', () => {
    const entries = defaultExercises()
    expect(entries).toHaveLength(20)
    expect(new Set(entries.map(e => e.id)).size).toBe(20)
    expect(entries.every(e => e.demo?.status === 'candidate')).toBe(true)
    expect(entries.every(e => !e.variantConfirmed && !e.weekdays.length && !e.sourceImages.length && !e.notes && !e.sourceInstructions)).toBe(true)
    expect(entries.filter(e => Object.values(e.dose).some(value => value !== null))).toHaveLength(1)
    expect(entries.find(e => e.id === 'bird-dog')?.dose).toEqual({ ...emptyDose(), sets: 3, reps: 10, holdSecondsPerRep: 5 })
    entries[0].name = 'Changed locally'
    expect(defaultExercises()[0].name).not.toBe('Changed locally')
  })
  it('seeds exactly once across concurrent/repeated startup and preserves active lifting', async () => {
    const lifting = createWorkoutSession(chestSpecializationProgram, chestSpecializationProgram.workouts[0], [])
    await liftLogDb.sessions.add(lifting)
    await Promise.all([ensureDefaultRehabPlan(), ensureDefaultRehabPlan()])
    const before = await readRehabData()
    await ensureDefaultRehabPlan()
    expect(await readRehabData()).toEqual(before)
    expect(before.rehabPlanVersions).toHaveLength(1)
    expect(before.rehabPlanVersions[0].exercises).toHaveLength(20)
    expect(before.rehabDayPlans).toHaveLength(0)
    expect(before.rehabSessions).toHaveLength(0)
    expect(await liftLogDb.sessions.get(lifting.id)).toEqual(lifting)
  })
  it('keeps existing custom plans, paused dispositions and unfinished physio exactly intact', async () => {
    await savePlan([custom(), { ...custom(), id: 'manual', name: 'Manual exercise', disposition: 'optional' }])
    await startSession(['manual'])
    const before = await readRehabData()
    expect(await ensureDefaultRehabPlan()).toEqual(before)
    expect(await readRehabData()).toEqual(before)
  })
  it('fills only a missing matching demonstration and preserves user-supplied links', () => {
    const entry = defaultExercises()[0]
    expect(exerciseDemonstration({ ...entry, demo: null })).toEqual(entry.demo)
    expect(exerciseDemonstration({ ...entry, name: 'Different variant', demo: null })).toBeNull()
    const supplied = { ...entry.demo!, url: 'https://vimeo.com/123456789', status: 'user supplied' as const }
    expect(exerciseDemonstration({ ...entry, demo: supplied })).toBe(supplied)
  })
  it('opens directly with the exercise list and videos without a code or import action', async () => {
    render(<PhysioView onUnsavedChange={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Exercises' }))
    await screen.findByText(/20 library entries/)
    expect(screen.queryByLabelText('Private setup code')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add exercises' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /^Watch .* video ↗$/ })).toHaveLength(20)
    expect(await screen.findByRole('link', { name: 'Watch Bird dog video ↗' })).toHaveAttribute('href', 'https://vimeo.com/455787228')
    expect((await readRehabData()).rehabPlanVersions).toHaveLength(1)
  })
  it('groups hip work with the lower limb even in an older saved library, without changing stored plans', async () => {
    const exercises = defaultExercises()
    exercises.find(e => e.id === 'true-hip-flexor')!.group = 'back_core_hip'
    await savePlan(exercises)
    const before = await readRehabData()
    render(<PhysioView onUnsavedChange={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Exercises' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Group' }), { target: { value: 'knee_lower_limb' } })
    expect(screen.getByRole('option', { name: 'Lower limb · knee, hip & foot' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /^Watch .* video ↗$/ })).toHaveLength(8)
    expect(screen.getByRole('link', { name: 'Watch True Hip Flexor video ↗' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Watch Glute Bridge video ↗' })).toBeVisible()
    fireEvent.change(screen.getByRole('combobox', { name: 'Group' }), { target: { value: 'back_core_hip' } })
    expect(screen.queryByRole('link', { name: 'Watch True Hip Flexor video ↗' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Watch Bird dog video ↗' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Watch Cat and Camel video ↗' })).toBeVisible()
    expect(await readRehabData()).toEqual(before)
  })
})
