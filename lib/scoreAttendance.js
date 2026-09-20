const policy = require('./policy');

// Merges overlapping/touching [start, end] minute intervals and returns total covered minutes.
function unionMinutes(intervals) {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curStart, curEnd] = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i];
    if (start <= curEnd) {
      curEnd = Math.max(curEnd, end);
    } else {
      total += curEnd - curStart;
      [curStart, curEnd] = [start, end];
    }
  }
  total += curEnd - curStart;
  return total;
}

// Clips a [joinMin, leaveMin] interval to the session window. Returns null if no overlap.
function clipToSession(joinMin, leaveMin) {
  const start = Math.max(joinMin, policy.SESSION_START_MIN);
  const end = Math.min(leaveMin, policy.SESSION_END_MIN);
  if (end <= start) return null;
  return [start, end];
}

// Splits parsed Zoom rows into:
//  - sessionRows: rows on the target session date with a usable email
//  - unmatchable: session-date rows we can't confidently attribute to anyone
function partitionZoomRows(zoomRows) {
  const sessionRows = [];
  const unmatchable = [];

  for (const row of zoomRows) {
    const onSessionDate =
      (row.join && row.join.dateKey === policy.SESSION_DATE_KEY) ||
      (row.leave && row.leave.dateKey === policy.SESSION_DATE_KEY);

    if (!onSessionDate) continue; // different session/date entirely, not our concern

    if (!row.email) {
      unmatchable.push({ ...row, reason: 'No email in Zoom data — cannot match to roster' });
      continue;
    }
    if (!row.join || !row.leave) {
      unmatchable.push({ ...row, reason: 'Unparseable join/leave timestamp' });
      continue;
    }
    sessionRows.push(row);
  }

  return { sessionRows, unmatchable };
}

// Aggregates attended minutes per normalized email, unioning overlapping intervals
// (handles rejoins and multiple simultaneous devices for the same person).
function aggregateAttendedMinutes(sessionRows) {
  const byEmail = new Map();

  for (const row of sessionRows) {
    const clipped = clipToSession(row.join.minutesSinceMidnight, row.leave.minutesSinceMidnight);
    if (!clipped) continue;
    if (!byEmail.has(row.emailNormalized)) byEmail.set(row.emailNormalized, []);
    byEmail.get(row.emailNormalized).push(clipped);
  }

  const attendedMinutesByEmail = new Map();
  for (const [email, intervals] of byEmail.entries()) {
    attendedMinutesByEmail.set(email, unionMinutes(intervals));
  }
  return attendedMinutesByEmail;
}

// roster: array of { name, email, cohort, enrollmentStatus, rowIndex }
// zoomRows: output of parseZoomCsv
function scoreAttendance(roster, zoomRows) {
  const { sessionRows, unmatchable } = partitionZoomRows(zoomRows);
  const attendedMinutesByEmail = aggregateAttendedMinutes(sessionRows);

  const rosterEmailCounts = new Map();
  for (const fellow of roster) {
    const key = fellow.emailNormalized;
    if (!key) continue;
    rosterEmailCounts.set(key, (rosterEmailCounts.get(key) || 0) + 1);
  }

  const results = roster.map((fellow) => {
    if (!fellow.emailNormalized) {
      return {
        ...fellow,
        attendedMinutes: null,
        status: 'Needs Review',
        notes: 'Roster row is missing an email address — cannot match Zoom data.',
      };
    }

    const attended = attendedMinutesByEmail.has(fellow.emailNormalized)
      ? attendedMinutesByEmail.get(fellow.emailNormalized)
      : 0;
    const status = attended >= policy.PRESENT_THRESHOLD_MIN ? 'Present' : 'Absent';

    const notes = [];
    if (!attendedMinutesByEmail.has(fellow.emailNormalized)) {
      notes.push('No Zoom record found for this session.');
    }
    if (rosterEmailCounts.get(fellow.emailNormalized) > 1) {
      notes.push('Duplicate roster entry for this email — please verify roster data.');
    }

    return {
      ...fellow,
      attendedMinutes: attended,
      status,
      notes: notes.join(' '),
    };
  });

  const rosterEmails = new Set(roster.map((f) => f.emailNormalized).filter(Boolean));
  for (const row of sessionRows) {
    if (!rosterEmails.has(row.emailNormalized)) {
      unmatchable.push({ ...row, reason: 'Email not found on roster (guest, staff, or typo?)' });
    }
  }

  return { results, unmatched: unmatchable };
}

module.exports = { scoreAttendance, unionMinutes, clipToSession, partitionZoomRows };
