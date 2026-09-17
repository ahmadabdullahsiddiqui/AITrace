// extraction.js (browser) — turn an uploaded File into { text, metadata, pages,
// words, characters } entirely client-side. Nothing is uploaded anywhere.
//
// PDF  -> pdf.js (Apache-2.0), vendored locally in docs/vendor/
// DOCX -> mammoth browser build (BSD), vendored locally, loaded as a UMD global
// TXT  -> read directly
// No external CDN is used — the app is fully self-contained.

import * as pdfjsLib from '../vendor/pdf.min.mjs';

// Resolve the worker relative to THIS module so it works under any base path
// (e.g. the /AITrace/ project-page sub-path on GitHub Pages).
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;

// Resource limits — a very large upload could otherwise freeze the browser tab.
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_PDF_PAGES = 1000;

function countWords(text) {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

async function extractPdf(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';

  const pageLimit = Math.min(pdf.numPages, MAX_PDF_PAGES);
  for (let p = 1; p <= pageLimit; p += 1) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let lastY = null;
    let pageText = '';

    for (const it of content.items) {
      const str = it.str || '';
      const y = it.transform ? it.transform[5] : null;
      if (lastY !== null && y !== null) {
        const dy = lastY - y;
        // Reconstruct structure lost by PDF text extraction: a large vertical
        // gap starts a new paragraph, a small one a new line, none a space.
        if (dy > 14) pageText += '\n\n';
        else if (dy > 2) pageText += '\n';
        else if (str && !pageText.endsWith(' ')) pageText += ' ';
      }
      pageText += str;
      if (it.hasEOL) {
        pageText += '\n';
        lastY = null;
      } else {
        lastY = y;
      }
    }
    text += pageText + '\n\n';
  }

  let info = {};
  try {
    const meta = await pdf.getMetadata();
    info = (meta && meta.info) || {};
  } catch {
    /* metadata is optional */
  }

  return {
    text,
    pages: pdf.numPages,
    metadata: {
      title: info.Title || null,
      author: info.Author || null,
      creator: info.Creator || null,
      producer: info.Producer || null,
      creationDate: info.CreationDate || null,
      modificationDate: info.ModDate || null,
    },
  };
}

async function extractDocx(arrayBuffer) {
  const mammoth = window.mammoth;
  if (!mammoth) throw new Error('DOCX parser (mammoth) failed to load.');
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return { text: value || '', pages: null, metadata: {} };
}

function extractTxt(arrayBuffer) {
  return { text: new TextDecoder('utf-8').decode(arrayBuffer), pages: null, metadata: {} };
}

/**
 * Extract text + metadata from a browser File object.
 * @param {File} file
 */
export async function extractDocument(file) {
  const name = file.name || 'document';
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
  }
  const ext = (name.split('.').pop() || '').toLowerCase();
  const buffer = await file.arrayBuffer();

  let result;
  if (ext === 'pdf' || file.type === 'application/pdf') {
    result = await extractPdf(buffer);
  } else if (
    ext === 'docx' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    result = await extractDocx(buffer);
  } else if (ext === 'txt' || (file.type && file.type.startsWith('text/'))) {
    result = extractTxt(buffer);
  } else {
    throw new Error(`Unsupported file type: ${ext || file.type || 'unknown'}. Use PDF, DOCX or TXT.`);
  }

  result.words = countWords(result.text);
  result.characters = result.text.length;
  return result;
}
