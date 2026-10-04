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


## 2026-10-03 | milestone 4 | The flow

### What changed

- **`src/app.js`** is the page's one script and its state machine: loading, setup, sealed, lights, race, finish, results. Arm makes the draw (`drawLive`), writes it to the log, and only then starts the show. The plan is made from the order and the show seed `replayOf` recomputes from the receipt, for a live show and a replay alike, so they are one race. One `requestAnimationFrame` loop owns the clocks, clamped to a tenth of a second a frame so a hidden tab comes back where it left off. `world.js` is imported on demand, after asking an unseen canvas whether WebGL2 exists, so a page with no WebGL or no CDN still draws, seals and shows its results.
- **`src/results.js`** builds the results page when the last drawn winner has crossed and not before. The big panel's picture is the world's, drawn for the panel and copied into a canvas of its own; second and third have their panels when they are drawn; the order, the seal (fingerprint, commitment, the seed revealed, a mint tick if the revealed seed gives the fingerprint that was on the glass) and four actions. The focus lines converge on the winner, are seeded from the commitment and never move.
- **`src/page.js`** (the manga page's geometry), **`src/titles.js`** (the board's lettering join), **`src/hud.js`** (clock, lap, tower, tags, beats, the corner chip, the live region), **`src/show.js`** (the list, the odds, the lamps, the clock through a photo finish, the standings, the beats, the tag placement), **`src/store.js`** (localStorage inside try and catch, the draw log of fifty), **`src/sponsors.js`** (four marks, trimmed, stretched for the rail camera, kept as a smaller copy), **`src/lens.js`** (the grade pass's barrel distortion as arithmetic, so a tag lands on its quad and the winner lands in the middle of a panel that is not the middle of the window).
- **`src/camera.js`** has a `hero` shot, **`src/world.js`** has `screenOf`, a view `offset` on `frame()`, and the live distortion.
- **`index.html`** is the page: the setup sheet (title, names with a gutter that numbers and colours each line, the odds, a comma list offer, numbers 1 to N, length and winners, four sponsor slots, the arm switch pinned to the foot of the sheet, the draw log, the links), the race overlay, the results page's styles, the forced colours and reduced motion blocks. **`verify.html`** is in the family's furniture, with a policy of its own and still importing `src/draw.js` and nothing else.
- **`scripts/csp.js`** writes each page's Content-Security-Policy from the page's own text: `default-src 'none'`, `connect-src 'self'`, three.js from its one directory of the CDN, each inline block by its SHA-256. **`scripts/shots.js`** is checks 11, 12 and 13. **`scripts/lint.js`** has six new checks (below). `CLAUDE.md` has one new decision and one new working rule.
- **Tests**: `lens`, `show`, `store`, `sponsors`, `page`, a hero shot test in `camera`, and the new lint helpers, 43 more than milestone 3 left.

### Measured

    npm test        125 of 125 pass, 26 s wall
    npm run lint    16 of 16 clean (new: the live page's imports from draw.js, each page's policy current and strict, no inline
                    style attributes, every id the scripts ask for is in the page, no Betaflight or partner name in the picker's
                    own pages, .nojekyll)
    node scripts/shots.js    83 of 83 checks, seven scenarios (flow 29, sheet 16, actions 10, bare 8, reload 8, phone 6, reduced 6)

    check 11, flow: 50 names with a name twice, four logos dropped one at a time and one rebuild of the field for the four, the seal on the glass
                    (the log already holds the draw, and its fingerprint is the one shown), two amber lamps, mid race, the finish with
                    "<winner> wins", the results (winner, all fifty rows in the drawn order, the seal ticked, the winner's time equal to the
                    time the clock stopped at, the picture drawn), the receipt downloaded as a file and copied to the clipboard, a replay that
                    says REPLAY and issues nothing, and the verify page with the receipt pasted, once true and once with one seed digit changed
    check 12:       no console error or warning and no policy report in any of the seven scenarios, and every request the page makes is for
                    this server or for three.js at 0.160.0
    check 13:       the page read 394 to 402 times while a race ran, and at none of them before the results was there a results page, a
                    panel, a winner's title or a finishing order in the document. To see that the check can fail I put a results element
                    in the document from the start of the race: it failed at once, with the sample, and the file was put back byte for byte.

    a plan for fifty names takes 31 to 63 ms to make in Node (the median of twelve, at each length) and 98 ms at worst, the beats 2 to 7 ms, so
    both are made between the draw and the seal without a frame being missed
    the field builds in 3 to 4 s on the software rasteriser at the low preset; the whole flow (50 names, four logos, a 30 s race at ?speed=6,
    the results, a replay, the verify page) takes about 70 s of wall clock

Not measured: frame time on a real GPU, a real phone (the phone scenario is a 390 by 844 window with touch emulation), any browser but Chromium, a screen reader, fullscreen on a real display, or whether anyone enjoys it. Those are the owner's pass.

### What went wrong, in the order it was found

- **`drawHero` was gated on a variable that is assigned after the call it is made inside.** The page asks for the winner's picture from its first layout, which runs inside `buildResults`, before `results` has a value. Found by reading it back, before the first run, and the gate is a flag that is set first.
- **The results page was sized for a window 900 pixels high and no other.** The page's size variables were set on the document, and the stylesheet gives the page defaults of its own, which win on its subtree: `--u` stayed 9 px. A 1600 by 900 window is exactly 9, so the first pictures were right. The phone run had type 28 px high in a 390 px page. They are set on the page's own root now, `--u` has a floor of 5.2 px (a hundredth of a phone's width is under four), and the small type has floors of its own.
- **I edited the stylesheet once without running `npm run csp`, and the browser refused the whole stylesheet.** Check 12's list had it ("Refused to apply inline style") on the first run after. That is what a hash is for, and what the new lint check is for: it fails on a stale policy, and on a policy that has lost `connect-src 'self'` or gained `unsafe-inline`.
- **The phone overlay's rules were above the rules they override**, so the corner chip had `top` and `bottom` both set and stood from the top of the screen to the bottom. The later of two equal rules wins; the phone block is after everything it overrides.
- **The wordmark stood on the first row of the timing tower, the seal chip stood on the Present button, and a name tag stood on the tower.** The wordmark is hidden while the overlay is up, the chip is under the bar, and `placeTags` takes the tower, the clock and the chip as boxes no tag may cover, the forced top three included.
- **The winner's picture was a dot.** At 6 m with 36 degrees the quad was about 25 px in a 1537 px panel. At 3.4 m it was about 85. It is 2.4 m off, a little below, looking up, 30 degrees, so the quad is about 140 px against the trees and the boards, in the middle of its flip. The camera test holds the aim exactly on the winner, because the page's offset is worked out from where the aim is.
- **Three in the lint.** A comment that named the browser's generator in full tripped the grep for it, which has no exceptions on purpose. The policy's CDN source was a bare origin, which allows every package on it and which the URL check also refused; it is the pinned directory now. And three.js says "A WebGL context could not be created" on the console three times when there is none, which is a page with nothing wrong with it reporting errors, so the page asks first.
- **`?speed=` first scaled every clock, and the seal and the lights were too short to photograph.** It scales the race clock now, which is the long part.
- **Four mistakes in my own checks**: a click on the arm switch while the sheet was still sliding in lands where the switch will be and is not (the checks wait for the transition); I miscounted the log's entries in the actions scenario; a tampered name makes a receipt the page cannot read at all, not one it fails, so the tamper is one digit of the seed; and the no WebGL page's winner name was ink on paper, a solid blob, now a dark mint.

### Decisions to know about

- **The results page arrives 2.6 s of race time after the last drawn winner crosses**, which is the flip, the beat that names her and a breath. It does not wait for the field: fifty quads trickle across for several seconds after the first, and nobody watches that. "Skip to the result" is on screen from the moment of the seal, large and mint under reduced motion.
- **The picture on the results page is copied into the panel's own canvas.** A window onto the world's canvas behind the page is shorter, and wrong the moment the strip scrolls. `CLAUDE.md` says why and what must not move.
- **Race again and Draw again without the winners arm at once.** The second takes the winners' lines out of the list by entry number when the sheet is as it was when the draw was made, and by name when it is not.
- **The log lists earlier draws' winners** (the operator's own browser, theirs to see), and it is not redrawn between the seal and the results, so the draw being shown is not in the document before the winner crosses.
- **Nothing in the page exists for the tests.** Three words on `<body>` (`data-state`, `data-field`, `data-lamps`) say what the page is doing so a check can wait for it; nothing reads them back, and no field, parameter or key sets a seed or a winner (the lint keeps `drawWithSeed` out of every live file).
- **The sound button is in the page and hidden**, until it does something.
- **The verify page keeps a text wordmark,** because lettering would be a second import and the page's whole claim is one.

### What I saw and did not fix, for milestone 5

- **The aerial is not good yet.** At the amber lamps the camera is looking at the horizon with the gantry at the bottom right corner: the lamps are the point of the shot and they are out of frame.
- **The rail's first frame has the gantry's near upright in the middle of it**, because at t = 0 the camera is abeam of the line and the grid is behind the line. It slides out of frame in a second, and the first second is the launch.
- **On a phone held upright the pack is a few pixels**, because the lens widens to keep 50 degrees across.
- **The spread's order panel shows nine rows**; the rest scroll inside it. The seal panel's last paragraph is cut off at 900 px high.
- **The quad in the winner's picture is a dark upside down shape**; its colour barely reads. The livery wants a look at that moment.
- **The photo finish's slow motion has not been looked at in a picture**, and the winner's flip has been looked at once, at the half way point.

### Not done, by design

Sound, the calm rail for reduced motion (today the lights cut to the rail's first frame, the seal is a chip and the skip button is large), the aerial, the phone's rail, the README, and the final pass over the policy. 

### Open questions for the owner

The site icon's accent (the page ships `data:,`), whether the picker is mounted under `webfpv.org/<mount>/` (every URL is already relative), and whether any official partner mark appears here (none does: this app runs no Betaflight code and a placement is agreed one at a time). No decision in this milestone needed the owner: nothing changed the algorithm, added a dependency, showed anything a sponsor could read as an endorsement, or touched another repository.


## 2026-10-03 | milestone 4, second pass | What the brief says that the first pass did not do

I read the brief's screens and show sections against the page again after the push, line by line, and found five things it asks for that I had not built, or had built the other way round.

- **Arming is off past fifty lines.** The brief says a 51st line says fifty is the most the grid holds "and arming is disabled". I had let it arm with the first fifty and struck the rest through, and my own check held that. The line is struck, the status says fifty is the most and how many lines to take off, and the arm switch is off until they are gone. The check now says so, and also that "Numbers 1 to N" turns it back on.
- **The event title is lettered on the results page**, top right of the big panel, as it is on the gantry.
- **The draw log has a clear control** (it asks twice), and each entry copies and saves its receipt as well as replaying and verifying.
- **With no WebGL there is a countdown**, 3, 2, 1, between the seal and the results page. It was the seal and then the page.
- **The quads on the grid carry their names while the sheet is up.** "Each name typed drops a quad onto the next block with its tag." The tags go through the same lens and the same placement as the race's, and the sheet's own box is not a thing they avoid, because the sheet is over them. The drop in and the lift off are milestone 5's.

Found on the way: the tower laid its rows out at the default row height, which is 28 px, and the real height is 28 times `--s`, so the tenth row was nine pixels off. A row is measured when it first shows.

### Measured

    npm test        125 of 125 pass
    npm run lint    16 of 16 clean
    node scripts/shots.js   91 of 91 checks, seven scenarios (flow 31, sheet 17, reload 11, actions 10, bare 10, phone 6, reduced 6),
                            and check 13 read the page 394 to 457 times through a race

### What went wrong

- **A check that passed for the wrong reason, in my own command.** I chained the unit tests, the lint and the shots with `&&` behind a `| grep` and a `| tail`, and a pipeline's status is its last command's, so a failing suite would not have stopped the chain. I ran each on its own afterwards, with its own exit code, and put that in this entry's numbers.


## 2026-10-03 | milestone 5 | Polish

### What changed

- **Sound** is `src/sound.js`. The motors are the simulator's own `MotorAudio` (four oscillators at blade pass frequency), driven by the pace of the leading group: they spool up under the descent, run through the race, click at the line each lap and spool down after the winner has crossed. The three amber tones, the long green one and the winner's sting are this app's own, plain oscillators with an envelope on a bus the mute reaches. Nothing is built until a pointer press or a key, the mute is a kept preference, and `body[data-sound]` says what it is doing so a check can wait for it.
- **The aerial** is an orbit round the line instead of a straight run, so the gantry's lamps stay in frame from the first amber to green on a wide window and on a phone, and the oval's four ends are in its first frame. **The rail's first frame** aims behind the pack for the first seconds, so the gantry's near upright is not a pole through the middle of it.
- **The calm rail**, for a person who has asked for less motion: wider (56 degrees), no more than 25 degrees a second, and when the leader gets near the edge of the frame it cuts to where the camera would have been and is still. It has a table of its own per window shape, and the race rail's table is untouched by it. The paddock orbit is still, no quad drops or lifts, and the results page's panels do not open one after another.
- **The finish frame**: the rail parks 6 m short of the line as before, and as it comes in it turns to look at the line and widens by 4 degrees, in one eased ramp over the last 30 m of its run. The winner's flip used to happen off screen.
- **The paddock**: a name typed drops a quad onto the next block (a fall under gravity and one small bounce, a few hundredths of a second after the one before when a list is pasted), a deleted name's quad lifts off and shrinks away. `src/paddock.js` is the two curves, pure, so a test holds them.
- **The results page opens** over the held frame: the paper, then the panels one after another with the picture first. `src/page.js` gives each panel its place in that order and the stylesheet does the rest.
- **`README.md`** says what it is, how to use it, how the draw works, how to check one three ways, how to run it, how to check the code, what is where, and the licence.
- **A stray caption**: "Type names to fill the grid" stood across the middle of a replay started from the draw log with nothing typed on the sheet. One function, `syncEmptyNote`, decides it, from the state and from typing and from the field's build.
- **Tests and checks**: `tests/camera.test.js` has four new tests (the lamps in frame, the oval's ends and the near upright, the calm rail, the finish frame), `tests/sound.test.js` five and `tests/paddock.test.js` two. `scripts/shots.js` has two new scenarios, `sound` (the real audio graph on an `OfflineAudioContext`, the buffer read) and `photo` (a kept draw whose first two cross 0.07 s apart, in `tests/lib/photo-finish.json`), and more in the others: the live audio wiring seen from outside, the drops, the opening, a replay from an empty sheet.

### Measured

    npm test        137 of 137 pass (125 at the end of milestone 4: five camera tests, five sound tests and two paddock tests are new)
    npm run lint    16 of 16 clean
    node scripts/csp.js --check   both pages current
    node scripts/shots.js   128 of 128 checks, nine scenarios (flow 37, sheet 18, actions 11, sound 20, reduced 7, reload 13, phone 6,
                            bare 10, photo 6), about three and a half minutes of wall clock; check 13 read the page 407 times through the race

    the finish frame, the winner in the rail's frame after the line, over the same nine plans before and after (the flip takes 0.9 s):
        wide window       0.08 to 0.35 s before, 0.45 to 1.03 s after, median 0.73
        phone upright     0.02 to 0.26 s before, 0.30 to 0.76 s after, median 0.53
        calm rail         0.31 s at the least and 0.57 median on a wide window, 0.00 and 0.11 on a phone (not changed, and not held by a test)
        in the page       the photo finish draw replayed at the real speed: the winner's tag on the glass for 1.00 and 1.04 s of race time
                          after the line on two runs, and for 0.48 s with the turn taken out, which is where the check's 0.75 came from
    the leading quads' width at 1920 by 1080, the top three over nine plans, before and after the turn:
        5th percentile 37.1 and 36.8 px, median 48.0 and 48.0, least 29.6 and 29.6; the test's floors (36, 40 and 28) were not touched
    the photo finish, live: the last 0.8 s runs at 0.32 to 0.34 of the speed over 21 or 22 frames, and the beats go Photo finish, then "Raj wins"
    the rail's worst yaw rate 44.9 degrees a second over nine plans at 120 Hz, with the turn in; the leader out of frame in 0 of 17,786 frames,
        on a wide window and on a phone held upright
    the calm rail's worst yaw between cuts 26.5 degrees a second on a wide window and 26.6 on a phone, cuts at most 7.5 a lap wide and 18.0
        on a phone, and the leader out of frame in 0 of 35,559 frames at both

    two mutation tests: with `syncEmptyNote` taken out of `setState`, the new reload check fails and nothing else in that scenario does; with the finish turn
    taken out, the photo scenario's on-glass check fails at 0.48 s. Each file was put back and compared byte for byte with the copy kept first.

Not measured: a real GPU, a real phone, any browser but Chromium, how any of the sound sounds, the feel of any camera move in motion (about ten frames a second here), a screen reader, or whether anyone enjoys it. Those are the owner's pass.

### What went wrong, in the order it was found

- **MotorAudio's music player broke the policy.** The first time a gesture built the graph, check 12 reported a Content-Security-Policy violation on the console, and it was a media one. The player sets an audio element's source to the first track of a crate, and the page's policy has no `media-src` and never will. Switching the music off is not enough, because attaching it is what asks. The instance's `music` is replaced by an object that does nothing, and `sim/` is untouched.
- **Two earlier aerials turned too fast, and one lost the gantry.** A straight run past the line turned the camera at 67 degrees a second where it went by, and an angle interpolated between two ends lost the lamps in the middle. The orbit makes the turn the bearing's own swing, 34 degrees a second at its fastest.
- **The live sound checks assumed a second of wall time between lamps and the wrong windows for the sting.** The clock runs slower than the wall on a software rasteriser (a frame is clamped to a tenth of a second), so the checks use ratios and the sting's four notes at their real offsets.
- **The calm rail counted hundreds of cuts.** After the camera has parked and the pack has gone on past it, every frame is "the leader is outside the frame", and a cut that would not move the camera is not a cut. And the threshold did not know the shape of the window. It counts only cuts that move the camera, and the table is made for the window's aspect, in quarters.
- **The reduced motion paddock still orbited.** It showed as about five pixels of drift in a name tag, found by the check that nothing animates. The orbit stands still when the setting is on.
- **A quote escaped twice** in the sound scenario's page script, which was a syntax error in the page and not in the file.
- **The photo finish was checked as arithmetic and passed, and then looked at, and showed two things.** The clock did run at a third inside the window, and the beat did say so. But the picture had "Type names to fill the grid" standing across the middle of it, and the winner left the frame between 0.1 and 0.35 s after the line, in a flip that takes 0.9 s: the one thing the brief says the winner does, nobody would see until the results page. The caption was a state bug, found by looking. The flip needed the lens to turn to the line, and I found how much by measuring the winner's bearing in the held frame over nine plans, before changing anything.
- **Widening the lens until it holds the whole flip would have been the wrong fix.** The frame would have to hold about 17 m of approach and 20 m of flight after the line, 37 m across at 20 m, which is a 55 degree lens and quads about 40 per cent smaller, and a photo finish between two ten pixel specks says nothing. Turning the aim to the line and widening by 4 degrees costs 0.3 of a pixel at the fifth percentile of the leading quads' width (37.1 to 36.8 px at 1080 lines) and nothing at the median (48.0).

- **My first threshold for the photo scenario's on-glass check was half a second, and it was 0.02 s from the broken value.** I took the turn out to see the check fail, and it failed, but only just: the tag of a top three quad stands where its quad is and a quad has gone before its tag does, so the page sees 0.48 s where the geometry says 0.25. It is 0.75 s now, between the two values I measured (1.04 with the turn, 0.48 without). The check is new and had never been relied on, and the number was moved to make it tell the two cases apart and not to make anything pass.

### Decisions to know about

- **The sound is silent until a gesture and never plays music.** `CLAUDE.md` has the decision and the reason.
- **Why 6 m and 4 degrees.** The turn aims the parked camera at the line, which is 6 m ahead of it. Aiming 2 m past the line would keep the winner in frame longer (0.60 to 1.29 s) and loses the leader on the way in on a phone held upright, by 2.3 degrees, so it is not allowed. A widening of 8 degrees instead of 4 adds about a tenth of a second on a wide window and makes the quads a tenth smaller, and does nothing on a phone, whose lens is already the 50 degrees across a narrow window needs.
- **The finish frame does not apply to the calm rail**, which is wide already, and where a turn of the lens would be a glide. The winner is in the calm frame for 0.31 s at the least and 0.57 s median on a wide window, and for 0.00 s and 0.11 s on a phone held upright, which the calm tests do not hold. A person who asked for less motion sees less of a flip, and I took that as the request being kept and not as a fault.
- **With more than one winner the flip is in the held frame**, because the brief has the camera hold until the last drawn winner has crossed. The first place's flip happens in front of whatever else is crossing, and the results page's picture shows it either way.
- **The phone held upright has the same finish frame**, and the winner stays in it for a shorter time (0.31 to 0.76 s, median 0.53), because its frame is narrower. It is a phone's compromise, said in the test.
- **The page's opening is staggered in CSS**, with the order in `src/page.js`, and the reduced motion block zeroes the delays too.
- **A quad that is lifting off is still in the draw** (`count` is more than `target`), and a race that starts while one is lifting takes it away at once.

### What I saw and did not fix

- **On a phone held upright the pack is a few pixels.** The lens is at the 50 degrees across that a narrow window needs to show the track, and the rail is 20 m from the line. The tags carry it. Landscape is the way to watch a phone.
- **Nobody has heard the sound.** There is no speaker in this container. The offline render proves the notes are at their pitches and at their times, that the motors follow the pace, that the click is at the line and that the mute is obeyed, and it proves nothing about whether it sounds good.
- **The frame rate here is about ten a second**, on a software rasteriser. The easing of every camera move, the feel of the descent, the drop of a quad and the page opening were judged from stills and from arithmetic, and never from motion. That is the owner's pass.
- **The seal panel on the results page scrolls inside its panel at 900 px high**, so its last paragraph is cut at the foot until it is scrolled. The panel is built to scroll, with a thin bar.
- **The winner's quad in the results picture is mid flip and upside down**, a dark underside with a lilac blur of rotor. It reads as a quad in the middle of a flip, which it is.

### Not done, by design

A `v2` of the algorithm, a server of any kind, any partner mark, the site icon, and the picker's own sound design beyond the tones and the sting. The brief's list for this milestone is complete.

### Open questions for the owner

The site icon's accent (the page ships `data:,`), whether the picker is mounted under `webfpv.org/<mount>/` (every URL is already relative, and the `?v=` rule would apply from that day), whether any official partner mark appears here (none does: this app runs no Betaflight code and a placement is agreed one at a time), and whether to push the branch to `main` again (it is a fast forward of the owner's last push; I have not).


## 2026-10-04 | milestone 5, follow up | Bigger drones, and a zoom on the photo finish

The owner's words: "can we make the drones bigger so it's easier to follow along and maybe zoom in on the PHOTO finish". Nothing here changes the draw or the plan: the same receipt flies the same race, and only how it is filmed and how big the quads are drawn has moved. No decision in this entry needed the owner: no algorithm, no dependency, no partner or sponsor, no other repository.

### What changed

- **The quads are drawn 2.2 times life size, up from 1.7**, and 2.2 is the ceiling. The planner keeps every pair at least 0.88 m apart (the least closest approach in 36 plans of 5 to 50 quads at every length was 0.879 m, the median 0.900), a quad's span across its props is 0.347 m times the scale, which is 0.76 m, and that leaves 0.12 m in the worst case. The old comment in `src/layout.js` read the planner's guarantee as 0.5 m. The start blocks grow with it and are still well under the lane spacing across.
- **The race lens is 26 degrees, down from 34**, with the camera aiming 3 m ahead of the pack and not 4.5, so the leader sits nearer the middle of a narrower frame. The window's minimum horizontal field is 44 degrees (it was 50), which is what a 16 by 9 window needs to be left at 26: at 50 the rule would have widened it to 29.4.
- **A photo finish zooms** (`photoFit` and `railLens` in `src/camera.js`). The lens narrows as far as keeps the first two quads and the line inside the frame, each no further out than 80 per cent of the way to the edge, down to 14 degrees, holds through the second's crossing, and opens to the finish lens, 40 degrees, as the winner flies off for the flip. There is no rule about gaps in it: a clear win has the second far behind, the lens would have to be wider than the race lens to hold both, and nothing narrows. It is a pure function of the plan and the clock, smooth by construction (a soft maximum and a soft absolute value, no filter that remembers), and it waits for the aim to come round to the line, because while the camera is still following the pair they are in the middle of the frame and a lens that fitted them there would pump out again as the aim swung.
- **A phone held upright zooms too.** The rail works the window's minimum horizontal field out itself and hands back the lens that results, so a zoom on a narrow window is a glide down from the lens that window really has, 71 degrees high, and not a step from a 26 degree lens that would be 15 across. The finish frame goes back to the 50 degrees across the phone had, for the flip, and the calm rail never left it.
- **`world.js`** passes the shot's own minimum (`view.minH`) to `fovFor`. **`tests/camera.test.js`** goes from 14 tests to 16: the photo finish test (both quads inside the fit at every instant, over the nine plans and a close finish and a clear win found by label, on a wide window and a phone; narrowest lens; a close finish tight at the line; a clear win not moving; the calm rail not zooming) and the smoothness test. **`scripts/shots.js`**'s `photo` scenario reads the zoom from outside the page.
- `CLAUDE.md` has the finish lens, the photo zoom and the fleet scale ceiling, and the README says what a photo finish does.

### Measured

    npm test        139 of 139 pass (137 before: the photo finish test and the smoothness test are new)
    npm run lint    16 of 16 clean
    node scripts/csp.js --check   both pages current
    node scripts/shots.js   129 of 129 checks, nine scenarios (flow 37, sheet 18, actions 11, sound 20, reduced 7, reload 13, phone 6,
                            bare 10, photo 7), about four minutes of wall clock

    the top three's width at 1920 by 1080, over the same nine plans, before and now:
        5th percentile 37 and 65 px, median 48 and 83, least 30 and 46
    the same on a 390 by 844 phone held upright: 11 and 17, 14 and 21, 9 and 13
    the leader in frame in every sampled frame, wide and phone, before and now. The least margin to the edge of the frame was 8.7 degrees
        before and is 4.8 degrees wide and 4.5 on a phone now, which is where a photo finish holds it at 80 per cent of the way out
    the same over windows of nine shapes, 0.46, 0.56, 0.75, 1.0, 1.33, 1.6, 1.78, 2.0 and 2.4 across to high: the leader out of frame
        in 0 of 8,895 frames at each, the least margin 4.5 degrees (the 44 degree minimum, at the narrow ones) to 5.7
    the race lens on a 16 by 10 window is 28.3 degrees, on 4 by 3 it is 33.8, on a square 44.0: the minimum, not the lens, decides there
    the lens at the line, a finish 0.046 s apart 15.6 degrees and the photo finish draw's 0.073 s apart 14.3, against 26 for the race lens;
        a clear win, 0.69 s apart, does not move from 26 at any instant from 1.5 s before the line to the line
    both of the first two inside 82 per cent of the way to the edge at every instant the lens is narrower than the race lens: 11 plans,
        wide and phone, every hundredth of a second from 1.5 s before the winner to 1.5 s after the runner up
    the lens through a photo finish steps at most 0.66 degrees in 1/120 s on a wide window and 2.25 on a phone, and 2.5 s after the line is
        the finish lens, 40 degrees (79.3 on a phone, which has its 50 across)
    the winner in frame after the line, of a flip that takes 0.9 s, before and now: wide 0.45 s at the least and 0.73 median, then
        0.49 and 0.78; phone 0.30 and 0.53, then 0.29 and 0.52
    on the page, replaying the photo finish draw at 1280 by 720: the first two tags 243 px apart at the line, against 133 with the zoom
        taken out, which is where the check's 190 came from; the winner's tag on the glass for 1.10 s of race time after the line (1.00 to
        1.04 before); the last 0.8 s at 0.31 to 0.35 of the speed
    the planner's closest approach, in 36 plans (5, 12, 23 and 50 quads, every length, three seeds): least 0.879 m, 10th percentile 0.900,
        median 0.900. Photo finishes by the quarter of a second rule: 16 of the 36.

    two mutation tests: with the fit ignoring the runner up, the photo finish test fails and nothing else in the camera tests does; with the zoom taken out
    of the lens, the live check's tags are 133 px apart and the check fails. Each file was put back and compared byte for byte with the
    copy kept first.

Not measured: a real GPU, a real phone, any browser but Chromium, how the zoom feels at the real frame rate (about ten frames a second here), or whether anyone enjoys it. Those are the owner's pass.

### What went wrong, in the order it was found

- **A narrower lens would have been undone by a rule I had already written.** The minimum horizontal field of 50 degrees, made for a phone, widens a 26 degree lens to 29.4 on a 16 by 9 window and to 32.5 on 16 by 10. I saw it before writing any of the lens, from the arithmetic, and not from a picture.
- **The first fit zoomed in during the approach and pumped.** Printing the lens against time before looking at any picture showed 15.6 degrees a second before the line, then 25.8, then 14.3, then 40: while the camera is still following the pair they sit in the middle of the frame and a lens that fits them there is tight, and as the aim swings to the line they drift out and the lens opens again. It is gated by how far the aim has come round, and the sequence is now one push in.
- **On a phone the zoom was clamped away.** The fit is a vertical number, and on a window a ninth as wide as it is high the minimum horizontal field decides the lens, so a request for 24 degrees became 71 and the zoom changed almost nothing, and making the minimum give way by itself would have been a cut from 71 to 24. The cap had to be the window's own lens, which the camera now applies.
- **The tests were measuring a different camera from the one on the screen.** They worked frames out with the default minimum and without the window's aspect, so on a phone they lost the leader in 5 of 17,786 frames and saw the flip for 0.21 s, and the calm rail lost it in 508 of 35,559. The page passes the shot's own minimum and the window's aspect, and the tests now do exactly that. No threshold of theirs moved for that: the flip floors are still 0.4 s and 0.25 s.
- **Two assertions did change, and they are said here.** The phone test asserted 49.9 degrees across, which is the old rule, and asserts the constant now, 44, with the finish frame's and the calm rail's 50 held beside it. The size floors went up, from 40, 36 and 28 px to 75, 60 and 42, to hold what the new lens and scale measure and not to let anything pass.
- **The calm rail lost the leader on a phone when the default minimum came down** (24 frames, and 32 cuts a lap against a limit of 20), because its table was made for 50. It keeps its own.
- **The first on-screen check of the zoom was going to be a number I had not measured.** The zoom cannot be read off the page except through where things stand, so the check is the gap between the first two tags at the line: 243 px with the zoom and 133 px with it taken out, at 1280 by 720, and the line is at 190.

### Decisions to know about

- **44 per cent of races are photo finishes by the quarter of a second rule that was already there** (16 of 36 plans), so the zoom and the slow motion are common, not rare. It reads as a feature of most races.
- **The lens is a few constants and the quads are one**, `RAIL_FOV`, `AHEAD_RACE`, `MIN_HORIZONTAL` and `FLEET_SCALE`, if it wants nudging. The scale has no more room. The lens has almost none: on a 16 by 9 window the 44 degree minimum already holds it at 25.6 degrees high, so a `RAIL_FOV` of 24 or 22 changes nothing there (measured, the median stays 84 px), and going tighter means lowering the minimum too, which narrows every window that is not as wide as 16 by 9 and a phone upright with it.
- **The finish frame is no longer the race lens plus four degrees.** It is the race lens until the winner crosses and the finish lens, 40 degrees, after, opening over 0.4 s, and the parked frame is the finish lens (the `held` shot and the rail at the end agree, which the finish test holds).
- **A window less wide than 16 by 9 gets a wider race lens**, 28.3 degrees at 16 by 10 and 33.8 at 4 by 3, because of the 44 degree minimum, and so smaller quads. It is the price of the rule.

### What I saw and did not fix

- **The timing tower covers the left fifth of the frame, which is where the chasers are in the approach.** In the half second before the zoom engages the runner up can be under the tower, and the pair are only both in the clear once the lens has closed in. A view offset that puts the picture's middle in the clear part of the window, the way the setup sheet's slide already does, is the fix, and it is not made.
- **The beat's lettering ("RAJ WINS") can stand over a tag** at the top middle of a tight frame, because tags avoid the tower, the clock and the chip and not the beat.
- **A phone held upright still shows the pack small**: the top three's median is 21 px on a 390 pixel window, up from 14.
- **Nobody has watched the zoom move.** The lens steps at most 0.66 degrees in 1/120 s on a wide window and 2.25 on a phone, which is smooth on paper; how it feels at the real frame rate, in slow motion, is the owner's pass.

### Open questions for the owner

Whether the quads want to be bigger still (it means a lower minimum horizontal field, and narrower windows pay for it), and whether the picture should be shifted clear of the timing tower.


## 2026-10-04 | milestone 5, follow up | Quads three times life size, and the winner's moment

The owner's words, in order: "make the quads larger still, its ok to be a bit commical, and zoom in and slow mo the winnder more", and, while that was being built, "also the final photo the quad is upside down" with a picture of the results page. Nothing here changes the draw or the plan: the same receipt flies the same race, and only how big the quads are drawn, how the finish is filmed and how fast it plays have moved. No decision in this entry needed the owner: no algorithm, no dependency, no partner or sponsor, no other repository. The two asks are recorded here with the date, 2026-10-04, as what this entry covers.

### What changed

- **The results photo is the right way up.** It was taken 0.45 s after the line, when the winner's flip is exactly half way round (`flip` is pi there), which the fourth milestone chose as the dramatic frame and the test asserted by name ("when the flip is half way round"). That was the bug, not a detail: the one picture of the winner there is had the winner upside down. `HERO_AFTER` is 0.1 s, with the flip 4 degrees in, so the quad is upright and at the line, and the test now holds `flip < 0.1` and the thrust axis pointing up.
- **The quads are drawn 3.0 times life size, up from 2.2**, on purpose. At 2.2 the planner's 0.88 m spacing left 0.12 m between props; at 3.0 a quad is 1.04 m across and the props of two quads overlap by about 0.16 m in the closest passes (translucent discs, so it reads as a bump). 3.4 would touch the next lane, which is where it stops being a bit comical, so it stops at 3.0. The start blocks keep 2.2 (`BLOCK_SCALE`): a block is as tall as the plan says a quad sits on its foam, so a quad of 3.0 stands on a block built for 2.2 with its props over the sides. `QUAD_HALF`, which the zoom fits, is 0.55 m, and tags stand 0.7 m over a quad, not 0.55.
- **Every finish is slow, not only a photo finish.** `slowWindow` in `src/show.js` runs the clock at a third of its speed from 0.8 s before the winner crosses to 1.0 s after, which is the whole of the flip: 5.4 s of the page's own. The photo finish's own window is inside it. `SLOW.close` is now `camera.js`'s `PHOTO_CLOSE`, so the lens and the clock cannot disagree about what a photo finish is.
- **Every finish zooms, on the winner alone in a clear win.** `photoFit` fits the first two quads in a photo finish and the winner in a clear win (`isPhoto`), and `railLens` runs its window to 1.5 s past whichever it fitted. A clear win used to keep the race lens to the line; it goes down to 14 to 17 degrees at the line now, and it is still one push in and one opening.
- **The picture cuts to the winner's chase camera for the flip.** The `hero` shot, which is the results page's picture, is the live cutaway: a tenth of a second after the line for a clear win and 0.05 s after the runner up for a photo finish (`winnerCut`), held to the results, with the tags put away under it. It is not made when more than one winner is drawn (the second and third place cross while the first is flipping) and not under reduced motion (a cut is a jump of the picture). It has its own minimum horizontal field, `HERO_MIN_HORIZONTAL` 30, so a phone held upright is not shown a tall strip of sky. When the page opens, the canvas the paper fades in over is left on the chase frame and not put back to an empty frame of the track.
- **The results arrive 2 s after the last drawn winner, down from 2.6** (`RESULTS_AFTER`, now exported from `src/show.js` so the tests can read it): for one winner that is 3 s of slow flip and 1 s of the winner flying on, 4 s of the page's own, where it was 2.6 s at full speed.
- **`body[data-shot]` is `rail` or `chase`** through the race and the finish, a hook for the checks that read the page from outside, like `data-state` and `data-lamps`.
- **Tests.** `tests/camera.test.js` has 17 tests (16): the zoom test and the smoothness test are rewritten for both kinds of finish, with a new "no pump" measure, and a new test holds the chase camera from the cut to the results. `tests/show.test.js` has 15 (13): the slow window and the cut. **`scripts/shots.js`**: the `photo` scenario reads the flip's length in the page's own seconds and the cut from `data-shot`, and a new `stay` scenario holds that two winners and reduced motion keep the rail. `CLAUDE.md` has the fleet at 3.0 with its reason, the winner's moment, and the upright photo; the README says what a finish does.

### Measured

    npm test        142 of 142 pass (139 before: the chase camera test and two show tests)
    npm run lint    16 of 16 clean
    node scripts/csp.js --check   both pages current
    node scripts/shots.js   138 of 138 checks, ten scenarios (flow 37, sheet 18, actions 11, sound 20, reduced 7, reload 13, phone 6, bare 10,
                            photo 10, stay 6), 8 min 45 s of wall clock; the one run before it, of photo and stay alone, was 15 of 16 (see below)

    the top three's width at 1920 by 1080, over the nine camera plans, 2.2 times life size and now:
        5th percentile 65 and 88 px, median 83 and 113, least 46 and 63
    the lens at the line, wide window: a clear win 0.69 s apart 14.1 degrees, a finish 0.046 s apart 16.3 (the race lens is 26); over the 49
        plans of the search the lowest the lens goes is 14.1 to 17.4 degrees wide
    over 98 lens profiles (49 plans, wide and phone): the lens narrows to its lowest point and opens after it, with three exceptions on a
        phone, which climb by 0.05 degrees in 1/120 s for a few frames early in the push in, 0.16 degrees at the most in all
    the largest step in 1/120 s: a clear win 0.44 degrees wide and 1.46 on a phone, a photo finish 0.66 and 2.24
    the chase camera, from the cut to the results over the nine plans, at the page's own clock: turns at most 46.8 degrees a second
        (the brief's limit for the rail is 50), never nearer the quad than 2.4 m, the winner in frame in every frame at 16 by 9,
        9 by 16 and square with 2 degrees to spare
    on a phone held upright the quad's span is 45 per cent of the chase camera's height (30 per cent at the rail's 44 degree minimum)
    on the page, replaying the photo finish draw at 1280 by 720: the first two tags 240 px apart at the line (243 before; 133 without a zoom),
        3.96 s of the page's own from the line to the results (the design is 4.00), the cut 4 frames after the line of 42, held for 38

    nine mutations of the new code, each file put back and compared byte for byte: winnerCut never cutting, the flip not slow, every finish
        fitting the pair, a photo finish fitting the winner only, the hero minimum back at 44, the results inside the slow part, two winners cut
        too, a photo finish cut before the runner up, and the fit window ending before the line: each fails at least one test, and no more than
        two. Three live mutations of src/app.js, put back and compared byte for byte: with the tags kept under the chase camera and the slow
        part ended a tenth of a second after the line, the flip check fails (2.22 s of the page's own against 4.00) and so does the tags check
        (20 frames with tags), and the cut check still passes; with no chase camera the cut check and the tags check fail and the flip check
        passes; with reduced motion and two winners both cut, both `stay` checks fail (19 of 21 and 19 of 20 finish frames on the chase camera).

Not measured: a real GPU, a real phone, any browser but Chromium, how the slow motion and the chase camera feel at a real frame rate (this rasteriser draws four to ten a second), or whether anyone enjoys it. Those are the owner's pass.

### What went wrong, in the order it was found

- **The upside down photo was mine, and was in the tests as a feature.** See the first item above: the fourth milestone's test asserted the flip was exactly pi, by name, and the CLAUDE.md paragraph said "when the flip is half way round" as if it were load bearing. What is load bearing is that the aim is AT the winner. Both are corrected.
- **Two layout assertions broke at 3.0, and one of them changed.** `PAD_SIZE === 0.6 * FLEET_SCALE` now reads `0.6 * BLOCK_SCALE`, and it is said here because it is a test that moved: what it protects is that a stand is as wide as its block and the block as tall as the plan's 0.32 m, and those belong to the block's scale, which was the fleet's and no longer is. The other, a float comparison, `1.8` against `1.7999999999999998`, went away with the blocks staying at 2.2.
- **The size floors went up again**, from 75, 60 and 42 px to 100, 80 and 56, to hold what 3.0 measures (113, 88 and 63) and not to let anything pass. The test "a clear win does not zoom at all" is gone, and not because it was inconvenient: it was the behaviour the owner asked to be changed, and the replacement holds the opposite, with the runner up outside the frame to show it is the winner alone that is fitted.
- **A photo finish's share was wrong in my last entry.** I wrote 44 per cent of races from 16 of 36 plans; check 8 flies 2,400 plans and has 37.3 per cent of them under a quarter of a second, which is the number the README and CLAUDE.md say now ("about a third"). The 36 were a small sample and I called it the rate.
- **The chase camera's tag would have stood off the top of the picture.** I had not put a tag in the hero frame in my head: at 2.4 m and 30 degrees a tag 0.7 m over the quad is 390 px above the middle of a 720 px frame, which `placeTags` was going to place at its wish with the quad's other tags in the corner. I saw it before running the page, and put the tags away under the chase camera on purpose and held it with a check that they are.
- **My first live check of the cut was one frame wrong.** `data-shot` was set by the first frame of the race and `data-state` by the last frame of the lights, so one sampled frame had a race and no shot. It is set with the state now, and the check held every frame of the race to the rail.
- **My first wait check measured the wall's seconds, and would have passed with the flip left at full speed.** On this rasteriser the page's clock runs at 44 per cent of the wall's (a frame is clamped to a tenth of a second), so the results opened 9.7 s after the line for 4.3 s of the page's own, and a floor of 3.6 s of wall would have been cleared by 2.5 s of page. It adds the page's own seconds, a tenth at most a frame, and bounds them from both sides.
- **A "pump" measure that flagged three phone profiles.** Counting any rise over 0.05 degrees in 1/120 s found 3 of 98: a rise of 0.05 degrees a frame for three frames, 0.16 degrees in all, before the lens had begun to close. The test holds the total pump to half a degree, which they are well under, and says so.

### Decisions to know about

- **The speed steps, it does not ramp.** The clock goes from full speed to a third in one frame at 0.8 s before the line and back at 1 s after: that was how the photo finish worked, and it is now every finish. If it reads as abrupt the fix is a ramp of the rate over a tenth of a second, which `advanceClock` can do in closed form for a linear ramp, and it is not made.
- **The slow part is one constant for all** (`SLOW.rate`, 1/3), and the lengths are three (`SLOW.before`, `WINNER.after`, `RESULTS_AFTER`). A clear win is 0.8 s before the line and not 0.5, so that the whole of the push in, which begins about 0.7 s before it, is slow.
- **Two winners and reduced motion still slow down** and the rail still zooms on the winner for two winners; only the cut is not made, and the calm rail never zooms. A person who asked for less motion has the slow part and a "Skip to the result" they cannot miss.
- **The chase camera is 2.4 m from the winner at 30 degrees**, which is 81 per cent of the frame's height for the quad's span and about half for the quad seen from the side. Nothing in a flip left the frame in the pictures looked at, but the test holds the quad's centre and not its extent.

### What I saw and did not fix

- **On a phone with sound on, the Sound and Present buttons stand over the race clock.** Seen in the phone pictures of the finish, 390 by 844: the clock is behind them. It was there before this entry (the button appears after the first gesture) and is not made worse by it.
- **The timing tower still covers the left fifth of the frame** in the approach, and the beat's lettering can still stand over a tag on the rail.
- **Nobody has watched the slow motion or the chase camera move.** On paper the lens steps at most 0.66 degrees in 1/120 s wide and the chase camera turns 46.8 degrees a second; how it feels at the real frame rate, three times slower, is the owner's pass.

### Open questions for the owner

Whether 5.4 s of slow finish is too long (it is three constants), whether the quads want to touch at 3.4 or stay where their props only overlap, and whether the chase camera should be a little further off the winner so that the flip has more room.


## 2026-10-04 | milestone 5, follow up | The frame back, the quads bigger

The owner's words: "just make the quads larger during the race, don't zoom in to make the frame narrower". Nothing here changes the draw or the plan: the same receipt flies the same race. No decision in this entry needed the owner beforehand (no algorithm, no dependency, no partner or sponsor, no other repository), but one reading in it is a guess and is said first, because it is the part the owner may want the other way.

### How I read it

The race frame is not to be narrowed to buy size on the glass: the size is the quads' own. The first entry of this follow up (bigger drones) had done the opposite on purpose, brought the rail's lens in from 34 degrees to 26 with the camera aiming 3 m and not 4.5 m ahead of the pack and the narrowest window 44 degrees across and not 50, and the comments in `src/camera.js` said "the rest of the size is the lens". That is the zoom the owner did not want, so all three are back as they were and the size is `FLEET_SCALE`.

What I left alone is the finish: the slow motion, the zoom on the winner at the line (down to 14 degrees) and the cut to the winner's chase camera, all of which the owner asked for by name in the message before. The new message says "during the race", and I took it to mean the race frame and not the finish. It can be read the other way, as no zooming anywhere, and the first question below is that one.

### What changed

- **The race lens is the original again**: `RAIL_FOV` 34 (was 26), the aim 4.5 m ahead of the pack (was 3), `MIN_HORIZONTAL` 50 (was 44). On a 16 by 9 window that is 57 degrees across and not 45, a third more track at the pack's distance; in a near square window it is 50 across and not 44, 15 per cent more. The owner's own window, per the front door's CLAUDE.md, is 1877 by 1938, so the minimum matters more than the lens there.
- **The quads are drawn 4.5 times life size, up from 3.0.** On the glass at 1920 by 1080 the top three are 127 px across at the median (5th percentile 99, least 78) where they were 113, 88 and 63 in the narrow frame: 13 per cent bigger in a frame a third wider, and about 30 per cent bigger in the near square window. The tests' px are the prop span (0.347 m times the scale): the dark frame the eye follows is about 55 per cent of that, 70 px at 1080 lines, and the rest is the translucent discs.
- **What goes with the quad's size**: `QUAD_HALF`, which the finish zoom fits, is 0.8 m; the winner's picture and the chase camera are 3.6 m from the winner and 0.38 m below (`HERO_DISTANCE`, `HERO_RISE`), so the quad is the same share of the frame it was; tags stand 1 m over a quad (`TAG_LIFT`).
- **Why 4.5 and not more**, measured and not reasoned: 425 plans of 5 to 50 quads flown at 120 Hz with the attitudes the fleet gives them, the nearest two arms (boxes 0.016 m wide, times the scale) in any of them:

        scale   arm centre lines   air between arm edges   an arm and the other quad's body
        3.0     0.296 m            0.248 m                 0.258 m of air
        4.0     0.099 m            0.035 m                 0.072 m of air
        4.5     0.058 m            touching, 0.014 m in    touching, 0.016 m in
        5.0     0.016 m            a whole arm through     not measured

  At 4.5 eight samples of 120 Hz, in 425 plans, have an arm 1.4 cm into another, which no one can see. The nearest case at 4.0 is plan 687 in the launch, at 4.9 s, and at 4.5 plan 841 at 7.4 s. At 5.0 it is a fault, in 38 samples. The planner's spacing is not touched.
- **Tests.** `tests/camera.test.js` has 18 tests (17): a new one holds the frame the rail gives six window shapes in mid race (34 degrees high on a wide one, 50 across on a narrow one) so that a narrowing by any constant has to argue with it; the leader-in-frame test adds a square window; the size floors went from 100, 80 and 56 px to 115, 89 and 70. `CLAUDE.md` has the fleet and the frame as one decision with the owner's words, and the README says three metres for the chase camera.

### Measured

    npm test        143 of 143 pass (142 before: the frame test)
    npm run lint    16 of 16 clean
    node scripts/csp.js --check   both pages current
    node scripts/shots.js   138 of 138 checks, ten scenarios (the same as the last entry), about nine minutes of wall clock

    the top three's width at 1920 by 1080, nine plans: 98.8 px 5th percentile, 127.3 median, 78.4 least (88.1, 113.0 and 62.9 at 3.0 in the 26 degree lens)
    the leader in frame in 0 of 17,786 frames at 16 by 9, in a square window and held upright on a phone
    the lens through a finish, unchanged in kind: a clear win 14.1 degrees at the line, a finish 0.046 s apart 17.3; the largest step in 1/120 s
        0.74 degrees wide and 2.32 on a phone for a photo finish (the limit is 2.5), 0.45 and 1.52 for a clear win; no pump over 0.01
    on the page, replaying the photo finish draw at 1280 by 720: the first two tags 232 px apart at the line (240 before; the line is at 190),
        4.02 s of the page's own from the line to the results (the design is 4.00), the cut 3 frames after the line of 43, held for 40

    five mutations of the final tree, each file put back and compared byte for byte: the lens back to 26 fails the phone lens test and the
        frame test; the minimum back to 44 fails the leader in frame (in a square window), the frame test and the smoothness test; the fleet
        back to 3.0 fails the size test and the chase camera's size on a phone, and at 4.0 the size test alone, which is the floors doing their
        job; the aim back to 3 m ahead survives, because nothing guards how far ahead the camera aims, and that is said here.

Not measured: a real GPU, a real phone, any browser but Chromium, and whether 70 px of dark frame at 1080 lines is big enough for the owner.

### What went wrong, in the order it was found

- **I had spent the frame to buy the size.** The lens, the aim and the minimum across were all free variables to me, and the last two entries said so. The owner treats the frame as the thing to protect, which is the more natural way round, and a window that is not 16 by 9 was paying for it with 6 degrees of width.
- **The ceiling in my last entry was wrong by a third.** I wrote that at 3.4 two quads in neighbouring lanes would touch and stopped at 3.0. That was reasoned from the lane spacing and not measured, and the measurement says frames first meet at about 4.4.
- **A small sample would have given a different ceiling.** 43 plans had the nearest arms 0.33 m apart at 4.0 and 0.26 m at 4.4; 223 plans found 0.099 m at 4.0, in plan 687, and 425 found nothing nearer. A worst case bound from the arm length (arms pointing at each other at the planner's 0.85 m) said 3.9. The truth sits between them and only the large flight showed where.
- **A comment I wrote said an arm passes through another at 4.5.** The numbers say it touches, by 1.4 cm, and that it passes through at 5.0. Corrected before the commit.
- **The size in pixels is the prop span, and I had not said so to the owner.** The tests, the brief's 40 px and every number in this file count the faint discs. Seen in a 1877 by 1938 picture, the leader's dark frame is 70 px in a window nearly 1900 across, which is small, and 4.5 is as big as the quads can get before their frames meet.

### Decisions to know about

- **The finish is as the last entry left it.** A person who wanted no zoom anywhere would still see the lens go to 14 degrees at the line and the picture cut to a camera 3.6 m from the winner.
- **4.5 is a ceiling set by the frames.** More size on the glass than this is a narrower frame (each degree of `RAIL_FOV` is about 3 per cent of the size) or frames passing through each other, which is `FLEET_SCALE`, and each of those is the owner's to ask for.
- **In a tall or square window the lower half of the frame is bare grass**, because the lens that gives it 50 degrees across is 51 high and the pack is in the middle of it. Showing less of the foreground is a narrower frame too.

### What I saw and did not fix

- **The timing tower covers the left sixth of the frame** at the launch, where the chasers are, and the beat's lettering can still stand over a tag on the rail.
- **On a phone with sound on, the Sound and Present buttons stand over the race clock.**
- **Nobody has watched the race at a real frame rate** in this frame, with these quads, or the finish.

### Open questions for the owner

Should the finish keep its zoom, or does "don't zoom in" mean none at all? Is a leader 70 px of dark frame at 1080 lines big enough, or would the owner give back some of the frame for size, and how many degrees? And would the owner rather have quads through each other at 5.0 than stop at 4.5?
