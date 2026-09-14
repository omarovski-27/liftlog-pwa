/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

interface InstallEvent {
  waitUntil: (value: Promise<unknown>) => void
}

type ServiceWorkerListener = (event: InstallEvent) => void

describe('service worker installation', () => {
  it('pre-caches hashed assets when the app is hosted under a subpath', async () => {
    const source = readFileSync(
      resolve(process.cwd(), 'public/service-worker.js'),
      'utf8',
    )
    const listeners = new Map<string, ServiceWorkerListener>()
    const cachedUrls: string[] = []
    const cache = {
      addAll: vi.fn(async (urls: string[]) => cachedUrls.push(...urls)),
      put: vi.fn(),
    }
    const response = new Response(
      '<link href="/liftlog-pwa/assets/app.css"><script src="/liftlog-pwa/assets/app.js"></script>',
      { status: 200 },
    )
    const serviceWorker = {
      addEventListener: vi.fn((name: string, listener: ServiceWorkerListener) => {
        listeners.set(name, listener)
      }),
      clients: { claim: vi.fn() },
      registration: { scope: 'https://example.com/liftlog-pwa/' },
      skipWaiting: vi.fn(),
    }

    runInNewContext(source, {
      URL,
      caches: {
        delete: vi.fn(),
        keys: vi.fn(async () => []),
        match: vi.fn(),
        open: vi.fn(async () => cache),
      },
      fetch: vi.fn(async () => response),
      location: new URL('https://example.com/liftlog-pwa/service-worker.js'),
      self: serviceWorker,
    })

    const pending: Promise<unknown>[] = []
    listeners.get('install')?.({ waitUntil: (value) => pending.push(value) })
    await Promise.all(pending)

    expect(cachedUrls).toContain('https://example.com/liftlog-pwa/assets/app.css')
    expect(cachedUrls).toContain('https://example.com/liftlog-pwa/assets/app.js')
    expect(cachedUrls).toContain('https://example.com/liftlog-pwa/manifest.webmanifest')
  })
})
