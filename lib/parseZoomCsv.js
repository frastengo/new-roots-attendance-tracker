const { parse } = require('csv-parse/sync');

const TIMESTAMP_RE = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i;

// Parses Zoom's "MM/DD/YYYY h:mm:ss AM/PM" format into { dateKey, minutesSinceMidnight }.
// We parse components manually (rather than `new Date(...)`) so behavior doesn't
// depend on the server's timezone or locale.
function parseZoomTimestamp(raw) {
  const match = TIMESTAMP_RE.exec((raw || '').trim());
  if (!match) return null;

  const [, mm, dd, yyyy, hourStr, minStr, , ampm] = match;
  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);
  const isPM = ampm.toUpperCase() === 'PM';

  if (isPM && hour !== 12) hour += 12;
  if (!isPM && hour === 12) hour = 0;

  return {
    dateKey: `${mm}/${dd}/${yyyy}`,
    minutesSinceMidnight: hour * 60 + minute,
  };
}

// Parses the raw Zoom attendance CSV buffer/string into row objects.
// Expected header: Name (Original Name),User Email,Join Time,Leave Time,Duration (Minutes)
function parseZoomCsv(csvText) {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  return records.map((row, index) => {
    const name = row['Name (Original Name)'] || '';
    const email = (row['User Email'] || '').trim();
    const join = parseZoomTimestamp(row['Join Time']);
    const leave = parseZoomTimestamp(row['Leave Time']);

    return {
      rowNumber: index + 2, // +2 accounts for the header row and 1-indexing
      name,
      email,
      emailNormalized: email.toLowerCase(),
      joinRaw: row['Join Time'] || '',
      leaveRaw: row['Leave Time'] || '',
      join,
      leave,
      durationRaw: row['Duration (Minutes)'] || '',
    };
  });
}

module.exports = { parseZoomCsv, parseZoomTimestamp };
