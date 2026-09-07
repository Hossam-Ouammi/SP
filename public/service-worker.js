self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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

  const title = payload.title || "Gestion des séances";
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
