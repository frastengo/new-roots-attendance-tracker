require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { parseZoomCsv } = require('./lib/parseZoomCsv');
const { scoreAttendance } = require('./lib/scoreAttendance');
const { readRoster, writeResults } = require('./lib/sheetsClient');
const policy = require('./lib/policy');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const SPREADSHEET_ID = process.env.SHEET_ID;

app.get('/', (req, res) => {
  res.send(renderUploadPage());
});

app.post('/upload', upload.single('zoomCsv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send(renderUploadPage('Please choose a CSV file before uploading.'));
    }
    if (!SPREADSHEET_ID) {
      return res.status(500).send(renderUploadPage('Server is not configured with a Sheet ID. Contact the administrator.'));
    }

    const csvText = req.file.buffer.toString('utf8');
    const zoomRows = parseZoomCsv(csvText);

    const { rosterTabTitle, header, roster } = await readRoster(SPREADSHEET_ID);
    const { results, unmatched } = scoreAttendance(roster, zoomRows);

    await writeResults({ spreadsheetId: SPREADSHEET_ID, rosterTabTitle, header, results, unmatched });

    res.send(renderResultsPage(results, unmatched));
  } catch (err) {
    console.error(err);
    res.status(500).send(renderUploadPage(`Something went wrong: ${err.message}`));
  }
});

app.get('/health', (req, res) => res.send('ok'));

function layout(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.5; }
  h1 { font-size: 1.5rem; }
  .card { border: 1px solid #ddd; border-radius: 10px; padding: 24px; margin-top: 20px; }
  input[type=file] { display: block; margin: 16px 0; }
  button { background: #2b6cb0; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 1rem; cursor: pointer; }
  button:hover { background: #245a94; }
  table { border-collapse: collapse; width: 100%; margin-top: 16px; font-size: 0.9rem; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
  th { background: #f4f4f4; }
  .status-present { color: #22863a; font-weight: 600; }
  .status-absent { color: #cb2431; font-weight: 600; }
  .status-review { color: #b08800; font-weight: 600; }
  .error { background: #fdecea; border: 1px solid #f5c2c0; color: #7a1f1a; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; }
  .muted { color: #666; font-size: 0.9rem; }
  a.button-link { display: inline-block; margin-top: 12px; background: #2b6cb0; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; }
</style>
</head>
<body>${body}</body>
</html>`;
}

function renderUploadPage(error) {
  return layout(
    'New Roots Attendance Tracker',
    `
    <h1>Attendance Tracker</h1>
    <p>Upload the Zoom attendance report (CSV) for the <strong>August 26, 5:00–6:30 PM</strong> fellowship session. This will automatically score attendance and update the Fellow roster Google Sheet.</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    <div class="card">
      <form action="/upload" method="post" enctype="multipart/form-data">
        <label for="zoomCsv"><strong>Step 1:</strong> Choose the Zoom attendance CSV file</label>
        <input type="file" id="zoomCsv" name="zoomCsv" accept=".csv" required>
        <label><strong>Step 2:</strong> Click the button below</label>
        <button type="submit">Upload &amp; Score Attendance</button>
      </form>
    </div>
    <p class="muted">A Fellow who misses more than 10 minutes of the 90-minute session is marked Absent. Results are written directly into the roster Google Sheet, in new "Attendance Status", "Minutes Attended", and "Notes" columns.</p>
    `
  );
}

function renderResultsPage(results, unmatched) {
  const presentCount = results.filter((r) => r.status === 'Present').length;
  const absentCount = results.filter((r) => r.status === 'Absent').length;
  const reviewCount = results.filter((r) => r.status === 'Needs Review').length;

  const rows = results
    .map(
      (r) => `<tr>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.email)}</td>
      <td class="status-${r.status.toLowerCase().replace(' ', '-')}">${r.status}</td>
      <td>${r.attendedMinutes === null ? '—' : r.attendedMinutes}</td>
      <td>${escapeHtml(r.notes || '')}</td>
    </tr>`
    )
    .join('');

  const csvBase64 = Buffer.from(toCsv(results)).toString('base64');

  return layout(
    'Results — Attendance Tracker',
    `
    <h1>Attendance Results</h1>
    <p><strong>${presentCount}</strong> Present · <strong>${absentCount}</strong> Absent${reviewCount ? ` · <strong>${reviewCount}</strong> Needs Review` : ''}</p>
    <p>The roster Google Sheet has been updated. ${unmatched.length > 0 ? `${unmatched.length} Zoom entr${unmatched.length === 1 ? 'y was' : 'ies were'} not on the roster — see the "Unmatched Zoom Entries" tab in the Sheet.` : ''}</p>
    <a class="button-link" href="data:text/csv;base64,${csvBase64}" download="attendance_results.csv">Download results as CSV</a>
    <a class="button-link" style="background:#555; margin-left:8px;" href="/">Upload another file</a>
    <table>
      <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Minutes Attended</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    `
  );
}

function toCsv(results) {
  const header = ['Name', 'Email', 'Attendance Status', 'Minutes Attended', 'Notes'];
  const lines = [header.join(',')];
  for (const r of results) {
    const fields = [r.name, r.email, r.status, r.attendedMinutes === null ? '' : r.attendedMinutes, r.notes || ''];
    lines.push(fields.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Attendance Tracker running on port ${PORT}`));
