import { Check, ClipboardCopy, Download, Smartphone, X } from 'lucide-react'
import { useState } from 'react'
import type { InstallPlatform, PwaInstallController } from '../hooks/usePwaInstall'

interface InstallPanelProps {
  install: PwaInstallController
}

export function InstallPanel({ install }: InstallPanelProps) {
  const [guideOpen, setGuideOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function requestInstall() {
    setBusy(true)
    setMessage(null)
    try {
      const result = await install.requestInstall()
      if (result === 'dismissed') setMessage('Installation cancelled')
      if (result === 'unavailable') setGuideOpen(true)
    } catch {
      setGuideOpen(true)
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(install.appUrl)
      setCopied(true)
    } catch {
      setMessage('Select the link to copy it manually')
    }
  }

  return (
    <section className="program-section install-section">
      <div className="data-heading">
        <div>
          <h2>Phone and offline</h2>
          <p>Free, private, and saved on this device</p>
        </div>
        {install.installed ? <span className="installed-label">Installed</span> : null}
      </div>

      <div className="install-action">
        <span className="install-icon" aria-hidden="true">
          {install.installed ? <Check size={20} /> : <Smartphone size={20} />}
        </span>
        <div>
          <strong>{install.installed ? 'LiftLog is installed' : 'Add LiftLog to your home screen'}</strong>
          <p>
            {install.installed
              ? 'It opens as a standalone app and keeps working offline.'
              : 'Launch it like an app and log workouts without a connection.'}
          </p>
        </div>
        {!install.installed ? (
          <button
            className="secondary-button install-button"
            disabled={busy}
            onClick={() => {
              if (install.canPrompt) void requestInstall()
              else setGuideOpen(true)
            }}
            type="button"
          >
            <Download aria-hidden="true" size={16} />
            {install.canPrompt ? 'Install app' : 'Install on phone'}
          </button>
        ) : null}
      </div>

      {message ? <p className="install-message" role="status">{message}</p> : null}

      {guideOpen ? (
        <div className="modal-backdrop centered" role="presentation">
          <section
            aria-labelledby="install-guide-heading"
            aria-modal="true"
            className="confirm-dialog install-dialog"
            role="dialog"
          >
            <div className="sheet-heading">
              <div>
                <span className="section-label">Home screen</span>
                <h2 id="install-guide-heading">Install LiftLog</h2>
              </div>
              <button
                aria-label="Close install guide"
                className="plain-icon-button"
                onClick={() => setGuideOpen(false)}
                title="Close"
                type="button"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>

            {!install.secureContext ? (
              <p className="install-warning">
                This testing address cannot install offline. Open the deployed HTTPS link on your phone.
              </p>
            ) : null}

            <InstallSteps platform={install.platform} />

            <label className="install-link-label" htmlFor="install-link">
              App link
            </label>
            <div className="install-link-row">
              <input
                className="text-input"
                id="install-link"
                onFocus={(event) => event.currentTarget.select()}
                readOnly
                value={install.appUrl}
              />
              <button
                aria-label="Copy app link"
                className="plain-icon-button install-copy-button"
                onClick={() => void copyLink()}
                title="Copy app link"
                type="button"
              >
                {copied ? <Check aria-hidden="true" size={18} /> : <ClipboardCopy aria-hidden="true" size={18} />}
              </button>
            </div>

            <p className="install-data-note">
              Moving existing workouts? Export a backup here first, then import it on the phone.
            </p>

            <div className="dialog-actions">
              <button
                className="primary-button"
                onClick={() => setGuideOpen(false)}
                type="button"
              >
                Done
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}

function InstallSteps({ platform }: { platform: InstallPlatform }) {
  if (platform === 'ios') {
    return (
      <ol className="install-steps">
        <li>Open the app link in Safari.</li>
        <li>Tap Share, then Add to Home Screen.</li>
        <li>Tap Add.</li>
      </ol>
    )
  }

  if (platform === 'android') {
    return (
      <ol className="install-steps">
        <li>Open the app link in Chrome.</li>
        <li>Open the browser menu.</li>
        <li>Tap Install app or Add to Home screen.</li>
      </ol>
    )
  }

  return (
    <ol className="install-steps">
      <li>Open the app link on your phone.</li>
      <li>Use Safari on iPhone or Chrome on Android.</li>
      <li>Choose Add to Home Screen or Install app.</li>
    </ol>
  )
}
