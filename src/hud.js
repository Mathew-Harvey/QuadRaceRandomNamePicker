/*
 * hud.js: what is written over the race.
 *
 * The OSD clock and the lap, the timing tower, a tag over each quad, the
 * beats, the corner chip that keeps the seal's fingerprint, the REPLAY flag,
 * and the live region. It is the DOM half of the show: src/show.js works out
 * what is true (who is where, how far behind, which tags may stand where, which
 * beats are due) and this writes it, changing only what changed.
 *
 * NOTHING HERE IS STYLED BY FINISHING PLACE. A row of the tower, a tag and a
 * chip carry the number and the colour of their quad, which are the
 * entry's, and a place only as the tower's position, which is where the quad
 * is in the race now. The finishing order as drawn is not in the DOM until the
 * results page is built, and that is after the winner has crossed.
 *
 * NOTHING IS WRITTEN PER FRAME THAT HAS NOT CHANGED. A frame at 60 Hz that
 * rewrites fifty strings makes the browser lay the page out fifty times over;
 * every setter below compares with what it last wrote. The tower's rows
 * slide on a transform, so an overtake is the compositor's work and not the
 * main thread's, and a tag is moved by a transform too.
 *
 * THE LIVE REGION says the seal, the start, the final lap and the winner, and
 * nothing else: a screen reader that read every overtake would be saying
 * something new every second, and a person who cannot see the race wants the
 * four things that a person who can would remember.
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

import { foldedRow, formatGap } from './show.js';
import { liveryCss } from './livery.js';

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

/* `reduced` is whether the person has asked for less motion: a boolean, or a function that says so now, because the setting can change while the page is open. */
export function createHud({ reduced = false } = {}) {
  const isReduced = () => (typeof reduced === 'function' ? Boolean(reduced()) : Boolean(reduced));
  const root = document.getElementById('hud');
  const clock = document.getElementById('hud-clock');
  const lap = document.getElementById('hud-lap');
  const label = document.getElementById('hud-label');
  const tower = document.getElementById('hud-tower');
  const tagLayer = document.getElementById('hud-tags');
  const beatBox = document.getElementById('hud-beat');
  const chip = document.getElementById('hud-chip');
  const chipText = document.getElementById('hud-chip-text');
  const seal = document.getElementById('hud-seal');
  const sealPrint = document.getElementById('hud-seal-print');
  const sealFull = document.getElementById('hud-seal-full');
  const flag = document.getElementById('hud-replay');
  const live = document.getElementById('live');
  const skip = document.getElementById('hud-skip');

  let rows = [];
  let tags = [];
  let restRow = null;
  let rowHeight = 28;
  let limit = 10;
  let size = { w: 1, h: 1 };
  /* The overlay's own furniture as boxes in window pixels, which a tag must not stand on: the tower, the clock and the corner chip. */
  let blocks = [];
  const written = { clock: '', lap: '', label: '' };
  let beatTimer = 0;

  /* The tower shows ten, and five on a phone. */
  const narrow = typeof matchMedia === 'function' ? matchMedia('(max-width: 700px)') : { matches: false };

  function measure() {
    limit = narrow.matches ? 5 : 10;
    if (rows[0]) {
      rowHeight = rows[0].li.offsetHeight || rowHeight;
    }
    for (const t of tags) {
      t.w = t.node.offsetWidth || t.w;
      t.h = t.node.offsetHeight || t.h;
    }
    size = { w: root.clientWidth || 1, h: root.clientHeight || 1 };
    blocks = [tower, root.querySelector('.osd-top'), chip].filter((node) => node && !node.hidden).map((node) => {
      const r = node.getBoundingClientRect();
      return {
        l: r.left, t: r.top, w: r.width, h: r.height,
      };
    }).filter((b) => b.w > 0 && b.h > 0);
  }

  /* One row and one tag for each entry, in the entry's own colour, built when the list is set and never again until it changes. */
  function setField(names) {
    tower.replaceChildren();
    tagLayer.replaceChildren();
    rows = names.map((name, i) => {
      const li = el('li', 'row');
      const place = el('span', 'pl');
      const swatch = el('i', 'chip');
      swatch.style.background = liveryCss(i);
      const nm = el('span', 'nm', name);
      const gap = el('span', 'gp');
      li.append(place, swatch, nm, gap);
      li.hidden = true;
      tower.append(li);
      return { li, place, gap, shown: false, last: { place: '', gap: '' }, y: -1 };
    });
    restRow = el('li', 'row rest');
    restRow.append(el('span', 'pl'), el('i', 'chip'), el('span', 'nm'), el('span', 'gp'));
    restRow.hidden = true;
    tower.append(restRow);
    tags = names.map((name, i) => {
      const node = el('div', 'tag');
      const swatch = el('i', 'chip');
      swatch.style.background = liveryCss(i);
      node.append(swatch, el('b', '', String(i + 1)), el('span', '', name));
      node.hidden = true;
      tagLayer.append(node);
      return { node, w: 90, h: 20, shown: false, x: 0, y: 0 };
    });
    measure();
  }

  /* The clock and the lap, written when they change. */
  function readout({ time, lapText, labelText }) {
    if (time !== written.clock) {
      written.clock = time;
      clock.textContent = time;
    }
    if (lapText !== written.lap) {
      written.lap = lapText;
      lap.textContent = lapText;
    }
    if (labelText !== undefined && labelText !== written.label) {
      written.label = labelText;
      label.textContent = labelText;
    }
  }

  /*
   * The tower: `order` is the standings (entries, first place first),
   * `gaps` the seconds behind the leader by place. The top of the field
   * slides on transforms; what is beyond the limit is folded into one row.
   */
  function updateTower(order, gaps, count) {
    const shownEntries = new Set();
    const top = Math.min(limit, order.length);
    for (let p = 0; p < top; p += 1) {
      const row = rows[order[p]];
      shownEntries.add(order[p]);
      if (!row.shown) {
        row.li.hidden = false;
        row.shown = true;
        row.y = -1;
      }
      const place = String(p + 1);
      const gap = formatGap(gaps[p]);
      if (row.last.place !== place) {
        row.last.place = place;
        row.place.textContent = place;
      }
      if (row.last.gap !== gap) {
        row.last.gap = gap;
        row.gap.textContent = gap;
      }
      if (row.y !== p) {
        /* A row arriving from nowhere takes its place at once; one that was there slides. */
        row.li.classList.toggle('arrive', row.y < 0);
        row.li.style.transform = `translateY(${p * rowHeight}px)`;
        row.y = p;
      }
    }
    for (let i = 0; i < rows.length; i += 1) {
      if (!shownEntries.has(i) && rows[i].shown) {
        rows[i].li.hidden = true;
        rows[i].shown = false;
      }
    }
    if (count > top) {
      restRow.hidden = false;
      restRow.querySelector('.nm').textContent = `${foldedRow(top + 1, count)}`;
      restRow.style.transform = `translateY(${top * rowHeight}px)`;
    } else {
      restRow.hidden = true;
    }
  }

  /* Where each tag stands, from show.js's placement: a Map of entry to { x, y, shown }. */
  function updateTags(placed) {
    for (let i = 0; i < tags.length; i += 1) {
      const t = tags[i];
      const p = placed.get(i);
      const shown = Boolean(p && p.shown);
      if (shown !== t.shown) {
        t.node.hidden = !shown;
        t.shown = shown;
        if (shown) {
          /* A name is as wide as it is, and a tag can only be measured once it is on the page. */
          t.w = t.node.offsetWidth || t.w;
          t.h = t.node.offsetHeight || t.h;
        }
      }
      if (shown && (Math.round(p.x) !== t.x || Math.round(p.y) !== t.y)) {
        t.x = Math.round(p.x);
        t.y = Math.round(p.y);
        t.node.style.transform = `translate(${t.x}px, ${t.y}px)`;
      }
    }
  }

  const tagSizes = () => tags.map((t) => ({ w: t.w, h: t.h }));

  /* One line at a time, for a couple of seconds. */
  function beat(text) {
    beatBox.textContent = text;
    beatBox.classList.remove('on');
    /* Restart the animation: a new beat is a new thing, even with the same words. */
    void beatBox.offsetWidth;
    beatBox.classList.add('on');
    clearTimeout(beatTimer);
    beatTimer = setTimeout(() => beatBox.classList.remove('on'), 2400);
  }

  /* The live region: the seal, the start, the final lap, the winner. */
  function announce(text) {
    live.textContent = '';
    /* A change of text is what a screen reader hears, so the same words twice need a gap between. */
    setTimeout(() => {
      live.textContent = text;
    }, 30);
  }

  /*
   * The seal, slapped onto the glass and then folded into the corner chip it
   * keeps for the race. The slap is the landing page's keyframes (index.html):
   * in from nearly twice the size and eight degrees off, easing in, short onto
   * the glass, one ring back. Under reduced motion the chip appears in place.
   * How long the seal stays on the glass is the show's to say, on its own
   * clock, so this only starts it.
   */
  function showSeal({ fingerprintText, commitment, replay }) {
    sealPrint.textContent = fingerprintText;
    sealFull.textContent = commitment;
    chipText.textContent = fingerprintText;
    chip.setAttribute('aria-label', `${replay ? 'Replay of a draw. ' : ''}Sealed before the start. Commitment ${commitment}`);
    chip.classList.toggle('replay', Boolean(replay));
    seal.classList.toggle('replay', Boolean(replay));
    if (isReduced()) {
      chip.hidden = false;
      seal.hidden = true;
      measure();
      return;
    }
    chip.hidden = true;
    seal.hidden = false;
    seal.classList.remove('slap');
    void seal.offsetWidth;
    seal.classList.add('slap');
  }

  /* Fold the seal into the chip. */
  function settleSeal() {
    if (isReduced() || seal.hidden) {
      chip.hidden = false;
      seal.hidden = true;
      measure();
      return Promise.resolve();
    }
    chip.hidden = false;
    measure();
    const from = seal.getBoundingClientRect();
    const to = chip.getBoundingClientRect();
    const scale = Math.max(0.05, to.width / Math.max(1, from.width));
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    chip.style.opacity = '0';
    const move = seal.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.9, offset: 0.85 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 },
    ], { duration: 650, easing: 'cubic-bezier(0.5, 0, 0.2, 1)' });
    return move.finished.catch(() => {}).then(() => {
      seal.hidden = true;
      seal.classList.remove('slap');
      chip.style.opacity = '';
    });
  }

  function replayFlag(on) {
    flag.hidden = !on;
  }

  function clear() {
    readout({ time: '0:00.00', lapText: '', labelText: '' });
    beatBox.classList.remove('on');
    beatBox.textContent = '';
    for (const r of rows) {
      r.li.hidden = true;
      r.shown = false;
      r.y = -1;
      r.last = { place: '', gap: '' };
    }
    if (restRow) {
      restRow.hidden = true;
    }
    for (const t of tags) {
      t.node.hidden = true;
      t.shown = false;
    }
  }

  function hideSeal() {
    seal.hidden = true;
    chip.hidden = true;
    seal.classList.remove('slap');
  }

  if (narrow.addEventListener) {
    narrow.addEventListener('change', measure);
  }

  return {
    root,
    skip,
    setField,
    measure,
    readout,
    updateTower,
    updateTags,
    tagSizes,
    beat,
    announce,
    showSeal,
    settleSeal,
    hideSeal,
    replayFlag,
    clear,
    get size() {
      return size;
    },
    get blocked() {
      return blocks;
    },
    get towerLimit() {
      return limit;
    },
  };
}
