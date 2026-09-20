const { google } = require('googleapis');

function getAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2Client;
}

function getSheetsApi() {
  return google.sheets({ version: 'v4', auth: getAuthClient() });
}

// Reads the roster from the first tab of the spreadsheet.
// Expected columns: Fellow Name, Email, Cohort, Enrollment Status (extra columns are ignored).
async function readRoster(spreadsheetId) {
  const sheets = getSheetsApi();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const rosterTabTitle = meta.data.sheets[0].properties.title;

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${rosterTabTitle}!A1:Z`,
  });

  const rows = data.values || [];
  const header = rows[0] || [];
  const nameCol = header.findIndex((h) => /fellow.*name|^name$/i.test(h));
  const emailCol = header.findIndex((h) => /email/i.test(h));

  if (nameCol === -1 || emailCol === -1) {
    throw new Error(
      `Could not find "Fellow Name" and "Email" columns in the roster sheet's header row (found: ${header.join(', ')})`
    );
  }

  const roster = rows.slice(1).map((row, i) => {
    const name = (row[nameCol] || '').trim();
    const email = (row[emailCol] || '').trim();
    return {
      rowIndex: i + 2, // actual sheet row number
      name,
      email,
      emailNormalized: email.toLowerCase(),
    };
  });

  return { rosterTabTitle, header, roster };
}

// Writes attendance results back into the roster tab (adds/overwrites Attendance Status,
// Minutes Attended, and Notes columns) and replaces the "Unmatched Zoom Entries" tab.
async function writeResults({ spreadsheetId, rosterTabTitle, header, results, unmatched }) {
  const sheets = getSheetsApi();

  // Reuse existing result columns if already present (idempotent re-uploads), else append new ones.
  const findOrAppendCol = (label) => {
    const existing = header.findIndex((h) => h === label);
    if (existing !== -1) return existing;
    header.push(label);
    return header.length - 1;
  };

  const statusCol = findOrAppendCol('Attendance Status');
  const minutesCol = findOrAppendCol('Minutes Attended (Aug 26 session)');
  const notesCol = findOrAppendCol('Notes');

  const colLetter = (i) => String.fromCharCode('A'.charCodeAt(0) + i);
  const lastCol = colLetter(header.length - 1);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${rosterTabTitle}!A1:${lastCol}1`,
    valueInputOption: 'RAW',
    requestBody: { values: [header] },
  });

  const dataRows = results.map((r) => {
    const row = new Array(header.length).fill('');
    row[statusCol] = r.status;
    row[minutesCol] = r.attendedMinutes === null ? '' : r.attendedMinutes;
    row[notesCol] = r.notes;
    return { rowIndex: r.rowIndex, row };
  });

  // Sparse per-row update so we only touch the new columns, leaving existing data untouched.
  const requests = dataRows.map(({ rowIndex, row }) => ({
    range: `${rosterTabTitle}!${colLetter(statusCol)}${rowIndex}:${lastCol}${rowIndex}`,
    values: [[row[statusCol], row[minutesCol], row[notesCol]]],
  }));

  if (requests.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data: requests },
    });
  }

  await writeUnmatchedTab(sheets, spreadsheetId, unmatched);
}

async function writeUnmatchedTab(sheets, spreadsheetId, unmatched) {
  const tabTitle = 'Unmatched Zoom Entries';
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  let sheet = meta.data.sheets.find((s) => s.properties.title === tabTitle);

  if (!sheet) {
    const addResult = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tabTitle } } }] },
    });
    sheet = addResult.data.replies[0].addSheet;
  }

  const header = ['Name (from Zoom)', 'Email (from Zoom)', 'Join Time', 'Leave Time', 'Duration (min)', 'Reason'];
  const rows = unmatched.map((u) => [u.name || '', u.email || '', u.joinRaw || '', u.leaveRaw || '', u.durationRaw || '', u.reason || '']);

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${tabTitle}!A1:Z`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabTitle}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [header, ...rows] },
  });
}

module.exports = { readRoster, writeResults };
