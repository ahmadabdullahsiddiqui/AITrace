// i18n.js — tiny, dependency-free internationalisation for AITrace.
//
// Two languages: English (en) and German (de). The chosen language is stored in
// localStorage and also drives <html lang>. Static markup is translated via
// data-i18n* attributes; dynamically rendered strings (report, detection, gate)
// call t() at render time. Changing language triggers a reload so every string —
// including already-rendered content — is regenerated consistently.

const LANGS = ['en', 'de'];

const STRINGS = {
  en: {
    // Language switcher (accessible labels)
    'lang.en': 'English',
    'lang.de': 'Deutsch',
    'lang.aria': 'Language',

    // Access gate
    'gate.enter': 'Enter access code',
    'gate.unlock': 'Unlock',
    'gate.aria': 'Access code',
    'gate.checking': 'Checking…',
    'gate.incorrect': 'Incorrect code',
    'gate.incorrectOne': 'Incorrect code ({n} attempt left)',
    'gate.incorrectMany': 'Incorrect code ({n} attempts left)',
    'gate.tooMany': 'Too many attempts — wait {s}s',

    // Header
    'header.tagline': 'Evidence-based document authenticity — AI-writing signal & citation verification',

    // Upload panel
    'upload.dropTitle': 'Drop a PDF, DOCX or TXT here',
    'upload.or': 'or',
    'upload.browse': 'browse files',
    'upload.runsInBrowser': 'everything runs in your browser',
    'settings.sensitivity': 'Detection sensitivity',
    'sens.balanced': 'Balanced — fewer flags, higher confidence',
    'sens.high': 'High — flags more suspect text (default)',
    'sens.maximum': 'Maximum — most aggressive, more false positives',
    'privacy.note': '🔒 <strong>Everything runs locally in your browser.</strong> Parsing, AI-writing analysis and the optional deep-scan model all run on your device — your document is <strong class="privacy-strong">NEVER UPLOADED</strong> and no external services are contacted.',

    // Progress overlay
    'progress.analysing': 'Analysing your document…',
    'progress.readingPage': 'Reading page {page} of {pages}',
    'progress.analysingStyle': 'Analysing writing style…',
    'progress.hint': 'This runs entirely in your browser — large files may take a moment.',

    // Errors
    'error.notEnoughText': 'Could not extract enough text (the file may be scanned/image-only).',

    // Footer
    'footer.disclaimer': 'AITrace is an evidence engine, not a verdict machine. AI-writing signals are probabilistic and <strong>not proof of authorship</strong>. Open source · no paid APIs · runs entirely in your browser.',
    'footer.credit': 'Made and Designed with <span class="heart">❤</span> by Ahmad Abdullah',
    'footer.privacy': 'Privacy',

    // Report — header + summary
    'report.aiSignal': 'AI signal',
    'report.pages': 'pages',
    'report.words': 'words',
    'report.analyzedInBrowser': 'analyzed in your browser',
    'report.execSummary': 'Executive Summary',
    'card.aiWritingSignal': 'AI writing signal',
    'card.overallBand': 'Overall band',
    'card.strongSections': 'Strong sections',
    'card.moderateSections': 'Moderate sections',
    'card.sectionsAssessed': 'Sections assessed',

    // Report — AI authorship analysis
    'report.aiAuthorship': 'AI Authorship Analysis',
    'meter.lower': 'Lower signal',
    'meter.higher': 'Higher signal',
    'report.counts': '{high} strong · {mod} moderate · {low} low across {n} assessed sections (method: {method} · sensitivity: {sens}).',
    'report.flagged': 'Flagged sections ({n})',
    'report.noneFlagged': 'No sections reached the moderate/high threshold.',
    'report.section': 'Section {n}',
    'report.heuristic': 'heuristic {n}/100',
    'report.perplexityLine': 'Perplexity: {ppl} · signal {pill} · {tokens} tokens',

    // Report — deep scan
    'deep.title': '🧠 Deep scan (perplexity model)',
    'deep.note': 'Optional second signal: runs distilgpt2 in your browser to measure how predictable the text is. First run loads the model (~80 MB) from this site and caches it — nothing is uploaded and nothing external is fetched.',
    'deep.run': 'Run deep scan',
    'deep.loading': 'Loading language model (one-time download)…',
    'deep.downloading': 'Downloading model: {pct}% ({file})',
    'deep.scoring': 'Scoring {n} sections with the model…',
    'deep.scoringProgress': 'Scoring sections with the model… {done}/{total}',
    'deep.failed': 'Deep scan failed: {msg}',
    'deep.perplexitySignal': 'Perplexity signal',
    'deep.combinedSignal': 'Combined signal',
    'deep.heuristicPlusPpl': 'heuristic + perplexity',
    'ppl.disclaimer': 'Perplexity signal from an in-browser language model (distilgpt2). Experimental and model-specific; corroborating evidence only, not proof of AI authorship.',

    // Report — methodology + actions
    'report.methodology': 'Methodology & Limitations',
    'report.aiDetectionLabel': 'AI detection.',
    'report.limitationsLabel': 'Limitations.',
    'report.print': 'Save / print report (PDF)',
    'report.again': 'Analyze another document',

    // Bands
    'band.high': 'high',
    'band.moderate': 'moderate',
    'band.low': 'low',
    'band.unknown': 'unknown',
    'na': 'n/a',

    // Sensitivity labels (detection.js)
    'senslabel.Balanced': 'Balanced',
    'senslabel.High': 'High',
    'senslabel.Maximum': 'Maximum',

    // Detection reasons
    'reason.tooShort': 'Too short to assess reliably',
    'reason.uniform': 'Unusually uniform sentence length',
    'reason.lowDiversity': 'Low lexical diversity',
    'reason.aiPhrasing': 'Contains AI-associated phrasing ({list})',
    'reason.repetitiveOpeners': 'Repetitive sentence openers',

    // Detection disclaimer
    'detect.disclaimer': 'This is a heuristic AI-writing signal derived from stylometric features. It is probabilistic evidence, not proof of AI authorship, and human editing cannot be excluded.',

    // Methodology text (report.js)
    'meth.aiDetection': 'Local stylometric heuristics (sentence-length burstiness, lexical diversity, AI-associated phrasing density, punctuation variety, opener repetition). An optional "deep scan" adds a second signal by running a small language model (distilgpt2) in your browser and measuring per-section perplexity. No text is sent to any third-party AI detector. Both signals are probabilistic evidence, not proof.',
    'meth.limitations': 'AI-writing detection is unreliable for hybrid and human-edited text and must not be the sole basis for any adverse decision. Reference verification depends on coverage of the open scholarly graph and on citation formatting.',
  },

  de: {
    'lang.en': 'English',
    'lang.de': 'Deutsch',
    'lang.aria': 'Sprache',

    'gate.enter': 'Zugangscode eingeben',
    'gate.unlock': 'Entsperren',
    'gate.aria': 'Zugangscode',
    'gate.checking': 'Wird geprüft…',
    'gate.incorrect': 'Falscher Code',
    'gate.incorrectOne': 'Falscher Code ({n} Versuch übrig)',
    'gate.incorrectMany': 'Falscher Code ({n} Versuche übrig)',
    'gate.tooMany': 'Zu viele Versuche — {s}s warten',

    'header.tagline': 'Evidenzbasierte Dokumentenechtheit — KI-Schreibsignal & Quellenprüfung',

    'upload.dropTitle': 'PDF, DOCX oder TXT hier ablegen',
    'upload.or': 'oder',
    'upload.browse': 'Dateien durchsuchen',
    'upload.runsInBrowser': 'alles läuft in deinem Browser',
    'settings.sensitivity': 'Erkennungsempfindlichkeit',
    'sens.balanced': 'Ausgewogen — weniger Markierungen, höhere Sicherheit',
    'sens.high': 'Hoch — markiert mehr verdächtigen Text (Standard)',
    'sens.maximum': 'Maximal — am aggressivsten, mehr Fehlalarme',
    'privacy.note': '🔒 <strong>Alles läuft lokal in deinem Browser.</strong> Verarbeitung, KI-Schreibanalyse und das optionale Deep-Scan-Modell laufen alle auf deinem Gerät — dein Dokument wird <strong class="privacy-strong">NIEMALS HOCHGELADEN</strong> und es werden keine externen Dienste kontaktiert.',

    'progress.analysing': 'Dein Dokument wird analysiert…',
    'progress.readingPage': 'Seite {page} von {pages} wird gelesen',
    'progress.analysingStyle': 'Schreibstil wird analysiert…',
    'progress.hint': 'Dies läuft vollständig in deinem Browser — große Dateien können einen Moment dauern.',

    'error.notEnoughText': 'Es konnte nicht genügend Text extrahiert werden (die Datei ist möglicherweise gescannt/nur ein Bild).',

    'footer.disclaimer': 'AITrace ist eine Evidenz-Engine, kein Urteilsautomat. KI-Schreibsignale sind probabilistisch und <strong>kein Nachweis der Urheberschaft</strong>. Open Source · keine kostenpflichtigen APIs · läuft vollständig in deinem Browser.',
    'footer.credit': 'Erstellt und gestaltet mit <span class="heart">❤</span> von Ahmad Abdullah',
    'footer.privacy': 'Datenschutz',

    'report.aiSignal': 'KI-Signal',
    'report.pages': 'Seiten',
    'report.words': 'Wörter',
    'report.analyzedInBrowser': 'im Browser analysiert',
    'report.execSummary': 'Zusammenfassung',
    'card.aiWritingSignal': 'KI-Schreibsignal',
    'card.overallBand': 'Gesamteinstufung',
    'card.strongSections': 'Starke Abschnitte',
    'card.moderateSections': 'Mittlere Abschnitte',
    'card.sectionsAssessed': 'Bewertete Abschnitte',

    'report.aiAuthorship': 'KI-Urheberschaftsanalyse',
    'meter.lower': 'Niedrigeres Signal',
    'meter.higher': 'Höheres Signal',
    'report.counts': '{high} stark · {mod} mittel · {low} niedrig über {n} bewertete Abschnitte (Methode: {method} · Empfindlichkeit: {sens}).',
    'report.flagged': 'Markierte Abschnitte ({n})',
    'report.noneFlagged': 'Kein Abschnitt hat die mittlere/hohe Schwelle erreicht.',
    'report.section': 'Abschnitt {n}',
    'report.heuristic': 'Heuristik {n}/100',
    'report.perplexityLine': 'Perplexität: {ppl} · Signal {pill} · {tokens} Tokens',

    'deep.title': '🧠 Deep-Scan (Perplexitätsmodell)',
    'deep.note': 'Optionales zweites Signal: führt distilgpt2 in deinem Browser aus, um zu messen, wie vorhersehbar der Text ist. Beim ersten Lauf wird das Modell (~80 MB) von dieser Seite geladen und zwischengespeichert — nichts wird hochgeladen und nichts Externes abgerufen.',
    'deep.run': 'Deep-Scan starten',
    'deep.loading': 'Sprachmodell wird geladen (einmaliger Download)…',
    'deep.downloading': 'Modell wird heruntergeladen: {pct}% ({file})',
    'deep.scoring': '{n} Abschnitte werden mit dem Modell bewertet…',
    'deep.scoringProgress': 'Abschnitte werden mit dem Modell bewertet… {done}/{total}',
    'deep.failed': 'Deep-Scan fehlgeschlagen: {msg}',
    'deep.perplexitySignal': 'Perplexitätssignal',
    'deep.combinedSignal': 'Kombiniertes Signal',
    'deep.heuristicPlusPpl': 'Heuristik + Perplexität',
    'ppl.disclaimer': 'Perplexitätssignal von einem Sprachmodell im Browser (distilgpt2). Experimentell und modellspezifisch; nur ergänzender Hinweis, kein Nachweis der KI-Urheberschaft.',

    'report.methodology': 'Methodik & Einschränkungen',
    'report.aiDetectionLabel': 'KI-Erkennung.',
    'report.limitationsLabel': 'Einschränkungen.',
    'report.print': 'Bericht speichern / drucken (PDF)',
    'report.again': 'Weiteres Dokument analysieren',

    'band.high': 'hoch',
    'band.moderate': 'mittel',
    'band.low': 'niedrig',
    'band.unknown': 'unbekannt',
    'na': 'n. v.',

    'senslabel.Balanced': 'Ausgewogen',
    'senslabel.High': 'Hoch',
    'senslabel.Maximum': 'Maximal',

    'reason.tooShort': 'Zu kurz für eine verlässliche Bewertung',
    'reason.uniform': 'Ungewöhnlich gleichmäßige Satzlänge',
    'reason.lowDiversity': 'Geringe lexikalische Vielfalt',
    'reason.aiPhrasing': 'Enthält KI-typische Formulierungen ({list})',
    'reason.repetitiveOpeners': 'Sich wiederholende Satzanfänge',

    'detect.disclaimer': 'Dies ist ein heuristisches KI-Schreibsignal, das aus stilometrischen Merkmalen abgeleitet wird. Es ist ein probabilistischer Hinweis, kein Nachweis der KI-Urheberschaft, und eine menschliche Bearbeitung kann nicht ausgeschlossen werden.',

    'meth.aiDetection': 'Lokale stilometrische Heuristiken (Schwankung der Satzlänge, lexikalische Vielfalt, Dichte KI-typischer Formulierungen, Zeichensetzungsvielfalt, Wiederholung von Satzanfängen). Ein optionaler „Deep-Scan“ ergänzt ein zweites Signal, indem ein kleines Sprachmodell (distilgpt2) in deinem Browser ausgeführt und die Perplexität pro Abschnitt gemessen wird. Es wird kein Text an einen Drittanbieter-KI-Detektor gesendet. Beide Signale sind probabilistische Hinweise, kein Nachweis.',
    'meth.limitations': 'Die Erkennung von KI-Text ist bei hybridem und von Menschen bearbeitetem Text unzuverlässig und darf nicht die alleinige Grundlage für eine nachteilige Entscheidung sein. Die Quellenprüfung hängt von der Abdeckung des offenen Wissenschaftsgraphen und von der Zitierweise ab.',
  },
};

export function getLang() {
  try {
    const s = localStorage.getItem('aitrace.lang');
    if (LANGS.includes(s)) return s;
  } catch {
    /* ignore */
  }
  const nav = (navigator.language || 'en').toLowerCase();
  return nav.startsWith('de') ? 'de' : 'en';
}

export function setLang(lang) {
  if (!LANGS.includes(lang)) return;
  try {
    localStorage.setItem('aitrace.lang', lang);
  } catch {
    /* ignore */
  }
}

// Translate a key with optional {var} interpolation. Falls back to English,
// then to the raw key, so a missing translation never renders blank.
export function t(key, vars) {
  const lang = getLang();
  let s = (STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS.en[key] ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]));
    }
  }
  return s;
}

// Human-readable band name for display (the raw band stays the CSS class).
export function bandLabel(band) {
  return t(`band.${band || 'unknown'}`);
}

// Apply translations to static markup. Elements opt in with:
//   data-i18n       -> textContent
//   data-i18n-html  -> innerHTML (for strings containing markup)
//   data-i18n-aria  -> aria-label
//   data-i18n-ph    -> placeholder
export function applyStaticI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
  });
}

// Build the flag switcher into #lang-switch (if present) and wire clicks.
export function initLangSwitcher() {
  const host = document.getElementById('lang-switch');
  if (!host) return;
  const current = getLang();
  const other = current === 'de' ? 'en' : 'de';
  const flags = { en: '🇬🇧', de: '🇩🇪' };
  const label = { en: 'EN', de: 'DE' };
  // A single toggle tab: shows the OTHER (target) language; clicking switches to it.
  // English UI shows a "DE" button, German UI shows an "EN" button.
  host.innerHTML = `<button type="button" class="lang-btn" data-to="${other}" aria-label="${t('lang.aria')}: ${t(`lang.${other}`)}" title="${t(`lang.${other}`)}"><span class="flag">${flags[other]}</span><span class="lang-code">${label[other]}</span></button>`;
  host.querySelector('.lang-btn').addEventListener('click', (e) => {
    const to = e.currentTarget.getAttribute('data-to');
    setLang(to);
    // Reload so every string — static and already-rendered — is regenerated.
    window.location.reload();
  });
}

// Bootstrap: reflect the language on <html> and translate static markup as soon
// as the DOM is ready. Guarded so importing this from several modules is safe.
function boot() {
  const lang = getLang();
  document.documentElement.setAttribute('lang', lang);
  applyStaticI18n();
  initLangSwitcher();
  // The privacy page is a separate, JS-free document (strict CSP), so it can't
  // read the stored language. When German is active, deep-link straight to its
  // German section via the CSS :target toggle.
  document.querySelectorAll('a[href="privacy.html"]').forEach((a) => {
    if (lang === 'de') a.setAttribute('href', 'privacy.html#lang-de');
  });
}

if (!window.__aitraceI18nBooted) {
  window.__aitraceI18nBooted = true;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
