// Program policy for the August 26 session.
// A Fellow who misses more than 10 minutes of the session is marked absent.
module.exports = {
  SESSION_DATE_KEY: '08/26/2026', // MM/DD/YYYY, matches the Zoom export's date format
  SESSION_START_MIN: 17 * 60, // 5:00 PM
  SESSION_END_MIN: 18 * 60 + 30, // 6:30 PM
  SESSION_LENGTH_MIN: 90,
  ALLOWED_MISSED_MIN: 10,
  get PRESENT_THRESHOLD_MIN() {
    return this.SESSION_LENGTH_MIN - this.ALLOWED_MISSED_MIN; // 80
  },
};
