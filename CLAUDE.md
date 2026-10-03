# CLAUDE.md

Project conventions. Read fully before any turn. These are decisions already made, not options.

## What this is

The WebFPV Race Name Picker: a static site with no server. Up to 50 names go in. Each becomes a five inch quad on a start grid in the simulator's race field. The picker draws the result first, with the browser's cryptographic random generator, seals it, and puts the seal's fingerprint on screen. Then the quads fly a few laps of the field, filmed side on like a broadcast, and cross the line in exactly the order that was drawn. The results page breaks the seal so anyone can check the draw, in the browser, in Node, or with Python's standard library.

It joins the WebFPV family. `Mathew-Harvey/WebFPVSimulator` holds the simulator and the track builder and is the copy of record for anything shared. `Mathew-Harvey/WebFPVSimulator-LeaderBoard` is the board and `Mathew-Harvey/landingpage-WebFPVSimulator-` is the front door. Read the simulator's `CLAUDE.md` before changing anything that has to agree across the family, and `DEPLOY.md` and `edge/router.js` there for how the family is hosted. The three are read only from here: nothing in this repository ever changes them.

`prompts/build-v1.md` is the brief v1 was built from. It is a record and not a spec to edit.

## Decisions already made

**The result is drawn before the race, sealed, then flown.** The race is a show of a draw that has already happened. Nothing it does, no frame time, no camera, no dropped frame, no plan, can change who wins, because nothing about the result is computed after the seal. That is the opposite of the usual duck race, where the winner is whatever the animation produces, usually from the engine's ordinary random function, and nobody can audit it. The page says so plainly and so does `RANDOMNESS.md`.

**The algorithm `webfpv-picker/v1` is pinned.** `src/draw.js` is the copy of record, `RANDOMNESS.md` describes it, `tools/verify.mjs` and `tools/verify.py` reproduce it independently, and the three test vectors in `tests/draw.test.js` hold it byte for byte. Do not improve it. A change invalidates every receipt anybody kept, so it goes to the owner first with the reason, and it would arrive as a `v2` beside `v1`, never as an edit of `v1`. The shuffle (`below` and the loop) is pure and synchronous over an injected word source, and only the word stream is asynchronous.

**Randomness is confined, and `npm run lint` holds it.** `crypto.getRandomValues` and `crypto.subtle` appear in `src/draw.js` and nowhere else in this repository's own code. The engine's ordinary random function appears nowhere outside `sim/`, where it is the simulator's and cosmetic (lens noise, a track id). Everything in this app that wobbles is seeded from `showSeed`. `src/draw.js` imports nothing and touches no DOM, so it runs unchanged in a browser and in Node and can be read in one sitting.

**A live draw's seed comes only from `crypto.getRandomValues`, taken when the operator arms the race and from nowhere else.** No field, URL parameter, test hook or key sets the seed or the winner of a live draw. A replay from a receipt says REPLAY on every screen it shows and never issues a receipt of its own. A development parameter that scales presentation time is fine: it touches time, never the draw.

**The sealed draw is written to this browser's draw log before the countdown starts.** A reload mid race loses the show and not the result.

**The race is a plan, made after the draw.** `src/choreo.js` takes the order, `showSeed`, the number of names, the chosen length and the course, and returns every quad's flight as a pure function of race time. It has no DOM and no Three.js. The frame loop only samples it, so a slow laptop or a dropped frame changes nothing, and the race pauses while the tab is hidden. Attitude is derived from the plan's acceleration, not animated.

**The plan is exact where it decides anything, and checks itself.** A replay of a receipt is the same race on any machine, so what `src/choreo.js` and `src/course.js` decide with uses only `+ - * /` and `sqrt`, which IEEE 754 specifies, and the course's fixed polynomial `cosPi` and `sinPi`, never the engine's cosine, which may differ in the last place. The generator is a small seeded counter generator, never the engine's ordinary random function. `makePlan` checks its own work (order, gaps, no goes backwards, speed, clearance) before it returns, tries again from a derived seed if an attempt fails, swaps a story it cannot keep for the sturdy one, and as a last resort flies every quad in a slot of its own, which cannot collide whatever the speeds do. That last resort has not been needed in 3,000 plans, and `tests/choreo.test.js` fails if it is.

**The course is a stadium whose bends have raised cosine transitions, and that is not a detail.** A straight meeting an arc steps the curvature, so a quad's bank would snap. A plain clothoid still steps the *rate* of curvature, and a quad in the outside lane covers `1 - u kappa` of path per metre of line, so its speed changes at `-u kappa' s'^2` and the step is a snap in pitch: 9.6 m/s^2 for a quad at 28 m/s in the outer lane, measured. A raised cosine in curvature has no step, turns the same angle over the same length, and made the largest change in acceleration in 1/240 s go from 9.7 to 0.55 m/s^2. Do not simplify the transitions to clothoids or arcs.

**A storyline is a promise about who is where, and it starts small.** Wire to wire has the winner at least 3 m clear at half distance. Every other story has somebody else first at half distance, the winner at least 4 m behind, and the lead changing hands in the last third. A story starts at about twice the size of the ordinary variation and is escalated only as far as the promise needs: a first version started at +0.3 and +0.4 and gave legal races in which the leader was 40 m clear of a field that then had to be caught by a rocket. The launch is common to every quad, and each quad's own speed is blended in over the next three seconds, because a launch scaled by each quad's own cruise sent a back row quad into the slow quad in front of it inside a second.

**The results page reads the draw, never the animation.** As the race finishes it compares the crossing order with `order`, and if they ever disagree it logs an error and still shows the draw. Nothing reveals the result before the winner crosses: the results page does not exist in the DOM until then, no tag or row is styled by finishing place, and the grid is the entry order, never the drawn one.

**The simulator is copied, never edited, into `sim/`.** `sim/` mirrors the simulator's repository root (`sim/src/render/scene.js`, `sim/configs/airframes.js`) so every file arrives byte for byte and every relative import resolves without an edit. `node scripts/vendor.js ../WebFPVSimulator` copies the import closure of the entries it names, deletes what the copy no longer makes, and writes `sim/MANIFEST.json` with the simulator's commit, whether its tree was clean, and a SHA-256 per file. `npm run lint` fails on any file under `sim/` that does not match. A change the picker needs in that code is made in the simulator, which is outside this repository: write it down for the owner and work round it here.

**The field is the simulator's field.** The picker builds the simulator's race field around a course this app designs, with the simulator's own code, the way its "Your track" map and the board's course thumbnails do. It never draws a field of its own. `three` is `0.160.0` from jsDelivr, the version the family pins, because the simulator's `celmat.js` patches one of its shader chunks at import and throws if the text changed. Do not move it.

**The fleet is instanced, and it keeps off the layers the ink prepass draws.** `src/fleet.js` builds one of the simulator's quads, bakes it, and draws fifty as an InstancedMesh per material. The world's post chain inks what a prepass finds, and the prepass overrides every material with one that ignores `instanceMatrix`, so a fleet on layer 0 would be drawn at the origin there and the world's ink lines would run through every quad. So the fleet is on layer 4 (the colour pass only), and it draws itself into the post chain's own normal and depth target afterward, as one instanced draw on layer 5 through post.js's own packing, by wrapping `post.composer.render`. Nothing in `sim/` is touched. If the simulator ever gives its prepass instancing, this wrap is what to delete.

**The first row of the grid is the world's, and the rest are rebuilt.** A track document has exactly one `startPads`, and `src/layout.js` makes it nine stands, one to a lane, so the simulator's field bakes the front row itself and it is always there, empty or full. Rows two onward exist only for the names there are (`src/grid.js`), merged by material and rebuilt when the count changes.

**Every shot is a pure function of the plan and the clock.** `src/camera.js` has no state that depends on the last frame, so a pause, a seek and a replay show what the clock says. The rail camera follows the leading group with room ahead of the leader, turns no faster than 44 degrees a second (a table worked out once per plan, from the plan alone), and glides to a stop 6 m short of the line, because the gantry's near upright stands at the line and a camera abeam of it films every finish through a post. The paddock orbit is centred on the grid and not on `map.attract`, which frames the whole oval from 80 m.

**Coordinate and unit conventions are the simulator's.** The plan is in SI units (metres, seconds, radians), Z up in the plan's own frame, and converted once, at the point where a pose is handed to Three.js, which is Y up. Nowhere else.

**The copy says what is true.** "Drawn with your browser's cryptographic random generator." "Sealed before the start." Never "100% random", "truly random" or "provably fair" as a bare claim. What the method does not prove is written down in `RANDOMNESS.md` in as many words: it cannot stop an operator running draws off camera until one suits them, and nothing that runs on a client can.

**Names and logos never leave the browser.** There is no server, no counter and no analytics. The only request that leaves the page is for three.js. A Content-Security-Policy meta enforces it, and the footer says so. Storage is localStorage inside try and catch on every access, and the page works with storage blocked.

**Licence is GPLv3.** Every source file gets the header with "This file is part of the WebFPV Race Name Picker". The simulator's files under `sim/` are GPLv3 at the commit in the manifest. three.js is MIT, loaded from the CDN and not copied. Do not add a dependency with an incompatible licence. `NOTICE` records what came from where.

**No dependencies and no bundler.** Plain JavaScript, ES modules, a CDN import map for three.js and nothing else on the render side. Tests and scripts use Node's built ins. If a dependency is ever wanted it is argued in `PROGRESS.md` and put to the owner first.

**The family's furniture, not an invention.** Dark only. The palette is `--cream #f3ead4` for lit type, `--sakura #e8a8b8` for chrome, `--amber #ffd45c` for an instrument, `--mint #7dffb4` for the winner and anything good, `--slate #9db3c8` for type that recedes, `--deep #141c16` for ground, paper `#f7f0dc` and ink `#0b1116` for the manga page. Type is the `system-ui` stack, with `ui-monospace` and `tabular-nums` for numbers, and no web fonts. The wordmark, the page titles and the winner's name are lettered by the simulator's `src/ui/lettering.js`, joined the way the board's `public/titles.js` joins it: the words stay in the DOM with a transparent fill, the canvas is aria hidden, and forced colours gets the text back. Everything else stays text.

**Reduced motion is honoured in two places that agree.** The CSS block at the foot of the stylesheet and `REDUCED` in the script. Anything that animates needs an entry in both. Under reduced motion there is no aerial descent and no glide, no slap, and a prominent "Skip to the result". The race still runs if the pilot wants it. Nothing that carries meaning is hidden.

**Every URL is relative.** The app works at `mathew-harvey.github.io/QuadRaceRandomNamePicker/` and under a later `webfpv.org/<mount>/`, so no file reaches another by a path from the site root. The only absolute URLs are the CDN's and links out to documentation. If it is mounted, the landing page's `?v=` rule applies from that day: a module that changes in a deploy gets a new `?v=` on every address it is loaded by.

**No partner marks, and no Betaflight name or logo.** Partner placements are agreed one at a time, and this app runs no Betaflight code. The site icon is `data:,` until the owner says which of the family's four accents the picker takes.

## Style

- Plain JavaScript. No framework, no bundler, no TypeScript, no state library.
- Prefer one file doing an obvious thing over three files doing a clever thing.
- No em dashes or en dashes in prose, comments, commit messages or documentation. Use a comma, colon or full stop. The page's inline separator is `&#183;`.
- Long explanatory comments that say why, not what. Match the voice of the simulator's `src/render/scene.js` and the landing page's `index.html`.
- A GPLv3 header on every file you write, in the simulator's wording.

## Working rules

- `npm test` runs `tests/*.test.js` and is cheap: seconds, no browser. The brief spelled it `node --test tests/`, which fails on Node 22 (it treats the directory as a module), so the script is `node --test "tests/*.test.js"`.
- `npm run lint` is cheap too: headers, dashes, randomness confinement, relative URLs, the manifest.
- **Always ask, before the turn ends, whether to run a verification pass and at what scale.** The owner can open the page and learn in one minute what no headless check can see, so whether to spend that minute is their call and not an assumption. Ask on every turn that changed code, including the turns where the cheap checks already came back green, because a green check is evidence about the thing it can see and nothing else. Offer the scale plainly:
  - **none.** The change is documentation or a comment and there is nothing to run.
  - **cheap.** `npm test` and `npm run lint`. Seconds.
  - **shots.** `node scripts/shots.js` drives headless Chromium through the real flow and leaves pictures in `.shots/`. Minutes.
  - **watch it.** Open the page, paste twenty names, add two logos, arm it, and look at what a person looks at. Say what to look for and what would count as wrong.
- Never report a check as passing without having run it in the same turn. If a check was not run, say so, say why, and say what was done instead. A check that was not run is not evidence, and neither is a green check that cannot see the thing that changed.
- Never change a threshold, a vector, a seed set or a band to make a check pass. Argue in `PROGRESS.md` instead.
- Every turn that changes code appends to `PROGRESS.md`, including what went wrong. It is append only.
- **The advisor is the owner,** in the conversation. Ask, and wait for the answer, before changing the algorithm, adding a dependency, showing anything a sponsor or partner could read as an endorsement, or touching another repository. Record the answer in `PROGRESS.md` with the date and what it covered.
- Do not commit screenshots. `.gitignore` drops `.shots/`.

## Git

This section is the family's, and exists because the simulator's history was destroyed once: on 2026-08-26 an agent committed a fresh root and force pushed it over `main`, and 60 commits stopped being reachable. No code was lost. The record of who wrote what, when and why was.

- **`main` is append only.** Never force push it, never rewrite it, never reset it backwards. If a push is rejected, merge or rebase your own work onto the remote and push again. A rejected push is git protecting somebody, and the answer is never `--force`.
- **Work on the branch the session names,** commit small, and push at the end of every milestone.
- **Never `git init` or create a new root in a repository that has one.** If the history looks wrong, stop and say so.
- **If `git merge-base` between two refs returns nothing, STOP.** Unrelated histories mean somebody replaced the history rather than adding to it. Do not merge. Report it and let the owner decide.
- **Fetch before you reason about a branch,** here and in each sibling checkout before reading it. A remote tracking ref from a container's first clone can be hours stale.
- Anything worth keeping is committed and pushed before the turn ends. A container is reclaimed without warning.

## Review

- **Do not run adversarial review, multi agent review or a review workflow unless directed.** Read your own diff, run the cheap checks, and hand the work over. Fan out only when the request asks for it.
- When a review does run, its findings go in `PROGRESS.md` whether or not they were acted on, and a finding that was declined is written down with the reason.
