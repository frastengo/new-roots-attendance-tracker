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

// Uploading only happens via the form's POST; a GET here means someone refreshed
// the results page or used the browser back/forward buttons — send them home
// instead of showing Express's raw "Cannot GET" error page.
app.get('/upload', (req, res) => {
  res.redirect('/');
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

// Any other unrecognized URL: send the user home instead of a raw Express error.
app.use((req, res) => {
  res.redirect('/');
});

function layout(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Albert+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --nr-charcoal: #1c1d20;
    --nr-green: #89dc65;
    --nr-green-dark: #3d7a1f;
    --nr-green-tint: #eaffbb;
    --nr-blue: #1c5cf5;
    --nr-blue-dark: #123fab;
    --nr-purple: #751ce8;
    --nr-yellow: #ffdb00;
    --nr-pink: #d90870;
    --nr-pink-tint: #fde3ef;
    --nr-pink-dark: #a30b5b;
    --nr-yellow-tint: #fff6cc;
    --nr-yellow-dark: #8a6d00;
    --nr-ink: #1c1d20;
    --nr-muted: #6b6f76;
    --nr-bg: #f5f6f8;
    --nr-border: #e3e5e9;
  }
  * { box-sizing: border-box; }
  body {
    font-family: 'Albert Sans', -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    margin: 0; padding: 0;
    color: var(--nr-ink);
    background: var(--nr-bg);
    line-height: 1.55;
  }
  header.nr-header {
    background: var(--nr-charcoal);
    color: #fff;
    padding: 22px 28px 20px;
  }
  .nr-header-inner {
    max-width: 880px;
    margin: 0 auto;
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }
  .nr-wordmark { font-weight: 800; font-size: 1.25rem; letter-spacing: -0.01em; }
  .nr-wordmark span { color: var(--nr-green); }
  .nr-tagline { color: #c7c9cf; font-weight: 500; font-size: 0.95rem; }
  .nr-stripe { height: 5px; display: flex; }
  .nr-stripe div { flex: 1; }
  main { max-width: 880px; margin: 0 auto; padding: 36px 24px 64px; }
  h1 { font-size: 1.6rem; font-weight: 800; margin: 0 0 8px; letter-spacing: -0.01em; }
  p { color: #3a3c40; }
  .lede { color: var(--nr-muted); max-width: 62ch; }
  .card {
    background: #fff;
    border: 1px solid var(--nr-border);
    border-radius: 16px;
    padding: 28px;
    margin-top: 24px;
    box-shadow: 0 1px 2px rgba(20,20,30,0.03);
  }
  .step { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 20px; }
  .step:last-child { margin-bottom: 0; }
  .step-num {
    flex: none; width: 28px; height: 28px; border-radius: 50%;
    background: var(--nr-blue); color: #fff; font-weight: 700; font-size: 0.85rem;
    display: flex; align-items: center; justify-content: center; margin-top: 2px;
  }
  .step-body { flex: 1; }
  .step-body label { font-weight: 700; display: block; margin-bottom: 10px; }
  #dropzone {
    border: 2px dashed #c7cbd3;
    border-radius: 12px;
    padding: 28px 20px;
    text-align: center;
    background: #fafbfc;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  #dropzone:hover, #dropzone.dragover { border-color: var(--nr-blue); background: #f0f5ff; }
  #dropzone .dz-title { font-weight: 600; }
  #dropzone .dz-sub { color: var(--nr-muted); font-size: 0.88rem; margin-top: 4px; }
  #dropzone .dz-filename { margin-top: 10px; font-weight: 600; color: var(--nr-blue); word-break: break-all; }
  input[type=file] { display: none; }
  button, a.button-link {
    background: var(--nr-blue); color: #fff; border: none;
    padding: 12px 22px; border-radius: 999px; font-size: 1rem; font-weight: 700;
    cursor: pointer; font-family: inherit; display: inline-block; text-decoration: none;
    transition: background 0.15s ease, opacity 0.15s ease;
  }
  button:hover, a.button-link:hover { background: #1548d1; }
  button:disabled { background: #b9c3d6; cursor: not-allowed; }
  button.secondary, a.button-link.secondary { background: #fff; color: var(--nr-ink); border: 1px solid var(--nr-border); }
  button.secondary:hover, a.button-link.secondary:hover { background: #f2f3f5; }
  .actions { margin-top: 22px; display: flex; gap: 10px; flex-wrap: wrap; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; font-size: 0.92rem; }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--nr-border); }
  th { background: #fafbfc; font-weight: 700; color: #45484e; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; }
  th.sortable { cursor: pointer; user-select: none; }
  th.sortable:hover { color: var(--nr-blue); }
  .sort-arrow { font-size: 0.7rem; color: var(--nr-blue); }
  tbody tr:hover { background: #fafbfc; }
  .table-controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 26px; flex-wrap: wrap; }
  #tableSearch {
    flex: 1; min-width: 220px; max-width: 360px;
    padding: 10px 14px; border: 1px solid var(--nr-border); border-radius: 999px;
    font-family: inherit; font-size: 0.95rem; background: #fff;
  }
  #tableSearch:focus { outline: none; border-color: var(--nr-blue); box-shadow: 0 0 0 3px rgba(28,92,245,0.12); }
  .table-count { color: var(--nr-muted); font-size: 0.88rem; }
  .pagination { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 18px; }
  .pagination button { padding: 8px 16px; font-size: 0.9rem; }
  .table-wrap { overflow-x: auto; border: 1px solid var(--nr-border); border-radius: 12px; margin-top: 20px; }
  .table-wrap table { margin-top: 0; }
  .table-wrap th:first-child, .table-wrap td:first-child { padding-left: 16px; }
  .badge {
    display: inline-block; padding: 3px 12px; border-radius: 999px;
    font-weight: 700; font-size: 0.82rem; white-space: nowrap;
  }
  .badge-present { background: var(--nr-green-tint); color: var(--nr-green-dark); }
  .badge-absent { background: var(--nr-pink-tint); color: var(--nr-pink-dark); }
  .badge-needs-review { background: var(--nr-yellow-tint); color: var(--nr-yellow-dark); }
  .summary-row { display: flex; gap: 22px; flex-wrap: wrap; margin: 18px 0 6px; }
  .summary-stat { }
  .summary-stat .num { font-size: 1.7rem; font-weight: 800; line-height: 1; }
  .summary-stat .label { color: var(--nr-muted); font-size: 0.85rem; margin-top: 4px; }
  .error {
    background: var(--nr-pink-tint); border: 1px solid #f6b6d3; color: var(--nr-pink-dark);
    padding: 14px 16px; border-radius: 10px; margin-top: 18px; font-weight: 500;
  }
  .muted { color: var(--nr-muted); font-size: 0.9rem; }
  .callout {
    background: #f0f5ff; border: 1px solid #d7e3ff; color: #14306b;
    padding: 14px 16px; border-radius: 10px; margin-top: 20px; font-size: 0.92rem;
  }
  footer { max-width: 880px; margin: 0 auto; padding: 0 24px 40px; color: var(--nr-muted); font-size: 0.82rem; }
</style>
</head>
<body>
  <header class="nr-header">
    <div class="nr-header-inner">
      <div class="nr-wordmark">New <span>Roots</span></div>
      <div class="nr-tagline">Attendance Tracker</div>
    </div>
  </header>
  <div class="nr-stripe" aria-hidden="true">
    <div style="background:#89dc65"></div>
    <div style="background:#1c5cf5"></div>
    <div style="background:#751ce8"></div>
    <div style="background:#ffdb00"></div>
    <div style="background:#d90870"></div>
  </div>
  <main>${body}</main>
  <footer>New Roots Institute &middot; Internal staff tool</footer>
</body>
</html>`;
}

function renderUploadPage(error) {
  return layout(
    'New Roots Attendance Tracker',
    `
    <h1>Attendance Tracker</h1>
    <p class="lede">Upload the Zoom attendance report for the <strong>August&nbsp;26, 5:00–6:30&nbsp;PM</strong> fellowship session. This automatically scores attendance and updates the Fellow roster Google Sheet — no manual comparison needed.</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    <div class="card">
      <form action="/upload" method="post" enctype="multipart/form-data" id="uploadForm">
        <div class="step">
          <div class="step-num">1</div>
          <div class="step-body">
            <label for="zoomCsv">Choose the Zoom attendance CSV file</label>
            <div id="dropzone">
              <div class="dz-title">Drag and drop the CSV here, or click to browse</div>
              <div class="dz-sub">Exported from Zoom as a .csv file</div>
              <div class="dz-filename" id="dzFilename"></div>
            </div>
            <input type="file" id="zoomCsv" name="zoomCsv" accept=".csv" required>
          </div>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <div class="step-body">
            <label>Click the button to score attendance</label>
            <button type="submit" id="submitBtn" disabled>Upload &amp; Score Attendance</button>
          </div>
        </div>
      </form>
    </div>
    <p class="muted" style="margin-top:18px;">A Fellow who misses more than 10 minutes of the 90-minute session is marked Absent. Results are written directly into the roster Google Sheet, in new "Attendance Status", "Minutes Attended", and "Notes" columns. Anything that can't be matched to a Fellow is listed separately for review, never silently dropped.</p>
    <script>
      const dz = document.getElementById('dropzone');
      const input = document.getElementById('zoomCsv');
      const filenameEl = document.getElementById('dzFilename');
      const submitBtn = document.getElementById('submitBtn');

      function showFile(file) {
        if (!file) return;
        filenameEl.textContent = 'Selected: ' + file.name;
        submitBtn.disabled = false;
      }

      dz.addEventListener('click', () => input.click());
      input.addEventListener('change', () => showFile(input.files[0]));

      ['dragenter', 'dragover'].forEach((evt) =>
        dz.addEventListener(evt, (e) => { e.preventDefault(); dz.classList.add('dragover'); })
      );
      ['dragleave', 'drop'].forEach((evt) =>
        dz.addEventListener(evt, (e) => { e.preventDefault(); dz.classList.remove('dragover'); })
      );
      dz.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files[0];
        if (file) {
          input.files = e.dataTransfer.files;
          showFile(file);
        }
      });

      document.getElementById('uploadForm').addEventListener('submit', () => {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Scoring attendance…';
      });
    </script>
    `
  );
}

function renderResultsPage(results, unmatched) {
  const presentCount = results.filter((r) => r.status === 'Present').length;
  const absentCount = results.filter((r) => r.status === 'Absent').length;
  const reviewCount = results.filter((r) => r.status === 'Needs Review').length;

  const badgeClass = (status) => `badge badge-${status.toLowerCase().replace(' ', '-')}`;

  const rows = results
    .map(
      (r) => `<tr data-search="${escapeHtml(`${r.name} ${r.email}`.toLowerCase())}"
                  data-sort-name="${escapeHtml(r.name.toLowerCase())}"
                  data-sort-email="${escapeHtml(r.email.toLowerCase())}"
                  data-sort-status="${escapeHtml(r.status)}"
                  data-sort-minutes="${r.attendedMinutes === null ? -1 : r.attendedMinutes}">
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.email)}</td>
      <td><span class="${badgeClass(r.status)}">${r.status}</span></td>
      <td>${r.attendedMinutes === null ? '—' : r.attendedMinutes}</td>
      <td class="muted">${escapeHtml(r.notes || '')}</td>
    </tr>`
    )
    .join('');

  const csvBase64 = Buffer.from(toCsv(results)).toString('base64');

  return layout(
    'Results — Attendance Tracker',
    `
    <h1>Attendance Results</h1>
    <p class="lede">The roster Google Sheet has been updated with the results below.</p>

    <div class="summary-row">
      <div class="summary-stat"><div class="num" style="color:var(--nr-green-dark)">${presentCount}</div><div class="label">Present</div></div>
      <div class="summary-stat"><div class="num" style="color:var(--nr-pink-dark)">${absentCount}</div><div class="label">Absent</div></div>
      ${reviewCount ? `<div class="summary-stat"><div class="num" style="color:var(--nr-yellow-dark)">${reviewCount}</div><div class="label">Needs Review</div></div>` : ''}
    </div>

    ${
      unmatched.length > 0
        ? `<div class="callout">${unmatched.length} Zoom entr${unmatched.length === 1 ? 'y was' : 'ies were'} not on the roster (guests, blank names, or unmatched emails) — see the <strong>"Unmatched Zoom Entries"</strong> tab in the Google Sheet to review them.</div>`
        : ''
    }

    <div class="actions">
      <a class="button-link" href="data:text/csv;base64,${csvBase64}" download="attendance_results.csv">Download results as CSV</a>
      <a class="button-link secondary" href="/">Upload another file</a>
    </div>

    <div class="table-controls">
      <input type="text" id="tableSearch" placeholder="Search by name or email…">
      <div class="table-count" id="tableCount"></div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="sortable" data-sort-key="name">Name <span class="sort-arrow"></span></th>
            <th class="sortable" data-sort-key="email">Email <span class="sort-arrow"></span></th>
            <th class="sortable" data-sort-key="status">Status <span class="sort-arrow"></span></th>
            <th class="sortable" data-sort-key="minutes">Minutes Attended <span class="sort-arrow"></span></th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody id="resultsBody">${rows}</tbody>
      </table>
    </div>

    <div class="pagination" id="pagination">
      <button type="button" class="secondary" id="prevPage">&larr; Previous</button>
      <span id="pageInfo" class="muted"></span>
      <button type="button" class="secondary" id="nextPage">Next &rarr;</button>
    </div>

    <script>
      (function () {
        const PAGE_SIZE = 20;
        const searchInput = document.getElementById('tableSearch');
        let allRows = Array.from(document.querySelectorAll('#resultsBody tr'));
        const countEl = document.getElementById('tableCount');
        const pageInfoEl = document.getElementById('pageInfo');
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');

        let currentPage = 0;
        let sortKey = null;
        let sortDir = 1; // 1 = ascending, -1 = descending

        function applySort() {
          if (!sortKey) return;
          const tbody = document.getElementById('resultsBody');
          const key = 'sort' + sortKey.charAt(0).toUpperCase() + sortKey.slice(1);

          // Mutate allRows itself (not a copy) so filtering/pagination downstream
          // reflects the new order, not just the DOM's visual order.
          allRows.sort((a, b) => {
            let av = a.dataset[key];
            let bv = b.dataset[key];
            if (sortKey === 'minutes') { av = Number(av); bv = Number(bv); }
            if (av < bv) return -1 * sortDir;
            if (av > bv) return 1 * sortDir;
            return 0;
          });
          tbody.append(...allRows);

          document.querySelectorAll('th.sortable .sort-arrow').forEach((el) => { el.textContent = ''; });
          const activeArrow = document.querySelector('th[data-sort-key="' + sortKey + '"] .sort-arrow');
          if (activeArrow) activeArrow.textContent = sortDir === 1 ? '▲' : '▼';
        }

        document.querySelectorAll('th.sortable').forEach((th) => {
          th.addEventListener('click', () => {
            const key = th.dataset.sortKey;
            sortDir = sortKey === key ? sortDir * -1 : 1;
            sortKey = key;
            applySort();
            currentPage = 0;
            render();
          });
        });

        function getFiltered() {
          const term = searchInput.value.trim().toLowerCase();
          return allRows.filter((row) => !term || row.dataset.search.includes(term));
        }

        function render() {
          const filtered = getFiltered();
          const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
          currentPage = Math.min(currentPage, totalPages - 1);
          const start = currentPage * PAGE_SIZE;
          const end = start + PAGE_SIZE;

          allRows.forEach((row) => { row.style.display = 'none'; });
          filtered.slice(start, end).forEach((row) => { row.style.display = ''; });

          countEl.textContent = filtered.length + (filtered.length === 1 ? ' person' : ' people');
          pageInfoEl.textContent = filtered.length === 0
            ? 'No matches'
            : 'Page ' + (currentPage + 1) + ' of ' + totalPages;
          prevBtn.disabled = currentPage === 0;
          nextBtn.disabled = currentPage >= totalPages - 1;
        }

        searchInput.addEventListener('input', () => { currentPage = 0; render(); });
        prevBtn.addEventListener('click', () => { currentPage--; render(); });
        nextBtn.addEventListener('click', () => { currentPage++; render(); });

        render();
      })();
    </script>
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
