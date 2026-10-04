# WebFPV Race Name Picker

Names in, a race of five inch quads, a winner out, and a draw anybody can check.

Up to 50 names go in. Each becomes a quad on a start grid in the WebFPV simulator's race field. The picker draws the result first, with your browser's cryptographic random generator, seals it, and puts the seal's fingerprint on screen. Then the quads fly a few laps of the field, filmed side on like a broadcast, and cross the line in exactly the order that was drawn. The results page breaks the seal, so the draw can be checked in the browser, in Node, or with Python's standard library.

It is part of the WebFPV family, with the simulator, the track builder, the board and the front door. It is a static site: there is no server, no counter and no analytics, and the names and logos you type or drop never leave your browser.

`PROGRESS.md` says what was built, what was measured, what went wrong and what is still open. The brief it was built from is `prompts/build-v1.md`.

## Using it

1. Type or paste names, one to a line, two to fifty. A line with commas in it is offered a split. A name entered twice has two tickets, and the odds under the list say so.
2. Optionally give the race a title, drop up to four sponsor logos in, and choose how many winners (one to three) and how long the race is (15, 30 or 60 seconds).
3. Press **Arm and race**. The seal appears first: "Sealed before the start", the fingerprint (twelve hex digits) and the full commitment under it. It folds into the corner, the fingerprint goes up on the gantry's scoreboard, and both stay there through the start lights and the race.
4. The race ends on the winner crossing the line, then the results page opens as a manga page: the winner's picture, the order, the seal ticked or not, and the receipt. The finish is the winner's moment, for every race: the last 0.8 s before the line and the winner's flip afterwards play at a third of the speed, and the camera zooms in as far as it can while it keeps the winner and the line in frame (both of the first two, when they cross within a quarter of a second of each other, which is about a third of all races). A tenth of a second after the line the picture cuts to a camera about three and a half metres from the winner for the flip, and holds it until the results open. With two or three winners drawn there is no cut, because the places behind cross while the first is flipping, and nor is there for a person who has asked their system for less motion.

From the results page you can race again, draw again without the winners, edit the names, watch the race again, copy or save the receipt, and open the verifier. **Draws in this browser** on the setup sheet lists every draw made here, each of which can be replayed, verified, copied and saved. A replay says REPLAY on every screen it shows and never issues a receipt of its own.

Present mode (the button, or the F key) is full screen with the page's own controls hidden and the overlay sized for a projector. A person who has asked their system for less motion gets a still seal, no descent for the start, a calmer camera that cuts instead of gliding, and a prominent "Skip to the result". Sound is silent until the first click or key, and the mute is kept.

Without WebGL the draw is still made, sealed and shown, a countdown stands in for the race, and the results page has no picture. That path is tested.

## How the draw works

The result is chosen before the race and the race is a show of it. Nothing the race does, no frame time, no camera, no slow computer, can change who wins, because nothing about the result is computed after the seal.

When you arm the race the picker takes 32 random bytes from `crypto.getRandomValues` and works out the whole finishing order with an exactly uniform Fisher-Yates shuffle over a stream of HMAC-SHA-256 blocks keyed by those bytes. The fingerprint on screen before the start is the first twelve hex digits of a hash that commits to the seed and the list of names. The seed is shown after the finish, so anybody who saw the fingerprint can check that the result was fixed before the start and that the list was not swapped afterwards.

The method is called `webfpv-picker/v1`, it is pinned, and [`RANDOMNESS.md`](RANDOMNESS.md) is the whole argument for somebody who would like to disagree with it: the specification, test vectors, why each piece is there, and what this does not prove. The short version of that last part is that nothing which runs on a client can stop an operator running draws off camera until one suits them. The picker makes every arming visible in the draw log. It cannot make a rerun impossible.

The code is [`src/draw.js`](src/draw.js). It imports nothing and touches no page, so it runs unchanged in a browser and in Node and can be read in one sitting.

## Checking a draw

The results page offers the receipt as text, as JSON and as a link whose fragment carries it (a server never sees a fragment). Three programs read all of them and say whether the draw checks out:

- **In the browser:** `verify.html`. Paste a receipt, and optionally the fingerprint you saw before the start, and it recomputes the commitment, the list digest and the order.
- **In Node:** `node tools/verify.mjs receipt.txt`. This runs the picker's own `src/draw.js`, so it answers "does the file I was shown say what it claims".
- **With Python's standard library and nothing else:** `python3 tools/verify.py receipt.txt`. It shares no code with the page or with the Node tool, and it is the whole of `webfpv-picker/v1` in about eighty lines. If you would rather not trust the picker's JavaScript at all, this is the one to read.

Both tools take `--json` for machine readable output, `-` for standard input, and several files at once. The exit status is 0 if every receipt checks out, 1 if any does not, and 2 for usage.

## Run it

```
npm run serve
```

and open the address it prints. Node 22 or later. There is nothing to install, because there are no dependencies and no build step. ES modules will not load from `file://`, which is the only reason there is a server.

The race needs WebGL and loads three.js 0.160.0 from jsDelivr, which is the one request that ever leaves the page. A Content-Security-Policy in each page enforces that: `connect-src 'self'`, scripts from this origin and that one pinned directory, and every inline block named by its hash. If the policy and the page ever disagree, `npm run csp` rewrites the policy from the page and `npm run lint` fails on a stale one.

Every URL in the pages is relative, so it works from `mathew-harvey.github.io/QuadRaceRandomNamePicker/` and from a path under another host alike.

## Check the code

```
npm test           the unit tests: the draw, the plan, the shots, the sound, the page layout. Seconds, no browser.
npm run lint       headers, dashes, where randomness may appear, the draw's front door, each page's policy, relative URLs, the simulator manifest.
npm run csp        rewrite each page's Content-Security-Policy from its text (after editing a style block or an import map).
node scripts/shots.js
```

`scripts/shots.js` drives headless Chromium through the real flow and leaves pictures in `.shots/`, which is not committed. `--only flow,sheet,actions,sound,reduced,reload,phone,photo,stay,bare` runs some of the scenarios. It takes minutes on a software rasteriser. Each capture asserts what the page says before the picture is taken, the console is checked for errors, warnings and policy reports in every scenario, and the page is read every few tens of milliseconds through a race to prove the results do not exist in the document before the winner crosses.

## What is where

| Path | What it is |
| --- | --- |
| `index.html`, `src/app.js` | The page and the flow: the setup sheet, the seal, the lights, the race, the results. |
| `src/draw.js` | The draw: seed, commitment, shuffle, receipt, checks. The only place randomness is taken. |
| `src/choreo.js`, `src/course.js` | The race as a pure function of time, made after the draw, on a stadium whose bends have raised cosine transitions. |
| `src/camera.js`, `src/lens.js` | The shots, as pure functions of the plan and the clock, and the lens arithmetic that puts a tag over a quad. |
| `src/world.js`, `src/fleet.js`, `src/grid.js`, `src/layout.js` | The simulator's field built round that course, the instanced fleet of up to fifty quads, the start grid. |
| `src/hud.js`, `src/page.js`, `src/results.js`, `src/titles.js` | The overlay, the manga results page, and the lettering. |
| `src/show.js`, `src/sound.js`, `src/paddock.js`, `src/store.js`, `src/sponsors.js` | The show's arithmetic, the sound, how a quad arrives on its block, the browser storage, the logos. |
| `verify.html`, `tools/verify.mjs`, `tools/verify.py` | Three ways to check a receipt. |
| `tools/race-chart.html`, `tools/fly.html` | Development pages: a plan as a chart, and a plan flown with no interface. Not linked from the picker. |
| `sim/` | The simulator's own code, copied byte for byte by `npm run vendor`, never edited. `sim/MANIFEST.json` holds the commit and a hash for every file. |
| `RANDOMNESS.md`, `CLAUDE.md`, `PROGRESS.md`, `NOTICE` | The argument for the draw, the conventions, the log of what was done, and what came from where. |

## Licence

GPLv3 or later, see `LICENSE`. The simulator's files under `sim/` are GPLv3 at the commit in the manifest. three.js is MIT and is loaded from the CDN, not copied. `NOTICE` records what came from where.
