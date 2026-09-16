# AITrace

**Evidence-based document authenticity analyzer.** Upload a PDF, DOCX or TXT and
get a report combining an **AI-writing signal** with **citation verification** —
not a single "AI or human" verdict.

AITrace runs **entirely in your browser**. Your document is never uploaded
anywhere: parsing and AI-writing analysis happen on your device, and only the
extracted citation titles/DOIs are sent to the free Crossref and OpenAlex APIs.
It deploys to **GitHub Pages** as a static site — free, permanent URL, works on
any device, no install.

## Why it's different from a plain "AI detector"

- **AI-writing signal** — local stylometric heuristics (sentence-length
  burstiness, lexical diversity, AI-associated phrasing, punctuation variety,
  opener repetition). Paragraph-level, with the reasons shown. Runs in the
  browser — **no text is sent to any third-party AI detector.**
- **Reference verification** — every citation is checked against **Crossref** and
  **OpenAlex** (free, open scholarly APIs, no key) and classified as
  verified / partial / not found / possible hallucination / DOI invalid.

## 100% open source, no paid APIs, no server

| Concern | Choice |
| --- | --- |
| Hosting | GitHub Pages (static — no backend) |
| PDF parsing | `pdf.js` (loaded from jsDelivr CDN) |
| DOCX parsing | `mammoth` browser build (jsDelivr CDN) |
| Reference data | Crossref + OpenAlex (free, no key, CORS-enabled) |
| AI signal | local heuristic engine (pluggable) |
| Frontend | static HTML/CSS/JS ES modules — no build step |

## Deploy to GitHub Pages

The site lives in `docs/`. Two ways to publish:

1. **GitHub Actions (push-to-deploy, included).** `.github/workflows/pages.yml`
   deploys `docs/` on every push to `main`. In the repo: **Settings → Pages →
   Build and deployment → Source: GitHub Actions**. Then:
   ```bash
   git add -A && git commit -m "Deploy AITrace" && git push
   ```
   Your site goes live at `https://<username>.github.io/AITrace/`.

2. **Deploy from a branch (no Actions).** Settings → Pages → Source: *Deploy from
   a branch* → Branch: `main`, Folder: `/docs`.

## Run locally

ES modules can't be loaded over `file://`, so use the tiny zero-dependency
preview server (Node only, nothing to install):

```bash
npm run preview        # http://localhost:8080
```

## Project layout

```
docs/                     the deployed static site (GitHub Pages root)
  index.html
  style.css
  js/
    app.js         orchestrates: extract -> analyze -> verify -> render
    extraction.js  PDF (pdf.js) / DOCX (mammoth) / TXT -> text + metadata
    detection.js   AI-writing heuristic engine (swap in a model here)
    references.js  citation extraction + Crossref/OpenAlex verification
    report.js      assembles the final report object
.github/workflows/pages.yml   push-to-deploy to GitHub Pages
preview.mjs                    local static server (no dependencies)
```

## Roadmap (next slices)

- Detector-threshold tuning so clearly fabricated (no-DOI) citations classify as
  *possible hallucination* rather than *partial*.
- Perplexity-based detector running in-browser (e.g. a small ONNX/WebGPU model)
  as a second, pluggable signal alongside the heuristics.
- Claim/fact verification against cited sources.
- Vendor pdf.js/mammoth into `docs/vendor/` to remove the CDN dependency.

## Limitations

AI-writing detection is unreliable for hybrid and human-edited text and **must
not be the sole basis for any adverse decision.** Reference verification depends
on the coverage of the open scholarly graph and on citation formatting. PDF text
extraction reconstructs paragraph breaks heuristically, so section boundaries in
some PDFs are approximate.
