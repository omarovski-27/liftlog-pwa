import { describe, expect, it } from 'vitest'
import {
  detectInstallPlatform,
  getAppInstallUrl,
  isInstallSecureContext,
} from './usePwaInstall'

describe('PWA install helpers', () => {
  it('detects iPhone, iPadOS, and Android install paths', () => {
    expect(detectInstallPlatform('Mozilla/5.0 (iPhone)')).toBe('ios')
    expect(detectInstallPlatform('Mozilla/5.0 (Macintosh)', 5)).toBe('ios')
    expect(detectInstallPlatform('Mozilla/5.0 (Linux; Android 16)')).toBe('android')
    expect(detectInstallPlatform('Mozilla/5.0 (Windows NT 10.0)')).toBe('other')
  })

  it('builds a clean installation URL for a deployed subpath', () => {
    expect(
      getAppInstallUrl(
        'https://omarovski-27.github.io/liftlog-pwa/?from=share#history',
        '/liftlog-pwa/',
      ),
    ).toBe('https://omarovski-27.github.io/liftlog-pwa/')
  })

  it('accepts HTTPS and local development as secure app contexts', () => {
    expect(isInstallSecureContext('https:', 'example.com', false)).toBe(true)
    expect(isInstallSecureContext('http:', 'localhost', false)).toBe(true)
    expect(isInstallSecureContext('http:', '192.168.1.10', false)).toBe(false)
  })
})
