import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PwaInstallController } from '../hooks/usePwaInstall'
import { InstallPanel } from './InstallPanel'

function makeInstall(
  overrides: Partial<PwaInstallController> = {},
): PwaInstallController {
  return {
    appUrl: 'https://example.com/liftlog/',
    canPrompt: false,
    installed: false,
    platform: 'other',
    secureContext: true,
    requestInstall: vi.fn().mockResolvedValue('unavailable'),
    ...overrides,
  }
}

describe('InstallPanel', () => {
  it('shows iPhone installation steps and the backup transfer reminder', () => {
    render(<InstallPanel install={makeInstall({ platform: 'ios' })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Install on phone' }))

    expect(screen.getByRole('dialog', { name: 'Install LiftLog' })).toBeInTheDocument()
    expect(screen.getByText('Open the app link in Safari.')).toBeInTheDocument()
    expect(screen.getByText(/Export a backup here first/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://example.com/liftlog/')).toBeInTheDocument()
  })

  it('uses the browser installation prompt when it is available', async () => {
    const requestInstall = vi.fn().mockResolvedValue('accepted')
    render(<InstallPanel install={makeInstall({ canPrompt: true, requestInstall })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Install app' }))

    await waitFor(() => expect(requestInstall).toHaveBeenCalledOnce())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('explains why an insecure network test address cannot install offline', () => {
    render(<InstallPanel install={makeInstall({ secureContext: false })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Install on phone' }))

    expect(screen.getByText(/testing address cannot install offline/i)).toBeInTheDocument()
  })
})
