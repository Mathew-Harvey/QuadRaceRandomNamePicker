/*
 * show.test.js: the show's arithmetic, held where it can be held without a
 * browser: what a pasted list means, the odds in words, the lamps, the race
 * clock through a photo finish, the standings and gaps the tower shows, the
 * beats that are spoken and when, and the tags that must not cover each other.
 *
 * What matters most is what these cannot do. None of them can change a
 * result, because they only read the plan; and the one thing in them that is
 * drawn, the hold before green, is drawn from the show seed and nowhere else.
 * The standings test holds the page to the draw: when the last quad has
 * crossed, the tower is the drawn order, whatever the animation did on the way.
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { makePlan } from '../src/choreo.js';
import {
  LIGHTS, SLOW, advanceClock, beatsBetween, beatsFor, commaList, foldedRow, formatClock, formatGap, gapOf, lapOf,
  lightsAt, lightsPlan, numberTickets, oddsLines, ordinal, photoWindow, placeTags, readNames, standings, winnersAllowed,
} from '../src/show.js';
import { specFor } from './lib/plan-cases.js';

const near = (a, b, eps, what) => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} is not ${b}`);

function planFor(k, over = {}) {
  const spec = { ...specFor(k), ...over };
  return { spec, plan: makePlan({ order: spec.order, showSeed: spec.showSeed, length: spec.length, photo: spec.photo }) };
}

test('a pasted list: rows, numbers, blanks, duplicates and the fifty one', () => {
  const r = readNames('  Sam  \n\nAna\nSam\r\nRaj\rSam');
  assert.deepEqual(r.names, ['Sam', 'Ana', 'Sam', 'Raj', 'Sam']);
  assert.deepEqual(r.lines.map((l) => l.entry), [1, null, 2, 3, 4, 5]);
  assert.equal(r.counts.get('Sam'), 3);
  assert.deepEqual(r.duplicates, [{ name: 'Sam', count: 3, first: 0 }]);
  assert.equal(r.over, false);
  const big = readNames(Array.from({ length: 51 }, (_, i) => `n${i}`).join('\n'));
  assert.equal(big.over, true);
  assert.equal(big.entries.length, 50);
  assert.equal(big.lines[50].extra, true);
  assert.equal(big.lines[49].extra, false);
  assert.equal(readNames('').names.length, 0);
});

test('winners: up to three, and never all of the names', () => {
  assert.deepEqual([2, 3, 4, 5, 50].map(winnersAllowed), [1, 2, 3, 3, 3]);
});

test('the odds are said in the brief\'s words', () => {
  assert.deepEqual(oddsLines({ count: 23, winners: 1 }), ['Each name has a 1 in 23 chance of winning.']);
  assert.deepEqual(oddsLines({ count: 23, winners: 3 }), ['With 3 winners, each name has a 3 in 23 chance of being one.']);
  assert.deepEqual(oddsLines({ count: 23, winners: 1, duplicates: [{ name: 'Sam', count: 3 }] }),
    ['Each name has a 1 in 23 chance of winning.', 'Sam has 3 entries: 3 in 23.']);
  const several = oddsLines({ count: 23, winners: 2, duplicates: [{ name: 'Sam', count: 3 }] });
  assert.match(several[1], /Sam has 3 entries, each with a 2 in 23 chance/);
  assert.deepEqual(oddsLines({ count: 1, winners: 1 }), [], 'nothing to say about a list of one');
});

test('a single comma separated line is offered for splitting, and nothing else is', () => {
  assert.deepEqual(commaList('Sam, Ana ,Raj'), ['Sam', 'Ana', 'Raj']);
  assert.equal(commaList('Sam'), null);
  assert.equal(commaList('Sam, Ana\nRaj'), null);
  assert.equal(commaList(' , '), null);
  assert.equal(numberTickets(3), '1\n2\n3');
  assert.equal(numberTickets(99).split('\n').length, 50);
});

test('the lamps: three amber a second apart, a hold from the show seed, then green', () => {
  const a = lightsPlan('aa'.repeat(32));
  const again = lightsPlan('aa'.repeat(32));
  assert.deepEqual(a, again, 'the same seed, the same start');
  assert.deepEqual(a.amber, [2.5, 3.5, 4.5]);
  assert.ok(a.hold >= LIGHTS.holdMin && a.hold <= LIGHTS.holdMax);
  near(a.green, 4.5 + a.hold, 1e-12, 'green');
  assert.deepEqual(lightsAt(a, 0), { amber: 0, green: false, k: 0 });
  assert.equal(lightsAt(a, 2.5).amber, 1);
  assert.equal(lightsAt(a, 4.49).amber, 2);
  assert.equal(lightsAt(a, 4.5).amber, 3);
  assert.equal(lightsAt(a, a.green - 0.01).green, false);
  assert.equal(lightsAt(a, a.green).green, true);
  assert.equal(lightsAt(a, a.green).k, 1, 'the camera is on the rail at green');
  assert.equal(lightsAt(a, 99).k, 1);
  const holds = Array.from({ length: 400 }, (_, i) => lightsPlan(`${i.toString(16).padStart(8, '0')}${'5c'.repeat(28)}`).hold);
  assert.ok(Math.min(...holds) < 0.6 && Math.max(...holds) > 1.9, 'the hold uses the whole of its range');
});

test('the photo finish: the last 0.8 s before the line at a third of speed, and exact at its edges', () => {
  /* A forced photo finish makes the margin small; scan a few plans for one whose first two are inside a quarter of a second. */
  let plan = planFor(7, { photo: true }).plan;
  for (let k = 0; k < 40 && !photoWindow(plan); k += 1) {
    plan = planFor(k + 20, { photo: true }).plan;
  }
  const w = photoWindow(plan);
  assert.ok(w, 'a forced photo finish has a window');
  near(w.from, plan.finish[plan.order[0]] - SLOW.before, 1e-12, 'from');
  /* Wall time through the window is three times the clock's. */
  let t = w.from - 1;
  let wall = 0;
  const dt = 1 / 60;
  while (t < w.to + 1) {
    t = advanceClock(t, dt, w);
    wall += dt;
  }
  near(wall, (w.from - (w.from - 1)) + (w.to - w.from) / SLOW.rate + 1, 0.05, 'wall time through the window');
  /* One big step and many small ones land on the same time. */
  const one = advanceClock(w.from - 0.5, 4, w);
  let many = w.from - 0.5;
  for (let i = 0; i < 400; i += 1) {
    many = advanceClock(many, 0.01, w);
  }
  near(one, many, 1e-9, 'stepping all at once or a frame at a time');
  assert.equal(advanceClock(5, 2, null), 7);
});

test('the standings freeze at the draw: when the last quad has crossed, the tower is the drawn order', () => {
  for (const k of [1, 2, 5, 9, 14, 30, 41]) {
    const { plan } = planFor(k);
    const last = Math.max(...plan.finish);
    assert.deepEqual(standings(plan, last + 0.01), plan.order, `plan ${k}: the tower at the end is the drawn order`);
    assert.deepEqual(standings(plan, plan.duration), plan.order);
    /* The first to cross is the winner, the moment after she does. */
    const win = plan.finish[plan.order[0]];
    assert.equal(standings(plan, win + 0.001)[0], plan.order[0]);
    /* Mid race it is by progress. */
    const mid = standings(plan, win * 0.5);
    for (let p = 1; p < mid.length; p += 1) {
      assert.ok(plan.curves[mid[p - 1]].s(win * 0.5) >= plan.curves[mid[p]].s(win * 0.5), 'mid race, ahead is first');
    }
  }
});

test('the gaps: nothing for the leader, ascending behind, and the crossing times once crossed', () => {
  for (const k of [3, 6, 12, 27]) {
    const { plan } = planFor(k);
    const win = plan.finish[plan.order[0]];
    const t = win * 0.6;
    const order = standings(plan, t);
    assert.equal(gapOf(plan, order, t, 0), 0);
    let before = 0;
    for (let p = 1; p < Math.min(order.length, 10); p += 1) {
      const g = gapOf(plan, order, t, p);
      assert.ok(g >= before - 1e-6 && g > 0, `place ${p + 1} is ${g} behind`);
      before = g;
    }
    const end = standings(plan, plan.duration);
    for (let p = 1; p < end.length; p += 1) {
      near(gapOf(plan, end, plan.duration, p), plan.finish[end[p]] - plan.finish[end[0]], 1e-9, 'gap at the end');
    }
    /* No jump at the line: a moment before a quad crosses, its gap is its crossing gap. */
    const second = plan.order[1];
    const t2 = plan.finish[second] - 0.01;
    const o2 = standings(plan, t2);
    const p2 = o2.indexOf(second);
    if (p2 > 0 && plan.finish[plan.order[0]] < t2) {
      near(gapOf(plan, o2, t2, p2), plan.finish[second] - plan.finish[plan.order[0]], 0.12, 'continuous at the line');
    }
  }
});

test('the lap counter runs from 1 to the last lap', () => {
  const { plan } = planFor(11, { length: 60 });
  assert.equal(plan.laps, 4);
  assert.equal(lapOf(plan, standings(plan, 0), 0), 1);
  const seen = new Set();
  for (let t = 0; t <= plan.duration; t += 0.5) {
    seen.add(lapOf(plan, standings(plan, t), t));
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4]);
});

test('the beats: Go, the final lap when there is one, the leader changes, the photo finish, and the winner only once she has crossed', () => {
  for (const k of [4, 8, 15, 22, 33]) {
    const { plan, spec } = planFor(k, { photo: k % 2 === 0 });
    const names = Array.from({ length: plan.count }, (_, i) => `Name ${i + 1}`);
    const beats = beatsFor(plan, names, 3);
    assert.deepEqual(beats[0], { at: 0, text: 'Go', kind: 'go' });
    assert.deepEqual(beats, [...beats].sort((a, b) => a.at - b.at), 'in order');
    const win = plan.finish[plan.order[0]];
    const wins = beats.filter((b) => b.kind === 'win');
    assert.equal(wins.length, 1);
    assert.equal(wins[0].text, `${names[plan.order[0]]} wins`);
    near(wins[0].at, win + 0.15, 1e-9, 'the winner is named after she crosses');
    const places = beats.filter((b) => b.kind === 'place').map((b) => b.text);
    assert.deepEqual(places, [`Second: ${names[plan.order[1]]}`, `Third: ${names[plan.order[2]]}`].slice(0, Math.min(2, plan.count - 1)));
    /* Nothing names a place before it is crossed. */
    for (const b of beats.filter((x) => x.kind === 'win' || x.kind === 'place')) {
      assert.ok(b.at > Math.min(...plan.finish), 'no result before the first crossing');
    }
    const finals = beats.filter((b) => b.kind === 'final');
    assert.equal(finals.length, plan.laps >= 2 ? 1 : 0);
    if (finals.length) {
      const lead = standings(plan, finals[0].at + 0.06)[0];
      assert.ok(plan.curves[lead].s(finals[0].at + 0.06) >= (plan.laps - 1) * plan.course.lap - 1, 'the final lap is announced as it begins');
    }
    for (const b of beats.filter((x) => x.kind === 'leader')) {
      assert.ok(b.at >= 2, `a leader beat at ${b.at}, inside the launch`);
      assert.match(b.text, /^New leader: Name \d+$/);
    }
    assert.equal(beats.some((b) => b.kind === 'photo'), Boolean(photoWindow(plan)), `plan ${k} photo beat matches the window`);
    assert.equal(spec.n, plan.count);
  }
  const { plan } = planFor(2);
  const beats = beatsFor(plan, Array.from({ length: plan.count }, (_, i) => `N${i}`), 1);
  assert.deepEqual(beatsBetween(beats, -1, 0).map((b) => b.text), ['Go']);
  assert.deepEqual(beatsBetween(beats, 0, 0.5), [], 'a beat is crossed once');
});

test('tags: none covers another, the top three always show, and the frame is respected', () => {
  const bounds = { l: 0, t: 0, r: 1600, b: 900 };
  const items = [];
  /* A pack: thirty tags wanting nearly the same place, in priority order. */
  for (let i = 0; i < 30; i += 1) {
    items.push({ id: i, x: 700 + (i % 5) * 18 + (i % 3) * 9, y: 400 + (i % 4) * 6, w: 96, h: 18, force: i < 3 });
  }
  const placed = placeTags(items, bounds);
  const shown = items.filter((it) => placed.get(it.id).shown);
  assert.ok(placed.get(0).shown && placed.get(1).shown && placed.get(2).shown, 'the top three show');
  assert.ok(shown.length >= 5, 'a pack still shows several names');
  const boxes = shown.map((it) => ({ id: it.id, ...placed.get(it.id), w: it.w, h: it.h }));
  for (let a = 3; a < boxes.length; a += 1) {
    for (let b = 3; b < a; b += 1) {
      const A = boxes[a];
      const B = boxes[b];
      const apart = A.x >= B.x + B.w || A.x + A.w <= B.x || A.y >= B.y + B.h || A.y + A.h <= B.y;
      assert.ok(apart, `tags ${A.id} and ${B.id} cover each other`);
    }
  }
  for (const b of boxes) {
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 1600 && b.y + b.h <= 900, `tag ${b.id} is inside the frame`);
  }
  /* A tag with nowhere to go and no force is left off. */
  const out = placeTags([{ id: 'x', x: -50, y: 10, w: 90, h: 18, force: false }], bounds);
  assert.equal(out.get('x').shown, false);
  /* Alone, a tag stands exactly above its quad. */
  const alone = placeTags([{ id: 'a', x: 500, y: 300, w: 100, h: 20, force: false }], bounds);
  assert.deepEqual(alone.get('a'), { x: 450, y: 280, shown: true });
});

test('tags keep off the overlay\'s own furniture, the top three included', () => {
  const bounds = { l: 0, t: 0, r: 1600, b: 900 };
  const tower = { l: 20, t: 20, w: 250, h: 300 };
  const inside = (b) => b.x < tower.l + tower.w && b.x + 96 > tower.l && b.y < tower.t + tower.h && b.y + 18 > tower.t;
  /* A quad right under the tower: its name goes to the nearest place that is clear of it, or nowhere. */
  const items = [0, 1, 2, 3].map((i) => ({ id: i, x: 120 + i * 30, y: 200 + i * 10, w: 96, h: 18, force: i < 3 }));
  const placed = placeTags(items, bounds, 3, [tower]);
  for (const it of items) {
    const p = placed.get(it.id);
    if (p.shown) {
      assert.ok(!inside(p), `tag ${it.id} stands on the tower`);
    }
  }
  /* A forced tag whose own wish is on the tower is left off and does not cover it. */
  const forced = placeTags([{ id: 'f', x: 140, y: 100, w: 96, h: 18, force: true }], { l: 0, t: 0, r: 280, b: 330 }, 3, [tower]);
  assert.equal(forced.get('f').shown, false);
  /* With no furniture, and with a null in the list, nothing changes. */
  const alone = placeTags([{ id: 'a', x: 500, y: 300, w: 100, h: 20, force: false }], bounds, 3, [null]);
  assert.deepEqual(alone.get('a'), { x: 450, y: 280, shown: true });
});

test('the words: the clock, the gaps, the places, the folded row', () => {
  assert.equal(formatClock(0), '0:00.00');
  assert.equal(formatClock(12.345), '0:12.35');
  assert.equal(formatClock(75.5), '1:15.50');
  assert.equal(formatGap(0), '');
  assert.equal(formatGap(0.421), '+0.42');
  assert.equal(formatGap(12.34), '+12.3');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 50].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '50th']);
  assert.equal(foldedRow(11, 23), '11 to 23');
  assert.equal(foldedRow(11, 11), '11');
});
