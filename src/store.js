/*
 * store.js: what this browser remembers, and the draw log.
 *
 * Names, the title, the length, the number of winners, the sponsors' marks,
 * the sound switch and the draw log are kept in localStorage so that closing
 * the tab loses nothing a person typed, and a reload in the middle of a race
 * loses the show and not the result: the draw is written here before the
 * countdown starts.
 *
 * EVERY ACCESS IS IN A TRY AND CATCH, and a failing one is not an error. A
 * browser with storage blocked, a private window, a full quota and a damaged
 * value all throw or answer wrongly in their own way, and in every one the page
 * must work, so a store that cannot reach the storage keeps what it is given
 * in memory for the life of the page and says so (`persistent` is false), and
 * the footer can tell the person that nothing will be remembered. It is never
 * silent and never fatal.
 *
 * It holds data and decides nothing about it: the draw log keeps receipts as
 * the page hands them over, and the page reads them back through
 * parseReceipt, which is what refuses a receipt that has been tampered with
 * in the storage. The store takes the storage as an argument, so that the
 * same code runs in Node under test with a storage that fails on request.
 *
 * Names and logos live in this browser's storage and nowhere else: the page
 * makes no request that could carry them, and the Content-Security-Policy
 * would refuse one.
 *
 * This file imports nothing.
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

const PREFIX = 'webfpv-picker/v1/';

/* The draw log keeps the last fifty draws. */
export const LOG_LIMIT = 50;

/* What "Forget this browser's lists" takes: everything a person typed or dropped. The sound switch is a preference and stays. */
const LISTS = ['names', 'title', 'logos', 'log'];

export function createStore(storage) {
  const memory = new Map();
  /* Keys whose last write did not reach the storage: what memory holds is newer than what the storage does. */
  const unsaved = new Set();
  let persistent = true;
  let failed = null;

  /* Whether the storage can be used at all, found out by using it. */
  try {
    if (!storage) {
      throw new Error('no storage');
    }
    storage.setItem(`${PREFIX}probe`, '1');
    storage.removeItem(`${PREFIX}probe`);
  } catch (e) {
    persistent = false;
    failed = e;
  }

  function read(key) {
    if (!persistent || unsaved.has(key)) {
      return memory.get(key);
    }
    try {
      const raw = storage.getItem(PREFIX + key);
      if (raw === null || raw === undefined) {
        return memory.get(key);
      }
      return JSON.parse(raw);
    } catch (e) {
      /* A value that will not parse is as good as absent. */
      return memory.get(key);
    }
  }

  function write(key, value) {
    memory.set(key, value);
    if (!persistent) {
      return false;
    }
    try {
      storage.setItem(PREFIX + key, JSON.stringify(value));
      unsaved.delete(key);
      return true;
    } catch (e) {
      /* A full quota: what was given is held in memory, and the caller learns it was not kept. */
      failed = e;
      unsaved.add(key);
      return false;
    }
  }

  function remove(key) {
    memory.delete(key);
    unsaved.delete(key);
    if (!persistent) {
      return;
    }
    try {
      storage.removeItem(PREFIX + key);
    } catch (e) {
      failed = e;
    }
  }

  const log = {
    /* Newest first. */
    list() {
      const raw = read('log');
      return Array.isArray(raw) ? raw.filter((r) => r && typeof r === 'object') : [];
    },
    /* Add a receipt at the front, keep the last fifty. Returns whether it reached the storage. */
    add(receipt) {
      const next = [receipt, ...log.list()].slice(0, LOG_LIMIT);
      return write('log', next);
    },
    clear() {
      remove('log');
    },
  };

  return {
    get persistent() {
      return persistent;
    },
    get failure() {
      return failed;
    },
    get: (key, fallback) => {
      const v = read(key);
      return v === undefined ? fallback : v;
    },
    set: write,
    remove,
    log,
    /* Everything a person typed or dropped, gone. */
    forget() {
      for (const key of LISTS) {
        remove(key);
      }
    },
  };
}

/* The page's storage if it has any: asking for it can itself throw, as it does with storage blocked. */
export function pageStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch (e) {
    return null;
  }
}
