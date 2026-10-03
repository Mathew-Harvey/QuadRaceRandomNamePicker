/*
 * serve.js: a static file server for local development, with no
 * dependencies, because the page it serves has none either.
 *
 * ES modules will not load from file://, so the picker needs a server even
 * though it is a pile of static files. This is that server and nothing more:
 * it does not watch, it does not reload and it does not build.
 *
 * The handler is exported on its own because scripts/shots.js serves the
 * page to a headless browser through it. A capture taken off a second
 * server with its own idea of a MIME type is a capture of a different page:
 * an SVG sent as octet-stream is an empty box in an <img>, and a module sent
 * as text/plain is a page that never starts.
 *
 * Everything is no-store, so a page you are editing is the page you load.
 * GitHub Pages will not do that for you, which is why the `?v=` rule in
 * CLAUDE.md exists for the day the picker is mounted behind an edge cache.
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

import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.py', 'text/plain; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

/*
 * The handler. A directory is its index.html, as GitHub Pages serves it,
 * and a path that escapes the repository is refused whatever it says.
 */
export async function handle(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) {
      rel += 'index.html';
    }
    const want = resolve(join(ROOT, rel));
    if (want !== ROOT && !want.startsWith(ROOT + sep)) {
      res.writeHead(403, { 'content-type': 'text/plain' }).end('no');
      return;
    }
    /* A symlink inside the tree must not lead out of it either. */
    const real = await realpath(want);
    if (real !== ROOT && !real.startsWith(ROOT + sep)) {
      res.writeHead(403, { 'content-type': 'text/plain' }).end('no');
      return;
    }
    const body = await readFile(real);
    res.writeHead(200, {
      'content-type': TYPES.get(extname(real).toLowerCase()) || 'application/octet-stream',
      'cache-control': 'no-store',
    }).end(body);
  } catch (e) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('404');
  }
}

/* A listening server, on an ephemeral port when asked for port 0. */
export function listen(port = 0, host = '127.0.0.1') {
  return new Promise((done, fail) => {
    const server = http.createServer((req, res) => {
      handle(req, res);
    });
    server.once('error', fail);
    server.listen(port, host, () => done(server));
  });
}

/*
 * Run, it listens. Imported, it only hands over the handler. Both sides go
 * through realpath, because Node resolves the module it runs through
 * symlinks and process.argv[1] is whatever the shell was given.
 */
async function main() {
  const port = Number(process.env.PORT || 8090);
  const host = process.env.HOST || '127.0.0.1';
  const server = await listen(port, host);
  const { port: bound } = server.address();
  console.log(`serving ${ROOT}`);
  console.log(`http://${host === '0.0.0.0' ? 'localhost' : host}:${bound}/`);
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && (await realpath(resolve(process.argv[1])).catch(() => '')) === (await realpath(self))) {
  main().catch((e) => {
    console.error(`serve: ${e.message}`);
    process.exit(1);
  });
}
