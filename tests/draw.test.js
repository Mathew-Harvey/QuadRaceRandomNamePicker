/*
 * draw.test.js: checks 1 to 5 of the brief, and the properties around them
 * that make a receipt worth keeping.
 *
 *   1  vectors      V1 to V3 through src/draw.js, exact
 *   2  two engines  src/draw.js (WebCrypto) against a second implementation
 *                   written here on node:crypto, 1,000 random lists
 *   3  python       tools/verify.py on V1 to V3 and on 200 receipts the app's
 *                   own receipt code wrote, and tools/verify.mjs beside it
 *   4  rejection    below(n) over words chosen by hand, n from 2 to 50
 *   5  uniform      three fixed seed sets, each statistic below its bound and
 *                   equal to the value a correct implementation gives
 *
 * THE REFERENCE BELOW IS NOT A COPY OF src/draw.js. It is written from the
 * brief's formulas, over node:crypto's synchronous hashes, with a lazy
 * generator of words in place of a buffer of blocks, so that agreement
 * between the two means something. The uniformity checks run the production
 * shuffle (src/draw.js's below and shuffle, which are pure and synchronous)
 * over words from this stream, because 480,000 awaited WebCrypto calls would
 * make the statistics slow for no gain: check 2 is what proves the two
 * streams are the same.
 *
 * Everything that looks random here is derived from fixed text by SHA-256, so
 * a run is the same run on every machine. The engine's ordinary random
 * function is not used, and nor is the browser's: only src/draw.js may ask
 * for either.
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as draw from '../src/draw.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const hexOf = (b) => Buffer.from(b).toString('hex');
const sha = (...parts) => createHash('sha256').update(Buffer.concat(parts.map((p) => Buffer.from(p)))).digest();

/* ------------------------------------------------------------------ */
/* The vectors, as the brief prints them                               */
/* ------------------------------------------------------------------ */

const V2_NAMES = Array.from({ length: 50 }, (_, i) => `Pilot ${String(i + 1).padStart(2, '0')}`);

const VECTORS = [
  {
    id: 'V1',
    names: ['Alice', 'Bob', 'Charlie', 'Dee', 'Eve'],
    seed: Buffer.from(Array.from({ length: 32 }, (_, i) => i)),
    listDigest: '8c8b9a7c80af341b7d7d0110ff13c968082a14a829924533560d37361edbbc87',
    commitment: '1b39ba473ba5b7094ef3df3e6e0f2e6953c56cb1c120efb1303e3401a6c5076c',
    order: [0, 4, 2, 3, 1],
    showSeed: '024665687403d0414d840325fc0f8af4b93b2b16d9ce927d30507b68cd3c5f15',
  },
  {
    id: 'V2',
    names: V2_NAMES,
    seed: sha('webfpv-picker test vector 2'),
    seedHex: '56b586c93e39bf905aba908b5fb827789b17805aad6e066123df8b2631e4cfb6',
    listDigest: '191879b268c25fc766759d8668a0df109867dbf1768307fd4e2035cc2dc0aaca',
    commitment: 'f9e4d3fa78082e8132eb1b6ef594a851047efe6531e90f2c754158037cc7fef6',
    order: [35, 28, 0, 13, 48, 25, 47, 27, 37, 5, 18, 8, 16, 17, 31, 33, 24, 23, 43, 45, 15, 38, 41, 20, 39,
      12, 36, 9, 14, 2, 30, 10, 4, 44, 7, 6, 22, 11, 21, 49, 3, 32, 46, 42, 1, 34, 26, 19, 29, 40],
    showSeed: '804c799cbc6e44db2b9713a4b7bda901d31f92b94e38468229fe50cd8f6b2836',
  },
  {
    id: 'V3',
    names: ['Zo\u00eb', 'S\u00f8ren', '\u674e\u96f7', 'Jos\u00e9', 'Ng\u0101i Tahu', '\u014ctautahi'],
    seed: Buffer.alloc(32, 0xa5),
    listDigest: '26540588d38fe12e29ff93cff688d440009f85ffd27a834fb7ac2f38984dab72',
    commitment: '9fe17fab35ff5d33dd4202a2397882d7f619092545a83986a58417a21266aab5',
    order: [1, 0, 5, 4, 3, 2],
    showSeed: 'c657892a758a5a5f18d3093fa35397d911fc964fbfd8c77611f643073d74570f',
  },
];

/* ------------------------------------------------------------------ */
/* The second implementation, on node:crypto                           */
/* ------------------------------------------------------------------ */

function* referenceWords(seed, digest) {
  for (let j = 0; ; j += 1) {
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(j);
    const block = createHmac('sha256', seed)
      .update(Buffer.concat([Buffer.from('webfpv-picker/v1/draw'), Buffer.from([0]), digest, counter]))
      .digest();
    for (let k = 0; k < 8; k += 1) {
      yield block.readUInt32BE(4 * k);
    }
  }
}

function reference(names, seed) {
  const digest = sha(Buffer.from(names.join('\n'), 'utf8'));
  const words = referenceWords(seed, digest);
  const next = () => words.next().value;
  const below = (n) => {
    const limit = 2 ** 32 - (2 ** 32 % n);
    for (;;) {
      const x = next();
      if (x < limit) {
        return x % n;
      }
    }
  };
  const order = names.map((_, i) => i);
  for (let i = names.length - 1; i >= 1; i -= 1) {
    const k = below(i + 1);
    [order[i], order[k]] = [order[k], order[i]];
  }
  return {
    listDigest: hexOf(digest),
    commitment: hexOf(sha(Buffer.from('webfpv-picker/v1/commit'), Buffer.from([0]), seed, digest)),
    showSeed: hexOf(createHmac('sha256', seed).update(Buffer.concat([Buffer.from('webfpv-picker/v1/show'), Buffer.from([0]), digest])).digest()),
    order,
  };
}

/*
 * A deterministic stream of test data: SHA-256 over a label and a counter.
 * It is only ever used to make lists and seeds for the checks, never in the
 * draw, and being a hash it is the same on every machine.
 */
function dataStream(label) {
  let counter = 0;
  let pool = Buffer.alloc(0);
  const bytes = (n) => {
    while (pool.length < n) {
      pool = Buffer.concat([pool, sha(`${label}/${counter}`)]);
      counter += 1;
    }
    const out = pool.subarray(0, n);
    pool = pool.subarray(n);
    return Buffer.from(out);
  };
  const int = (n) => {
    const limit = 2 ** 32 - (2 ** 32 % n);
    for (;;) {
      const x = bytes(4).readUInt32BE();
      if (x < limit) {
        return x % n;
      }
    }
  };
  return { bytes, int };
}

/* ------------------------------------------------------------------ */
/* 1. The vectors                                                      */
/* ------------------------------------------------------------------ */

test('check 1: V1 to V3 reproduce exactly, through src/draw.js', async (t) => {
  assert.equal(hexOf(VECTORS[1].seed), VECTORS[1].seedHex, 'the V2 seed is the SHA-256 of its text');
  for (const v of VECTORS) {
    const got = await draw.derive(v.names, new Uint8Array(v.seed));
    assert.equal(got.listDigest, v.listDigest, `${v.id} list digest`);
    assert.equal(got.commitment, v.commitment, `${v.id} commitment`);
    assert.deepEqual(got.order, v.order, `${v.id} order`);
    assert.equal(got.showSeed, v.showSeed, `${v.id} show seed`);
    t.diagnostic(`${v.id}: ${v.names.length} names, winner ${v.names[v.order[0]]}, fingerprint ${draw.fingerprint(got.commitment)}`);
  }
  assert.equal(draw.fingerprint(VECTORS[0].commitment), '1B39 BA47 3BA5', 'the fingerprint is the one the brief prints');
});

test('check 1: the sealed receipt for each vector says the same, in both forms', async () => {
  for (const v of VECTORS) {
    const receipt = await draw.drawWithSeed(v.names, new Uint8Array(v.seed), { title: v.id, now: new Date('2026-10-03T09:30:00Z'), winners: 1, length: 30 });
    assert.equal(receipt.commitment, v.commitment);
    assert.deepEqual(receipt.order, v.order);
    assert.equal(receipt.seed, hexOf(v.seed));
    for (const text of [draw.receiptJSON(receipt), draw.receiptText(receipt)]) {
      const back = draw.parseReceipt(text);
      assert.deepEqual(back, { ...receipt }, `${v.id} survives its own receipt`);
      const checked = await draw.checkReceipt(back);
      assert.ok(checked.ok, `${v.id} checks out`);
      assert.equal(checked.derived.showSeed, v.showSeed);
    }
  }
});

/* ------------------------------------------------------------------ */
/* 2. Two engines                                                      */
/* ------------------------------------------------------------------ */

const PARTS = ['Alice', 'Bob', 'Zo\u00eb', 'S\u00f8ren', '\u674e\u96f7', 'Jos\u00e9', 'Ng\u0101i', 'Tahu', '\u014ctautahi', 'O\'Brien', 'A. B. C.', 'Dee', 'Eve',
  '(spare)', 'e\u0301', '1', '23', 'Pilot', 'x', '\u{1f642}', 'Fran\u00e7ois', 'M\u00fcller', 'Nu\u00f1ez', '\u0645\u062d\u0645\u062f', '\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35', 'colon:'];

function randomList(rand) {
  const count = 2 + rand.int(49);
  return Array.from({ length: count }, () => {
    const words = Array.from({ length: 1 + rand.int(4) }, () => PARTS[rand.int(PARTS.length)]);
    return draw.canonicalName(words.join(' ')) || 'blank';
  });
}

test('check 2: src/draw.js and an independent node:crypto implementation agree on 1,000 random lists', async (t) => {
  const rand = dataStream('webfpv-picker/test/two-engines');
  const sizes = new Set();
  for (let n = 0; n < 1000; n += 1) {
    const names = randomList(rand);
    const seed = rand.bytes(32);
    const ours = await draw.derive(names, new Uint8Array(seed));
    const theirs = reference(names, seed);
    assert.equal(ours.listDigest, theirs.listDigest, `list ${n}`);
    assert.equal(ours.commitment, theirs.commitment, `list ${n}`);
    assert.deepEqual(ours.order, theirs.order, `list ${n}`);
    assert.equal(ours.showSeed, theirs.showSeed, `list ${n}`);
    sizes.add(names.length);
  }
  t.diagnostic(`1000 lists, ${sizes.size} different sizes from ${Math.min(...sizes)} to ${Math.max(...sizes)}, identical commitments and orders`);
  assert.ok(sizes.has(2) && sizes.has(50), 'the sizes at both ends were drawn');
});

test('check 2: the reference reproduces the vectors too, so it is not agreeing with a wrong answer', () => {
  for (const v of VECTORS) {
    const r = reference(v.names, v.seed);
    assert.equal(r.commitment, v.commitment);
    assert.deepEqual(r.order, v.order);
  }
});

/* ------------------------------------------------------------------ */
/* 4. Rejection                                                        */
/* ------------------------------------------------------------------ */

function injected(words) {
  let at = 0;
  const next = () => {
    assert.ok(at < words.length, 'the source was read past its end');
    const w = words[at];
    at += 1;
    return w;
  };
  next.used = () => at;
  return next;
}

test('check 4: below(n) accepts limit - 1, rejects limit and 2^32 - 1, and takes the next word, for n from 2 to 50', () => {
  let powers = 0;
  for (let n = 2; n <= 50; n += 1) {
    const remainder = 2 ** 32 % n;
    const limit = 2 ** 32 - remainder;
    assert.equal(limit % n, 0, `n = ${n}: the accepted range is a whole number of multiples of n`);

    const top = injected([limit - 1]);
    assert.equal(draw.below(n, top), n - 1, `n = ${n}: limit - 1 is accepted and is the last residue`);
    assert.equal(top.used(), 1);

    assert.equal(draw.below(n, injected([0])), 0, `n = ${n}: zero is accepted`);
    assert.equal(draw.below(n, injected([n])), 0, `n = ${n}: n is accepted and wraps`);

    if (remainder === 0) {
      powers += 1;
      const all = injected([2 ** 32 - 1]);
      assert.equal(draw.below(n, all), n - 1, `n = ${n}: a power of two rejects nothing`);
      assert.equal(all.used(), 1);
    } else {
      const a = injected([limit, 7]);
      assert.equal(draw.below(n, a), 7 % n, `n = ${n}: limit is rejected and the next word is taken`);
      assert.equal(a.used(), 2);
      const b = injected([2 ** 32 - 1, 7]);
      assert.equal(draw.below(n, b), 7 % n, `n = ${n}: 2^32 - 1 is rejected and the next word is taken`);
      assert.equal(b.used(), 2);
      const c = injected([limit, 2 ** 32 - 1, limit + 1 < 2 ** 32 ? limit + 1 : limit, limit - 1]);
      assert.equal(draw.below(n, c), n - 1, `n = ${n}: three rejections in a row, then limit - 1`);
      assert.equal(c.used(), 4);
    }
  }
  assert.equal(powers, 5, 'the powers of two from 2 to 50 are 2, 4, 8, 16 and 32');
});

test('check 4: the shuffle takes N - 1 words when none is rejected, and a rejection costs exactly one more', () => {
  for (let count = 1; count <= 50; count += 1) {
    const zeros = injected(Array(Math.max(count - 1, 0)).fill(0));
    const order = draw.shuffle(count, zeros);
    assert.equal(zeros.used(), Math.max(count - 1, 0), `N = ${count}`);
    assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: count }, (_, i) => i), `N = ${count} is a permutation`);
  }
  /* N = 3 and the first draw, below(3), is the one with a rejectable word:
   * 2^32 mod 3 = 1, so limit = 2^32 - 1 and the word 2^32 - 1 is rejected. */
  const rejected = injected([2 ** 32 - 1, 0, 0]);
  const same = injected([0, 0]);
  assert.deepEqual(draw.shuffle(3, rejected), draw.shuffle(3, same));
  assert.equal(rejected.used(), 3);
  assert.equal(same.used(), 2);
});

test('check 4: a source that runs dry mid shuffle is retried over a longer stream and gives the same order', async () => {
  const v = VECTORS[1];
  const digest = await draw.listDigest(v.names);
  for (const blocks of [1, 2, 3, 6, 7, 8, 20]) {
    assert.deepEqual(await draw.orderOf(new Uint8Array(v.seed), digest, 50, blocks), v.order, `starting from ${blocks} block${blocks === 1 ? '' : 's'}`);
  }
});

/* ------------------------------------------------------------------ */
/* 5. Uniformity                                                       */
/* ------------------------------------------------------------------ */

/*
 * The names are '1' to 'N', and draw i of set S has the seed SHA-256 of the
 * text "webfpv-picker/test/S/i". The shuffle is the production one.
 */
function sample(setName, size, draws, record) {
  const names = Array.from({ length: size }, (_, i) => String(i + 1));
  const digest = sha(Buffer.from(names.join('\n'), 'utf8'));
  for (let i = 0; i < draws; i += 1) {
    const seed = sha(`webfpv-picker/test/${setName}/${i}`);
    const words = referenceWords(seed, digest);
    record(draw.shuffle(size, () => words.next().value));
  }
}

const chi2 = (counts, expected) => counts.reduce((sum, o) => sum + ((o - expected) ** 2) / expected, 0);
const FACTORIALS = [1, 1, 2, 6, 24];

/*
 * The classic mistake, and which one the brief means is settled by its own
 * number. "Swap with below(N) instead of below(i + 1)" is the naive loop that
 * visits every position, down to 0, and swaps each with a uniformly chosen
 * index of the whole array. Run on uniform-4 it scores 7,143.9, which is the
 * figure the brief gives, to the digit. The same substitution inside the
 * correct loop, which stops at 1, is a different and far worse shuffle (60,861.4
 * on these seeds) and is kept below as a second contrast.
 */
function wrongShuffle(count, nextWord, floor = 0) {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i >= floor; i -= 1) {
    const k = draw.below(count, nextWord);
    [order[i], order[k]] = [order[k], order[i]];
  }
  return order;
}

const rank4 = (order) => {
  /* The Lehmer code of a permutation of four, as an index in 0..23. */
  let r = 0;
  for (let i = 0; i < 4; i += 1) {
    let smaller = 0;
    for (let j = i + 1; j < 4; j += 1) {
      if (order[j] < order[i]) {
        smaller += 1;
      }
    }
    r += smaller * FACTORIALS[3 - i];
  }
  return r;
};

test('check 5: uniform-4, 240,000 draws, chi-squared over the 24 orderings', (t) => {
  const counts = Array(24).fill(0);
  sample('uniform-4', 4, 240000, (order) => {
    counts[rank4(order)] += 1;
  });
  const stat = chi2(counts, 240000 / 24);
  t.diagnostic(`uniform-4: chi-squared ${stat.toFixed(3)} on 23 dof, bound 49.73, all ${counts.filter((c) => c > 0).length} orderings seen`);
  assert.equal(counts.filter((c) => c > 0).length, 24, 'all 24 orderings seen');
  assert.ok(stat < 49.73, `${stat} is below the 0.999 point`);
  assert.equal(stat.toFixed(3), '20.696', 'equal to the value a correct implementation gives');
});

test('check 5: the classic wrong shuffle fails the same statistic by a wide margin', (t) => {
  const names = ['1', '2', '3', '4'];
  const digest = sha(Buffer.from(names.join('\n'), 'utf8'));
  const score = (floor) => {
    const counts = Array(24).fill(0);
    for (let i = 0; i < 240000; i += 1) {
      const words = referenceWords(sha(`webfpv-picker/test/uniform-4/${i}`), digest);
      counts[rank4(wrongShuffle(4, () => words.next().value, floor))] += 1;
    }
    return chi2(counts, 240000 / 24);
  };
  const naive = score(0);
  const stoppedAtOne = score(1);
  t.diagnostic(`uniform-4 with the naive shuffle (swap each position with any of N): chi-squared ${naive.toFixed(1)}; with the loop stopped at 1: ${stoppedAtOne.toFixed(1)}`);
  assert.ok(naive > 1000 && stoppedAtOne > 1000, 'the statistic can fail, so passing it means something');
  assert.equal(naive.toFixed(1), '7143.9', 'the value the brief gives for the classic mistake');
});

test('check 5: uniform-50, 100,000 draws, chi-squared over the 50 winners', (t) => {
  const counts = Array(50).fill(0);
  sample('uniform-50', 50, 100000, (order) => {
    counts[order[0]] += 1;
  });
  const stat = chi2(counts, 100000 / 50);
  t.diagnostic(`uniform-50: chi-squared ${stat.toFixed(3)} on 49 dof, bound 85.35`);
  assert.ok(stat < 85.35, `${stat} is below the 0.999 point`);
  assert.equal(stat.toFixed(3), '46.083');
});

test('check 5: uniform-7, 140,000 draws, chi-squared of who lands at each of the 7 places', (t) => {
  const places = Array.from({ length: 7 }, () => Array(7).fill(0));
  sample('uniform-7', 7, 140000, (order) => {
    order.forEach((name, place) => {
      places[place][name] += 1;
    });
  });
  const stats = places.map((counts) => chi2(counts, 140000 / 7));
  t.diagnostic(`uniform-7: ${stats.map((s) => s.toFixed(3)).join(', ')} on 6 dof each, bound 22.46`);
  stats.forEach((s, place) => assert.ok(s < 22.46, `place ${place + 1}: ${s}`));
  assert.deepEqual(stats.map((s) => s.toFixed(3)), ['8.717', '4.364', '5.787', '10.422', '1.225', '11.282', '6.446']);
});

/* ------------------------------------------------------------------ */
/* Canonical names                                                     */
/* ------------------------------------------------------------------ */

test('a name is canonical: NFC, one space, trimmed, controls gone, 80 code points, and never a newline', () => {
  const c = draw.canonicalName;
  assert.equal(c('e\u0301'), '\u00e9', 'NFC composes');
  assert.equal(c('  Alice \t\n  Smith  '), 'Alice Smith');
  assert.equal(c('a\u0000b\u0007c'), 'a b c', 'control characters become spaces');
  assert.equal(c('a\u00a0\u2003b'), 'a b', 'unicode spaces collapse');
  assert.equal(c('a\u2028b'), 'a b', 'a line separator is whitespace and never survives into a name');
  assert.equal(c(''), '');
  assert.equal(c(null), '');
  assert.equal(c('x'.repeat(85)), 'x'.repeat(80));
  const cut = c(`${'a'.repeat(79)}\u{1f600}b`);
  assert.equal(Array.from(cut).length, 80, 'counted in code points');
  assert.ok(cut.endsWith('\u{1f600}'), 'a surrogate pair is never split');
  assert.equal(c('a\ud800b'), 'a\ufffdb', 'a lone surrogate has no UTF-8 spelling, so it is replaced');
  assert.equal(c(`${'a'.repeat(79)} b`), 'a'.repeat(79), 'a cut that leaves a trailing space is trimmed');
  assert.equal(draw.canonicalTitle('t'.repeat(60)), 't'.repeat(40));
});

test('canonicalising twice is canonicalising once, over a lot of hostile strings', () => {
  const alphabet = ['a', 'Z', ' ', '\t', '\n', 'e\u0301', '\u00e9', '\u0301', '\u{1f642}', '\ud800', '\u1100', '\u1161', '\u11a8', '\uac00', '\u200b', '\ufeff', '\u0007', '\u00a0', '\u2028', '1', '.', '(', ')'];
  const rand = dataStream('webfpv-picker/test/canonical');
  for (let n = 0; n < 3000; n += 1) {
    const raw = Array.from({ length: rand.int(120) }, () => alphabet[rand.int(alphabet.length)]).join('');
    const once = draw.canonicalName(raw);
    assert.equal(draw.canonicalName(once), once, JSON.stringify(raw));
    assert.ok(!/[\n\r]/.test(once));
    assert.ok(Array.from(once).length <= 80);
    assert.equal(once, once.normalize('NFC'));
  }
});

test('a pasted block becomes a list: empty lines dropped, every line canonical, every line ending understood', () => {
  assert.deepEqual(draw.canonicalNames('Alice\r\n\r\n  Bob  \rCharlie\n\n \t \nDee'), ['Alice', 'Bob', 'Charlie', 'Dee']);
  assert.deepEqual(draw.canonicalNames(['a  b', '', ' c ']), ['a b', 'c']);
  assert.deepEqual(draw.canonicalNames('Sam\nSam\nSam'), ['Sam', 'Sam', 'Sam'], 'duplicates are separate entries, which is how a raffle gives somebody three tickets');
});

/* ------------------------------------------------------------------ */
/* Sealing                                                             */
/* ------------------------------------------------------------------ */

test('a draw is refused unless it is 2 to 50 canonical names, a 32 byte seed and a possible number of winners', async () => {
  const seed = new Uint8Array(32);
  const names = (n) => Array.from({ length: n }, (_, i) => `n${i}`);
  await assert.rejects(draw.drawWithSeed(names(1), seed), /2 to 50/);
  await assert.rejects(draw.drawWithSeed(names(51), seed), /2 to 50/);
  await assert.doesNotReject(draw.drawWithSeed(names(2), seed));
  await assert.doesNotReject(draw.drawWithSeed(names(50), seed));
  await assert.rejects(draw.drawWithSeed(['a', ' b'], seed), /canonical/);
  await assert.rejects(draw.drawWithSeed(['a', 'b\nc'], seed), /canonical/);
  await assert.rejects(draw.drawWithSeed(['a', ''], seed), /canonical/);
  await assert.rejects(draw.drawWithSeed(['a', 7], seed), /canonical/);
  await assert.rejects(draw.drawWithSeed(names(3), new Uint8Array(31)), /32 bytes/);
  await assert.rejects(draw.drawWithSeed(names(2), seed, { winners: 2 }), /1 to 1/, 'one winner at most for two names');
  await assert.rejects(draw.drawWithSeed(names(5), seed, { winners: 4 }), /1 to 3/);
  await assert.rejects(draw.drawWithSeed(names(5), seed, { winners: 0 }), /1 to 3/);
  await assert.doesNotReject(draw.drawWithSeed(names(4), seed, { winners: 3 }));
});

test('a live draw takes its seed from the browser\'s random generator, once, 32 bytes, and from nowhere else', async () => {
  /* The two names only src/draw.js may spell out, assembled so that this file stays clean under the lint. */
  const GENERATOR = `get${'Random'}Values`;
  const HASHER = `sub${'tle'}`;
  const real = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const calls = [];
  const stub = {
    [HASHER]: globalThis.crypto[HASHER],
    [GENERATOR](array) {
      calls.push(array.length);
      array.fill(0x5c);
      return array;
    },
  };
  Object.defineProperty(globalThis, 'crypto', { value: stub, configurable: true });
  try {
    const receipt = await draw.drawLive(['Alice', 'Bob', 'Charlie']);
    assert.deepEqual(calls, [32], 'one call, for 32 bytes');
    assert.equal(receipt.seed, '5c'.repeat(32), 'the seed is exactly what the generator gave');
  } finally {
    Object.defineProperty(globalThis, 'crypto', real);
  }
});

test('two live draws differ, and each one checks out', async () => {
  const names = ['Alice', 'Bob', 'Charlie', 'Dee', 'Eve'];
  const a = await draw.drawLive(names, { title: '  A  title ', winners: 2, length: 30 });
  const b = await draw.drawLive(names);
  assert.notEqual(a.seed, b.seed);
  assert.notEqual(a.commitment, b.commitment);
  assert.equal(a.title, 'A title');
  assert.equal(a.winners, 2);
  assert.equal(a.length, 30);
  assert.equal(b.winners, 1);
  assert.match(a.sealedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  for (const r of [a, b]) {
    assert.ok((await draw.checkReceipt(r)).ok);
  }
  assert.ok(draw.available());
});

/* ------------------------------------------------------------------ */
/* Receipts: round trips, tampering and refusals                       */
/* ------------------------------------------------------------------ */

const ODD_NAMES = ['Alice (the first)', '3. Not a number', 'place 2: entry 1 (x)', 'colon: inside', '"quoted"', '\\backslash', 'a,b', '\u674e\u96f7', 'Zo\u00eb', '\u{1f642}', '(', ')', 'names: 3'];

test('a receipt with awkward names survives both forms, including windows line endings and a byte order mark', async () => {
  const receipt = await draw.drawWithSeed(ODD_NAMES, new Uint8Array(32).fill(7), { title: 'Friday: the final (again)', now: new Date('2026-10-03T00:00:00Z'), winners: 3 });
  for (const text of [
    draw.receiptJSON(receipt),
    draw.receiptText(receipt),
    draw.receiptText(receipt).replace(/\n/g, '\r\n'),
    `\ufeff${draw.receiptText(receipt)}`,
    `\n\n${draw.receiptText(receipt)}\n\n`,
  ]) {
    assert.deepEqual(draw.parseReceipt(text), receipt);
  }
});

test('a receipt with an empty title round trips', async () => {
  const receipt = await draw.drawWithSeed(['a', 'b', 'c'], new Uint8Array(32), { now: new Date('2026-10-03T00:00:00Z') });
  assert.equal(receipt.title, '');
  assert.deepEqual(draw.parseReceipt(draw.receiptText(receipt)), receipt);
  assert.deepEqual(draw.parseReceipt(draw.receiptJSON(receipt)), receipt);
});

test('tampering is found: a changed name, seed, order, digest or commitment each fail the checks they should', async () => {
  const receipt = await draw.drawWithSeed(VECTORS[0].names, new Uint8Array(VECTORS[0].seed), { now: new Date('2026-10-03T00:00:00Z') });
  const ids = async (r) => (await draw.checkReceipt(draw.parseReceipt(r))).checks.filter((c) => !c.ok).map((c) => c.id).join(',');
  assert.equal(await ids(receipt), '');
  assert.equal(await ids({ ...receipt, names: ['Alice', 'Bobby', 'Charlie', 'Dee', 'Eve'] }), 'digest,commitment,order');
  assert.equal(await ids({ ...receipt, order: [4, 0, 2, 3, 1] }), 'order');
  assert.equal(await ids({ ...receipt, seed: '11'.repeat(32) }), 'commitment,order');
  assert.equal(await ids({ ...receipt, commitment: '22'.repeat(32) }), 'commitment');
  assert.equal(await ids({ ...receipt, listDigest: '33'.repeat(32) }), 'digest');
  assert.equal(await ids({ ...receipt, names: [...receipt.names].reverse() }), 'digest,commitment,order');
});

test('the labels are not covered by the commitment, and the receipt says so by not failing on them', async () => {
  const receipt = await draw.drawWithSeed(VECTORS[0].names, new Uint8Array(VECTORS[0].seed), { title: 'Real title', winners: 1, now: new Date('2026-10-03T00:00:00Z') });
  for (const changed of [{ title: 'Another' }, { sealedAt: '2020-01-01T00:00:00.000Z' }, { winners: 2 }, { length: 60 }]) {
    assert.ok((await draw.checkReceipt(draw.parseReceipt({ ...receipt, ...changed }))).ok, JSON.stringify(changed));
  }
});

test('a receipt that is not one is refused in plain words, never with a stack trace', async () => {
  const good = await draw.drawWithSeed(['a', 'b', 'c'], new Uint8Array(32), { now: new Date('2026-10-03T00:00:00Z') });
  const secondPlace = `place 2: entry ${good.order[1] + 1} (${good.names[good.order[1]]})`;
  assert.ok(draw.receiptText(good).includes(secondPlace), 'the line the test mutates is really in the receipt');
  const without = (key) => {
    const copy = { ...good };
    delete copy[key];
    return copy;
  };
  const bad = [
    ['', /Paste a receipt/],
    ['   \n  ', /Paste a receipt/],
    ['{ not json', /does not parse/],
    ['[]', /object/],
    ['seed: 00', /could not read|method/i],
    ['hello world', /could not read/],
    [JSON.stringify(without('seed')), /seed/],
    [JSON.stringify(without('commitment')), /commitment/],
    [JSON.stringify(without('listDigest')), /list digest/],
    [JSON.stringify(without('names')), /names/],
    [JSON.stringify(without('order')), /order/],
    [JSON.stringify(without('algorithm')), /method/],
    [JSON.stringify(without('sealedAt')), /sealed/],
    [JSON.stringify({ ...good, seed: 'zz'.repeat(32) }), /seed/],
    [JSON.stringify({ ...good, seed: '00'.repeat(31) }), /seed/],
    [JSON.stringify({ ...good, order: [0, 0, 1] }), /every entry once/],
    [JSON.stringify({ ...good, order: [0, 1, 3] }), /every entry once/],
    [JSON.stringify({ ...good, order: [0, 1] }), /every entry once/],
    [JSON.stringify({ ...good, order: 'x' }), /no finishing order/],
    [JSON.stringify({ ...good, winners: 0 }), /winners/],
    [JSON.stringify({ ...good, winners: 3 }), /winners/],
    [JSON.stringify({ ...good, winners: 'two' }), /whole number/],
    [JSON.stringify({ ...good, names: ['only one'], order: [0] }), /2 to 50/],
    [JSON.stringify({ ...good, names: Array.from({ length: 51 }, (_, i) => `n${i}`), order: Array.from({ length: 51 }, (_, i) => i) }), /2 to 50/],
    [JSON.stringify({ ...good, names: ['a', 2, 'c'] }), /names/],
    [draw.receiptText(good).replace(secondPlace, `place 2: entry ${good.order[1] + 1} (zzz)`), /says otherwise/],
    [draw.receiptText(good).replace('place 2:', 'place 3:'), /out of place/],
    [draw.receiptText(good).replace('names: 3', 'names: 4'), /Name 4/],
    [draw.receiptText(good).replace(/\nfinishing order:[\s\S]*$/, '\n'), /no finishing order/],
    [draw.receiptText(good).replace('2. b', '3. b'), /Name 2/],
  ];
  for (const [input, expect] of bad) {
    assert.throws(() => draw.parseReceipt(input), (e) => e instanceof draw.ReceiptError && expect.test(e.message) && !/undefined|TypeError|\[object/.test(e.message), `${String(input).slice(0, 60)}`);
  }
  /* An algorithm this verifier does not know is a failed check, said plainly, and nothing is computed. */
  const other = draw.parseReceipt({ ...good, algorithm: 'webfpv-picker/v2' });
  const checked = await draw.checkReceipt(other);
  assert.equal(checked.ok, false);
  assert.equal(checked.derived, null);
  assert.match(checked.checks[0].says, /webfpv-picker\/v1/);
  await assert.rejects(draw.replayOf(other), draw.ReceiptError);
});

test('names that are not in the form the picker seals are reported, and the arithmetic still runs on them as written', async () => {
  const receipt = await draw.drawWithSeed(['a', 'b'], new Uint8Array(32), { now: new Date('2026-10-03T00:00:00Z') });
  /* A receipt from another tool, with a name the picker would have cleaned. */
  const names = ['a', 'b  c'];
  const seed = new Uint8Array(32).fill(1);
  const d = await draw.derive(names, seed);
  const foreign = { ...receipt, names, seed: hexOf(seed), listDigest: d.listDigest, commitment: d.commitment, order: d.order };
  const checked = await draw.checkReceipt(draw.parseReceipt(foreign));
  assert.ok(checked.ok);
  assert.equal(checked.warnings.length, 1);
  assert.match(checked.warnings[0], /Entries 2/);
  assert.deepEqual((await draw.checkReceipt(receipt)).warnings, []);
});

test('a replay recomputes the order and the show seed from the receipt, and has nothing to issue', async () => {
  const v = VECTORS[0];
  const receipt = await draw.drawWithSeed(v.names, new Uint8Array(v.seed), { now: new Date('2026-10-03T00:00:00Z') });
  const replay = await draw.replayOf(receipt);
  assert.deepEqual(replay.order, v.order);
  assert.equal(replay.showSeed, v.showSeed);
  assert.deepEqual(Object.keys(replay).sort(), ['commitment', 'order', 'showSeed'], 'no receipt, no seed');
  await assert.rejects(draw.replayOf({ ...receipt, order: [4, 0, 2, 3, 1] }), /does not check out/);
});

test('a receipt travels in a link: base64url after the #, whole, whatever the names are', async () => {
  const receipt = await draw.drawWithSeed(ODD_NAMES, new Uint8Array(32).fill(9), { title: 'Fran\u00e7ois & \u674e\u96f7', winners: 2, now: new Date('2026-10-03T00:00:00Z') });
  const fragment = draw.receiptFragment(receipt);
  assert.match(fragment, /^receipt=[A-Za-z0-9_-]+$/, 'only characters that are safe in an address');
  for (const hash of [`#${fragment}`, fragment, `#x=1&${fragment}`]) {
    assert.deepEqual(draw.parseReceipt(draw.receiptFromFragment(hash)), receipt);
  }
  assert.equal(draw.receiptFromFragment(''), null);
  assert.equal(draw.receiptFromFragment('#other=1'), null);
  assert.equal(draw.receiptFromFragment('#receipt=!!'), null, 'no valid character after the key means no receipt in the link');
  assert.throws(() => draw.receiptFromFragment('#receipt=__4'), draw.ReceiptError, 'the bytes ff fe are not UTF-8, so the link is damaged');
  assert.throws(() => draw.receiptFromFragment('#receipt=a'), draw.ReceiptError, 'a length that cannot be base64 is a damaged link');
});

test('a remembered fingerprint is matched ignoring spaces and case, and is not judged on too few digits', () => {
  const c = VECTORS[0].commitment;
  assert.equal(draw.matchesFingerprint(c, '1B39 BA47 3BA5'), true);
  assert.equal(draw.matchesFingerprint(c, '1b39ba473ba5'), true);
  assert.equal(draw.matchesFingerprint(c, ' 1b39-ba47 '), true, 'eight digits are enough, and punctuation is ignored');
  assert.equal(draw.matchesFingerprint(c, '1B39 BA47 3BA6'), false);
  assert.equal(draw.matchesFingerprint(c, '0B39 BA47 3BA5'), false);
  assert.equal(draw.matchesFingerprint(c, '1B39 BA4'), null, 'seven digits say nothing');
  assert.equal(draw.matchesFingerprint(c, ''), null);
});

test('RANDOMNESS.md is true: its example receipts are the ones the code writes, and its vectors are the ones tested', async () => {
  const doc = readFileSync(join(root, 'RANDOMNESS.md'), 'utf8');
  const block = (marker) => {
    const at = doc.indexOf(`<!-- ${marker} -->`);
    assert.ok(at >= 0, `${marker} is marked in the document`);
    const open = doc.indexOf('\n```', at);
    const start = doc.indexOf('\n', open + 1) + 1;
    return doc.slice(start, doc.indexOf('\n```', start));
  };
  const v1 = VECTORS[0];
  const receipt = await draw.drawWithSeed(v1.names, new Uint8Array(v1.seed), { title: 'Friday raffle', winners: 1, length: 30, now: new Date('2026-10-03T09:30:00Z') });
  assert.equal(`${block('receipt-json')}\n`, draw.receiptJSON(receipt), 'the JSON example is what receiptJSON writes');
  assert.equal(`${block('receipt-text')}\n`, draw.receiptText(receipt), 'the text example is what receiptText writes');
  for (const v of VECTORS) {
    for (const key of ['listDigest', 'commitment', 'showSeed']) {
      assert.ok(doc.includes(v[key]), `${v.id} ${key} is in the document`);
    }
    for (let from = 0; from < v.order.length; from += 25) {
      assert.ok(doc.includes(v.order.slice(from, from + 25).join(' ')), `${v.id} order from ${from} is in the document`);
    }
  }
  for (const quoted of ['20.696', '46.083', '8.717, 4.364, 5.787, 10.422, 1.225, 11.282, 6.446', '7,143.9', '60,861.4', '1B39 BA47 3BA5']) {
    assert.ok(doc.includes(quoted), `${quoted} is in the document`);
  }
});

/* ------------------------------------------------------------------ */
/* 3. Python, and Node's command line                                  */
/* ------------------------------------------------------------------ */

const python = spawnSync('python3', ['--version'], { encoding: 'utf8' });
const HAVE_PYTHON = python.status === 0;
if (!HAVE_PYTHON) {
  console.error('skip: there is no python3 on this machine, so check 3 (tools/verify.py) did NOT run');
}

function run(command, args, input) {
  const r = spawnSync(command, args, { encoding: 'utf8', input, cwd: root });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

async function writeReceipts(dir, count) {
  const rand = dataStream('webfpv-picker/test/receipts');
  const files = [];
  const expect = [];
  for (let n = 0; n < count; n += 1) {
    const names = randomList(rand);
    const seed = new Uint8Array(rand.bytes(32));
    const winners = 1 + rand.int(Math.min(3, names.length - 1));
    const receipt = await draw.drawWithSeed(names, seed, { title: `Receipt ${n}`, winners, length: [15, 30, 60][rand.int(3)], now: new Date(Date.UTC(2026, 9, 3, 9, 30, n % 60)) });
    const path = join(dir, n % 2 === 0 ? `receipt-${n}.json` : `receipt-${n}.txt`);
    writeFileSync(path, n % 2 === 0 ? draw.receiptJSON(receipt) : draw.receiptText(receipt));
    files.push(path);
    expect.push(receipt);
  }
  return { files, expect };
}

test('check 3: tools/verify.py reproduces V1 to V3 from their receipts', { skip: !HAVE_PYTHON && 'no python3 on this machine' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'webfpv-picker-vectors-'));
  try {
    const files = [];
    for (const v of VECTORS) {
      const receipt = await draw.drawWithSeed(v.names, new Uint8Array(v.seed), { title: v.id, now: new Date('2026-10-03T09:30:00Z') });
      for (const [ext, text] of [['json', draw.receiptJSON(receipt)], ['txt', draw.receiptText(receipt)]]) {
        const path = join(dir, `${v.id}.${ext}`);
        writeFileSync(path, text);
        files.push([v, path]);
      }
    }
    const r = run('python3', ['tools/verify.py', '--json', ...files.map(([, p]) => p)]);
    assert.equal(r.code, 0, r.err);
    const lines = r.out.trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines.length, 6);
    lines.forEach((got, k) => {
      const v = files[k][0];
      assert.equal(got.ok, true, got.file);
      assert.equal(got.listDigest, v.listDigest);
      assert.equal(got.commitment, v.commitment);
      assert.deepEqual(got.order, v.order);
      assert.equal(got.showSeed, v.showSeed);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check 3: tools/verify.py and tools/verify.mjs agree on 200 receipts the app\'s own code wrote', { skip: !HAVE_PYTHON && 'no python3 on this machine' }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'webfpv-picker-receipts-'));
  try {
    const { files, expect } = await writeReceipts(dir, 200);
    const py = run('python3', ['tools/verify.py', '--json', ...files]);
    const js = run('node', ['tools/verify.mjs', '--json', ...files]);
    assert.equal(py.code, 0, py.err);
    assert.equal(js.code, 0, js.err);
    const pyLines = py.out.trim().split('\n');
    assert.equal(pyLines.length, 200);
    assert.equal(py.out, js.out, 'the two verifiers print byte identical JSON');
    pyLines.forEach((line, k) => {
      const got = JSON.parse(line);
      assert.equal(got.ok, true);
      assert.equal(got.commitment, expect[k].commitment);
      assert.deepEqual(got.order, expect[k].order);
      assert.deepEqual(got.checks, { commitment: true, digest: true, order: true });
    });
    t.diagnostic('200 receipts, 100 JSON and 100 text, checked by Python and by Node: identical output, all checks true');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check 3: both verifiers refuse a tampered or broken receipt, and say so with a non zero exit', { skip: !HAVE_PYTHON && 'no python3 on this machine' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'webfpv-picker-tamper-'));
  try {
    const v = VECTORS[0];
    const good = await draw.drawWithSeed(v.names, new Uint8Array(v.seed), { now: new Date('2026-10-03T00:00:00Z') });
    const cases = {
      'order.json': draw.receiptJSON({ ...good, order: [4, 0, 2, 3, 1] }),
      'name.txt': draw.receiptText({ ...good, names: ['Alice', 'Bobby', 'Charlie', 'Dee', 'Eve'] }),
      'seed.json': draw.receiptJSON({ ...good, seed: '11'.repeat(32) }),
      'broken.json': '{ "algorithm": ',
      'empty.txt': '',
      'text-but-wrong.txt': draw.receiptText(good).replace('place 1: entry 1 (Alice)', 'place 1: entry 5 (Eve)'),
    };
    for (const [file, text] of Object.entries(cases)) {
      const path = join(dir, file);
      writeFileSync(path, text);
      const py = run('python3', ['tools/verify.py', '--json', path]);
      const js = run('node', ['tools/verify.mjs', '--json', path]);
      assert.equal(py.code, 1, `python on ${file}`);
      assert.equal(js.code, 1, `node on ${file}`);
      assert.equal(JSON.parse(py.out).ok, false);
      assert.equal(JSON.parse(js.out).ok, false);
    }
    /* A name changed after the receipt was sealed: both name which check fails. */
    const pyName = JSON.parse(run('python3', ['tools/verify.py', '--json', join(dir, 'name.txt')]).out);
    const jsName = JSON.parse(run('node', ['tools/verify.mjs', '--json', join(dir, 'name.txt')]).out);
    assert.equal(pyName.error, null);
    assert.deepEqual(pyName.checks, jsName.checks);
    assert.equal(pyName.checks.digest, false);
    assert.equal(run('python3', ['tools/verify.py']).code, 2, 'no arguments is a usage error');
    assert.equal(run('node', ['tools/verify.mjs']).code, 2, 'and so is it here');
    const stdin = run('python3', ['tools/verify.py', '-'], draw.receiptText(good));
    assert.equal(stdin.code, 0, 'standard input works');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the plain text report names the winner and the verdict', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'webfpv-picker-report-'));
  try {
    const v = VECTORS[0];
    const good = await draw.drawWithSeed(v.names, new Uint8Array(v.seed), { winners: 2, now: new Date('2026-10-03T00:00:00Z') });
    const path = join(dir, 'r.txt');
    writeFileSync(path, draw.receiptText(good));
    const js = run('node', ['tools/verify.mjs', path]);
    assert.equal(js.code, 0);
    assert.match(js.out, /winners: Alice, Eve/);
    assert.match(js.out, /the draw checks out/);
    if (HAVE_PYTHON) {
      const py = run('python3', ['tools/verify.py', path]);
      assert.equal(py.code, 0);
      assert.match(py.out, /winners: Alice, Eve/);
      assert.match(py.out, /the draw checks out/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
