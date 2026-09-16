// references.js (browser) — extract bibliography entries and verify them against
// free, open scholarly APIs: Crossref (https://api.crossref.org) and OpenAlex
// (https://api.openalex.org). Both are CORS-enabled and require no API key. We
// pass a `mailto` so Crossref routes us through its faster "polite pool".
//
// NOTE: browsers forbid setting a custom User-Agent header, so we identify via
// the mailto query parameter only.

const CONTACT = 'abdullah@powerfolder.com';
const CROSSREF = 'https://api.crossref.org/works';
const OPENALEX = 'https://api.openalex.org/works';

const DOI_RE = /10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/g;

const REFERENCE_HEADINGS = /^\s*(references|bibliography|works cited|literature cited|reference list)\s*:?\s*$/i;

function stripDoiTail(doi) {
  return doi.replace(/[.,;)\]]+$/, '');
}

/**
 * Pull the reference section out of the full text, then split it into entries.
 * Falls back to scanning the whole document for DOIs if no section is found.
 */
export function extractReferences(text) {
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (REFERENCE_HEADINGS.test(lines[i])) start = i + 1;
  }

  const block = start >= 0 ? lines.slice(start).join('\n') : '';
  const entries = [];

  if (block) {
    const numbered = block.split(/\n(?=\s*(?:\[\d+\]|\d+\.)\s)/);
    // Use the numbered split when it actually produced multiple entries;
    // otherwise fall back to "new line starting with a capital letter".
    const candidates = numbered.length > 1 ? numbered : block.split(/\n(?=[A-Z])/);
    for (const raw of candidates) {
      const entry = raw.replace(/\s+/g, ' ').trim();
      if (entry.length >= 25 && /[A-Za-z]/.test(entry)) {
        entries.push(entry.replace(/^\s*(?:\[\d+\]|\d+\.)\s*/, ''));
      }
    }
  }

  if (entries.length === 0) {
    const dois = [...new Set((text.match(DOI_RE) || []).map(stripDoiTail))];
    for (const doi of dois) entries.push(`https://doi.org/${doi}`);
  }

  const seen = new Set();
  const unique = [];
  for (const e of entries) {
    const key = e.toLowerCase().slice(0, 120);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(e);
    }
    if (unique.length >= 120) break;
  }
  return unique;
}

function normalizeTitle(s) {
  return (s || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleSimilarity(a, b) {
  const A = new Set(normalizeTitle(a).split(' ').filter(Boolean));
  const B = new Set(normalizeTitle(b).split(' ').filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / Math.max(A.size, B.size);
}

function guessYear(entry) {
  const m = entry.match(/(?:19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

function guessTitle(entry) {
  const quoted = entry.match(/["“”']([^"“”']{12,})["“”']/);
  if (quoted) return quoted[1].trim();
  const afterYear = entry.match(/\((?:19|20)\d{2}[a-z]?\)\.?\s*([^.]{12,300})\./);
  if (afterYear) return afterYear[1].trim();
  const parts = entry.split(/[.]/).map((p) => p.trim()).filter((p) => p.length > 12);
  parts.sort((a, b) => b.length - a.length);
  return parts[0] || entry.slice(0, 120);
}

async function fetchJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : String(err.message || err) };
  } finally {
    clearTimeout(t);
  }
}

async function verifyByDoi(doi) {
  // Crossref & OpenAlex expect the DOI in the path with slashes LEFT INTACT.
  const pathDoi = encodeURIComponent(doi).replace(/%2F/gi, '/');
  const cr = await fetchJson(`${CROSSREF}/${pathDoi}?mailto=${CONTACT}`);
  if (cr.ok && cr.data && cr.data.message) {
    const m = cr.data.message;
    return {
      source: 'crossref',
      record: {
        title: (m.title && m.title[0]) || null,
        authors: (m.author || []).map((a) => [a.given, a.family].filter(Boolean).join(' ')).slice(0, 8),
        year: (m.issued && m.issued['date-parts'] && m.issued['date-parts'][0][0]) || null,
        container: (m['container-title'] && m['container-title'][0]) || null,
        doi: m.DOI || doi,
        url: m.URL || `https://doi.org/${doi}`,
      },
    };
  }
  const oa = await fetchJson(`${OPENALEX}/doi:${pathDoi}?mailto=${CONTACT}`);
  if (oa.ok && oa.data && oa.data.id) {
    const m = oa.data;
    return {
      source: 'openalex',
      record: {
        title: m.title || m.display_name || null,
        authors: (m.authorships || []).map((a) => a.author && a.author.display_name).filter(Boolean).slice(0, 8),
        year: m.publication_year || null,
        container: (m.primary_location && m.primary_location.source && m.primary_location.source.display_name) || null,
        doi,
        url: `https://doi.org/${doi}`,
      },
    };
  }
  return { source: null, record: null, doiInvalid: true };
}

async function verifyByBibliographic(entry) {
  const title = guessTitle(entry);
  const q = encodeURIComponent(title);
  const cr = await fetchJson(`${CROSSREF}?query.bibliographic=${q}&rows=5&mailto=${CONTACT}`);
  const items = (cr.ok && cr.data && cr.data.message && cr.data.message.items) || [];
  if (items.length) {
    let best = null;
    let bestSim = -1;
    for (const m of items) {
      const t = (m.title && m.title[0]) || '';
      const sim = titleSimilarity(title, t);
      if (sim > bestSim) {
        bestSim = sim;
        best = m;
      }
    }
    const m = best || items[0];
    return {
      source: 'crossref',
      record: {
        title: (m.title && m.title[0]) || null,
        authors: (m.author || []).map((a) => [a.given, a.family].filter(Boolean).join(' ')).slice(0, 8),
        year: (m.issued && m.issued['date-parts'] && m.issued['date-parts'][0][0]) || null,
        container: (m['container-title'] && m['container-title'][0]) || null,
        doi: m.DOI || null,
        url: m.URL || (m.DOI ? `https://doi.org/${m.DOI}` : null),
      },
    };
  }
  return { source: null, record: null };
}

export async function verifyReference(entry) {
  const doiMatch = entry.match(DOI_RE);
  const claimedYear = guessYear(entry);
  const claimedTitle = guessTitle(entry);

  const viaDoi = Boolean(doiMatch);
  let found;
  if (viaDoi) {
    found = await verifyByDoi(stripDoiTail(doiMatch[0]));
  } else {
    found = await verifyByBibliographic(entry);
  }

  if (found.doiInvalid) {
    return {
      entry,
      status: 'doi_invalid',
      label: 'DOI is not indexed in Crossref or OpenAlex',
      claimed: { title: claimedTitle, year: claimedYear },
      match: null,
    };
  }

  if (!found.record) {
    return {
      entry,
      status: viaDoi ? 'not_found' : 'possible_hallucination',
      label: viaDoi ? 'No matching publication found' : 'No matching title/author/DOI found',
      claimed: { title: claimedTitle, year: claimedYear },
      match: null,
    };
  }

  const sim = titleSimilarity(claimedTitle, found.record.title || '');
  const yearOk = !claimedYear || !found.record.year || Math.abs(claimedYear - found.record.year) <= 1;

  let status;
  let label;
  if (viaDoi) {
    if (sim < 0.3 && !yearOk) {
      status = 'partial';
      label = 'DOI resolves, but the cited title and year do not match the record';
    } else {
      status = 'verified';
      label = 'DOI resolves to a matching publication';
    }
  } else if (sim >= 0.6 && yearOk) {
    status = 'verified';
    label = 'Publication exists and metadata matches';
  } else if (sim >= 0.35) {
    status = 'partial';
    label = yearOk ? 'Publication exists but title differs' : 'Publication exists but title/year differ';
  } else {
    status = 'not_found';
    label = 'No confident match found';
  }

  return {
    entry,
    status,
    label,
    claimed: { title: claimedTitle, year: claimedYear },
    match: { source: found.source, titleSimilarity: Math.round(sim * 100) / 100, ...found.record },
  };
}

export async function verifyReferences(entries, concurrency = 4) {
  const results = new Array(entries.length);
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const i = next;
      next += 1;
      try {
        results[i] = await verifyReference(entries[i]);
      } catch (err) {
        results[i] = { entry: entries[i], status: 'error', label: String(err.message || err), match: null };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length || 1) }, worker));

  const counts = { verified: 0, partial: 0, not_found: 0, possible_hallucination: 0, doi_invalid: 0, error: 0 };
  for (const r of results) if (r && counts[r.status] !== undefined) counts[r.status] += 1;

  return { total: results.length, counts, references: results };
}
