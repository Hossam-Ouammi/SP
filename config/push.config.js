const PUSH_VAPID_SUBJECT =
  process.env.PUSH_VAPID_SUBJECT || "mailto:no-reply@example.com";
const PUSH_REMINDER_TIMEZONE =
  process.env.PUSH_REMINDER_TIMEZONE || "Africa/Casablanca";
const PUSH_REMINDER_INTERVAL_HOURS = 2;
const PUSH_REMINDER_START_HOUR = 8;
const PUSH_REMINDER_END_HOUR = 22;
const PUSH_DAILY_SUMMARY_HOUR = 0;
const PUSH_REMINDER_GRACE_MINUTES = 12;
const PUSH_REMINDER_POLL_INTERVAL_MS = 5 * 60 * 1000;
const pushEnableInMemoryRemindersEnv = String(
  process.env.PUSH_ENABLE_IN_MEMORY_REMINDERS || ""
).trim().toLowerCase();
const PUSH_ENABLE_IN_MEMORY_REMINDERS =
  pushEnableInMemoryRemindersEnv === "true"
    ? true
    : pushEnableInMemoryRemindersEnv === "false"
      ? false
      : process.env.NODE_ENV !== "production";

module.exports = {
  PUSH_VAPID_SUBJECT,
  PUSH_REMINDER_TIMEZONE,
  PUSH_REMINDER_INTERVAL_HOURS,
  PUSH_REMINDER_START_HOUR,
  PUSH_REMINDER_END_HOUR,
  PUSH_DAILY_SUMMARY_HOUR,
  PUSH_REMINDER_GRACE_MINUTES,
  PUSH_REMINDER_POLL_INTERVAL_MS,
  PUSH_ENABLE_IN_MEMORY_REMINDERS,
};
