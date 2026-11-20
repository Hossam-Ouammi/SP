const OFFLINE_CACHE = "sp-shell-20261015-offline-v1";
const SUPERPROF_MARK = "/superprof-official-mark.svg";
// Shell revision 20261120-desktop-brand: refresh the neutral offline HTML
// and static assets on install without touching the account's IndexedDB queue.
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const response = await fetch("/offline-assets", { cache: "no-store" });
    if (!response.ok) throw new Error("Offline asset manifest unavailable");
    const { assets } = await response.json();
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.addAll([...assets, SUPERPROF_MARK].map(url => new Request(url, { cache: "reload", credentials: "omit" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("sp-shell-") && key !== OFFLINE_CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  const navigation = request.mode === "navigate" && ["/", "/offline", "/index.html"].includes(url.pathname);
  const asset = /^\/(js|css|icons|vendor)\//.test(url.pathname) || url.pathname === "/manifest.webmanifest" || url.pathname === SUPERPROF_MARK;
  if (!navigation && !asset) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      // Network-first keeps deployments current. Cache only public static
      // resources; account HTML and API data are deliberately excluded.
      if (asset && response.ok) {
        try {
          const cache = await caches.open(OFFLINE_CACHE);
          await cache.put(url.pathname, response.clone());
        } catch (_) { /* A full local cache must not break an online response. */ }
      }
      return response;
    } catch (error) {
      const cache = await caches.open(OFFLINE_CACHE);
      const saved = await cache.match(navigation ? "/offline" : url.pathname, { ignoreSearch: true });
      if (saved) return saved;
      throw error;
    }
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = {
      body: event.data ? event.data.text() : "",
    };
  }

  const title = payload.title || "Gestion Superprof";
  const options = {
    body: payload.body || "Nouvelle notification.",
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/badge-96.png",
    tag: payload.tag || "gestion-seances",
    renotify: Boolean(payload.renotify),
    data: {
      url: payload.url || "/",
      ...(payload.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  let url = "/";

  try {
    const urlCandidate = new URL(
      (event.notification.data && event.notification.data.url) || "/",
      self.location.origin
    );

    if (urlCandidate.origin === self.location.origin) {
      url = `${urlCandidate.pathname}${urlCandidate.search}${urlCandidate.hash}`;
    }
  } catch (error) {
    url = "/";
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          if ("focus" in client) {
            client.focus();
          }

          if ("navigate" in client) {
            return client.navigate(url);
          }

          return client;
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }

      return null;
    })
  );
});
