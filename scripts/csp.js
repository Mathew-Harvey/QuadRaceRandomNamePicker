/*
 * csp.js: the Content-Security-Policy of each page, from the page.
 *
 *   node scripts/csp.js          write the policy into each page's meta tag
 *   node scripts/csp.js --check  say whether each page's policy is the one its own text makes
 *
 * THE PROMISE this enforces is the one the footer makes: names and logos never
 * leave the browser. There is no server to send them to, and the policy says
 * so in a form the browser holds the page to: nothing may be fetched from any
 * origin but this one, and the only script from anywhere else is three.js,
 * from the CDN the family pins, at the one version the family pins. `connect-src 'self'` is the line that matters,
 * because fetch, XMLHttpRequest, WebSocket and sendBeacon are all governed by
 * it, and a page that cannot make a request cannot send a name anywhere.
 *
 * AN INLINE BLOCK IS NAMED BY ITS HASH. The page has two: the import map, and
 * the styles, which are inline so that how the page looks depends on no
 * server's MIME table. A policy that allowed 'unsafe-inline' would allow any
 * script a bad name could smuggle in, so each block is allowed by the SHA-256
 * of its exact text, and the day a block is edited the hash is stale and the
 * page's styles or its import map are refused. That is what `--check` is for,
 * and npm run lint runs it. Styles set from script through the element's own
 * style object are not inline style attributes and are not blocked.
 *
 * Each page gets the policy its own text needs: the app loads three.js and
 * shows pictures a person dropped (data and blob addresses); the verifier
 * loads nothing but its own module.
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

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* The pages that carry a policy, and what each needs beyond its own origin. */
export const PAGES = Object.freeze({
  'index.html': { cdn: true, images: "'self' data: blob:" },
  'verify.html': { cdn: false, images: 'data:' },
});

/* Three.js at the version the family pins, and nothing else the CDN holds: a path that ends in a slash is a prefix, and the policy names the one directory. */
export const CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';

export const hashOf = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/* The text of each inline script and style of a page: what the browser hashes. */
export function inlineBlocks(html) {
  const out = { scripts: [], styles: [] };
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(m[1])) {
      out.scripts.push(m[2]);
    }
  }
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    out.styles.push(m[1]);
  }
  return out;
}

/* The policy a page's own text makes. */
export function policyFor(html, name) {
  const need = PAGES[name];
  if (!need) {
    throw new Error(`${name} is not a page that carries a policy`);
  }
  const { scripts, styles } = inlineBlocks(html);
  const parts = [
    "default-src 'none'",
    `script-src 'self'${need.cdn ? ` ${CDN}` : ''}${scripts.map((s) => ` ${hashOf(s)}`).join('')}`,
    `style-src 'self'${styles.map((s) => ` ${hashOf(s)}`).join('')}`,
    `img-src ${need.images}`,
    "connect-src 'self'",
    "font-src 'none'",
    "media-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "worker-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ];
  return parts.join('; ');
}

const META = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(">)/;

/* The policy a page states now, or null if it states none. */
export function statedPolicy(html) {
  const m = META.exec(html);
  return m ? m[2] : null;
}

export function withPolicy(html, policy) {
  if (!META.test(html)) {
    throw new Error('no Content-Security-Policy meta tag to write into');
  }
  return html.replace(META, (all, a, b, c) => `${a}${policy}${c}`);
}

async function main() {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const name of Object.keys(PAGES)) {
    const path = join(root, name);
    const html = await readFile(path, 'utf8');
    const want = policyFor(html, name);
    const have = statedPolicy(html);
    if (have === want) {
      console.log(`csp: ${name} is current`);
      continue;
    }
    if (check) {
      stale += 1;
      console.log(`csp: ${name} is STALE: run npm run csp`);
      continue;
    }
    await writeFile(path, withPolicy(html, want));
    console.log(`csp: ${name} written`);
  }
  if (stale) {
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`csp: ${e.message}`);
    process.exit(1);
  });
}
