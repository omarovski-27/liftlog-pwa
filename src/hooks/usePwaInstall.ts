import { useCallback, useEffect, useState } from 'react'

export type InstallPlatform = 'android' | 'ios' | 'other'
export type InstallRequestResult = 'accepted' | 'dismissed' | 'unavailable'

interface InstallChoice {
  outcome: 'accepted' | 'dismissed'
  platform: string
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}

export interface PwaInstallController {
  appUrl: string
  canPrompt: boolean
  installed: boolean
  platform: InstallPlatform
  secureContext: boolean
  requestInstall: () => Promise<InstallRequestResult>
}

export function usePwaInstall(): PwaInstallController {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandaloneMode)

  useEffect(() => {
    const displayMode = window.matchMedia?.('(display-mode: standalone)')

    function updateInstalledState() {
      setInstalled(isStandaloneMode())
    }

    function capturePrompt(event: Event) {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    function markInstalled() {
      setInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', capturePrompt)
    window.addEventListener('appinstalled', markInstalled)
    displayMode?.addEventListener?.('change', updateInstalledState)

    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt)
      window.removeEventListener('appinstalled', markInstalled)
      displayMode?.removeEventListener?.('change', updateInstalledState)
    }
  }, [])

  const requestInstall = useCallback(async (): Promise<InstallRequestResult> => {
    if (!deferredPrompt) return 'unavailable'

    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    if (choice.outcome === 'accepted') setInstalled(true)
    return choice.outcome
  }, [deferredPrompt])

  return {
    appUrl: getAppInstallUrl(window.location.href, import.meta.env.BASE_URL),
    canPrompt: deferredPrompt !== null,
    installed,
    platform: detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints),
    secureContext: isInstallSecureContext(
      window.location.protocol,
      window.location.hostname,
      window.isSecureContext,
    ),
    requestInstall,
  }
}

export function detectInstallPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios'
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  return 'other'
}

export function getAppInstallUrl(currentUrl: string, basePath: string): string {
  const url = new URL(basePath, currentUrl)
  url.search = ''
  url.hash = ''
  return url.href
}

export function isInstallSecureContext(
  protocol: string,
  hostname: string,
  browserSecureContext?: boolean,
): boolean {
  if (browserSecureContext === true) return true
  return (
    protocol === 'https:' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  )
}

function isStandaloneMode(): boolean {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return (
    Boolean(window.matchMedia?.('(display-mode: standalone)').matches) ||
    navigatorWithStandalone.standalone === true
  )
}
