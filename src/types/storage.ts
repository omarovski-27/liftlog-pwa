import type { TrainingProgram } from './program'
import type { ExerciseAlternative, WorkoutSession } from './session'
import type { RehabData } from '../features/physio/types'

export type ProgramVersionReason =
  'seed' | 'create' | 'edit' | 'import' | 'restore'

export interface ProgramVersion {
  id: string
  programId: string
  version: number
  createdAt: string
  reason: ProgramVersionReason
  basedOnVersion?: number
  label?: string
  program: TrainingProgram
}

export interface LiftLogBackup {
  format: 'liftlog-backup'
  schemaVersion: 1 | 2
  appVersion: string
  createdAt: string
  data: {
    activeProgramId?: string
    programVersions: ProgramVersion[]
    sessions: WorkoutSession[]
    alternatives: ExerciseAlternative[]
    rehab?: RehabData
  }
}

export type BackupRestoreMode = 'merge' | 'replace'

export interface AppSettings {
  id: 'app'
  activeProgramId: string
  updatedAt: string
}
