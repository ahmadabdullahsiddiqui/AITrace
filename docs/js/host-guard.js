// host-guard.js — restrict AITrace to its official GitHub Pages deployment.
//
// AITrace is meant to run ONLY from its GitHub Pages host. Running a local clone
// (localhost / 127.0.0.1 / file://) or any other host is blocked. Like the access
// gate this is a client-side deterrent, not hard security — the source is public —
// but it stops the app from silently functioning off its intended origin.
//
// Loaded as the FIRST module in <head>, before i18n/gate/app, so it can halt the
// page before any of them initialise. Other modules check window.__AITRACE_HOST_OK__.

function hostAllowed() {
  const h = (location.hostname || '').toLowerCase();
  // GitHub Pages serves everything from a *.github.io host (user/org or project
  // sites). Allow only that; block localhost, 127.0.0.1, ::1, file:// (empty
  // hostname) and any other origin a clone might be served from.
  return h === 'github.io' || h.endsWith('.github.io');
}

const ok = hostAllowed();
window.__AITRACE_HOST_OK__ = ok;

if (!ok) {
  const html =
    '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'padding:2rem;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
    'background:#0b1020;color:#e6e9f2;text-align:center">' +
    '<div style="max-width:34rem">' +
    '<div style="font-size:2.5rem;line-height:1;margin-bottom:1rem">🔒</div>' +
    '<h1 style="font-size:1.4rem;margin:0 0 .75rem">AITrace runs on GitHub Pages only</h1>' +
    '<p style="margin:0 0 .5rem;opacity:.85">This app is available at its official ' +
    '<a style="color:#8ab4ff" href="https://ahmadabdullahsiddiqui.github.io/AITrace/">' +
    'ahmadabdullahsiddiqui.github.io/AITrace</a> deployment and does not run on localhost ' +
    'or other hosts.</p>' +
    '<p style="margin:0;opacity:.6;font-size:.9rem">Diese App läuft ausschließlich auf ' +
    'GitHub&nbsp;Pages und nicht auf localhost oder anderen Hosts.</p>' +
    '</div></div>';

  const render = () => {
    document.documentElement.classList.remove('unlocked');
    if (document.body) document.body.innerHTML = html;
    else document.documentElement.innerHTML = '<head><meta charset="utf-8"></head><body>' + html + '</body>';
  };

  if (document.body) render();
  else document.addEventListener('DOMContentLoaded', render);

  // Stop this module chain; other modules bail on the flag as a second line of defence.
  throw new Error('AITrace: blocked host');
}
