// report.js — assemble extraction + detection + reference results into a single
// structured report object (consumed by the frontend and any future PDF export).

import { analyzeAiSignal } from './detection.js';
import { extractReferences, verifyReferences } from './references.js';
import { t } from './i18n.js';

export async function buildReport(doc, filename, opts = {}) {
  const sensitivity = opts.sensitivity || 'high';
  const ai = analyzeAiSignal(doc.text, sensitivity);

  // Reference verification is optional; when skipped the report is AI-writing only
  // and the analysis stays fully offline (no Crossref/OpenAlex calls).
  let refs = {
    total: 0,
    counts: { verified: 0, partial: 0, not_found: 0, possible_hallucination: 0, doi_invalid: 0, error: 0 },
    references: [],
  };
  if (!opts.skipReferences) {
    const refEntries = extractReferences(doc.text);
    refs = await verifyReferences(refEntries, 4, opts.onRefProgress);
  }

  const flagged = ai.paragraphs
    .filter((p) => p.band === 'high' || p.band === 'moderate')
    .sort((a, b) => (b.signal || 0) - (a.signal || 0));

  return {
    generatedAt: new Date().toISOString(),
    document: {
      filename,
      pages: doc.pages,
      words: doc.words,
      characters: doc.characters,
      metadata: doc.metadata,
    },
    summary: {
      aiSignal: ai.overallSignal,
      aiBand: ai.overallBand,
      sectionsAssessed: ai.counts.assessed,
      strongSections: ai.counts.high,
      moderateSections: ai.counts.moderate,
      referencesDetected: refs.total,
      referencesVerified: refs.counts.verified,
      referencesPartial: refs.counts.partial,
      referencesProblem:
        refs.counts.not_found + refs.counts.possible_hallucination + refs.counts.doi_invalid,
    },
    aiAnalysis: {
      overallSignal: ai.overallSignal,
      overallBand: ai.overallBand,
      counts: ai.counts,
      method: ai.method,
      sensitivity: ai.sensitivity,
      sensitivityLabel: ai.sensitivityLabel,
      disclaimer: ai.disclaimer,
      flaggedParagraphs: flagged,
      allParagraphs: ai.paragraphs,
    },
    references: refs,
    methodology: {
      aiDetection: t('meth.aiDetection'),
      referenceVerification:
        'Each reference is matched against both Crossref and OpenAlex (free, open scholarly APIs) ' +
        'using the DOI when present, otherwise a full-reference and title search across both indexes. ' +
        'Classification cross-checks title similarity, first-author, and year: a citation with no strong ' +
        'match in either index is flagged as a possible hallucination, while a strong title match with a ' +
        'wrong author is flagged as a possible mis-citation.',
      limitations: t('meth.limitations'),
    },
  };
}
