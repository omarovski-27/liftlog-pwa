import rawLibrary from './defaultLibrary.json?raw'
import type { RehabExercise } from './types'
import { parseInventory } from './validation'

// Omar requested these exercise definitions and demonstration links be built in.
// Personal logs, symptom observations, screenshots and free-text notes are excluded.
const library = parseInventory(rawLibrary)

export function defaultExercises(): RehabExercise[] {
  return structuredClone(library)
}

export function exerciseDemonstration(exercise: RehabExercise) {
  return exercise.demo ?? library.find(entry => entry.id === exercise.id && entry.name === exercise.name)?.demo ?? null
}
