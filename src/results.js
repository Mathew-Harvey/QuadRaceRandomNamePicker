/*
 * results.js: the page a draw ends on, built when the race is over.
 *
 * THE RESULTS PAGE DOES NOT EXIST UNTIL THE WINNER HAS CROSSED. Nothing about
 * the finishing order is in the document before this runs: not hidden, not
 * collapsed, not behind a class. A page that carried the answer in its markup
 * and covered it with a sheet would be a page whose claim is that it did not,
 * and the browser's own tools would say otherwise. So the show runs against a
 * document that has no result in it, and this file makes one, from the draw,
 * and not from the animation: the order is the receipt's `order`, which was
 * fixed before the start, and the plan's finishing times only supply the gaps.
 * As the race ends the page compares the order the quads crossed in with the
 * draw, and if they ever disagree it logs an error and still shows the draw.
 *
 * THE LAYOUT is src/page.js's: a spread of panels cut out of paper on a laptop,
 * a strip on a phone. The big panel holds a picture of the winner, a moment
 * after the line, which the world draws with a view offset that puts the
 * winner where the panel wants it and which is then copied into the panel's own
 * canvas. A copy, and not a window onto the world's canvas behind the page,
 * because a strip scrolls, and a picture that does not scroll with its panel
 * is a picture of the wrong place. Everything on the page is text, so a screen
 * reader reads it and a person can select it, and the titles are lettered by
 * src/titles.js with their words left in.
 *
 * THE FOCUS LINES converge on the winner and are seeded from the commitment, so
 * a draw always has the same ones, and they are drawn once and never move: a
 * field of stripes that changes on its own is a photosensitivity question, and
 * the family's rule (the front door's) is that nothing here has a clock.
 *
 * It imports no part of the world: the page that asks for a result hands over
 * what it needs (the draw, the plan, the names, and the world as a plain object
 * with a hero function), so this file can be read, and tested, without three.js.
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

import { fingerprint, receiptFragment, receiptJSON, receiptText } from './draw.js';
import { createPage, boxOf } from './page.js';
import { formatClock, formatGap, ordinal } from './show.js';
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

/* A small seeded generator for the focus lines, so a draw always has the same ones. */
function seeded(hex) {
  let a = parseInt(hex.slice(0, 8), 16) >>> 0;
  let b = parseInt(hex.slice(8, 16), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    b = (b + 0x9e3779b9) >>> 0;
    return (((t ^ (t >>> 14)) >>> 0) ^ b) / 4294967296 % 1;
  };
}

/*
 * Lines that converge on a point, from a ring clear of it out past the panel's
 * edge: thin ink strokes of different lengths, in a bundle that thins toward
 * the middle, which is what a manga does to say "look here".
 */
export function drawFocusLines(canvas, hex, cx, cy, u) {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const rand = seeded(hex);
  const reach = Math.hypot(w, h);
  const inner = Math.min(w, h) * 0.17;
  ctx.lineCap = 'round';
  for (let i = 0; i < 96; i += 1) {
    const angle = (i / 96) * Math.PI * 2 + (rand() - 0.5) * 0.05;
    const r0 = inner + rand() * Math.min(w, h) * 0.22;
    const r1 = Math.min(reach, r0 + Math.min(w, h) * (0.16 + rand() * 0.5));
    const width = u * (0.12 + rand() * 0.32);
    ctx.strokeStyle = `rgba(11, 17, 22, ${(0.34 + rand() * 0.3).toFixed(2)})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * r0, cy + Math.sin(angle) * r0);
    ctx.lineTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
    ctx.stroke();
  }
}

/* A tick or a cross, drawn in the page's own colours. */
const TICK = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3 10.5l4.5 4.5L17 5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CROSS = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 4l12 12M16 4L4 16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

/* Copy text to the clipboard, by the modern way or by the old one, and say whether it worked. */
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const box = el('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.className = 'vh';
    document.body.append(box);
    box.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    box.remove();
    return ok;
  }
}

/*
 * Build the page.
 *
 *   receipt        the draw: names, order, seed, commitment, winners, length
 *   plan           the race's plan, for the gaps
 *   shown          the fingerprint that was on screen before the start, as the person saw it
 *   sealOk         whether the receipt checks out and its commitment is that fingerprint
 *   replay         true for a replay of a kept receipt: marked, and without the actions of a live draw
 *   world          { hero(panel, canvas) } or null when there is no WebGL: the big panel is then plain.
 *                  hero draws the winner's picture for a window of panel.W by panel.H with the
 *                  winner at (panel.cx, panel.cy), and copies panel.box into the canvas
 *   actions        { again, withoutWinners, edit, watch, close } callbacks
 *   canWithout     whether enough names would be left to draw again without the winners
 *
 * Returns { root, dispose }.
 */
export function buildResults({
  receipt, plan, shown, sealOk, replay, world, actions, canWithout,
}) {
  const names = receipt.names;
  const winnersN = Math.min(receipt.winners, 3, names.length - 1);
  const place = receipt.order;
  const root = el('section', 'results');
  root.id = 'results';
  root.setAttribute('aria-label', replay ? 'Results of a replay' : 'Results');
  const win = place[0];
  const crossing = (entry) => plan.finish[entry];
  const gap = (p) => crossing(place[p]) - crossing(win);

  /* The big panel: a window onto the winner, or a plain panel with no WebGL. */
  const big = el('div', world ? 'rp big' : 'rp big plain');
  big.dataset.panel = 'big';
  const shot = el('canvas', 'shot');
  shot.setAttribute('aria-hidden', 'true');
  const focus = el('canvas', 'focus');
  focus.setAttribute('aria-hidden', 'true');
  const narration = el('div', replay ? 'narration replay' : 'narration',
    `${replay ? 'Replay · ' : ''}Winner · ${receipt.length || plan.length} s · ${names.length} names`);
  const winnerName = el('h2', 'winner-name', names[win]);
  big.append(shot, focus, narration, winnerName);
  root.append(big);

  /* Second and third, when they are drawn. */
  const card = (p) => {
    const panel = el('section', 'rp dark');
    panel.dataset.panel = p === 1 ? 'second' : 'third';
    panel.setAttribute('aria-label', `${ordinal(p + 1)} place`);
    const inner = el('div', 'in');
    const c = el('div', 'place-card');
    const ord = el('h2', 'ord lettered', ordinal(p + 1));
    const name = el('div', 'nm');
    const sw = el('i', 'swatch');
    sw.style.background = liveryCss(place[p]);
    name.append(sw, document.createTextNode(names[place[p]]));
    const behind = formatGap(gap(p));
    c.append(ord, name, el('div', 'gap', behind ? `${behind} s behind the winner` : 'Level with the winner'));
    inner.append(c);
    panel.append(inner);
    return panel;
  };
  if (winnersN >= 2) {
    root.append(card(1));
  }
  if (winnersN >= 3) {
    root.append(card(2));
  }

  /* The finishing order, all of it, the winners in mint. */
  const orderPanel = el('section', 'rp dark');
  orderPanel.dataset.panel = 'order';
  orderPanel.setAttribute('aria-label', 'Finishing order');
  {
    const inner = el('div', 'in');
    inner.append(el('div', 'kick', 'The finishing order'), el('h2', 'lettered', 'The order'));
    const list = el('ol', 'order');
    place.forEach((entry, p) => {
      const li = el('li', p < winnersN ? 'won' : '');
      const sw = el('i', 'swatch');
      sw.style.background = liveryCss(entry);
      const t = p === 0 ? formatClock(crossing(entry)) : formatGap(gap(p));
      li.append(el('span', 'p', String(p + 1)), sw, el('span', 'n', names[entry]), el('span', 't', t));
      li.append(el('span', 'vh', `, entry ${entry + 1}`));
      list.append(li);
    });
    inner.append(list);
    orderPanel.append(inner);
  }
  root.append(orderPanel);

  /* The seal: what was shown before the start, and what the receipt says it was. */
  const sealPanel = el('section', 'rp dark');
  sealPanel.dataset.panel = 'seal';
  sealPanel.setAttribute('aria-label', 'The seal');
  {
    const inner = el('div', 'in seal-panel');
    inner.append(el('div', 'kick', 'The seal'), el('h2', 'lettered', 'Checked'));
    if (replay) {
      inner.append(el('div', 'replay-line', 'Replay: not a new draw'));
    }
    const dl = el('dl');
    const row = (term, value, cls) => {
      const d = el('div');
      d.append(el('dt', '', term), el('dd', cls, value));
      dl.append(d);
    };
    row('Fingerprint', fingerprint(receipt.commitment), 'print');
    row('Commitment', receipt.commitment, 'hex');
    row('Seed, revealed', receipt.seed, 'hex');
    const tick = el('div', sealOk ? 'tick' : 'tick bad');
    tick.innerHTML = sealOk ? TICK : CROSS;
    tick.append(el('span', '', sealOk
      ? `The seed matches the fingerprint ${shown} that was on screen before the start.`
      : 'The seed does not match the fingerprint that was shown. Do not trust this draw.'));
    dl.append(tick);
    inner.append(dl);

    const btns = el('div', 'btns');
    const copyBtn = el('button', 'btn', 'Copy receipt');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', async () => {
      const ok = await copy(receiptText(receipt));
      copyBtn.textContent = ok ? 'Copied' : 'Select it and copy';
      setTimeout(() => {
        copyBtn.textContent = 'Copy receipt';
      }, 1800);
    });
    const dlBtn = el('button', 'btn', 'Download receipt');
    dlBtn.type = 'button';
    dlBtn.addEventListener('click', () => {
      const blob = new Blob([receiptJSON(receipt)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = el('a');
      a.href = url;
      a.download = `webfpv-picker-${fingerprint(receipt.commitment).replace(/ /g, '')}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });
    const verify = el('a', 'btn primary', 'Verify');
    verify.href = `verify.html#${receiptFragment(receipt)}`;
    btns.append(copyBtn, dlBtn, verify);
    inner.append(btns);
    inner.append(el('p', 'foot-line', 'The draw is the order above. The race only showed it. The receipt is everything needed to recompute it, here, in Node or in Python.'));
    sealPanel.append(inner);
  }
  root.append(sealPanel);

  /* The actions. */
  const actPanel = el('section', 'rp dark');
  actPanel.dataset.panel = 'actions';
  actPanel.setAttribute('aria-label', 'What next');
  {
    const inner = el('div', 'in acts');
    inner.append(el('div', 'kick', 'What next'));
    const button = (cls, label, sub, fn, disabled = false) => {
      const b = el('button', `btn ${cls}`);
      b.type = 'button';
      b.append(document.createTextNode(label));
      if (sub) {
        b.append(el('span', 'sub', sub));
      }
      b.disabled = disabled;
      b.addEventListener('click', fn);
      inner.append(b);
      return b;
    };
    if (!replay) {
      button('primary', 'Race again', 'Same names, a new draw', actions.again);
      button('', 'Draw again without the winners', canWithout ? 'Takes the winning lines out and seals a new draw' : 'Needs at least two names left', actions.withoutWinners, !canWithout);
    }
    button('', 'Edit names', 'Back to the setup', actions.edit);
    button('', 'Watch it again', 'The same race, marked REPLAY', actions.watch);
    actPanel.append(inner);
  }
  root.append(actPanel);

  document.body.append(root);

  /* The page keeps itself to its window; each new layout is a new picture, and new focus lines for it. */
  let disposed = false;
  const page = createPage(root, {
    winners: winnersN,
    counts: names.length,
    onLayout(layout) {
      if (disposed) {
        return;
      }
      const box = boxOf(layout.panels.big);
      /* The winner goes a little above the middle of the panel, which leaves the name its foot. */
      const at = { x: box.x + box.w * 0.5, y: box.y + box.h * 0.44 };
      if (world) {
        world.hero({
          cx: at.x, cy: at.y, box, W: layout.W, H: layout.H,
        }, shot);
      }
      drawFocusLines(focus, receipt.commitment, at.x - box.x, at.y - box.y, layout.u);
    },
  });

  return {
    root,
    dispose() {
      disposed = true;
      page.dispose();
      root.remove();
    },
  };
}
