/*
 * lint.test.js: scripts/lint.js can fail.
 *
 * A lint that has only ever been seen passing is a lint nobody knows can
 * fail. These feed its helpers the exact things the rules are there to
 * catch, and the nearby things they must leave alone.
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
import {
  ORDINARY_RANDOM, WEB_CRYPTO, domTouches, importsIn, linesMatching, stripComments, urlProblems,
} from '../scripts/lint.js';

/* The things the rules look for, assembled here so this file is clean. */
const RANDOM = `${'Math'}.${'random'}()`;
const GRV = `crypto.${'get'}RandomValues(new Uint8Array(32))`;
const SUBTLE = `crypto.${'subtle'}.digest('SHA-256', data)`;
const UUID = `crypto.${'random'}UUID()`;
const BYTES = `${'random'}Bytes(32)`;
const INTEGER = `${'random'}Int(5)`;
const BARE = `crypto.${'random'}()`;
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);

test('the ordinary random function is caught, and a different word is not', () => {
  assert.ok(ORDINARY_RANDOM.test(`const x = ${RANDOM};`));
  assert.ok(!ORDINARY_RANDOM.test('const randomness = 1; // not the function'));
  assert.ok(!ORDINARY_RANDOM.test('seededRandom()'));
});

test('every route to a seed outside src/draw.js is caught', () => {
  for (const bad of [GRV, SUBTLE, UUID, BYTES, INTEGER, BARE]) {
    assert.ok(WEB_CRYPTO.test(bad), bad);
  }
  assert.ok(!WEB_CRYPTO.test('createHash("sha256")'), 'hashing through node:crypto is not randomness');
  assert.ok(!WEB_CRYPTO.test('a subtle bug in the camera'), 'the word on its own is English');
});

test('comments are stripped and strings are kept', () => {
  const code = stripComments(`
    // import x from 'y';
    /* import z from 'w'; */
    const a = 'https://example.com/a'; // trailing
    const b = "// not a comment";
    const c = \`/* nor this */\`;
  `);
  assert.ok(!code.includes('import x'));
  assert.ok(!code.includes('import z'));
  assert.ok(code.includes('https://example.com/a'));
  assert.ok(code.includes('// not a comment'));
  assert.ok(code.includes('/* nor this */'));
});

test('an import is found in all its spellings, and not in a comment', () => {
  assert.equal(importsIn('// import x from "y"\nconst a = 1;'), 0);
  assert.equal(importsIn('const a = 1;\n/* import("z") */'), 0);
  assert.ok(importsIn('import x from "./y.js";') > 0);
  assert.ok(importsIn('import "./y.js";') > 0);
  assert.ok(importsIn('export { a } from "./y.js";') > 0);
  assert.ok(importsIn('const m = await import("./y.js");') > 0);
  assert.ok(importsIn('const m = require("y");') > 0);
});

test('a module that touches the page is found', () => {
  assert.deepEqual(domTouches('const a = 1; // document.title'), []);
  assert.deepEqual(domTouches('document.title = "x"; window.foo();'), ['document', 'window']);
  assert.deepEqual(domTouches('localStorage.setItem(a, b)'), ['localStorage']);
});

test('a reference from the site root is caught, and a relative one is not', () => {
  assert.ok(urlProblems('<img src="/logo.png">').length > 0);
  assert.ok(urlProblems('<a href="/verify.html">').length > 0);
  assert.ok(urlProblems('fetch("/api/x")').length > 0);
  assert.ok(urlProblems('import x from "/src/x.js"').length > 0);
  assert.ok(urlProblems('.a { background: url(/x.png) }').length > 0);
  assert.equal(urlProblems('<img src="logo.png"><a href="./verify.html">').length, 0);
  assert.equal(urlProblems('import x from "./x.js"; fetch("sim/MANIFEST.json")').length, 0);
});

test('an absolute URL is caught unless it is on the list', () => {
  assert.ok(urlProblems('<script src="https://tracker.example.com/a.js">').length > 0);
  assert.ok(urlProblems('"//cdn.example.com/a.js"').length > 0);
  assert.equal(urlProblems('"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"').length, 0);
  assert.ok(urlProblems('"https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js"').length > 0, 'the pin is part of the allowance');
  assert.equal(urlProblems('<https://www.gnu.org/licenses/>').length, 0);
  assert.equal(urlProblems('https://github.com/Mathew-Harvey/QuadRaceRandomNamePicker/blob/main/src/draw.js').length, 0);
});

test('both dashes are found by line, and a hyphen is not', () => {
  const dash = new RegExp(`[${EN}${EM}]`);
  assert.deepEqual(linesMatching(`a\nb ${EM} c\nd\ne ${EN} f`, dash), [2, 4]);
  assert.deepEqual(linesMatching('a - b -- c', dash), []);
});
