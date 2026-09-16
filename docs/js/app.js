// app.js (browser) — orchestrates the whole analysis client-side:
//   File -> extract (pdf.js/mammoth) -> AI signal + reference verification -> render.
// The document itself never leaves the browser; only citation titles/DOIs are
// sent to the free Crossref/OpenAlex APIs.

import { extractDocument } from './extraction.js';
import { buildReport } from './report.js';

const $ = (sel) => document.querySelector(sel);

const dropzone = $('#dropzone');
const fileInput = $('#file-input');
const browseBtn = $('#browse-btn');
const progress = $('#progress');
const progressText = $('#progress-text');
const errorBox = $('#error');
const reportBox = $('#report');

browseBtn.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('click', (e) => {
  if (e.target !== browseBtn) fileInput.click();
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) analyze(fileInput.files[0]);
});

['dragenter', 'dragover'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add('drag');
  })
);
['dragleave', 'drop'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag');
  })
);
dropzone.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0];
  if (f) analyze(f);
});

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

async function analyze(file) {
  hide(errorBox);
  hide(reportBox);
  reportBox.innerHTML = '';
  show(progress);

  try {
    progressText.textContent = `Reading "${file.name}"…`;
    const doc = await extractDocument(file);

    if (!doc.text || doc.text.trim().length < 40) {
      throw new Error('Could not extract enough text (the file may be scanned/image-only).');
    }

    progressText.textContent = 'Analyzing writing style & verifying references…';
    const started = performance.now();
    const report = await buildReport(doc, file.name);
    report.timings = { totalMs: Math.round(performance.now() - started) };

    hide(progress);
    renderReport(report);
  } catch (err) {
    hide(progress);
    errorBox.textContent = err.message || String(err);
    show(errorBox);
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function bandClass(band) { return `band-${band || 'unknown'}`; }
function num(n) { return n == null ? '—' : Number(n).toLocaleString(); }

function renderReport(r) {
  const s = r.summary;
  const ai = r.aiAnalysis;
  const meterClass =
    ai.overallBand === 'high' ? 'meter-fill-high' : ai.overallBand === 'moderate' ? 'meter-fill-moderate' : 'meter-fill-low';

  reportBox.innerHTML = `
    <section class="panel">
      <div class="report-head">
        <div>
          <h2 class="doc-name">${esc(r.document.filename)}</h2>
          <p class="doc-meta">
            ${r.document.pages ? `${num(r.document.pages)} pages · ` : ''}${num(r.document.words)} words · analyzed in your browser
          </p>
        </div>
        <div class="actions">
          <span class="band-pill ${bandClass(ai.overallBand)}">AI signal: ${ai.overallBand}</span>
        </div>
      </div>
    </section>

    <section class="panel">
      <h3 class="section-title">Executive Summary</h3>
      <div class="cards">
        ${card('AI writing signal', ai.overallSignal == null ? '—' : `${ai.overallSignal}/100`)}
        ${card('Strong sections', num(s.strongSections))}
        ${card('Moderate sections', num(s.moderateSections))}
        ${card('Sections assessed', num(s.sectionsAssessed))}
        ${card('References found', num(s.referencesDetected))}
        ${card('Verified', num(s.referencesVerified))}
        ${card('Partial', num(s.referencesPartial))}
        ${card('Problem refs', num(s.referencesProblem))}
      </div>
    </section>

    <section class="panel">
      <h3 class="section-title">AI Authorship Analysis</h3>
      <div class="meter"><div class="${meterClass}" style="width:${ai.overallSignal || 0}%"></div></div>
      <div class="meter-label"><span>Lower signal</span><span>${ai.overallSignal == null ? 'n/a' : ai.overallSignal + '/100'}</span><span>Higher signal</span></div>
      <p style="margin-top:12px;color:var(--muted);font-size:13.5px">
        ${num(ai.counts.high)} strong · ${num(ai.counts.moderate)} moderate · ${num(ai.counts.low)} low
        across ${num(ai.counts.assessed)} assessed sections (method: ${esc(ai.method)}).
      </p>
      <div class="disclaimer">⚠ ${esc(ai.disclaimer)}</div>
      <h4 style="margin:20px 0 10px;font-size:14px">Flagged sections (${ai.flaggedParagraphs.length})</h4>
      ${ai.flaggedParagraphs.length ? ai.flaggedParagraphs.map(paraCard).join('') : '<p style="color:var(--muted)">No sections reached the moderate/high threshold.</p>'}
    </section>

    <section class="panel">
      <h3 class="section-title">Reference Validation</h3>
      ${renderRefs(r.references)}
    </section>

    <section class="panel">
      <h3 class="section-title">Methodology &amp; Limitations</h3>
      <p style="font-size:13.5px"><strong>AI detection.</strong> ${esc(r.methodology.aiDetection)}</p>
      <p style="font-size:13.5px"><strong>Reference verification.</strong> ${esc(r.methodology.referenceVerification)}</p>
      <p style="font-size:13.5px;color:var(--muted)"><strong>Limitations.</strong> ${esc(r.methodology.limitations)}</p>
    </section>

    <section class="panel">
      <div class="actions">
        <button class="btn" id="print-btn">Save / print report (PDF)</button>
        <button class="btn secondary" id="again-btn">Analyze another document</button>
      </div>
    </section>
  `;

  $('#print-btn').addEventListener('click', () => window.print());
  $('#again-btn').addEventListener('click', () => {
    hide(reportBox);
    reportBox.innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  show(reportBox);
  reportBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function card(k, v) {
  return `<div class="card"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`;
}

function paraCard(p) {
  return `
    <div class="para ${p.band}">
      <div class="para-head">
        <span class="sig">Section ${p.index + 1} · <span class="band-pill ${bandClass(p.band)}">${p.band}</span></span>
        <span class="sig">${p.signal}/100</span>
      </div>
      <p class="para-text">${esc(p.preview)}</p>
      ${p.reasons && p.reasons.length ? `<ul class="reasons">${p.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    </div>`;
}

function renderRefs(refs) {
  if (!refs.total) return '<p style="color:var(--muted)">No references detected in this document.</p>';
  const c = refs.counts;
  const summary = `<p style="color:var(--muted);font-size:13px;margin-bottom:12px">
      ${c.verified} verified · ${c.partial} partial · ${c.not_found} not found ·
      ${c.possible_hallucination} possible hallucination · ${c.doi_invalid} DOI invalid</p>`;

  const rows = refs.references
    .map((r, i) => {
      const m = r.match;
      const matchLine = m
        ? `<div class="ref-match">Match (${esc(m.source)}, ${Math.round((m.titleSimilarity || 0) * 100)}% title): ${esc(m.title || '—')}${m.year ? ` (${m.year})` : ''}${m.url ? ` · <a href="${esc(m.url)}" target="_blank" rel="noopener">record</a>` : ''}</div>`
        : '';
      return `
      <tr>
        <td>${i + 1}</td>
        <td><span class="status st-${r.status}">${esc(labelFor(r.status))}</span></td>
        <td>
          <div class="ref-entry">${esc(r.entry.length > 220 ? r.entry.slice(0, 217) + '…' : r.entry)}</div>
          ${matchLine}
        </td>
      </tr>`;
    })
    .join('');

  return `${summary}<div class="table-wrap"><table>
    <thead><tr><th>#</th><th>Status</th><th>Reference</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function labelFor(status) {
  return {
    verified: '✓ Verified',
    partial: '⚠ Partial',
    not_found: '❌ Not found',
    possible_hallucination: '⚠ Possible hallucination',
    doi_invalid: '⚠ DOI invalid',
    error: '⚠ Error',
  }[status] || status;
}
