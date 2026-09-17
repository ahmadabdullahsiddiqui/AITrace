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
| PDF parsing | `pdf.js` (vendored in `docs/vendor/`, no CDN) |
| DOCX parsing | `mammoth` browser build (vendored in `docs/vendor/`, no CDN) |
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
    perplexity.js  optional in-browser LM (distilgpt2) perplexity signal
    report.js      assembles the final report object
  vendor/          pdf.js + mammoth, bundled locally (no CDN)
preview.mjs        local static server (no dependencies)
```

Deployed via GitHub Pages "Deploy from a branch" (`main` / `/docs`) — pushing to
`main` auto-publishes.

## AI-writing signals

1. **Heuristic (default, instant, offline)** — stylometric features, always on.
2. **Perplexity deep scan (optional)** — click *Run deep scan* to load distilgpt2
   in the browser (via transformers.js) and score each section by perplexity. The
   library + model are fetched on demand and cached; the document is never
   uploaded. A combined signal is shown alongside the two.

## Roadmap (next slices)

- Claim/fact verification against cited sources.
- WebGPU acceleration + a larger model option for the perplexity signal.

## Security

Client-side hardening (all that a static, public GitHub Pages site can enforce):

- **Content-Security-Policy** (meta) with an explicit source allowlist — no inline
  scripts; script/connect/worker limited to `self` + the exact APIs/CDN used.
- **Referrer-Policy: no-referrer**, output escaping on all rendered content, and
  **URL sanitization** (only `http(s)` links) to prevent injection from document
  text or API responses.
- **Clickjacking frame-buster** (headers like `X-Frame-Options` can't be set on
  Pages).
- **Resource limits** — 50 MB max upload, 1000-page PDF cap — so a huge file can't
  freeze the tab. Recursion errors from malformed input are caught, not fatal.
- **Access gate** with PBKDF2 key-stretching, failed-attempt lockout, honeypot.

**Known residual items** (documented, low real-world impact in this context):

- The vendored Mammoth DOCX bundle ships Underscore 1.13.1 / JSZip — versions that
  carry advisories upstream. Mammoth bundles these itself and its latest release
  hasn't updated them, so they can't be patched without rebuilding Mammoth. In the
  browser (no filesystem, single user) the practical impact is at most a
  self-inflicted tab slowdown on a crafted DOCX, which our error handling contains.
- The optional deep scan's library and ONNX runtime are **self-hosted** (no CDN);
  only the model *weights* (data) are fetched from the Hugging Face Hub. To be fully
  offline, vendor the model too (~80 MB) — see roadmap.

> The access gate is a **deterrent, not real security**: the site is public and
> the hash is readable, so an offline brute-force can't be prevented client-side.
> For genuine access control, front the site with server-side auth (Cloudflare
> Access, Netlify password, etc.).

## Limitations

AI-writing detection is unreliable for hybrid and human-edited text and **must
not be the sole basis for any adverse decision.** Reference verification depends
on the coverage of the open scholarly graph and on citation formatting. PDF text
extraction reconstructs paragraph breaks heuristically, so section boundaries in
some PDFs are approximate.
