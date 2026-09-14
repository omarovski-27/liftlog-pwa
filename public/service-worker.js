const CACHE_NAME = 'liftlog-shell-v7'
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
  const response = await fetch('./index.html', { cache: 'reload' })
  const html = await response.clone().text()
  const urls = new Set(APP_SHELL)
  const matches = html.matchAll(/(?:href|src)="([^"]+)"/g)

  for (const match of matches) {
    const assetUrl = match[1]

    if (
      assetUrl.startsWith('./') ||
      assetUrl.startsWith('assets/') ||
      assetUrl.startsWith('/assets/')
    ) {
      urls.add(assetUrl.replace(/^\//, './'))
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
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        return response
      })
    }),
  )
})
