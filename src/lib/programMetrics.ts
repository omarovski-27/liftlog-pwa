import type {
  ExerciseTemplate,
  MuscleGroup,
  TrainingProgram,
  WorkoutTemplate,
} from '../types/program'

export function getExercisePrescription(
  exercise: ExerciseTemplate,
  weekNumber?: number,
): { sets: number; reps: string; overridden: boolean } {
  const override = weekNumber === undefined
    ? undefined
    : exercise.weekOverrides?.find(
        (entry) => weekNumber >= entry.startWeek && weekNumber <= entry.endWeek,
      )

  return {
    sets: override?.sets ?? exercise.sets,
    reps: override?.reps ?? exercise.reps,
    overridden: override !== undefined,
  }
}

export function getWorkingSetCount(
  workout: WorkoutTemplate,
  weekNumber?: number,
): number {
  return workout.exercises
    .filter((exercise) => exercise.kind === 'working')
    .reduce(
      (total, exercise) => total + getExercisePrescription(exercise, weekNumber).sets,
      0,
    )
}

export function getWorkoutExerciseCount(workout: WorkoutTemplate): number {
  return workout.exercises.length
}

export function getTotalProgramSessions(program: TrainingProgram): number {
  return program.durationWeeks * program.liftingDaysPerWeek
}

export function getRemainingProgramSessions(
  program: TrainingProgram,
  completedSessions = 0,
): number {
  const completedWeeks = Math.max(0, program.currentWeek - 1)
  const sessionsBeforeStart = completedWeeks * program.liftingDaysPerWeek
  return Math.max(
    0,
    getTotalProgramSessions(program) -
      sessionsBeforeStart -
      Math.max(0, completedSessions),
  )
}

export function getProgramCurrentWeek(
  program: TrainingProgram,
  completedSessions = 0,
): number {
  const completedWeeks = Math.floor(
    Math.max(0, completedSessions) / program.liftingDaysPerWeek,
  )
  return Math.min(program.durationWeeks, program.currentWeek + completedWeeks)
}

export function getWeeklyExerciseSlots(program: TrainingProgram): number {
  return program.workouts.reduce(
    (total, workout) => total + getWorkoutExerciseCount(workout),
    0,
  )
}

export function getWeeklyWorkingSets(
  program: TrainingProgram,
  weekNumber?: number,
): number {
  return program.workouts.reduce(
    (total, workout) => total + getWorkingSetCount(workout, weekNumber),
    0,
  )
}

export function getWeeklySetsForMuscle(
  program: TrainingProgram,
  muscleGroup: MuscleGroup,
  weekNumber?: number,
): number {
  return program.workouts.reduce((total, workout) => {
    const workoutSets = workout.exercises
      .filter(
        (exercise) =>
          exercise.kind === 'working' && exercise.muscleGroups.includes(muscleGroup),
      )
      .reduce(
        (sum, exercise) => sum + getExercisePrescription(exercise, weekNumber).sets,
        0,
      )

    return total + workoutSets
  }, 0)
}

export function getNextWorkout(program: TrainingProgram): WorkoutTemplate {
  return program.workouts[0]
}
