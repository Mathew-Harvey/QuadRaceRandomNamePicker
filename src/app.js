/*
 * app.js: the page's one script. The setup sheet, the draw, the show, the
 * results, and the order they happen in.
 *
 *   loading   the field is being built; the sheet already works
 *   setup     names go in, the grid fills, a slow orbit over it
 *   sealed    the draw is made and written to the log, and its fingerprint
 *             is slapped on the glass
 *   lights    the aerial comes down to the rail, three amber, a hold, green
 *   race      the rail follows the leading group
 *   finish    the winner has crossed; the rest are crossing
 *   results   the page that breaks the seal
 *
 * THE ORDER OF THINGS IS THE CLAIM. Arm makes the draw, with the browser's
 * cryptographic random generator (src/draw.js, the only file that touches it),
 * and the draw is written to this browser's log BEFORE the countdown starts, so a reload in
 * the middle of a race loses the show and not the result. Then the plan is
 * made from the draw, and from nothing else: the order and the show seed are
 * both recomputed from the receipt by replayOf, the same function a replay
 * uses, so a live show and a replay of its receipt are one race. Nothing after
 * the seal can change who wins, because nothing after the seal decides
 * anything: this file reads the plan and draws it.
 *
 * THE RESULTS PAGE DOES NOT EXIST UNTIL THE LAST DRAWN WINNER HAS CROSSED. It
 * is not hidden, it is not built. The log on the sheet, which has every
 * earlier draw in it, is not redrawn between the seal and the results either,
 * because the draw being shown is already in it.
 *
 * THE LOOP OWNS TIME. One requestAnimationFrame callback advances a few
 * clocks by the frame's delta, clamped to a tenth of a second so that a tab
 * that was hidden comes back to the race where it left it, and the plan is
 * only ever sampled at the clock. Nothing that decides a result reads the
 * clock, and a dropped frame changes how the race looks and not what happens
 * in it. `?speed=` scales the race clock for development and nothing else:
 * it touches time, never the draw.
 *
 * THE WORLD IS OPTIONAL. three.js comes from a CDN and WebGL may not exist, so
 * world.js is imported on demand and a page without it still draws, seals and
 * shows the results, with the race left out and a plain panel where the
 * winner's picture goes.
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
  LIMITS, available, canonicalTitle, checkReceipt, drawLive, fingerprint, parseReceipt, receiptFragment, replayOf,
} from './draw.js';
import { makePlan } from './choreo.js';
import { makeCourse } from './course.js';
import { HERO_AFTER, HERO_FOV } from './camera.js';
import { pixelBeforeBend } from './lens.js';
import {
  advanceClock, beatsBetween, beatsFor, commaList, formatClock, gapOf, lapOf, lightsAt, lightsPlan, numberTickets,
  oddsLines, placeTags, readNames, RESULTS_AFTER, slowWindow, standings, winnerCut, winnersAllowed,
} from './show.js';
import { createHud } from './hud.js';
import { RPM, createSound, raceRpm } from './sound.js';
import { buildResults, copyReceipt, saveReceipt } from './results.js';
import { letterTitles } from './titles.js';
import { createStore, pageStorage } from './store.js';
import {
  SLOTS, TYPES, boardMark, grassMark, pack, readLogo, thumbnail, unpack,
} from './sponsors.js';
import { liveryCss } from './livery.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
};

/* ------------------------------------------------------------------ */
/* Settings the page reads once                                         */
/* ------------------------------------------------------------------ */

const params = new URLSearchParams(location.search);

/* Development only, and it scales the race clock, which is the long part of the show: the seal and the lights stay in real time so a picture can be taken of them. It cannot reach the draw. */
const SPEED = clamp(Number(params.get('speed')) || 1, 0.25, 12);

/* The other half of the stylesheet's reduced motion block, read when it is used because the setting can change under an open page. */
const reducedQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const REDUCED = () => reducedQuery.matches;

/* How long the seal stays on the glass before it folds into the corner, in seconds. */
const SEAL_HOLD = 1.9;
const SEAL_HOLD_STILL = 1.4;
/* A tag stands this high over its quad, in metres of the plan's frame: clear of a quad drawn four and a half times life size. */
const TAG_LIFT = 1;
/* The lamps when nothing is being shown. */
const LAMPS_OFF = [0, false];

const body = document.body;
const store = createStore(pageStorage());
const cryptoOk = available();

const ui = {
  canvas: $('view'),
  title: $('event-title'),
  names: $('names'),
  gutter: $('gutter'),
  count: $('count'),
  countNote: $('count-note'),
  ticketsN: $('tickets-n'),
  ticketsFill: $('tickets-fill'),
  splitOffer: $('split-offer'),
  splitYes: $('split-yes'),
  splitNo: $('split-no'),
  odds: $('odds'),
  warn: $('warn'),
  slots: $('slots'),
  arm: $('arm'),
  status: $('status'),
  logBox: $('log-box'),
  log: $('log'),
  logCount: $('log-count'),
  logFoot: $('log-foot'),
  logClear: $('log-clear'),
  forget: $('forget'),
  present: $('present'),
  sound: $('sound'),
  emptyNote: $('empty-note'),
  sheet: $('sheet'),
  lap: $('hud-lap'),
};

const hud = createHud({ reduced: REDUCED });

/*
 * The sound, which is silent until a gesture and muted by a preference that is
 * kept. `body[data-sound]` says what it is doing, for the checks to wait on and
 * for nothing else: none, ready (before a gesture), on, muted, or blocked (a
 * context the browser has put to sleep).
 */
const sound = createSound({
  muted: store.get('sound', 'on') === 'off',
  onState: (value) => {
    body.dataset.sound = value;
    renderSoundButton();
  },
});

function renderSoundButton() {
  ui.sound.hidden = !sound.supported;
  const on = !sound.muted;
  ui.sound.textContent = on ? 'Sound on' : 'Sound off';
  ui.sound.setAttribute('aria-pressed', String(on));
}

/* ------------------------------------------------------------------ */
/* State                                                                */
/* ------------------------------------------------------------------ */

let state = 'loading';
let world = null;
let worldModule = null;
/* The page has no field to show: WebGL is missing, or the CDN could not be reached. */
let noWorld = false;
let building = false;
let buildPercent = 0;
let dirty = false;
let rebuildTimer = 0;
let logosVersion = 0;
/* What the sheet last said is wrong, until something is typed or armed. */
let notice = null;

/* The list as the sheet holds it, and what is chosen beside it. */
let list = readNames('');
let length = 30;
let winners = 1;
let splitDismissed = false;

/* The draw being shown, from the seal to the results; and the results page once there is one. */
let show = null;
let results = null;
/* True from the moment the page starts being built, which is before buildResults has returned it. */
let resultsOpen = false;

/* The clocks. wall is cosmetic (flags, clouds); orbit is the paddock's. */
let wall = 0;
let orbit = 0;
let lastNow = 0;

/* The four sponsor slots: a mark each, or null. */
const logos = Array.from({ length: SLOTS }, () => null);
const slotErrors = Array.from({ length: SLOTS }, () => '');

function setState(next) {
  state = next;
  body.dataset.state = next;
  if (next !== 'race' && next !== 'finish') {
    delete body.dataset.shot;
  }
  syncEmptyNote();
  aimShift(false);
}

/*
 * "Type names to fill the grid" belongs to the sheet's time. It was left
 * standing over a replay started from the draw log with nothing typed on the
 * sheet, because only typing and the field's first build ever decided it:
 * seen in a frame of the photo finish, across the middle of the picture.
 */
function syncEmptyNote() {
  ui.emptyNote.hidden = list.entries.length > 0 || noWorld || (state !== 'setup' && state !== 'loading');
}

/*
 * The picture is slid so that what it is about sits in the part of the window
 * the sheet leaves, which is the right of a sheet on the left and the top of a
 * bottom sheet, and slid back as the sheet goes. It is a view offset and not a
 * move of the camera, so it changes no pose, and it is eased so that the slide
 * is gone by the time the sheet is. Under reduced motion it is not a slide at all.
 */
const shift = {
  x: 0, y: 0, tx: 0, ty: 0,
};

function aimShift(snap) {
  shift.tx = 0;
  shift.ty = 0;
  if (state === 'setup' || state === 'loading') {
    if (typeof matchMedia === 'function' && matchMedia('(max-width: 900px)').matches) {
      shift.ty = (ui.canvas.clientHeight - ui.sheet.offsetTop) / 2;
    } else {
      shift.tx = -(ui.sheet.offsetLeft + ui.sheet.offsetWidth) / 2;
    }
  }
  if (snap || REDUCED()) {
    shift.x = shift.tx;
    shift.y = shift.ty;
  }
}

function shiftOffset(dt) {
  const k = Math.min(1, dt * 6);
  shift.x += (shift.tx - shift.x) * k;
  shift.y += (shift.ty - shift.y) * k;
  if (Math.abs(shift.x) < 0.5 && Math.abs(shift.y) < 0.5) {
    return null;
  }
  return {
    W: ui.canvas.clientWidth, H: ui.canvas.clientHeight, dx: shift.x, dy: shift.y,
  };
}

/* ------------------------------------------------------------------ */
/* Status                                                               */
/* ------------------------------------------------------------------ */

function say(text, bad = false) {
  notice = text ? { text, bad } : null;
  renderStatus();
}

function renderStatus() {
  const n = list.entries.length;
  let text;
  let bad = false;
  if (!cryptoOk) {
    text = 'Drawing needs a secure page (https or localhost), and this one is not, so a draw cannot be made here.';
    bad = true;
  } else if (notice) {
    text = notice.text;
    bad = notice.bad;
  } else if (building) {
    text = buildPercent > 0 ? `Building the field ${Math.round(buildPercent * 100)}%` : 'Building the field.';
  } else if (list.over) {
    const extra = list.names.length - LIMITS.maxNames;
    text = `Fifty is the most the grid holds. Take off the ${extra === 1 ? 'last line' : `last ${extra} lines`} to arm.`;
    bad = true;
  } else if (n < LIMITS.minNames) {
    text = n === 0 ? 'Add at least two names.' : 'Add one more name.';
  } else {
    const where = noWorld ? 'This page cannot show the race (no WebGL, or three.js did not load), so the draw is sealed and shown without it. ' : '';
    text = `${where}Ready: ${n} names, ${length} s, ${winners === 1 ? '1 winner' : `${winners} winners`}.`;
  }
  ui.status.textContent = text;
  ui.status.classList.toggle('bad', bad);
  ui.arm.disabled = !(cryptoOk && !building && state === 'setup' && n >= LIMITS.minNames && !list.over);
}

/* ------------------------------------------------------------------ */
/* The names                                                            */
/* ------------------------------------------------------------------ */

const gutterInner = el('div');
ui.gutter.append(gutterInner);

function renderGutter() {
  const counts = new Map(list.duplicates.map((d) => [d.name, d.count]));
  const rows = document.createDocumentFragment();
  for (const line of list.lines) {
    const row = el('div', line.extra ? 'g extra' : 'g');
    if (line.entry !== null) {
      const again = counts.get(line.name);
      if (again && !line.extra) {
        row.append(el('span', 'dup', `×${again}`));
      }
      row.append(el('span', 'n', String(line.entry)));
      if (!line.extra) {
        const chip = el('i', 'chip');
        chip.style.background = liveryCss(line.entry - 1);
        row.append(chip);
      }
    }
    rows.append(row);
  }
  gutterInner.replaceChildren(rows);
  syncGutter();
}

function syncGutter() {
  gutterInner.style.transform = `translateY(${-ui.names.scrollTop}px)`;
}

let namesSaver = 0;

/* `save` is false for a list that was just forgotten, which must not be written straight back. */
function onNames(save = true) {
  list = readNames(ui.names.value);
  if (!show) {
    hud.setField(list.entries);
  }
  const n = list.entries.length;
  renderGutter();
  ui.count.textContent = `${n} of ${LIMITS.maxNames}`;
  ui.count.classList.toggle('full', n >= LIMITS.maxNames);
  ui.countNote.textContent = list.over ? '(the grid holds fifty)' : '';
  ui.warn.hidden = !list.over;
  if (list.over) {
    const extra = list.names.length - LIMITS.maxNames;
    ui.warn.textContent = `Fifty is the most the grid holds. ${extra === 1 ? 'One line is' : `${extra} lines are`} past it, struck through, and arming is off until ${extra === 1 ? 'it is' : 'they are'} gone.`;
  }

  /* More winners than there are places to give is not on offer. */
  const allowed = winnersAllowed(n);
  for (const radio of document.querySelectorAll('input[name="winners"]')) {
    radio.disabled = Number(radio.value) > allowed;
  }
  if (winners > allowed) {
    winners = allowed;
    const radio = document.querySelector(`input[name="winners"][value="${winners}"]`);
    if (radio) {
      radio.checked = true;
    }
  }
  renderOdds();

  /* One line with commas in it is probably a pasted list, and is offered a split once. */
  const parts = commaList(ui.names.value);
  if (!parts) {
    splitDismissed = false;
  }
  ui.splitOffer.hidden = !parts || splitDismissed;

  syncEmptyNote();
  notice = null;
  renderStatus();
  clearTimeout(namesSaver);
  if (save !== false) {
    namesSaver = setTimeout(() => store.set('names', ui.names.value), 250);
  }
}

function renderOdds() {
  const lines = oddsLines({ count: list.entries.length, winners, duplicates: list.duplicates });
  ui.odds.replaceChildren(...lines.map((text) => el('li', '', text)));
}

function setNames(text, save = true) {
  ui.names.value = text;
  ui.names.scrollTop = 0;
  onNames(save);
}

/* ------------------------------------------------------------------ */
/* Sponsor logos                                                        */
/* ------------------------------------------------------------------ */

const PLACEMENT_LABELS = { both: 'Boards and grass', boards: 'Boards only', grass: 'Grass only' };

function persistLogos() {
  store.set('logos', logos.filter(Boolean).map(pack));
}

/* What the world is built with: the boards take the mark as drawn, the grass takes it stretched for the camera and fitted to the document's budget. */
function marksForWorld() {
  const shown = logos.filter(Boolean);
  const onGrass = shown.filter((l) => l.placement !== 'boards');
  const grass = [];
  for (const logo of onGrass) {
    try {
      grass.push(grassMark(logo, onGrass.length));
    } catch (e) {
      say(`${logo.name}: ${e.message}`, true);
    }
  }
  return { boards: shown.filter((l) => l.placement !== 'grass').map(boardMark), grass };
}

function afterLogosChanged() {
  persistLogos();
  logosVersion += 1;
  renderSlots();
  clearTimeout(rebuildTimer);
  /* A burst of drops is one rebuild: the field takes seconds to build and nobody wants it built four times. */
  rebuildTimer = setTimeout(() => {
    buildField();
  }, 800);
}

function nextFree(preferred) {
  if (typeof preferred === 'number' && !logos[preferred]) {
    return preferred;
  }
  return logos.findIndex((l) => !l);
}

async function addFiles(files, preferred = null) {
  let added = false;
  for (const file of files) {
    const at = nextFree(added ? null : preferred);
    if (at < 0) {
      say(`Four logos is the most. Remove one to add ${file.name}.`, true);
      break;
    }
    slotErrors[at] = '';
    try {
      logos[at] = Object.assign(await readLogo(file, 'both'), { thumb: null });
      logos[at].thumb = thumbnail(logos[at]);
      added = true;
    } catch (e) {
      slotErrors[at] = e.message;
      say(e.message, true);
    }
    renderSlots();
  }
  if (added) {
    afterLogosChanged();
  }
}

function hasFiles(event) {
  return Boolean(event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files'));
}

function slotNode(i) {
  const logo = logos[i];
  const node = el('div', logo ? 'slot filled' : 'slot');
  node.addEventListener('dragover', (e) => {
    if (hasFiles(e)) {
      e.preventDefault();
      node.classList.add('over');
    }
  });
  node.addEventListener('dragleave', () => node.classList.remove('over'));
  node.addEventListener('drop', (e) => {
    node.classList.remove('over');
    if (hasFiles(e)) {
      e.preventDefault();
      e.stopPropagation();
      addFiles(Array.from(e.dataTransfer.files), i);
    }
  });
  if (!logo) {
    const drop = el('label', 'drop');
    drop.append(document.createTextNode(`Logo ${i + 1}: drop a picture, or click to choose`));
    const input = el('input');
    input.type = 'file';
    input.accept = TYPES.join(',');
    input.multiple = true;
    input.addEventListener('change', () => {
      addFiles(Array.from(input.files), i);
      input.value = '';
    });
    drop.append(input);
    node.append(drop);
  } else {
    const thumb = el('div', 'thumb');
    const img = el('img');
    img.alt = '';
    img.src = logo.thumb;
    thumb.append(img, el('span', 'name', logo.name));
    const kill = el('button', 'text kill', '×');
    kill.type = 'button';
    kill.setAttribute('aria-label', `Remove ${logo.name}`);
    kill.addEventListener('click', () => {
      logos[i] = null;
      slotErrors[i] = '';
      afterLogosChanged();
    });
    const where = el('select');
    where.setAttribute('aria-label', `Where ${logo.name} goes`);
    for (const [value, label] of Object.entries(PLACEMENT_LABELS)) {
      const option = el('option', '', label);
      option.value = value;
      option.selected = logo.placement === value;
      where.append(option);
    }
    where.addEventListener('change', () => {
      logo.placement = where.value;
      afterLogosChanged();
    });
    node.append(thumb, where, kill);
  }
  if (slotErrors[i]) {
    node.append(el('div', 'err', slotErrors[i]));
  }
  return node;
}

function renderSlots() {
  ui.slots.replaceChildren(...logos.map((_, i) => slotNode(i)));
}

async function restoreLogos() {
  const saved = store.get('logos', []);
  if (!Array.isArray(saved)) {
    return;
  }
  for (const entry of saved.slice(0, SLOTS)) {
    try {
      const logo = await unpack(entry);
      logo.thumb = thumbnail(logo);
      logos[logos.findIndex((l) => !l)] = logo;
    } catch (e) {
      /* A kept mark that will not open is dropped, and the others are kept. */
    }
  }
}

/* ------------------------------------------------------------------ */
/* The draw log                                                         */
/* ------------------------------------------------------------------ */

function renderLog() {
  const items = [];
  for (const raw of store.log.list()) {
    try {
      items.push(parseReceipt(raw));
    } catch (e) {
      /* An entry the storage has damaged is left out, not shown as something it is not. */
    }
  }
  ui.logCount.textContent = items.length ? `(${items.length})` : '';
  if (!items.length) {
    ui.log.replaceChildren(el('li', 'log-empty', 'No draws yet.'));
  } else {
    ui.log.replaceChildren(...items.map((receipt) => {
      const li = el('li');
      const when = new Date(receipt.sealedAt);
      const stamp = Number.isNaN(when.getTime()) ? receipt.sealedAt : when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      li.append(el('div', 'when', receipt.title ? `${stamp} · ${receipt.title}` : stamp));
      li.append(el('div', 'fp', fingerprint(receipt.commitment)));
      const top = receipt.order.slice(0, receipt.winners).map((entry) => receipt.names[entry]).join(', ');
      li.append(el('div', 'who', `${receipt.names.length} names · ${receipt.winners === 1 ? 'winner' : 'winners'}: ${top}`));
      const acts = el('div', 'acts');
      const replay = el('button', 'text', 'Replay');
      replay.type = 'button';
      replay.addEventListener('click', () => {
        if (state === 'setup') {
          startShow({ receipt, replay: true });
        }
      });
      const verify = el('a', 'text', 'Verify');
      verify.href = `verify.html#${receiptFragment(receipt)}`;
      const copyIt = el('button', 'text', 'Copy receipt');
      copyIt.type = 'button';
      copyIt.addEventListener('click', async () => {
        copyIt.textContent = (await copyReceipt(receipt)) ? 'Copied' : 'Could not copy';
        setTimeout(() => {
          copyIt.textContent = 'Copy receipt';
        }, 1800);
      });
      const saveIt = el('button', 'text', 'Save');
      saveIt.type = 'button';
      saveIt.addEventListener('click', () => saveReceipt(receipt));
      acts.append(replay, verify, copyIt, saveIt);
      li.append(acts);
      return li;
    }));
  }
  ui.logFoot.textContent = store.persistent
    ? 'The last 50 draws are kept in this browser and nowhere else. A replay never issues a receipt.'
    : 'This browser would not let the page keep anything, so this list is gone when the tab closes.';
}

/* ------------------------------------------------------------------ */
/* The field                                                            */
/* ------------------------------------------------------------------ */

/*
 * Whether this browser can make a WebGL2 context at all, asked of a canvas
 * nobody sees. Asking three.js is the other way to find out, and it says so on
 * the console, three times, which is a page with nothing wrong with it
 * reporting errors. The context is let go at once: browsers keep a handful.
 */
function webglOk() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) {
      return false;
    }
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) {
      lose.loseContext();
    }
    return true;
  } catch (e) {
    return false;
  }
}

function setBuildProgress(f) {
  buildPercent = f;
  renderStatus();
}

/* What the field is doing, as a word on the page for the checks to wait on: building, ready, or none for a page that has no field. Read only, and nothing in the page reads it back. */
function markField(value) {
  body.dataset.field = value;
}

/*
 * Build the world, or rebuild it for new marks on the same context. The old
 * world is let go first, so nothing is drawn while the new one is built, and
 * the canvas holds the last frame it was given.
 */
async function buildField() {
  if (building || (state !== 'setup' && state !== 'loading')) {
    dirty = true;
    return;
  }
  building = true;
  dirty = false;
  buildPercent = 0;
  const version = logosVersion;
  let shell = null;
  if (world) {
    shell = world.shell;
    const old = world;
    world = null;
    old.dispose();
  }
  markField('building');
  renderStatus();
  const marks = marksForWorld();
  try {
    if (!webglOk()) {
      throw new Error('this browser has no WebGL');
    }
    if (!worldModule) {
      worldModule = await import('./world.js');
    }
    world = await worldModule.buildWorld({
      canvas: ui.canvas, shell, graphics: params.get('graphics'), logos: marks, onProgress: setBuildProgress,
    });
    world.gantry.setTitle(canonicalTitle(ui.title.value));
    noWorld = false;
    body.classList.add('ready');
    markField('ready');
  } catch (e) {
    /* No WebGL, or three.js could not be had: said in words, and the page carries on without a field. */
    console.info(`The field could not be built: ${e && e.message ? e.message : e}`);
    world = null;
    noWorld = true;
    markField('none');
  }
  building = false;
  if (dirty || version !== logosVersion) {
    buildField();
    return;
  }
  if (state === 'loading') {
    setState('setup');
  }
  syncEmptyNote();
  renderStatus();
}

/* ------------------------------------------------------------------ */
/* Arm                                                                  */
/* ------------------------------------------------------------------ */

async function arm() {
  if (state !== 'setup' || building || !cryptoOk) {
    return;
  }
  const names = list.entries.slice();
  if (names.length < LIMITS.minNames || list.over) {
    return;
  }
  const wanted = Math.min(winners, winnersAllowed(names.length));
  /* The sheet leaves at once, so a second press is not a second draw. */
  setState('sealed');
  notice = null;
  renderStatus();
  let receipt;
  try {
    receipt = await drawLive(names, { title: canonicalTitle(ui.title.value), winners: wanted, length });
  } catch (e) {
    setState('setup');
    say(`The draw could not be made: ${e.message}`, true);
    return;
  }
  /* Before the countdown, so that a reload mid race loses the show and not the result. */
  const kept = store.log.add(receipt);
  await startShow({ receipt, replay: false, kept });
}

/* ------------------------------------------------------------------ */
/* The show                                                             */
/* ------------------------------------------------------------------ */

const SPOKEN = new Set(['go', 'final']);

async function startShow({ receipt, replay, kept = true }) {
  setState('sealed');
  let derived;
  try {
    derived = await replayOf(receipt);
  } catch (e) {
    setState('setup');
    say(e.message, true);
    renderLog();
    return;
  }
  const names = receipt.names;
  const raceLength = [15, 30, 60].includes(receipt.length) ? receipt.length : 30;
  const course = world ? world.course : makeCourse();
  let plan;
  try {
    plan = makePlan({
      order: derived.order, showSeed: derived.showSeed, length: raceLength, course,
    });
  } catch (e) {
    setState('setup');
    say(`The race could not be planned: ${e.message}`, true);
    renderLog();
    return;
  }
  const drawn = Math.min(receipt.winners, 3, names.length - 1);
  const last = Math.max(...Array.from({ length: drawn }, (_, p) => plan.finish[plan.order[p]]));
  show = {
    receipt,
    replay,
    names,
    plan,
    winners: drawn,
    shown: fingerprint(derived.commitment),
    beats: beatsFor(plan, names, drawn),
    lights: lightsPlan(derived.showSeed),
    window: slowWindow(plan),
    cut: winnerCut(plan, drawn),
    first: plan.finish[plan.order[0]],
    endsAt: last + RESULTS_AFTER,
    phase: 'seal',
    u: 0,
    t: 0,
    prevT: -1e-9,
    crossed: false,
    amberSaid: 0,
    greenSaid: false,
    gates: 0,
    order: new Array(plan.count),
    gaps: new Array(plan.count).fill(0),
  };
  hud.setField(names);
  hud.clear();
  sound.hush();
  hud.replayFlag(replay);
  ui.lap.classList.remove('final');
  hud.skip.hidden = false;
  if (world) {
    world.gantry.setTitle(canonicalTitle(receipt.title || ''));
    world.gantry.setFingerprint(show.shown);
  }
  hud.showSeal({ fingerprintText: show.shown, commitment: derived.commitment, replay });
  hud.announce(`${replay ? 'Replay of a kept draw. ' : ''}Sealed before the start. Fingerprint ${show.shown}.`);
  if (!kept) {
    say('This browser could not keep the draw log, so this draw will be gone when the tab closes. Copy the receipt from the results.', true);
  }
}

/*
 * One frame of the timing tower, the clock, the lap, the beats and the tags,
 * from the plan at race time t. `tags` is false under the winner's chase
 * camera: the quad is most of the frame's height there, the beat names it,
 * and a tag stood a metre over it would be at the very top edge of the picture,
 * or over a runner up who is only in the corner of it.
 */
function overlay(t, tags = true) {
  const { plan } = show;
  const order = standings(plan, t, show.order);
  const shownRows = Math.min(hud.towerLimit, order.length);
  for (let p = 0; p < shownRows; p += 1) {
    show.gaps[p] = gapOf(plan, order, t, p);
  }
  hud.updateTower(order, show.gaps, plan.count);

  const lap = lapOf(plan, order, t);
  hud.readout({
    time: formatClock(show.crossed ? Math.min(t, show.first) : t),
    lapText: show.crossed ? 'Finished' : `Lap ${lap} of ${plan.laps}`,
    labelText: show.crossed ? 'Finish' : (show.replay ? 'Replay' : canonicalTitle(show.receipt.title || '')),
  });
  ui.lap.classList.toggle('final', !show.crossed && plan.laps > 1 && lap === plan.laps);

  const due = beatsBetween(show.beats, show.prevT, t);
  if (due.length) {
    hud.beat(due[due.length - 1].text);
    const spoken = due.filter((b) => SPOKEN.has(b.kind));
    if (spoken.length) {
      hud.announce(spoken[spoken.length - 1].text);
    }
  }
  show.prevT = t;

  if (world && !tags) {
    hud.updateTags(NO_TAGS);
  } else if (world) {
    const { w, h } = hud.size;
    const sizes = hud.tagSizes();
    const items = [];
    for (let p = 0; p < order.length; p += 1) {
      const entry = order[p];
      plan.pose(entry, t, scratch);
      world.screenOf(scratch.x, scratch.y, scratch.z + TAG_LIFT, spot);
      if (!spot.behind && spot.x > -40 && spot.x < w + 40 && spot.y > -40 && spot.y < h + 40) {
        items.push({
          id: entry, x: spot.x, y: spot.y - 3, w: sizes[entry].w, h: sizes[entry].h, force: p < 3,
        });
      }
    }
    hud.updateTags(placeTags(items, {
      l: 4, t: 4, r: w - 4, b: h - 4,
    }, 3, hud.blocked));
  }
}

const scratch = {};
const spot = {};
const NO_TAGS = new Map();

/*
 * The names over the quads on the grid while the sheet is up: where each
 * block is on the glass, through the same lens as every tag, placed so none
 * covers another, first entries first. The positions are the fleet's own,
 * which it writes in Three's frame, turned back into the plan's here.
 */
function paddockTags(n) {
  const { w, h } = hud.size;
  const sizes = hud.tagSizes();
  const at = world.fleet.positions;
  const items = [];
  for (let i = 0; i < n && i < sizes.length; i += 1) {
    world.screenOf(at[i * 3], -at[i * 3 + 2], at[i * 3 + 1] + TAG_LIFT, spot);
    if (!spot.behind && spot.x > -40 && spot.x < w + 40 && spot.y > -40 && spot.y < h + 40) {
      items.push({
        id: i, x: spot.x, y: spot.y - 3, w: sizes[i].w, h: sizes[i].h, force: false,
      });
    }
  }
  hud.updateTags(placeTags(items, {
    l: 4, t: 4, r: w - 4, b: h - 4,
  }, 3));
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - lastNow) / 1000, 0, 0.1);
  lastNow = now;
  wall += dt;
  if (building || results) {
    return;
  }
  try {
    step(dt);
  } catch (e) {
    /* A frame that throws would throw sixty times a second: say it once, and carry on without the field. */
    console.error(`The field stopped drawing: ${e && e.stack ? e.stack : e}`);
    world = null;
    noWorld = true;
    body.classList.remove('ready');
    markField('none');
  }
}

function step(dt) {
  const offset = shiftOffset(dt);
  if (!show) {
    if (world) {
      orbit += REDUCED() ? 0 : dt;
      world.frame({
        shot: 'paddock', t: orbit, count: list.entries.length, spin: 0, dt, wall, lamps: LAMPS_OFF, offset, calm: REDUCED(),
      });
      paddockTags(list.entries.length);
    }
    return;
  }
  const { plan } = show;
  const count = plan.count;
  /* The field went away under a show that needed it: the draw is made and sealed, so the show goes to the page that says what it was. */
  if (!world && (show.phase === 'lights' || show.phase === 'race')) {
    finishShow();
    return;
  }
  switch (show.phase) {
    case 'seal': {
      show.u += dt;
      orbit += REDUCED() ? 0 : dt;
      body.dataset.lamps = '0';
      if (world) {
        world.frame({
          shot: 'paddock', t: orbit, count, spin: 0, dt, wall, lamps: LAMPS_OFF, offset, calm: REDUCED(),
        });
        paddockTags(count);
      }
      if (show.u >= (REDUCED() ? SEAL_HOLD_STILL : SEAL_HOLD)) {
        hud.settleSeal();
        show.u = 0;
        hud.updateTags(NO_TAGS);
        show.phase = world ? 'lights' : 'count';
        setState('lights');
      }
      break;
    }
    case 'count': {
      /* No field to fly: the seal, a countdown, and the page. */
      show.u += dt;
      const left = 3 - Math.floor(show.u);
      if (left >= 1 && left !== show.counted) {
        show.counted = left;
        hud.beat(String(left));
      }
      if (show.u >= 3) {
        finishShow();
      }
      break;
    }
    case 'lights': {
      show.u += dt;
      const lit = lightsAt(show.lights, show.u);
      body.dataset.lamps = lit.green ? 'go' : String(lit.amber);
      /* A tone for each lamp as it is lit, a long one for green, and the motors spooling up under the descent. */
      while (show.amberSaid < lit.amber) {
        show.amberSaid += 1;
        sound.tone('amber');
      }
      if (lit.green && !show.greenSaid) {
        show.greenSaid = true;
        sound.tone('green');
      }
      sound.motors({ rpm: RPM.idle * Math.min(1, lit.k * 1.4), speed: 0 });
      /* Under reduced motion there is no descent: the show cuts to the rail where the race will begin. */
      world.frame({
        shot: REDUCED() ? 'rail' : 'aerial',
        t: 0,
        k: lit.k,
        plan,
        count,
        spin: 60 + 240 * lit.k,
        dt,
        wall,
        lamps: [lit.amber, lit.green],
        offset,
        calm: REDUCED(),
      });
      if (lit.green) {
        show.phase = 'race';
        show.t = 0;
        /* The state and the camera are set together, so that no frame of the race has a state and no shot. */
        body.dataset.shot = 'rail';
        setState('race');
      }
      break;
    }
    case 'race': {
      show.t = advanceClock(show.t, dt * SPEED, show.window);
      const t = show.t;
      /* The winner's chase camera takes over from the rail a moment after the line (see winnerCut), and holds until the results arrive. A cut is a jump of the picture, so a person who has asked for less motion stays on the rail. */
      const cutaway = show.cut !== null && t >= show.cut && !REDUCED();
      /* Which camera the live picture is on, for the checks that read the page from outside: 'rail' or 'chase'. */
      if (body.dataset.shot !== (cutaway ? 'chase' : 'rail')) {
        body.dataset.shot = cutaway ? 'chase' : 'rail';
      }
      world.frame({
        shot: cutaway ? 'hero' : 'rail', t, plan, count, spin: 900, dt, discs: 0.24, wall, lamps: [0, true], offset, calm: REDUCED(),
      });
      if (!show.crossed && t >= show.first) {
        show.crossed = true;
        sound.sting();
        setState('finish');
      }
      overlay(t, !cutaway);
      /* The motors sing at the pace of whoever leads, and the leader's crossing of the line each lap is a click. */
      plan.pose(show.order[0], t, scratch);
      sound.motors({ rpm: raceRpm(scratch.speed, t, show.first), speed: scratch.speed });
      const lapsDone = Math.min(plan.laps, Math.floor(scratch.s / plan.course.lap));
      if (lapsDone > show.gates) {
        show.gates = lapsDone;
        sound.gate();
      }
      if (t >= show.endsAt) {
        finishShow();
      }
      break;
    }
    default:
      break;
  }
}

/* ------------------------------------------------------------------ */
/* The results                                                          */
/* ------------------------------------------------------------------ */

let heroQueued = null;
let heroLast = 0;

/* The winner's picture, drawn for a window and copied into the big panel. A drag of the window edge asks for one every frame, so the later asks wait for a short while. */
function hero(panel, target) {
  const now = performance.now();
  heroQueued = { panel, target };
  if (now - heroLast > 160) {
    drawHero();
    return;
  }
  setTimeout(() => {
    if (heroQueued) {
      drawHero();
    }
  }, 180);
}

function drawHero() {
  const ask = heroQueued;
  heroQueued = null;
  heroLast = performance.now();
  if (!ask || !world || !show || !resultsOpen) {
    return;
  }
  const { panel, target } = ask;
  const canvas = world.renderer.domElement;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  /* The winner has to be, before the lens bends the picture, where the bend will carry it to the middle of the panel. */
  const before = pixelBeforeBend(panel.cx, panel.cy, W, H, world.distort, {});
  const fov = (2 * Math.atan(Math.tan((HERO_FOV * Math.PI) / 360) * (H / panel.box.h)) * 180) / Math.PI;
  world.frame({
    shot: 'hero',
    t: show.plan.finish[show.plan.order[0]] + HERO_AFTER,
    plan: show.plan,
    count: show.plan.count,
    spin: 900,
    dt: 0,
    discs: 0.24,
    wall,
    lamps: [0, true],
    offset: {
      W, H, dx: W / 2 - before.x, dy: H / 2 - before.y, fov,
    },
  });
  const k = canvas.width / W;
  target.width = Math.max(1, Math.round(panel.box.w * k));
  target.height = Math.max(1, Math.round(panel.box.h * k));
  const ctx = target.getContext('2d');
  ctx.drawImage(canvas, panel.box.x * k, panel.box.y * k, panel.box.w * k, panel.box.h * k, 0, 0, target.width, target.height);
  /*
   * The canvas itself goes back to what the race ended on, which is what the
   * page opens round: the paper fades in over it. That is the winner's chase
   * camera when the picture had cut to it, so that the paper does not come
   * in over a jump to an empty frame of the track, and the rail's held frame
   * when it had not.
   */
  world.frame({
    shot: show.cut !== null && !REDUCED() ? 'hero' : 'rail',
    t: Math.min(show.plan.duration, show.endsAt),
    plan: show.plan,
    count: show.plan.count,
    spin: 900,
    dt: 0,
    discs: 0.24,
    wall,
    lamps: [0, true],
    calm: REDUCED(),
  });
}

/*
 * The order the plan has the quads cross the line in, against the order that
 * was drawn. They are the same by construction and tests/choreo.test.js holds
 * it over thousands of plans; this is the same question asked of the plan the
 * page is actually showing, at the moment it matters, and the page says so
 * loudly if it ever has a different answer. The results show the draw either way.
 */
function crossingMatchesDraw(plan, order) {
  const crossed = Array.from({ length: plan.count }, (_, i) => i).sort((a, b) => plan.finish[a] - plan.finish[b]);
  return crossed.every((entry, p) => entry === order[p]);
}

async function finishShow() {
  if (!show || show.phase === 'done') {
    return;
  }
  const current = show;
  current.phase = 'done';
  hud.skip.hidden = true;
  sound.hush();
  if (!crossingMatchesDraw(current.plan, current.receipt.order)) {
    console.error('The race crossed the line in a different order from the draw. The page shows the draw.');
  }
  let sealOk = false;
  try {
    const checked = await checkReceipt(current.receipt);
    sealOk = checked.ok && fingerprint(checked.derived.commitment) === current.shown;
  } catch (e) {
    sealOk = false;
  }
  if (show !== current) {
    return;
  }
  hud.hideSeal();
  hud.replayFlag(false);
  const left = current.names.length - current.winners;
  setState('results');
  resultsOpen = true;
  results = buildResults({
    receipt: current.receipt,
    plan: current.plan,
    shown: current.shown,
    sealOk,
    replay: current.replay,
    world: world ? { hero } : null,
    canWithout: left >= LIMITS.minNames,
    actions: {
      again() {
        leaveResults();
        arm();
      },
      withoutWinners() {
        removeWinners(current);
        leaveResults();
        arm();
      },
      edit() {
        leaveResults();
      },
      watch() {
        const { receipt } = current;
        leaveResults(false);
        startShow({ receipt, replay: true });
      },
    },
  });
  results.root.tabIndex = -1;
  results.root.focus({ preventScroll: true });
  const spoken = current.receipt.order.slice(0, current.winners).map((entry, p) => `${['Winner', 'Second', 'Third'][p]}: ${current.names[entry]}.`);
  hud.announce(`${current.replay ? 'Replay. ' : ''}${spoken.join(' ')} The seal ${sealOk ? 'checks out' : 'does not check out'}.`);
}

/* The winners' lines come out of the list, so the next draw is between the rest. */
function removeWinners(finished) {
  const drop = new Set(finished.receipt.order.slice(0, finished.winners).map((entry) => entry + 1));
  const unchanged = list.entries.length === finished.names.length && list.entries.every((name, i) => name === finished.names[i]);
  if (!unchanged) {
    /* The sheet was edited since the draw, so entries no longer say which line is which: take one line by name for each winner. */
    const names = finished.receipt.order.slice(0, finished.winners).map((entry) => finished.names[entry]);
    const lines = ui.names.value.split(/\r\n|\r|\n/);
    for (const name of names) {
      const at = lines.findIndex((line) => readNames(line).names[0] === name);
      if (at >= 0) {
        lines.splice(at, 1);
      }
    }
    setNames(lines.join('\n'));
    return;
  }
  setNames(list.lines.filter((line) => line.entry === null || !drop.has(line.entry)).map((line) => line.raw).join('\n'));
}

function leaveResults(toSetup = true) {
  resultsOpen = false;
  if (results) {
    results.dispose();
    results = null;
  }
  heroQueued = null;
  if (!toSetup) {
    return;
  }
  show = null;
  sound.hush();
  hud.setField(list.entries);
  hud.clear();
  hud.hideSeal();
  hud.replayFlag(false);
  hud.skip.hidden = true;
  if (world) {
    world.gantry.setFingerprint(null);
    world.gantry.setTitle(canonicalTitle(ui.title.value));
  }
  setState('setup');
  renderLog();
  renderStatus();
  if (dirty) {
    buildField();
  }
  ui.arm.focus({ preventScroll: true });
}

/* Skipping goes straight to the page, after the seal: the draw was made and shown, and the person has said they do not want the race. */
function skip() {
  if (show && show.phase !== 'done' && show.phase !== 'seal') {
    finishShow();
  } else if (show && show.phase === 'seal') {
    hud.settleSeal();
    finishShow();
  }
}

/* ------------------------------------------------------------------ */
/* Present mode and the rest of the chrome                             */
/* ------------------------------------------------------------------ */

let idleTimer = 0;

function wake() {
  body.classList.remove('idle');
  clearTimeout(idleTimer);
  if (body.classList.contains('present')) {
    idleTimer = setTimeout(() => body.classList.add('idle'), 2500);
  }
}

function setPresent(on) {
  body.classList.toggle('present', on);
  ui.present.setAttribute('aria-pressed', String(on));
  ui.present.textContent = on ? 'Leave present' : 'Present';
  hud.measure();
  wake();
}

function togglePresent() {
  const on = !body.classList.contains('present');
  setPresent(on);
  if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else if (!on && document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* Wiring                                                               */
/* ------------------------------------------------------------------ */

function restore() {
  const names = store.get('names', '');
  ui.names.value = typeof names === 'string' ? names : '';
  const title = store.get('title', '');
  ui.title.value = typeof title === 'string' ? canonicalTitle(title) : '';
  const savedLength = Number(store.get('length', 30));
  length = [15, 30, 60].includes(savedLength) ? savedLength : 30;
  const savedWinners = Number(store.get('winners', 1));
  winners = clamp(Number.isInteger(savedWinners) ? savedWinners : 1, 1, LIMITS.maxWinners);
  const lengthRadio = document.querySelector(`input[name="length"][value="${length}"]`);
  if (lengthRadio) {
    lengthRadio.checked = true;
  }
  const winnersRadio = document.querySelector(`input[name="winners"][value="${winners}"]`);
  if (winnersRadio) {
    winnersRadio.checked = true;
  }
}

function wire() {
  ui.names.addEventListener('input', () => onNames());
  ui.names.addEventListener('scroll', syncGutter, { passive: true });
  ui.title.addEventListener('input', () => {
    store.set('title', ui.title.value);
    if (world && !show) {
      world.gantry.setTitle(canonicalTitle(ui.title.value));
    }
  });
  for (const radio of document.querySelectorAll('input[name="length"]')) {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        length = Number(radio.value);
        store.set('length', length);
        renderStatus();
      }
    });
  }
  for (const radio of document.querySelectorAll('input[name="winners"]')) {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        winners = Number(radio.value);
        store.set('winners', winners);
        renderOdds();
        renderStatus();
      }
    });
  }

  ui.splitYes.addEventListener('click', () => {
    const parts = commaList(ui.names.value);
    if (parts) {
      setNames(parts.join('\n'));
    }
    ui.names.focus();
  });
  ui.splitNo.addEventListener('click', () => {
    splitDismissed = true;
    ui.splitOffer.hidden = true;
    ui.names.focus();
  });

  /* Filling replaces the list, so a list that has something in it asks twice. */
  let fillTimer = 0;
  ui.ticketsFill.addEventListener('click', () => {
    const n = Math.floor(Number(ui.ticketsN.value));
    if (!(n >= LIMITS.minNames && n <= LIMITS.maxNames)) {
      say(`Numbers 1 to N needs an N from ${LIMITS.minNames} to ${LIMITS.maxNames}.`, true);
      return;
    }
    if (ui.names.value.trim() !== '' && ui.ticketsFill.dataset.sure !== 'yes') {
      ui.ticketsFill.dataset.sure = 'yes';
      ui.ticketsFill.textContent = 'Replace the list?';
      fillTimer = setTimeout(() => {
        delete ui.ticketsFill.dataset.sure;
        ui.ticketsFill.textContent = 'Fill';
      }, 3500);
      return;
    }
    clearTimeout(fillTimer);
    delete ui.ticketsFill.dataset.sure;
    ui.ticketsFill.textContent = 'Fill';
    setNames(numberTickets(n));
  });

  ui.arm.addEventListener('click', arm);
  hud.skip.addEventListener('click', skip);

  /* Clearing the log asks twice, as forgetting does: a list of receipts is the only copy there is. */
  let clearTimer = 0;
  ui.logClear.addEventListener('click', () => {
    if (ui.logClear.dataset.sure !== 'yes') {
      ui.logClear.dataset.sure = 'yes';
      ui.logClear.textContent = 'Really clear? Click again';
      clearTimer = setTimeout(() => {
        delete ui.logClear.dataset.sure;
        ui.logClear.textContent = 'Clear this list';
      }, 4000);
      return;
    }
    clearTimeout(clearTimer);
    delete ui.logClear.dataset.sure;
    ui.logClear.textContent = 'Clear this list';
    store.log.clear();
    renderLog();
  });

  let forgetTimer = 0;
  ui.forget.addEventListener('click', () => {
    if (ui.forget.dataset.sure !== 'yes') {
      ui.forget.dataset.sure = 'yes';
      ui.forget.textContent = 'Really forget? Click again';
      forgetTimer = setTimeout(() => {
        delete ui.forget.dataset.sure;
        ui.forget.textContent = "Forget this browser's lists";
      }, 4000);
      return;
    }
    clearTimeout(forgetTimer);
    delete ui.forget.dataset.sure;
    ui.forget.textContent = "Forget this browser's lists";
    store.forget();
    ui.title.value = '';
    setNames('', false);
    for (let i = 0; i < SLOTS; i += 1) {
      logos[i] = null;
      slotErrors[i] = '';
    }
    renderSlots();
    renderLog();
    logosVersion += 1;
    buildField();
    say('Forgotten. Nothing this page kept is left in this browser.');
  });

  /* The first press or key is what lets the browser start sound, and every later one asks a context it has put to sleep to come back. */
  for (const type of ['pointerdown', 'keydown', 'touchend']) {
    window.addEventListener(type, () => sound.unlock(), { capture: true, passive: true });
  }
  ui.sound.addEventListener('click', () => {
    sound.setMuted(!sound.muted);
    store.set('sound', sound.muted ? 'off' : 'on');
    if (!sound.muted) {
      sound.unlock();
    }
  });
  /* A hidden tab stops the race, so it stops the motors: they would otherwise hold their last note until somebody came back. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      sound.hush();
    }
  });

  ui.present.addEventListener('click', togglePresent);
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && body.classList.contains('present')) {
      setPresent(false);
    }
  });
  window.addEventListener('pointermove', wake, { passive: true });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const target = e.target;
      const typing = target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));
      if (!typing) {
        e.preventDefault();
        togglePresent();
      }
    }
  });

  /* A picture dropped anywhere on the sheet goes to a free slot; dropped anywhere else it must not take the page away. */
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e)) {
      e.preventDefault();
    }
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) {
      return;
    }
    e.preventDefault();
    if (state === 'setup' || state === 'loading') {
      addFiles(Array.from(e.dataTransfer.files), null);
    }
  });

  let resizeQueued = false;
  window.addEventListener('resize', () => {
    if (resizeQueued) {
      return;
    }
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      if (world) {
        world.resize();
      }
      hud.measure();
      aimShift(false);
    });
  });
}

async function main() {
  letterTitles();
  restore();
  wire();
  renderSlots();
  renderLog();
  onNames();
  renderStatus();
  renderSoundButton();
  body.dataset.sound = sound.state;
  aimShift(true);
  lastNow = performance.now();
  requestAnimationFrame(frame);
  await restoreLogos();
  renderSlots();
  await buildField();
}

main();
