/*
 * draw.js: the draw, the seal and the receipt. Everything the picker's claim
 * rests on is in this file, so it is the one file to read.
 *
 * WHY ONE FILE, WITH NO IMPORTS AND NO PAGE. The picker's promise is that the
 * result was fixed before the race and that anybody can check it. A promise
 * like that is only worth what the reader can verify, and what a reader can
 * verify in one sitting is a file that imports nothing and touches nothing but
 * the browser's own cryptography. So this module has no imports, no DOM and no
 * storage, runs unchanged in a browser and in Node, and is the only file in
 * the repository allowed to ask for randomness or for a hash. npm run lint
 * holds every one of those as a grep.
 *
 * THE ALGORITHM, webfpv-picker/v1. Pinned: two independent implementations
 * (tools/verify.mjs through this file, tools/verify.py on its own) reproduce
 * it byte for byte, and tests/draw.test.js holds three vectors. Do not
 * improve it. A change invalidates every receipt anybody kept, so it is a
 * conversation with the owner and it arrives as a v2 beside this one.
 *
 *   listDigest = SHA-256( the canonical names joined with "\n" )
 *   commitment = SHA-256( "webfpv-picker/v1/commit" || 0x00 || seed || listDigest )
 *   block(j)   = HMAC-SHA-256( key = seed,
 *                  msg = "webfpv-picker/v1/draw" || 0x00 || listDigest || u32be(j) )
 *   words      = the blocks end to end, read as consecutive big endian uint32
 *   below(n)   : limit = 2^32 - (2^32 mod n); take words until one, x, is
 *                below limit; return x mod n
 *   order      = [0 .. N-1]; for i = N-1 down to 1: k = below(i + 1); swap
 *                order[i] and order[k]
 *   showSeed   = HMAC-SHA-256( key = seed,
 *                  msg = "webfpv-picker/v1/show" || 0x00 || listDigest )
 *
 * order[0] is the index of the winner, order[1] of second place, and so on:
 * the whole finishing order is the draw, and the first W places are the W
 * winners. showSeed seeds everything the race does for looks, from a
 * different message, so the look of a race and its result come from separate
 * streams and a replay of a receipt is the same race.
 *
 * THE SHUFFLE IS PURE AND SYNCHRONOUS, over an injected word source, and
 * only the stream of words is asynchronous. That split is what lets the
 * rejection rule be tested with words chosen by hand (the largest word that
 * is accepted, the smallest that is not) instead of by waiting for an event
 * that happens once in 93 million words at its worst.
 *
 * WHAT THIS DOES NOT PROVE is written out in RANDOMNESS.md in as many words:
 * it cannot stop an operator running draws off camera until one suits them,
 * and nothing that runs on a client can. What it does is make the draw that
 * was shown a draw that was fixed first.
 *
 * This file is part of the WebFPV Race Name Picker.
 *
 * The WebFPV Race Name Picker is free software: you can redistribute it
 * and/or modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * The WebFPV Race Name Picker is distributed in the hope that it will be
 * useful, but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the WebFPV Race Name Picker. If not, see
 * <https://www.gnu.org/licenses/>.
 */

export const ALGORITHM = 'webfpv-picker/v1';

export const LIMITS = Object.freeze({
  minNames: 2,
  maxNames: 50,
  nameLength: 80,
  titleLength: 40,
  maxWinners: 3,
});

const COMMIT = 'webfpv-picker/v1/commit';
const DRAW = 'webfpv-picker/v1/draw';
const SHOW = 'webfpv-picker/v1/show';

const encoder = new TextEncoder();
const ZERO = Uint8Array.of(0);
const TWO_32 = 4294967296;

/*
 * Whether this page can draw at all. Hashing needs a secure context (https,
 * or localhost), which a page opened from a LAN address by number is not, and
 * the app says so in words rather than arming a draw that cannot be made.
 */
export function available() {
  const c = globalThis.crypto;
  return Boolean(c && typeof c.getRandomValues === 'function' && c.subtle && typeof c.subtle.digest === 'function');
}

/* ------------------------------------------------------------------ */
/* Canonical names                                                     */
/* ------------------------------------------------------------------ */

/*
 * The form a name takes before it is sealed: Unicode NFC, control characters
 * and each run of whitespace collapsed to one space, trimmed, lone surrogates
 * replaced (they have no UTF-8 spelling, so two engines would disagree about
 * them), and cut to at most `limit` code points. Idempotent, which
 * tests/draw.test.js checks.
 *
 * A canonical name can never contain a newline, and that is what makes
 * joining the list with "\n" unambiguous: ["a", "b"] and ["a\nb"] could not
 * otherwise be told apart by a digest.
 */
export function canonicalName(raw, limit = LIMITS.nameLength) {
  if (typeof raw !== 'string') {
    return '';
  }
  const clean = raw
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const points = Array.from(clean, (c) => (c.length === 1 && /[\ud800-\udfff]/.test(c) ? '�' : c));
  return points.slice(0, limit).join('').trim();
}

export const canonicalTitle = (raw) => canonicalName(raw, LIMITS.titleLength);

/* A pasted block or an array of lines, to the list the picker seals: empty lines dropped, the rest canonical. */
export function canonicalNames(input) {
  const lines = typeof input === 'string' ? input.split(/\r\n|\r|\n/) : Array.from(input);
  return lines.map((line) => canonicalName(line)).filter((name) => name !== '');
}

/* ------------------------------------------------------------------ */
/* Bytes                                                               */
/* ------------------------------------------------------------------ */

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

const u32be = (j) => Uint8Array.of(j >>> 24, (j >>> 16) & 255, (j >>> 8) & 255, j & 255);

export const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export function fromHex(hex, length) {
  if (typeof hex !== 'string' || !/^(?:[0-9a-f]{2})*$/i.test(hex) || (length !== undefined && hex.length !== length * 2)) {
    throw new TypeError(`expected ${length === undefined ? 'hexadecimal' : `${length * 2} hexadecimal digits`}`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The primitives: the only calls to the browser's cryptography         */
/* ------------------------------------------------------------------ */

function engine() {
  const s = globalThis.crypto && globalThis.crypto.subtle;
  if (!s) {
    throw new Error('This page cannot hash: it needs a secure connection (https, or localhost).');
  }
  return s;
}

async function sha256(...parts) {
  return new Uint8Array(await engine().digest('SHA-256', concat(...parts)));
}

const hmacKey = (seed) => engine().importKey('raw', seed, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

async function hmac(key, ...parts) {
  return new Uint8Array(await engine().sign('HMAC', key, concat(...parts)));
}

/* A live draw's seed: 32 bytes from the operating system's generator, and from nowhere else. */
function freshSeed() {
  const seed = new Uint8Array(32);
  globalThis.crypto.getRandomValues(seed);
  return seed;
}

/* ------------------------------------------------------------------ */
/* The draw                                                            */
/* ------------------------------------------------------------------ */

export const listDigest = (names) => sha256(encoder.encode(names.join('\n')));

export const commitment = (seed, digest) => sha256(encoder.encode(COMMIT), ZERO, seed, digest);

export async function showSeed(seed, digest) {
  return hmac(await hmacKey(seed), encoder.encode(SHOW), ZERO, digest);
}

/*
 * The uniform integer below n, by rejection. The accepted range, 0 up to
 * limit, is a whole number of multiples of n, so x mod n is exactly uniform:
 * there is no modulo bias to argue about. For n a power of two the limit is
 * 2^32 and nothing is rejected. For n = 50 a word is rejected about once in
 * 93 million.
 */
export function below(n, nextWord) {
  const limit = TWO_32 - (TWO_32 % n);
  for (;;) {
    const x = nextWord();
    if (x < limit) {
      return x % n;
    }
  }
}

/* Fisher-Yates in Durstenfeld's form: each of the N! orderings with probability exactly 1/N! given exactly uniform integers. */
export function shuffle(count, nextWord) {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i >= 1; i -= 1) {
    const k = below(i + 1, nextWord);
    [order[i], order[k]] = [order[k], order[i]];
  }
  return order;
}

class OutOfWords extends Error {}

/* The words of a run of blocks, as the synchronous source the shuffle wants. It throws when it is dry. */
function wordsOf(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  return () => {
    if (at + 4 > bytes.length) {
      throw new OutOfWords();
    }
    const x = view.getUint32(at);
    at += 4;
    return x;
  };
}

async function blocksOf(key, digest, count) {
  const parts = [];
  for (let j = 0; j < count; j += 1) {
    parts.push(await hmac(key, encoder.encode(DRAW), ZERO, digest, u32be(j)));
  }
  return concat(...parts);
}

/*
 * The finishing order for a seed and a list.
 *
 * A shuffle of N names takes N - 1 words plus, once in a very long while,
 * one more for a rejection. So the blocks are fetched a few at a time, and if
 * the source runs dry the whole shuffle is run again over twice as many
 * blocks. That is exact, not an approximation: the shuffle is a pure function
 * of the stream's prefix it consumes, so a longer prefix gives the same
 * answer an endless stream would. `blocks` is there so a test can start short
 * and force that path.
 */
export async function orderOf(seed, digest, count, blocks = Math.ceil(count / 8) + 1) {
  const key = await hmacKey(seed);
  for (let have = Math.max(1, blocks); ; have *= 2) {
    try {
      return shuffle(count, wordsOf(await blocksOf(key, digest, have)));
    } catch (e) {
      if (!(e instanceof OutOfWords)) {
        throw e;
      }
    }
  }
}

/* Everything a seed and a list determine, as hex and a plain array. */
export async function derive(names, seed) {
  const digest = await listDigest(names);
  const [commit, show, order] = await Promise.all([
    commitment(seed, digest),
    showSeed(seed, digest),
    orderOf(seed, digest, names.length),
  ]);
  return { listDigest: toHex(digest), commitment: toHex(commit), showSeed: toHex(show), order };
}

/* The first twelve hex digits of the commitment, in three groups of four: what goes on the glass. */
export function fingerprint(commitmentHex) {
  const h = String(commitmentHex).slice(0, 12).toUpperCase();
  return `${h.slice(0, 4)} ${h.slice(4, 8)} ${h.slice(8, 12)}`;
}

/*
 * Whether a fingerprint somebody remembers, or typed from a photograph of
 * the screen, belongs to this commitment. Spaces and case do not matter.
 * It returns null, which is "not enough to say", for fewer than 8 digits,
 * because a handful of digits would match by luck and a tick is not worth
 * showing for that.
 */
export function matchesFingerprint(commitmentHex, typed) {
  const digits = String(typed).replace(/[^0-9a-f]/gi, '').toLowerCase();
  if (digits.length < 8) {
    return null;
  }
  return String(commitmentHex).toLowerCase().startsWith(digits);
}

/* ------------------------------------------------------------------ */
/* Sealing: the seeded function and the live one                        */
/* ------------------------------------------------------------------ */

function sealable(names) {
  if (!Array.isArray(names) || names.length < LIMITS.minNames || names.length > LIMITS.maxNames) {
    throw new RangeError(`A draw needs ${LIMITS.minNames} to ${LIMITS.maxNames} names.`);
  }
  for (const name of names) {
    if (typeof name !== 'string' || name === '' || name !== canonicalName(name)) {
      throw new RangeError('Every name has to be canonical before it is sealed. Pass the list through canonicalNames first.');
    }
  }
}

/*
 * The seeded function, for tests, verifiers and replays. Nothing in the live
 * path calls it, and scripts/lint.js says which files may. It returns the
 * receipt the picker would have written for that seed.
 */
export async function drawWithSeed(names, seed, meta = {}) {
  sealable(names);
  const bytes = typeof seed === 'string' ? fromHex(seed, 32) : seed;
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
    throw new RangeError('A seed is 32 bytes.');
  }
  const winners = meta.winners === undefined ? 1 : meta.winners;
  if (!Number.isInteger(winners) || winners < 1 || winners > Math.min(LIMITS.maxWinners, names.length - 1)) {
    throw new RangeError(`Winners is 1 to ${Math.min(LIMITS.maxWinners, names.length - 1)} for ${names.length} names.`);
  }
  const d = await derive(names, bytes);
  const receipt = {
    algorithm: ALGORITHM,
    title: canonicalTitle(meta.title || ''),
    sealedAt: (meta.now || new Date()).toISOString(),
    names: [...names],
    winners,
  };
  if (Number.isInteger(meta.length) && meta.length > 0 && meta.length <= 3600) {
    receipt.length = meta.length;
  }
  receipt.listDigest = d.listDigest;
  receipt.commitment = d.commitment;
  receipt.seed = toHex(bytes);
  receipt.order = d.order;
  return receipt;
}

/*
 * The live draw: the seed comes from crypto.getRandomValues, taken here,
 * when the operator arms the race, and there is no parameter that could
 * offer it another one. Every live draw goes through this function.
 */
export function drawLive(names, meta = {}) {
  return drawWithSeed(names, freshSeed(), meta);
}

/*
 * What a replay of a receipt needs, and nothing it could issue: the order
 * and the show seed, recomputed from the seed in the receipt. A replay never
 * writes a receipt of its own.
 */
export async function replayOf(receipt) {
  const checked = await checkReceipt(receipt);
  if (!checked.ok) {
    throw new ReceiptError('That receipt does not check out, so it will not be replayed.');
  }
  return { order: checked.derived.order, showSeed: checked.derived.showSeed, commitment: checked.derived.commitment };
}

/* ------------------------------------------------------------------ */
/* The receipt                                                         */
/* ------------------------------------------------------------------ */

/*
 * Two forms, defined exactly in RANDOMNESS.md and read by both verifiers:
 * JSON, whose order is zero based entry indices (order[0] is the winner's),
 * and a text form a person can paste into a message, whose entries and
 * places are one based. The title, the time, the number of winners and the
 * length of the show are labels: the commitment does not cover them, and
 * RANDOMNESS.md says so.
 */

export class ReceiptError extends Error {}

const fail = (message) => {
  throw new ReceiptError(message);
};

const clip = (s) => (s.length > 60 ? `${s.slice(0, 57)}...` : s);

/*
 * Written out by hand and not with JSON.stringify's indent, which puts every
 * number of the order on a line of its own: a receipt is something a person
 * reads, so the names go one to a line and the order goes on one. It is
 * plain JSON, and any parser reads it.
 */
export function receiptJSON(r) {
  const q = JSON.stringify;
  const fields = [
    ['algorithm', q(r.algorithm)],
    ['title', q(r.title)],
    ['sealedAt', q(r.sealedAt)],
    ['names', `[\n${r.names.map((name) => `    ${q(name)}`).join(',\n')}\n  ]`],
    ['winners', q(r.winners)],
    ...(r.length ? [['length', q(r.length)]] : []),
    ['listDigest', q(r.listDigest)],
    ['commitment', q(r.commitment)],
    ['seed', q(r.seed)],
    ['order', `[${r.order.join(', ')}]`],
  ];
  return `{\n${fields.map(([key, value]) => `  ${q(key)}: ${value}`).join(',\n')}\n}\n`;
}

export function receiptText(r) {
  const lines = [
    'WebFPV Race Name Picker receipt',
    `algorithm: ${r.algorithm}`,
    `title:${r.title ? ` ${r.title}` : ''}`,
    `sealed: ${r.sealedAt}`,
    `winners: ${r.winners}`,
  ];
  if (r.length) {
    lines.push(`length: ${r.length}`);
  }
  lines.push(
    `list digest: ${r.listDigest}`,
    `commitment: ${r.commitment}`,
    `seed: ${r.seed}`,
    '',
    `names: ${r.names.length}`,
  );
  r.names.forEach((name, k) => lines.push(`${k + 1}. ${name}`));
  lines.push('', 'finishing order:');
  r.order.forEach((entry, p) => lines.push(`place ${p + 1}: entry ${entry + 1} (${r.names[entry]})`));
  return `${lines.join('\n')}\n`;
}

const TEXT_FIELDS = {
  algorithm: 'algorithm',
  title: 'title',
  sealed: 'sealedAt',
  winners: 'winners',
  length: 'length',
  'list digest': 'listDigest',
  commitment: 'commitment',
  seed: 'seed',
};

function parseText(text) {
  const lines = text.split(/\r\n|\r|\n/);
  let at = 0;
  const peek = () => {
    while (at < lines.length && lines[at].trim() === '') {
      at += 1;
    }
    return at < lines.length ? lines[at] : null;
  };
  const take = () => {
    const line = peek();
    if (line !== null) {
      at += 1;
    }
    return line;
  };

  const raw = {};
  let places = null;
  if (peek() !== null && /^webfpv race name picker receipt\s*$/i.test(peek())) {
    take();
  }
  for (let line = peek(); line !== null; line = peek()) {
    const m = /^([a-z][a-z ]*?):[ \t]*(.*)$/i.exec(line);
    if (!m) {
      fail(`I could not read this line of the receipt: "${clip(line.trim())}".`);
    }
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    take();
    if (key === 'names') {
      if (raw.names) {
        fail('The receipt lists its names twice.');
      }
      if (!/^\d+$/.test(value)) {
        fail('The line "names:" should say how many names there are.');
      }
      raw.names = [];
      for (let k = 1; k <= Number(value); k += 1) {
        const entry = /^(\d+)\. (.*)$/.exec(take() ?? '');
        if (!entry || Number(entry[1]) !== k) {
          fail(`Name ${k} is missing or out of place in the receipt's list.`);
        }
        raw.names.push(entry[2]);
      }
    } else if (key === 'finishing order') {
      if (places) {
        fail('The receipt gives its finishing order twice.');
      }
      if (!raw.names) {
        fail('The receipt gives its finishing order before its names.');
      }
      places = [];
      for (let p = 1; p <= raw.names.length; p += 1) {
        const m2 = /^place (\d+): entry (\d+) \((.*)\)$/.exec(take() ?? '');
        if (!m2 || Number(m2[1]) !== p) {
          fail(`Place ${p} is missing or out of place in the receipt's finishing order.`);
        }
        const entry = Number(m2[2]);
        if (entry < 1 || entry > raw.names.length || raw.names[entry - 1] !== m2[3]) {
          fail(`Place ${p} says entry ${entry} is "${clip(m2[3])}", and the receipt's own list says otherwise.`);
        }
        places.push(entry - 1);
      }
      raw.order = places;
    } else if (key in TEXT_FIELDS) {
      if (TEXT_FIELDS[key] in raw) {
        fail(`The receipt says "${key}" twice.`);
      }
      raw[TEXT_FIELDS[key]] = value;
    }
    /* Any other "key: value" line is ignored, so a later receipt can add a label without breaking this reader. */
  }
  return raw;
}

const integer = (v, what) => {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
  if (!Number.isInteger(n)) {
    fail(`The receipt's ${what} is not a whole number.`);
  }
  return n;
};

const hex = (v, what, bytes) => {
  if (typeof v !== 'string' || !new RegExp(`^[0-9a-fA-F]{${bytes * 2}}$`).test(v.trim())) {
    fail(`The receipt's ${what} should be ${bytes * 2} hexadecimal digits.`);
  }
  return v.trim().toLowerCase();
};

/* Either form, to one shape, checked for structure and not yet for arithmetic. */
function normalise(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('A receipt is an object with names, a commitment, a seed and an order.');
  }
  if (typeof raw.algorithm !== 'string' || raw.algorithm === '') {
    fail('The receipt does not say which method it was drawn with.');
  }
  if (!Array.isArray(raw.names) || raw.names.some((n) => typeof n !== 'string')) {
    fail('The receipt has no list of names.');
  }
  if (raw.names.length < LIMITS.minNames || raw.names.length > LIMITS.maxNames) {
    fail(`The receipt lists ${raw.names.length} names, and a draw has ${LIMITS.minNames} to ${LIMITS.maxNames}.`);
  }
  if (typeof raw.sealedAt !== 'string' || Number.isNaN(Date.parse(raw.sealedAt))) {
    fail('The receipt does not give a time it was sealed.');
  }
  const winners = integer(raw.winners, 'number of winners');
  if (winners < 1 || winners > Math.min(LIMITS.maxWinners, raw.names.length - 1)) {
    fail(`The receipt has ${winners} winners, which is not possible for ${raw.names.length} names.`);
  }
  if (!Array.isArray(raw.order)) {
    fail('The receipt has no finishing order.');
  }
  const order = raw.order.map((v) => integer(v, 'order'));
  if (order.length !== raw.names.length || new Set(order).size !== order.length || order.some((v) => v < 0 || v >= raw.names.length)) {
    fail('The receipt\'s order is not a list that names every entry once.');
  }
  const out = {
    algorithm: raw.algorithm,
    title: typeof raw.title === 'string' ? raw.title : '',
    sealedAt: raw.sealedAt,
    names: raw.names,
    winners,
    listDigest: hex(raw.listDigest, 'list digest', 32),
    commitment: hex(raw.commitment, 'commitment', 32),
    seed: hex(raw.seed, 'seed', 32),
    order,
  };
  if (raw.length !== undefined && raw.length !== '') {
    out.length = integer(raw.length, 'length');
  }
  return out;
}

/* Pasted text or JSON, or an object already parsed, to a receipt. Throws a ReceiptError that says what is wrong in plain words. */
export function parseReceipt(input) {
  if (input && typeof input === 'object') {
    return normalise(input);
  }
  const text = String(input ?? '').replace(/^﻿/, '').trim();
  if (text === '') {
    fail('Paste a receipt first.');
  }
  if (text[0] === '{' || text[0] === '[') {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      fail(`That starts like JSON and does not parse: ${e.message}`);
    }
    return normalise(raw);
  }
  return normalise(parseText(text));
}

/*
 * A receipt in a link. The results page offers "Verify" as verify.html with
 * the receipt after the #, and the part of an address after the # is never
 * sent to a server: opening the link shows the receipt to the browser and to
 * nobody else. base64url of the JSON form, so the whole receipt is in the
 * address and nothing has to be stored anywhere.
 */
export function receiptFragment(receipt) {
  let binary = '';
  for (const byte of encoder.encode(receiptJSON(receipt))) {
    binary += String.fromCharCode(byte);
  }
  return `receipt=${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

/* The receipt text in a fragment, or null if it holds none. Throws a ReceiptError if it holds one that cannot be decoded. */
export function receiptFromFragment(hash) {
  const m = /(?:^|[#&])receipt=([A-Za-z0-9_-]+)/.exec(String(hash));
  if (!m) {
    return null;
  }
  try {
    const binary = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch (e) {
    return fail('The receipt in this link is damaged, so it cannot be read.');
  }
}

/* What a name may not be for the picker to have written it: found, and reported as a warning, never as a failure. */
function oddNames(names) {
  const odd = [];
  names.forEach((name, k) => {
    if (name === '' || /[\n\r]/.test(name) || name !== name.normalize('NFC') || Array.from(name).length > LIMITS.nameLength || /^\s|\s$|[ \t]{2}/.test(name)) {
      odd.push(k + 1);
    }
  });
  return odd;
}

/*
 * The arithmetic: recompute the list digest, the commitment and the order
 * from the names and the seed, and compare each with what the receipt says.
 * Each check carries one plain sentence about what the tick or the cross
 * means, because a column of ticks that nobody can read is not evidence. It
 * carries what the arithmetic gave (`value`) and what the receipt claimed
 * (`stated`), which a cross shows side by side, and the order is given as
 * one based entry numbers, the way the text receipt writes it.
 */
export async function checkReceipt(receipt) {
  const warnings = [];
  if (receipt.algorithm !== ALGORITHM) {
    return {
      ok: false,
      derived: null,
      warnings,
      checks: [{
        id: 'algorithm',
        ok: false,
        label: 'Method',
        value: receipt.algorithm,
        says: `This verifier checks ${ALGORITHM} and this receipt says ${receipt.algorithm}, so nothing below can be checked here.`,
      }],
    };
  }
  const derived = await derive(receipt.names, fromHex(receipt.seed, 32));
  const sameOrder = derived.order.length === receipt.order.length && derived.order.every((v, k) => v === receipt.order[k]);
  const checks = [
    {
      id: 'digest',
      ok: derived.listDigest === receipt.listDigest,
      label: 'List digest',
      value: derived.listDigest,
      stated: receipt.listDigest,
      says: derived.listDigest === receipt.listDigest
        ? `The ${receipt.names.length} names in this receipt hash to the list digest it states, so the list is the one that was sealed.`
        : 'The names in this receipt do not hash to the list digest it states, so this is not the list that was sealed.',
    },
    {
      id: 'commitment',
      ok: derived.commitment === receipt.commitment,
      label: 'Commitment',
      value: derived.commitment,
      stated: receipt.commitment,
      says: derived.commitment === receipt.commitment
        ? 'This seed and this list produce exactly the commitment that was on screen before the start, so the draw was fixed before the race.'
        : 'This seed and this list do not produce the commitment the receipt states, so this is not the draw that was sealed.',
    },
    {
      id: 'order',
      ok: sameOrder,
      label: 'Finishing order',
      value: derived.order.map((e) => e + 1).join(' '),
      stated: receipt.order.map((e) => e + 1).join(' '),
      says: sameOrder
        ? 'This seed and this list produce exactly this finishing order, so nobody chose it afterwards.'
        : 'This seed and this list produce a different finishing order from the one the receipt states.',
    },
  ];
  const odd = oddNames(receipt.names);
  if (odd.length) {
    warnings.push(`Entries ${odd.slice(0, 5).join(', ')}${odd.length > 5 ? ' and more' : ''} are not in the canonical form the picker seals. The arithmetic above used them as written.`);
  }
  return { ok: checks.every((c) => c.ok), derived, warnings, checks };
}
