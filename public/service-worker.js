const CACHE_NAME = 'liftlog-shell-v10'
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app-icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
]

async function getBuildAssets() {
  const scopeUrl = new URL(self.registration.scope)
  const response = await fetch(new URL('./index.html', scopeUrl), { cache: 'reload' })
  if (!response.ok) throw new Error('The app shell could not be downloaded.')
  const html = await response.clone().text()
  const urls = new Set(APP_SHELL.map((path) => new URL(path, scopeUrl).href))
  const matches = html.matchAll(/(?:href|src)="([^"]+)"/g)

  for (const match of matches) {
    const assetUrl = new URL(match[1], scopeUrl)
    if (
      assetUrl.origin === scopeUrl.origin &&
      assetUrl.pathname.startsWith(scopeUrl.pathname)
    ) {
      urls.add(assetUrl.href)
    }
  }

  return [...urls]
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(await getBuildAssets())
      await self.skipWaiting()
    }),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then(async (keys) => {
        await Promise.all(
          keys
            .filter((key) => key.startsWith('liftlog-shell-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        )
        await self.clients.claim()
      }),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const scopeUrl = new URL(self.registration.scope)
  const requestUrl = new URL(request.url)

  if (request.method !== 'GET' || requestUrl.origin !== scopeUrl.origin || !requestUrl.pathname.startsWith(scopeUrl.pathname)) {
    return
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached && request.mode !== 'navigate') return cached
      try {
        const response = await fetch(request)
        if (response.ok) {
          await cache.put(request, response.clone()).catch(() => {})
        } else if (request.mode === 'navigate') {
          return await cache.match(new URL('./index.html', scopeUrl).href) ?? response
        }
        return response
      } catch (error) {
        if (cached) return cached
        if (request.mode === 'navigate') {
          const shell = await cache.match(new URL('./index.html', scopeUrl).href)
          if (shell) return shell
        }
        throw error
      }
    }),
  )
})
