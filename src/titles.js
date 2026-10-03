/*
 * titles.js: the wordmark and the titles, in the simulator's hand.
 *
 * The family letters its wordmark and every room's title in the hand its
 * freestyle callouts speak in: heavy slanted capitals, a thick ink line, a hard
 * drop and two cel bands, WEB in cream and FPV in sakura as one word. There is
 * no font file. The capitals are the system's heaviest sans used as a
 * skeleton, set a glyph at a time by the simulator's own src/ui/lettering.js,
 * copied into sim/ and not restated here. What is the picker's is the join:
 * which words, and where each canvas lies. It is the board's public/titles.js
 * joined to this page, and the front door's src/titles.js is the same idea.
 *
 * WHICH. The wordmark, the headings of the setup sheet and of the results
 * page, and the winner's name. Everything else stays text: names, numbers,
 * labels, buttons and the tower, because those are what a person reads in a
 * hurry and a lettered name in a list of fifty is the slowest thing to scan.
 *
 * THE WORDS STAY, in the DOM, for a screen reader, find in page and the
 * layout. .is-lettered makes their fill transparent and sets them in heavy
 * capitals, so the lines the browser breaks them into are the lines the
 * lettering draws; the canvases are aria-hidden. Forced colours gets the text
 * back (index.html), and with no 2D context the title is its text.
 *
 * A LINE AT A TIME. A winner's name is whatever somebody typed, and on a phone
 * a long one wraps. So the browser breaks the lines, each is lettered on a
 * canvas of its own, and each lies on its own baseline: the last line's from a
 * zero sized probe after the words, and each line above that the line boxes'
 * distance higher.
 *
 * PAINTED WHEN IT CHANGES, NEVER PER FRAME. One MutationObserver says when a
 * title arrives or its words change, and a ResizeObserver says when it is
 * first laid out, at once, and when its box changes, once it has been still
 * for a moment. A title gets its heavy capitals before the observer first
 * measures it, so lettering never resizes what the observer is reporting.
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

import { paintTitle } from '../sim/src/ui/lettering.js';

/* Every lettered thing on the page: the wordmark, the headings, and the winner's name. */
export const TITLES = '.wordmark, h2.lettered, .winner-name';
const ART = 'lettered-art';
const PROBE = 'lettered-probe';
const SETTLE_MS = 140;

/*
 * A title's words as the browser laid them out: a list of lines, each with
 * its runs in their own colours (the wordmark's FPV is sakura because its
 * CSS says so) and its box. Read a character at a time, because a
 * character's box is where the browser put it and nothing else says which
 * line a word landed on.
 */
function linesOf(h) {
  const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && n.parentElement.closest(`.${ART}, .${PROBE}`)
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT),
  });
  const range = document.createRange();
  const fills = new Map();
  const lines = [];
  let line = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!fills.has(el)) {
      fills.set(el, getComputedStyle(el).color);
    }
    const fill = fills.get(el);
    const s = n.data;
    for (let i = 0; i < s.length; i += 1) {
      range.setStart(n, i);
      range.setEnd(n, i + 1);
      const r = range.getBoundingClientRect();
      /* White space the browser collapsed has no box at all. */
      if (!r.width && !r.height) {
        continue;
      }
      const space = /\s/.test(s[i]);
      if (!line || r.top > line.top + line.height * 0.5) {
        /* A space that would open a line is the one the line broke at. */
        if (space) {
          continue;
        }
        line = { top: r.top, height: r.height, left: r.left, right: r.right, chars: [] };
        lines.push(line);
      }
      line.chars.push({ ch: space ? ' ' : s[i], fill });
      if (!space) {
        line.left = Math.min(line.left, r.left);
        line.right = Math.max(line.right, r.right);
      }
    }
  }
  for (const l of lines) {
    while (l.chars.length && l.chars[l.chars.length - 1].ch === ' ') {
      l.chars.pop();
    }
    l.runs = [];
    let prev = '';
    for (const c of l.chars) {
      if (c.ch === ' ' && prev === ' ') {
        continue;
      }
      prev = c.ch;
      const last = l.runs[l.runs.length - 1];
      if (last && last.fill === c.fill) {
        last.text += c.ch;
      } else {
        l.runs.push({ text: c.ch, fill: c.fill });
      }
    }
  }
  return lines.filter((l) => l.runs.length);
}

/*
 * Back to its words, for a title the lettering cannot draw: there is no 2D
 * context, or it has no words. It counts as not lettered, so words that
 * arrive later are lettered at once.
 */
function unletter(h) {
  for (const c of h.querySelectorAll(`:scope > .${ART}, :scope > .${PROBE}`)) {
    c.remove();
  }
  h.classList.remove('is-lettered');
  h.lettered = false;
}

/*
 * Letter one title where it stands. Heavy capitals first and the measuring
 * after, so the lines measured are the lines the lettering is drawn to.
 * Returns whether it is lettered.
 */
function letter(h) {
  if (!h.isConnected || h.letterFailed) {
    return false;
  }
  const cs = getComputedStyle(h);
  if (cs.display === 'none') {
    return false;
  }
  h.classList.add('is-lettered');
  const px = parseFloat(getComputedStyle(h).fontSize);
  const box = h.getBoundingClientRect();
  if (!(px > 0) || !box.width || !box.height) {
    /* No box, because it is hidden: nothing to draw until it has one. The
     * capitals stay, so the box it comes back with is already theirs and
     * lettering it then changes nothing the observer is measuring, and it
     * counts as not lettered, so that is at once. */
    h.lettered = false;
    return false;
  }
  let probe = h.querySelector(`:scope > .${PROBE}`);
  if (!probe) {
    probe = document.createElement('span');
    probe.className = PROBE;
    probe.setAttribute('aria-hidden', 'true');
    h.append(probe);
  }
  const lines = linesOf(h);
  if (!lines.length) {
    unletter(h);
    return false;
  }
  /*
   * How wide a line may be: to its column's far edge, or the window's, as
   * the simulator measures it, and the width of the column when the title
   * is centred. paintTitle sets a line smaller to fit, never past.
   */
  const parent = h.parentElement;
  const pcs = getComputedStyle(parent);
  const pr = parent.getBoundingClientRect();
  const right = Math.min(pr.right - parseFloat(pcs.paddingRight || '0'), window.innerWidth - 4);
  const left = Math.max(pr.left + parseFloat(pcs.paddingLeft || '0'), 4);
  const centred = cs.textAlign === 'center';
  /* The outline a fifth of the size at callout sizes and thinning toward a
   * tenth on a wordmark, where a fifth of seventy pixels closes the letters
   * up into a blot: the simulator's rule. */
  const inkW = Math.min(0.2, Math.max(0.1, 7 / px));
  const pad = px * (inkW + 0.12);
  const originX = box.left + h.clientLeft;
  const lastBase = probe.offsetTop;
  const last = lines[lines.length - 1];

  const arts = [...h.querySelectorAll(`:scope > .${ART}`)];
  while (arts.length < lines.length) {
    const c = document.createElement('canvas');
    c.className = ART;
    c.setAttribute('aria-hidden', 'true');
    h.append(c);
    arts.push(c);
  }
  while (arts.length > lines.length) {
    arts.pop().remove();
  }
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    const art = arts[i];
    const maxW = Math.floor(centred ? right - left : right - l.left + pad);
    let m = null;
    try {
      m = paintTitle(art, l.runs, px, { maxW, inkW });
    } catch (e) {
      m = null;
    }
    if (!m) {
      /* No 2D context: the words are the title, as they were, for good. */
      h.letterFailed = true;
      unletter(h);
      return false;
    }
    const base = lastBase - (last.top - l.top);
    const x = centred
      ? (l.left + l.right) / 2 - originX - m.w / 2
      : l.left - originX - m.left;
    art.style.left = `${Math.round(x)}px`;
    art.style.top = `${Math.round(base - m.base)}px`;
  }
  h.lettered = true;
  return true;
}

let sizes = null;
let words = null;
const watched = new Set();
const waiting = new Set();
let timer = 0;

function settle() {
  timer = 0;
  for (const h of waiting) {
    letter(h);
  }
  waiting.clear();
}

function watch(h) {
  if (!watched.has(h)) {
    watched.add(h);
    /* Heavy capitals from the start, before the observer first measures,
     * so lettering never changes the box it is reporting: a ResizeObserver
     * callback that resizes what it observes is the one thing it must not
     * do, and Chrome reports it as an error event. */
    h.classList.add('is-lettered');
    sizes.observe(h);
  }
}

function forget(h) {
  if (watched.delete(h)) {
    sizes.unobserve(h);
    waiting.delete(h);
  }
}

/* Every title in `node`, the node itself included. */
function titlesIn(node) {
  if (node.nodeType !== 1) {
    return [];
  }
  const found = [...node.querySelectorAll(TITLES)];
  if (node.matches(TITLES)) {
    found.push(node);
  }
  return found;
}

/* Whether a node is one of the lettering's own, the canvases and the probe,
 * which are not a change to a title's words. */
const ours = (n) => n.nodeType === 1 && (n.classList.contains(ART) || n.classList.contains(PROBE));

/*
 * Letter every title on the page and keep them lettered: the ones in the
 * markup now, the ones the page builds later (the results page is built when
 * the race ends), and the ones whose words change (the winner's name is set
 * when she crosses). Called once, at boot.
 */
export function letterTitles() {
  if (sizes || typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') {
    if (!sizes) {
      document.querySelectorAll(TITLES).forEach(letter);
    }
    return;
  }
  sizes = new ResizeObserver((entries) => {
    for (const e of entries) {
      const h = e.target;
      /* The first time a title has a box, at once; after that, once it has
       * been still. */
      if (!h.lettered) {
        letter(h);
      } else {
        waiting.add(h);
      }
    }
    if (waiting.size) {
      clearTimeout(timer);
      timer = setTimeout(settle, SETTLE_MS);
    }
  });
  words = new MutationObserver((records) => {
    const again = new Set();
    for (const r of records) {
      for (const n of r.removedNodes) {
        for (const h of titlesIn(n)) {
          forget(h);
        }
      }
      for (const n of r.addedNodes) {
        for (const h of titlesIn(n)) {
          watch(h);
        }
      }
      /* A title's words changed: its text, or a child that is not one of
       * the lettering's own. */
      const target = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      const h = target && target.closest(TITLES);
      if (h && watched.has(h)) {
        const changed = r.type === 'characterData'
          || [...r.addedNodes, ...r.removedNodes].some((n) => !ours(n));
        if (changed) {
          again.add(h);
        }
      }
    }
    for (const h of again) {
      if (h.isConnected) {
        letter(h);
      }
    }
  });
  words.observe(document.body, { childList: true, subtree: true, characterData: true });
  document.querySelectorAll(TITLES).forEach(watch);
}
