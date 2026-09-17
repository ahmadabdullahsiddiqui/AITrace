// gate.js — SOFT client-side access-code gate.
//
// NOTE: this is a deterrent, not real security. AITrace is a static site in a
// public repo; a determined visitor can read the code, bypass the overlay, or
// brute-force the short code. Only the SHA-256 hash of the code is stored here,
// and the unlock is remembered per-device in localStorage.

const CODE_HASH = 'ac3fbb3474801233a338e0f27af3477773ad8772d35c87f70d9489837babb35a';
const STORAGE_KEY = 'aitrace.unlocked';

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function unlock() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* private mode — still unlock for this session */
  }
  document.documentElement.classList.add('unlocked');
}

const gate = document.getElementById('gate');
if (gate) {
  const input = document.getElementById('gate-input');
  const form = document.getElementById('gate-form');
  const err = document.getElementById('gate-error');

  if (!document.documentElement.classList.contains('unlocked') && input) input.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = (input.value || '').trim();
    if (!value) return;
    const hash = await sha256(value);
    if (hash === CODE_HASH) {
      err.textContent = '';
      unlock();
    } else {
      err.textContent = 'Incorrect code';
      input.value = '';
      input.focus();
    }
  });
}
