/*
 * lint.js: the things about this repository that are true or false, not
 * matters of taste. Checks 9 and 10 of the brief, and the package's shape.
 *
 * WHY THIS EXISTS. The picker's whole claim is that its draw can be audited,
 * and an audit is only as good as the places it does not have to look. So
 * the rules that keep the draw defensible are written as greps, which is
 * what a sceptic would run: the engine's ordinary random function appears
 * nowhere outside sim/, the browser's randomness and hashing appear in
 * src/draw.js and nowhere else, and src/draw.js imports nothing. If one of
 * those stops being true the check says which file, and a reader never has
 * to take the README's word for it.
 *
 * WHAT IT DOES NOT DO. It does not open a browser, so it cannot tell you the
 * page looks right. node scripts/shots.js and a pair of eyes are the answer
 * to that. What this holds is the part that stays true whatever the browser
 * does.
 *
 * The helpers are exported and tests/lint.test.js feeds them bad input, so a
 * lint that passes is a lint that can also fail. A green check that cannot
 * see what it checks is not evidence.
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

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* Files that carry code or markup, and so carry the licence header. */
const SOURCE = /\.(m?js|html|css|py|sh)$/i;
/* Files that are not text, so no text rule reads them. */
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|mp3|ogg|webm|wasm|pdf)$/i;

/* The two dashes, written as escapes so this file does not contain them. */
const DASHES = /[\u2013\u2014]/;

/*
 * The patterns for the rules about randomness, built from pieces so that
 * this file does not trip the rule it enforces. A comment here that wrote
 * the engine's ordinary random function out in full would be a hit, and the
 * whole point of a grep is that it has no exceptions to argue about.
 */
export const ORDINARY_RANDOM = new RegExp(`${'Math'}\\.${'random'}\\b`);
export const WEB_CRYPTO = new RegExp(
  [
    `${'get'}RandomValues`,
    `crypto\\s*\\.\\s*${'subtle'}`,
    `crypto\\s*\\.\\s*random(?:UUID)?\\b`,
    `\\brandom(?:Bytes|Int|Fill|FillSync|UUID)\\b`,
  ].join('|'),
);

/*
 * Every absolute URL the picker's own code may carry: the one CDN request
 * the page makes, links out to documentation and to the family, the licence,
 * and the SVG namespaces, which are identifiers and not requests.
 */
export const ABSOLUTE_OK = [
  'https://cdn.jsdelivr.net/npm/three@0.160.0/',
  'https://www.gnu.org/licenses/',
  'https://github.com/Mathew-Harvey/',
  'https://webfpv.org',
  'https://mathew-harvey.github.io/',
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
];

/*
 * Comments out, strings kept, so a rule about code is not tripped by a
 * sentence and a URL inside a string is not mistaken for a comment. It
 * understands the three quote kinds and escapes. It does not understand a
 * regular expression literal that holds a quote, which is why it is only
 * pointed at files small enough to read, src/draw.js above all.
 */
export function stripComments(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const d = text[i + 1];
    if (c === '/' && d === '/') {
      while (i < text.length && text[i] !== '\n') {
        i += 1;
      }
    } else if (c === '/' && d === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        out += text[i] === '\n' ? '\n' : '';
        i += 1;
      }
      i += 2;
    } else if (c === '"' || c === '\'' || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') {
          out += text[i];
          i += 1;
        }
        out += text[i];
        i += 1;
      }
      out += quote;
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/*
 * A file's leading comment, the whole of it: the first block comment of a
 * script or a stylesheet, the first comment of a page, or the run of # lines
 * at the top of a Python or shell file. The licence grants itself at the foot
 * of that comment, below however much the file has to say about itself, so a
 * window of so many characters would punish a file for explaining itself.
 */
export function leadingComment(text) {
  const body = text.replace(/^#![^\n]*\n/, '').replace(/^\s+/, '');
  if (body.startsWith('/*')) {
    const end = body.indexOf('*/');
    return end < 0 ? body : body.slice(0, end + 2);
  }
  const doc = /^(?:<!doctype[^>]*>\s*)?<!--/i.exec(body);
  if (doc) {
    const end = body.indexOf('-->');
    return end < 0 ? body : body.slice(0, end + 3);
  }
  const lines = [];
  for (const line of body.split('\n')) {
    if (!line.startsWith('#')) {
      break;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/* 1-based line numbers where `pattern` matches `text`. */
export function linesMatching(text, pattern) {
  const hits = [];
  text.split('\n').forEach((line, n) => {
    if (pattern.test(line)) {
      hits.push(n + 1);
    }
  });
  return hits;
}

/* What an import or a dependency would look like in a module that has none. */
export function importsIn(text) {
  const code = stripComments(text);
  return [
    /* A static import, at the start of a statement: import "x", import a, import { a }, import * as a. */
    ...code.matchAll(/(^|[\n;{}])\s*import\s*(?:["'`{*]|[A-Za-z_$])/g),
    /* A dynamic import, anywhere in an expression: await import("x"). */
    ...code.matchAll(/\bimport\s*\(/g),
    ...code.matchAll(/\brequire\s*\(/g),
    /* A re-export, export { a } from "x", which has no import keyword at all. */
    ...code.matchAll(/\bfrom\s*['"`]/g),
  ].length;
}

/* Every module a source file names, static, re-exported or dynamic, as written. */
export function moduleSpecifiers(text) {
  const code = stripComments(text);
  return [
    ...code.matchAll(/(?:^|[\n;{}])\s*import\s*(?:[^'"`;]*?\sfrom\s*)?['"`]([^'"`]+)['"`]/g),
    ...code.matchAll(/\bexport\s[^;'"`]*?\sfrom\s*['"`]([^'"`]+)['"`]/g),
    ...code.matchAll(/\bimport\s*\(\s*['"`]([^'"`]+)['"`]/g),
  ].map((m) => m[1]);
}

/*
 * What the live page may take from src/draw.js: the door a draw goes through
 * (drawLive, and replayOf for a show), the receipt in and out, the canonical
 * forms of a name and a title, the fingerprint, whether this page can draw at
 * all, and the limits. Everything else in that file, drawWithSeed, derive,
 * the shuffle, the digests and the hex helpers, is the verifiers' and the
 * tests', and a live module that reached for one would be a second door.
 */
export const LIVE_DRAW_IMPORTS = Object.freeze([
  'drawLive', 'replayOf', 'parseReceipt', 'checkReceipt', 'receiptJSON', 'receiptText', 'receiptFragment',
  'receiptFromFragment', 'canonicalName', 'canonicalNames', 'canonicalTitle', 'fingerprint', 'available',
  'LIMITS', 'ALGORITHM', 'ReceiptError',
]);

/*
 * The names a module imports from a file called draw.js, and how many of its
 * imports take more than names: a namespace, a default, a mix of the two, or
 * a dynamic import, none of which can be held to a list.
 */
export function drawImports(text) {
  const code = stripComments(text);
  const names = [];
  let unsafe = 0;
  for (const m of code.matchAll(/\bimport\s*([^'"`;]*?)\s*from\s*['"`][^'"`]*\bdraw\.js['"`]/g)) {
    const clause = m[1].trim();
    if (clause.startsWith('{') && clause.endsWith('}')) {
      for (const part of clause.slice(1, -1).split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name) {
          names.push(name);
        }
      }
    } else {
      unsafe += 1;
    }
  }
  if (/\bimport\s*\(\s*['"`][^'"`]*\bdraw\.js['"`]/.test(code)) {
    unsafe += 1;
  }
  return { names, unsafe };
}

/* A page's markup with its styles, scripts and comments blanked, the lines kept, so what is left is what a policy without unsafe-inline would refuse a `style` attribute in. */
export function markupOnly(html) {
  const blank = (m) => m.replace(/[^\n]/g, '');
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, blank).replace(/<script\b[\s\S]*?<\/script>/gi, blank).replace(/<!--[\s\S]*?-->/g, blank);
}

/* The ids a script asks the document for by name: getElementById('x') and the page's own $('x'). */
export function idsAskedFor(text) {
  return [...stripComments(text).matchAll(/(?:getElementById|\$)\(\s*['"`]([^'"`]+)['"`]\s*\)/g)].map((m) => m[1]);
}

/* Identifiers that mean the module touches a page, a store or a window. */
export function domTouches(text) {
  const code = stripComments(text);
  return [...code.matchAll(/\b(document|window|localStorage|sessionStorage|navigator|location|HTMLElement|requestAnimationFrame)\b/g)].map((m) => m[1]);
}

/*
 * References that would break the day the picker is mounted at a path:
 * anything that starts from the site root, and any absolute URL that is not
 * on the short list above.
 */
export function urlProblems(text, allow = ABSOLUTE_OK) {
  const problems = [];
  const rootRelative = [
    /\b(?:href|src|action|poster|data-src)\s*=\s*["']\/(?!\/)/g,
    /\bfetch\(\s*["'`]\/(?!\/)/g,
    /\bfrom\s+["']\/(?!\/)/g,
    /\bimport\(\s*["'`]\/(?!\/)/g,
    /\burl\(\s*["']?\/(?!\/)/g,
    /\bnew\s+(?:URL|Worker|Audio|Image)\(\s*["'`]\/(?!\/)/g,
  ];
  for (const re of rootRelative) {
    for (const m of text.matchAll(re)) {
      problems.push(`from the site root: ${m[0].trim()}`);
    }
  }
  for (const m of text.matchAll(/(?:["'(=]\s*)\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'<>)]*/gi)) {
    problems.push(`protocol relative: ${m[0].trim()}`);
  }
  for (const m of text.matchAll(/https?:\/\/[^\s"'<>)\]`\\]+/g)) {
    if (!allow.some((p) => m[0].startsWith(p))) {
      problems.push(`absolute: ${m[0]}`);
    }
  }
  return problems;
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

function listFiles() {
  /* What git tracks and what it would: untracked files that are not ignored.
   * A deleted file is still in the index until it is committed, so the
   * existence check is part of the listing. */
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' });
  return [...new Set(out.split('\0').filter(Boolean))].filter((rel) => existsSync(join(root, rel))).sort();
}

function walk(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...walk(p, base));
    } else {
      out.push(relative(base, p).split('\\').join('/'));
    }
  }
  return out;
}

async function run() {
  const rows = [];
  let failed = 0;
  /* ok is true, false, or 'skip' for a check with nothing to look at, which
   * is said out loud rather than passed quietly. */
  const check = (name, ok, detail) => {
    rows.push([name, ok === 'skip' ? 'skip' : ok ? 'ok' : 'FAIL', detail]);
    if (ok === false) {
      failed += 1;
    }
  };

  const files = listFiles();
  const text = new Map();
  const read = (rel) => {
    if (!text.has(rel)) {
      text.set(rel, readFileSync(join(root, rel), 'utf8'));
    }
    return text.get(rel);
  };
  const own = files.filter((rel) => !rel.startsWith('sim/') && !BINARY.test(rel));
  const ownSource = own.filter((rel) => SOURCE.test(rel) && !rel.startsWith('prompts/'));
  const where = (hits) => hits.slice(0, 4).join(', ') + (hits.length > 4 ? `, and ${hits.length - 4} more` : '');

  /*
   * 10a. A GPLv3 HEADER ON EVERY SOURCE FILE.
   *
   * The simulator's wording with this project's name, in the file's leading
   * comment, all of it. The brief at prompts/ is a record and not source, and
   * sim/ is the simulator's own, held by the manifest below.
   */
  {
    const bare = ownSource.filter((rel) => {
      const head = leadingComment(read(rel));
      return !(head.includes('GNU General Public License') && head.includes('WebFPV Race Name Picker'));
    });
    check(
      'a GPLv3 header on every source file',
      bare.length === 0,
      bare.length ? `MISSING from ${where(bare)}` : `${ownSource.length} source files`,
    );
  }

  /*
   * 10b. NO EM OR EN DASH ANYWHERE.
   *
   * CLAUDE.md: a comma, a colon or a full stop instead. Every text file this
   * repository owns, the licence and the brief included, and not sim/, whose
   * bytes are the simulator's and are held by the manifest.
   */
  {
    const hits = [];
    for (const rel of own) {
      for (const n of linesMatching(read(rel), DASHES)) {
        hits.push(`${rel}:${n}`);
      }
    }
    check(
      'no em dash or en dash in any text file',
      hits.length === 0,
      hits.length ? `FOUND ${where(hits)}` : `${own.length} text files`,
    );
  }

  /*
   * 9a. THE ENGINE'S ORDINARY RANDOM FUNCTION IS NOWHERE BUT sim/.
   *
   * There it is the simulator's and cosmetic. Here everything that wobbles is
   * seeded from showSeed, so a replay of a receipt is the same race.
   */
  {
    const hits = [];
    for (const rel of ownSource) {
      for (const n of linesMatching(read(rel), ORDINARY_RANDOM)) {
        hits.push(`${rel}:${n}`);
      }
    }
    check(
      'no ordinary random function outside sim/',
      hits.length === 0,
      hits.length ? `FOUND ${where(hits)}` : `${ownSource.length} source files read`,
    );
  }

  /*
   * 9b. THE BROWSER'S RANDOMNESS AND HASHING ARE IN src/draw.js ONLY.
   *
   * The pattern is wider than the two names in the brief: it also refuses
   * the UUID helper and Node's byte and integer helpers, because a seed that
   * came from any of them would be a seed this check had not looked at.
   */
  {
    const hits = [];
    for (const rel of ownSource) {
      if (rel === 'src/draw.js') {
        continue;
      }
      for (const n of linesMatching(read(rel), WEB_CRYPTO)) {
        hits.push(`${rel}:${n}`);
      }
    }
    const drawn = files.includes('src/draw.js');
    check(
      'the browser\'s randomness and hashing are in src/draw.js only',
      hits.length === 0 && (drawn ? WEB_CRYPTO.test(read('src/draw.js')) : true),
      hits.length
        ? `FOUND outside src/draw.js: ${where(hits)}`
        : drawn
          ? 'src/draw.js has them and nothing else does'
          : 'src/draw.js is not written yet, and nothing else has them',
    );
  }

  /*
   * 9c. src/draw.js IMPORTS NOTHING AND TOUCHES NO PAGE.
   *
   * So that it runs unchanged in a browser and in Node, and can be read in
   * one sitting by somebody deciding whether to trust it.
   */
  if (files.includes('src/draw.js')) {
    const draw = read('src/draw.js');
    const imports = importsIn(draw);
    const touches = domTouches(draw);
    check(
      'src/draw.js imports nothing and touches no page',
      imports === 0 && touches.length === 0,
      imports || touches.length
        ? `${imports} import${imports === 1 ? '' : 's'}${touches.length ? `, touches ${[...new Set(touches)].join(', ')}` : ''}`
        : `${draw.split('\n').length} lines, no imports, no DOM`,
    );
  } else {
    check('src/draw.js imports nothing and touches no page', 'skip', 'src/draw.js is not written yet');
  }

  /*
   * THE SEEDED DRAW IS NOT REACHABLE FROM THE LIVE PAGE.
   *
   * No field, address parameter, test hook or key sets the seed or the winner
   * of a live draw. The one function that takes a seed, drawWithSeed, is for
   * tests, verifiers and tools, and the live page reaches the draw through
   * drawLive, which takes none. So index.html and every module under src/
   * except src/draw.js itself must not name it.
   */
  {
    const live = ownSource.filter((rel) => rel === 'index.html' || (/^src\/.*\.js$/.test(rel) && rel !== 'src/draw.js'));
    const hits = [];
    for (const rel of live) {
      for (const n of linesMatching(stripComments(read(rel)), /\bdrawWithSeed\b/)) {
        hits.push(`${rel}:${n}`);
      }
    }
    check(
      'the seeded draw is not reachable from the live page',
      hits.length === 0,
      hits.length ? `NAMED in ${where(hits)}` : `${live.length} live files read`,
    );
  }

  /*
   * verify.html IMPORTS src/draw.js AND NOTHING ELSE.
   *
   * The page a sceptic opens to check a receipt is meant to be one file whose
   * only dependency is the one short file that decides what the ticks say.
   */
  if (files.includes('verify.html')) {
    const specs = [...new Set(moduleSpecifiers(read('verify.html')))];
    check(
      'verify.html imports src/draw.js and nothing else',
      specs.length === 1 && specs[0] === './src/draw.js',
      specs.length === 1 && specs[0] === './src/draw.js' ? 'one import, ./src/draw.js' : `IMPORTS ${specs.join(', ') || 'nothing'}`,
    );
  } else {
    check('verify.html imports src/draw.js and nothing else', 'skip', 'verify.html is not written yet');
  }

  /*
   * THE LIVE PAGE TAKES ONLY THE DRAW'S FRONT DOOR FROM src/draw.js.
   *
   * The names are on a list (LIVE_DRAW_IMPORTS) and a namespace, a default or a
   * dynamic import, which cannot be held to a list, is refused. The seeded
   * draw has its own check above; this is the same wall, one step wider.
   */
  {
    const live = ownSource.filter((rel) => /^src\/.*\.js$/.test(rel) && rel !== 'src/draw.js');
    const bad = [];
    for (const rel of live) {
      const { names, unsafe } = drawImports(read(rel));
      for (const n of names) {
        if (!LIVE_DRAW_IMPORTS.includes(n)) {
          bad.push(`${rel} takes ${n}`);
        }
      }
      if (unsafe) {
        bad.push(`${rel} takes more than names`);
      }
    }
    check(
      'the live page takes only the draw\'s front door from src/draw.js',
      bad.length === 0,
      bad.length ? `FOUND ${where(bad)}` : `${live.length} live modules read`,
    );
  }

  /*
   * EACH PAGE'S CONTENT-SECURITY-POLICY IS THE ONE ITS OWN TEXT MAKES.
   *
   * The two inline blocks are named by hash, so an edit to either is a stale
   * policy and a page whose styles or import map the browser refuses. The
   * policy must also keep connect-src to this origin, which is the line that
   * makes "names never leave the browser" something the browser enforces, and
   * must not allow inline script or style wholesale.
   */
  {
    const { PAGES, policyFor, statedPolicy } = await import('./csp.js');
    const bad = [];
    for (const name of Object.keys(PAGES)) {
      if (!files.includes(name)) {
        continue;
      }
      const html = read(name);
      const stated = statedPolicy(html);
      if (stated !== policyFor(html, name)) {
        bad.push(`${name} is STALE (npm run csp)`);
      }
      if (!stated || !/(?:^|;\s*)connect-src 'self'(?:;|$)/.test(stated) || /'unsafe-(?:inline|eval)'/.test(stated)) {
        bad.push(`${name} does not keep connect-src to this origin, or allows unsafe code`);
      }
    }
    check(
      'each page\'s Content-Security-Policy is the one its own text makes, and keeps requests to this origin',
      bad.length === 0,
      bad.length ? bad.join('; ') : `${Object.keys(PAGES).length} pages`,
    );
  }

  /*
   * NO INLINE STYLE ATTRIBUTES.
   *
   * A policy without unsafe-inline refuses them, silently, and what is lost is
   * a style nobody can find. Styles are set from script through the element's
   * own style object, which the policy does not touch.
   */
  {
    const hits = [];
    for (const rel of ['index.html', 'verify.html']) {
      if (files.includes(rel)) {
        for (const n of linesMatching(markupOnly(read(rel)), /\sstyle\s*=/i)) {
          hits.push(`${rel}:${n}`);
        }
      }
    }
    for (const rel of ownSource.filter((r) => /^src\/.*\.js$/.test(r))) {
      for (const n of linesMatching(stripComments(read(rel)), /setAttribute\(\s*['"`]style|\bcssText\b/)) {
        hits.push(`${rel}:${n}`);
      }
    }
    check(
      'no inline style attributes in a page or set as one from script',
      hits.length === 0,
      hits.length ? `FOUND ${where(hits)}` : 'styles are in the style blocks and on the style object',
    );
  }

  /*
   * EVERY ID THE SCRIPTS ASK FOR IS IN THE PAGE.
   *
   * A getElementById that finds nothing is null, and the first thing done to
   * it is a crash at boot that no unit test can see.
   */
  if (files.includes('index.html')) {
    const html = read('index.html');
    const have = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const missing = [];
    for (const rel of ['src/app.js', 'src/hud.js']) {
      if (files.includes(rel)) {
        for (const id of idsAskedFor(read(rel))) {
          if (!have.has(id)) {
            missing.push(`${rel} asks for #${id}`);
          }
        }
      }
    }
    check(
      'every id the scripts ask for is in index.html',
      missing.length === 0,
      missing.length ? `MISSING ${where(missing)}` : `${have.size} ids on the page`,
    );
  }

  /*
   * NO BETAFLIGHT, AND NO PARTNER'S NAME, IN THE PICKER'S OWN PAGES.
   *
   * This app runs no Betaflight code, and a partner's placement is agreed one
   * at a time. CLAUDE.md, PROGRESS.md and NOTICE say why, and are the places
   * the words may be; sim/ is the simulator's, held by the manifest.
   */
  {
    const words = /betaflight|global drone solutions|mantis fpv|west coast multirotor/i;
    const shipped = own.filter((rel) => /^(?:index|verify)\.html$|^src\/|^tools\/|^README\.md$|^RANDOMNESS\.md$/.test(rel));
    const hits = [];
    for (const rel of shipped) {
      for (const n of linesMatching(read(rel), words)) {
        hits.push(`${rel}:${n}`);
      }
    }
    check(
      'no Betaflight name and no partner\'s name in the picker\'s own pages',
      hits.length === 0,
      hits.length ? `FOUND ${where(hits)}` : `${shipped.length} files read`,
    );
  }

  /* GitHub Pages is told to serve the files as they are. */
  check('.nojekyll is there, so Pages serves the files as they are', files.includes('.nojekyll'), files.includes('.nojekyll') ? 'present' : 'MISSING');

  /*
   * 10c. EVERY URL IS RELATIVE.
   *
   * The picker has to work at mathew-harvey.github.io/QuadRaceRandomNamePicker/
   * and under a later webfpv.org/<mount>/, so nothing may reach another file
   * by a path from the site root, and the only absolute URLs are the CDN's
   * and the short list of links out.
   */
  {
    const pages = ownSource.filter((rel) => /^(index|verify)\.html$/.test(rel) || /^tools\/.*\.html$/.test(rel) || /^src\/.*\.(js|css)$/.test(rel));
    const bad = [];
    for (const rel of pages) {
      for (const p of urlProblems(read(rel))) {
        bad.push(`${rel} (${p})`);
      }
    }
    check(
      'every URL is relative, and the absolute ones are on the list',
      bad.length === 0,
      bad.length ? `FOUND ${where(bad)}` : `${pages.length} pages and modules read`,
    );
  }

  /*
   * 10d. sim/ IS THE SIMULATOR'S CODE, UNEDITED.
   *
   * The manifest holds a SHA-256 for every file as it was copied, so an edit
   * is a mismatch, a file the copy did not make is a stray, and an import
   * that points outside the copy is a hole a recopy would not fill.
   */
  {
    const path = join(root, 'sim/MANIFEST.json');
    if (!existsSync(path)) {
      check('sim/ is the simulator\'s code, unedited', 'skip', 'no sim/MANIFEST.json yet: nothing is vendored');
    } else {
      const { relativeImports } = await import('./vendor.js');
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      const listed = manifest.files || {};
      const edited = [];
      const strays = [];
      const holes = [];
      for (const rel of walk(join(root, 'sim'))) {
        if (rel === 'MANIFEST.json') {
          continue;
        }
        if (!(rel in listed)) {
          strays.push(rel);
          continue;
        }
        const buf = readFileSync(join(root, 'sim', rel));
        if (sha(buf) !== listed[rel]) {
          edited.push(rel);
        }
        if (rel.endsWith('.js')) {
          for (const spec of relativeImports(buf.toString('utf8'))) {
            const to = posix.normalize(posix.join(posix.dirname(rel), spec));
            if (!(to in listed)) {
              holes.push(`${rel} -> ${spec}`);
            }
          }
        }
      }
      for (const rel of Object.keys(listed)) {
        if (!existsSync(join(root, 'sim', rel))) {
          holes.push(`${rel} is in the manifest and not on disk`);
        }
      }
      const detail = [
        edited.length ? `EDITED ${where(edited)}` : '',
        strays.length ? `NOT A COPY ${where(strays)}` : '',
        holes.length ? `UNRESOLVED ${where(holes)}` : '',
      ].filter(Boolean).join('; ');
      check(
        'sim/ is the simulator\'s code, unedited',
        !detail,
        detail || `${Object.keys(listed).length} files as copied from ${String(manifest.commit).slice(0, 12)}${manifest.clean ? '' : ' (the simulator\'s tree was NOT clean)'}`,
      );
    }
  }

  /*
   * THE PACKAGE'S SHAPE: GPL, ES modules, Node 22, no dependencies, and the
   * five scripts the brief names.
   */
  {
    const pkg = JSON.parse(read('package.json'));
    const scripts = ['serve', 'test', 'lint', 'vendor', 'shots'].filter((s) => !(pkg.scripts && s in pkg.scripts));
    const problems = [
      pkg.license === 'GPL-3.0-or-later' ? '' : 'license is not GPL-3.0-or-later',
      pkg.type === 'module' ? '' : 'type is not module',
      pkg.engines && pkg.engines.node === '>=22' ? '' : 'engines.node is not >=22',
      pkg.dependencies || pkg.devDependencies || pkg.optionalDependencies || pkg.peerDependencies ? 'has dependencies' : '',
      scripts.length ? `no script named ${scripts.join(', ')}` : '',
    ].filter(Boolean);
    check('package.json: GPL, modules, Node 22, no dependencies, the five scripts', problems.length === 0, problems.join('; ') || 'as the brief says');
  }

  const w = Math.max(...rows.map((r) => r[0].length));
  console.log('lint: the parts of this repository that are true or false\n');
  for (const [name, status, detail] of rows) {
    console.log(`${status === 'ok' ? ' ok ' : status === 'skip' ? 'skip' : 'FAIL'}  ${name.padEnd(w)}  ${detail}`);
  }
  const skipped = rows.filter((r) => r[1] === 'skip').length;
  console.log(`\n${rows.length - failed - skipped} of ${rows.length} checks clean${skipped ? `, ${skipped} skipped because there is nothing to look at yet` : ''}`);
  return failed;
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && join(process.argv[1]) === self) {
  run().then((failed) => {
    process.exit(failed === 0 ? 0 : 1);
  }).catch((e) => {
    console.error(`lint: ${e.stack || e.message}`);
    process.exit(2);
  });
}
