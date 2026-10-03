# PROGRESS.md

State between sessions. Append only. Newest entry at the bottom. Never rewrite history, including the parts where something went wrong, because that is the most useful part of this file.

Each entry says what changed, what was measured, what went wrong, and what is open. The last entry is the current state: read it first.

---

## 2026-10-03 | milestone 0 | Scaffold

Branch `claude/elegant-maxwell-yuwvmm`. The brief is `prompts/build-v1.md`, measured against the simulator's `main` at `787ea59`.

### Before writing anything

Fetched `origin main` in all four checkouts, as the family's Git rule says.

    WebFPVSimulator                     HEAD 787ea59 = origin/main, as the brief says
    WebFPVSimulator-LeaderBoard         HEAD 570ea3d = origin/main
    landingpage-WebFPVSimulator-        origin/main moved a96cff4 to 06e8818 in the fetch; HEAD was already 06e8818
    QuadRaceRandomNamePicker            HEAD 62c4653 = origin/main

`git merge-base HEAD origin/main` returned a commit in every one, so no history has been replaced. The three siblings are shallow clones, which is fine because they are read only.

### What changed

`LICENSE` (the simulator's GPLv3 text, byte identical: md5 `1ebbd3e34237af26da5dc08a4e440464`, the same in all three siblings), `CLAUDE.md` in the family's shape, `package.json`, `.gitignore`, `.nojekyll`, `README.md`, `scripts/serve.js`, `scripts/lint.js` and `tests/lint.test.js`.

- **`.nojekyll`** is not in the brief. GitHub Pages builds a branch with Jekyll unless told not to, and Jekyll skips anything that starts with an underscore or a dot and rewrites some Markdown. The picker is plain static files and `sim/` will be a mirror of the simulator's root, so it asks Pages to serve them as they are.
- **`scripts/serve.js`** exports its handler and a `listen()` so that `scripts/shots.js` serves the page through the same MIME table, as the landing page's `serve.js` does for its card script. It refuses a path or a symlink that leaves the repository, and sends `no-store`. The default port is 8090.
- **`scripts/lint.js`** holds checks 9 and 10 as greps a sceptic could run, plus the package's shape. Its helpers are exported and `tests/lint.test.js` feeds them bad input. The checks that have nothing to look at yet (`src/draw.js`, `sim/MANIFEST.json`) print `skip` and say why, never `ok`.
- The lint's confinement rule for the browser's randomness is wider than the brief's two names: it also refuses the UUID helper and Node's byte and integer helpers outside `src/draw.js`, because a seed from any of them would be a seed the check had not looked at. That is stricter than the brief and cannot make a legitimate file fail, since only `src/draw.js` may touch randomness at all.

### Measured

    npm test        8 of 8 pass (the lint's own helpers)
    npm run lint    6 of 8 checks clean, 2 skipped because there is nothing to look at yet
    lint on a file with no header, a dash and the ordinary random function: exit 1, all three named
    lint with that file removed: exit 0

### What went wrong

- **`node --test tests/` does not work on Node 22.** The brief's spelling treats `tests/` as a module and fails with `MODULE_NOT_FOUND` (measured on Node 22.22.0). The glob form `node --test "tests/*.test.js"` runs the files, so `npm test` uses that. I did not test other Node versions. Nothing else about the brief's `package.json` changed.
- **The lint tripped over its own comment.** A sentence in `scripts/lint.js` naming the helpers it refuses was itself a hit for the rule, and so were the literals in its test. Both are now assembled from pieces, and the comment says "the UUID helper" rather than the name. A grep has no exceptions, and that is the point of one.
- **The test found a hole in the lint before the lint found anything.** `importsIn` only saw an `import` at the start of a statement, so `await import("./x.js")` in the middle of an expression would have passed rule 9c for `src/draw.js`. The test for it failed, and the helper now also matches a dynamic import anywhere and a re-export with `from`. Fixed in the helper, not in the test.
- The environment's reported working directory follows the last `cd` the shell made, so it drifted between the siblings while I read them. Nothing was written to a sibling: `git status` in each is as it was.

### Not done, by design

Everything from milestone 1 on. No `src/` yet.

### Open for the owner

Carried from the brief, to be asked at the end: which of the family's four icon accents the picker takes, whether and when it is mounted under `webfpv.org/<mount>/`, and whether the official partners appear here at all. None blocks the build.

---

## 2026-10-03 | milestone 1 | The draw

`src/draw.js`, both verifiers, a plain `verify.html`, `RANDOMNESS.md`, and checks 1 to 5. Nothing past this started until it was green.

### What changed

- **`src/draw.js`** (718 lines, no imports, no DOM): the method, the canonical form of a name, the seeded function `drawWithSeed` for tests, verifiers and replays, the live function `drawLive`, `replayOf`, the receipt in JSON and text, a reader for both, `checkReceipt`, the fingerprint, and the receipt in a link (`receiptFragment`, `receiptFromFragment`). The shuffle (`below`, `shuffle`) is synchronous over an injected word source; only the HMAC blocks are awaited. If the source runs dry the whole shuffle is re-run over twice as many blocks, which is exact because the shuffle is a pure function of the prefix it consumes.
- **`tools/verify.py`**: standard library only, written from the spec, and different in shape on purpose (a lazy generator of words, so it has no "out of words" step). **`tools/verify.mjs`** runs `src/draw.js`. Both print the same compact JSON with `--json`, and the test holds them to byte identical output.
- **`tests/draw.test.js`**: checks 1 to 5, plus canonical names, sealing limits, the live path's seed source, receipt round trips, tampering, malformed receipts, the receipt in a link, and `RANDOMNESS.md` itself (its example receipts are byte for byte what the code writes, and every vector in it is the one tested).
- **`RANDOMNESS.md`**: the claim, why the order is drawn first, the pinned method and a worked example, why each piece is there, what it does not prove, the exact receipt grammar, how to check a draw, the vectors.
- **`verify.html`**: a pasted receipt or one carried in the address after the `#`, an optional "fingerprint I saw before the start", three ticks with one sentence each, the order with names. It imports `src/draw.js` and nothing else, which the lint now holds.
- **`tests/lib/page.js`**: the picker's headless Chromium driver (adapted from the simulator's), written now because `verify.html` needed a real browser, and it is the base `scripts/shots.js` will use. It records every request the page makes.
- **`scripts/lint.js`**: gained "`verify.html` imports `src/draw.js` and nothing else" and a `moduleSpecifiers` helper, with a test.

### Measured

    npm test        40 of 40 pass, 0 skipped, about 11 s (python3 is present, so check 3 ran)
    npm run lint    8 of 9 clean, 1 skipped (no sim/ yet)

    check 1  V1, V2, V3 exact: list digest, commitment, order, show seed. V1 winner Alice (1B39 BA47 3BA5), V2 Pilot 36, V3 Soren.
    check 2  1000 random lists, 49 different sizes from 2 to 50: identical list digests, commitments, show seeds and orders
             between WebCrypto (src/draw.js) and an independent node:crypto implementation. That reference also reproduces V1 to V3.
    check 3  tools/verify.py on V1 to V3 in both forms, and on 200 receipts written by the app's own receipt code (100 JSON, 100 text):
             all checks true, and Python's and Node's --json output are byte identical. Tampered and broken receipts
             (changed order, seed, a name, broken JSON, empty, a text receipt whose place lines contradict it): all refused, exit 1.
    check 4  below(n) for every n from 2 to 50: limit - 1 accepted (returns n - 1), limit and 2^32 - 1 rejected and the next word taken.
             The five powers of two (2, 4, 8, 16, 32) reject nothing, so for them limit is 2^32 and only 2^32 - 1 is tested.
             N - 1 words per shuffle when none is rejected, one more per rejection. Starting from 1 block and growing gives V2's order.
    check 5  uniform-4   chi-squared 20.696 on 23 dof (bound 49.73), all 24 orderings seen
             uniform-50  46.083 on 49 dof (bound 85.35)
             uniform-7   8.717, 4.364, 5.787, 10.422, 1.225, 11.282, 6.446 on 6 dof each (bound 22.46)
             All equal to the values the brief says a correct implementation gives.
    contrast the naive shuffle scores 7143.9 on uniform-4, the brief's figure exactly.

The worst per word rejection rate over n = 2 to 50 is n = 50 at 1 in 93.4 million, and a whole 50 name shuffle meets one about once in 7.9 million. 50! is 2^214.21. The largest N whose N! fits in 2^128 is 34. These are in `RANDOMNESS.md`, computed rather than recalled.

### What went wrong

- **The contrast shuffle scored 60,861.4, not 7,143.9.** I read "swap with below(N) instead of below(i + 1)" as a change inside the correct loop, which stops at 1. That is a far worse shuffle. I measured four variants and the brief's number is the naive loop that runs all the way down to 0 and swaps each position with `below(N)`: 7143.9, to the digit. The brief's figure was right and my reading was too literal. No threshold or figure was changed: the test now runs both variants, asserts 7143.9 for the naive one and records 60,861.4 as a second contrast.
- **A pasted JSON array got "could not read this line"** instead of "a receipt is an object", because only text starting with `{` was sent to the JSON parser. It starts with `[` too now.
- **Four of my own tests were wrong, not the code**: one assumed the second place of an all zero seed was entry 2; one built a "tampered" receipt by replacing a name in only one of the two places it appears, which made the receipt contradict itself and so was refused by the reader rather than failing the digest; one used `AAAA` as an example of bytes that are not UTF-8 (it is three NULs); one expected a throw for a fragment that holds no receipt at all, which correctly returns `null`. Each was fixed in the test after the code was shown to be right.
- **`verify.html` had two real defects that only a real browser showed.** A layout bug: the explanation under a failing check fell into the 34 px column of the mark, which I saw in the screenshot. And a logic bug: with a wrong fingerprint typed, the verdict still said "This draw checks out". A receipt that is consistent but is not the draw whose fingerprint you saw is exactly what a rerun looks like, so a mismatch now fails the verdict and says why. Both fixed, and the smoke run was repeated.
- `JSON.stringify` with an indent put every number of the order on its own line, so the JSON receipt for 50 names was 130 lines of noise. `receiptJSON` is written by hand now: names one to a line, the order on one line. Still plain JSON.
- Two of my Python edit scripts failed on patterns that did not match (the file held a literal tick, not an escape), and one comment in `src/draw.js` quoted the brief's looser "1 in 85 million". The first was caught by an assertion in the script, the second by computing the figure.

### Decisions to know about

- **The receipt carries `listDigest`** (the brief's "at least" list does not name it), so the verifier's first tick means something: the names hash to the digest stated. It also carries an optional `length`, so a replay is the same race. Neither changes the algorithm.
- **The text receipt names each place's entry in parentheses, and the reader refuses a receipt whose text contradicts its own list.** Redundant data a person reads must be data the parser checks, or a tamperer could show a human one name while the arithmetic used another.
- **Title, time, winners and length are labels and are not covered by the commitment.** `RANDOMNESS.md` says so, and a test pins that changing them does not fail a receipt, so it cannot change by accident.
- **Names are canonicalised**: NFC, control characters and whitespace runs to one space, trimmed, lone surrogates replaced, at most 80 code points, never a newline. A test shows it is idempotent over 3,000 hostile strings.
- **Links to documentation point at GitHub's rendered view**, not at the `.md` file on Pages, which browsers offer as a download.

### Not done, by design

The CSP, which needs `verify.html`'s inline module hashed (milestone 5). Everything from milestone 2 on.

---

## 2026-10-03 | milestone 2 | The plan

`src/course.js`, `src/choreo.js`, `tools/race-chart.html`, and checks 6 to 8, on 3,000 plans.

### What changed

- **`src/course.js`** (pure geometry, no DOM): the oval, the cross section the quads fly in, the grid, the camera rail. Straights of 52 m, an arc of 30 m and transitions of 14 m make a **lap of 320.5 m**, so a 15, 30 and 60 second race is 1, 2 and 4 laps at about 21 m/s. The brief suggests 60 m straights, 32 m bends and about 300 m, which do not agree once the bends have transitions; 30 m is as near its 32 as the lap allows, and the yaw rate of a camera following the leader round it is v / 30 m, 41 degrees a second at the lap speed, under the brief's 50. The oval is 126 by 60 m on the centreline and fits the suggested 200 by 100 field. The quads race **clockwise**, so with the camera in the infield the pack crosses its screen left to right all the way round. u is positive outward.
- **`src/choreo.js`**: `makePlan` (order, show seed, length, course) returns every quad's flight as a function of time, with `sample`, `locate`, `pose` (position, velocity, acceleration, the thrust axis, the heading, and the flip and wobble a story asks for) and `rank`. It checks itself, retries, swaps a story it cannot keep, and has a fallback that cannot collide. `measure` and `dramaOf` are the independent measurement the tests assert on. `internals` exposes the generator's parts to tests.
- **`tools/race-chart.html`**: distance behind the leader against time, one line per quad, in metres or seconds, with half distance, two thirds and the first three finishes marked, built from the real draw for the seed typed in. It prints `measure` under the chart. Rendered and looked at for 50 names and for 12.
- **`tests/choreo.test.js`** and `tests/lib/plan-cases.js`, `tests/lib/plan-worker.js`: 19 tests. Every one of the 3,000 plans takes its order from the real `shuffle` in `src/draw.js` over a SHA-256 stream, and runs on a worker thread.
- **`scripts/lint.js`** now reads a file's whole leading comment for the licence (a long explanation above the licence is the normal case here, and a window of 4,000 characters failed `choreo.js` the moment its header grew), and fails any file under `src/` other than `src/draw.js`, or `index.html`, that names `drawWithSeed`: the live page reaches the draw through `drawLive`, which takes no seed.

### Measured

    npm test        60 of 60 pass, 0 skipped, 26.6 s wall (92 s CPU on 4 threads; a slower or smaller machine takes longer)
    npm run lint    9 of 10 clean, 1 skipped (no sim/ yet)

    3,000 plans (2: 300, 3: 300, 5: 700, 12: 700, 23: 600, 50: 400), made and measured in 22.8 s on 4 threads
    check 6  the crossing order is the drawn order in all 3,000. Every storyline appears at every size, every size at every length.
    check 7  speed after the launch 12.5 to 35.0 m/s            band 12 to 36
             nearest two quads 0.85 m                           limit 0.5
             first and second at least 0.045 s apart             limit 0.04
             other neighbours at least 0.085 s apart             limit 0.08
             winner time 94.0% to 106.0% of the length           limit 90% to 110%
             progress never goes backwards, always a whole number of laps (1, 2, 4), and the finish line is the start line
    check 8  over the 2,400 plans of five names or more (the brief asks for 1,000):
               the winner leads at half distance in 21.0%       target 10 to 35
               a lead change in the final third in 79.7%        target at least 60
               a winning margin under 0.25 s in 37.3%           target 25 to 50
             and by size: half 20.3 to 21.9%, changes 78.6 to 81.5%, close 35.4 to 38.8%
    stories  wire 21.3%, surge 34.7%, comeback 24.1%, clip 19.9% (weights 22, 34, 24, 20)
    swaps    8 of 3,000 plans (0.27%) flew the sturdy story because theirs could not be kept for their seed
    fallback 0 of 3,000 needed the one slot per quad fallback
    smooth   largest change in acceleration in 1/240 s is 0.55 m/s^2 (a switch in curvature rate made it 9.7)
    forced   144 plans, every storyline at every size and length, with and without a photo finish: every promise kept, every race legal

    time to make a plan: N = 50 about 40 ms, N = 23 about 13 ms, N <= 12 under 6 ms; the slowest of the 3,000 took 487 ms

### What went wrong, in the order it was found

- **A launch scaled by each quad's own cruise sent the rows into each other.** Every quad launched at its own k, and a back row quad that was going to win was 20% quicker off the blocks than the slow quad ahead of it, so rows met inside a second in a pack 15 m long, and the lane planner had no room. The launch is now the same for everybody and each quad's own speed is blended in over the next three seconds. That kept the closed form.
- **My own cost function made quads migrate into their neighbours' lanes.** A small penalty for the edge lanes pulled every edge quad inward at the first chance, into the grid lane of a row mate who had not been planned yet, who then had nowhere to go (the planner's failures all said "blocked at 1.8 s", exactly). Lanes are held for the first 2.7 s now, which is conflict free because speeds are still common, and the penalty is gone.
- **The generator's quick check had a wrong formula**, the gap along the track as a difference of two absolute arc lengths scaled by lane factors, which both hid and invented violations. It is the gap in s times the mean lane factor, with a conservative screen first.
- **A faster `tabulatePath` left the frames after a short path at zero**, so every quad in a single row field sat at the origin. The quick check caught it within one run, which is its job.
- **A clothoid is not smooth enough.** The smoothness test I wrote found jumps of 9.7 m/s^2, always at the ends of a transition, always for a quad in an edge lane. A quad at offset u covers 1 - u kappa of path per metre of line, so while curvature ramps its speed changes at -u kappa' s'^2, and a linear ramp has a kappa' that switches on and off. The transitions are raised cosines in curvature now, which turn the same angle over the same length, so the lap is the same. The loop also closes to 4e-14 m now, from 4e-7, because the heading is integrated exactly.
- **The stories were far too big, and I only saw it by looking.** Every check was green and the chart of a 12 name race showed the early leader 40 m clear of the whole field and the winner clawing back 40 m with a rocket surge. They now start at about twice the size of ordinary variation and escalate only as far as the promise needs, which also asks for a visible deficit (4 m at half way) and a visible lead (3 m) rather than a hair. This is the strongest argument for `tools/race-chart.html` in the brief.
- **The repair for "no lead change in the last third" made it worse.** When the winner had passed too early, the loop made her push stronger, which makes her pass sooner. It now tells the two failures apart and softens and delays the push. 71 of the 3,000 plans, all `comeback` at 15 s, had an unkept story at that point.
- **`fitBand` shrank every bump of a quad to fix one dip**, taking the clipping rival's early lead away with her dip. It now softens only the bumps acting where the speed leaves the band, and the repair loop is capped at what the band can hold. Down to 15, then to 1 of 3,000 with 24 attempts, then to 0 by swapping to the sturdy story after 14.
- **The generator sat exactly on the brief's gap limits**, so 110 plans measured 0.0799999 s. It asks for 0.045 and 0.085 now.
- **Two of my own thresholds were wrong.** The cosine test compared against `Math.cos(Math.PI * x)` out to x = 4, where the reference is the one in error; it covers [-1, 1], the range the plan uses. And I invented an 80 degree cap on tilt, which a quad at 30 m/s in the outer lane of a bend, descending in a lane change, exceeds at 81.4 degrees. That is 3.1 g of thrust, which a five inch with a thrust to weight of 7 to 9 makes at under half throttle, so the physical limit is thrust and the test asserts 5 g, with "never inverted" (88 degrees) and the tilt printed. This is an argument and not a quiet loosening: the 80 was never the brief's.
- **The first version of `measure` took 50 ms and its own loops, not the maths, were half of it** (one array per quad, hopped across for every frame). Frame major flat arrays took it to 31 ms.

### Decisions to know about

- **The fleet can be scaled to about 1.7 times real size before props can touch**, because no two quads are ever closer than 0.85 m centre to centre. Milestone 3 decides the scale from what the camera needs and records it.
- **Check 8 is computed over all 2,400 plans of N >= 5 in the 3,000**, not a separate 1,000, so it is "the same plans" as the brief says for checks 6 and 7, and the story weights are the natural ones, not forced.
- **The tail is a long way back.** With 50 names and gaps between places of 0.085 s or more, the last quad finishes about 6 s after the winner and 140 m behind at the finish, which is 45% of a lap. The camera follows the leading group and the tower shows everybody.
- **`npm test` now takes about 27 s on 4 threads**, which is the cost of measuring 3,000 plans at 60 Hz over every pair of quads. It is not "seconds" on a small machine.
- The plan's cross section is a lattice of 9 lanes by 4 levels (1.3 m and 0.9 m), and the planner keeps 0.85 m. After the hold it tries the plain path first, and only runs the dynamic programme if that collides, which is what made N = 50 take 40 ms and not 95.

### Not done, by design

The track document for the simulator (it needs the simulator's schema, which arrives with `sim/` in milestone 3), and everything on screen.

## 2026-10-03 | milestone 3 | The world

### What changed

- **`scripts/vendor.js` and `sim/`**: the simulator's import closure, 44 files, copied byte for byte from its repository root at commit 787ea595a (clean), with `sim/MANIFEST.json` and the lint holding every hash. `NOTICE` records what came from where.
- **`src/layout.js`** writes the track document the simulator's field is built around, from `src/course.js`'s numbers: eight flags in flying order on the inside edge of the track, one `startPads` (nine stands, one to a lane, which is the front row of the grid), and a `groundLogo` per sponsor mark. It uses the simulator's own `createTrack`, `createElement` and `courseFromDocument`, and reads as a closed lap with no warnings.
- **`src/world.js`** is the join: `buildShell`, `buildFieldScene`, `buildComposer`, then the picker's own things in one group lifted by the ground's height. `frame({ shot, t, k, plan, count, ... })` places the fleet, aims the camera, and draws.
- **`src/fleet.js`**: up to fifty of the simulator's five inch quads in about forty instanced draws, with the livery as an instance colour, spinning props, and its own write into the post chain's normal and depth target so the world's ink does not run through the quads (see "What went wrong").
- **`src/gantry.js`**: a tube frame, a vinyl header printed on both faces with the chequer and the event title lettered on it, four lamps standing proud of both faces, a scoreboard for the fingerprint, and a chequered finish line across the track.
- **`src/boards.js`**: a ring of about eighty vinyl boards, spaced evenly along the offset curve, in the `BANNER` palette, painted with the simulator's chequer, hems and lettering; the wordmark and `webfpv.org` when there are no logos, and the marks round robin on a panel the colour of their own border when there are.
- **`src/grid.js`**: rows two onward of the grid, rebuilt as merged geometry when the count changes. **`src/camera.js`**: the five shots as pure functions of the plan and the clock. **`src/frame.js`**: the one place the plan's frame becomes Three.js's. **`src/livery.js`**: OKLCH colours a golden angle apart.
- **`tools/fly.html`**: a development page that flies a plan round the field with no UI (`?n=23&length=30&graphics=low&speed=1&logos=2`, and `?manual` for scripts). It is not a draw and says so.
- **`tests/frame.test.js`, `layout.test.js`, `camera.test.js`**: 22 tests. `CLAUDE.md` has three new decisions.

### Measured

    npm test        82 of 82 pass, 0 skipped, 27 s wall on 4 threads
    npm run lint    10 of 10 clean, 29 source files, sim/ equal to its manifest

    the field builds in 2.3 to 4.2 s on the software rasteriser at 1280 by 720 (every preset), with no console error or warning
    one frame, 50 quads, High:  116 draw calls and 1.11 M triangles on the rail, 182 calls in the paddock, counting the colour pass, the
                                ink prepass, the shadow map and the fleet's own geometry pass. The fleet is about forty of them.
    the leading quads, at 1920 by 1080, over nine plans (5, 23 and 50 names, every length), the top three places, drawn at 1.7 times life size:
                                median 48 px, 5th percentile 37.1, least 29.6. The brief asks 40 for the leading group.
    the rail's worst yaw rate over those plans, 120 samples a second:  44.9 degrees a second   (brief: at most 50)
    the leader in frame from 1.7 s to the line:  0 of 17,786 frames at 16 by 9, and 0 of 17,786 on a phone held upright
    the camera is behind the line by 6 m, never past it, and still by the time the last quad has crossed
    the closest two of fifty livery hues are 0.011 apart in the chroma plane (entries 0 and 34); neighbours are 0.24 apart

### What went wrong, in the order it was found

- **The brief's "the fleet goes on layer 0" cannot be done with instancing.** The post chain's prepass overrides every material with a shader that has no `instanceMatrix`, so an instanced fleet on layer 0 is drawn at the origin there, and the world's ink lines (a board's frame, the treeline) run through every quad. I found it by reading `post.js` before writing a line of the fleet. The fleet is on layer 4, which the prepass never draws, and writes itself into the post chain's own normal and depth target afterward, as one instanced draw on layer 5 through the same packing, by wrapping `post.composer.render` (a public property of the object `buildComposer` returns). Nothing in `sim/` is touched. The first pictures with 23 quads showed inked silhouettes on every one, and no ghost at the origin.
- **The pitch is painted 2 cm above the ground, and my finish line at 1.2 cm was under it.** Moved to 4 cm with a polygon offset. Then I had rotated the strip a quarter turn as well, which laid it along the track instead of across it, and the picture showed it.
- **A camera abeam of the line films every finish through a post.** The first rail stopped square to the line and the gantry's near upright was in the middle of the held frame. It stops 6 m short, so the line and the gantry are on the right of the frame and the pack crosses the line in the right third.
- **The rail followed the group's middle and put the leader at the left edge.** It follows three parts leader to one part the mean of the leading five, with 3.5 m of room ahead once the opening is over.
- **The rail turned 54 degrees a second in a bend, and the brief says 50.** A camera abeam of the pack turns at the pack's own rate, which is speed over radius, and a quad at 28 m/s on 30 m is 53. It is now not allowed to go round a bend faster than 44 degrees a second, which is 23 m/s there, and falls a few metres behind in the fastest stretch and catches up on the next straight. That needs memory, so it is a table worked out once per plan from the plan alone; the camera is still a function of the plan and the clock and nothing else. 44.9 measured.
- **The aerial turned 82 degrees a second at its end.** I slid the eye and the look-at point past each other, and the bearing between two points sliding past each other changes quickest where they meet. The eye goes in a line and the look is turned by angle through the shorter way round, which is the easing's own rate.
- **On a phone held upright the leader left the frame in 4 frames of 17,786**, always the innermost lane at the finish, 0.5 degrees out of a 46 degree field. The minimum horizontal field on a narrow window is 50 degrees now.
- **The paddock and aerial shots put the quads on the race clock** because `frame()` gave the fleet its `t` whatever the shot, and the orbit's clock is not the race's. A scratch picture of the paddock at t = 3 had quads in flight. The fleet is on its blocks unless the shot is the rail or the held frame.
- **Every flag wore the simulator's green cue** until `map.setNextGate(-1)`, which dresses every marker dark: it is the target glow, not an outline, and the field only dresses a gate when told which is the target.
- **Chrome warned about a canvas read back twice** the moment a sponsor's mark was on the grass: the field's pitch reads its whole sheet to fade its edge and does it again when the mark has decoded. Check 12 wants no warnings, and the code is the simulator's, so the canvases the build makes are made with `willReadFrequently` by a patch on `getContext` that is on for the build and off after it.
- **Three of my own test mistakes**, none in the code: `deepEqual` says `-0` is not `0`, I folded a hue difference of 137.5 into 85, and the "left to right" test started at 0.5 s, when the leader is doing 4.5 m/s from a standing start.

### Decisions to know about

- **The fleet is drawn at 1.7 times real size and the rail is the brief's 20 m.** That puts the leading quads at a median 48 px at 1080 lines, and 37.1 at the 5th percentile, which is 3 px under the brief's 40, and 29.6 at the least (a quad in the outer lane of a bend, 30 m off). Going nearer than 20 m or larger than 1.7 would meet the 40, at the price of props that overlap on screen at the planner's 0.85 m separation. I left both as the brief and the planner have them and the test holds the numbers from getting worse (median 40, 5th percentile 36, least 28). Say if you would rather have the 40 and a rail at 17 m.
- **The livery tints the canopy, the front props, the front discs and the front LED bars,** and leaves the frame, the rear props, the rear discs and the rear LEDs as the simulator's, so the nose is always the coloured end. At race speed from the side the discs are almost edge on, so the colour is mostly the canopy and the front discs; the tag carries the number and the name, and the colour is a convenience.
- **19 of the fifty livery hues are outside sRGB at L 0.80 and C 0.13** and are clamped, which makes those a little less chromatic than asked. They are still 137.5 degrees from their neighbours.
- **The paddock orbit is centred on the grid, not on `map.attract`.** The simulator's descriptor frames the layout's bounds, which for a 140 m oval is a circle 80 m out, from which a quad on the grid is a speck.
- **The first row of the grid is the world's** (the document has to have a `startPads`), always present, so an empty grid shows a start line and not a bare field.
- **The simulator's `race.js` and a few other vendored modules can touch `localStorage`** when the simulator's own game asks them to. The picker builds none of those objects. `NOTICE` says so.
- **Frame time is not measured.** The software rasteriser says nothing about a real GPU. Draw calls and triangles are the numbers above; frame rate on real hardware is for the owner's pass.

### Not done, by design

Everything on screen: the setup sheet, the tower, the tags, the chip, the beats, the results page, sponsor intake (the stretch for the camera is `src/sponsors.js`'s, and `tools/fly.html` stretches its made up marks by hand to look at the grass), the draw log, sound, the flow and `scripts/shots.js`. The flip and the wobble are in the maths (`tests/frame.test.js`) and have not been looked at in a picture yet.
