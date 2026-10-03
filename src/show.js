/*
 * show.js: the show's own arithmetic, with no page in it.
 *
 * Everything the screens decide that is not a pixel lives here, so that it can
 * be held by tests in Node: what a pasted list means, what the odds are said
 * in words, when the lamps go, how the race clock runs through a photo finish,
 * which beats are spoken and when, who is where at a moment and how far
 * behind, and where each tag may stand so that no two cover each other.
 *
 * NOTHING HERE DECIDES A RESULT. The order is the draw's, made and sealed
 * before any of this runs, and the plan is built from it. What is in this file
 * reads the plan, and reading it cannot change it. The lamps' hold is drawn
 * from the show seed because a real start holds so nobody can anticipate it,
 * and a hold that came from anywhere else would be a second source of chance
 * in a page whose whole claim is that there is one.
 *
 * It imports draw.js for the canonical form of a name and the limits, which
 * are the one definition of both, and nothing else.
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

import { LIMITS, canonicalName } from './draw.js';
import { makeRng } from './choreo.js';

/* ------------------------------------------------------------------ */
/* The list                                                            */
/* ------------------------------------------------------------------ */

/*
 * What a pasted list is, line by line. Each line of the text is a row of the
 * gutter, and the rows that have a name are numbered in the order they
 * appear, which is the quad's number and its place on the grid. A blank line
 * is a row with no number. Two lines with the same name are two tickets:
 * counts is how many of each.
 */
export function readNames(text) {
  const rows = String(text ?? '').split(/\r\n|\r|\n/);
  const lines = [];
  const names = [];
  const counts = new Map();
  for (const raw of rows) {
    const name = canonicalName(raw);
    if (name === '') {
      lines.push({ raw, name: null, entry: null, extra: false });
      continue;
    }
    names.push(name);
    counts.set(name, (counts.get(name) || 0) + 1);
    lines.push({ raw, name, entry: names.length, extra: names.length > LIMITS.maxNames });
  }
  const duplicates = [...counts]
    .filter(([, n]) => n > 1)
    .map(([name, n]) => ({ name, count: n, first: names.indexOf(name) }))
    .sort((a, b) => b.count - a.count || a.first - b.first);
  return {
    lines,
    /* Every ticket, in order, as written: the 51st and on included, so the page can say so. */
    names,
    /* The tickets the grid holds. */
    entries: names.slice(0, LIMITS.maxNames),
    counts,
    duplicates,
    over: names.length > LIMITS.maxNames,
  };
}

/* How many winners a list can have: up to three, and never all of the names. */
export const winnersAllowed = (count) => Math.max(1, Math.min(LIMITS.maxWinners, count - 1));

/*
 * The odds, in words and in the picker's own arithmetic: one line is one
 * ticket, and every ticket is as likely as any other to be any place. So one
 * winner is a 1 in N chance for a ticket, W winners are W in N, and a name
 * with k entries has k tickets, which is k in N for one winner. With more
 * winners a name with several entries can take more than one of the places,
 * which is said and not turned into a percentage that would not be true.
 */
export function oddsLines({ count, winners, duplicates = [] }) {
  if (count < LIMITS.minNames) {
    return [];
  }
  const out = [];
  if (winners <= 1) {
    out.push(`Each name has a 1 in ${count} chance of winning.`);
  } else {
    out.push(`With ${winners} winners, each name has a ${winners} in ${count} chance of being one.`);
  }
  for (const d of duplicates.slice(0, 3)) {
    out.push(winners <= 1
      ? `${d.name} has ${d.count} entries: ${d.count} in ${count}.`
      : `${d.name} has ${d.count} entries, each with a ${winners} in ${count} chance.`);
  }
  if (duplicates.length > 3) {
    out.push(`And ${duplicates.length - 3} more names with more than one entry.`);
  }
  return out;
}

/* Whether a single pasted line is a comma separated list that is worth offering to split. */
export function commaList(text) {
  const t = String(text ?? '').trim();
  if (t === '' || /[\r\n]/.test(t)) {
    return null;
  }
  const parts = t.split(',').map((p) => p.trim()).filter((p) => p !== '');
  return parts.length >= 2 ? parts : null;
}

/* The list for "Numbers 1 to N": one number a line. */
export const numberTickets = (n) => Array.from({ length: Math.max(0, Math.min(LIMITS.maxNames, Math.floor(n))) }, (_, i) => String(i + 1)).join('\n');

/* ------------------------------------------------------------------ */
/* The lights                                                          */
/* ------------------------------------------------------------------ */

export const LIGHTS = Object.freeze({ first: 2.5, step: 1, holdMin: 0.5, holdMax: 2 });

/*
 * When each lamp goes, in seconds from the start of the lights: three amber a
 * second apart, then a hold of half a second to two, drawn from the show
 * seed, then green. The aerial shot is timed to arrive on the rail at green.
 */
export function lightsPlan(showSeed) {
  const hold = makeRng(showSeed, 'lights').range(LIGHTS.holdMin, LIGHTS.holdMax);
  const amber = [0, 1, 2].map((k) => LIGHTS.first + k * LIGHTS.step);
  return { amber, hold, green: amber[2] + hold };
}

/* What the gantry shows at second t of the lights, and how far along the aerial is. */
export function lightsAt(plan, t) {
  const lit = plan.amber.filter((at) => t >= at).length;
  return { amber: lit, green: t >= plan.green, k: Math.min(1, Math.max(0, t / plan.green)) };
}

/* ------------------------------------------------------------------ */
/* The race clock                                                      */
/* ------------------------------------------------------------------ */

export const SLOW = Object.freeze({ before: 0.8, rate: 1 / 3, close: 0.25, after: 0.1 });

/*
 * The photo finish. When first and second are under a quarter of a second
 * apart, the last 0.8 s before the line plays at a third of speed, and the
 * slow part runs on until second has crossed too, so both crossings are in
 * it. Null when there is none.
 */
export function photoWindow(plan) {
  if (plan.count < 2) {
    return null;
  }
  const a = plan.finish[plan.order[0]];
  const b = plan.finish[plan.order[1]];
  if (b - a >= SLOW.close) {
    return null;
  }
  return { from: a - SLOW.before, to: b + SLOW.after };
}

/*
 * The race clock after `wall` more seconds of the page's own: one to one,
 * and a third as fast inside the photo finish. Exact at the edges of the
 * window, so that stepping a frame at a time and stepping all at once land on
 * the same time, which is what lets a slow machine and a fast one see the
 * same race.
 */
export function advanceClock(t, wall, window) {
  let remaining = wall;
  let time = t;
  while (remaining > 1e-12) {
    const inside = Boolean(window) && time >= window.from && time < window.to;
    const rate = inside ? SLOW.rate : 1;
    let boundary = Infinity;
    if (window && time < window.from) {
      boundary = window.from;
    } else if (window && time < window.to) {
      boundary = window.to;
    }
    const step = remaining * rate;
    if (time + step <= boundary) {
      time += step;
      remaining = 0;
    } else {
      remaining -= (boundary - time) / rate;
      time = boundary;
    }
  }
  return time;
}

/* ------------------------------------------------------------------ */
/* Who is where                                                        */
/* ------------------------------------------------------------------ */

/*
 * The standings at race time t: entries in place order. A quad that has
 * crossed the line is in its finishing place, in the order it crossed, so the
 * tower freezes where the finish does; the rest are in order of how far
 * round they are. It reads the plan's public curves and finish times and
 * nothing else.
 */
export function standings(plan, t, out = []) {
  const n = plan.count;
  out.length = n;
  for (let i = 0; i < n; i += 1) {
    out[i] = i;
  }
  const finished = (i) => t >= plan.finish[i];
  const progress = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    progress[i] = plan.curves[i].s(t);
  }
  out.sort((a, b) => {
    const fa = finished(a);
    const fb = finished(b);
    if (fa !== fb) {
      return fa ? -1 : 1;
    }
    return fa ? plan.finish[a] - plan.finish[b] : progress[b] - progress[a];
  });
  return out;
}

/*
 * How far behind the leader each quad is, in seconds: the time since the
 * leader was where this quad is now, found by bisection on the leader's own
 * progress, which only ever rises. For a quad that has crossed it is the
 * difference of the two crossing times, and stays that.
 */
export function gapOf(plan, order, t, place) {
  if (place === 0) {
    return 0;
  }
  const lead = order[0];
  const e = order[place];
  if (t >= plan.finish[e] && t >= plan.finish[lead]) {
    return plan.finish[e] - plan.finish[lead];
  }
  const target = Math.min(plan.curves[e].s(t), plan.laps * plan.course.lap);
  let lo = 0;
  let hi = t;
  if (plan.curves[lead].s(hi) <= target) {
    return 0;
  }
  for (let k = 0; k < 28; k += 1) {
    const mid = (lo + hi) / 2;
    if (plan.curves[lead].s(mid) < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return Math.max(0, t - (lo + hi) / 2);
}

/* Which lap the leader is on, 1 to the last. */
export function lapOf(plan, order, t) {
  const lead = order[0];
  const s = plan.curves[lead].s(t);
  return Math.max(1, Math.min(plan.laps, Math.floor(s / plan.course.lap) + 1));
}

/* ------------------------------------------------------------------ */
/* The beats                                                           */
/* ------------------------------------------------------------------ */

/*
 * What is said on the glass, one line at a time, naming what is in frame:
 * Go, a new leader, the final lap, a photo finish, and who wins. They are
 * worked out from the plan once, so a beat is a function of the race clock
 * and a replay says the same words at the same moments. A leader has to
 * hold the lead for half a second to count, so a pass that is made and
 * given back in a breath is not a headline.
 *
 * Nothing in them can spoil the result: a new leader is who leads now, and
 * the winner is named only when she has crossed.
 */
export function beatsFor(plan, names, winners = 1) {
  const beats = [{ at: 0, text: 'Go', kind: 'go' }];
  const winnerAt = plan.finish[plan.order[0]];
  const lapLength = plan.course.lap;
  const rank = [];
  let holder = null;
  let candidate = null;
  let since = 0;
  let finalSaid = plan.laps < 2;
  for (let t = 1.5; t <= winnerAt; t += 0.05) {
    plan.rank(t, rank);
    const lead = rank[0];
    if (holder === null) {
      holder = lead;
      candidate = lead;
      since = t;
    } else if (lead !== candidate) {
      candidate = lead;
      since = t;
    } else if (candidate !== holder && t - since >= 0.5) {
      holder = candidate;
      beats.push({ at: t, text: `New leader: ${names[holder]}`, kind: 'leader' });
    }
    if (!finalSaid && plan.curves[lead].s(t) >= (plan.laps - 1) * lapLength) {
      finalSaid = true;
      beats.push({ at: t, text: 'Final lap', kind: 'final' });
    }
  }
  const photo = photoWindow(plan);
  if (photo) {
    beats.push({ at: photo.from - 1.2, text: 'Photo finish', kind: 'photo' });
  }
  const words = ['wins', 'Second', 'Third'];
  for (let p = 0; p < Math.min(winners, 3, plan.count); p += 1) {
    const name = names[plan.order[p]];
    beats.push({
      at: plan.finish[plan.order[p]] + 0.15,
      text: p === 0 ? `${name} ${words[0]}` : `${words[p]}: ${name}`,
      kind: p === 0 ? 'win' : 'place',
    });
  }
  return beats.sort((a, b) => a.at - b.at);
}

/* The beats first reached between two clock readings, in order. */
export function beatsBetween(beats, before, now) {
  return beats.filter((b) => b.at > before && b.at <= now);
}

/* ------------------------------------------------------------------ */
/* Tags                                                                */
/* ------------------------------------------------------------------ */

/*
 * Where each tag stands. `items` come in priority order (first place first)
 * and each is { id, x, y, w, h, force }: the tag's bottom middle wants to be
 * at (x, y), above its quad, and it is w by h. A tag takes the first of a
 * list of places, nearest the wish first, that is inside the frame and clear
 * of every tag already placed, and a tag that finds none is left off, unless
 * it is forced (the top three always show), when it takes its wish and
 * covers what it covers. `blocked` is the overlay's own furniture, the tower
 * and the clock, as boxes { l, t, w, h }: no tag stands on one, forced or not,
 * because a name over the timing tower hides the one thing the tower is for.
 */
export function placeTags(items, bounds, gap = 3, blocked = []) {
  const placed = blocked.filter(Boolean).map((b) => ({
    l: b.l, t: b.t, w: b.w, h: b.h,
  }));
  const furniture = placed.length;
  const out = new Map();
  const apart = (b, p) => b.l >= p.l + p.w + gap || b.l + b.w + gap <= p.l || b.t >= p.t + p.h + gap || b.t + b.h + gap <= p.t;
  const inside = (b) => b.l >= bounds.l && b.t >= bounds.t && b.l + b.w <= bounds.r && b.t + b.h <= bounds.b;
  const clear = (b) => inside(b) && placed.every((p) => apart(b, p));
  for (const item of items) {
    const { w, h } = item;
    const wishes = [];
    for (let level = 0; level < 4; level += 1) {
      wishes.push([0, -level * (h + gap)]);
    }
    wishes.push([-(w / 2 + gap), 0], [w / 2 + gap, 0], [0, h + gap + 14]);
    let chosen = null;
    for (const [dx, dy] of wishes) {
      const box = { l: item.x - w / 2 + dx, t: item.y - h + dy, w, h };
      if (clear(box)) {
        chosen = box;
        break;
      }
    }
    if (!chosen && item.force) {
      const wish = { l: item.x - w / 2, t: item.y - h, w, h };
      if (placed.slice(0, furniture).every((p) => apart(wish, p))) {
        chosen = wish;
      }
    }
    if (chosen) {
      placed.push(chosen);
      out.set(item.id, { x: chosen.l, y: chosen.t, shown: true });
    } else {
      out.set(item.id, { x: item.x - w / 2, y: item.y - h, shown: false });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

/* The race clock the way the simulator's OSD writes a lap: 0:12.34. */
export function formatClock(seconds) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(2).padStart(5, '0')}`;
}

/* A gap to the leader: +0.42, +12.3, and a dash for the leader. */
export function formatGap(seconds) {
  if (!(seconds > 0.004)) {
    return '';
  }
  return seconds < 10 ? `+${seconds.toFixed(2)}` : `+${seconds.toFixed(1)}`;
}

/* A place as the page says it: 1st, 2nd, 3rd, 11th. */
export function ordinal(n) {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) {
    return `${n}th`;
  }
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 ? 0 : n % 10]}`;
}

/* "11 to 23": the part of the field the tower folds into one row. */
export const foldedRow = (from, to) => (from === to ? `${from}` : `${from} to ${to}`);
