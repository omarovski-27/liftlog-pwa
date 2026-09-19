import { useEffect, useRef, type ReactNode } from 'react'

interface ModalFrameProps {
  labelledBy: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
  bottom?: boolean
  className?: string
}

export function ModalFrame({ labelledBy, children, onClose, busy = false, bottom = false, className = '' }: ModalFrameProps) {
  const element = useRef<HTMLElement>(null)
  const actions = useRef({ onClose, busy })
  useEffect(() => { actions.current = { onClose, busy } }, [onClose, busy])

  useEffect(() => {
    const dialog = element.current!
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const controls = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
      .filter((control) => !control.closest('[hidden], [aria-hidden="true"]'))
    const focusFirst = () => (dialog.querySelector<HTMLElement>('[data-autofocus]') ?? controls()[0] ?? dialog).focus()
    focusFirst()

    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!actions.current.busy) actions.current.onClose()
      } else if (event.key === 'Tab') {
        const focusable = controls()
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (!first || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault()
          const target = event.shiftKey ? last ?? dialog : first ?? dialog
          target.focus()
        }
      }
    }
    function focusin(event: FocusEvent) {
      if (event.target instanceof Node && !dialog.contains(event.target)) focusFirst()
    }
    document.addEventListener('keydown', keydown)
    document.addEventListener('focusin', focusin)
    return () => {
      document.removeEventListener('keydown', keydown)
      document.removeEventListener('focusin', focusin)
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  return <div className={`modal-backdrop${bottom ? '' : ' centered'}`} role="presentation" onMouseDown={busy ? undefined : onClose}>
    <section ref={element} tabIndex={-1} aria-labelledby={labelledBy} aria-modal="true" role="dialog" className={`${bottom ? 'bottom-sheet' : 'confirm-dialog'} ${className}`} onMouseDown={(event) => event.stopPropagation()}>
      {children}
    </section>
  </div>
}
