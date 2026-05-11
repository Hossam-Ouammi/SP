const session = require("express-session");

const { get, run } = require("./db");

class SQLiteSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.cleanupIntervalMs = options.cleanupIntervalMs || 15 * 60 * 1000;
    this.touchIntervalMs = options.touchIntervalMs || 15 * 60 * 1000;
    this.cleanupTimer = setInterval(() => {
      this.supprimerSessionsExpirees().catch((error) => {
        console.error("Nettoyage des sessions expirées impossible :", error);
      });
    }, this.cleanupIntervalMs);

    if (typeof this.cleanupTimer.unref === "function") {
      this.cleanupTimer.unref();
    }
  }

  calculerExpiration(sessionData) {
    if (
      sessionData &&
      sessionData.cookie &&
      sessionData.cookie.expires &&
      !Number.isNaN(new Date(sessionData.cookie.expires).getTime())
    ) {
      return new Date(sessionData.cookie.expires).getTime();
    }

    const maxAge = Number(sessionData?.cookie?.maxAge);
    return Date.now() + (Number.isFinite(maxAge) ? maxAge : 8 * 60 * 60 * 1000);
  }

  async supprimerSessionsExpirees() {
    await run("DELETE FROM sessions WHERE expires_at <= ?", [Date.now()]);
  }

  get(sid, callback) {
    get(
      `
        SELECT sid, sess, expires_at
        FROM sessions
        WHERE sid = ?
      `,
      [sid]
    )
      .then(async (sessionEnregistree) => {
        if (!sessionEnregistree) {
          callback(null, null);
          return;
        }

        if (Number(sessionEnregistree.expires_at) <= Date.now()) {
          await run("DELETE FROM sessions WHERE sid = ?", [sid]);
          callback(null, null);
          return;
        }

        try {
          callback(null, JSON.parse(sessionEnregistree.sess));
        } catch (error) {
          await run("DELETE FROM sessions WHERE sid = ?", [sid]);
          callback(null, null);
        }
      })
      .catch((error) => callback(error));
  }

  set(sid, sessionData, callback) {
    const expiresAt = this.calculerExpiration(sessionData);
    const contenu = JSON.stringify(sessionData);

    run(
      `
        INSERT INTO sessions (sid, sess, expires_at)
        VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET
          sess = excluded.sess,
          expires_at = excluded.expires_at,
          updated_at = CURRENT_TIMESTAMP
      `,
      [sid, contenu, expiresAt]
    )
      .then(() => callback && callback(null))
      .catch((error) => callback && callback(error));
  }

  destroy(sid, callback) {
    run("DELETE FROM sessions WHERE sid = ?", [sid])
      .then(() => callback && callback(null))
      .catch((error) => callback && callback(error));
  }

  touch(sid, sessionData, callback) {
    const expiresAt = this.calculerExpiration(sessionData);
    const seuilRafraichissement = Math.max(expiresAt - this.touchIntervalMs, Date.now());

    run(
      `
        UPDATE sessions
        SET expires_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE sid = ?
          AND expires_at < ?
      `,
      [expiresAt, sid, seuilRafraichissement]
    )
      .then(() => callback && callback(null))
      .catch((error) => callback && callback(error));
  }
}

module.exports = {
  SQLiteSessionStore,
};
