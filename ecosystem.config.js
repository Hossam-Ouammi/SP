module.exports = {
  apps: [
    {
      name: "superprof",
      script: "app.js",
      exec_mode: "fork",
      instances: 1,
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: "3000",
        TRUST_PROXY: "true",
        PUSH_ENABLE_IN_MEMORY_REMINDERS: "true",
        PUBLIC_RESERVATION_TIMEZONE: "Europe/Paris",
        PUBLIC_RESERVATION_TIMEZONE_LABEL: "GMT+2",
        PUBLIC_RESERVATION_SLOT_MIN_TIME: "09:00",
        PUBLIC_RESERVATION_SLOT_MAX_TIME: "23:00",
        CENTRAL_CALENDAR_TIMEZONE: "Africa/Casablanca",
        CENTRAL_CALENDAR_TIMEZONE_LABEL: "heure du Maroc",
        BACKUP_SEANCES_TIMEZONE: "Africa/Casablanca",
      },
    },
  ],
};
