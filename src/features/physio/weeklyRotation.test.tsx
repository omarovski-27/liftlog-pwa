import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { defaultExercises } from './defaultLibrary'
import { DailyPrograms } from './DailyPrograms'
import { PhysioView } from './PhysioView'
import { localDay, readRehabData, savePlan } from './repository'
import { unassignedExercises, weeklyRoutines } from './weeklyRotation'

describe('daily exercise lists', () => {
  it('uses a stable draft split, preserves unknown prescriptions and keeps unclear variants outside day lists', () => {
    const exercises = defaultExercises()
    const before = structuredClone(exercises)
    const week = weeklyRoutines(exercises)
    expect(week).toHaveLength(7)
    expect(week.map((day) => day.exercises.length)).toEqual([
      7, 4, 0, 5, 7, 4, 5,
    ])
    const assigned = week.flatMap((day) =>
      day.exercises.map((exercise) => exercise.id),
    )
    expect(new Set(assigned).size).toBe(16)
    expect(week[0].exercises.map((exercise) => exercise.id)).toEqual([
      'half-kneel-dorsiflexion',
      'side-lying-clam',
      'glute-bridge',
      'lateral-band-walks',
      'single-leg-balance-step-downs',
      'single-leg-balance',
      'toe-towel-crunches',
    ])
    expect(week[4].exercises).toEqual(week[0].exercises)
    expect(week[3].exercises.map((exercise) => exercise.id)).toEqual([
      'cat-and-camel',
      'quad-rock-back-deep-breath',
      'bird-dog',
      'dead-bug',
      'front-plank',
    ])
    expect(week[6].exercises).toEqual(week[3].exercises)
    expect(week[5].exercises).toEqual(week[1].exercises)
    expect(
      unassignedExercises(exercises, week)
        .map((exercise) => exercise.id)
        .sort(),
    ).toEqual(
      [
        'curl-up',
        'lat-hangs',
        'true-hip-flexor',
        'wall-chin-nods-shoulder-ws',
      ].sort(),
    )
    expect(exercises).toEqual(before)
    expect(week.every((day) => day.source === 'draft')).toBe(true)
    expect(weeklyRoutines(exercises)).toEqual(week)
  })
  it('uses saved weekdays instead of filling gaps with proposed work and excludes paused/retired items', () => {
    const exercises = defaultExercises()
    exercises[0].weekdays = [0, 3]
    exercises[1].weekdays = [0]
    exercises[1].disposition = 'paused'
    exercises[2].weekdays = [3]
    exercises[2].disposition = 'retired'
    const week = weeklyRoutines(exercises)
    expect(week.every((day) => day.source === 'saved')).toBe(true)
    expect(week[0].exercises.map((exercise) => exercise.id)).toEqual([
      exercises[0].id,
    ])
    expect(week[3].exercises.map((exercise) => exercise.id)).toEqual([
      exercises[0].id,
    ])
    expect(week[1].exercises).toHaveLength(0)
    expect(week[5].exercises).toHaveLength(0)
  })
  it('shows visible video actions before any detail disclosure and allows selecting any weekday', () => {
    const onSelectDay = vi.fn()
    render(
      <DailyPrograms
        exercises={defaultExercises()}
        selectedDay={0}
        onSelectDay={onSelectDay}
        todayDay={2}
        todayLabel="2026-11-03"
        onLogDay={vi.fn()}
        onResume={vi.fn()}
        busy={false}
        hasUnfinished={false}
        canLog
      />,
    )
    expect(
      screen.getByRole('link', {
        name: 'Watch Half Kneel Dorsiflexion video ↗',
      }),
    ).toHaveAttribute('href', 'https://www.youtube.com/watch?v=vcGyiiSFpEA')
    expect(
      screen.getByRole('link', { name: 'Watch Glute Bridge video ↗' }),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Saturday program' }))
    expect(onSelectDay).toHaveBeenCalledWith(6)
    expect(screen.getByText(/Draft day split/)).toBeInTheDocument()
  })
  it('switches between distinct day programs without changing stored plans', async () => {
    render(<PhysioView onUnsavedChange={vi.fn()} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Sunday program' }),
    )
    await screen.findByRole('heading', { name: 'Lower limb · knee, hip & foot' })
    const before = await readRehabData()
    expect(
      screen.getByRole('link', { name: 'Watch Glute Bridge video ↗' }),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Saturday program' }))
    expect(
      screen.getByRole('heading', { name: 'Core & back' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Watch Cat and Camel video ↗' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('link', { name: 'Watch Glute Bridge video ↗' }),
    ).not.toBeInTheDocument()
    expect(await readRehabData()).toEqual(before)
  })
  it('records selected draft work as manual actuals, with no fabricated dose or clinical schedule change', async () => {
    render(<PhysioView onUnsavedChange={vi.fn()} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Sunday program' }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: /Log (today’s exercise list|this list today)/,
      }),
    )
    await waitFor(async () =>
      expect((await readRehabData()).rehabSessions).toHaveLength(1),
    )
    const before = await readRehabData()
    expect(
      before.rehabDayPlans[0].occurrences.map((item) => item.exercise.id).sort(),
    ).toEqual(
      weeklyRoutines(defaultExercises())[0].exercises
        .map((exercise) => exercise.id)
        .sort(),
    )
    expect(
      before.rehabDayPlans[0].occurrences.every((item) => !item.required),
    ).toBe(true)
    expect(
      before.rehabSessions[0].logs.every(
        (log) =>
          log.outcome === 'not started' &&
          log.actual.reps === null &&
          log.actual.sets === null,
      ),
    ).toBe(true)
    expect(
      before.rehabPlanVersions[0].exercises.every(
        (exercise) => !exercise.weekdays.length && !exercise.variantConfirmed,
      ),
    ).toBe(true)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Browse daily lists' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Friday program' }))
    expect(
      screen.getByRole('button', { name: 'Resume your unfinished session' }),
    ).toBeInTheDocument()
    expect(await readRehabData()).toEqual(before)
  })
  it('keeps a saved routine and its prescription visible instead of overwriting it with the draft', async () => {
    const exercises = defaultExercises()
    exercises[0].weekdays = [3]
    exercises[0].disposition = 'active'
    exercises[0].variantConfirmed = true
    await savePlan(exercises)
    const before = await readRehabData()
    render(<PhysioView onUnsavedChange={vi.fn()} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Wednesday program' }),
    )
    expect(screen.getByText(/Your saved arrangement/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', {
        name: 'Watch Half Kneel Dorsiflexion video ↗',
      }),
    ).toBeVisible()
    expect(await readRehabData()).toEqual(before)
  })
  it('starts today’s saved active routine with required occurrences and preserves its paused snapshot when resumed', async () => {
    const exercises = defaultExercises()
    const today = localDay()
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
    exercises[0].weekdays = [weekday]
    exercises[0].disposition = 'active'
    exercises[0].variantConfirmed = true
    exercises[1].weekdays = [weekday]
    await savePlan(exercises)
    render(<PhysioView onUnsavedChange={vi.fn()} />)
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Start configured routine · 1',
      }),
    )
    await waitFor(async () =>
      expect((await readRehabData()).rehabSessions).toHaveLength(1),
    )
    const initial = await readRehabData()
    expect(initial.rehabDayPlans[0].occurrences).toHaveLength(1)
    expect(initial.rehabDayPlans[0].occurrences[0].required).toBe(true)
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }))
    await waitFor(async () =>
      expect((await readRehabData()).rehabSessions[0].status).toBe('paused'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Browse daily lists' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Resume your unfinished session' }),
    )
    await waitFor(async () =>
      expect((await readRehabData()).rehabSessions[0].status).toBe('active'),
    )
    expect((await readRehabData()).rehabDayPlans).toEqual(initial.rehabDayPlans)
  })
})
