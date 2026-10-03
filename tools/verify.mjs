#!/usr/bin/env node
/*
 * verify.mjs: check a WebFPV Race Name Picker receipt in Node.
 *
 *   node tools/verify.mjs receipt.txt
 *   node tools/verify.mjs receipt.json other.txt
 *   node tools/verify.mjs --json receipt.txt     (one JSON object per receipt)
 *   node tools/verify.mjs -                      (read one receipt from stdin)
 *
 * This runs the picker's own src/draw.js, the same file the results page and
 * verify.html run, so it answers "does the file I was shown say what it
 * claims". It is not the independent check: tools/verify.py is, and shares no
 * code with this. The two print the same JSON for the same receipt, and
 * tests/draw.test.js holds them to it.
 *
 * Exit status: 0 if every receipt checks out, 1 if any does not, 2 for usage.
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

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { checkReceipt, parseReceipt } from '../src/draw.js';

/* The same shape tools/verify.py prints with --json, and in the same key order once both sort their keys. */
export async function verifyText(text) {
  try {
    const receipt = parseReceipt(text);
    const checked = await checkReceipt(receipt);
    if (!checked.derived) {
      return { ok: false, error: checked.checks[0].says };
    }
    const byId = Object.fromEntries(checked.checks.map((c) => [c.id, c.ok]));
    return {
      ok: checked.ok,
      error: null,
      listDigest: checked.derived.listDigest,
      commitment: checked.derived.commitment,
      showSeed: checked.derived.showSeed,
      order: checked.derived.order,
      checks: { digest: byId.digest, commitment: byId.commitment, order: byId.order },
      names: receipt.names,
      winners: receipt.winners,
      warnings: checked.warnings,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]))
    : v);

function report(label, r) {
  console.log(label);
  if (r.error) {
    console.log(`  FAIL  ${r.error}`);
    return;
  }
  const rows = [
    ['digest', 'list digest', r.listDigest],
    ['commitment', 'commitment', r.commitment],
    ['order', 'finishing order', r.order.map((e) => e + 1).join(' ')],
  ];
  for (const [key, text, value] of rows) {
    console.log(`  ${(r.checks[key] ? 'ok' : 'FAIL').padEnd(4)}  ${text.padEnd(16)} ${value}`);
  }
  console.log(`  winner${r.winners > 1 ? 's' : ''}: ${r.order.slice(0, r.winners).map((e) => r.names[e]).join(', ')}`);
  for (const w of r.warnings) {
    console.log(`  note  ${w}`);
  }
  console.log(`  ${r.ok ? 'the draw checks out' : 'THIS DRAW DOES NOT CHECK OUT'}`);
}

async function main(argv) {
  const json = argv.includes('--json');
  const paths = argv.filter((a) => a !== '--json');
  if (paths.length === 0 || paths.some((a) => a.startsWith('--'))) {
    console.error('usage: verify.mjs [--json] RECEIPT [RECEIPT ...]   (use - for standard input)');
    return 2;
  }
  let allOk = true;
  for (const path of paths) {
    let result;
    try {
      result = await verifyText(readFileSync(path === '-' ? 0 : path, 'utf8'));
    } catch (e) {
      result = { ok: false, error: e.message };
    }
    allOk = allOk && result.ok;
    if (json) {
      const { ok, error, listDigest, commitment, showSeed, order, checks } = result;
      const slim = Object.fromEntries(Object.entries({ ok, error, listDigest, commitment, showSeed, order, checks }).filter(([, v]) => v !== undefined));
      console.log(JSON.stringify(sortKeys({ ...slim, file: path })));
    } else {
      report(path, result);
    }
  }
  return allOk ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
