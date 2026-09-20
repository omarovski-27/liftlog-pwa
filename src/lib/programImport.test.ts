import { describe, expect, it } from 'vitest'
import { chestSpecializationProgram } from '../data/chestSpecializationProgram'
import {
  ProgramImportError,
  createProgramFile,
  getAiProgramPrompt,
  parseProgramImport,
  serializeProgramFile,
} from './programImport'

describe('program import', () => {
  it('accepts fenced AI JSON and normalizes friendly values', () => {
    const raw = `Here is the program:
\`\`\`json
${JSON.stringify({
  format: 'liftlog-program',
  schemaVersion: 1,
  name: 'Six Week Strength',
  durationWeeks: '6',
  startingWeek: 2,
  fullRestDay: 'fri',
  progression: 'Add weight at the top of the range.\nKeep one rep in reserve.',
  constraints: [],
  stopTriggers: [],
  workouts: [
    {
      name: 'Upper A',
      day: 'mon',
      exercises: [
        {
          name: 'Bench press',
          sets: '4',
          reps: 8,
          rir: 2,
          type: 'work',
          muscles: ['Pecs', 'Tricep'],
          weekOverrides: [{ startWeek: 2, endWeek: 3, sets: 3, reps: 10 }],
        },
      ],
    },
  ],
})}
\`\`\``

    const program = parseProgramImport(raw)

    expect(program).toMatchObject({
      name: 'Six Week Strength',
      durationWeeks: 6,
      currentWeek: 2,
      fullRestDay: 'Friday',
      source: 'Imported from LiftLog JSON',
      liftingDaysPerWeek: 1,
    })
    expect(program.progressionRules).toEqual([
      'Add weight at the top of the range.',
      'Keep one rep in reserve.',
    ])
    expect(program.workouts[0]).toMatchObject({
      title: 'Day 1 - Upper A',
      scheduledDay: 'Monday',
    })
    expect(program.workouts[0].exercises[0]).toMatchObject({
      name: 'Bench press',
      sets: 4,
      reps: '8',
      targetRir: '2',
      kind: 'working',
      muscleGroups: ['chest', 'triceps'],
      rest: '2 min',
      weekOverrides: [{ startWeek: 2, endWeek: 3, sets: 3, reps: '10' }],
    })
  })

  it('returns useful errors for malformed and incomplete programs', () => {
    expect(() => parseProgramImport('{bad json')).toThrow(ProgramImportError)

    try {
      parseProgramImport(JSON.stringify({
        format: 'something-else',
        schemaVersion: 9,
        name: '',
        durationWeeks: 0,
        workouts: [
          {
            name: 'Upper',
            day: 'Someday',
            exercises: [
              { name: 'Press', sets: 3, reps: '8-12', muscles: ['wings'] },
            ],
          },
        ],
      }))
      throw new Error('Expected the import to fail.')
    } catch (caught) {
      expect(caught).toBeInstanceOf(ProgramImportError)
      expect((caught as ProgramImportError).issues).toEqual(
        expect.arrayContaining([
          'Format must be "liftlog-program".',
          'Schema version must be 1.',
          'Program name is required.',
          'Workout 1 day must be a weekday.',
          'Workout 1, exercise 1 has an unknown muscle value: wings.',
        ]),
      )
    }
  })

  it('exports a clean file that imports without internal ids', () => {
    const file = createProgramFile(chestSpecializationProgram)
    const serialized = serializeProgramFile(chestSpecializationProgram)
    const imported = parseProgramImport(serialized)

    expect(file.workouts[0]).not.toHaveProperty('id')
    expect(file.workouts[0].exercises[0]).not.toHaveProperty('id')
    expect(imported.workouts).toHaveLength(chestSpecializationProgram.workouts.length)
    expect(imported.workouts[0].exercises).toHaveLength(
      chestSpecializationProgram.workouts[0].exercises.length,
    )
    expect(imported.workouts[0].exercises[3].pair?.group).toBe(
      imported.workouts[0].exercises[4].pair?.group,
    )
    expect(imported.workouts[0].exercises[2].weekOverrides).toBeUndefined()
    expect(imported.workouts[0].id).not.toBe(chestSpecializationProgram.workouts[0].id)
    expect(imported.workouts[3].exercises.find((exercise) => exercise.name === "Farmer's carry")?.metric).toBe('seconds')
  })

  it('round trips explicit distance targets and rejects an unknown measure', () => {
    const file = createProgramFile(chestSpecializationProgram)
    file.workouts[3].exercises[0].metric = 'meters'
    file.workouts[3].exercises[0].reps = '40-50'
    expect(parseProgramImport(JSON.stringify(file)).workouts[3].exercises[0].metric).toBe('meters')
    const invalid = JSON.parse(JSON.stringify(file))
    invalid.workouts[3].exercises[0].metric = 'minutes'
    expect(() => parseProgramImport(JSON.stringify(invalid))).toThrow(/metric must be reps, seconds, or meters/)
  })

  it('provides a self-contained prompt for external AI tools', () => {
    const prompt = getAiProgramPrompt()

    expect(prompt).toContain('Return only valid JSON')
    expect(prompt).toContain('liftlog-program')
    expect(prompt).toContain('side-delts')
    expect(prompt).toContain('pair: {"group":"Pair 1","position":"A"}')
    expect(prompt).toContain('weekOverrides')
  })
})
