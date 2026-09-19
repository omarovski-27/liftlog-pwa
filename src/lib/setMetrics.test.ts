import { describe, expect, it } from 'vitest'
import { createEmptySet } from './sessions'
import { getExerciseMetric, getSetQuantity } from './setMetrics'

describe('set measures', () => {
  it.each([
    ['8-12', 'reps'], ['30-45 sec', 'seconds'], ['60 seconds', 'seconds'],
    ['45s', 'seconds'], ['20 m', 'meters'], ['100 meters', 'meters'],
    ['AMRAP', 'reps'], ['2 min rest', 'reps'],
  ] as const)('infers %s as %s', (reps, expected) => {
    expect(getExerciseMetric({ reps })).toBe(expected)
  })

  it('prefers the explicit measure and reads legacy timed logs without losing their counts', () => {
    expect(getExerciseMetric({ metric: 'seconds', reps: '30-45' })).toBe('seconds')
    const legacy = { ...createEmptySet(1), reps: 30 }
    expect(getSetQuantity(legacy, 'seconds')).toBe(30)
    expect(getSetQuantity({ ...legacy, durationSeconds: 32.5 }, 'seconds')).toBe(32.5)
    expect(getSetQuantity({ ...legacy, distanceMeters: 50 }, 'meters')).toBe(50)
  })
})
