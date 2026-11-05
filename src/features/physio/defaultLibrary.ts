import rawLibrary from './defaultLibrary.json?raw'
import type { RehabExercise, Region } from './types'
import { parseInventory } from './validation'

// Omar requested these exercise definitions and demonstration links be built in.
// Personal logs, symptom observations, screenshots and free-text notes are excluded.
const library = parseInventory(rawLibrary)

export const exerciseGroupNames: Record<Region, string> = {
  knee_lower_limb: 'Lower limb · knee, hip & foot',
  back_core_hip: 'Core & back',
  shoulder_neck_chest: 'Neck & upper body',
}

// Older saved libraries placed this hip exercise in the back/core group.
// Correct its presentation without rewriting plan versions or logged snapshots.
export function exerciseGroup(exercise: RehabExercise): Region {
  return exercise.id === 'true-hip-flexor' && exercise.name === 'True Hip Flexor'
    ? 'knee_lower_limb'
    : exercise.group
}

export function defaultExercises(): RehabExercise[] {
  return structuredClone(library)
}

export function exerciseDemonstration(exercise: RehabExercise) {
  return exercise.demo ?? library.find(entry => entry.id === exercise.id && entry.name === exercise.name)?.demo ?? null
}
