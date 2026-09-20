// gate.js — hardened SOFT client-side access-code gate.
//
// IMPORTANT: this is a deterrent, not real security. AITrace is a static site in
// a public repo, so the stored hash is readable and an OFFLINE brute-force of the
// code cannot be prevented client-side — only a server-side gate can do that.
// What this DOES do: raise the cost of each guess (PBKDF2 key-stretching), throttle
// and lock out repeated failures, and trip up naive bots (honeypot + delay).
//
// Verification: PBKDF2-SHA256(code, SALT, ITERATIONS) compared to a baked hash.
// Only the derived hash is stored; the plaintext code is not.

import { t } from './i18n.js';

// Host guard (host-guard.js runs first and sets this): off the official GitHub
// Pages host the page is already halted — don't wire up the gate at all.
if (window.__AITRACE_HOST_OK__ === false) throw new Error('AITrace: blocked host');

// Clickjacking defense: GitHub Pages can't send X-Frame-Options / frame-ancestors,
// so break out of any frame that isn't us.
if (window.top !== window.self) {
  try {
    window.top.location = window.location.href;
  } catch {
    document.documentElement.innerHTML = '';
  }
}

// Restore the unlocked state as early as possible (replaces the old inline script,
// so the CSP can forbid inline <script> entirely).
try {
  if (localStorage.getItem('aitrace.unlocked') === '1') document.documentElement.classList.add('unlocked');
} catch {
  /* ignore */
}

const CODE_HASH = 'a6969b97e2f7ca48df0479eb1bb0830b4eb363073905303088146e79aba3e243';
const SALT = 'aitrace-gate-v1';
const ITERATIONS = 500000;

const STORAGE_KEY = 'aitrace.unlocked';
const LOCK_KEY = 'aitrace.gate.lock'; // JSON: { fails, until }

// Lockout policy: after FREE_TRIES wrong guesses, lock with exponential backoff.
const FREE_TRIES = 5;
const BASE_LOCK_MS = 15000; // 15s, doubling each further failure
const MAX_LOCK_MS = 15 * 60 * 1000; // cap at 15 min

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadLock() {
  try {
    return JSON.parse(localStorage.getItem(LOCK_KEY)) || { fails: 0, until: 0 };
  } catch {
    return { fails: 0, until: 0 };
  }
}
function saveLock(state) {
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
function clearLock() {
  try {
    localStorage.removeItem(LOCK_KEY);
  } catch {
    /* ignore */
  }
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time-ish hex comparison (avoids early-exit timing signal).
function hexEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function derive(code) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(SALT), iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return toHex(bits);
}

function unlock() {
  clearLock();
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
  const button = form.querySelector('button[type="submit"]');
  const honeypot = document.getElementById('gate-hp');

  if (!document.documentElement.classList.contains('unlocked') && input) input.focus();

  // If currently locked, reflect the remaining time.
  const lock0 = loadLock();
  if (lock0.until && Date.now() < lock0.until) {
    err.textContent = t('gate.tooMany', { s: Math.ceil((lock0.until - Date.now()) / 1000) });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Honeypot: a real user never fills this hidden field; bots that autofill do.
    if (honeypot && honeypot.value) {
      err.textContent = t('gate.incorrect');
      return;
    }

    const lock = loadLock();
    if (lock.until && Date.now() < lock.until) {
      err.textContent = t('gate.tooMany', { s: Math.ceil((lock.until - Date.now()) / 1000) });
      return;
    }

    const value = (input.value || '').trim();
    if (!value) return;

    button.disabled = true;
    input.disabled = true;
    err.textContent = t('gate.checking');
    await sleep(350); // small fixed delay to slow scripted hammering

    let ok = false;
    try {
      ok = hexEqual(await derive(value), CODE_HASH);
    } catch {
      ok = false;
    }

    if (ok) {
      err.textContent = '';
      unlock();
      return;
    }

    // Wrong: record failure and possibly lock with exponential backoff.
    const fails = (lock.fails || 0) + 1;
    let until = 0;
    if (fails >= FREE_TRIES) {
      const backoff = Math.min(BASE_LOCK_MS * 2 ** (fails - FREE_TRIES), MAX_LOCK_MS);
      until = Date.now() + backoff;
    }
    saveLock({ fails, until });

    button.disabled = false;
    input.disabled = false;
    input.value = '';
    if (until) {
      err.textContent = t('gate.tooMany', { s: Math.ceil((until - Date.now()) / 1000) });
    } else {
      const left = FREE_TRIES - fails;
      err.textContent = t(left === 1 ? 'gate.incorrectOne' : 'gate.incorrectMany', { n: left });
      input.focus();
    }
  });
}
