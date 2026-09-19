import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as database from './data/db'
import App from './App'
import { chestSpecializationProgram } from './data/chestSpecializationProgram'
import {
  ensureProgramVersion,
  getActiveProgramId,
  liftLogDb,
  saveProgramVersion,
} from './data/db'
import { createBackup, serializeBackup } from './lib/backups'
import { createProgramCopy } from './lib/programBuilder'
import { createWorkoutSession } from './lib/sessions'

const importedProgramJson = JSON.stringify({
  format: 'liftlog-program',
  schemaVersion: 1,
  name: 'Imported Strength',
  durationWeeks: 6,
  startingWeek: 2,
  fullRestDay: 'Sunday',
  progression: ['Add weight at the top of the range.'],
  constraints: [],
  stopTriggers: [],
  workouts: [
    {
      name: 'Upper A',
      day: 'Monday',
      exercises: [
        {
          name: 'Bench press',
          sets: 4,
          reps: '6-10',
          rir: '2',
          rest: '3 min',
          type: 'working',
          muscles: ['chest', 'triceps'],
        },
      ],
    },
  ],
})

async function startFirstWorkout() {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Start workout' }))
  await screen.findByRole('heading', { name: 'Day 1 - Upper: Heavy Chest' })
}

describe('App', () => {
  it('waits for ordered autosaves before finishing the latest workout snapshot', async () => {
    const save = database.saveSession
    let release = () => {}
    const held = new Promise<void>((resolve) => { release = resolve })
    let firstWrite = true
    const writes = vi.spyOn(database, 'saveSession').mockImplementation(async (session) => {
      if (firstWrite) {
        firstWrite = false
        await held
      }
      await save(session)
    })
    await startFirstWorkout()
    fireEvent.change(screen.getByLabelText('Incline DB press set 1 weight'), { target: { value: '35' } })
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Finish workout' }))
    await waitFor(() => expect(writes).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('heading', { name: 'History' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Saving...' })).toBeDisabled()
    release()
    await screen.findByRole('heading', { name: 'History' })
    const stored = (await liftLogDb.sessions.toArray())[0]
    expect(stored.status).toBe('completed')
    expect(stored.exercises[1].sets[0].weightKg).toBe(35)
  })

  it('offers a working retry after a failed autosave', async () => {
    vi.spyOn(database, 'saveSession').mockRejectedValueOnce(new Error('Temporarily unavailable'))
    await startFirstWorkout()
    await screen.findByText('Changes not saved')
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving' }))
    await screen.findByText('Saved on this device')
    expect(await liftLogDb.sessions.count()).toBe(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a recoverable startup error instead of an endless loading screen', async () => {
    vi.spyOn(liftLogDb.programVersions, 'toArray').mockRejectedValueOnce(new Error('Unavailable'))
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be opened')
    expect(screen.queryByText('Opening logbook...')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeInTheDocument()
  })

  it('keeps the active workout open when finishing cannot be saved', async () => {
    const save = database.saveSession
    vi.spyOn(database, 'saveSession').mockImplementation(async (session) => {
      if (session.status === 'completed') throw new Error('Disk full')
      await save(session)
    })
    await startFirstWorkout()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Finish workout' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
    expect(screen.getByRole('heading', { name: 'Day 1 - Upper: Heavy Chest' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'History' })).not.toBeInTheDocument()
    expect((await liftLogDb.sessions.toArray())[0]?.status).toBe('active')
  })

  it('keeps the workout available when discard fails', async () => {
    vi.spyOn(database, 'deleteSession').mockRejectedValueOnce(new Error('Unavailable'))
    await startFirstWorkout()
    fireEvent.click(screen.getByRole('button', { name: 'Discard workout' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be removed')
    expect(screen.getByRole('heading', { name: 'Day 1 - Upper: Heavy Chest' })).toBeInTheDocument()
  })

  it('renders the restrained program logbook with live progress', async () => {
    render(<App />)

    expect(await screen.findByText('Chest Specialization Block')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Upper Heavy' })).toBeInTheDocument()
    expect(screen.getByText('0 / 56')).toBeInTheDocument()
    expect(screen.getByText('56 sessions left. 4 workouts each week.')).toBeInTheDocument()
  })

  it('starts a session, logs a set, and saves every change locally', async () => {
    await startFirstWorkout()

    fireEvent.change(screen.getByLabelText('Incline DB press set 1 weight'), {
      target: { value: '32.5' },
    })
    fireEvent.change(screen.getByLabelText('Incline DB press set 1 reps'), {
      target: { value: '9' },
    })
    fireEvent.change(screen.getByLabelText('Incline DB press set 1 RIR'), {
      target: { value: '2' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Mark Incline DB press set 1 complete' }),
    )

    expect(
      screen.getByRole('button', { name: 'Mark Incline DB press set 1 incomplete' }),
    ).toHaveAttribute('aria-pressed', 'true')

    await waitFor(async () => {
      const stored = await liftLogDb.sessions.toArray()
      const inclinePress = stored[0]?.exercises.find(
        (exercise) => exercise.templateExerciseId === 'd1-incline-db-press',
      )
      expect(inclinePress?.sets[0]).toMatchObject({
        weightKg: 32.5,
        reps: 9,
        rir: 2,
        completed: true,
      })
    })
  })

  it('uses and remembers a custom exercise alternative', async () => {
    await startFirstWorkout()

    fireEvent.click(screen.getByRole('button', { name: 'Change Incline DB press' }))
    const dialog = screen.getByRole('dialog', { name: 'Change exercise' })
    fireEvent.change(within(dialog).getByLabelText('Exercise name'), {
      target: { value: 'Plate-loaded chest press' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use exercise' }))

    expect(
      screen.getByRole('heading', { name: 'Plate-loaded chest press' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Prescribed: Incline DB press')).toBeInTheDocument()

    await waitFor(async () => {
      const alternatives = await liftLogDb.alternatives.toArray()
      expect(alternatives).toHaveLength(1)
      expect(alternatives[0]).toMatchObject({
        templateExerciseId: 'd1-incline-db-press',
        name: 'Plate-loaded chest press',
      })
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Change Plate-loaded chest press' }),
    )
    expect(
      within(screen.getByRole('dialog', { name: 'Change exercise' })).getByRole('button', {
        name: 'Plate-loaded chest press',
      }),
    ).toBeInTheDocument()
  })

  it('resumes an unfinished session with its logged values after remount', async () => {
    const firstRender = render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Start workout' }))
    const weightInput = await screen.findByLabelText('Incline DB press set 1 weight')
    fireEvent.change(weightInput, { target: { value: '35' } })

    await waitFor(async () => {
      const stored = await liftLogDb.sessions.toArray()
      expect(stored[0]?.exercises[1]?.sets[0]?.weightKg).toBe(35)
    })

    firstRender.unmount()
    render(<App />)

    expect(await screen.findByLabelText('Incline DB press set 1 weight')).toHaveValue(35)
  })

  it('finishes a workout and shows its numbers as previous performance next time', async () => {
    await startFirstWorkout()

    fireEvent.change(screen.getByLabelText('Incline DB press set 1 weight'), {
      target: { value: '32.5' },
    })
    fireEvent.change(screen.getByLabelText('Incline DB press set 1 reps'), {
      target: { value: '8' },
    })
    fireEvent.change(screen.getByLabelText('Incline DB press set 1 RIR'), {
      target: { value: '2' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Mark Incline DB press set 1 complete' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Finish this workout?' })).getByRole(
        'button',
        { name: 'Finish workout' },
      ),
    )

    expect(await screen.findByRole('heading', { name: 'History' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('Upper: Heavy Chest')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Train' }))
    fireEvent.click(screen.getByRole('button', { name: /Upper Heavy/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start Upper Heavy' }))

    expect(await screen.findByText('32.5 x 8 @2')).toBeInTheDocument()
    expect(screen.getByText(/Last: Incline DB press/)).toBeInTheDocument()
  }, 10000)

  it('shows exercise progression across completed sessions', async () => {
    const version = await ensureProgramVersion(chestSpecializationProgram)
    const first = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [],
      version.version,
    )
    const second = createWorkoutSession(
      chestSpecializationProgram,
      chestSpecializationProgram.workouts[0],
      [first],
      version.version,
    )
    const performances = [
      { session: first, id: 'first-progress', date: '2026-09-01T10:00:00.000Z', weight: 30, reps: 8 },
      { session: second, id: 'second-progress', date: '2026-09-08T10:00:00.000Z', weight: 32.5, reps: 9 },
    ]
    performances.forEach(({ session, id, date, weight, reps }) => {
      session.id = id
      session.status = 'completed'
      session.completedAt = date
      session.updatedAt = date
      const press = session.exercises.find(
        (exercise) => exercise.templateExerciseId === 'd1-incline-db-press',
      )!
      press.sets[0] = {
        ...press.sets[0],
        completed: true,
        weightKg: weight,
        reps,
        rir: 2,
      }
    })
    await liftLogDb.sessions.bulkAdd([first, second])

    render(<App />)
    await screen.findByText('Chest Specialization Block')
    fireEvent.click(screen.getByRole('button', { name: 'History' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Progress' }))

    const overview = screen.getByRole('region', { name: 'Incline DB press' })
    expect(within(overview).getByText('32.5kg x 9 @2')).toBeInTheDocument()
    expect(within(overview).getByText('+11.2%')).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Estimated strength trend' }),
    ).toBeInTheDocument()
  })

  it('keeps completed sessions visible in History even when another program is active', async () => {
    const otherProgram = createProgramCopy(chestSpecializationProgram)
    otherProgram.name = 'Old Strength Block'
    const otherVersion = await saveProgramVersion(otherProgram, 'create')
    const otherSession = createWorkoutSession(
      otherProgram,
      otherProgram.workouts[0],
      [],
      otherVersion.version,
    )
    otherSession.status = 'completed'
    otherSession.completedAt = '2026-09-17T10:00:00.000Z'
    otherSession.updatedAt = otherSession.completedAt
    otherSession.workoutTitle = 'Old program upper'
    await liftLogDb.sessions.add(otherSession)

    render(<App />)
    await screen.findByText('Chest Specialization Block')
    fireEvent.click(screen.getByRole('button', { name: 'History' }))

    expect(await screen.findByText('1 completed workouts')).toBeInTheDocument()
    expect(screen.getByText('Old program upper')).toBeInTheDocument()
  })

  it('reviews and merges a validated backup from the Program tab', async () => {
    render(<App />)
    await screen.findByText('Chest Specialization Block')
    fireEvent.click(screen.getByRole('button', { name: 'Program' }))

    await waitFor(async () => {
      expect(await liftLogDb.programVersions.count()).toBe(1)
    })
    const backupFile = new File(
      [serializeBackup(await createBackup())],
      'liftlog-backup.json',
      { type: 'application/json' },
    )
    fireEvent.change(screen.getByLabelText('Import backup'), {
      target: { files: [backupFile] },
    })

    const dialog = await screen.findByRole('dialog', { name: 'Restore backup' })
    expect(within(dialog).getByText('liftlog-backup.json')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Merge' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore backup' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Backup merged')
    expect(await liftLogDb.programVersions.count()).toBe(1)
  })

  it('restores an older program snapshot as a new immutable version', async () => {
    const first = await ensureProgramVersion(chestSpecializationProgram)
    await saveProgramVersion(
      { ...chestSpecializationProgram, name: 'Revised Chest Block' },
      'edit',
      { basedOnVersion: first.version, label: 'Revised copy' },
    )

    render(<App />)
    expect(await screen.findByText('Revised Chest Block')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Program' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Version 1 restored as version 3',
    )
    expect(
      screen.getByRole('heading', { name: 'Chest Specialization Block' }),
    ).toBeInTheDocument()
    expect(await liftLogDb.programVersions.count()).toBe(3)
  })

  it('creates and activates a complete program from the visual builder', async () => {
    render(<App />)
    await screen.findByText('Chest Specialization Block')
    fireEvent.click(screen.getByRole('button', { name: 'Program' }))
    fireEvent.click(await screen.findByRole('button', { name: 'New' }))

    fireEvent.change(screen.getByLabelText('Program name'), {
      target: { value: 'Three Day Strength' },
    })
    fireEvent.change(screen.getByLabelText('Starting week'), {
      target: { value: '2' },
    })
    fireEvent.change(screen.getByLabelText('Workout 1 name'), {
      target: { value: 'Upper A' },
    })
    fireEvent.change(screen.getByLabelText('Exercise 1 name'), {
      target: { value: 'Bench press' },
    })
    fireEvent.click(screen.getByLabelText('Chest'))
    fireEvent.click(screen.getByRole('button', { name: 'Create program' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Program created')
    expect(
      screen.getByRole('heading', { name: 'Three Day Strength' }),
    ).toBeInTheDocument()
    const activeProgramId = await getActiveProgramId()
    const activeVersion = await liftLogDb.programVersions
      .where('programId')
      .equals(activeProgramId!)
      .first()
    expect(activeVersion?.program).toMatchObject({
      name: 'Three Day Strength',
      status: 'custom',
      liftingDaysPerWeek: 1,
      currentWeek: 2,
    })
    expect(await liftLogDb.programVersions.count()).toBe(2)
  })

  it('creates a week-specific set prescription in the visual builder', async () => {
    render(<App />)
    await screen.findByText('Chest Specialization Block')
    fireEvent.click(screen.getByRole('button', { name: 'Program' }))
    fireEvent.click(await screen.findByRole('button', { name: 'New' }))

    fireEvent.change(screen.getByLabelText('Program name'), {
      target: { value: 'Volume Ramp' },
    })
    fireEvent.change(screen.getByLabelText('Exercise 1 name'), {
      target: { value: 'Bench press' },
    })
    fireEvent.click(screen.getByLabelText('Chest'))
    fireEvent.click(screen.getByRole('button', { name: 'Add change' }))
    fireEvent.change(screen.getByLabelText('End week'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Sets', { selector: 'input[placeholder="Base"]' }), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create program' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Program created')
    const activeProgramId = await getActiveProgramId()
    const version = await liftLogDb.programVersions
      .where('programId')
      .equals(activeProgramId!)
      .first()
    expect(version?.program.workouts[0].exercises[0].weekOverrides).toEqual([
      { startWeek: 1, endWeek: 2, sets: 2, reps: undefined },
    ])
  })

  it('reviews and activates an imported AI program', async () => {
    render(<App />)
    await screen.findByText('Chest Specialization Block')
    fireEvent.click(screen.getByRole('button', { name: 'Program' }))
    fireEvent.click(await screen.findByRole('button', { name: /^Import$/ }))

    fireEvent.change(screen.getByLabelText('Program JSON'), {
      target: { value: importedProgramJson },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Review program' }))

    expect(await screen.findByText('Review import')).toBeInTheDocument()
    expect(screen.getByLabelText('Program name')).toHaveValue('Imported Strength')
    expect(screen.getByLabelText('Starting week')).toHaveValue(2)
    fireEvent.click(screen.getByRole('button', { name: 'Import program' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Program imported')
    expect(
      screen.getByRole('heading', { name: 'Imported Strength' }),
    ).toBeInTheDocument()
    const activeProgramId = await getActiveProgramId()
    const importedVersion = await liftLogDb.programVersions
      .where('programId')
      .equals(activeProgramId!)
      .first()
    expect(importedVersion).toMatchObject({ version: 1, reason: 'import' })
    expect(importedVersion?.program.source).toBe('Imported from LiftLog JSON')
    expect(await liftLogDb.programVersions.count()).toBe(2)
  })

  it('edits the current program as a new immutable version', async () => {
    render(<App />)
    await screen.findByText('Chest Specialization Block')
    fireEvent.click(screen.getByRole('button', { name: 'Program' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit Chest Specialization Block' }),
    )
    fireEvent.change(screen.getByLabelText('Program name'), {
      target: { value: 'Chest Specialization Revised' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save program' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Program changes saved')
    const versions = await liftLogDb.programVersions
      .where('programId')
      .equals(chestSpecializationProgram.id)
      .sortBy('version')
    expect(versions).toHaveLength(2)
    expect(versions[0].program.name).toBe('Chest Specialization Block')
    expect(versions[1]).toMatchObject({
      version: 2,
      reason: 'edit',
      basedOnVersion: 1,
    })
    expect(versions[1].program.name).toBe('Chest Specialization Revised')
  })

  it('duplicates, switches, and remembers the active program after remount', async () => {
    const firstRender = render(<App />)
    await screen.findByText('Chest Specialization Block')
    fireEvent.click(screen.getByRole('button', { name: 'Program' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Duplicate Chest Specialization Block' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create program' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Program created')
    expect(
      screen.getByRole('heading', { name: 'Chest Specialization Block Copy' }),
    ).toBeInTheDocument()
    const copiedProgramId = await getActiveProgramId()
    expect(copiedProgramId).not.toBe(chestSpecializationProgram.id)

    firstRender.unmount()
    render(<App />)
    expect(await screen.findByText('Chest Specialization Block Copy')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Program' }))
    expect(
      screen.getByRole('heading', { name: 'Chest Specialization Block Copy' }),
    ).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Use' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Now using Chest Specialization Block',
    )
    expect(await getActiveProgramId()).toBe(chestSpecializationProgram.id)
  })

  it('locks program-changing actions while a workout is active', async () => {
    await startFirstWorkout()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Program' }))

    expect(await screen.findByRole('button', { name: 'New' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Import$/ })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Edit Chest Specialization Block' }),
    ).toBeDisabled()
    expect(screen.getByLabelText('Import backup')).toBeDisabled()
    expect(
      screen.getByText('Finish or discard the active workout to change programs.'),
    ).toBeInTheDocument()
  })
})
