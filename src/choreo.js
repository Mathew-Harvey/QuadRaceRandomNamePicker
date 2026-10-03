/*
 * choreo.js: the race, as a plan, made after the draw.
 *
 * The draw has already said who finishes where. This file takes that order,
 * the show seed, the number of names, the length chosen and the course, and
 * returns every quad's flight as a pure function of race time: how far along
 * the line, how far across it, how high. It has no DOM and no Three.js, so it
 * is tested in Node. The frame loop only samples it, so a slow laptop or a
 * dropped frame changes nothing about who is where at a given moment, and
 * nothing it does can change who wins, because the finishing times are
 * written first and every flight is built to reach the line at exactly its
 * quad's time.
 *
 * HOW A FLIGHT IS BUILT. Speed along the line is a launch that is the same
 * for every quad (they all have the same motors on the blocks, and get to 18
 * m/s in 1.5 s), a hand over, across the next three seconds, to the quad's
 * own cruise speed k, and then raised cosine bumps on top of k: a few small
 * ones on everybody, and a larger one or two on the leading few, which are
 * the storylines (a wire to wire win, a late surge, a comeback from a bad
 * start, an early leader who clips a flag, and a photo finish, which is only
 * a small margin). Every term integrates in closed form, and k is solved so
 * that the quad reaches the line exactly at its finishing time. The bumps are
 * smooth and kept inside the speed band, so the crossing order is the drawn
 * order by construction and the checks only confirm it. A story is a promise
 * about who is where (wire to wire has the winner clear at half way, any
 * other has somebody else first at half way, the winner at least 4 m behind
 * and the lead changing hands in the last third), it starts at about twice
 * the size of the ordinary variation, and is made bigger only as far as the
 * promise needs, because a leader 40 m clear of a field that has to be caught
 * by a rocket is legal and is not a race.
 *
 * HOW THEY STAY APART. Distance along the line is only one of three numbers.
 * Across the track and up, quads fly in a lattice of slots (9 lanes by 4
 * levels, no two slots closer than 0.9 m). For the first 2.7 s each keeps its
 * grid lane, while nobody is passing. After that a prioritised planner gives
 * each quad, winner first, a path through the lattice that stays 0.85 m clear
 * of every quad already planned at every moment the two are within about a
 * metre of each other along the line: the plain path if that is free, and a
 * dynamic programme over lane changes if it is not. Overtakes therefore go
 * round or over, because that is the only way the planner can find a path. If
 * an attempt fails the next is made from a seed derived from the first, and if
 * a story cannot be kept for a seed it is swapped for the sturdy one. If
 * every attempt fails the plan falls back to one slot per quad for the whole
 * race, which cannot collide whatever the speeds do, and says so. That has
 * never been needed in 3,000 plans.
 *
 * ATTITUDE IS DERIVED, NOT ANIMATED. pose() returns the thrust axis, which
 * points along acceleration minus gravity, and the heading, which follows the
 * velocity, so a quad pitches hard forward to accelerate, flares to brake and
 * banks into a bend. That needs the plan smooth to second order, which is why
 * the launch and the bumps are raised cosines, the lane changes are minimum
 * jerk moves, and the course has transitions whose curvature is a raised
 * cosine: see src/course.js for why a plain clothoid is not enough.
 *
 * DETERMINISM. A replay of a receipt is the same race, on any machine. So the
 * arithmetic that decides anything uses only + - * / and sqrt, which IEEE 754
 * specifies exactly, and the course's fixed polynomial cosine in place of the
 * engine's, which is allowed to differ in the last place from one engine to
 * the next. The generator is seeded from the show seed through a small integer
 * mixer, and the engine's ordinary random function is not used.
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

import { cosPi, makeCourse, sinPi } from './course.js';

export const STORYLINES = Object.freeze(['wire', 'surge', 'comeback', 'clip']);

/* How many laps each length is, so a race is a whole number of laps finishing on the start straight. */
export const LAPS = Object.freeze({ 15: 1, 30: 2, 60: 4 });

export const LAUNCH = 1.5;
export const BLEND = 3;
export const TAIL = 3;
/* How long the winner's flip takes, in seconds from the line: the camera is built to keep the winner in frame for most of it. */
export const FLIP = 0.9;
export const SPEED_BAND = Object.freeze({ min: 12, max: 36 });
export const MIN_GAP_FIRST = 0.04;
export const MIN_GAP = 0.08;
export const MIN_DISTANCE = 0.5;

const GRAVITY = 9.81;
/*
 * The speed along the line a quad may have after the launch. The brief's band
 * is the speed in the world, and a quad in the outside lane of a bend flies
 * 17 per cent further than the line and one in the inside lane 17 per cent
 * less, so the band along the line is the world band shrunk by those: 12 / 0.827
 * and 36 / 1.173 are 14.5 and 30.7, and these sit a little inside them, so that
 * a plan is never within a rounding error of the brief's limits.
 */
const LINE_BAND = Object.freeze({ min: 15, max: 30 });
/* The gaps the generator asks for sit a little above the brief's 0.04 s and 0.08 s, so a plan is never exactly on a limit and a rounding error in a measurement cannot decide it. */
const GAP_FIRST = 0.045;
const GAP_OTHER = 0.085;
/* The speed every quad launches to, whatever it will go on to do: they all have the same motors on the blocks. */
const LAUNCH_SPEED = 18;
const HZ = 60;
const LANE_STEP = 0.9;
/* Steps at the start in which a quad keeps its grid lane. While the speeds are still common nothing is passing, and a quad that moved sideways would land in the lane of a neighbour who has not been planned yet. */
const HOLD_STEPS = 3;
const PLAN_DISTANCE = 0.85;
const PLAN_STRIDE = 3;
/* The most one quad can gain on another in a lane step: the whole width of the speed band for a step, and the window that matters. */
const REACH = 17;
const WORLD_FACTOR = 0.8;
/* A failed attempt is cheap (it stops before the lanes), and the shortest races give a story the least room, so there are plenty. */
const MAX_ATTEMPTS = 24;
/* After this many attempts a story that cannot be kept for this seed is swapped for the sturdy one. A viewer is never told the name of a story, so a swap costs nothing and a story flown wrong costs the drama. */
const SWITCH_AFTER = 14;
const PI = Math.PI;

/* ------------------------------------------------------------------ */
/* Arithmetic that is the same everywhere                              */
/* ------------------------------------------------------------------ */

/* cos(pi x) and sin(pi x) are the course's, which are the same bits on every engine. */
export { cosPi, sinPi };

/* Minimum jerk: 0 to 1 with zero velocity and acceleration at both ends. */
const jerk = (t) => t * t * t * (10 + t * (-15 + 6 * t));
const jerkRate = (t) => 30 * t * t * (1 - t) * (1 - t);
const jerkAccel = (t) => 60 * t * (1 - t) * (1 - 2 * t);

/* ------------------------------------------------------------------ */
/* The generator                                                       */
/* ------------------------------------------------------------------ */

function mix32(h) {
  let x = h >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mix32(h);
}

/* Small Fast Counter, 128 bits of state, seeded from the show seed and a label, so each use has its own stream. */
export function makeRng(seedHex, label = '') {
  const words = [];
  for (let i = 0; i < 8; i += 1) {
    words.push(parseInt(String(seedHex).slice(8 * i, 8 * i + 8).padEnd(8, '0'), 16) >>> 0);
  }
  const tag = hashString(label);
  let a = (words[0] ^ mix32(words[4] + tag)) >>> 0;
  let b = (words[1] ^ mix32(words[5] ^ (tag + 0x9e3779b9))) >>> 0;
  let c = (words[2] ^ mix32(words[6] + (tag ^ 0x85ebca6b))) >>> 0;
  let d = (words[3] ^ mix32(words[7] ^ (tag + 0xc2b2ae35))) >>> 0;
  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 20; i += 1) {
    next();
  }
  return {
    float: next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (n) => Math.floor(next() * n),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    /* A bell shaped number from the sum of four uniforms, which needs no logarithm. */
    bell: () => (next() + next() + next() + next() - 2) * 1.7320508075688772,
  };
}

/* ------------------------------------------------------------------ */
/* One quad's speed, in closed form                                    */
/* ------------------------------------------------------------------ */

/*
 * A ramp from 0 to 1 over `length` seconds starting at `from`, shaped as a
 * raised cosine so its slope is zero at both ends. Its integral is closed
 * form, which is what lets a quad's distance be written down exactly.
 */
function rampVel(t, from, length) {
  if (t <= from) {
    return 0;
  }
  return t >= from + length ? 1 : 0.5 - 0.5 * cosPi((t - from) / length);
}

function rampPos(t, from, length) {
  if (t <= from) {
    return 0;
  }
  if (t >= from + length) {
    return length * 0.5 + (t - from - length);
  }
  const x = (t - from) / length;
  return length * (x * 0.5 - sinPi(x) / (2 * PI));
}

function rampAcc(t, from, length) {
  return t <= from || t >= from + length ? 0 : (PI / (2 * length)) * sinPi((t - from) / length);
}

/* A bump is a raised cosine of half width w around t0: its area is w. */
function bumpVel(b, t) {
  const x = (t - b.t0) / b.w;
  return x <= -1 || x >= 1 ? 0 : 0.5 * (1 + cosPi(x));
}

function bumpPos(b, t) {
  const x = (t - b.t0) / b.w;
  if (x <= -1) {
    return 0;
  }
  if (x >= 1) {
    return b.w;
  }
  return (b.w / 2) * (x + 1 + sinPi(x) / PI);
}

function bumpAcc(b, t) {
  const x = (t - b.t0) / b.w;
  return x <= -1 || x >= 1 ? 0 : -(PI / (2 * b.w)) * sinPi(x);
}

/*
 * One quad's flight along the line. Its speed is
 *
 *   kc launch(t) + (k - kc) blend(t) + k (bumps)
 *
 * which is the same launch for everybody (kc is the speed they all get up
 * to in 1.5 s), then, over the next three seconds, a hand over from that
 * common speed to the quad's own cruise k, with the bumps on top of k. The
 * launch has to be common: a launch scaled by each quad's own cruise made a
 * back row quad that was going to win 20 per cent quicker off the blocks than
 * the slow quad in front of it, and the two met inside a second, in a pack
 * 15 m long. Every term integrates in closed form, so k is solved exactly
 * for the quad to arrive at the line at its finishing time.
 */
class Curve {
  constructor(s0, finish) {
    this.s0 = s0;
    this.finish = finish;
    this.bumps = [];
    this.k = 20;
  }

  add(t0, w, amp) {
    /* Nothing in the first three seconds: the field is still a grid, and it is not the time for anybody to be passing. */
    const lo = 3 + w;
    this.bumps.push({ t0: t0 < lo ? lo : t0, w, A: amp });
  }

  /* The part of the distance that does not depend on k. */
  base(t) {
    return LAUNCH_SPEED * (rampPos(t, 0, LAUNCH) - rampPos(t, LAUNCH, BLEND));
  }

  /* The part that is proportional to k. */
  area(t) {
    let p = rampPos(t, LAUNCH, BLEND);
    for (const b of this.bumps) {
      p += b.A * bumpPos(b, t);
    }
    return p;
  }

  solve(line) {
    this.k = (line - this.s0 - this.base(this.finish)) / this.area(this.finish);
    return this.k;
  }

  s(t) {
    return this.s0 + this.base(t) + this.k * this.area(t);
  }

  v(t) {
    let q = rampVel(t, LAUNCH, BLEND);
    for (const b of this.bumps) {
      q += b.A * bumpVel(b, t);
    }
    return LAUNCH_SPEED * (rampVel(t, 0, LAUNCH) - rampVel(t, LAUNCH, BLEND)) + this.k * q;
  }

  a(t) {
    let q = rampAcc(t, LAUNCH, BLEND);
    for (const b of this.bumps) {
      q += b.A * bumpAcc(b, t);
    }
    return LAUNCH_SPEED * (rampAcc(t, 0, LAUNCH) - rampAcc(t, LAUNCH, BLEND)) + this.k * q;
  }
}

/* ------------------------------------------------------------------ */
/* Finishing times                                                     */
/* ------------------------------------------------------------------ */

/*
 * The gap between each place and the next, which is the race's finish. The
 * winner's margin is the drama: a photo finish is a margin under a quarter of
 * a second, everything else is between 0.3 and 1.6 seconds, and 38 per cent
 * of races are photo finishes, which sits in the middle of the 25 to 50 per
 * cent the brief wants. The rest of the field comes in a stream, never closer
 * than the brief's 0.08 s, and never so spread out that the last quad has to
 * fly a fifth slower than the winner.
 */
function finishingTimes(order, length, rng, photo) {
  const n = order.length;
  const winner = length * rng.range(0.94, 1.06);
  const gaps = [];
  gaps.push(photo ? rng.range(GAP_FIRST, 0.22) : 0.3 * (1.6 / 0.3) ** rng.float());
  for (let p = 1; p < n - 1; p += 1) {
    const top = p <= 5;
    gaps.push(GAP_OTHER + (top ? rng.range(0, 0.34) : rng.range(0, 0.13)));
  }
  const minimum = gaps.length ? gaps[0] + (n - 2) * GAP_OTHER : 0;
  const extra = gaps.slice(1).reduce((sum, g) => sum + (g - GAP_OTHER), 0);
  const budget = Math.max(0.2 * winner - minimum, 0);
  const squeeze = extra > budget && extra > 0 ? budget / extra : 1;
  const finish = new Float64Array(n);
  let t = winner;
  for (let p = 0; p < n; p += 1) {
    finish[order[p]] = t;
    if (p < n - 1) {
      const g = gaps[p];
      t += p === 0 ? g : GAP_OTHER + (g - GAP_OTHER) * squeeze;
    }
  }
  return finish;
}

/* ------------------------------------------------------------------ */
/* Storylines                                                          */
/* ------------------------------------------------------------------ */

const STORY_WEIGHTS = [['wire', 0.22], ['surge', 0.34], ['comeback', 0.24], ['clip', 0.2]];

function chooseStory(rng) {
  let x = rng.float();
  for (const [name, weight] of STORY_WEIGHTS) {
    if (x < weight) {
      return name;
    }
    x -= weight;
  }
  return 'surge';
}

/* ------------------------------------------------------------------ */
/* Who leads                                                           */
/* ------------------------------------------------------------------ */

/* The entry furthest along at time t, and how far along it is. */
function leaderAt(curves, t, out) {
  let best = 0;
  let far = -1e18;
  for (let i = 0; i < curves.length; i += 1) {
    const s = curves[i].s(t);
    if (s > far) {
      far = s;
      best = i;
    }
  }
  out.index = best;
  out.s = far;
  return out;
}

/* The first moment anybody is `distance` along. The greatest progress only ever grows, so this is a bisection. */
function reachedAt(curves, distance, limit) {
  const at = {};
  let lo = 0;
  let hi = limit;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (leaderAt(curves, mid, at).s >= distance) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return hi;
}

/*
 * Who is first at the moment anybody reaches half the distance, how far
 * ahead of the next quad they are (`lead`), and how far the winner is behind
 * them (`gap`, which is nothing if the winner is them).
 */
function halfState(curves, line, limit, winner) {
  const t = reachedAt(curves, line / 2, limit);
  const at = leaderAt(curves, t, {});
  let second = -1e18;
  for (let i = 0; i < curves.length; i += 1) {
    if (i !== at.index) {
      second = Math.max(second, curves[i].s(t));
    }
  }
  return { index: at.index, lead: at.s - second, gap: at.s - curves[winner].s(t) };
}

/*
 * A storyline's promise. Wire to wire has the winner first at half way by at
 * least 3 m, which is a lead and not a hair. Every other story has somebody
 * else first at half way with the winner at least 4 m behind, and the lead
 * changing hands between two thirds of the distance and the line.
 */
const LEAD = 3;
const TRAIL = 4;
/* No bump a repair makes is bigger than the speed band can hold: about +30 per cent of a 22 m/s cruise up, and about -27 per cent down. */
const CAP_UP = 0.3;
const CAP_DOWN = -0.27;
const grow = (bump, factor) => {
  bump.A = Math.max(CAP_DOWN, Math.min(CAP_UP, bump.A * factor));
};

function kept(story, curves, line, scale, winner) {
  const half = halfState(curves, line, scale * 3, winner);
  const third = lastThird(curves, line, scale);
  const holds = story === 'wire'
    ? half.index === winner && half.lead >= LEAD
    : half.index !== winner && half.gap >= TRAIL && third.changes >= 1;
  return { holds, half, third };
}

function halfLeader(curves, line, limit) {
  return leaderAt(curves, reachedAt(curves, line / 2, limit), {}).index;
}

/* Who leads at two thirds of the distance, and how many times the lead changes hands from there to the winner's finish. */
function lastThird(curves, line, winnerFinish) {
  const at = {};
  const from = reachedAt(curves, (2 * line) / 3, winnerFinish);
  const first = leaderAt(curves, from, at).index;
  let last = first;
  let changes = 0;
  for (let t = from; t < winnerFinish; t += 0.02) {
    const now = leaderAt(curves, t, at).index;
    if (now !== last) {
      changes += 1;
      last = now;
    }
  }
  /* A pass in the last instants before the line, which a photo finish is made of. */
  if (leaderAt(curves, winnerFinish - 1e-4, at).index !== last) {
    changes += 1;
  }
  return { first, changes };
}

function finalThirdChanges(curves, line, winnerFinish) {
  return lastThird(curves, line, winnerFinish).changes;
}

/*
 * Give the leading few their storyline and everybody a little variation, then
 * check the storyline did what it says, and push it harder, a few times, if
 * it did not. A storyline is a promise about who is where, and a promise that
 * is only probably kept would make the brief's drama targets luck. The
 * promise is: wire to wire has the winner first at half way, and every other
 * story has somebody else first at half way and the lead changing hands in the
 * last third.
 */
function dress(curves, order, finish, line, story, rng) {
  const n = order.length;
  const winner = order[0];
  const scale = finish[winner];
  const rival = order[1 + rng.int(Math.min(5, n - 1))];
  const W = curves[winner];
  const R = curves[rival];
  const wobble = [];

  for (const c of curves) {
    const count = 1 + rng.int(3);
    for (let m = 0; m < count; m += 1) {
      c.add(rng.range(0.2, 0.95) * scale, rng.range(0.06, 0.14) * scale, rng.range(-0.1, 0.1));
    }
  }

  const part = (curve, centre, width, amp) => {
    curve.add(centre * scale, width * scale, amp);
    return curve.bumps[curve.bumps.length - 1];
  };

  /*
   * The stories start small. A storyline bump is about twice the size of the
   * ordinary variation, which is a few metres, because a race where the
   * leader is forty metres clear of a field that has to be caught by a rocket
   * is not a race. The promise below escalates them only as far as it needs.
   */
  let push;
  const early = []; /* bumps that make somebody else lead at half way */
  if (story === 'wire') {
    push = part(W, 0.22, 0.16, 0.1);
    part(R, rng.range(0.72, 0.85), 0.12, rng.range(0.06, 0.12));
  } else if (story === 'surge') {
    early.push(part(R, 0.2, 0.16, 0.12));
    part(R, 0.78, 0.14, -0.08);
    early.push(part(W, 0.2, 0.15, -0.05));
    push = part(W, 0.8, 0.15, 0.16);
  } else if (story === 'comeback') {
    early.push(part(W, 0.17, 0.14, -0.12));
    push = part(W, 0.7, 0.2, 0.12);
    early.push(part(R, 0.2, 0.15, 0.08));
  } else {
    early.push(part(R, 0.2, 0.16, 0.12));
    const dip = rng.range(0.7, 0.84);
    part(R, dip, 0.05, -0.4);
    wobble.push({ index: rival, at: dip * scale - 0.2, amount: 0.6 });
    push = part(W, 0.8, 0.15, 0.14);
  }

  const solveAll = () => {
    for (const c of curves) {
      c.solve(line);
    }
    return curves.every((c) => c.k > 0 && Number.isFinite(c.k));
  };
  if (!solveAll()) {
    return null;
  }

  /*
   * The promise, and how to repair a broken one. Wire to wire has the winner
   * first at half way, by at least 3 m, which is a lead and not a hair. Every
   * other story has somebody else first at half way with the winner at least
   * 4 m behind, and the lead changing hands in the last third. There are
   * three ways to break it and each has its own repair: the winner is not
   * clear enough at half way (push her start, or push the early bumps that
   * take it from her), the lead does not change in the last third because
   * she passed too early (soften her push and move it later, because making
   * it stronger, the obvious thing, only makes her pass sooner), or because
   * she has not caught the leader (make her push stronger).
   */
  let ok = false;
  for (let tries = 0; tries < 12; tries += 1) {
    const now = kept(story, curves, line, scale, winner);
    if (now.holds) {
      ok = true;
      break;
    }
    if (story === 'wire') {
      grow(push, 1.3);
    } else if (now.half.index === winner || now.half.gap < TRAIL) {
      for (const b of early) {
        grow(b, 1.25);
      }
      if (tries === 6) {
        W.add(0.16 * scale, 0.12 * scale, -0.1);
      }
    } else if (now.third.first === winner) {
      push.t0 = Math.min(push.t0 + 0.05 * scale, 1.02 * scale - push.w);
      grow(push, 0.95);
    } else {
      grow(push, 1.2);
    }
    if (!solveAll()) {
      return null;
    }
  }
  return { rival, wobble, ok };
}

/*
 * Keep every quad's speed along the line inside what a five inch can fly,
 * and soften only what breaks it. The speed is found at its worst and the
 * bumps that are acting at that moment are the ones that shrink, a fifth at a
 * time: a dip that drops below the floor is made shallower, and the early
 * lead the same quad was given a minute before is left alone. Shrinking all of
 * a quad's bumps together, which this used to do, took the lead away with the
 * dip. The band is narrower than the brief's 12 to 36 m/s, see LINE_BAND.
 */
function fitBand(curve, line, lo, hi) {
  for (let pass = 0; pass < 40; pass += 1) {
    let min = 1e18;
    let max = -1e18;
    let atMin = 0;
    let atMax = 0;
    for (let t = LAUNCH; t <= curve.finish + TAIL; t += 0.05) {
      const v = curve.v(t);
      if (v < min) {
        min = v;
        atMin = t;
      }
      if (v > max) {
        max = v;
        atMax = t;
      }
    }
    if (min >= lo && max <= hi) {
      return true;
    }
    const [when, sign] = min < lo ? [atMin, -1] : [atMax, 1];
    let touched = false;
    for (const b of curve.bumps) {
      if (b.A * sign > 0 && Math.abs(when - b.t0) < b.w) {
        b.A *= 0.85;
        touched = true;
      }
    }
    if (!touched) {
      /* Nothing at that moment is a bump: it is the quad's own cruise, which no softening can fix. */
      return false;
    }
    curve.solve(line);
  }
  return false;
}

/*
 * Everything the speed curves and the storyline decide, before anything is
 * said about lanes. Returns null for an attempt that could not keep its
 * promise, and the caller makes another.
 */
function buildCurves(order, length, laps, course, rng, force) {
  const n = order.length;
  const grid = course.grid(n);
  const line = laps * course.lap;
  const { photo, story } = force;
  const finish = finishingTimes(order, length, rng, photo);
  const curves = grid.map((cell, i) => new Curve(cell.s0, finish[i]));
  const dressed = force.plain ? { rival: order[Math.min(1, n - 1)], wobble: [] } : dress(curves, order, finish, line, story, rng);
  if (!dressed) {
    return null;
  }
  if (force.plain) {
    for (const c of curves) {
      c.solve(line);
    }
  }
  for (const c of curves) {
    if (!fitBand(c, line, LINE_BAND.min, LINE_BAND.max)) {
      return null;
    }
  }
  /* Shrinking bumps to fit the band can undo a promise, so it is asked again. */
  const holds = force.plain || kept(story, curves, line, finish[order[0]], order[0]).holds;
  return { curves, finish, story: force.plain ? 'plain' : story, photo, rival: dressed.rival, wobble: dressed.wobble, kept: holds, grid, line };
}

/* ------------------------------------------------------------------ */
/* The cross section: the lane planner                                 */
/* ------------------------------------------------------------------ */

const PER_STEP = Math.round(LANE_STEP * HZ);

/* A quad's s at 60 Hz, for as many frames as the lanes will be planned over. */
function tabulate(curves, frames) {
  return curves.map((c) => {
    const s = new Float64Array(frames);
    for (let f = 0; f < frames; f += 1) {
      s[f] = c.s(f / HZ);
    }
    return s;
  });
}

/*
 * Where a path puts a quad across the track at time t, with its rates. The
 * path is two arrays, the lane and the level at the start of every step, and
 * inside a step the quad moves between the two slots on a minimum jerk path,
 * so it starts and stops every lane change at rest. Step 0 starts on the
 * block, at level -1, and the last step is held for ever.
 */
function crossAt(course, path, t, out) {
  const last = path.a.length - 2;
  let k = Math.floor(t / LANE_STEP);
  let tau;
  if (k < 0) {
    k = 0;
    tau = 0;
  } else if (k > last) {
    k = last;
    tau = 1;
  } else {
    tau = (t - k * LANE_STEP) / LANE_STEP;
  }
  const u0 = course.laneU(path.a[k]);
  const u1 = course.laneU(path.a[k + 1]);
  const h0 = course.levelH(path.b[k]);
  const h1 = course.levelH(path.b[k + 1]);
  const f = jerk(tau);
  const f1 = jerkRate(tau) / LANE_STEP;
  const f2 = jerkAccel(tau) / (LANE_STEP * LANE_STEP);
  out.u = u0 + (u1 - u0) * f;
  out.h = h0 + (h1 - h0) * f;
  out.du = (u1 - u0) * f1;
  out.dh = (h1 - h0) * f1;
  out.ddu = (u1 - u0) * f2;
  out.ddh = (h1 - h0) * f2;
  return out;
}

/*
 * One quad's path through the lattice, by dynamic programming over steps. A
 * state is a slot, a lane and a level. In each step the quad stays or moves
 * to a neighbouring slot, a lane or a level or both, and a lane change takes
 * a whole step, so it never asks more than about a g of the aircraft.
 *
 * For the first HOLD_STEPS steps it keeps its lane, whatever else it does.
 *
 * What it must not do is come within PLAN_DISTANCE of a quad that is already
 * planned, at any moment the two are close along the line. That is checked
 * against the planned quad's own table, sample by sample, for the moving
 * positions of both, so it is the same predicate the final check applies,
 * only stricter. What it would like to do is stay where it is, and drift to its
 * preferred level, in that order of strength.
 *
 * It returns null if the lattice left it no way through.
 */
function planLanes(index, ctx) {
  const { course, S, planned, U, H, steps, rng, prefer, start } = ctx;
  const lanes = course.lanes;
  const levels = course.levels;
  const slots = lanes * levels;
  const INF = 1e18;
  const laneU = Array.from({ length: lanes }, (_, a) => course.laneU(a));
  const levelH = Array.from({ length: levels }, (_, b) => course.levelH(b));
  const blockH = course.levelH(-1);
  const profile = Array.from({ length: PER_STEP + 1 }, (_, m) => jerk(m / PER_STEP));
  const mine = S[index];
  const limit2 = PLAN_DISTANCE * PLAN_DISTANCE;

  /* Every sampled moment in every step at which a planned quad is close enough along the line to matter. */
  const lists = Array.from({ length: steps }, (_, step) => {
    const list = [];
    const from = step * PER_STEP;
    for (const j of planned) {
      const theirs = S[j];
      /* Two quads cannot close more than REACH metres on each other in a step, so one further than that at the start of it is out of the question. */
      if (Math.abs(mine[from] - theirs[from]) > REACH) {
        continue;
      }
      for (let m = 0; m <= PER_STEP; m += PLAN_STRIDE) {
        const gap = (mine[from + m] - theirs[from + m]) * WORLD_FACTOR;
        if (gap * gap < limit2) {
          list.push({ m, gap2: gap * gap, u: U[j][from + m], h: H[j][from + m] });
        }
      }
    }
    return list;
  });

  const clear = (list, u0, h0, u1, h1) => {
    for (const c of list) {
      const p = profile[c.m];
      const du = u0 + (u1 - u0) * p - c.u;
      const dh = h0 + (h1 - h0) * p - c.h;
      if (c.gap2 + du * du + dh * dh < limit2) {
        return false;
      }
    }
    return true;
  };

  const finish = (a, b) => {
    const path = { a: new Int8Array(steps + 1), b: new Int8Array(steps + 1), start };
    path.a.set(a);
    path.b.set(b);
    return path;
  };

  /*
   * The plain path: climb in the grid lane, drift up to the preferred level
   * one level a step, and stay. Most quads never meet anybody who matters,
   * and for them the answer is this, without any search.
   */
  {
    const a = new Int8Array(steps + 1).fill(start);
    const b = new Int8Array(steps + 1);
    b[0] = -1;
    for (let k = 1; k <= steps; k += 1) {
      b[k] = Math.min(prefer, k - 1);
    }
    let free = true;
    for (let k = 0; k < steps && free; k += 1) {
      free = !lists[k].length || clear(lists[k], laneU[start], levelH[b[k]], laneU[start], levelH[b[k + 1]]);
    }
    if (free) {
      return finish(a, b);
    }
  }

  const value = Array.from({ length: steps + 1 }, () => new Float64Array(slots).fill(INF));
  const back = Array.from({ length: steps + 1 }, () => new Int16Array(slots).fill(-1));

  /* Step 0 starts on the block: the quad climbs to level 0 in its own lane. */
  if (clear(lists[0], laneU[start], blockH, laneU[start], levelH[0])) {
    value[1][start * levels] = 0.01 * rng.float();
    back[1][start * levels] = -2;
  }
  for (let k = 1; k < steps; k += 1) {
    const list = lists[k];
    const here = value[k];
    const next = value[k + 1];
    const links = back[k + 1];
    const hold = k < HOLD_STEPS;
    for (let slot = 0; slot < slots; slot += 1) {
      const base = here[slot];
      if (base >= INF) {
        continue;
      }
      const a = Math.floor(slot / levels);
      const b = slot % levels;
      for (let da = hold ? 0 : -1; da <= (hold ? 0 : 1); da += 1) {
        const a2 = a + da;
        if (a2 < 0 || a2 >= lanes) {
          continue;
        }
        for (let db = -1; db <= 1; db += 1) {
          const b2 = b + db;
          if (b2 < 0 || b2 >= levels) {
            continue;
          }
          const slot2 = a2 * levels + b2;
          let cost = base + Math.abs(b2 - prefer) * 0.15;
          if (da !== 0 || db !== 0) {
            cost += Math.abs(da) + Math.abs(db) * 0.7 + (da !== 0 && db !== 0 ? 0.3 : 0) + 0.02 * rng.float();
          }
          if (cost >= next[slot2]) {
            continue;
          }
          if (list.length && !clear(list, laneU[a], levelH[b], laneU[a2], levelH[b2])) {
            continue;
          }
          next[slot2] = cost;
          links[slot2] = slot;
        }
      }
    }
  }

  let end = -1;
  let best = INF;
  for (let slot = 0; slot < slots; slot += 1) {
    if (value[steps][slot] < best) {
      best = value[steps][slot];
      end = slot;
    }
  }
  if (end < 0) {
    /* Say where the frontier died, which is the step at which every state was blocked. */
    for (let k = 1; k <= steps; k += 1) {
      if (value[k].every((v) => v >= INF)) {
        ctx.failure = { index, step: k, at: k * LANE_STEP };
        break;
      }
    }
    return null;
  }
  const a = new Int8Array(steps + 1);
  const b = new Int8Array(steps + 1);
  a[0] = start;
  b[0] = -1;
  let slot = end;
  for (let k = steps; k >= 1; k -= 1) {
    a[k] = Math.floor(slot / levels);
    b[k] = slot % levels;
    slot = back[k][slot];
    if (k > 1 && slot < 0) {
      return null;
    }
  }
  return finish(a, b);
}

/* A path's u and h at every 60 Hz frame, for the quads planned after it to keep clear of. Step by step, because inside a step it is one minimum jerk move. */
function tabulatePath(course, path, frames) {
  const u = new Float64Array(frames);
  const h = new Float64Array(frames);
  const last = path.a.length - 2;
  const profile = Array.from({ length: PER_STEP + 1 }, (_, m) => jerk(m / PER_STEP));
  for (let k = 0; k <= last; k += 1) {
    const u0 = course.laneU(path.a[k]);
    const u1 = course.laneU(path.a[k + 1]);
    const h0 = course.levelH(path.b[k]);
    const h1 = course.levelH(path.b[k + 1]);
    for (let m = 0; m <= PER_STEP; m += 1) {
      const f = k * PER_STEP + m;
      if (f < frames) {
        u[f] = u0 + (u1 - u0) * profile[m];
        h[f] = h0 + (h1 - h0) * profile[m];
      }
    }
  }
  /* The last step is held for ever, which is the whole path for a quad that keeps a slot. */
  for (let f = (last + 1) * PER_STEP + 1; f < frames; f += 1) {
    u[f] = course.laneU(path.a[last + 1]);
    h[f] = course.levelH(path.b[last + 1]);
  }
  return { u, h };
}

/*
 * Plan every quad's lanes, winner first, each against all those before it.
 * Up to nine quads there is one row, so every quad has a lane of its own for
 * the whole race and there is nothing to plan.
 */
function planAllLanes(order, built, course, rng, duration, report) {
  const n = order.length;
  const steps = Math.ceil(duration / LANE_STEP);
  const frames = steps * PER_STEP + 1;
  const S = tabulate(built.curves, frames);
  const U = new Array(n);
  const H = new Array(n);
  const paths = new Array(n);
  const planned = [];
  for (const entry of order) {
    const cell = built.grid[entry];
    const prefer = rng.int(3);
    let path;
    if (n <= course.lanes) {
      path = { a: Int8Array.of(cell.lane, cell.lane, cell.lane), b: Int8Array.of(-1, prefer, prefer), start: cell.lane };
    } else {
      const ctx = { course, S, planned, U, H, steps, rng, prefer, start: cell.lane };
      path = planLanes(entry, ctx);
      if (!path) {
        if (report) {
          report.failure = ctx.failure ? { ...ctx.failure, place: order.indexOf(entry), planned: planned.length } : { place: order.indexOf(entry), planned: planned.length };
        }
        return null;
      }
    }
    const table = tabulatePath(course, path, frames);
    U[entry] = table.u;
    H[entry] = table.h;
    paths[entry] = path;
    planned.push(entry);
  }
  return { paths, S, U, H, frames };
}

/*
 * The fallback: every quad keeps its grid lane and takes the level of its
 * row, so no two quads ever share a slot, whatever their speeds do. It is ugly,
 * because the rows fly at different heights, and it cannot collide.
 */
function fallbackLanes(order, course) {
  const grid = course.grid(order.length);
  return grid.map((cell) => ({
    a: Int8Array.of(cell.lane, cell.lane, cell.lane),
    b: Int8Array.of(-1, cell.row, cell.row),
    start: cell.lane,
  }));
}

/* ------------------------------------------------------------------ */
/* The quick check                                                     */
/* ------------------------------------------------------------------ */

/*
 * The generator checks its own work from the tables it already has, before it
 * hands anything back: the order the quads cross the line in and how far
 * apart, that no quad ever goes backwards, how close any two ever are, and
 * how fast any is going. tests/choreo.test.js checks again, from the public
 * sample and pose functions and not from these tables, which is the check
 * that counts. This one only has to be fast, so it can run on every attempt.
 */
function quickCheck(order, built, course, tables, paths, duration) {
  const n = order.length;
  const { curves, finish, line } = built;
  const { S, frames } = tables;
  const reasons = [];

  /* Crossing order and gaps, from the table. */
  const crossing = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const s = S[i];
    let f = 0;
    while (f < frames - 1 && s[f + 1] < line) {
      f += 1;
    }
    crossing[i] = (f + (line - s[f]) / (s[f + 1] - s[f])) / HZ;
  }
  for (let p = 1; p < n; p += 1) {
    const gap = crossing[order[p]] - crossing[order[p - 1]];
    if (gap < (p === 1 ? MIN_GAP_FIRST : MIN_GAP) - 0.004) {
      reasons.push(`places ${p} and ${p + 1} cross ${gap.toFixed(3)} s apart`);
      break;
    }
  }
  void curves;
  void finish;

  /* Progress never goes backwards. */
  for (let i = 0; i < n && !reasons.length; i += 1) {
    for (let f = 1; f < frames; f += 1) {
      if (S[i][f] < S[i][f - 1]) {
        reasons.push(`quad ${i} goes backwards`);
        break;
      }
    }
  }

  /* Distance, by walking the quads in order of progress and comparing each with those just behind it. */
  const sorted = Array.from({ length: n }, (_, i) => i);
  const here = {};
  const near = 2.5;
  for (let f = 0; f < frames && !reasons.length; f += 1) {
    /* From the order of the last frame, which is nearly the order of this one: an insertion sort is a pass over n. */
    for (let x = 1; x < n; x += 1) {
      const item = sorted[x];
      const key = S[item][f];
      let y = x - 1;
      while (y >= 0 && S[sorted[y]][f] < key) {
        sorted[y + 1] = sorted[y];
        y -= 1;
      }
      sorted[y + 1] = item;
    }
    for (let x = 0; x < n; x += 1) {
      const a = sorted[x];
      for (let y = x + 1; y < n; y += 1) {
        const b = sorted[y];
        const gap = S[a][f] - S[b][f];
        if (gap > near) {
          break;
        }
        const dU = tables.U[a][f] - tables.U[b][f];
        const dH = tables.H[a][f] - tables.H[b][f];
        /* The lane factor along the track is never below 0.83, so a pair that is far enough under 0.8 needs no more thought. */
        const rough = gap * 0.8;
        if (rough * rough + dU * dU + dH * dH >= MIN_DISTANCE * MIN_DISTANCE) {
          continue;
        }
        /* Along the track the gap is the gap in s scaled by the lane the pair is flying in: first order in the gap, and exact on a straight. */
        course.at(S[a][f], here);
        const dS = gap * (1 - 0.5 * (tables.U[a][f] + tables.U[b][f]) * here.kappa);
        if (dS * dS + dU * dU + dH * dH < MIN_DISTANCE * MIN_DISTANCE) {
          reasons.push(`quads ${a} and ${b} are ${Math.sqrt(dS * dS + dU * dU + dH * dH).toFixed(2)} m apart at ${(f / HZ).toFixed(2)} s`);
          break;
        }
      }
      if (reasons.length) {
        break;
      }
    }
  }

  /*
   * Speed along the line, after the launch, from the differences between
   * frames. A lane factor of 0.83 to 1.17 turns that into the speed in the
   * world, so a line speed between 14.6 and 30.5 is a world speed inside the
   * band, and anything outside it a little way is a bug and not a bend.
   * tests/choreo.test.js measures the world speed itself.
   */
  const first = Math.ceil((LAUNCH + 0.1) * HZ);
  for (let i = 0; i < n && !reasons.length; i += 1) {
    const s = S[i];
    for (let f = first; f < frames; f += 1) {
      const v = (s[f] - s[f - 1]) * HZ;
      if (v < LINE_BAND.min - 0.8 || v > LINE_BAND.max + 1.2) {
        reasons.push(`quad ${i} runs along the line at ${v.toFixed(1)} m/s at ${(f / HZ).toFixed(2)} s`);
        break;
      }
    }
  }
  void paths;
  void duration;
  return reasons;
}

/* ------------------------------------------------------------------ */
/* The plan                                                            */
/* ------------------------------------------------------------------ */

function seedHex(showSeed) {
  if (typeof showSeed === 'string') {
    return showSeed.toLowerCase();
  }
  return Array.from(showSeed, (b) => b.toString(16).padStart(2, '0')).join('');
}

function assemble(order, length, laps, course, built, paths, attempt, fallback, tried, switched) {
  const n = order.length;
  const { curves, finish, grid } = built;
  const place = new Int16Array(n);
  order.forEach((entry, p) => {
    place[entry] = p;
  });
  let last = 0;
  for (const t of finish) {
    last = Math.max(last, t);
  }
  const duration = last + TAIL;
  const winnerEntry = order[0];
  const wobbles = built.wobble;

  const xs = {};
  const cs = {};
  const ss = {};
  /* A quad's place on the line and across it at time t: s, u, h and their first two derivatives. */
  function sample(i, t, out = {}) {
    const curve = curves[i];
    out.s = curve.s(t);
    out.ds = curve.v(t);
    out.dds = curve.a(t);
    crossAt(course, paths[i], t, xs);
    out.u = xs.u;
    out.h = xs.h;
    out.du = xs.du;
    out.dh = xs.dh;
    out.ddu = xs.ddu;
    out.ddh = xs.ddh;
    return out;
  }

  /* Where a quad is on the line, across it and up, and nothing else: the cheap half of sample. */
  function locate(i, t, out = {}) {
    out.s = curves[i].s(t);
    crossAt(course, paths[i], t, xs);
    out.u = xs.u;
    out.h = xs.h;
    return out;
  }

  /*
   * A quad in the world at time t, in the course's frame (metres, Z up): its
   * position, velocity and acceleration, the thrust axis (acceleration minus
   * gravity, normalised), the heading it points along (the velocity, flat),
   * and the two extra rotations a storyline can ask for.
   *
   * With T the heading of the line and N its left normal, T' = kappa N and
   * N' = -kappa T, and a point is c(s) + u N + h Z. Its velocity is
   * w T + u' N with w = s' (1 - u kappa), and its acceleration is
   * (w' - u' kappa s') T + (w kappa s' + u'') N + h'' Z.
   */
  function pose(i, t, out = {}) {
    sample(i, t, ss);
    course.place(ss.s, ss.u, ss.h, cs);
    const c = cs.tx;
    const sn = cs.ty;
    const kappa = cs.kappa;
    const w = ss.ds * (1 - ss.u * kappa);
    const wRate = ss.dds * (1 - ss.u * kappa) - ss.ds * (ss.du * kappa + ss.u * cs.dkappa * ss.ds);
    const alongA = wRate - ss.du * kappa * ss.ds;
    const acrossA = w * kappa * ss.ds + ss.ddu;
    out.x = cs.x;
    out.y = cs.y;
    out.z = cs.z;
    out.vx = w * c - ss.du * sn;
    out.vy = w * sn + ss.du * c;
    out.vz = ss.dh;
    out.ax = alongA * c - acrossA * sn;
    out.ay = alongA * sn + acrossA * c;
    out.az = ss.ddh;
    out.speed = Math.sqrt(out.vx * out.vx + out.vy * out.vy + out.vz * out.vz);
    const gz = out.az + GRAVITY;
    const norm = Math.sqrt(out.ax * out.ax + out.ay * out.ay + gz * gz);
    out.tx = out.ax / norm;
    out.ty = out.ay / norm;
    out.tz = gz / norm;
    const flat = Math.sqrt(out.vx * out.vx + out.vy * out.vy);
    out.fx = flat > 1e-6 ? out.vx / flat : -c;
    out.fy = flat > 1e-6 ? out.vy / flat : -sn;
    out.s = ss.s;
    out.u = ss.u;
    out.h = ss.h;
    out.lap = ss.s / course.lap;
    out.wobble = 0;
    for (const wob of wobbles) {
      if (wob.index === i && t >= wob.at && t < wob.at + 1.2) {
        const q = (t - wob.at) / 1.2;
        out.wobble = wob.amount * (1 - q) * (1 - q) * sinPi(6 * q);
      }
    }
    out.flip = 0;
    if (i === winnerEntry && t >= finish[i] && t < finish[i] + FLIP) {
      out.flip = 2 * PI * jerk((t - finish[i]) / FLIP);
    }
    return out;
  }

  const progress = new Float64Array(n);
  const scratch = Array.from({ length: n }, (_, i) => i);
  /* Entries by current progress, leader first, written into `out`. */
  function rank(t, out = new Array(n)) {
    for (let i = 0; i < n; i += 1) {
      progress[i] = curves[i].s(t);
      scratch[i] = i;
    }
    scratch.sort((a, b) => progress[b] - progress[a]);
    for (let p = 0; p < n; p += 1) {
      out[p] = scratch[p];
    }
    return out;
  }

  return Object.freeze({
    count: n,
    order: Array.from(order),
    place,
    length,
    laps,
    course,
    line: built.line,
    grid,
    finish,
    duration,
    story: built.story,
    photo: built.photo,
    rival: built.rival,
    kept: built.kept,
    attempt,
    fallback,
    switched,
    tried,
    wobbles,
    sample,
    locate,
    pose,
    rank,
    curves,
    paths,
  });
}

/*
 * Make the plan. `order` is the draw: order[0] is the index of the entry that
 * wins. Every attempt is made from a seed derived from the show seed and the
 * attempt number, checked, and kept only if it holds; the first that does is
 * returned, and if none does the fallback is. Options are for tests and
 * charts: `storyline` and `photo` force what is otherwise drawn from the
 * seed, and `attempts` bounds the tries.
 */
export function makePlan(options) {
  const { order, showSeed, length = 30, course = makeCourse() } = options;
  const n = order.length;
  if (n < 2 || n > 50) {
    throw new RangeError('A plan needs 2 to 50 quads.');
  }
  const laps = LAPS[length];
  if (!laps) {
    throw new RangeError('A race is 15, 30 or 60 seconds.');
  }
  const seen = new Set(order);
  if (seen.size !== n || Array.from(seen).some((v) => !Number.isInteger(v) || v < 0 || v >= n)) {
    throw new RangeError('The order has to name every entry from 0 to N - 1 once.');
  }
  if (!/^[0-9a-f]{64}$/i.test(seedHex(showSeed))) {
    throw new RangeError('The show seed is 32 bytes, as 64 hexadecimal digits.');
  }
  const seed = seedHex(showSeed);
  const attempts = options.attempts === undefined ? MAX_ATTEMPTS : options.attempts;
  /*
   * The story and the photo finish are drawn once, from streams of their
   * own, and a retry only varies the details. If every attempt drew them
   * afresh, the retries would bias both toward whatever is easiest to
   * satisfy: wire to wire is, and it was 26 per cent of races against a
   * weight of 22.
   */
  const drawn = options.storyline || chooseStory(makeRng(seed, 'story'));
  const photo = options.photo === undefined ? makeRng(seed, 'photo').chance(0.38) : options.photo;
  const tried = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const rng = makeRng(seed, `plan/${attempt}`);
    const switched = !options.storyline && attempt >= SWITCH_AFTER && drawn !== 'surge';
    const built = buildCurves(order, length, laps, course, rng, { story: switched ? 'surge' : drawn, photo });
    if (!built) {
      tried.push('curves');
      continue;
    }
    if (!built.kept && attempt < attempts - 1) {
      tried.push('story');
      continue;
    }
    let last = 0;
    for (const t of built.finish) {
      last = Math.max(last, t);
    }
    const report = {};
    const lanes = planAllLanes(order, built, course, makeRng(seed, `lanes/${attempt}`), last + TAIL, report);
    if (!lanes) {
      const f = report.failure || {};
      tried.push(`lanes: place ${f.place} of ${n}, ${f.planned} planned before it, blocked at ${f.at === undefined ? '?' : f.at.toFixed(1)} s`);
      continue;
    }
    const reasons = quickCheck(order, built, course, lanes, lanes.paths, last + TAIL);
    if (reasons.length) {
      tried.push(reasons[0]);
      continue;
    }
    return assemble(order, length, laps, course, built, lanes.paths, attempt, false, tried, switched);
  }
  /* Nothing held: the plain race, in one slot per quad. */
  const rng = makeRng(seed, 'plan/fallback');
  const built = buildCurves(order, length, laps, course, rng, { story: drawn, photo, plain: true });
  return assemble(order, length, laps, course, built, fallbackLanes(order, course), attempts, true, tried, false);
}

/*
 * What a plan actually does, measured from its public sample function and
 * the course alone, and not from anything the generator keeps for itself:
 * when each quad crosses the line, whether progress ever goes backwards, how
 * fast any quad is going in the world, how close any two ever come, and the
 * three things the brief wants of the drama. tests/choreo.test.js asserts on
 * this, and tools/race-chart.html prints it, so the page and the checks
 * cannot be looking at different races.
 *
 * Speed is the difference between world positions a frame apart, and the
 * distance is the plain distance between world positions, so neither leans on
 * the lane arithmetic the planner used.
 */
export function measure(plan, options = {}) {
  const { course, count: n, order, line } = plan;
  const dt = 1 / (options.hz || HZ);
  const frames = Math.floor(plan.duration / dt) + 1;
  /* Frame major, so that a pass over the quads of one frame reads one stretch of memory. */
  const px = new Float64Array(frames * n);
  const py = new Float64Array(frames * n);
  const pz = new Float64Array(frames * n);
  const ps = new Float64Array(frames * n);
  const at = {};
  const where = {};
  for (let f = 0; f < frames; f += 1) {
    for (let i = 0; i < n; i += 1) {
      plan.locate(i, f * dt, at);
      course.place(at.s, at.u, at.h, where);
      const k = f * n + i;
      px[k] = where.x;
      py[k] = where.y;
      pz[k] = where.z;
      ps[k] = at.s;
    }
  }

  /* When each quad is at the line, to a microsecond, by bisection on s. */
  const crossing = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    let lo = 0;
    let hi = plan.duration;
    for (let k = 0; k < 45; k += 1) {
      const mid = (lo + hi) / 2;
      plan.locate(i, mid, at);
      if (at.s >= line) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    crossing[i] = hi;
  }
  let orderOk = true;
  let minFirst = Infinity;
  let minOther = Infinity;
  for (let p = 1; p < n; p += 1) {
    const gap = crossing[order[p]] - crossing[order[p - 1]];
    if (gap <= 0) {
      orderOk = false;
    }
    if (p === 1) {
      minFirst = gap;
    } else {
      minOther = Math.min(minOther, gap);
    }
  }

  let backwards = 0;
  let minSpeed = Infinity;
  let maxSpeed = 0;
  const first = Math.ceil((LAUNCH + 0.1) / dt);
  for (let f = 1; f < frames; f += 1) {
    for (let i = 0; i < n; i += 1) {
      const k = f * n + i;
      const j = k - n;
      if (ps[k] < ps[j]) {
        backwards += 1;
      }
      if (f >= first) {
        const dx = px[k] - px[j];
        const dy = py[k] - py[j];
        const dz = pz[k] - pz[j];
        const v = Math.sqrt(dx * dx + dy * dy + dz * dz) / dt;
        minSpeed = v < minSpeed ? v : minSpeed;
        maxSpeed = v > maxSpeed ? v : maxSpeed;
      }
    }
  }

  /* The closest any two quads ever are, in the world, found by walking the quads in order of progress and stopping when the gap in s is too big to matter. */
  let minDistance = Infinity;
  let closest = null;
  const sorted = Array.from({ length: n }, (_, i) => i);
  for (let f = 0; f < frames; f += 1) {
    const base = f * n;
    for (let x = 1; x < n; x += 1) {
      const item = sorted[x];
      const key = ps[base + item];
      let y = x - 1;
      while (y >= 0 && ps[base + sorted[y]] < key) {
        sorted[y + 1] = sorted[y];
        y -= 1;
      }
      sorted[y + 1] = item;
    }
    for (let x = 0; x < n; x += 1) {
      const a = base + sorted[x];
      for (let y = x + 1; y < n; y += 1) {
        const b = base + sorted[y];
        if (ps[a] - ps[b] > 6) {
          break;
        }
        const dx = px[a] - px[b];
        const dy = py[a] - py[b];
        const dz = pz[a] - pz[b];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < minDistance * minDistance) {
          minDistance = Math.sqrt(d2);
          closest = { a: sorted[x], b: sorted[y], t: f * dt };
        }
      }
    }
  }

  const drama = dramaOf(plan, crossing[order[0]]);
  return {
    crossing,
    orderOk,
    minFirst,
    minOther,
    backwards,
    minSpeed,
    maxSpeed,
    minDistance,
    closest,
    winnerTime: crossing[order[0]],
    winnerRatio: crossing[order[0]] / plan.length,
    laps: line / course.lap,
    ...drama,
    margin: n > 1 ? crossing[order[1]] - crossing[order[0]] : 0,
  };
}

/*
 * The three things the brief wants of the drama, from the curves alone, which
 * is why a thousand plans can be checked for them in a few seconds: whether
 * the winner is first when anybody reaches half the distance, how many times
 * the lead changes hands in the last third, and the winning margin.
 */
export function dramaOf(plan, winnerTime = plan.finish[plan.order[0]]) {
  const { order, line, curves } = plan;
  const winner = order[0];
  const limit = plan.finish[winner] * 3;
  return {
    leadsAtHalf: halfLeader(curves, line, limit) === winner,
    finalThirdChanges: finalThirdChanges(curves, line, winnerTime),
    margin: plan.count > 1 ? plan.finish[order[1]] - plan.finish[winner] : 0,
  };
}

/* The parts of the generator that tests and tools take apart. Not for the page. */
export const internals = Object.freeze({
  Curve, buildCurves, planLanes, planAllLanes, quickCheck, tabulate, tabulatePath, crossAt, fallbackLanes,
  finishingTimes, halfLeader, finalThirdChanges, halfState, lastThird, kept, PER_STEP, LANE_STEP, HZ, PLAN_DISTANCE,
});
