/*
 * og.js: draw the picture a link to the picker unfurls into.
 *
 *   node scripts/og.js
 *
 * Serves tools/og.html through the picker's own static server, has headless
 * Chromium screenshot its canvas, and writes og.png beside index.html. The
 * size is 1200 by 630, which every chat and social site shows as a large
 * card, and the file is a PNG because the drawing is flat colour and ink,
 * which a JPEG smears and a PNG keeps, at about 190 KB.
 *
 * The picture is a generated file, like the front door's og.jpg: edit
 * tools/og.html and run this, never the PNG. Chromium only draws it, so the
 * same pixels come out of any machine that has one, with the one caveat that
 * the small type is the system's sans and mono, which differ by machine.
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

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { listen, ROOT } from './serve.js';

const CHROME = [
  process.env.PICKER_CHROME_BIN,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && existsSync(p));

if (!CHROME) {
  console.error('og: no Chromium found; set PICKER_CHROME_BIN');
  process.exit(1);
}

const out = join(ROOT, 'og.png');
const server = await listen(0);
const url = `http://127.0.0.1:${server.address().port}/tools/og.html`;
const child = spawn(CHROME, [
  '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1200,630', '--virtual-time-budget=3000',
  `--screenshot=${out}`, url,
], { stdio: ['ignore', 'ignore', 'inherit'] });
child.on('exit', (code) => {
  server.close();
  console.log(code === 0 ? `og: wrote ${out}` : `og: chromium exited ${code}`);
  process.exit(code === 0 ? 0 : 1);
});
