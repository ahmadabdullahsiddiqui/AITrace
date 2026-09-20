// app.js (browser) — orchestrates the whole analysis client-side:
//   File -> extract (pdf.js/mammoth) -> AI signal + reference verification -> render.
// The document itself never leaves the browser; only citation titles/DOIs are
// sent to the free Crossref/OpenAlex APIs.

import { extractDocument } from './extraction.js';
import { buildReport } from './report.js';
import * as ppl from './perplexity.js';
import { t, bandLabel } from './i18n.js';

export const APP_VERSION = '1.2.3';

const $ = (sel) => document.querySelector(sel);

// Stamp the version into the footer (single source of truth).
const _verEl = document.getElementById('app-version');
if (_verEl) _verEl.textContent = APP_VERSION;

// Service worker: network-first shell so users always get the latest code, plus
// offline support. Auto-reload once when an updated worker takes over.
if ('serviceWorker' in navigator) {
  let _reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_reloading) return;
    _reloading = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// Kept so the opt-in perplexity "deep scan" can re-score the same document.
let currentReport = null;
let currentDocText = '';

const dropzone = $('#dropzone');
const fileInput = $('#file-input');
const browseBtn = $('#browse-btn');
const uploadPanel = $('#upload-panel');
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

// Update the loading overlay: main text, optional sub-line, optional % (0-100).
// Passing no percentage hides the determinate bar (indeterminate spinner only).
function setProgress(text, sub, pct) {
  if (progressText) progressText.textContent = text;
  const subEl = document.getElementById('progress-sub');
  const bar = document.getElementById('progress-bar');
  const fill = document.getElementById('progress-fill');
  if (subEl) subEl.textContent = sub || '';
  if (bar && fill) {
    if (pct == null) {
      bar.classList.add('hidden');
    } else {
      bar.classList.remove('hidden');
      fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    }
  }
}

// Show the loading overlay synchronously the instant a file is chosen, force a
// reflow, then wait for a real paint (two rAFs) before starting heavy work.
function analyze(file) {
  hide(errorBox);
  hide(reportBox);
  reportBox.innerHTML = '';
  setProgress(t('progress.analysing'));
  show(progress);
  void progress.offsetHeight; // force layout now
  // Guarantee the overlay is actually PAINTED before any heavy (possibly
  // main-thread-blocking) work: two animation frames, then a short timeout.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => setTimeout(() => runAnalysis(file), 120))
  );
}

// Keep the loading window on screen for at least this long so it is always seen,
// even when analysis finishes almost instantly (small files).
const MIN_OVERLAY_MS = 700;
async function holdOverlay(sinceMs) {
  const remaining = MIN_OVERLAY_MS - (performance.now() - sinceMs);
  if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
}

async function runAnalysis(file) {
  const shownAt = performance.now();
  try {
    const doc = await extractDocument(file, (p) => {
      if (p && p.phase === 'extract' && p.pages > 1) {
        setProgress(t('progress.analysing'), t('progress.readingPage', { page: p.page, pages: p.pages }), Math.round((p.page / p.pages) * 100));
      }
    });

    if (!doc.text || doc.text.trim().length < 40) {
      throw new Error(t('error.notEnoughText'));
    }

    const sensEl = $('#sensitivity');
    const sensitivity = (sensEl && sensEl.value) || 'high';
    setProgress(t('progress.analysingStyle'));
    await new Promise((r) => setTimeout(r, 0)); // let the overlay paint before sync work
    const started = performance.now();
    // Report focuses on the AI-writing analysis only — skip reference verification.
    const report = await buildReport(doc, file.name, { sensitivity, skipReferences: true });
    report.timings = { totalMs: Math.round(performance.now() - started) };

    currentReport = report;
    currentDocText = doc.text;
    await holdOverlay(shownAt);
    hide(progress);
    renderReport(report);
  } catch (err) {
    await holdOverlay(shownAt);
    hide(progress);
    errorBox.textContent = err.message || String(err);
    show(errorBox);
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function bandClass(band) { return `band-${band || 'unknown'}`; }

// Only allow http(s) links; blocks javascript:/data: hrefs from API-supplied URLs.
function safeUrl(u) {
  if (!u) return null;
  try {
    const parsed = new URL(u, 'https://doi.org');
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}
function num(n) { return n == null ? '—' : Number(n).toLocaleString(); }

function meterClassFor(band) {
  return band === 'high' ? 'meter-fill-high' : band === 'moderate' ? 'meter-fill-moderate' : 'meter-fill-low';
}

function renderReport(r) {
  const s = r.summary;
  const ai = r.aiAnalysis;
  const meterClass = meterClassFor(ai.overallBand);

  // Attach perplexity results (if the deep scan has run) to each flagged section.
  const pplRes = r.perplexity || null;
  if (pplRes) {
    for (const p of ai.flaggedParagraphs) p.ppl = pplRes.byIndex[p.index] || null;
  }
  const combined =
    pplRes && ai.overallSignal != null && pplRes.overallSignal != null
      ? Math.round((ai.overallSignal + pplRes.overallSignal) / 2)
      : null;
  const combinedBand = combined == null ? 'unknown' : combined >= 65 ? 'high' : combined >= 40 ? 'moderate' : 'low';

  reportBox.innerHTML = `
    <section class="panel">
      <div class="report-head">
        <div>
          <h2 class="doc-name">${esc(r.document.filename)}</h2>
          <p class="doc-meta">
            ${r.document.pages ? `${num(r.document.pages)} ${t('report.pages')} · ` : ''}${num(r.document.words)} ${t('report.words')} · ${t('report.analyzedInBrowser')}
          </p>
        </div>
        <div class="actions">
          <span class="band-pill ${bandClass(ai.overallBand)}">${t('report.aiSignal')}: ${bandLabel(ai.overallBand)}</span>
        </div>
      </div>
    </section>

    <section class="panel">
      <h3 class="section-title">${t('report.execSummary')}</h3>
      <div class="cards">
        ${card(t('card.aiWritingSignal'), ai.overallSignal == null ? '—' : `${ai.overallSignal}/100`)}
        ${card(t('card.overallBand'), bandLabel(ai.overallBand))}
        ${card(t('card.strongSections'), num(s.strongSections))}
        ${card(t('card.moderateSections'), num(s.moderateSections))}
        ${card(t('card.sectionsAssessed'), num(s.sectionsAssessed))}
      </div>
    </section>

    <section class="panel">
      <h3 class="section-title">${t('report.aiAuthorship')}</h3>
      <div class="meter"><div class="${meterClass}" style="width:${ai.overallSignal || 0}%"></div></div>
      <div class="meter-label"><span>${t('meter.lower')}</span><span>${ai.overallSignal == null ? t('na') : ai.overallSignal + '/100'}</span><span>${t('meter.higher')}</span></div>
      <p style="margin-top:12px;color:var(--muted);font-size:13.5px">
        ${t('report.counts', {
          high: num(ai.counts.high),
          mod: num(ai.counts.moderate),
          low: num(ai.counts.low),
          n: num(ai.counts.assessed),
          method: esc(ai.method),
          sens: esc(ai.sensitivityLabel || ai.sensitivity || '—'),
        })}
      </p>
      <div class="disclaimer">⚠ ${esc(ai.disclaimer)}</div>
      ${deepScanBlock(pplRes, combined, combinedBand)}
      <h4 style="margin:20px 0 10px;font-size:14px">${t('report.flagged', { n: ai.flaggedParagraphs.length })}</h4>
      ${ai.flaggedParagraphs.length ? ai.flaggedParagraphs.map(paraCard).join('') : `<p style="color:var(--muted)">${t('report.noneFlagged')}</p>`}
    </section>

    <section class="panel">
      <h3 class="section-title">${t('report.methodology')}</h3>
      <p style="font-size:13.5px"><strong>${t('report.aiDetectionLabel')}</strong> ${esc(r.methodology.aiDetection)}</p>
      <p style="font-size:13.5px;color:var(--muted)"><strong>${t('report.limitationsLabel')}</strong> ${esc(r.methodology.limitations)}</p>
    </section>

    <section class="panel">
      <div class="actions">
        <button class="btn" id="print-btn">${t('report.print')}</button>
        <button class="btn secondary" id="again-btn">${t('report.again')}</button>
      </div>
    </section>
  `;

  $('#print-btn').addEventListener('click', () => window.print());
  // Hard reset: a full page reload clears all in-memory state in one click.
  $('#again-btn').addEventListener('click', () => window.location.reload());
  const deepBtn = $('#deepscan-btn');
  if (deepBtn) deepBtn.addEventListener('click', runDeepScan);

  if (uploadPanel) hide(uploadPanel); // report stands alone; upload returns on reset
  show(reportBox);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

// Opt-in second signal: load distilgpt2 in-browser and score each assessed
// section by perplexity, then re-render with a combined signal.
async function runDeepScan() {
  const btn = $('#deepscan-btn');
  const statusEl = $('#deepscan-status');
  if (!currentReport || !btn) return;
  btn.disabled = true;
  const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };

  try {
    if (!ppl.isReady()) {
      setStatus(t('deep.loading'));
      await ppl.loadModel((e) => {
        if (e && e.status === 'progress' && e.total) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setStatus(t('deep.downloading', { pct, file: (e.file || '').split('/').pop() || '' }));
        }
      });
    }
    const indices = currentReport.aiAnalysis.allParagraphs.filter((p) => p.signal != null).map((p) => p.index);
    setStatus(t('deep.scoring', { n: indices.length }));
    const result = await ppl.analyzePerplexity(currentDocText, indices, (done, total) => {
      setStatus(t('deep.scoringProgress', { done, total }));
    });
    currentReport.perplexity = result;
    renderReport(currentReport);
  } catch (err) {
    setStatus(t('deep.failed', { msg: err.message || err }));
    btn.disabled = false;
  }
}

function deepScanBlock(pplRes, combined, combinedBand) {
  if (!pplRes) {
    return `
      <div class="deepscan">
        <div>
          <strong>${t('deep.title')}</strong>
          <p class="deepscan-note">${t('deep.note')}</p>
        </div>
        <div class="deepscan-action">
          <button class="btn" id="deepscan-btn">${t('deep.run')}</button>
          <span id="deepscan-status" class="deepscan-status"></span>
        </div>
      </div>`;
  }
  const mc = meterClassFor(pplRes.overallBand);
  const cc = meterClassFor(combinedBand);
  return `
    <div class="deepscan done">
      <div class="deepscan-signals">
        <div class="ds-sig">
          <div class="ds-label">${t('deep.perplexitySignal')} <span class="band-pill ${bandClass(pplRes.overallBand)}">${bandLabel(pplRes.overallBand)}</span></div>
          <div class="meter"><div class="${mc}" style="width:${pplRes.overallSignal || 0}%"></div></div>
          <div class="meter-label"><span>${pplRes.overallSignal == null ? t('na') : pplRes.overallSignal + '/100'}</span><span>${esc(pplRes.model)}</span></div>
        </div>
        <div class="ds-sig">
          <div class="ds-label">${t('deep.combinedSignal')} <span class="band-pill ${bandClass(combinedBand)}">${bandLabel(combinedBand)}</span></div>
          <div class="meter"><div class="${cc}" style="width:${combined || 0}%"></div></div>
          <div class="meter-label"><span>${combined == null ? t('na') : combined + '/100'}</span><span>${t('deep.heuristicPlusPpl')}</span></div>
        </div>
      </div>
      <div class="disclaimer">⚠ ${esc(pplRes.disclaimer)}</div>
    </div>`;
}

function card(k, v) {
  return `<div class="card"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`;
}

function paraCard(p) {
  const pp = p.ppl && p.ppl.signal != null ? p.ppl : null;
  const pplLine = pp
    ? `<div class="para-ppl">${t('report.perplexityLine', {
        ppl: `<strong>${pp.perplexity}</strong>`,
        pill: `<span class="band-pill ${bandClass(pp.band)}">${pp.signal}/100</span>`,
        tokens: pp.tokens,
      })}</div>`
    : '';
  return `
    <div class="para ${p.band}">
      <div class="para-head">
        <span class="sig">${t('report.section', { n: p.index + 1 })} · <span class="band-pill ${bandClass(p.band)}">${bandLabel(p.band)}</span></span>
        <span class="sig">${t('report.heuristic', { n: p.signal })}</span>
      </div>
      <p class="para-text">${esc(p.preview)}</p>
      ${pplLine}
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
      const url = m ? safeUrl(m.url) : null;
      const matchLine = m
        ? `<div class="ref-match">Match (${esc(m.source)}, ${Math.round((m.titleSimilarity || 0) * 100)}% title): ${esc(m.title || '—')}${m.year ? ` (${m.year})` : ''}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">record</a>` : ''}</div>`
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
