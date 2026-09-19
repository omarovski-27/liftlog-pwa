import { Check, Copy, Download, LockKeyhole, Pencil, Plus, Upload } from 'lucide-react'
import type { ProgramVersion } from '../types/storage'

interface ProgramLibraryPanelProps {
  canManage: boolean
  currentProgramId: string
  onCreate: () => void
  onDuplicate: (version: ProgramVersion) => void
  onEdit: () => void
  onExport: (version: ProgramVersion) => void
  onImport: () => void
  onSwitch: (programId: string) => Promise<void>
  programs: ProgramVersion[]
}

export function ProgramLibraryPanel({
  canManage,
  currentProgramId,
  onCreate,
  onDuplicate,
  onEdit,
  onExport,
  onImport,
  onSwitch,
  programs,
}: ProgramLibraryPanelProps) {
  const sortedPrograms = programs.slice().sort((a, b) => {
    if (a.programId === currentProgramId) return -1
    if (b.programId === currentProgramId) return 1
    return a.program.name.localeCompare(b.program.name)
  })

  return (
    <section className="program-section library-section">
      <div className="library-heading">
        <div>
          <h2>Programs</h2>
          <p>{programs.length === 1 ? '1 saved program' : `${programs.length} saved programs`}</p>
        </div>
        <div className="library-heading-actions">
          <button
            className="secondary-button compact-button"
            disabled={!canManage}
            onClick={onImport}
            type="button"
          >
            <Upload aria-hidden="true" size={16} />
            Import
          </button>
          <button
            className="secondary-button compact-button"
            disabled={!canManage}
            onClick={onCreate}
            type="button"
          >
            <Plus aria-hidden="true" size={16} />
            New
          </button>
        </div>
      </div>

      {!canManage ? (
        <p className="program-lock">
          <LockKeyhole aria-hidden="true" size={14} />
          Finish or discard the active workout to change programs.
        </p>
      ) : null}

      <div className="program-library-list">
        {sortedPrograms.map((version) => {
          const current = version.programId === currentProgramId
          return (
            <article className="program-library-row" data-current={current} key={version.id}>
              <div className="program-library-main">
                <strong>{version.program.name}</strong>
                <span>
                  {version.program.durationWeeks} weeks / {version.program.workouts.length}{' '}
                  workouts / Version {version.version}
                </span>
              </div>
              <div className="program-library-actions">
                {current ? (
                  <span className="active-program-label">
                    <Check aria-hidden="true" size={14} />
                    Active
                  </span>
                ) : (
                  <button
                    className="text-button"
                    disabled={!canManage}
                    onClick={() => void onSwitch(version.programId)}
                    type="button"
                  >
                    Use
                  </button>
                )}
                <button
                  aria-label={`Export ${version.program.name}`}
                  className="builder-icon-button"
                  onClick={() => onExport(version)}
                  title={`Export ${version.program.name}`}
                  type="button"
                >
                  <Download aria-hidden="true" size={15} />
                </button>
                <button
                  aria-label={`Duplicate ${version.program.name}`}
                  className="builder-icon-button"
                  disabled={!canManage}
                  onClick={() => onDuplicate(version)}
                  title={`Duplicate ${version.program.name}`}
                  type="button"
                >
                  <Copy aria-hidden="true" size={15} />
                </button>
                {current ? (
                  <button
                    aria-label={`Edit ${version.program.name}`}
                    className="text-button"
                    disabled={!canManage}
                    onClick={onEdit}
                    title={`Edit ${version.program.name}`}
                    type="button"
                  >
                    <Pencil aria-hidden="true" size={15} />
                    Edit
                  </button>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
