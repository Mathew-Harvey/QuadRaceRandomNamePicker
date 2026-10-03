/*
 * sound.js: what the show sounds like, and nothing that plays on its own.
 *
 * THE MOTORS are the simulator's own, `MotorAudio` in sim/src/render/audio.js:
 * four oscillators, one a motor, each at that motor's blade pass frequency,
 * which is the family's quad sound and the reason it reads as a quad and not a
 * drone. They are driven by the leading group's speed, so the pitch the
 * listener hears is the pace of the race, and they spool up under the aerial,
 * run through the race, and spool down after the winner has crossed. A gate
 * click, the simulator's own cue, sounds as the leader crosses the line each
 * lap, and the last is the finish.
 *
 * THE TONES AND THE STING are this app's own: the simulator has no start
 * lights, so the three short amber tones, the long green one and the winner's
 * sting are plain WebAudio oscillators with an envelope each, on a bus of
 * their own that the mute reaches.
 *
 * NEVER THE MUSIC. MotorAudio carries a music player for the simulator's
 * menus and flights, and switched off is not enough: attaching it sets the
 * source of an audio element to the first track of the crate, and the page's
 * Content-Security-Policy, which has no media-src, refuses it on the console
 * every time (found by check 12, the first time a gesture built the graph).
 * The player is replaced, on the instance, by one that does nothing, so no
 * element is made and nothing is asked for. sim/ is not touched: it is this
 * file that says what object the motors' `music` is. The music files are not
 * in this repository either.
 *
 * SILENT UNTIL A GESTURE. A browser will not start sound before the person
 * has done something, so nothing is built until unlock() is called from a
 * pointer press or a key, and a context the browser puts to sleep is asked
 * back by the next one. The mute is a preference: it is kept, and it wins
 * over everything.
 *
 * Every time is the audio clock's, and every function takes the time to
 * schedule at, so that scripts/shots.js can build this exact graph on an
 * OfflineAudioContext, play a scripted show into it and read the buffer, the
 * way the simulator's own probe does. A claim about a mix with no rendered
 * buffer behind it is a claim about nothing, and there is no way to hear this
 * container.
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

import { MotorAudio } from '../sim/src/render/audio.js';

/* The start tones: three short ambers a second apart, and a long green. */
export const TONES = Object.freeze({
  amber: Object.freeze({ hz: 880, seconds: 0.15, level: 0.3 }),
  green: Object.freeze({ hz: 1320, seconds: 0.75, level: 0.34 }),
});

/* The winner's sting: four notes of a rising major arpeggio, the last held. Hz, when (s) and how long (s). */
export const STING = Object.freeze([
  Object.freeze({ hz: 523.25, at: 0, seconds: 0.11 }),
  Object.freeze({ hz: 659.25, at: 0.1, seconds: 0.11 }),
  Object.freeze({ hz: 783.99, at: 0.2, seconds: 0.11 }),
  Object.freeze({ hz: 1046.5, at: 0.3, seconds: 0.62 }),
]);

/*
 * Blade pass frequency is rpm over sixty times three, and the simulator's own
 * flight register is 130 to 430 Hz, which is 2600 to 8600 rpm. The race runs
 * across the upper two thirds of it: 4200 rpm (210 Hz) is a quad spooled up and
 * waiting, and 8600 (430 Hz) is the fastest the planner allows.
 */
export const RPM = Object.freeze({
  idle: 4200, top: 8600, slow: 10, fast: 36, spoolDown: 2.5,
});

/* The music player MotorAudio would make, as an object with every method it calls and no effect. */
const NO_MUSIC = Object.freeze({
  attach() {},
  setLevel() {},
  setEnabled() {},
  pause() {},
  resume() {},
  tick() {},
  duckNow() {},
  setContext() {},
  setTrack() {},
  skip() {},
  status() {
    return { playing: false };
  },
});

/* Four motors never turn at one speed, and the beat between them is what makes a quad sound like one. */
const SPREAD = Object.freeze([1.012, 0.991, 1.021, 0.982]);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* The leading group's speed in metres a second to a motor speed in rpm: linear, from 10 m/s to the planner's fastest. */
export function rpmFor(speed) {
  return RPM.idle + (RPM.top - RPM.idle) * clamp((speed - RPM.slow) / (RPM.fast - RPM.slow), 0, 1);
}

/* One rpm to the four motors', each a little off. */
export const motorRpms = (rpm) => SPREAD.map((k) => rpm * k);

/*
 * The motor speed at race time t: the pace of the leader until she has
 * crossed, and then the same, falling away over a couple of seconds to a
 * stop. Pure, so a test can hold the shape.
 */
export function raceRpm(speed, t, finish) {
  const base = rpmFor(speed);
  if (!(t > finish)) {
    return base;
  }
  return base * clamp(1 - (t - finish) / RPM.spoolDown, 0, 1);
}

/*
 * The sound. `context` is a context to build on, which is for tests (an
 * OfflineAudioContext): a live page passes none and gets one when unlock()
 * is called from a gesture. `muted` is the person's preference.
 */
export function createSound({ context = null, muted = false, onState = null } = {}) {
  let audio = null;
  let ctx = null;
  let bus = null;
  let silenced = muted;
  let unavailable = false;
  const supported = Boolean(context) || (typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext));

  const say = () => {
    if (onState) {
      onState(state());
    }
  };

  /* 'none' for a browser with no audio, 'ready' before a gesture, 'muted', 'blocked' for a context the browser has put to sleep, 'on'. */
  function state() {
    if (!supported || unavailable) {
      return 'none';
    }
    if (silenced) {
      return 'muted';
    }
    if (!ctx) {
      return 'ready';
    }
    return ctx.state === 'running' ? 'on' : 'blocked';
  }

  function build() {
    audio = new MotorAudio();
    audio.music = NO_MUSIC;
    if (context) {
      audio.attach(context);
      audio.enabled = !silenced;
      ctx = context;
    } else {
      audio.start();
      ctx = audio.ctx;
      if (!ctx) {
        unavailable = true;
        audio = null;
        return false;
      }
      audio.setEnabled(!silenced);
    }
    audio.setLevel(0.8);
    /* The music is not off by being quiet: it is off, and this is the second lock on the same door. */
    audio.setMix({ music: 0 });
    bus = ctx.createGain();
    bus.gain.value = silenced ? 0 : 1;
    bus.connect(ctx.destination);
    if (typeof ctx.addEventListener === 'function') {
      ctx.addEventListener('statechange', say);
    }
    return true;
  }

  /* Called from a pointer press or a key: builds the graph the first time, and asks a sleeping context back after that. */
  function unlock() {
    if (!supported || unavailable) {
      return state();
    }
    if (!audio) {
      build();
    } else if (ctx && typeof ctx.resume === 'function' && ctx.state !== 'running' && ctx.state !== 'closed') {
      const p = ctx.resume();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    }
    say();
    return state();
  }

  function setMuted(on) {
    silenced = Boolean(on);
    if (audio) {
      audio.setEnabled(!silenced);
      bus.gain.value = silenced ? 0 : 1;
    }
    say();
  }

  /* The motors, from one rpm and the leading group's speed; `at` is the audio clock's time, and absent it is now. */
  function motors({ rpm, speed }, at) {
    if (audio) {
      audio.update(motorRpms(rpm), speed, at);
    }
  }

  /* Every motor to a stop. */
  function hush(at) {
    motors({ rpm: 0, speed: 0 }, at);
  }

  /* The click of a gate: the simulator's own, as the leader crosses the line. */
  function gate(at) {
    if (audio) {
      audio.event('gate', at);
    }
  }

  /* One voice: an oscillator with an attack, a hold and a release, on the tones' bus. */
  function voice(type, hz, start, seconds, level) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, start);
    const g = ctx.createGain();
    const attack = 0.006;
    const release = Math.min(0.06, seconds / 3);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(level, start + attack);
    g.gain.setValueAtTime(level, start + Math.max(attack, seconds - release));
    g.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(g);
    g.connect(bus);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  /* A start tone, 'amber' or 'green'. */
  function tone(kind, at) {
    if (!audio || !TONES[kind]) {
      return;
    }
    const start = at == null ? ctx.currentTime : at;
    const { hz, seconds, level } = TONES[kind];
    voice('sine', hz, start, seconds, level);
    /* A hair of the octave above, so a plain sine is a tone and not a test signal. */
    voice('triangle', hz * 2, start, seconds, level * 0.18);
  }

  /* The winner's sting. */
  function sting(at) {
    if (!audio) {
      return;
    }
    const start = at == null ? ctx.currentTime : at;
    for (const note of STING) {
      voice('triangle', note.hz, start + note.at, note.seconds, 0.3);
      voice('sine', note.hz * 2, start + note.at, note.seconds, 0.07);
    }
  }

  return {
    supported,
    get state() {
      return state();
    },
    get muted() {
      return silenced;
    },
    get context() {
      return ctx;
    },
    unlock, setMuted, motors, hush, gate, tone, sting,
  };
}
