/*
 * lens.js: where a point in the world lands on the glass.
 *
 * The simulator's post chain ends in a grade pass that bends the picture like
 * an FPV lens (sim/src/render/post.js, GradeShader): mild barrel distortion,
 * zoom compensated so the corners never sample outside the frame. A tag that
 * is placed over a quad with camera.project alone is placed where the quad
 * would be without that pass, and drifts off it toward the edges of the
 * frame by a few per cent of the window: a name floating beside its quad is
 * worse than no name. So everything on the page that has to sit on something
 * in the world goes through the same bend, and this file is it.
 *
 * THE FORMULA is the shader's. Take an output pixel at centred coordinates s
 * (x and y in -0.5 to 0.5 of the frame, which is what the shader's vUv less a
 * half is). The grade samples the scene at
 *
 *     p = s (1 + d |s|^2) / (1 + d / 2)
 *
 * so a point the scene puts at p is drawn at the s that solves it. The solve
 * is along the radius, a cubic in the distance from the middle, and a few
 * steps of Newton's method find it. `d` is the shader's uDistort, 0.055, and
 * the world passes the live value, so this cannot drift from the shader.
 *
 * The same formula in the other direction is what the results page needs: to
 * put the winner in the middle of a panel that is not the middle of the
 * frame, the scene has to be shifted so that the winner lands, before the
 * bend, where the bend will carry it to the panel.
 *
 * This file imports nothing, so it runs in Node, where tests/lens.test.js
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

/* The shader's own number. */
export const DISTORT = 0.055;

/* Where the scene has to put a point so that the grade pass draws it at s (centred, -0.5 to 0.5). */
export function sceneOf(sx, sy, d = DISTORT, out = {}) {
  const k = (1 + d * (sx * sx + sy * sy)) / (1 + d / 2);
  out.x = sx * k;
  out.y = sy * k;
  return out;
}

/* Where the grade pass draws a point the scene put at p (centred): the solution of sceneOf(s) = p. */
export function glassOf(px, py, d = DISTORT, out = {}) {
  const rp = Math.hypot(px, py) * (1 + d / 2);
  if (rp === 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  /* r + d r^3 = rp, which is increasing in r, so Newton from rp itself converges in a handful of steps. */
  let r = rp;
  for (let i = 0; i < 8; i += 1) {
    const f = r + d * r * r * r - rp;
    r -= f / (1 + 3 * d * r * r);
  }
  const k = r / Math.hypot(px, py);
  out.x = px * k;
  out.y = py * k;
  return out;
}

/*
 * A point in normalised device coordinates (what camera.project gives, x and
 * y in -1 to 1, y up) to the pixel it is drawn at on a W by H frame, y down.
 */
export function pixelOf(ndcX, ndcY, W, H, d = DISTORT, out = {}) {
  const s = glassOf(ndcX / 2, ndcY / 2, d, out);
  const sx = s.x;
  const sy = s.y;
  out.x = (sx + 0.5) * W;
  out.y = (0.5 - sy) * H;
  return out;
}

/*
 * The other way: the pixel a point has to be at before the bend, in the
 * scene's own frame (what camera.project would give), for the grade pass to
 * draw it at pixel (x, y). The results page shifts the camera's window by the
 * difference between this and where the winner is.
 */
export function pixelBeforeBend(x, y, W, H, d = DISTORT, out = {}) {
  const p = sceneOf(x / W - 0.5, 0.5 - y / H, d, out);
  const px = p.x;
  const py = p.y;
  out.x = (px + 0.5) * W;
  out.y = (0.5 - py) * H;
  return out;
}
