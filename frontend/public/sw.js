const CACHE_NAME = 'deni-nba-hub-v1'

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await cache.add('./')
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith('deni-nba-hub-') && key !== CACHE_NAME).map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        const cache = await caches.open(CACHE_NAME)
        await cache.put('./', response.clone())
        return response
      } catch {
        return (await caches.match('./')) || Response.error()
      }
    })())
    return
  }

  if (/\.[a-f0-9]{6,}\.(js|css)$/.test(url.pathname) || /\/icons\//.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(request, response.clone())
      }
      return response
    })())
  }
})
