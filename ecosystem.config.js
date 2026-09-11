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
        HOST: "127.0.0.1",
        PORT: "3000",
        TRUST_PROXY: "true",
        PUSH_ENABLE_IN_MEMORY_REMINDERS: "true",
        CENTRAL_CALENDAR_TIMEZONE: "Africa/Casablanca",
        CENTRAL_CALENDAR_TIMEZONE_LABEL: "heure du Maroc",
        BACKUP_SEANCES_ENABLED: "false",
        BACKUP_SEANCES_TIMEZONE: "Africa/Casablanca",
      },
    },
  ],
};
