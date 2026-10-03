/*
 * page.js: one headless Chromium page, driven over the DevTools protocol.
 *
 * It does the six awkward things every browser check here needs and none of
 * them is worth writing twice: start Chromium headless on a software
 * rasteriser, talk to it over a socket, collect the console and the page's
 * errors as they arrive, serve three.js from Node because this container's
 * Chromium does not inherit the outbound proxy, pin the device metrics so a
 * measurement means the same thing on every machine, and seed the page's
 * storage before the first line of the app runs.
 *
 * It speaks the DevTools protocol over Node's own WebSocket, so the project
 * needs no dependency. It is adapted from the simulator's tests/lib/page.js,
 * which is the family's copy of this idea, and written afresh for what the
 * picker asserts: every request the page makes, so that "nothing leaves the
 * page but the request for three.js" is something a check reads off a list
 * and not something a reader takes on trust.
 *
 * The CDN cache is shared with the simulator's tools on purpose. A check
 * that refetched a megabyte of three.js on every run is a check nobody runs.
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

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listen } from '../../scripts/serve.js';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const CACHE = process.env.PICKER_CDN_CACHE || join(tmpdir(), 'webfpv-cdn');

const CHROME_CANDIDATES = [
  process.env.PICKER_CHROME_BIN,
  process.env.SIM_CHROME_BIN,
  '/opt/pw-browsers/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

export function findChrome() {
  return CHROME_CANDIDATES.find((c) => c && existsSync(c)) || null;
}

/* Virtual key codes for the keys the page listens to: Chromium wants one for a key event to look real. */
const KEYS = {
  Enter: 13, Escape: 27, Space: 32, Tab: 9, Backspace: 8, Delete: 46,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
};

export function keyInfo(code) {
  if (/^Key[A-Z]$/.test(code)) {
    const ch = code.slice(3);
    return { key: ch.toLowerCase(), code, windowsVirtualKeyCode: ch.charCodeAt(0), text: ch.toLowerCase() };
  }
  if (/^Digit[0-9]$/.test(code)) {
    const d = code.slice(5);
    return { key: d, code, windowsVirtualKeyCode: d.charCodeAt(0), text: d };
  }
  const text = { Enter: '\r', Space: ' ', Tab: '\t' }[code];
  return { key: code === 'Space' ? ' ' : code, code, windowsVirtualKeyCode: KEYS[code] ?? 0, text };
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    this.dead = null;
    const fail = (e) => {
      if (this.dead) {
        return;
      }
      this.dead = e;
      for (const { reject } of this.pending.values()) {
        reject(e);
      }
      this.pending.clear();
    };
    ws.addEventListener('close', () => fail(new Error('Chromium closed the DevTools connection')));
    ws.addEventListener('error', () => fail(new Error('the DevTools connection errored')));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(`CDP ${msg.error.message}`));
        } else {
          resolve(msg.result);
        }
      } else if (msg.method) {
        for (const l of this.listeners) {
          l(msg);
        }
      }
    });
  }

  send(method, params = {}, sessionId) {
    if (this.dead) {
      return Promise.reject(this.dead);
    }
    const id = this.nextId;
    this.nextId += 1;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  onEvent(fn) {
    this.listeners.push(fn);
  }
}

/* Bytes for a CDN address, from the cache or from the network once. */
async function cdnBytes(url) {
  await mkdir(CACHE, { recursive: true });
  const path = join(CACHE, createHash('sha256').update(url).digest('hex').slice(0, 32));
  if (existsSync(path)) {
    return readFile(path);
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`cdn fetch ${url}: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(path, buf);
  return buf;
}

const describe = (obj) => {
  if (!obj) {
    return 'unknown';
  }
  return obj.type === 'string' ? obj.value : obj.description ?? JSON.stringify(obj.value ?? obj);
};

/*
 * Open the picker in headless Chromium and hand back a driver.
 *
 * `seed` is a list of script sources run on every new document before the
 * app does. That is how stored state gets in: the same door the app reads
 * it through, not a hook that could drift from it.
 */
export async function openPage({
  url = '/index.html',
  width = 1600,
  height = 900,
  touch = false,
  seed = [],
  reducedMotion = false,
  /* Make every request for the CDN fail, as a network that cannot reach it does. */
  block = false,
  /* Start without WebGL, so the path for a browser that has none can be shown. */
  noWebgl = false,
} = {}) {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error('no Chromium found: set PICKER_CHROME_BIN');
  }
  const server = await listen(0);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const userDataDir = await mkdtemp(join(tmpdir(), 'picker-page-'));
  const proc = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    ...(noWebgl ? ['--disable-gpu', '--disable-3d-apis'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required',
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ]);

  let stderr = '';
  const wsUrl = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no DevTools endpoint: ${stderr.slice(-1500)}`)), 30000);
    proc.on('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      const m = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(t);
        resolve(m[1]);
      }
    });
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('the DevTools websocket failed')), { once: true });
  });
  const cdp = new Cdp(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

  const errors = [];
  const warnings = [];
  const requests = [];
  const log = [];
  cdp.onEvent(async (msg) => {
    if (msg.sessionId !== sessionId) {
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map(describe).join(' ');
      log.push(`${msg.params.type}: ${text}`);
      if (msg.params.type === 'error' || msg.params.type === 'assert') {
        errors.push(`console.${msg.params.type}: ${text}`);
      } else if (msg.params.type === 'warning') {
        warnings.push(`console.warning: ${text}`);
      }
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(`uncaught: ${d.exception ? describe(d.exception) : d.text}`);
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error') {
        errors.push(`${e.source}: ${e.text}`);
      } else if (e.level === 'warning') {
        warnings.push(`${e.source}: ${e.text}`);
      }
    } else if (msg.method === 'Network.requestWillBeSent') {
      requests.push(msg.params.request.url);
    } else if (msg.method === 'Fetch.requestPaused') {
      const { requestId, request } = msg.params;
      if (block) {
        await cdp.send('Fetch.failRequest', { requestId, errorReason: 'ConnectionRefused' }, sessionId).catch(() => {});
        return;
      }
      try {
        const body = await cdnBytes(request.url);
        await cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [
            { name: 'content-type', value: 'text/javascript; charset=utf-8' },
            { name: 'access-control-allow-origin', value: '*' },
          ],
          body: body.toString('base64'),
        }, sessionId);
      } catch (e) {
        errors.push(`cdn proxy failed for ${request.url}: ${e.message}`);
        await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }, sessionId).catch(() => {});
      }
    }
  });

  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Log.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Network.enable', {}, sessionId);
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'https://cdn.jsdelivr.net/*' }] }, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: Number(width), height: Number(height), deviceScaleFactor: 1, mobile: touch,
  }, sessionId);
  if (touch) {
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
  }
  if (reducedMotion) {
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  }
  for (const source of seed) {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source }, sessionId);
  }
  await cdp.send('Page.navigate', { url: `${origin}${url}` }, sessionId);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Evaluate and hand back the value. A thrown expression is an error, because every caller is asserting on the answer. */
  async function evaluate(expression) {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(`evaluate threw: ${d.exception ? describe(d.exception) : d.text}`);
    }
    return r.result.value;
  }

  /*
   * Poll until the expression is truthy. A wait in milliseconds is not
   * evidence of anything: on a software rasteriser a frame takes a tenth of
   * a second or more, so a keypress and a fixed wait can read the state
   * BEFORE the key. Every capture asserts its state with this first.
   */
  async function until(expression, timeoutMs = 60000, what = expression) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const ok = await evaluate(expression).catch(() => false);
      if (ok) {
        return;
      }
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for: ${what}`);
      }
      await sleep(100);
    }
  }

  async function tap(code) {
    const info = keyInfo(code);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...info }, sessionId);
    await sleep(30);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...info }, sessionId);
  }

  /* A click at the centre of the first element matching a selector, as a pointer would. */
  async function click(selector) {
    const point = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!point) {
      throw new Error(`nothing matches ${selector}`);
    }
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1 }, sessionId);
    }
  }

  /* Text typed into whatever has focus, one key at a time, as a person types it. */
  async function type(text) {
    for (const ch of text) {
      if (ch === '\n') {
        await tap('Enter');
      } else {
        await cdp.send('Input.insertText', { text: ch }, sessionId);
      }
    }
  }

  /* A PNG of the page, written to a path. */
  async function screenshot(path) {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(data, 'base64'));
    return path;
  }

  async function close() {
    try {
      ws.close();
    } catch (e) {
      /* The socket is already gone: there is nothing to close. */
    }
    proc.kill();
    await new Promise((resolve) => server.close(resolve));
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }

  return {
    cdp, sessionId, errors, warnings, requests, log, origin, proc, root,
    evaluate, until, tap, click, type, screenshot, sleep, close,
  };
}
