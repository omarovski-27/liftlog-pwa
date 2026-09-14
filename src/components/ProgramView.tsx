import type { TrainingProgram } from '../types/program'
import type { WorkoutSession } from '../types/session'
import type { BackupRestoreMode, LiftLogBackup, ProgramVersion } from '../types/storage'
import type { PwaInstallController } from '../hooks/usePwaInstall'
import { getProgramSessionCount } from '../lib/sessions'
import {
  getRemainingProgramSessions,
  getProgramCurrentWeek,
  getWorkoutExerciseCount,
  getWorkingSetCount,
} from '../lib/programMetrics'
import { BackupPanel } from './BackupPanel'
import { InstallPanel } from './InstallPanel'
import { ProgramLibraryPanel } from './ProgramLibraryPanel'

interface ProgramViewProps {
  program: TrainingProgram
  sessions: WorkoutSession[]
  currentVersion: ProgramVersion
  install: PwaInstallController
  canManagePrograms: boolean
  programs: ProgramVersion[]
  versions: ProgramVersion[]
  onCreateProgram: () => void
  onDuplicateProgram: (version: ProgramVersion) => void
  onEditProgram: () => void
  onExportProgram: (version: ProgramVersion) => void
  onImportProgram: () => void
  onRestoreBackup: (backup: LiftLogBackup, mode: BackupRestoreMode) => Promise<void>
  onRestoreVersion: (version: ProgramVersion) => Promise<void>
  onSwitchProgram: (programId: string) => Promise<void>
}

export function ProgramView({
  program,
  sessions,
  currentVersion,
  install,
  canManagePrograms,
  programs,
  versions,
  onCreateProgram,
  onDuplicateProgram,
  onEditProgram,
  onExportProgram,
  onImportProgram,
  onRestoreBackup,
  onRestoreVersion,
  onSwitchProgram,
}: ProgramViewProps) {
  const completed = getProgramSessionCount(program.id, sessions)
  const remaining = getRemainingProgramSessions(program, completed)
  const weeksLeft = Math.ceil(remaining / program.liftingDaysPerWeek)
  const currentWeek = getProgramCurrentWeek(program, completed)

  return (
    <div className="page-view">
      <header className="page-header">
        <span className="section-label">Current program</span>
        <h1>{program.name}</h1>
        <p>
          {program.durationWeeks} weeks / {program.liftingDaysPerWeek} lifting days
        </p>
      </header>

      <section className="program-summary" aria-label="Program status">
        <div>
          <span>Sessions left</span>
          <strong>{remaining}</strong>
        </div>
        <div>
          <span>Weeks left</span>
          <strong>{weeksLeft}</strong>
        </div>
        <div>
          <span>Full rest</span>
          <strong>{program.fullRestDay}</strong>
        </div>
      </section>

      <ProgramLibraryPanel
        canManage={canManagePrograms}
        currentProgramId={program.id}
        onCreate={onCreateProgram}
        onDuplicate={onDuplicateProgram}
        onEdit={onEditProgram}
        onExport={onExportProgram}
        onImport={onImportProgram}
        onSwitch={onSwitchProgram}
        programs={programs}
      />

      <InstallPanel install={install} />

      <BackupPanel
        canModifyData={canManagePrograms}
        currentVersion={currentVersion}
        onRestoreBackup={onRestoreBackup}
        onRestoreVersion={onRestoreVersion}
        versions={versions}
      />

      <ProgramSection title={`Workouts - week ${currentWeek}`}>
        <div className="program-workout-list">
          {program.workouts.map((workout) => (
            <div key={workout.id}>
              <span>{workout.dayNumber}</span>
              <div>
                <strong>{workout.shortTitle}</strong>
                <small>{workout.scheduledDay}</small>
              </div>
              <p>
                {getWorkoutExerciseCount(workout)} exercises / {getWorkingSetCount(workout, currentWeek)} sets
              </p>
            </div>
          ))}
        </div>
      </ProgramSection>

      {program.phases.length > 0 ? (
        <ProgramSection title="Phases">
          <div className="phase-list">
            {program.phases.map((phase) => (
              <article key={phase.id}>
                <span>{phase.weeks}</span>
                <h3>{phase.name}</h3>
                <strong>{phase.chestSets}</strong>
                <p>{phase.focus}</p>
              </article>
            ))}
          </div>
        </ProgramSection>
      ) : null}

      {program.chestVolumeRamp.length > 0 ? (
        <ProgramSection title="Chest volume">
          <div className="volume-list">
            {program.chestVolumeRamp.map((ramp) => (
              <div key={ramp.weeks}>
                <span>{ramp.weeks}</span>
                <strong>{ramp.setsPerWeek} sets</strong>
                <p>{ramp.note}</p>
              </div>
            ))}
          </div>
        </ProgramSection>
      ) : null}

      {program.progressionRules.length > 0 ? (
        <ProgramSection title="Progression">
          <ul className="plain-list">
            {program.progressionRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </ProgramSection>
      ) : null}

      {program.constraints.length > 0 ? (
        <ProgramSection title="Constraints">
          <ul className="plain-list">
            {program.constraints.map((constraint) => (
              <li key={constraint}>{constraint}</li>
            ))}
          </ul>
        </ProgramSection>
      ) : null}

      {program.stopTriggers.length > 0 ? (
        <ProgramSection title="Stop triggers">
          <ul className="plain-list danger-list">
            {program.stopTriggers.map((trigger) => (
              <li key={trigger}>{trigger}</li>
            ))}
          </ul>
        </ProgramSection>
      ) : null}
    </div>
  )
}

function ProgramSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="program-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}
