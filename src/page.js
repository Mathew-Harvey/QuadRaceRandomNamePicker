/*
 * page.js: the results as a manga page.
 *
 * The brief for the family is that the game should feel like flying a manga
 * comic, and this is the page a draw ends on, laid out the way the
 * simulator's results screen is (sim/src/ui/mangapage.js): paper, ink
 * borders, gutters that lean, the biggest panel first. It is built the way
 * the front door builds its first screen (src/page.js there): one SVG of paper
 * with every panel cut out of it and one ink line round each, and the panels
 * are real DOM, so every word on the page is text a screen reader can read
 * and a person can select.
 *
 * THE BIG PANEL IS A WINDOW. It is a hole in the paper, and what shows
 * through it is the world's own canvas behind the page: the winner at the
 * line, put in the middle of the hole with camera.setViewOffset and not by
 * moving the camera. The other panels carry their own dark fill and cream
 * type, the family's furniture, on a page whose margins and gutters are
 * paper.
 *
 * MEASURED IN u, a hundredth of the window's short side, but never less than
 * 5.2 px. A page has proportions rather than sizes: the margin, gutter and
 * border here are the simulator's page's, 3.5, 2.2 and 0.65 per cent of the
 * short side, so the results screen at 4K is the results screen on a laptop,
 * bigger. The floor is for the other end: on a phone a hundredth of the width
 * is under four pixels, and type sized in it is under ten.
 *
 * TWO SHAPES. A spread, when the window is landscape or nearly square (a 4K
 * window is 1877 by 1938 on the owner's own screen): the big panel and the
 * second and third beside it on top, the order, the seal and the actions in a
 * tier under. A strip, on a phone or any window clearly taller than it is wide:
 * the panels one under another, the page scrolling, the big panel first. The
 * cuts lean in the spread, as a comic's do; in the strip they are square,
 * because a panel a thumb wide has no room to lean.
 *
 * The geometry (layout) is pure and is held by tests in Node. The rest makes
 * and keeps the DOM, and takes the lettering as an argument so that this file
 * imports nothing from the world.
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

const SVG_NS = 'http://www.w3.org/2000/svg';

/* The order the panels open in. */
const OPENING = ['big', 'second', 'third', 'order', 'seal', 'actions'];

/* Where two lines meet: (a, b) and (c, d), as points. */
function meet(a, b, c, d) {
  const r1 = [b[0] - a[0], b[1] - a[1]];
  const r2 = [d[0] - c[0], d[1] - c[1]];
  const den = r1[0] * r2[1] - r1[1] * r2[0];
  if (Math.abs(den) < 1e-9) {
    return [a[0], a[1]];
  }
  const t = ((c[0] - a[0]) * r2[1] - (c[1] - a[1]) * r2[0]) / den;
  return [a[0] + r1[0] * t, a[1] + r1[1] * t];
}

/* A line moved sideways, or up and down. */
const shiftX = (line, dx) => [[line[0][0] + dx, line[0][1]], [line[1][0] + dx, line[1][1]]];
const shiftY = (line, dy) => [[line[0][0], line[0][1] + dy], [line[1][0], line[1][1] + dy]];

/* The quad with these four edges: left and right running down, top and bottom running across. */
const quad = (l, r, t, b) => [
  meet(l[0], l[1], t[0], t[1]),
  meet(r[0], r[1], t[0], t[1]),
  meet(r[0], r[1], b[0], b[1]),
  meet(l[0], l[1], b[0], b[1]),
];

const area = (q) => Math.abs(q.reduce((s, p, i) => {
  const n = q[(i + 1) % q.length];
  return s + (p[0] * n[1] - n[0] * p[1]);
}, 0)) / 2;

/*
 * The page for a window of W by H, with `winners` winners (1 to 3), which
 * decides whether there are second and third place panels.
 *
 * Returns the shape, u, the margin m, gutter g and border b, and `panels`: a
 * quad of four [x, y] points for each of big, order, seal and actions, and for
 * second and third when there are winners for them. `height` is the page's
 * height, which is H for a spread and the content's for a strip, whose page
 * scrolls. `counts` is how many names there are, which sizes the order panel
 * in a strip.
 */
export const U_FLOOR = 5.2;

export function layoutResults(W, H, winners = 1, counts = 10) {
  const u = Math.max(U_FLOOR, Math.min(W, H) / 100);
  const aspect = W / Math.max(1, H);
  const shape = aspect >= 0.85 ? 'spread' : 'strip';
  const m = Math.max(10, 3.5 * u);
  const g = Math.max(7, 2.2 * u);
  const b = Math.max(2, 0.65 * u);
  const left = m;
  const right = W - m;
  const span = right - left;
  const panels = {};

  if (shape === 'strip') {
    let y = m;
    const rect = (h) => {
      const q = [[left, y], [right, y], [right, y + h], [left, y + h]];
      y += h + g;
      return q;
    };
    panels.big = rect(Math.max(0.42 * H, 56 * u));
    if (winners >= 2) {
      const h = 17 * u;
      const half = (span - g) / 2;
      const row = (x0, w) => [[x0, y], [x0 + w, y], [x0 + w, y + h], [x0, y + h]];
      if (winners >= 3) {
        panels.second = row(left, half);
        panels.third = row(left + half + g, half);
      } else {
        panels.second = row(left, span);
      }
      y += h + g;
    }
    panels.seal = rect(54 * u);
    panels.actions = rect(46 * u);
    panels.order = rect(Math.min(64 * u, 10 * u + counts * 5.2 * u));
    return { W, H, u, m, g, b, shape, panels, height: Math.max(H, y - g + m), lean: 0 };
  }

  const top = m;
  const bottom = H - m;
  const lean = 0.022 * span;
  const tierH = 0.37 * (bottom - top);
  const cutMid = bottom - tierH - g * 0.5;
  /* The cut across: lower at the left, as the front door's is. */
  const cutY = (x) => cutMid + lean * (0.5 - (x - left) / span);
  const upper = [[left, top], [right, top]];
  const upperFoot = [[left, cutY(left) - g * 0.5], [right, cutY(right) - g * 0.5]];
  const lowerHead = [[left, cutY(left) + g * 0.5], [right, cutY(right) + g * 0.5]];
  const lowerFoot = [[left, bottom], [right, bottom]];
  const leftEdge = [[left, 0], [left, H]];
  const rightEdge = [[right, 0], [right, H]];
  const tilt = 0.06 * (cutMid - top);

  /* The upper tier: the big panel, and a column for second and third when they are drawn. */
  if (winners >= 2) {
    const x = left + span * 0.665;
    const cut = [[x + tilt, top], [x - tilt, cutMid]];
    panels.big = quad(leftEdge, shiftX(cut, -g * 0.5), upper, upperFoot);
    const column = (head, foot) => quad(shiftX(cut, g * 0.5), rightEdge, head, foot);
    if (winners >= 3) {
      /* The column's own cut, across, leaning the other way to the first. */
      const y = (top + cutMid) / 2;
      const across = [[x, y - lean * 0.4], [right, y + lean * 0.4]];
      panels.second = column(upper, shiftY(across, -g * 0.5));
      panels.third = column(shiftY(across, g * 0.5), upperFoot);
    } else {
      panels.second = column(upper, upperFoot);
    }
  } else {
    panels.big = quad(leftEdge, rightEdge, upper, upperFoot);
  }

  /* The lower tier: the order, the seal and the actions, with two cuts down that lean alternately. */
  const cuts = [0.37, 0.69].map((f, i) => {
    const x = left + span * f;
    const d = (i % 2 ? -1 : 1) * 0.09 * tierH;
    return [[x + d, cutMid], [x - d, bottom]];
  });
  panels.order = quad(leftEdge, shiftX(cuts[0], -g * 0.5), lowerHead, lowerFoot);
  panels.seal = quad(shiftX(cuts[0], g * 0.5), shiftX(cuts[1], -g * 0.5), lowerHead, lowerFoot);
  panels.actions = quad(shiftX(cuts[1], g * 0.5), rightEdge, lowerHead, lowerFoot);
  return { W, H, u, m, g, b, shape, panels, height: H, lean };
}

/* The bounding box of a quad, and the polygon clip that cuts it back to the quad in its own pixels. */
export function boxOf(q) {
  const xs = q.map((p) => p[0]);
  const ys = q.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return {
    x: x0,
    y: y0,
    w: Math.max(...xs) - x0,
    h: Math.max(...ys) - y0,
    clip: `polygon(${q.map((p) => `${(p[0] - x0).toFixed(1)}px ${(p[1] - y0).toFixed(1)}px`).join(',')})`,
    /* How far each corner is in from its box, so what stands in a corner stands inside the lean. */
    lean: {
      tl: q[0][0] - x0, tr: Math.max(...xs) - q[1][0], bl: q[3][0] - x0, br: Math.max(...xs) - q[2][0],
    },
  };
}

export const panelArea = area;

const pathOf = (q) => `M${q.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}Z`;

/*
 * The page, kept to its window. `root` holds the panels as children with
 * data-panel set to their names; the paper is an SVG made here. `onLayout`
 * hears every new layout, which is how the canvas learns where the big panel is
 * and how the focus lines learn where to point.
 */
export function createPage(root, { winners, counts, onLayout }) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'page-ink');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const paper = document.createElementNS(SVG_NS, 'path');
  paper.setAttribute('class', 'page-paper');
  paper.setAttribute('fill-rule', 'evenodd');
  const lines = document.createElementNS(SVG_NS, 'path');
  lines.setAttribute('class', 'page-lines');
  svg.append(paper, lines);
  root.prepend(svg);
  /* On the page's own root and not the document's, because the stylesheet gives the page default values of its own, which an inherited one would lose to. */
  const style = root.style;
  let last = null;

  function apply() {
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (W < 2 || H < 2) {
      return null;
    }
    const L = layoutResults(W, H, winners, counts);
    last = L;
    const quads = Object.values(L.panels);
    svg.setAttribute('viewBox', `0 0 ${W} ${L.height}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(L.height));
    paper.setAttribute('d', `M0,0H${W}V${L.height}H0Z${quads.map(pathOf).join('')}`);
    lines.setAttribute('d', quads.map(pathOf).join(''));
    lines.setAttribute('stroke-width', L.b.toFixed(2));
    style.setProperty('--u', `${L.u.toFixed(3)}px`);
    style.setProperty('--pm', `${L.m.toFixed(1)}px`);
    style.setProperty('--pg', `${L.g.toFixed(1)}px`);
    style.setProperty('--pb', `${L.b.toFixed(2)}px`);
    root.dataset.shape = L.shape;
    for (const [name, q] of Object.entries(L.panels)) {
      const el = root.querySelector(`[data-panel="${name}"]`);
      if (!el) {
        continue;
      }
      /* The order the panels open in, for the stylesheet: the picture first. */
      el.style.setProperty('--i', String(Math.max(0, OPENING.indexOf(name))));
      const box = boxOf(q);
      el.style.left = `${box.x.toFixed(1)}px`;
      el.style.top = `${box.y.toFixed(1)}px`;
      el.style.width = `${box.w.toFixed(1)}px`;
      el.style.height = `${box.h.toFixed(1)}px`;
      el.style.clipPath = L.lean > 0 ? box.clip : 'none';
      el.style.setProperty('--lean-tl', `${box.lean.tl.toFixed(1)}px`);
      el.style.setProperty('--lean-tr', `${box.lean.tr.toFixed(1)}px`);
      el.style.setProperty('--lean-bl', `${box.lean.bl.toFixed(1)}px`);
      el.style.setProperty('--lean-br', `${box.lean.br.toFixed(1)}px`);
    }
    if (onLayout) {
      onLayout(L);
    }
    return L;
  }

  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
  if (observer) {
    observer.observe(root);
  } else {
    window.addEventListener('resize', apply);
  }
  apply();
  return {
    apply,
    get layout() {
      return last;
    },
    dispose() {
      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener('resize', apply);
      }
      svg.remove();
    },
  };
}
