import { describe, expect, it } from 'vitest'
import { ensureProgramVersion, liftLogDb } from './db'
import { chestSpecializationProgram } from './chestSpecializationProgram'

describe('program seed revisions', () => {
  it('adds a new immutable version when the bundled seed prescription advances', async () => {
    const oldSeed = {
      ...chestSpecializationProgram,
      seedRevision: 1,
      workouts: chestSpecializationProgram.workouts.map((workout) => ({
        ...workout,
        exercises: workout.exercises.map(({ weekOverrides: _weekOverrides, ...exercise }) =>
          exercise,
        ),
      })),
    }

    const original = await ensureProgramVersion(oldSeed)
    const updated = await ensureProgramVersion(chestSpecializationProgram)
    const versions = await liftLogDb.programVersions
      .where('programId')
      .equals(chestSpecializationProgram.id)
      .sortBy('version')

    expect(original.version).toBe(1)
    expect(updated).toMatchObject({
      version: 2,
      basedOnVersion: 1,
      label: 'Source program revision 2',
    })
    expect(versions).toHaveLength(2)
    expect(versions[1].program.workouts[0].exercises[2].weekOverrides).toEqual([
      { startWeek: 1, endWeek: 2, sets: 2 },
    ])
  })
})
