// detection.js — local, open-source AI-writing SIGNAL engine.
//
// IMPORTANT: this is a heuristic/statistical proxy, NOT proof of AI authorship.
// It produces an evidence *signal*, deliberately labelled as such throughout the
// app. The engine is intentionally pluggable: replace `scoreParagraph` with a
// transformer-based perplexity model later without touching the rest of the app.

// Phrases and connectives disproportionately common in generated text. Presence
// alone proves nothing; frequency across a paragraph is a weak signal.
const AI_PHRASES = [
  'it is important to note',
  "it's important to note",
  'it is worth noting',
  "it's worth noting",
  'in conclusion',
  'in summary',
  'furthermore',
  'moreover',
  'additionally',
  'delve into',
  'delving into',
  'leverage',
  'leveraging',
  'tapestry',
  'underscores',
  'plays a crucial role',
  'plays a significant role',
  'a testament to',
  'navigate the complexities',
  'in the realm of',
  'in the ever-evolving',
  'ever-changing landscape',
  "in today's world",
  "in today's fast-paced",
  'on the other hand',
  'when it comes to',
  'a wide range of',
  'it is essential to',
  'seamless integration',
  'holistic approach',
  'cutting-edge',
  'first and foremost',
  'notably',
];

function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function splitParagraphs(text) {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);
}

function words(text) {
  const m = text.toLowerCase().match(/[a-z']+/g);
  return m || [];
}

function stdev(nums) {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Score a single paragraph. Returns { signal (0-100), reasons[], metrics }.
 * Higher signal = more indicators associated with generated text.
 */
// Sensitivity presets. Higher sensitivity lowers the band thresholds, boosts the
// combined signal (gain), and assesses shorter paragraphs — flagging more suspect
// text at the cost of more false positives. `high` is the default.
export const SENSITIVITY = {
  balanced: { label: 'Balanced', highCut: 65, modCut: 40, gain: 1.0, minWords: 25, minSentences: 2 },
  high: { label: 'High', highCut: 50, modCut: 28, gain: 1.3, minWords: 15, minSentences: 2 },
  maximum: { label: 'Maximum', highCut: 38, modCut: 18, gain: 1.6, minWords: 10, minSentences: 1 },
};

function resolveConfig(sensitivity) {
  return SENSITIVITY[sensitivity] || SENSITIVITY.high;
}

function scoreParagraph(text, cfg) {
  const sentences = splitSentences(text);
  const ws = words(text);
  const reasons = [];

  if (ws.length < cfg.minWords || sentences.length < cfg.minSentences) {
    // Too short to assess reliably — do not manufacture a signal.
    return {
      signal: null,
      reasons: ['Too short to assess reliably'],
      metrics: { words: ws.length, sentences: sentences.length },
    };
  }

  const sentLengths = sentences.map((s) => words(s).length);
  const meanLen = sentLengths.reduce((a, b) => a + b, 0) / sentLengths.length;
  const burstiness = stdev(sentLengths); // sentence-length variation

  // 1) Burstiness. Human prose mixes long and short sentences (high stdev).
  //    Very uniform sentence length is a mild AI indicator.
  const burstNorm = clamp(burstiness / (meanLen || 1), 0, 1); // ~0 uniform, higher = varied
  const uniformityScore = clamp((0.55 - burstNorm) / 0.55, 0, 1) * 100;
  if (uniformityScore > 55) reasons.push('Unusually uniform sentence length');

  // 2) Lexical diversity (type-token ratio). Extremely smooth, mid-range TTR
  //    with little repetition is common in generated text.
  const unique = new Set(ws).size;
  const ttr = unique / ws.length;
  // Map: very high diversity (human, rich) -> low signal; moderate -> mild signal.
  const diversityScore = clamp((0.62 - ttr) / 0.35, 0, 1) * 100;
  if (ttr < 0.45) reasons.push('Low lexical diversity');

  // 3) AI-associated phrasing density.
  const lower = ` ${text.toLowerCase()} `;
  let phraseHits = 0;
  const hitList = [];
  for (const p of AI_PHRASES) {
    if (lower.includes(` ${p} `) || lower.includes(`${p} `) || lower.includes(` ${p}`)) {
      phraseHits += 1;
      hitList.push(p);
    }
  }
  const phrasePer100 = (phraseHits / ws.length) * 100;
  const phraseScore = clamp(phrasePer100 / 2.5, 0, 1) * 100;
  if (phraseHits >= 2) reasons.push(`Contains AI-associated phrasing (${hitList.slice(0, 3).join(', ')})`);

  // 4) Punctuation variety. Generated text often leans on plain periods/commas.
  const punctSet = new Set((text.match(/[;:—–(){}!?"]/g) || []));
  const punctScore = clamp((3 - punctSet.size) / 3, 0, 1) * 100;

  // 5) Sentence-opener repetition. Repeated first words hint at templated output.
  const openers = sentences.map((s) => (words(s)[0] || '').toLowerCase());
  const openerUnique = new Set(openers).size;
  const openerRepeat = 1 - openerUnique / openers.length;
  const openerScore = clamp(openerRepeat / 0.5, 0, 1) * 100;
  if (openerRepeat > 0.4) reasons.push('Repetitive sentence openers');

  // Weighted combination -> 0..100 base signal, then apply the sensitivity gain.
  const base =
    0.30 * uniformityScore +
    0.20 * diversityScore +
    0.30 * phraseScore +
    0.10 * punctScore +
    0.10 * openerScore;
  const signal = Math.round(base * cfg.gain);

  return {
    signal: clamp(signal, 0, 100),
    reasons,
    metrics: {
      words: ws.length,
      sentences: sentences.length,
      meanSentenceLength: Math.round(meanLen * 10) / 10,
      burstiness: Math.round(burstiness * 10) / 10,
      typeTokenRatio: Math.round(ttr * 100) / 100,
      aiPhraseHits: phraseHits,
    },
  };
}

function band(signal, cfg) {
  if (signal == null) return 'unknown';
  if (signal >= cfg.highCut) return 'high';
  if (signal >= cfg.modCut) return 'moderate';
  return 'low';
}

/**
 * Analyse a whole document. Returns paragraph-level signals and an aggregate.
 * @param {string} text
 * @param {'balanced'|'high'|'maximum'} [sensitivity='high']
 */
export function analyzeAiSignal(text, sensitivity = 'high') {
  const cfg = resolveConfig(sensitivity);
  const paragraphs = splitParagraphs(text);
  const scored = [];
  let charOffset = 0;

  paragraphs.forEach((p, i) => {
    const res = scoreParagraph(p, cfg);
    scored.push({
      index: i,
      preview: p.length > 320 ? p.slice(0, 317) + '…' : p,
      length: p.length,
      signal: res.signal,
      band: band(res.signal, cfg),
      reasons: res.reasons,
      metrics: res.metrics,
      charStart: charOffset,
    });
    charOffset += p.length;
  });

  const assessable = scored.filter((s) => s.signal != null);
  // Length-weighted mean so a few short paragraphs don't dominate.
  let weightSum = 0;
  let weighted = 0;
  for (const s of assessable) {
    const w = s.metrics.words || 1;
    weighted += s.signal * w;
    weightSum += w;
  }
  const overall = weightSum ? Math.round(weighted / weightSum) : null;

  const counts = {
    high: assessable.filter((s) => s.band === 'high').length,
    moderate: assessable.filter((s) => s.band === 'moderate').length,
    low: assessable.filter((s) => s.band === 'low').length,
    total: scored.length,
    assessed: assessable.length,
  };

  return {
    overallSignal: overall,
    overallBand: band(overall, cfg),
    counts,
    paragraphs: scored,
    method: 'heuristic-v1',
    sensitivity,
    sensitivityLabel: cfg.label,
    disclaimer:
      'This is a heuristic AI-writing signal derived from stylometric features. ' +
      'It is probabilistic evidence, not proof of AI authorship, and human editing cannot be excluded.',
  };
}
