---
layout: null
---
const CACHE_NAME = "retro-{{ site.time | date: '%s' }}";
const PRECACHE_URLS = [
  {%- for page in site.html_pages %}
  "{{ page.url | relative_url }}",
  {%- endfor %}
  {%- for file in site.static_files %}
  "{{ file.path | relative_url }}",
  {%- endfor %}
  "{{ '/manifest.webmanifest' | relative_url }}",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (cached) =>
        cached ||
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch((error) => {
            if (request.mode === "navigate") {
              return caches.match("{{ '/' | relative_url }}");
            }
            throw error;
          }),
    ),
  );
});
