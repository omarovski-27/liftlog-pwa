const CACHE_NAME = 'liftlog-shell-v8'
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
    }),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) {
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached
      }

      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
