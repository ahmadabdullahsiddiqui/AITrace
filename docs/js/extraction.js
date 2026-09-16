// extraction.js (browser) — turn an uploaded File into { text, metadata, pages,
// words, characters } entirely client-side. Nothing is uploaded anywhere.
//
// PDF  -> pdf.js (Apache-2.0), loaded as an ES module from jsDelivr
// DOCX -> mammoth browser build (BSD), loaded as a UMD global in index.html
// TXT  -> read directly

import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs';

function countWords(text) {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

async function extractPdf(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';

  for (let p = 1; p <= pdf.numPages; p += 1) {
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
