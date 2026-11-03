import { useRef, useState } from 'react'
import type { RehabExercise } from './types'
import { loadPrivateSetup } from './privateSetup'

export function PrivateSetup({
  disabled,
  onReady,
}: {
  disabled: boolean
  onReady: (exercises: RehabExercise[]) => void
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const running = useRef(false)
  return (
    <form
      className="physio-card"
      onSubmit={(event) => {
        event.preventDefault()
        if (running.current || disabled) return
        running.current = true
        const secret = code
        setCode('')
        setError('')
        setLoading(true)
        void loadPrivateSetup(secret)
          .then(onReady)
          .catch((caught) => {
            setError(
              caught instanceof Error
                ? caught.message
                : 'The exercise pack could not be opened. Check your connection and private code.',
            )
          })
          .finally(() => {
            running.current = false
            setLoading(false)
          })
      }}
    >
      <h2>Set up with private code</h2>
      <p>
        Paste your code to load your exercise list and video links here. No file
        transfer needed.
      </p>
      <p>
        Use this in the installed app where you keep your lifting records. Setup
        needs internet; exercises are saved on this device after you add them.
      </p>
      <label>
        Private setup code
        <input
          aria-label="Private setup code"
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={100}
          value={code}
          disabled={disabled || loading}
          onChange={(event) => setCode(event.target.value)}
        />
      </label>
      <button
        className="primary-button"
        type="submit"
        disabled={disabled || loading || !code.trim()}
      >
        {loading ? 'Opening exercise pack…' : 'Load my exercises'}
      </button>
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
      <small>
        The pack is encrypted. Your code unlocks it on this device and is not
        sent to the server. Keep the code private: anyone who has it can open
        the pack.
      </small>
    </form>
  )
}
