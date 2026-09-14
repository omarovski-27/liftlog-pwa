import { ArrowLeft, Check, ClipboardCopy, FileJson } from 'lucide-react'
import { useState } from 'react'
import {
  MAX_PROGRAM_IMPORT_BYTES,
  ProgramImportError,
  getAiProgramPrompt,
  parseProgramImport,
} from '../lib/programImport'
import type { TrainingProgram } from '../types/program'

interface ProgramImportProps {
  onCancel: () => void
  onReview: (program: TrainingProgram) => void
}

export function ProgramImport({ onCancel, onReview }: ProgramImportProps) {
  const [raw, setRaw] = useState('')
  const [issues, setIssues] = useState<string[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const aiPrompt = getAiProgramPrompt()

  function requestCancel() {
    if (raw.trim()) setDiscardOpen(true)
    else onCancel()
  }

  function reviewProgram(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const program = parseProgramImport(raw)
      setIssues([])
      onReview(program)
    } catch (caught) {
      setIssues(
        caught instanceof ProgramImportError
          ? caught.issues
          : ['The program could not be read.'],
      )
    }
  }

  async function loadFile(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    if (file.size > MAX_PROGRAM_IMPORT_BYTES) {
      setIssues(['Program files must be 2 MB or smaller.'])
      input.value = ''
      return
    }

    setReading(true)
    setIssues([])
    try {
      setRaw(await file.text())
      setFileName(file.name)
    } catch {
      setIssues(['The selected file could not be read.'])
    } finally {
      setReading(false)
      input.value = ''
    }
  }

  async function copyPrompt() {
    setIssues([])
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(aiPrompt)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      setIssues(['Clipboard access is unavailable. Select the AI prompt text instead.'])
    }
  }

  return (
    <main className="builder-screen import-screen">
      <header className="builder-topbar">
        <button
          aria-label="Back"
          className="plain-icon-button"
          onClick={requestCancel}
          title="Back"
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={20} />
        </button>
        <div>
          <span>Program import</span>
          <strong>JSON and AI</strong>
        </div>
        <button
          className="builder-save-button"
          disabled={reading}
          form="program-import-form"
          type="submit"
        >
          <Check aria-hidden="true" size={16} />
          Review
        </button>
      </header>

      <form
        className="builder-content import-content"
        id="program-import-form"
        onSubmit={reviewProgram}
      >
        <section className="builder-section">
          <div className="builder-section-heading import-section-heading">
            <div>
              <span className="section-label">Source</span>
              <h1>Import a program</h1>
            </div>
            <label className="secondary-button compact-button import-file-button">
              <FileJson aria-hidden="true" size={16} />
              Choose file
              <input
                accept=".json,application/json,text/plain"
                aria-label="Choose program JSON file"
                className="sr-only"
                disabled={reading}
                onChange={(event) => void loadFile(event)}
                type="file"
              />
            </label>
          </div>

          {fileName ? <p className="import-file-name">{fileName}</p> : null}
          <label className="builder-field import-json-field" htmlFor="program-json">
            <span>Program JSON</span>
            <textarea
              aria-invalid={issues.length > 0}
              autoCapitalize="off"
              autoCorrect="off"
              className="text-input import-json-input"
              id="program-json"
              onChange={(event) => {
                setRaw(event.target.value)
                setFileName(null)
                if (issues.length > 0) setIssues([])
              }}
              placeholder={'{"format":"liftlog-program","schemaVersion":1,...}'}
              spellCheck={false}
              value={raw}
            />
          </label>
        </section>

        <section className="builder-section import-prompt-section">
          <div className="builder-section-heading">
            <div>
              <span className="section-label">External AI</span>
              <h2>AI prompt</h2>
            </div>
            <button
              className="secondary-button compact-button"
              onClick={() => void copyPrompt()}
              type="button"
            >
              <ClipboardCopy aria-hidden="true" size={16} />
              {copied ? 'Copied' : 'Copy prompt'}
            </button>
          </div>
          <details className="import-prompt-details">
            <summary>View prompt</summary>
            <textarea
              aria-label="AI import prompt"
              className="text-input import-prompt-text"
              readOnly
              value={aiPrompt}
            />
          </details>
        </section>

        {issues.length > 0 ? (
          <section className="builder-alert import-alert" role="alert">
            <strong>Import needs attention</strong>
            <ul>
              {issues.slice(0, 12).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
            {issues.length > 12 ? <p>{issues.length - 12} more issues</p> : null}
          </section>
        ) : null}

        <button
          className="builder-bottom-save primary-button"
          disabled={reading}
          type="submit"
        >
          <Check aria-hidden="true" size={17} />
          Review program
        </button>
      </form>

      {discardOpen ? (
        <div className="modal-backdrop centered" role="presentation">
          <section
            aria-labelledby="discard-import-heading"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
          >
            <h2 id="discard-import-heading">Discard imported JSON?</h2>
            <p>The unsaved import text will be removed.</p>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                onClick={() => setDiscardOpen(false)}
                type="button"
              >
                Keep reviewing
              </button>
              <button className="danger-button" onClick={onCancel} type="button">
                Discard import
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}
