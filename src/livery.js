/*
 * livery.js: the colour of each quad, as a pure function of its number.
 *
 * Hues are a golden angle (137.5 degrees) apart at one lightness and one
 * chroma in OKLCH, so neighbours on the grid differ, every colour is as
 * bright as every other, and no colour is the one that quietly reads as the
 * favourite. Fifty quads is fifty hues whose nearest neighbour in hue is
 * never closer than a few degrees, and in practice neighbours in the grid and
 * in the tower, which are consecutive numbers, are 137.5 degrees apart. The
 * colour is a convenience and never the only way to tell two quads apart:
 * each also carries its number and its name.
 *
 * L 0.80 and C 0.13 are the brief's suggestion. They are bright enough to
 * read against the grass and the dark carbon frame, and chromatic enough to
 * read as colours in the cel shader's cool shadow, which pulls every colour
 * toward blue.
 *
 * The same function colours the instance in the 3D world (src/fleet.js), the
 * chip in the timing tower and the gutter beside the names, so a quad, its
 * row and its line of the list agree.
 *
 * This file imports nothing, so it runs in Node, where tests/livery.test.js
 * holds it.
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

export const GOLDEN_ANGLE = 137.5;
export const LIVERY_L = 0.80;
export const LIVERY_C = 0.13;

/* Hue in degrees for entry `i`, from a start that is a warm pink so quad 1 is near the family's sakura. */
export function liveryHue(i) {
  return (350 + i * GOLDEN_ANGLE) % 360;
}

/* OKLCH to linear sRGB, Ottosson's matrices, each channel clamped to the gamut. */
export function oklchToLinear(L, C, hDeg, out = [0, 0, 0]) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const clamp = (x) => Math.min(1, Math.max(0, x));
  out[0] = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  out[1] = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  out[2] = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
  return out;
}

const encode = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);

/* The colour as 0xRRGGBB, in sRGB: what Three.js's Color.setHex and CSS both read. */
export function liveryHex(i) {
  const [r, g, b] = oklchToLinear(LIVERY_L, LIVERY_C, liveryHue(i));
  const byte = (x) => Math.round(encode(x) * 255);
  return (byte(r) << 16) | (byte(g) << 8) | byte(b);
}

/* The same as '#rrggbb'. */
export function liveryCss(i) {
  return `#${liveryHex(i).toString(16).padStart(6, '0')}`;
}
