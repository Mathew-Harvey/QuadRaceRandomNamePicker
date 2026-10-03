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
  LIVE_DRAW_IMPORTS, ORDINARY_RANDOM, WEB_CRYPTO, domTouches, drawImports, idsAskedFor, importsIn, leadingComment, linesMatching,
  markupOnly, moduleSpecifiers, stripComments, urlProblems,
} from '../scripts/lint.js';
import { CDN, PAGES, policyFor, statedPolicy, withPolicy } from '../scripts/csp.js';

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

test('every module a file names is found, in every spelling, and not in a comment', () => {
  const found = moduleSpecifiers(`
    // import nope from './comment.js';
    import { a, b } from './one.js';
    import * as c from "./two.js";
    import d from './three.js';
    import './four.js';
    export { e } from './five.js';
    export * from './six.js';
    const m = await import('./seven.js');
    const s = 'import x from "./in-a-string.js"';
  `);
  assert.deepEqual(found.sort(), ['./five.js', './four.js', './one.js', './seven.js', './six.js', './three.js', './two.js']);
  assert.deepEqual(moduleSpecifiers('const a = 1;'), []);
});

test('a leading comment is the whole first comment of a script, a page or a Python file, and nothing after it', () => {
  const long = `/*\n * ${'a long explanation '.repeat(400)}\n * GNU General Public License, WebFPV Race Name Picker\n */\nconst x = 1; // GNU General Public License`;
  assert.ok(leadingComment(long).includes('WebFPV Race Name Picker'), 'the licence at the foot of a long comment is found');
  assert.ok(!leadingComment('/* nothing */\nconst a = "GNU General Public License";').includes('GNU'), 'a licence in the code is not a header');
  assert.ok(leadingComment('<!doctype html>\n<!--\n  GNU General Public License\n-->\n<html>').includes('GNU'));
  assert.ok(leadingComment('#!/usr/bin/env python3\n# verify\n#\n# GNU General Public License\nimport os\n# not this').includes('GNU'));
  assert.ok(!leadingComment('#!/usr/bin/env python3\n# verify\nimport os\n# GNU General Public License').includes('GNU'));
  assert.equal(leadingComment('const x = 1;'), '');
});

test('what a live module takes from draw.js is found in every spelling, and the unsafe ones are counted', () => {
  assert.deepEqual(drawImports("import { drawLive, replayOf as r } from './draw.js';"), { names: ['drawLive', 'replayOf'], unsafe: 0 });
  assert.deepEqual(drawImports("import {\n  LIMITS,\n  fingerprint,\n} from './draw.js';").names, ['LIMITS', 'fingerprint']);
  assert.deepEqual(drawImports("// import { drawWithSeed } from './draw.js';\nconst a = 1;"), { names: [], unsafe: 0 });
  assert.deepEqual(drawImports("import { a } from './other.js';"), { names: [], unsafe: 0 });
  assert.equal(drawImports("import * as draw from './draw.js';").unsafe, 1);
  assert.equal(drawImports("import draw from './draw.js';").unsafe, 1);
  assert.equal(drawImports("import draw, { a } from '../src/draw.js';").unsafe, 1);
  assert.equal(drawImports("const m = await import('./draw.js');").unsafe, 1);
  /* The list holds the front door and not the side doors. */
  for (const door of ['drawLive', 'replayOf', 'checkReceipt', 'parseReceipt', 'fingerprint', 'LIMITS']) {
    assert.ok(LIVE_DRAW_IMPORTS.includes(door), door);
  }
  for (const side of ['drawWithSeed', 'derive', 'orderOf', 'shuffle', 'below', 'showSeed', 'listDigest', 'commitment', 'toHex', 'fromHex']) {
    assert.ok(!LIVE_DRAW_IMPORTS.includes(side), side);
  }
});

test('markup is read without its styles and scripts, the lines kept, and an inline style is found in what is left', () => {
  const html = '<style>\n a { color: red }\n</style>\n<p style="x">\n<script>\n el.style = "y";\n</script>\n<!-- <b style="z"> -->\n<p class="a">';
  const markup = markupOnly(html);
  assert.equal(markup.split('\n').length, html.split('\n').length, 'the lines are where they were');
  assert.deepEqual(linesMatching(markup, /\sstyle\s*=/i), [4]);
});

test('the ids a script asks for are found, and a comment does not ask', () => {
  assert.deepEqual(idsAskedFor("const a = $('one'); document.getElementById(\"two\"); // $('three')"), ['one', 'two']);
});

test('a page\'s policy is made from its own text: a changed style is a stale policy, and nothing is let in wholesale', () => {
  const html = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="__CSP__"><script type="importmap">{"imports":{}}</script><style>a{}</style></head><body><script type="module" src="src/app.js"></script></body></html>';
  const policy = policyFor(html, 'index.html');
  const written = withPolicy(html, policy);
  assert.equal(statedPolicy(written), policyFor(written, 'index.html'), 'written, it is current');
  const edited = written.replace('<style>a{}</style>', '<style>a{color:red}</style>');
  assert.notEqual(statedPolicy(edited), policyFor(edited, 'index.html'), 'a style edited after it was written is stale');
  assert.match(policy, /connect-src 'self'/);
  assert.match(policy, new RegExp(`script-src 'self' ${CDN.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`));
  assert.doesNotMatch(policy, /unsafe-/);
  assert.match(policy, /default-src 'none'/);
  assert.ok(!policyFor(html, 'verify.html').includes('cdn.jsdelivr.net'), 'the verifier loads nothing from anywhere');
  assert.deepEqual(Object.keys(PAGES).sort(), ['index.html', 'verify.html']);
});
