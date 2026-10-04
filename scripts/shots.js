/*
 * shots.js: drive headless Chromium through the real flow, assert what each
 * screen says, and leave pictures.
 *
 *   node scripts/shots.js                    every scenario
 *   node scripts/shots.js --only flow,sheet  some of them
 *   node scripts/shots.js --out DIR          where the pictures go (default .shots)
 *   node scripts/shots.js --graphics low     the simulator's quality preset (default low)
 *   node scripts/shots.js --speed 6          the race clock's speed (default 6)
 *
 * THE SCENARIOS
 *
 *   flow    check 11, with check 12 and 13 running through it: 50 names and
 *           four logos dropped in the way a person drops them, the seal on
 *           the glass, the lamps, mid race, the finish, the results, a replay
 *           that is marked and issues nothing, and the verify page with the
 *           receipt pasted, once true and once tampered with.
 *   sheet   the setup sheet's own behaviour: the odds, the comma offer, the
 *           numbers, the fifty one, the winners that cannot be, forgetting.
 *   actions the results page's four actions, a hostile name, and present mode:
 *           race again, draw again without the winners, edit names, and a
 *           name that is markup, which has to come out as text.
 *   sound   the real audio graph, built in the page on an OfflineAudioContext
 *           and played a scripted show, and the buffer read: silence before the
 *           first cue, the ambers at their pitch, the green at its, the motors
 *           at the pace of the race, a click at the line, the sting, and
 *           silence after the motors stop. And the mute: kept, and obeyed.
 *   reduced a person who asked for less motion: the chip in place of the slap,
 *           a skip button that cannot be missed, and nothing that animates.
 *   reload  a reload in the middle of the lights loses the show and not the
 *           result: the draw is in the log, and replays from it.
 *   phone   the same, on a phone held upright.
 *   photo   a kept draw whose first two cross the line 0.07 s apart, replayed
 *           at the real speed: the beat, the last 0.8 s at a third of the
 *           speed, and the winner still on the glass after the line, where
 *           the flip is.
 *   bare    no WebGL, and no CDN: the draw is still made, sealed and shown.
 *
 * EVERY CAPTURE ASSERTS ITS STATE FIRST. On a software rasteriser a frame
 * takes a tenth of a second or more, so a key press and a fixed wait can read
 * the state before the key. Each picture is taken after `until` has seen the
 * thing it is a picture of, in the page's own DOM, and a failed `until` fails
 * the run with the name of what it was waiting for.
 *
 * CHECK 12, THE CONSOLE: no error, no warning and no Content-Security-Policy
 * report in any scenario. CHECK 13, NO EARLY RESULT: while a race is running
 * the page is read every few tens of milliseconds, and at no sample before the
 * results state is there a results page, a panel of one, a winner's name set
 * as a title or a finishing order in the document.
 *
 * The page is served by scripts/serve.js and three.js from Node, which is
 * what tests/lib/page.js does, so a capture is a capture of the real files.
 * The speed parameter is the page's own and scales the race clock only: it
 * touches time, never the draw. Pictures are not committed: .gitignore drops
 * .shots/.
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

import {
  mkdir, mkdtemp, readFile, readdir, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import {
  fingerprint, parseReceipt, receiptFragment, receiptText, replayOf,
} from '../src/draw.js';
import { makePlan } from '../src/choreo.js';
import { photoWindow } from '../src/show.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

/* ------------------------------------------------------------------ */
/* Arguments and the ledger                                             */
/* ------------------------------------------------------------------ */

function args(argv) {
  const out = {
    only: null, out: join(root, '.shots'), graphics: 'low', speed: 6,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--only') {
      out.only = String(argv[i + 1]).split(',');
      i += 1;
    } else if (a === '--out') {
      out.out = resolve(argv[i + 1]);
      i += 1;
    } else if (a === '--graphics') {
      out.graphics = argv[i + 1];
      i += 1;
    } else if (a === '--speed') {
      out.speed = Number(argv[i + 1]);
      i += 1;
    } else {
      throw new Error(`unknown argument ${a}`);
    }
  }
  return out;
}

const settings = args(process.argv.slice(2));
const ledger = [];

/* A check: said when it is made, kept for the summary. */
function check(id, name, ok, detail = '') {
  ledger.push({
    id, name, ok: Boolean(ok), detail,
  });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${id} ${name}${ok || !detail ? '' : `: ${detail}`}`);
}

const note = (text) => console.log(`     ${text}`);
const stamp = () => new Date().toISOString().slice(11, 19);

/* ------------------------------------------------------------------ */
/* Inputs the pictures need                                             */
/* ------------------------------------------------------------------ */

/* A name list with some life in it: long names, accents, a script that is not Latin, and one name twice. */
function namesFor(n) {
  const base = [
    'Sam', 'Ana', 'Raj', 'Mia', 'Leo', 'Zoé', 'Kai', 'Eva', 'Jin', 'Ola',
    'Tom', 'Uma', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gus', 'Hal', 'Ivy',
    'Jo', 'Kit', 'Lu', 'Max', 'Nell', 'Otto', 'Pia', 'Quin', 'Rex', 'Sol',
    'Tia', 'Ugo', 'Val', 'Wren', 'Xan', 'Yui', 'Sam', 'Zed',
    'José Ángel García-Núñez', '李雷', 'Åsa Öberg',
    'Dmitri Kuznetsov-Petrovich the Third',
    'A very long name that goes on past any tag a person could read in a frame',
  ];
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push(i < base.length ? base[i] : `Pilot ${i + 1}`);
  }
  return out;
}

/* A PNG, written by hand: the signature, a header, one data chunk of filtered scanlines, an end. `paint(x, y)` answers [r, g, b, a]. */
function png(width, height, paint) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      const px = paint(x, y);
      const at = y * (width * 4 + 1) + 1 + x * 4;
      raw[at] = px[0];
      raw[at + 1] = px[1];
      raw[at + 2] = px[2];
      raw[at + 3] = px[3];
    }
  }
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/*
 * Four stand in sponsors, drawn from shapes because a PNG writer has no
 * fonts: a plate with a transparent margin (which has to be trimmed), a
 * plate that is a box all the way to its edge (a JPEG's case, so the board is
 * painted its colour), a ring on a cream disc, and a triangle.
 */
function marks() {
  const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);
  return [
    ['acme.png', png(480, 240, (x, y) => {
      const inPlate = x >= 40 && x < 440 && y >= 30 && y < 210;
      if (!inPlate) {
        return [0, 0, 0, 0];
      }
      const ring = Math.abs(dist(x, y, 140, 120) - 58) < 14;
      const bar = x >= 230 && x < 400 && y >= 100 && y < 140;
      return ring || bar ? [243, 234, 212, 255] : [30, 53, 102, 255];
    })],
    ['zorp.png', png(420, 210, (x, y) => ((Math.floor((x + y) / 34) % 2) ? [184, 51, 44, 255] : [243, 234, 212, 255]))],
    ['lumen.png', png(360, 360, (x, y) => {
      const d = dist(x, y, 180, 180);
      if (d > 170) {
        return [0, 0, 0, 0];
      }
      return d < 80 ? [20, 28, 22, 255] : [243, 234, 212, 255];
    })],
    ['quasar.png', png(480, 240, (x, y) => {
      const inside = y > 30 && y < 220 && x > 240 - (y - 30) * 1.2 && x < 240 + (y - 30) * 1.2;
      return inside ? [42, 127, 98, 255] : [0, 0, 0, 0];
    })],
  ];
}

/* ------------------------------------------------------------------ */
/* What every scenario does with a page                                 */
/* ------------------------------------------------------------------ */

const OUT = settings.out;

async function open(options = {}) {
  const query = new URLSearchParams({ graphics: settings.graphics, speed: String(settings.speed), ...(options.query || {}) });
  const page = await openPage({ ...options, url: `/index.html?${query}` });
  return page;
}

const shot = async (page, name, options) => {
  await mkdir(OUT, { recursive: true });
  await page.screenshot(join(OUT, `${name}.png`), options);
  note(`picture ${name}.png`);
};

/*
 * Where the first name's tag is, every frame, from now: the tag stands over its
 * quad, so a quad that drops onto its block is a tag that comes down the glass.
 * It is how a drop is seen from outside the page, since the fleet is in WebGL.
 */
const WATCH_TAG = `(() => {
  window.__tag = [];
  const frame = () => {
    const t = document.querySelector('#hud-tags .tag:not([hidden])');
    if (t) { window.__tag.push(t.getBoundingClientRect().top); }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})()`;

const text = (page, selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
const exists = (page, selector) => page.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
const state = (page) => page.evaluate('document.body.dataset.state');

/* The draws this browser holds, newest first, as the page's own store wrote them. */
async function log(page) {
  const raw = await page.evaluate("localStorage.getItem('webfpv-picker/v1/log')");
  return raw ? JSON.parse(raw) : [];
}

/* Put text into the names box the way a paste does: one insertion, an input event, no key presses. */
async function paste(page, value) {
  await page.evaluate("document.getElementById('names').focus(); document.getElementById('names').select()");
  await page.cdp.send('Input.insertText', { text: value }, page.sessionId);
}

async function ready(page) {
  await page.until("document.body.dataset.state === 'setup' && document.body.dataset.field !== 'building'", 240000, 'the setup sheet, with the field built');
  await sheetIn(page);
}

/* The sheet slides in over a fifth of a second, and a click on the arm switch while it is still on its way lands where the switch will be and is not. */
async function sheetIn(page) {
  await page.until("document.getElementById('sheet').getAnimations().length === 0", 10000, 'the sheet to stop sliding');
}

/* The files input of the first empty slot, given a file as a person's choice would: through the page's own change event. */
async function chooseFile(page, path) {
  const { root: dom } = await page.cdp.send('DOM.getDocument', { depth: 1 }, page.sessionId);
  const { nodeId } = await page.cdp.send('DOM.querySelector', { nodeId: dom.nodeId, selector: '.slot:not(.filled) input[type=file]' }, page.sessionId);
  if (!nodeId) {
    throw new Error('no empty slot to choose a file for');
  }
  await page.cdp.send('DOM.setFileInputFiles', { nodeId, files: [path] }, page.sessionId);
}

/* Check 12, for one page: nothing in the console, and nothing asked of anybody but this server and the CDN for three.js. `allow` names the messages a scenario is built to cause, which for a blocked CDN is the browser saying so. */
function console12(label, page, { allow = null } = {}) {
  const origin = page.origin;
  const bad = [...page.errors, ...page.warnings].filter((m) => !(allow && allow.test(m)));
  check('12', `${label}: the console has no errors, warnings or policy reports`, bad.length === 0, bad.slice(0, 3).join(' | '));
  const strangers = page.requests.filter((u) => /^https?:/.test(u) && !u.startsWith(origin) && !u.startsWith('https://cdn.jsdelivr.net/npm/three@0.160.0/'));
  check('12', `${label}: the only requests that leave the page are for three.js`, strangers.length === 0, strangers.slice(0, 3).join(' | '));
}

/* ------------------------------------------------------------------ */
/* flow                                                                 */
/* ------------------------------------------------------------------ */

/*
 * A spy on the audio the page makes, put in before the page's own scripts: it
 * counts the stops of oscillators, which only the page's own tones make (the
 * simulator's motors are started and never stopped), with how long each was
 * for and when, and the times a parameter was scheduled, which the motors do
 * every time they are updated. There is no speaker to listen to here, and
 * this is the wiring seen from outside.
 */
const AUDIO_SPY = `(() => {
  window.__audio = { voices: [], targets: 0 };
  const stop = OscillatorNode.prototype.stop;
  OscillatorNode.prototype.stop = function spy(when) {
    window.__audio.voices.push({ at: performance.now(), seconds: when - this.context.currentTime });
    return stop.call(this, when);
  };
  const target = AudioParam.prototype.setTargetAtTime;
  AudioParam.prototype.setTargetAtTime = function spy(...args) {
    window.__audio.targets += 1;
    return target.apply(this, args);
  };
})();`;

async function flow() {
  note(`${stamp()} flow: 50 names, four logos, a 30 second race at speed ${settings.speed}`);
  const dir = await mkdtemp(join(tmpdir(), 'picker-marks-'));
  const page = await open({ width: 1600, height: 900, seed: [AUDIO_SPY] });
  try {
    await ready(page);
    check('11', 'the sheet is up and says what it needs', (await text(page, '#status')) === 'Add at least two names.' && await page.evaluate("document.getElementById('arm').disabled"), await text(page, '#status'));
    await shot(page, '01-paddock-empty');

    /* Four logos, one at a time, and one rebuild of the field for the lot. */
    const files = marks();
    for (let i = 0; i < files.length; i += 1) {
      const path = join(dir, files[i][0]);
      await writeFile(path, files[i][1]);
      await chooseFile(page, path);
      await page.until(`document.querySelectorAll('.slot.filled').length === ${i + 1}`, 30000, `logo ${i + 1} in its slot`);
    }
    note(`${stamp()} four logos in their slots, waiting for the field to be rebuilt with them`);
    await page.until("document.body.dataset.field === 'building'", 10000, 'the field rebuilding for the marks');
    await page.until("document.body.dataset.field === 'ready'", 240000, 'the field rebuilt');
    check('11', 'four logos are in their slots, with thumbnails', await page.evaluate("document.querySelectorAll('.slot.filled img').length === 4"));
    const kept = await page.evaluate("JSON.parse(localStorage.getItem('webfpv-picker/v1/logos') || '[]').length");
    check('11', 'and they are kept in this browser', kept === 4, String(kept));

    const names = namesFor(50);
    await paste(page, names.join('\n'));
    await page.until("document.getElementById('count').textContent === '50 of 50'", 10000, 'fifty names counted');
    const rows = await page.evaluate("document.querySelectorAll('#gutter .g .chip').length");
    check('11', 'the gutter numbers and colours all fifty', rows === 50, String(rows));
    check('11', 'a name twice is marked, and its odds are said', (await page.evaluate("document.querySelectorAll('#gutter .dup').length")) === 2 && (await text(page, '#odds')).includes('Sam has 2 entries'), await text(page, '#odds'));
    check('11', 'the arm switch is on', !(await page.evaluate("document.getElementById('arm').disabled")), await text(page, '#status'));
    await page.until("document.querySelectorAll('#hud-tags .tag:not([hidden])').length >= 5", 20000, 'names over the quads on the grid');
    check('11', 'the quads on the grid carry their names', (await page.evaluate("[...document.querySelectorAll('#hud-tags .tag:not([hidden]) span')].every((n) => n.textContent.length > 0)")));
    await shot(page, '02-paddock-50-names-4-logos');

    /* Arm. The seal, on the glass, before anything else. */
    await page.evaluate("document.getElementById('event-title').focus()");
    await page.cdp.send('Input.insertText', { text: 'Friday night heat' }, page.sessionId);
    check('11', 'no sound has been built before the first press, and the page is ready for one', (await page.evaluate('document.body.dataset.sound')) === 'ready');
    await page.click('#arm');
    await page.until("document.body.dataset.sound === 'on'", 10000, 'sound running after the first press');
    await page.until("document.body.dataset.state === 'sealed' && !document.getElementById('hud-seal').hidden", 20000, 'the seal on the glass');
    const sealed = await text(page, '#hud-seal-print');
    const draws = await log(page);
    check('11', 'the draw is in the log before the countdown starts', draws.length === 1 && fingerprint(draws[0].commitment) === sealed, `${draws.length} entries, glass says ${sealed}`);
    check('11', 'and it is the one on the glass', Boolean(draws[0]) && draws[0].names.length === 50 && draws[0].title === 'Friday night heat');
    await page.until("document.getElementById('hud-seal').getAnimations().every((a) => a.playState === 'finished')", 20000, 'the slap to land');
    await shot(page, '03-seal');

    await page.until("document.body.dataset.state === 'lights' && document.body.dataset.lamps === '2'", 60000, 'two amber lamps');
    await shot(page, '04-lights');

    /* The race, read every few tens of milliseconds for check 13, with a picture or two on the way. */
    const receipt = draws[0];
    const winner = receipt.names[receipt.order[0]];
    const violations = [];
    const beats = [];
    let samples = 0;
    let midShot = false;
    let finishShot = false;
    let last = null;
    const deadline = Date.now() + 15 * 60 * 1000;
    note(`${stamp()} racing`);
    for (;;) {
      const s = await page.evaluate(`(() => ({
        state: document.body.dataset.state,
        results: Boolean(document.getElementById('results')),
        panels: document.querySelectorAll('[data-panel]').length,
        title: Boolean(document.querySelector('.winner-name')),
        order: Boolean(document.querySelector('.order')),
        clock: document.getElementById('hud-clock').textContent,
        beat: document.getElementById('hud-beat').textContent,
      }))()`);
      samples += 1;
      last = s;
      if (s.state !== 'results' && (s.results || s.panels || s.title || s.order)) {
        violations.push(s);
      }
      if (s.beat && !beats.includes(s.beat)) {
        beats.push(s.beat);
      }
      if (s.state === 'results') {
        break;
      }
      const seconds = Number(s.clock.split(':')[0]) * 60 + Number(s.clock.split(':')[1]);
      if (!midShot && s.state === 'race' && seconds >= 12) {
        midShot = true;
        await shot(page, '05-race-mid');
      }
      if (!finishShot && s.state === 'finish' && s.beat === `${winner} wins`) {
        finishShot = true;
        await shot(page, '06-finish');
      }
      if (Date.now() > deadline) {
        throw new Error('the race did not finish in fifteen minutes');
      }
      await page.sleep(40);
    }
    check('13', `no results page, panel, winner title or order in the document at any of ${samples} samples before the results`, violations.length === 0, JSON.stringify(violations[0]));
    check('11', 'the race said Go, and named the winner once she crossed', beats.includes('Go') && beats.includes(`${winner} wins`), beats.join(' | '));
    check('11', 'a mid race picture and a finish picture were taken at the moments they are pictures of', midShot && finishShot, `mid ${midShot}, finish ${finishShot}`);

    /* The results. Everything on the page is the draw's. */
    await page.until("Boolean(document.querySelector('#results .winner-name')) && Boolean(document.querySelector('#results .seal-panel .print'))", 30000, 'the results page');
    await page.sleep(1500);
    await shot(page, '07-results');
    const shown = await page.evaluate(`(() => ({
      winner: document.querySelector('.winner-name').textContent,
      order: [...document.querySelectorAll('#results .order li .n')].map((n) => n.textContent),
      print: document.querySelector('.seal-panel .print').textContent,
      title: document.querySelector('#results .event-title')?.textContent ?? null,
      tick: Boolean(document.querySelector('.seal-panel .tick:not(.bad)')),
      bad: Boolean(document.querySelector('.seal-panel .tick.bad')),
      first: document.querySelector('#results .order li .t').textContent,
      verify: document.querySelector('#results a.btn.primary').getAttribute('href'),
      shape: document.getElementById('results').dataset.shape,
      drawn: Boolean(document.querySelector('#results canvas.shot') && document.querySelector('#results canvas.shot').width > 100),
    }))()`);
    check('11', 'the winner on the page is the winner in the receipt', shown.winner === winner, `${shown.winner} against ${winner}`);
    check('11', 'the event title is on the page too', shown.title === 'Friday night heat', String(shown.title));
    check('11', 'all fifty finish in the order that was drawn', shown.order.length === 50 && shown.order.every((n, p) => n === receipt.names[receipt.order[p]]), `${shown.order.length} rows`);
    check('11', 'the seal on the page is the seal that was on the glass, ticked', shown.print === sealed && shown.tick && !shown.bad, `${shown.print} against ${sealed}`);
    check('11', 'the winner\'s time on the page is the time the clock stopped at', shown.first === last.clock || shown.first === (await text(page, '#hud-clock')), `${shown.first} against ${await text(page, '#hud-clock')}`);
    check('11', 'the winner\'s picture was drawn into its panel', shown.drawn && shown.shape === 'spread');
    check('11', 'the draw log still holds one draw, and the page issued no second receipt', (await log(page)).length === 1);

    /*
     * The sound, seen from outside: three short tones evenly spaced, a long one
     * after the hold, the sting once, and the motors updated while the show ran
     * and not after. The spacing is a ratio and not a number of seconds: the
     * show's clock is clamped to a tenth of a second a frame, and a software
     * rasteriser makes a frame a quarter of a second, so the lamps a second
     * apart are two and a half apart on this wall clock.
     */
    const heard = await page.evaluate('window.__audio');
    const ofLength = (lo, hi) => heard.voices.filter((v) => v.seconds >= lo && v.seconds <= hi);
    const ambers = ofLength(0.155, 0.19);
    const greens = ofLength(0.74, 0.8);
    /* The sting's four notes stop at 0.13, 0.23, 0.33 and 0.94 s from when it is asked for, two voices each. */
    const sting = [[0.115, 0.145], [0.215, 0.245], [0.315, 0.345], [0.92, 0.96]].flatMap(([lo, hi]) => ofLength(lo, hi));
    const amberAt = [...new Set(ambers.map((v) => Math.round(v.at / 50)))].map((t) => t * 50).sort((a, b) => a - b);
    const gaps = amberAt.slice(1).map((t, i) => t - amberAt[i]);
    check('11', 'three amber tones, evenly spaced, one for each lamp', ambers.length === 6 && amberAt.length === 3 && Math.abs(gaps[0] / gaps[1] - 1) < 0.25, `${ambers.length} voices at ${amberAt.join(' ')}`);
    const hold = greens.length ? greens[0].at - ambers[ambers.length - 1].at : -1;
    const ratio = hold / gaps[1];
    check('11', 'a long green tone after a hold of half to twice the spacing, which is half a second to two in lamp time', greens.length === 2 && ratio > 0.4 && ratio < 2.3, `${greens.length} voices, hold ${hold.toFixed(0)} ms, ${ratio.toFixed(2)} of a lamp gap`);
    check('11', 'the winner\'s sting, once, after the race began', sting.length === 8 && sting.every((v) => v.at > greens[0].at + 1000), `${sting.length} voices`);
    check('11', 'the motors were updated every frame of the show', heard.targets > 300, `${heard.targets} parameter changes`);
    await page.sleep(700);
    const settled = await page.evaluate('window.__audio.targets');
    await page.sleep(700);
    check('11', 'and not once the results were up: the page is silent', (await page.evaluate('window.__audio.targets')) === settled, `${settled}`);

    /* The receipt leaves the page two ways a person uses, and the policy must let both through. */
    const downloads = await mkdtemp(join(tmpdir(), 'picker-dl-'));
    await page.cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });
    await page.cdp.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: page.origin });
    const parsedNow = parseReceipt(receipt);
    await page.evaluate("[...document.querySelectorAll('#results .btn')].find((b) => b.textContent.startsWith('Download receipt')).click()");
    let file = null;
    for (let i = 0; i < 100 && !file; i += 1) {
      file = (await readdir(downloads)).find((f) => !f.endsWith('.crdownload')) || null;
      if (!file) {
        await page.sleep(100);
      }
    }
    let downloaded = null;
    try {
      downloaded = parseReceipt(await readFile(join(downloads, file), 'utf8'));
    } catch (e) {
      downloaded = null;
    }
    check('11', 'Download receipt saves the receipt as a file named for its fingerprint', file === `webfpv-picker-${sealed.replace(/ /g, '')}.json` && downloaded !== null && JSON.stringify(downloaded) === JSON.stringify(parsedNow), String(file));
    await page.evaluate("[...document.querySelectorAll('#results .btn')].find((b) => b.textContent.startsWith('Copy receipt')).click()");
    await page.until("[...document.querySelectorAll('#results .btn')].some((b) => b.textContent === 'Copied')", 5000, 'the copy to say it worked');
    const copied = await page.evaluate('navigator.clipboard.readText()');
    check('11', 'Copy receipt puts the receipt text on the clipboard', copied === receiptText(parsedNow));
    await rm(downloads, { recursive: true, force: true });

    /* A replay: marked, issues nothing, and can be skipped. */
    await page.evaluate("[...document.querySelectorAll('#results .btn')].find((b) => b.textContent.startsWith('Watch it again')).click()");
    await page.until("document.body.dataset.state === 'sealed' && !document.getElementById('hud-replay').hidden", 20000, 'the replay flag');
    check('11', 'a replay says REPLAY, and its seal says it', (await page.evaluate("document.getElementById('hud-seal').classList.contains('replay')")) && (await text(page, '#hud-replay')) === 'Replay');
    await page.until("document.getElementById('hud-seal').getAnimations().every((a) => a.playState === 'finished')", 20000, 'the replay slap');
    await shot(page, '08-replay-seal');
    await page.until("!document.getElementById('hud-skip').hidden", 10000, 'the skip button');
    await page.click('#hud-skip');
    await page.until("document.body.dataset.state === 'results' && Boolean(document.querySelector('#results .narration.replay'))", 30000, 'the replay results');
    const again = await page.evaluate(`(() => ({
      winner: document.querySelector('.winner-name').textContent,
      buttons: [...document.querySelectorAll('#results .btn')].map((b) => b.textContent),
      order: [...document.querySelectorAll('#results .order li .n')].map((n) => n.textContent).join('|'),
    }))()`);
    check('11', 'the replay ends on the same winner and the same order, marked, with no Race again', again.winner === winner && again.order === shown.order.join('|') && !again.buttons.some((b) => b.startsWith('Race again')), again.buttons.join(' | '));
    check('11', 'and the log is still one draw', (await log(page)).length === 1);
    await page.sleep(800);
    await shot(page, '09-replay-results');

    /* The verify page, with the receipt pasted. */
    const parsed = parseReceipt(receipt);
    await page.evaluate("location.href = '/verify.html'");
    await page.until("location.pathname === '/verify.html' && document.readyState === 'complete' && Boolean(document.getElementById('receipt'))", 20000, 'the verify page');
    await page.evaluate("document.getElementById('receipt').focus()");
    await page.cdp.send('Input.insertText', { text: receiptText(parsed) }, page.sessionId);
    await page.evaluate("document.getElementById('fp').focus()");
    await page.cdp.send('Input.insertText', { text: sealed }, page.sessionId);
    await page.click('#check');
    await page.until("Boolean(document.getElementById('verdict'))", 20000, 'a verdict');
    const verdict = await text(page, '#verdict');
    check('11', 'the verify page, given the pasted receipt and the fingerprint, says the draw checks out', verdict.startsWith('This draw checks out.'), verdict);
    check('11', 'with every check ticked', (await page.evaluate("document.querySelectorAll('.mark.ok').length")) === 4 && !(await exists(page, '.mark.bad')));
    await shot(page, '10-verify-ok');
    const tampered = receiptText(parsed).replace(/^seed: ([0-9a-f]{63})([0-9a-f])$/m, (all, head, last) => `seed: ${head}${last === '0' ? '1' : '0'}`);
    await page.evaluate(`document.getElementById('receipt').value = ${JSON.stringify(tampered)}; document.getElementById('check').click()`);
    await page.until("Boolean(document.querySelector('.verdict.bad')) && document.getElementById('verdict')?.textContent.startsWith('This draw does not')", 20000, 'a failing verdict');
    check('11', 'and a receipt whose seed has one digit changed does not', (await exists(page, '.mark.bad')));
    await shot(page, '11-verify-bad');
    await page.evaluate(`location.hash = ${JSON.stringify(receiptFragment(parsed))}`);
    await page.until("document.getElementById('verdict')?.textContent.startsWith('This draw checks out.')", 20000, 'the link from the results page checked');
    check('11', 'the receipt in a link, which a server never sees, checks out too', true);
    check('11', 'the results page\'s Verify link carries the same receipt', shown.verify === `verify.html#${receiptFragment(parsed)}`);
    console12('flow', page);
  } finally {
    await page.close();
    await rm(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ */
/* sheet                                                                */
/* ------------------------------------------------------------------ */

async function sheet() {
  note(`${stamp()} sheet`);
  const dir = await mkdtemp(join(tmpdir(), 'picker-text-'));
  const page = await open({ width: 1440, height: 900 });
  try {
    await ready(page);
    await page.evaluate(WATCH_TAG);
    await paste(page, 'Sam, Ana, Raj, Mia');
    await page.until('window.__tag.length >= 14', 40000, 'a dozen frames of the first name\'s tag');
    const dropped = await page.evaluate('window.__tag');
    const settled = dropped.slice(-3);
    check('sheet', 'a name typed drops its quad onto the block: its tag comes down the glass, and then stays', dropped[0] < dropped.at(-1) - 25 && Math.max(...settled) - Math.min(...settled) < 2, `first ${dropped[0].toFixed(0)}, last ${dropped.at(-1).toFixed(0)}, over ${dropped.length} frames`);
    await page.until("!document.getElementById('split-offer').hidden", 5000, 'the offer to split a comma list');
    await shot(page, 's1-split-offer');
    await page.click('#split-yes');
    await page.until("document.getElementById('names').value === 'Sam\\nAna\\nRaj\\nMia'", 5000, 'the list split');
    check('sheet', 'a comma list is offered a split, and split into lines', (await text(page, '#count')) === '4 of 50' && await page.evaluate("document.getElementById('split-offer').hidden"));
    await page.until("document.querySelectorAll('#hud-tags .tag:not([hidden])').length >= 3", 20000, 'names over the quads');
    check('sheet', 'each name typed is over its quad on the grid', (await page.evaluate("[...document.querySelectorAll('#hud-tags .tag:not([hidden])')].map((t) => t.textContent).join('|')")).includes('Sam'));
    await paste(page, 'Smith, John');
    await page.until("!document.getElementById('split-offer').hidden", 5000, 'the offer again');
    await page.click('#split-no');
    check('sheet', 'and "keep as one line" is kept to', await page.evaluate("document.getElementById('split-offer').hidden") && (await text(page, '#count')) === '1 of 50');

    await paste(page, 'Sam\nSam\nAna\nRaj');
    await page.until("document.getElementById('count').textContent === '4 of 50'", 5000, 'four tickets');
    const odds = await text(page, '#odds');
    check('sheet', 'duplicates are two tickets and the odds say so', odds.includes('Each name has a 1 in 4 chance') && odds.includes('Sam has 2 entries: 2 in 4'), odds);
    const winnersOff = await page.evaluate("[...document.querySelectorAll('input[name=winners]')].map((r) => r.disabled).join()");
    check('sheet', 'with four names all three winner counts are on offer', winnersOff === 'false,false,false', winnersOff);
    await paste(page, 'Sam\nAna');
    await page.until("document.getElementById('count').textContent === '2 of 50'", 5000, 'two names');
    check('sheet', 'with two names there is one winner to give', (await page.evaluate("[...document.querySelectorAll('input[name=winners]')].map((r) => r.disabled).join()")) === 'false,true,true');
    await paste(page, 'Sam\nAna\nRaj');
    await page.until("document.getElementById('count').textContent === '3 of 50'", 5000, 'three names');
    check('sheet', 'with three, up to two', (await page.evaluate("[...document.querySelectorAll('input[name=winners]')].map((r) => r.disabled).join()")) === 'false,false,true');

    await paste(page, Array.from({ length: 55 }, (_, i) => `N${i + 1}`).join('\n'));
    await page.until("document.getElementById('count').textContent === '50 of 50'", 5000, 'fifty');
    check('sheet', 'the fifty first line is struck and said, the grid is the first fifty, and arming is off', !(await page.evaluate("document.getElementById('warn').hidden")) && (await page.evaluate("document.querySelectorAll('#gutter .g.extra').length")) === 5 && (await page.evaluate("document.getElementById('arm').disabled")) && (await text(page, '#status')).startsWith('Fifty is the most'), `${await text(page, '#warn')} | ${await text(page, '#status')}`);
    await shot(page, 's2-over-fifty');

    await page.evaluate("document.getElementById('tickets-n').value = '12'");
    await page.click('#tickets-fill');
    check('sheet', 'numbers 1 to N asks before it replaces a list', (await text(page, '#tickets-fill')) === 'Replace the list?' && (await text(page, '#count')) === '50 of 50');
    await page.click('#tickets-fill');
    await page.until("document.getElementById('names').value.split('\\n').length === 12", 5000, 'twelve numbers');
    check('sheet', 'and then replaces it with 1 to N, which turns arming back on', (await page.evaluate("document.getElementById('names').value")) === Array.from({ length: 12 }, (_, i) => String(i + 1)).join('\n') && !(await page.evaluate("document.getElementById('arm').disabled")));

    /* A file that is not a picture says so in its slot. */
    const bad = join(dir, 'notes.txt');
    await writeFile(bad, 'not a picture');
    await chooseFile(page, bad);
    await page.until("Boolean(document.querySelector('.slot .err'))", 10000, 'the slot to say what is wrong');
    check('sheet', 'a file that is not a picture is refused in words', (await text(page, '.slot .err')).startsWith('A logo is a PNG'), await text(page, '.slot .err'));
    check('sheet', 'and nothing was kept or rebuilt for it', (await page.evaluate("document.querySelectorAll('.slot.filled').length")) === 0 && (await page.evaluate("document.body.dataset.field")) === 'ready');

    /* Everything kept, then forgotten. */
    await page.evaluate("document.getElementById('event-title').focus()");
    await page.cdp.send('Input.insertText', { text: 'Heat 4' }, page.sessionId);
    await page.sleep(500);
    check('sheet', 'names and the title are kept as they are typed', (await page.evaluate("localStorage.getItem('webfpv-picker/v1/names')")) !== null && (await page.evaluate("localStorage.getItem('webfpv-picker/v1/title')")) === '"Heat 4"');
    await page.click('#forget');
    check('sheet', 'forgetting asks twice', (await text(page, '#forget')).startsWith('Really forget'));
    await page.click('#forget');
    await page.until("document.getElementById('names').value === ''", 5000, 'the list forgotten');
    const left = await page.evaluate("Object.keys(localStorage).filter((k) => /\\/(names|title|logos|log)$/.test(k)).join()");
    check('sheet', 'and then leaves none of the lists in this browser', left === '' && (await page.evaluate("document.getElementById('event-title').value")) === '', left);
    console12('sheet', page);
  } finally {
    await page.close();
    await rm(dir, { recursive: true, force: true });
  }
}


/* ------------------------------------------------------------------ */
/* actions                                                              */
/* ------------------------------------------------------------------ */

/* The way to a results page that costs nothing: arm, and skip the show on the glass. */
async function toResults(page) {
  await page.click('#arm');
  await page.until("document.body.dataset.state === 'sealed' && !document.getElementById('hud-skip').hidden", 30000, 'the seal, and a skip button');
  await page.click('#hud-skip');
  await page.until("document.body.dataset.state === 'results' && Boolean(document.querySelector('#results .winner-name'))", 30000, 'the results page');
}

const clickButton = (page, label) => page.evaluate(`[...document.querySelectorAll('#results .btn')].find((b) => b.textContent.startsWith(${JSON.stringify(label)})).click()`);

async function actions() {
  note(`${stamp()} actions`);
  const page = await open({ width: 1440, height: 900 });
  try {
    await ready(page);
    const hostile = ['<img src=x onerror="document.title=\'pwned\'">', '"><script>document.title=\'pwned\'</script>', '&lt;b&gt;bold&lt;/b&gt;', 'Ana', 'Raj', 'Mia'];
    await paste(page, hostile.join('\n'));
    await page.until("document.getElementById('count').textContent === '6 of 50'", 5000, 'six names');
    await page.click('input[name=winners][value="2"]');
    await toResults(page);
    const first = (await log(page))[0];
    const rendered = await page.evaluate(`(() => ({
      title: document.title,
      images: document.querySelectorAll('#results img, #hud img, #gutter img').length,
      scripts: document.querySelectorAll('#results script, #hud script, #gutter script').length,
      names: [...document.querySelectorAll('#results .order li .n')].map((n) => n.textContent),
      second: Boolean(document.querySelector('#results [data-panel=second]')),
      third: Boolean(document.querySelector('#results [data-panel=third]')),
    }))()`);
    check('actions', 'a name that is markup comes out as text: nothing ran, nothing was made', rendered.title === 'WebFPV Race Name Picker' && rendered.images === 0 && rendered.scripts === 0 && hostile.every((h) => rendered.names.includes(h)), JSON.stringify(rendered.names));
    check('actions', 'two winners have two panels, and not three', rendered.second && !rendered.third);
    /* The page opens: a panel at a time, the picture first. The delay is in the stylesheet, and a computed delay is what the browser is doing. */
    const opening = await page.evaluate(`['big', 'second', 'order', 'seal', 'actions'].map((n) => {
      const el = document.querySelector('#results [data-panel=' + n + ']');
      return { n, delay: parseFloat(getComputedStyle(el).animationDelay), name: getComputedStyle(el).animationName };
    })`);
    check('actions', 'the page opens a panel at a time, the picture first', opening.every((o) => o.name === 'panel-in') && opening.every((o, i) => i === 0 || o.delay > opening[i - 1].delay), JSON.stringify(opening));
    await shot(page, 'a1-two-winners');

    /* Draw again without the winners: the lines come out, and a new draw is sealed at once. */
    const winnersNow = first.order.slice(0, 2).map((e) => first.names[e]);
    await clickButton(page, 'Draw again without');
    await page.until("document.body.dataset.state === 'sealed'", 30000, 'a new draw');
    const afterWithout = await log(page);
    check('actions', 'draw again without the winners seals a new draw of the rest', afterWithout.length === 2 && afterWithout[0].names.length === 4 && winnersNow.every((n) => !afterWithout[0].names.includes(n)) && afterWithout[0].seed !== first.seed, afterWithout[0] ? afterWithout[0].names.join('|') : 'no draw');
    await page.until("!document.getElementById('hud-skip').hidden", 10000, 'a skip button');
    await page.click('#hud-skip');
    await page.until("document.body.dataset.state === 'results'", 30000, 'the second results');
    check('actions', 'with two winners and four names left, a third of two is not offered: the winners are the two that were asked for', (await page.evaluate("Boolean(document.querySelector('#results [data-panel=second]')) && !document.querySelector('#results [data-panel=third]')")));

    /* Edit names: back to the sheet, with the list as it is now, and the arm switch ready. */
    await clickButton(page, 'Edit names');
    await page.until("document.body.dataset.state === 'setup' && !document.getElementById('arm').disabled", 15000, 'the sheet');
    await sheetIn(page);
    check('actions', 'edit names returns to the sheet, with the four that are left', (await page.evaluate("document.getElementById('names').value.split('\\n').length")) === 4 && !(await exists(page, '#results')));

    /* Race again: the same four, a new draw. The way to the results page arms a draw of its own, so this is the fourth. */
    await toResults(page);
    const third = (await log(page))[0];
    await clickButton(page, 'Race again');
    await page.until("document.body.dataset.state === 'sealed'", 30000, 'a fourth draw');
    const afterAgain = await log(page);
    check('actions', 'race again is a new draw of the same names', afterAgain.length === 4 && afterAgain[1].seed === third.seed && afterAgain[0].names.join('|') === third.names.join('|') && afterAgain[0].seed !== third.seed && afterAgain[0].commitment !== third.commitment, `${afterAgain.length} draws`);
    check('actions', 'and no two of four draws share a seed', new Set(afterAgain.map((r) => r.seed)).size === 4);

    /* Present mode: a button and a key, and a key typed into a field is only a letter. */
    await page.until("document.getElementById('hud-skip') && !document.getElementById('hud-skip').hidden", 10000, 'the skip button');
    await page.click('#hud-skip');
    await page.until("document.body.dataset.state === 'results'", 30000, 'results again');
    await clickButton(page, 'Edit names');
    await page.until("document.body.dataset.state === 'setup'", 15000, 'the sheet again');
    await sheetIn(page);
    await page.click('#present');
    await page.until("document.body.classList.contains('present') && document.getElementById('present').getAttribute('aria-pressed') === 'true'", 5000, 'present mode');
    await page.tap('KeyF');
    await page.until("!document.body.classList.contains('present')", 5000, 'present mode off with the key');
    await page.evaluate("document.getElementById('event-title').focus()");
    await page.tap('KeyF');
    await page.sleep(300);
    check('actions', 'F toggles present mode, and typed into a field it is only a letter', (await page.evaluate("document.getElementById('event-title').value")) === 'f' && !(await page.evaluate("document.body.classList.contains('present')")));
    console12('actions', page);
  } finally {
    await page.close();
  }
}


/* ------------------------------------------------------------------ */
/* sound                                                                */
/* ------------------------------------------------------------------ */

/*
 * Run in the page: the picker's own sound module on an offline context, a
 * scripted show scheduled into it, the rendered buffer analysed. The analysis
 * is a Goertzel filter, which is the one frequency's worth of a Fourier
 * transform and is a few lines long, over windows between cues.
 */
const PROBE = `(async () => {
  const { createSound, TONES } = await import('./src/sound.js');
  const rate = 44100;
  const ctx = new OfflineAudioContext(1, rate * 9, rate);
  const sound = createSound({ context: ctx });
  sound.unlock();
  sound.tone('amber', 0.5);
  sound.tone('green', 1.5);
  sound.motors({ rpm: 4200, speed: 0 }, 3.0);
  sound.motors({ rpm: 8600, speed: 30 }, 5.0);
  sound.gate(5.6);
  sound.sting(6.2);
  sound.hush(7.4);
  const buffer = await ctx.startRendering();
  const x = buffer.getChannelData(0);
  const win = (a, b) => x.subarray(Math.floor(a * rate), Math.floor(b * rate));
  const rms = (w) => { let s = 0; for (let i = 0; i < w.length; i += 1) s += w[i] * w[i]; return Math.sqrt(s / w.length); };
  const goertzel = (w, hz) => {
    const k = 2 * Math.cos((2 * Math.PI * hz) / rate);
    let s1 = 0; let s2 = 0;
    for (let i = 0; i < w.length; i += 1) { const s0 = w[i] + k * s1 - s2; s2 = s1; s1 = s0; }
    return Math.sqrt(s1 * s1 + s2 * s2 - k * s1 * s2) / w.length;
  };
  const band = (w, lo, hi, step = 2) => { let best = 0; for (let hz = lo; hz <= hi; hz += step) best = Math.max(best, goertzel(w, hz)); return best; };
  /* Energy in what is left when the slow part is taken away: a click lives up there and a motor does not. */
  const sharp = (w) => { let s = 0; for (let i = 1; i < w.length; i += 1) { const d = w[i] - w[i - 1]; s += d * d; } return Math.sqrt(s / w.length); };
  let peak = 0;
  for (let i = 0; i < x.length; i += 1) { const a = Math.abs(x[i]); if (a > peak) peak = a; }
  return {
    before: rms(win(0, 0.45)),
    amber: { rms: rms(win(0.52, 0.62)), at880: goertzel(win(0.52, 0.62), TONES.amber.hz), at1320: goertzel(win(0.52, 0.62), TONES.green.hz) },
    gap: rms(win(0.9, 1.4)),
    green: { rms: rms(win(1.6, 2.1)), at880: goertzel(win(1.6, 2.1), TONES.amber.hz), at1320: goertzel(win(1.6, 2.1), TONES.green.hz) },
    quiet: rms(win(2.4, 2.9)),
    low: { rms: rms(win(3.6, 4.6)), peak: band(win(3.6, 4.6), 195, 225), off: band(win(3.6, 4.6), 285, 315) },
    high: { rms: rms(win(5.1, 5.5)), peak: band(win(5.1, 5.5), 415, 450), lowBand: band(win(5.1, 5.5), 195, 225) },
    click: { during: sharp(win(5.6, 5.66)), before: sharp(win(5.4, 5.46)) },
    sting: { late: goertzel(win(6.6, 7.0), 1046.5), other: goertzel(win(6.6, 7.0), 1300) },
    after: rms(win(8.2, 8.9)),
    peak,
    muted: await (async () => {
      const off = new OfflineAudioContext(1, rate * 2, rate);
      const quiet = createSound({ context: off, muted: true });
      quiet.unlock();
      quiet.tone('amber', 0.2);
      quiet.tone('green', 0.6);
      quiet.motors({ rpm: 6000, speed: 20 }, 0.1);
      quiet.gate(1.0);
      quiet.sting(1.2);
      const b = await off.startRendering();
      let p = 0; const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i += 1) { const a = Math.abs(d[i]); if (a > p) p = a; }
      return { peak: p, state: quiet.state };
    })(),
  };
})()`;

async function sound() {
  note(`${stamp()} sound`);
  const page = await open({ width: 1280, height: 800 });
  try {
    await ready(page);
    const r = await page.evaluate(PROBE);
    check('sound', 'nothing sounds before the first cue', r.before < 1e-4, `rms ${r.before}`);
    check('sound', 'an amber tone is at 880 Hz and not at the green\'s pitch', r.amber.rms > 0.02 && r.amber.at880 > 8 * r.amber.at1320, JSON.stringify(r.amber));
    check('sound', 'and the gap after it is quiet', r.gap < 1e-3, `rms ${r.gap}`);
    check('sound', 'the green is at 1320 Hz and a long one', r.green.rms > 0.02 && r.green.at1320 > 8 * r.green.at880, JSON.stringify(r.green));
    check('sound', 'then quiet until the motors are asked for', r.quiet < 1e-3, `rms ${r.quiet}`);
    check('sound', 'motors at 4200 rpm sing at their blade pass, 210 Hz', r.low.rms > 0.003 && r.low.peak > 4 * r.low.off, JSON.stringify(r.low));
    check('sound', 'and at 8600 rpm they sing an octave higher, near 430 Hz, with the low note gone', r.high.rms > 0.003 && r.high.peak > 3 * r.high.lowBand, JSON.stringify(r.high));
    check('sound', 'a gate click at the line is sharper than the motors under it', r.click.during > 2.5 * r.click.before, JSON.stringify(r.click));
    check('sound', 'the sting ends on its held top note', r.sting.late > 3 * r.sting.other, JSON.stringify(r.sting));
    check('sound', 'the motors fade to nothing after they are stopped', r.after < 1e-3, `rms ${r.after}`);
    check('sound', 'and the whole show never clips', r.peak > 0.05 && r.peak < 0.98, `peak ${r.peak}`);
    check('sound', 'a muted sound renders silence, whatever it is asked for', r.muted.peak < 1e-6 && r.muted.state === 'muted', JSON.stringify(r.muted));

    /* The live page: a switch, a preference that is kept, and no sound until a gesture. */
    check('sound', 'before any gesture the page has built no sound, and says it is ready for one', (await page.evaluate('document.body.dataset.sound')) === 'ready');
    check('sound', 'the switch is there and says sound is on', (await text(page, '#sound')) === 'Sound on' && !(await page.evaluate("document.getElementById('sound').hidden")));
    await page.click('#sound');
    await page.until("document.body.dataset.sound === 'muted'", 5000, 'the page to say muted');
    check('sound', 'pressing it mutes, and says so in words', (await text(page, '#sound')) === 'Sound off' && (await page.evaluate("document.getElementById('sound').getAttribute('aria-pressed')")) === 'false');
    check('sound', 'and the mute is kept in this browser', (await page.evaluate("localStorage.getItem('webfpv-picker/v1/sound')")) === '"off"');
    await page.click('#sound');
    await page.until("document.body.dataset.sound === 'on'", 10000, 'the page to say on');
    check('sound', 'pressing it again turns it on, which is a gesture, so the context is running', (await text(page, '#sound')) === 'Sound on');
    await page.click('#sound');
    await page.evaluate('location.reload()');
    await page.sleep(500);
    await ready(page);
    check('sound', 'a mute survives a reload, and the page comes up muted', (await text(page, '#sound')) === 'Sound off' && (await page.evaluate('document.body.dataset.sound')) === 'muted');
    console12('sound', page);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* reduced                                                              */
/* ------------------------------------------------------------------ */

async function reduced() {
  note(`${stamp()} reduced motion`);
  const page = await open({ width: 1280, height: 800, reducedMotion: true });
  try {
    await ready(page);
    await page.evaluate(WATCH_TAG);
    await paste(page, namesFor(10).join('\n'));
    await page.until("document.getElementById('count').textContent === '10 of 50'", 5000, 'ten names');
    await page.until('window.__tag.length >= 10', 40000, 'ten frames of the first name\'s tag');
    const still = await page.evaluate('window.__tag');
    check('reduced', 'a name typed is a quad on its block at once: nothing drops', Math.max(...still) - Math.min(...still) < 2, `${Math.min(...still).toFixed(1)} to ${Math.max(...still).toFixed(1)} over ${still.length} frames`);
    await page.click('#arm');
    await page.until("document.body.dataset.state === 'sealed' && !document.getElementById('hud-chip').hidden", 20000, 'the chip, in place');
    check('reduced', 'the seal is a chip in the corner at once, and no slap on the glass', await page.evaluate("document.getElementById('hud-seal').hidden"));
    const skip = await page.evaluate("(() => { const b = document.getElementById('hud-skip'); const c = getComputedStyle(b); return { hidden: b.hidden, background: c.backgroundColor, size: parseFloat(c.fontSize) }; })()");
    check('reduced', 'the skip button is there, mint and large', !skip.hidden && skip.background === 'rgb(125, 255, 180)' && skip.size >= 14, JSON.stringify(skip));
    const moving = await page.evaluate("document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getTiming().duration > 1).length");
    check('reduced', 'nothing on the page is animating for more than a blink', moving === 0, String(moving));
    await page.until("document.body.dataset.state === 'lights'", 30000, 'the lights');
    await shot(page, 'm1-lights-still');
    await page.until("document.body.dataset.state === 'race'", 60000, 'the race');
    await page.click('#hud-skip');
    await page.until("document.body.dataset.state === 'results'", 30000, 'the results');
    const receipt = (await log(page))[0];
    check('reduced', 'the results are the draw\'s', (await text(page, '.winner-name')) === receipt.names[receipt.order[0]]);
    console12('reduced', page);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* reload                                                               */
/* ------------------------------------------------------------------ */

async function reload() {
  note(`${stamp()} reload`);
  const page = await open({ width: 1280, height: 800 });
  try {
    await ready(page);
    await paste(page, namesFor(12).join('\n'));
    await page.until("document.getElementById('count').textContent === '12 of 50'", 5000, 'twelve names');
    await page.click('#arm');
    await page.until("document.body.dataset.state === 'lights'", 60000, 'the lights');
    const before = (await log(page))[0];
    await page.evaluate('location.reload()');
    await page.sleep(500);
    await ready(page);
    const after = await log(page);
    check('reload', 'a reload in the middle of the lights loses the show and not the result', after.length === 1 && after[0].commitment === before.commitment && after[0].seed === before.seed);
    check('reload', 'and the names come back', (await page.evaluate("document.getElementById('names').value")) === namesFor(12).join('\n'));
    check('reload', 'and the draw is listed, with what it was', (await page.evaluate("document.querySelectorAll('#log li').length")) === 1 && (await text(page, '#log-count')) === '(1)' && (await text(page, '#log .fp')) === fingerprint(before.commitment));
    await page.evaluate("document.getElementById('log-box').open = true");
    await shot(page, 'r1-log');
    await page.click('#log .acts button');
    await page.until("document.body.dataset.state === 'sealed' && !document.getElementById('hud-replay').hidden", 20000, 'a replay from the log');
    check('reload', 'a replay from the log is marked and shows the draw\'s own fingerprint', (await text(page, '#hud-seal-print')) === fingerprint(before.commitment));
    await page.until("!document.getElementById('hud-skip').hidden", 10000, 'the skip button');
    await page.click('#hud-skip');
    await page.until("document.body.dataset.state === 'results'", 30000, 'the results');
    check('reload', 'it ends on the winner the draw gave', (await text(page, '.winner-name')) === before.names[before.order[0]]);
    check('reload', 'and it wrote nothing', (await log(page)).length === 1);
    await page.evaluate("[...document.querySelectorAll('#results .btn')].find((b) => b.textContent.startsWith('Edit names')).click()");
    await page.until("document.body.dataset.state === 'setup'", 15000, 'the sheet');
    await sheetIn(page);
    /* A replay started with nothing typed on the sheet: "Type names to fill the grid" belongs to the sheet, and was once left standing across the middle of a race. */
    await page.evaluate("const n = document.getElementById('names'); n.value = ''; n.dispatchEvent(new Event('input', { bubbles: true }))");
    await page.until("document.getElementById('count').textContent === '0 of 50'", 5000, 'an empty sheet');
    check('reload', 'an empty sheet says to type names', await page.evaluate("!document.getElementById('empty-note').hidden"));
    await page.evaluate("document.getElementById('log-box').open = true");
    await page.click('#log .acts button');
    await page.until("document.body.dataset.state === 'lights'", 60000, 'the lights of a replay from an empty sheet');
    check('reload', 'and a replay started from it does not leave that note over the race', await page.evaluate("document.getElementById('empty-note').hidden"));
    await page.until("!document.getElementById('hud-skip').hidden", 10000, 'the skip button');
    await page.click('#hud-skip');
    await page.until("document.body.dataset.state === 'results'", 30000, 'the results of that replay');
    await page.evaluate("[...document.querySelectorAll('#results .btn')].find((b) => b.textContent.startsWith('Edit names')).click()");
    await page.until("document.body.dataset.state === 'setup'", 15000, 'the sheet again');
    await sheetIn(page);
    const controls = await page.evaluate("[...document.querySelectorAll('#log .acts > *')].map((n) => n.textContent).join('|')");
    check('reload', 'each draw in the log can be replayed, verified, copied and saved', controls === 'Replay|Verify|Copy receipt|Save', controls);
    await page.evaluate("document.getElementById('log-box').open = true");
    await page.click('#log-clear');
    check('reload', 'clearing the log asks twice', (await text(page, '#log-clear')).startsWith('Really clear') && (await log(page)).length === 1);
    await page.click('#log-clear');
    await page.until("document.querySelectorAll('#log li.log-empty').length === 1", 5000, 'an empty log');
    check('reload', 'and then the log is empty, here and in the store', (await log(page)).length === 0 && (await text(page, '#log-count')) === '');
    console12('reload', page);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* phone                                                                */
/* ------------------------------------------------------------------ */

async function phone() {
  note(`${stamp()} phone`);
  const page = await open({ width: 390, height: 844, touch: true });
  try {
    await ready(page);
    await shot(page, 'p1-setup');
    await paste(page, namesFor(14).join('\n'));
    await page.until("document.getElementById('count').textContent === '14 of 50'", 5000, 'fourteen names');
    await page.click('input[name=winners][value="3"]');
    const arm = await page.evaluate("document.getElementById('arm').getBoundingClientRect().height");
    check('phone', 'the arm switch is a thumb tall', arm >= 56, String(arm));
    await page.click('#arm');
    await page.until("document.body.dataset.state === 'race'", 120000, 'the race');
    await page.sleep(1500);
    await shot(page, 'p2-race');
    const overflowRace = await page.evaluate('document.documentElement.scrollWidth - innerWidth');
    check('phone', 'the race overlay does not scroll the page sideways', overflowRace <= 0, String(overflowRace));
    await page.until("document.body.dataset.state === 'results'", 300000, 'the results');
    await page.sleep(1500);
    const metrics = await page.evaluate(`(() => {
      const r = document.getElementById('results');
      return { shape: r.dataset.shape, scroll: r.scrollHeight, height: r.clientHeight, wide: document.documentElement.scrollWidth - innerWidth,
        panels: [...r.querySelectorAll('[data-panel]')].map((p) => p.dataset.panel).join() };
    })()`);
    check('phone', 'the results are a strip that scrolls, big panel first', metrics.shape === 'strip' && metrics.scroll > metrics.height && metrics.panels.startsWith('big'), JSON.stringify(metrics));
    check('phone', 'with no sideways scroll', metrics.wide <= 0, String(metrics.wide));
    await shot(page, 'p3-results');
    await page.evaluate("document.getElementById('results').scrollTop = 600");
    await page.sleep(300);
    await shot(page, 'p4-results-scrolled');
    console12('phone', page);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* bare                                                                 */
/* ------------------------------------------------------------------ */

async function bare() {
  for (const [label, options] of [['no WebGL', { noWebgl: true }], ['no CDN', { block: true }]]) {
    note(`${stamp()} bare: ${label}`);
    const page = await open({ width: 1280, height: 800, ...options });
    try {
      await page.until("document.body.dataset.state === 'setup' && document.body.dataset.field === 'none'", 120000, `a sheet with no field (${label})`);
      await paste(page, namesFor(8).join('\n'));
      await page.until("!document.getElementById('arm').disabled", 5000, 'the arm switch');
      check('bare', `${label}: the sheet says the race cannot be shown, and still lets a draw be made`, (await text(page, '#status')).includes('cannot show the race'), await text(page, '#status'));
      await shot(page, `b1-${label.replace(/\W+/g, '-')}-sheet`);
      await page.click('#arm');
      const counted = [];
      for (let i = 0; i < 400; i += 1) {
        const s = await page.evaluate("({ state: document.body.dataset.state, beat: document.getElementById('hud-beat').textContent })");
        if (/^[123]$/.test(s.beat) && !counted.includes(s.beat)) {
          counted.push(s.beat);
        }
        if (s.state === 'results') {
          break;
        }
        await page.sleep(60);
      }
      check('bare', `${label}: a countdown, 3 2 1, stands in for the race`, counted.join('') === '321', counted.join(' '));
      await page.until("document.body.dataset.state === 'results'", 60000, 'the results, without a race');
      const receipt = (await log(page))[0];
      check('bare', `${label}: the results are the draw's, on a page with no picture`, (await text(page, '.winner-name')) === receipt.names[receipt.order[0]] && await exists(page, '.rp.big.plain'));
      await page.sleep(800);
      await shot(page, `b2-${label.replace(/\W+/g, '-')}-results`);
      console12(`bare, ${label}`, page, { allow: options.block ? /cdn\.jsdelivr\.net|ERR_|Failed to load resource|Failed to fetch|dynamically imported module/i : null });
    } finally {
      await page.close();
    }
  }
}

/* ------------------------------------------------------------------ */
/* photo                                                                */
/* ------------------------------------------------------------------ */

/*
 * Every frame, from outside the page: the clock, the beat, the state, and
 * where each tag that is showing stands. The tags are how a quad is seen from
 * outside, since the fleet is in WebGL, and a tag that is on the glass is a
 * quad that is.
 */
const SAMPLER = `(() => {
  window.__s = [];
  const frame = () => {
    const c = document.getElementById('hud-clock').textContent.split(':');
    const tags = [...document.querySelectorAll('#hud-tags .tag:not([hidden])')].map((t) => {
      const r = t.getBoundingClientRect();
      return { name: t.querySelector('span').textContent, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    window.__s.push({
      at: performance.now(),
      clock: Number(c[0]) * 60 + Number(c[1]),
      beat: document.getElementById('hud-beat').textContent,
      state: document.body.dataset.state,
      tags,
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})()`;

/*
 * A kept draw whose first two cross the line 0.07 s apart (tests/lib/
 * photo-finish.json, found by a search over seeds; it is a receipt in the log,
 * which the page replays and never issues). It shows what only a finish like
 * that shows, the last 0.8 s before the line at a third of the speed with the
 * beat that says so, and what every finish should show: the winner is still on
 * the glass after the line, which is where the flip is. It was a flip nobody
 * saw, because the rail's frame ended a few metres after the line.
 */
async function photo() {
  note(`${stamp()} photo finish: a kept draw whose first two cross 0.07 s apart`);
  const receipt = JSON.parse(await readFile(join(root, 'tests', 'lib', 'photo-finish.json'), 'utf8'));
  const derived = await replayOf(receipt);
  const plan = makePlan({ order: derived.order, showSeed: derived.showSeed, length: receipt.length });
  const slow = photoWindow(plan);
  check('photo', 'the draw in the log is a photo finish, with a window for the slow motion', Boolean(slow), JSON.stringify(slow));
  const winner = receipt.names[derived.order[0]];
  const runnerUp = receipt.names[derived.order[1]];
  const entry = JSON.stringify(JSON.stringify([receipt]));
  const page = await open({
    width: 1280, height: 720, query: { speed: '1' }, seed: [`localStorage.setItem('webfpv-picker/v1/log', ${entry});`],
  });
  try {
    await ready(page);
    await page.evaluate(SAMPLER);
    await page.evaluate("document.getElementById('log-box').open = true");
    await page.click('#log .acts button');
    await page.until("document.body.dataset.state === 'finish'", 240000, 'the finish');
    await shot(page, 'ph1-finish');
    await page.until("document.body.dataset.state === 'results'", 60000, 'the results');
    const samples = await page.evaluate('window.__s');
    const beats = [];
    for (const s of samples) {
      if (s.beat && beats.at(-1) !== s.beat) {
        beats.push(s.beat);
      }
    }
    check('photo', 'the beats say Photo finish, and then name the winner', beats.includes('Photo finish') && beats.indexOf(`${winner} wins`) > beats.indexOf('Photo finish'), beats.join(' | '));
    const steps = [];
    for (let i = 1; i < samples.length; i += 1) {
      const a = samples[i - 1];
      const b = samples[i];
      if (a.state === 'race' && b.state === 'race' && b.clock > a.clock) {
        steps.push({ at: b.clock, d: b.clock - a.clock });
      }
    }
    const mean = (xs) => xs.reduce((sum, x) => sum + x, 0) / Math.max(1, xs.length);
    const before = steps.filter((s) => s.at > 15 && s.at < slow.from - 0.2).map((s) => s.d);
    const inside = steps.filter((s) => s.at > slow.from + 0.1 && s.at < slow.to - 0.1).map((s) => s.d);
    const ratio = mean(inside) / mean(before);
    check('photo', 'the last 0.8 s before the line runs at about a third of the speed', inside.length >= 12 && ratio > 0.25 && ratio < 0.42, `${inside.length} frames inside the window, ${before.length} before it, ratio ${ratio.toFixed(2)}`);
    /*
     * The lens closes in on a photo finish. At the first frame after the winner
     * has crossed, the winner and the runner up are 1.6 m apart, and their tags
     * stand over them: the width of the gap between the tags is how big the
     * picture is, which is the one thing about the lens that can be read from
     * outside the page. Measured both ways, with the zoom taken out and in.
     */
    const crossing = samples.find((s) => s.state === 'finish');
    const where = (name) => crossing && crossing.tags.find((t) => t.name === name);
    const apart = where(winner) && where(runnerUp) ? Math.abs(where(winner).x - where(runnerUp).x) : NaN;
    note(`at the line the winner's tag and the runner up's stand ${apart.toFixed(0)} px apart at 1280 by 720`);
    /* 243 px with the zoom and 133 without it, over one replay of the same draw: the line is between them. */
    check('photo', 'at the line the first two are far enough apart on the glass that the lens has closed in on them', apart >= 190, `${apart} px`);
    /* Race seconds, which the page's clock stops counting at the line: a frame is worth the time since the last, no more than the tenth of a second the page clamps it to. */
    const after = samples.filter((s) => s.state === 'finish');
    let seen = 0;
    let frames = 0;
    for (let i = 1; i < after.length; i += 1) {
      if (after[i].tags.some((t) => t.name === winner && t.x > 0 && t.x < 1280)) {
        seen += Math.min(0.1, (after[i].at - after[i - 1].at) / 1000);
        frames += 1;
      }
    }
    note(`the last 0.8 s ran at ${ratio.toFixed(2)} of the speed over ${inside.length} frames; the winner's tag stood on the glass for ${seen.toFixed(2)} s of race time after the line, ${frames} of ${after.length} frames`);
    /* Measured both ways: 1.04 s with the rail turned to the line and 0.48 s with it looking abeam of where it parked (the tag of a top three quad stands where its quad is, and a quad has gone before its tag does). */
    check('photo', 'the winner is on the glass for three quarters of a second after the line, which is where the flip is', seen >= 0.75, `${seen.toFixed(2)} s`);
    console12('photo', page);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */

const SCENARIOS = {
  flow, sheet, actions, sound, reduced, reload, phone, bare, photo,
};

async function main() {
  const wanted = settings.only || Object.keys(SCENARIOS);
  for (const name of wanted) {
    if (!SCENARIOS[name]) {
      throw new Error(`no scenario called ${name}: ${Object.keys(SCENARIOS).join(', ')}`);
    }
    try {
      await SCENARIOS[name]();
    } catch (e) {
      check(name, 'the scenario ran to its end', false, e.message);
    }
  }
  const failed = ledger.filter((c) => !c.ok);
  console.log(`\n${ledger.length - failed.length} of ${ledger.length} checks passed${failed.length ? `, ${failed.length} did not` : ''}. Pictures are in ${OUT}.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`shots: ${e.message}`);
  process.exit(1);
});
