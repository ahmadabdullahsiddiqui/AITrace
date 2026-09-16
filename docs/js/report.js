// report.js — assemble extraction + detection + reference results into a single
// structured report object (consumed by the frontend and any future PDF export).

import { analyzeAiSignal } from './detection.js';
import { extractReferences, verifyReferences } from './references.js';

export async function buildReport(doc, filename) {
  const ai = analyzeAiSignal(doc.text);

  const refEntries = extractReferences(doc.text);
  const refs = await verifyReferences(refEntries);

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
      disclaimer: ai.disclaimer,
      flaggedParagraphs: flagged,
      allParagraphs: ai.paragraphs,
    },
    references: refs,
    methodology: {
      aiDetection:
        'Local stylometric heuristics (sentence-length burstiness, lexical diversity, ' +
        'AI-associated phrasing density, punctuation variety, opener repetition). No text ' +
        'is sent to any third-party AI detector. This is probabilistic evidence, not proof.',
      referenceVerification:
        'References are matched against Crossref and OpenAlex (free, open scholarly APIs). ' +
        'Classification is based on DOI resolution and title/year similarity.',
      limitations:
        'AI-writing detection is unreliable for hybrid and human-edited text and must not be ' +
        'the sole basis for any adverse decision. Reference verification depends on coverage of ' +
        'the open scholarly graph and on citation formatting.',
    },
  };
}
