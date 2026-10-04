/*
 * sponsors.js: the marks a person drops on the page, and what becomes of them.
 *
 * Up to four logos, as PNG, JPEG, WebP, SVG or GIF (its first frame), up to
 * 10 MB each, read in the page and never uploaded: there is no server to
 * upload them to and the Content-Security-Policy would refuse the request.
 * Each has a placement, boards, grass or both, and both is the default.
 *
 * WHAT HAPPENS TO ONE. It is decoded onto a canvas no bigger than 1600
 * pixels a side, and its transparent margins are trimmed, because a logo
 * with a margin of nothing round it paints smaller than it was drawn. What is
 * left is the board image at full size. A logo with no transparency at all
 * (a JPEG in a white box) would sit on a board as a sticker on a sticker, so
 * it comes with the colour of its own border and the board is painted that
 * colour, and the box disappears into it.
 *
 * THE GRASS TAKES THE MARK AS DRAWN. It is not stretched, fitted to a box or
 * encoded to fit a document: src/spray.js lays it on the grass afresh every
 * frame for the camera that is looking, in its own shape, and src/marks.js
 * is the meshes. All the grass needs from here is the picture, at a size a
 * graphics card is glad of, and its width over its height.
 *
 * WHAT IS KEPT is a smaller copy, 640 pixels a side, as a data URL in the
 * store, so a reload brings the marks back. The pure parts (trimming, opacity,
 * the border colour) take plain pixel arrays and are held by tests in Node;
 * the rest needs a canvas.
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

export const SLOTS = 4;
export const MAX_BYTES = 10 * 1024 * 1024;
export const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
export const PLACEMENTS = ['both', 'boards', 'grass'];

/* The most a decoded mark is kept at, the most the kept copy is, and the most the grass's copy is: a mark is at most 10 m across, which a thousand pixels does at a centimetre each. */
const WORK = 1600;
const KEPT = 640;
const GRASS = 1024;

/* ------------------------------------------------------------------ */
/* Pixels                                                              */
/* ------------------------------------------------------------------ */

/*
 * The box that holds everything that is not transparent, as { x, y, w, h },
 * or null if there is nothing there. `rgba` is the canvas's own byte order.
 */
export function trimBounds(rgba, w, h, threshold = 10) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (rgba[(y * w + x) * 4 + 3] > threshold) {
        if (x < x0) {
          x0 = x;
        }
        if (x > x1) {
          x1 = x;
        }
        if (y < y0) {
          y0 = y;
        }
        y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/* True when no pixel is noticeably transparent: a photograph, a JPEG, a logo drawn on its own background. */
export function isOpaque(rgba, w, h) {
  const n = w * h;
  let thin = 0;
  for (let i = 0; i < n; i += 1) {
    if (rgba[i * 4 + 3] < 250) {
      thin += 1;
    }
  }
  /* A hair of antialiasing at a corner is not transparency; a tenth of one per cent is. */
  return thin <= n * 0.001;
}

/* The colour of the outermost two pixels all the way round, as '#rrggbb': what a board is painted when the mark is a box. */
export function borderColour(rgba, w, h) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const take = (x, y) => {
    const i = (y * w + x) * 4;
    r += rgba[i];
    g += rgba[i + 1];
    b += rgba[i + 2];
    n += 1;
  };
  const ring = Math.min(2, Math.floor(Math.min(w, h) / 2));
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (x < ring || y < ring || x >= w - ring || y >= h - ring) {
        take(x, y);
      }
    }
  }
  const hex = (v) => Math.round(v / Math.max(1, n)).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/* ------------------------------------------------------------------ */
/* Canvases                                                            */
/* ------------------------------------------------------------------ */

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/* A canvas's pixels, read once: the canvas is made to be read, so the browser need not keep it on the GPU. */
function pixelsOf(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

/* An image source drawn to a canvas, scaled so its longer side is at most `max`. */
function drawn(source, sw, sh, max) {
  const k = Math.min(1, max / Math.max(sw, sh));
  const c = canvasOf(sw * k, sh * k);
  c.getContext('2d', { willReadFrequently: true }).drawImage(source, 0, 0, c.width, c.height);
  return c;
}

/* A file decoded to something that can be drawn, and its size. A blob URL and an img element, because createImageBitmap will not take an SVG with no size of its own. */
function decode(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      /* An SVG with no width or height has no natural size; give it a generous one in its own shape. */
      const w = img.naturalWidth || 1200;
      const h = img.naturalHeight || (img.naturalWidth ? img.naturalWidth : 600);
      resolve({ source: img, w, h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file did not open as a picture.'));
    };
    img.src = url;
  });
}

/* A data URL decoded the same way, for the marks a reload brings back. */
function decodeUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ source: img, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('A kept mark did not open.'));
    img.src = url;
  });
}

/* Trim a canvas to what is not transparent. */
function trimmed(canvas) {
  const box = trimBounds(pixelsOf(canvas), canvas.width, canvas.height);
  if (!box) {
    return null;
  }
  if (box.w === canvas.width && box.h === canvas.height) {
    return canvas;
  }
  const out = canvasOf(box.w, box.h);
  out.getContext('2d', { willReadFrequently: true }).drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return out;
}

function finish(canvas, name, placement) {
  const px = pixelsOf(canvas);
  const opaque = isOpaque(px, canvas.width, canvas.height);
  return {
    name,
    placement: PLACEMENTS.includes(placement) ? placement : 'both',
    canvas,
    opaque,
    base: opaque ? borderColour(px, canvas.width, canvas.height) : null,
    aspect: canvas.width / canvas.height,
  };
}

/*
 * A file a person dropped, made into a mark. Throws an Error whose message
 * is the sentence to show them: which kind of file it was not, or how big.
 */
export async function readLogo(file, placement = 'both') {
  if (!file) {
    throw new Error('No file.');
  }
  if (!TYPES.includes(file.type)) {
    throw new Error('A logo is a PNG, JPEG, WebP, SVG or GIF.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`That file is ${(file.size / 1048576).toFixed(1)} MB and the most a logo can be is 10.`);
  }
  const { source, w, h } = await decode(file);
  const full = drawn(source, w, h, WORK);
  const cut = trimmed(full);
  if (!cut) {
    throw new Error('That picture is entirely transparent.');
  }
  return finish(cut, file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Logo', placement);
}

/* What the boards take: the mark's canvas, and the colour of the panel it stands on when it is a box. */
export const boardMark = (logo) => ({ image: logo.canvas, base: logo.base });

/* What the grass takes: the mark as drawn, at most 1024 pixels a side, and its shape. src/spray.js and src/marks.js do the rest. */
export function grassMark(logo) {
  return { image: drawn(logo.canvas, logo.canvas.width, logo.canvas.height, GRASS), aspect: logo.aspect, name: logo.name };
}

/* A small picture of the mark for its slot. */
export function thumbnail(logo, side = 96) {
  const k = Math.min(1, side / Math.max(logo.canvas.width, logo.canvas.height));
  const c = canvasOf(logo.canvas.width * k, logo.canvas.height * k);
  c.getContext('2d').drawImage(logo.canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

/* The mark as the store keeps it: a smaller copy, a name and a placement. */
export function pack(logo) {
  const k = Math.min(1, KEPT / Math.max(logo.canvas.width, logo.canvas.height));
  const c = canvasOf(logo.canvas.width * k, logo.canvas.height * k);
  c.getContext('2d').drawImage(logo.canvas, 0, 0, c.width, c.height);
  let url = c.toDataURL('image/webp', 0.9);
  if (!url.startsWith('data:image/webp')) {
    url = c.toDataURL('image/png');
  }
  return { name: logo.name, placement: logo.placement, url };
}

/* A kept mark, back. Anything that does not decode is dropped by the caller. */
export async function unpack(saved) {
  if (!saved || typeof saved.url !== 'string' || !/^data:image\/(png|webp|jpeg);base64,/.test(saved.url)) {
    throw new Error('Not a kept mark.');
  }
  const { source, w, h } = await decodeUrl(saved.url);
  return finish(drawn(source, w, h, WORK), String(saved.name || 'Logo').slice(0, 40), saved.placement);
}
