import { Download, RotateCcw, Upload, X } from 'lucide-react'
import { useState } from 'react'
import {
  MAX_BACKUP_BYTES,
  createBackup,
  parseBackup,
  serializeBackup,
  summarizeBackup,
  type BackupSummary,
} from '../lib/backups'
import type { BackupRestoreMode, LiftLogBackup, ProgramVersion } from '../types/storage'
import { ModalFrame } from './ModalFrame'

interface BackupPanelProps {
  canModifyData: boolean
  canExportData?: boolean
  currentVersion: ProgramVersion
  versions: ProgramVersion[]
  onRestoreBackup: (backup: LiftLogBackup, mode: BackupRestoreMode) => Promise<void>
  onRestoreVersion: (version: ProgramVersion) => Promise<void>
}

interface PendingBackup {
  backup: LiftLogBackup
  fileName: string
  summary: BackupSummary
}

export function BackupPanel({
  canModifyData,
  canExportData = true,
  currentVersion,
  versions,
  onRestoreBackup,
  onRestoreVersion,
}: BackupPanelProps) {
  const [pendingBackup, setPendingBackup] = useState<PendingBackup | null>(null)
  const [restoreMode, setRestoreMode] = useState<BackupRestoreMode>('merge')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sortedVersions = versions.slice().sort((a, b) => b.version - a.version)

  async function exportBackup() {
    setBusy(true)
    setError(null)
    try {
      const backup = await createBackup()
      const blob = new Blob([serializeBackup(backup)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `liftlog-backup-${backup.createdAt.slice(0, 10)}.json`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch {
      setError('The backup could not be exported.')
    } finally {
      setBusy(false)
    }
  }

  async function selectBackup(file: File | undefined) {
    if (!file) return
    setError(null)
    if (file.size > MAX_BACKUP_BYTES) {
      setError('The backup is larger than 25 MB.')
      return
    }

    try {
      setBusy(true)
      const backup = parseBackup(await readFile(file))
      setPendingBackup({ backup, fileName: file.name, summary: summarizeBackup(backup) })
      setRestoreMode('merge')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The backup could not be read.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmRestore() {
    if (!pendingBackup || busy || !canModifyData) return
    setBusy(true)
    setError(null)
    try {
      await onRestoreBackup(pendingBackup.backup, restoreMode)
      setPendingBackup(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The backup could not be restored.')
    } finally {
      setBusy(false)
    }
  }

  async function restoreVersion(version: ProgramVersion) {
    setBusy(true)
    setError(null)
    try {
      await onRestoreVersion(version)
    } catch {
      setError('That program version could not be restored.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="program-section data-section">
      <div className="data-heading">
        <div>
          <h2>Data and backups</h2>
          <p>Stored on this device</p>
        </div>
        <span>Version {currentVersion.version}</span>
      </div>

      <div className="backup-actions">
        <button className="secondary-button" disabled={busy || !canExportData} onClick={exportBackup} type="button">
          <Download aria-hidden="true" size={16} />
          Export backup
        </button>
        <label
          aria-disabled={!canModifyData || busy}
          className="secondary-button file-button"
          htmlFor="backup-upload"
        >
          <Upload aria-hidden="true" size={16} />
          Import backup
        </label>
        <input
          accept="application/json,.json"
          className="sr-only"
          disabled={!canModifyData || busy}
          id="backup-upload"
          onChange={(event) => {
            void selectBackup(event.target.files?.[0])
            event.target.value = ''
          }}
          type="file"
        />
      </div>

      {error && !pendingBackup ? <p className="inline-error" role="alert">{error}</p> : null}

      <div className="version-list" aria-label="Program versions">
        {sortedVersions.map((version) => {
          const current = version.id === currentVersion.id
          return (
            <div className="version-row" key={version.id}>
              <div>
                <strong>Version {version.version}</strong>
                <span>
                  {version.label ?? formatVersionReason(version.reason)} /{' '}
                  {formatVersionDate(version.createdAt)}
                </span>
              </div>
              {current ? (
                <span className="current-version">Current</span>
              ) : (
                <button
                  className="text-button"
                  disabled={busy || !canModifyData}
                  onClick={() => void restoreVersion(version)}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" size={14} />
                  Restore
                </button>
              )}
            </div>
          )
        })}
      </div>

      {pendingBackup ? (
        <ModalFrame labelledBy="backup-heading" className="backup-dialog" busy={busy} onClose={() => setPendingBackup(null)}>
            <div className="sheet-heading">
              <div>
                <span className="section-label">{pendingBackup.fileName}</span>
                <h2 id="backup-heading">Restore backup</h2>
              </div>
              <button
                className="plain-icon-button"
                disabled={busy}
                onClick={() => setPendingBackup(null)}
                title="Close"
                type="button"
              >
                <X aria-hidden="true" size={20} />
                <span className="sr-only">Close</span>
              </button>
            </div>

            <BackupContents summary={pendingBackup.summary} />
            {error ? <p className="inline-error" role="alert">{error}</p> : null}

            <div className="restore-mode" aria-label="Restore mode">
              <button
                aria-pressed={restoreMode === 'merge'}
                disabled={busy}
                onClick={() => setRestoreMode('merge')}
                type="button"
              >
                Merge
              </button>
              <button
                aria-pressed={restoreMode === 'replace'}
                disabled={busy}
                onClick={() => setRestoreMode('replace')}
                type="button"
              >
                Replace all
              </button>
            </div>

            <p className={restoreMode === 'replace' ? 'restore-warning' : ''}>
              {restoreMode === 'merge'
                ? 'Adds backup records and updates older copies of the same workout.'
                : 'Removes data on this device, then restores the backup exactly.'}
            </p>

            <div className="dialog-actions">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => setPendingBackup(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={restoreMode === 'replace' ? 'danger-button' : 'primary-button'}
                disabled={busy || !canModifyData}
                onClick={() => void confirmRestore()}
                type="button"
              >
                {busy ? 'Restoring...' : 'Restore backup'}
              </button>
            </div>
        </ModalFrame>
      ) : null}
    </section>
  )
}

function BackupContents({ summary }: { summary: BackupSummary }) {
  return (
    <dl className="backup-summary">
      <div>
        <dt>Programs</dt>
        <dd>{summary.programCount}</dd>
      </div>
      <div>
        <dt>Versions</dt>
        <dd>{summary.versionCount}</dd>
      </div>
      <div>
        <dt>Finished</dt>
        <dd>{summary.completedSessionCount}</dd>
      </div>
      <div>
        <dt>Active</dt>
        <dd>{summary.activeSessionCount}</dd>
      </div>
    </dl>
  )
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

function formatVersionReason(reason: ProgramVersion['reason']): string {
  if (reason === 'seed') return 'Original program'
  if (reason === 'create') return 'Created program'
  if (reason === 'edit') return 'Program edit'
  if (reason === 'restore') return 'Restored version'
  return 'Imported version'
}

function formatVersionDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}
