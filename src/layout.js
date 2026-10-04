/*
 * layout.js: the track document the simulator's race field is built around.
 *
 * The field is the simulator's, and the way to ask for it is a track
 * document: the same plain JSON the track builder writes and the board
 * publishes, read by sim/src/game/trackdoc.js into a course the world
 * builds from. This file writes that document from the numbers in
 * src/course.js, so a flag stands where the plan's oval says and no position
 * is typed twice.
 *
 * WHAT IS IN IT, AND WHY.
 *
 *   Eight flags, in flying order round the inside of the track, in the way a
 *   field marks its turns. A flag is a marker, not a gate: it takes no
 *   sponsor's dress, it is passed on a side, and the document reads as a
 *   closed lap with no warnings. The simulator's own racing line through
 *   them is not the line the fleet flies (that is the plan's, in
 *   src/choreo.js), but it is what flattens the ground and keeps the trees
 *   off, and it is close enough to the plan's that the flattened ground is
 *   under the track.
 *
 *   One startPads, and exactly one, which is all a document is allowed. It is
 *   the front row of the grid: nine of the simulator's start blocks, one to a
 *   lane, 1.3 m apart across the line and 1.5 m behind it, so the world
 *   builds the front row itself and the rows behind it (src/world.js) are
 *   only needed when there are more than nine names. A pad is baked into the
 *   world's merged scenery and cannot be hidden, which is why the row it
 *   makes is the one every grid has.
 *
 *   A groundLogo per sponsor mark, round robin, down the infield where the
 *   race camera looks at them, if the caller has marks to paint.
 *
 * The document is built in the plan's frame, Z up, with the field's middle at
 * the origin, and moved by half the field into the document's own corner
 * origin, which is the one sim/src/game/trackdoc.js moves back out of. The
 * conversion to Three.js's frame is the document reader's own and src/frame.js
 * agrees with it: tests/layout.test.js checks that a flag lands where
 * toThree says it should.
 *
 * It needs the simulator's model.js and trackdoc.js, which are pure
 * functions and no DOM, so it runs in Node, where tests/layout.test.js holds
 * it.
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

import { createElement, createSequenceEntry, createTrack } from '../sim/src/trackbuilder/model.js';
import { courseFromDocument } from '../sim/src/game/trackdoc.js';
import { GRID, LATTICE, makeCourse } from './course.js';

/* The field, in metres: the oval is 140 by 72 with its boards, the rest is mown run off and the grass the pavilion stands on. */
export const FIELD = Object.freeze({ width: 200, depth: 100 });

/*
 * How much larger than life the fleet is drawn. A five inch quad is 0.35 m
 * across its props, a dot from the 20 m the rail camera stands from the line,
 * and the brief wants the leaders to read as quads. There are two ways to
 * make a quad bigger on the glass: draw it larger, or narrow the lens until
 * less of the track is in the picture. The owner has chosen the first and
 * ruled out the second (2026-10-04: "just make the quads larger during the
 * race, don't zoom in to make the frame narrower"), so the race lens is the
 * original one (src/camera.js) and all of the size is here.
 *
 * It is 4.5, which is as far as it goes. At this scale a quad is 1.56 m across
 * its props and its arms reach 0.50 m from its centre. The planner keeps every
 * pair at least 0.85 m apart (the least in the 3,000 plans of
 * tests/choreo.test.js; its own limit is 0.5 m), so the props of two quads in
 * a close pass overlap by more than half a metre. They are translucent discs,
 * and that reads as a bump and not as a fault, which is the bit comical the
 * owner said was fine. What stops it here is the frames. Flown over 425 plans
 * of 5 to 50 quads at 120 Hz with the attitudes the fleet gives them, the
 * nearest two arms (0.016 m wide boxes, times this) had 0.25 m of air between
 * their edges at 3.0, 0.035 m at 4.0, and at 4.5 touched: 8 samples of 120 Hz
 * had an arm 0.014 m into another, and one had an arm 0.016 m into another
 * quad's body, which no one could see. At 5.0 it is 0.064 m, a whole arm
 * through another in 38 samples, and that is where a bit comical becomes a
 * fault.
 *
 * The start blocks do not grow with it. A block is as tall as the plan says a
 * quad sits on its foam (LATTICE.blockHeight, 0.32 m), and that is what a
 * block is at BLOCK_SCALE 2.2, the scale the fleet was drawn at when the
 * blocks were made; tests/layout.test.js holds the two together. A quad of 4.5
 * is 1.56 m across its props and a block is 1.32 m, so the props hang over
 * the sides of it, which is part of the joke.
 */
export const FLEET_SCALE = 4.5;
export const BLOCK_SCALE = 2.2;
export const PAD_SIZE = 0.6 * BLOCK_SCALE;

/* How far inside the line a flag stands: the inner edge of the 12 m track. */
const FLAG_INSET = 6;
/* The distance from the line to the infield's logos, and how deep they are across. */
const LOGO_INSET = 10;
const LOGO_DEPTH = 6;

/* Where the flags go along the line, in metres from the start line. */
function flagStations(course) {
  const g = course.geometry;
  const arc = g.radius * (Math.PI - g.spiral / g.radius);
  const first = g.straight / 2 + g.spiral;
  const second = g.straight / 2 + 2 * g.spiral + arc + g.straight + g.spiral;
  const out = [g.straight / 4];
  for (const f of [0.15, 0.5, 0.85]) {
    out.push(first + f * arc);
  }
  out.push(g.straight / 2 + 2 * g.spiral + arc + g.straight / 2);
  for (const f of [0.15, 0.5, 0.85]) {
    out.push(second + f * arc);
  }
  return out;
}

/*
 * The document.
 *
 *   course   from makeCourse()
 *   logos    marks to paint on the grass: [{ image }], data URLs, already
 *            stretched for the camera; none by default
 *
 * Returns the plain document. It is not normalised here: courseFromDocument
 * normalises it, and a document the reader repairs would be a document with
 * a bug in this file.
 */
export function buildDocument({ course = makeCourse(), logos = [] } = {}) {
  const doc = createTrack('WebFPV Race Name Picker');
  /* A fixed id, because the simulator's makes one from the engine's random function and a document that changes on every load is not a document. */
  doc.id = 'trk-webfpv-picker';
  doc.createdUtc = '2026-10-03T00:00:00Z';
  doc.modifiedUtc = '2026-10-03T00:00:00Z';
  doc.field.width = FIELD.width;
  doc.field.depth = FIELD.depth;
  const cx = FIELD.width / 2;
  const cy = FIELD.depth / 2;
  const at = {};

  for (const s of flagStations(course)) {
    course.place(s, -FLAG_INSET, 0, at);
    const el = createElement(doc, 'flag', { x: at.x + cx, y: at.y + cy }, 0);
    doc.elements.push(el);
    doc.sequence.push(createSequenceEntry(doc, el.id));
  }

  /* The pads: heading is the line's at the front row, the way the quad sets off. */
  course.place(-GRID.front, 0, 0, at);
  const pads = createElement(doc, 'startPads', { x: at.x + cx, y: at.y + cy }, at.theta);
  pads.dims = { pads: course.lanes, spacing: LATTICE.laneSpacing, padSize: PAD_SIZE };
  doc.elements.push(pads);

  /* The marks. Each gets an entry in the branding and a decal on the infield. */
  const marks = logos.slice(0, 5);
  doc.branding.logos = marks.map((m, i) => ({ id: `logo-${i + 1}`, image: m.image, name: m.name || `Logo ${i + 1}` }));
  if (marks.length) {
    const spots = logoStations(course);
    spots.forEach((s, i) => {
      course.place(s, -LOGO_INSET, 0, at);
      const el = createElement(doc, 'groundLogo', { x: at.x + cx, y: at.y + cy }, at.theta);
      el.logoId = doc.branding.logos[i % marks.length].id;
      el.dims = { width: marks[i % marks.length].width || 10, depth: marks[i % marks.length].depth || LOGO_DEPTH };
      doc.elements.push(el);
    });
  }
  return doc;
}

/* Where the grass marks go: down the infield side of both straights and at the middle of each bend, six places the race camera sees across the track. */
function logoStations(course) {
  const g = course.geometry;
  const arc = g.radius * (Math.PI - g.spiral / g.radius);
  const bend = g.straight / 2 + g.spiral + arc / 2;
  const north = g.straight / 2 + 2 * g.spiral + arc + g.straight / 2;
  const bendTwo = g.straight / 2 + 2 * g.spiral + arc + g.straight + g.spiral + arc / 2;
  return [-g.straight / 4, g.straight / 4 + 4, bend, north - 14, north + 14, bendTwo];
}

/* The course the world is built from, with the simulator's racing line painted on nothing: the fleet flies the plan's line and a yellow dash under it would be a second one. */
export function buildCourseFor(options) {
  const document = buildDocument(options);
  const built = courseFromDocument(document);
  built.guide = null;
  return built;
}
