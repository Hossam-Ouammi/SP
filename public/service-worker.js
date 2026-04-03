self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = {
      body: event.data ? event.data.text() : "",
    };
  }

  const title = payload.title || "Gestion des seances";
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

  const url = (event.notification.data && event.notification.data.url) || "/";

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
