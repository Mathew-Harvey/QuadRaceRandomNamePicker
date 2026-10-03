/*
 * vendor.js: copy the simulator's own code into sim/, laid out exactly as the
 * simulator lays itself out from ITS ROOT.
 *
 *   node scripts/vendor.js ../WebFPVSimulator
 *
 * WHY A MIRROR OF THE ROOT. The race field, the quad, the cel shading and the
 * ink lines are the simulator's, and they import one another by relative path.
 * Most of those paths stay inside src/, but three of the files ask for
 * ../../configs/airframes.js, which is outside it. Put the files anywhere but
 * where the simulator puts them, or copy only src/, and every one of those
 * imports has to be rewritten, which turns a copy into an edit. Laid out from
 * the root, sim/src/render/scene.js and sim/configs/airframes.js are where
 * they are in the simulator, every file arrives byte for byte, and every
 * import resolves.
 *
 * WHAT IS COPIED, and nothing else: the import closure of the entries below,
 * followed through their relative imports (static, re-exports and dynamic
 * import()). 'three' and its addons come from the page's import map and are
 * not followed. A file the copy no longer produces is deleted, so a module the
 * simulator dropped does not linger here.
 *
 * THE MANIFEST, sim/MANIFEST.json, records the simulator's commit, whether the
 * tree it was copied from was clean, and the SHA-256 of every file. scripts/
 * lint.js checks the directory against it, which is what makes "recopy, do
 * not edit" something a check can see. Regenerate, do not edit. If the picker
 * needs the simulator's code to change, that is a change to the simulator and
 * outside this repository: write it down for the owner and work round it here.
 *
 * Adapted from the landing page's scripts/vendor.js, which is the family's
 * copy of this idea, and laid out from the root rather than from src/.
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
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(root, 'sim');

/*
 * Followed through their imports. What the picker builds the race from: the
 * shell (renderer, camera, session), the race field scene, the post chain
 * (ink lines and grade), the quality presets, the five inch aircraft and the
 * cel material every one of them is drawn in; the track document and the
 * course it becomes; the banners and the start block; the lettering the
 * titles are drawn in; and the motor sound.
 */
export const ENTRIES = [
  'src/render/shell.js',
  'src/render/scene.js',
  'src/render/post.js',
  'src/render/quality.js',
  'src/render/herocraft.js',
  'src/render/celmat.js',
  'src/game/trackdoc.js',
  'src/art/banners.js',
  'src/art/startblock.js',
  'src/ui/lettering.js',
  'src/render/audio.js',
];

/* Relative specifiers in a module: static imports, re-exports, and dynamic import() with a string literal. */
const SPEC = /(?:^|[\n;])\s*(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]|(?:^|[\n;])\s*import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

export function relativeImports(source) {
  const out = [];
  let m;
  SPEC.lastIndex = 0;
  while ((m = SPEC.exec(source))) {
    const spec = m[1] || m[2] || m[3];
    if (spec && (spec.startsWith('./') || spec.startsWith('../'))) {
      out.push(spec);
    }
  }
  return out;
}

async function walkDir(dir, base = dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...await walkDir(p, base));
    } else {
      out.push(relative(base, p).split('\\').join('/'));
    }
  }
  return out;
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function main() {
  const simRoot = resolve(process.argv[2] ?? '../WebFPVSimulator');
  await stat(join(simRoot, 'src'));

  /* The closure, as paths from the simulator's root. */
  const want = new Set();
  const queue = [...ENTRIES];
  const seen = new Set();
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) {
      continue;
    }
    seen.add(rel);
    want.add(rel);
    const text = await readFile(join(simRoot, rel), 'utf8');
    for (const spec of relativeImports(text)) {
      const next = posix.normalize(posix.join(posix.dirname(rel), spec));
      if (next.startsWith('..')) {
        throw new Error(`${rel} imports ${spec}, which is outside the simulator's repository`);
      }
      queue.push(next);
    }
  }

  /* Copy, and hash on the way. */
  const files = {};
  for (const rel of [...want].sort()) {
    const buf = await readFile(join(simRoot, rel));
    const to = join(OUT, rel);
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, buf);
    files[rel] = sha(buf);
  }

  /* And nothing the copy did not produce. */
  let removed = 0;
  try {
    for (const rel of await walkDir(OUT)) {
      if (rel !== 'MANIFEST.json' && !(rel in files)) {
        await rm(join(OUT, rel));
        removed += 1;
      }
    }
  } catch (e) {
    /* A first copy: there was nothing here to prune. */
  }

  let commit = 'unknown';
  let clean = false;
  try {
    commit = execFileSync('git', ['-C', simRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirs = [...new Set([...want].map((rel) => rel.split('/')[0]))];
    clean = execFileSync('git', ['-C', simRoot, 'status', '--porcelain', '--untracked-files=no', '--', ...dirs], { encoding: 'utf8' }).trim() === '';
  } catch (e) {
    /* Not a git checkout. The manifest says so rather than guessing. */
  }
  const manifest = {
    note: 'Copied from Mathew-Harvey/WebFPVSimulator by scripts/vendor.js. Regenerate, do not edit: scripts/lint.js checks every file here against its hash.',
    from: 'Mathew-Harvey/WebFPVSimulator',
    commit,
    clean,
    entries: ENTRIES,
    files,
  };
  await writeFile(join(OUT, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const lines = Object.values(files).length;
  console.log(`vendor: ${lines} files from ${commit.slice(0, 12)}${clean ? '' : ' (with uncommitted changes in what was copied)'}, ${removed} removed`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`vendor: ${e.message}`);
    process.exit(1);
  });
}
