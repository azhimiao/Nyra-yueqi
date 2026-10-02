const CACHE_VERSION = "__CACHE_VERSION__";
const CACHE_NAME = `yueqi-companion-${CACHE_VERSION}`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/lover-portrait.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
];

const API_PATH_PREFIXES = ["/model/", "/sync/", "/auth/", "/updates/", "/notices/", "/community", "/external/", "/health"];
const API_HOSTS = ["127.0.0.1:8787", "localhost:8787"];

function isApiRequest(url) {
  if (API_HOSTS.some((host) => url.host === host || url.href.includes(host))) return true;
  return API_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (isApiRequest(url)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  if (!isSameOrigin(url)) return;

  // Character atlases / manifests change without bumping package version;
  // cache-first would keep a baked black matte forever after a bad import.
  const isCharacterAsset = url.pathname.includes("/assets/characters/");
  if (isCharacterAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone())).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone())).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
