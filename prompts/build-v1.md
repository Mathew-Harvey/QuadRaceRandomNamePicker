# Build the WebFPV Race Name Picker

The prompt for the session that builds v1. Paste it whole, or point the session at this file. Everything it says about the simulator was measured on the simulator's `main` at `787ea59` on 3 October 2026, and every number about the draw was computed while writing it by three implementations that agree. Where it says *suggested*, tune it and write down what you chose. Everything else is a requirement, and a requirement you cannot meet is a conversation with the owner, not a quiet change.

## The job

Build a random name picker in this repository, `Mathew-Harvey/QuadRaceRandomNamePicker`: a static site whose entry is `index.html`, with no server. Up to 50 names go in. Each becomes a five inch quad on a start grid in the simulator's race field. The picker draws the result first, with the browser's cryptographic random generator, seals it, and shows the seal's fingerprint on screen. Then the quads race a few laps of the field, filmed side on like a broadcast, with the operator's sponsor logos on boards behind the track and painted on the grass, and they cross the line in exactly the order that was drawn. The results page breaks the seal so anyone can check the draw: in the browser, in Node, or with Python's standard library.

It is called the **WebFPV Race Name Picker**, and it joins the WebFPV family: the simulator and its track builder, the board, the front door. It must look, sound and behave like one of them: the simulator's field, quads, palette, lettering and manga page, and the family's rules about licences, dashes, copies, Git and checks.

The genre's reference is <https://www.duckrace-game.com/>: names in, a silly race, a winner out. Two things set this one apart, and neither is polish. The race is the WebFPV field with quads that move like quads. And the draw is one an open source sceptic can check line by line.

## Read first, in this order

1. This file, to the end, before writing anything.
2. `../WebFPVSimulator/CLAUDE.md`: the family's rules.
3. `../landingpage-WebFPVSimulator-/CLAUDE.md`: how a sibling copies the simulator's code (`scripts/vendor.js`, its manifest and the lint that holds it), the manga page, the slap, the reduced motion contract, the `?v=` rule. This repository is built the way that one is.
4. `../WebFPVSimulator-LeaderBoard/CLAUDE.md`: the palette, the lettering join (`public/titles.js`), the rule about partners.
5. `../WebFPVSimulator/DEPLOY.md` and the header of `../WebFPVSimulator/edge/router.js`: how the family is hosted, one Worker on webfpv.org mounting each site under a path.

The three siblings are read only for this task. If they are not beside this checkout, clone them there (`git clone https://github.com/Mathew-Harvey/WebFPVSimulator ../WebFPVSimulator`, and the same for `WebFPVSimulator-LeaderBoard` and `landingpage-WebFPVSimulator-`). Run `git fetch origin main` in each before reading, because a stale checkout is how a wrong copy gets made.

Simulator paths below are from the simulator's root.

## The rule that makes it defensible

**The result is drawn before the race, sealed, then flown.** The race is a show of a draw that has already happened. Nothing it does, no frame time, no camera, no dropped frame, no physics, can change who wins, because nothing about the result is computed after the seal. That is the opposite of the usual duck race, where the winner is whatever the animation produces, usually from `Math.random`, and nobody can audit it. The page says so plainly, and so does `RANDOMNESS.md`.

### The algorithm, `webfpv-picker/v1`

Pinned. Two independent implementations must reproduce it byte for byte, so do not improve it. If you think it is wrong, stop and tell the owner why before changing a character, because a change invalidates every receipt anybody kept.

Inputs:

- `names`: 2 to 50 strings in the order entered, canonical before sealing: Unicode NFC, each run of whitespace collapsed to one space, trimmed, at most 80 characters, empty lines dropped. Duplicates are separate entries, which is how a raffle gives somebody two tickets. The receipt carries the canonical names and verifiers use them as given.
- `seed`: 32 bytes from `crypto.getRandomValues`, taken when the operator arms the race, and from nowhere else.

Strings are UTF-8, `||` is concatenation, `0x00` is one zero byte, `u32be(j)` is four bytes big endian:

```
listDigest = SHA-256( names joined with "\n" )
commitment = SHA-256( "webfpv-picker/v1/commit" || 0x00 || seed || listDigest )
block(j)   = HMAC-SHA-256( key = seed, msg = "webfpv-picker/v1/draw" || 0x00 || listDigest || u32be(j) ),  j = 0, 1, 2, ...
words      = the blocks end to end, read as consecutive big endian uint32
below(n)   : limit = 2^32 - (2^32 mod n); take words until one, x, is below limit; return x mod n
order      = [0, 1, ..., N-1]; for i = N-1 down to 1: k = below(i + 1); swap order[i] and order[k]
showSeed   = HMAC-SHA-256( key = seed, msg = "webfpv-picker/v1/show" || 0x00 || listDigest )
```

`order[0]` is the index of the winner, `order[1]` of second, and so on: the whole finishing order is the draw, and the first W places are the W winners. `showSeed` seeds everything the race does for looks. It is a different HMAC message, so the look of a race and its result come from separate streams, and a replay of a receipt is the same race.

Keep the shuffle (`below` and the loop) pure and synchronous over an injected word source, and only the stream asynchronous, so the rejection logic can be tested with words you choose. The module exports the seeded function for tests, verifiers and replays; the live page calls only the function that takes its seed from `crypto.getRandomValues`.

What each piece buys, which `RANDOMNESS.md` explains at length for a sceptical reader:

- **256 bits of seed from the operating system's generator.** A shuffle reaches at most as many orderings as its generator has states. Fifty names have 50! orderings, about 2^214.2, more than the 128 bit generator behind `Math.random` in the major engines (xorshift128+) can produce. 256 bits is enough.
- **HMAC-SHA-256 in counter mode** is a standard pseudorandom function construction (the shape of NIST SP 800-108's counter mode), so to anybody without the seed the words are as good as uniform.
- **Rejection sampling** removes modulo bias exactly, because the accepted range is a whole multiple of `n`.
- **Fisher-Yates** (Durstenfeld) on exactly uniform integers gives each of the N! orderings probability exactly 1/N!. Every entry has the same chance at every place, which is what the setup sheet says in words: "Each name has a 1 in 23 chance of winning."
- **Commit, then reveal.** The commitment is on screen before the lights and the seed after the finish. Anybody who saw the fingerprint can check that the result was fixed before the start, and because the list digest is inside it, the list cannot be swapped afterwards either.

What it does not prove, and `RANDOMNESS.md` says so in as many words: it cannot stop an operator running draws off camera until one suits them. A fresh seal on screen, the time in the receipt and the browser's draw log make a rerun visible. Nothing that runs on a client can make it impossible.

### Test vectors

Computed while writing this brief by Node's `crypto` module, by Python's `hashlib` and `hmac`, and by WebCrypto, and the three agree. If your code disagrees, your code is wrong. Indices are zero based.

```
V1  names       Alice, Bob, Charlie, Dee, Eve
    seed        000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
    listDigest  8c8b9a7c80af341b7d7d0110ff13c968082a14a829924533560d37361edbbc87
    commitment  1b39ba473ba5b7094ef3df3e6e0f2e6953c56cb1c120efb1303e3401a6c5076c
    order       0 4 2 3 1   (Alice, Eve, Charlie, Dee, Bob)
    showSeed    024665687403d0414d840325fc0f8af4b93b2b16d9ce927d30507b68cd3c5f15

V2  names       "Pilot 01" to "Pilot 50", two digits each
    seed        SHA-256 of the text "webfpv-picker test vector 2"
                = 56b586c93e39bf905aba908b5fb827789b17805aad6e066123df8b2631e4cfb6
    listDigest  191879b268c25fc766759d8668a0df109867dbf1768307fd4e2035cc2dc0aaca
    commitment  f9e4d3fa78082e8132eb1b6ef594a851047efe6531e90f2c754158037cc7fef6
    order       35 28 0 13 48 25 47 27 37 5 18 8 16 17 31 33 24 23 43 45 15 38 41 20 39
                12 36 9 14 2 30 10 4 44 7 6 22 11 21 49 3 32 46 42 1 34 26 19 29 40
                (Pilot 36 wins)
    showSeed    804c799cbc6e44db2b9713a4b7bda901d31f92b94e38468229fe50cd8f6b2836

V3  names       Zoë, Søren, 李雷, José, Ngāi Tahu, Ōtautahi   (NFC)
    seed        a5 repeated 32 times
    listDigest  26540588d38fe12e29ff93cff688d440009f85ffd27a834fb7ac2f38984dab72
    commitment  9fe17fab35ff5d33dd4202a2397882d7f619092545a83986a58417a21266aab5
    order       1 0 5 4 3 2   (Søren, Zoë, Ōtautahi, Ngāi Tahu, José, 李雷)
    showSeed    c657892a758a5a5f18d3093fa35397d911fc964fbfd8c77611f643073d74570f
```

Uniformity, over fixed seed sets so the statistics are reproducible. The names are the numbers `1` to `N` as strings, and seed `i` of set `S` is SHA-256 of the text `webfpv-picker/test/S/i`, with `i` written in decimal and counting from 0:

| Set | Draws | Statistic | Pass below (the 0.999 point) | A correct implementation gives |
|---|---|---|---|---|
| `uniform-4` | 240,000 | chi-squared over the 24 orderings | 49.73 (23 dof) | 20.696, all 24 seen |
| `uniform-50` | 100,000 | chi-squared over the 50 winners | 85.35 (49 dof) | 46.083 |
| `uniform-7` | 140,000 | chi-squared of who lands at each of the 7 places | 22.46 each (6 dof) | 8.717, 4.364, 5.787, 10.422, 1.225, 11.282, 6.446 |

For contrast, the classic wrong shuffle (swap with `below(N)` instead of `below(i + 1)`) scores 7,143.9 on `uniform-4`. The three sets and that contrast took about 14 s together through `node:crypto`. If WebCrypto's promises make them slow, drive the statistical checks through `node:crypto`: the two engines check below is what proves the two paths agree.

### Rules that keep it defensible

- `crypto.getRandomValues` and `crypto.subtle` appear in `src/draw.js` and nowhere else in this repository's own code. `src/draw.js` imports nothing and touches no DOM, so it runs unchanged in a browser and in Node, and it can be read in one sitting.
- `Math.random` appears nowhere outside `sim/`. Inside `sim/` it is the simulator's and cosmetic: measured, `src/render/lens.js` uses it for lens noise and `src/trackbuilder/model.js` for a track id. Everything that wobbles in this app is seeded from `showSeed`.
- A live draw's seed comes only from `crypto.getRandomValues`. No field, URL parameter, test hook or key sets the seed or the winner of a live draw. A replay from a receipt says REPLAY on every screen it shows and never issues a receipt of its own. A development parameter that scales presentation time is fine: it touches time, never the draw.
- The draw is sealed and written to this browser's draw log before the countdown starts, so a reload mid race loses the show and not the result.
- The results page reads the draw, never the animation. As the race finishes it compares the crossing order with `order`, and if they ever disagree it logs an error and still shows the draw.
- Nothing reveals the result before the winner crosses: the results page does not exist in the DOM until then, no tag or row is styled by finishing place, and the grid is the entry order, never the drawn one.
- The copy says what is true: "drawn with your browser's cryptographic random generator", "sealed before the start". Never "100% random", "truly random" or "provably fair" as a bare claim.

## The race is a plan, made after the draw

`src/choreo.js` takes the order, `showSeed`, N, the chosen length and the course, and returns every quad's flight as a pure function of race time: distance along the racing line, offset across it, height. No DOM and no Three.js, so it is tested in Node. The frame loop only samples it. A slow laptop or a dropped frame changes nothing, and the race pauses while the tab is hidden and carries on when it comes back.

Must hold, for every plan:

- The finish line crossing order equals `order`. First and second at least 0.04 s apart, every other neighbouring pair at least 0.08 s.
- Progress along the line never goes backwards. After the launch, about 1.5 s from the blocks to cruise, speed stays in a band a five inch race quad can fly (suggested 12 to 36 m/s).
- No two quads closer than 0.5 m centre to centre at any 60 Hz sample. Overtakes go round or over.
- The winner's time is within 10 per cent of the length chosen, on a whole number of laps finishing on the start straight.

Drama targets, over 1,000 plans with N of at least 5, printed by the test on every run. They are targets: one that cannot be met is argued in PROGRESS.md.

- The eventual winner leads at half distance in at most 35 per cent of races and in at least 10 per cent (wire to wire wins happen).
- At least one lead change in the final third in at least 60 per cent of races.
- A winning margin under 0.25 s in 25 to 50 per cent of races.

A suggested shape, and a better one is welcome if the checks hold: each quad gets a smooth positive speed curve, the common launch and cruise plus a few seeded bumps; storylines (the late surge, wire to wire, the comeback from the back row, the early leader who clips a flag and wobbles, the photo finish) are larger bumps placed on the leading few; then each curve is scaled so its integral reaches the line at that quad's assigned time. Scaling a positive curve keeps it smooth and positive.

Attitude is not animated, it is derived, and it is most of what makes fifty dots read as racing quads. The thrust axis points along acceleration minus gravity, so a quad pitches hard forward to accelerate, flares to brake and banks into a bend, and its nose follows its velocity. That needs the plan smooth to second order.

## The field is the simulator's field

Do not draw a field. Build the simulator's race field around a course this app designs, with the simulator's own code, the way its "Your track" map does (`src/maps/custom.js`) and the board's course thumbnails do (`src/share/orbit.js`):

```
doc    = createTrack(...), then elements and a flying order       src/trackbuilder/model.js
course = courseFromDocument(doc)                                   src/game/trackdoc.js
q      = qualityFor(detectDefaultGraphics())                       src/render/quality.js
shell  = buildShell(canvas, options)                               src/render/shell.js
map    = await buildFieldScene(shell, onProgress, course, q)       src/render/scene.js
post   = buildComposer(shell.renderer, map.scene, shell.camera, q) src/render/post.js
each frame: map.updateWind(t), then post.render()
```

That is the paddock in the Perth bush: the sky dome and clouds, the treeline and fence, the clubhouse, the flowers, the mown pitch with its touchlines, cel shading whose light is warm and whose shadow is cool (`src/render/celmat.js`), and the ink lines and grade of `src/render/post.js`.

Measured while writing this:

- The import closure of `src/render/shell.js`, `scene.js`, `post.js`, `quality.js`, `herocraft.js` and `celmat.js`, `src/game/trackdoc.js` (which brings `src/trackbuilder/model.js`), `src/art/banners.js`, `src/art/startblock.js` and `src/ui/lettering.js` is 38 files, about 30,000 lines: no `main.js`, no WASM, no physics, nothing that touches the DOM or storage at import, and nothing from outside but `three` and `three/addons/`. `scene.js` also dynamically imports `src/art/wallart.js` and `src/art/wallart-atlas.js`, indoors only. Adding `src/render/audio.js` costs three more files.
- Three of those files import `../../configs/airframes.js`, which is outside `src/`. So **mirror the simulator's repository root under `sim/`** (`sim/src/render/scene.js`, `sim/configs/airframes.js`) rather than its `src/`, and every relative import resolves without an edit.
- `three@0.160.0` from jsDelivr, the version the family pins. `celmat.js` patches one of its shader chunks at import and throws if the text changed. Do not move it.
- A document of eight flags in a flying order round an oval, one `startPads` and one `groundLogo` went through `courseFromDocument` with `closed: true`, no warnings, and a 126.6 m lap on the default 60 by 40 m field. `normalize` kept a 140 by 90 m field.
- `branding.logos` (at most 5 entries, data URLs only, `LOGO_MAX_CHARS` 256 KB each, `BRANDING_MAX_CHARS` 384 KB together) becomes `course.logos`, and each `groundLogo` becomes a `course.decals` entry that the world paints into the turf with `paintGroundLogo`. Flags take no sponsor slot (`dressOrder` counts gates only), so on a course without gates the grass is where the world puts logos, and the boards are yours.

Copy, never edit. `scripts/vendor.js`, started from the landing page's (it follows static, re-export and dynamic imports), copies the closure of the entries you use into `sim/`, deletes what the copy no longer makes, and writes `sim/MANIFEST.json` with the simulator's commit, whether its tree was clean, and a SHA-256 per file. The lint fails on any file under `sim/` that does not match. If you need the simulator's code to change, that is a change to the simulator and outside this task: write it down for the owner and work round it in this repository.

Things that will bite:

- `buildFieldScene` adds `shell.quad`, the session's own aircraft, to the scene. Hide it.
- `map.updateWind(t)` every frame, or the cel time, the clouds and the flags stop.
- `buildFieldScene` awaits whatever `onProgress` returns. Return a promise that yields two frames and a task (`yieldToPaint` in `src/ui/loading.js` says why one is not enough), or the build is one long block of main thread work.
- `buildShell` sets `NoToneMapping` and the post chain does its own sRGB encode. Leave both alone.
- The ink pass inks layer 0 and not layer 1. The fleet, the gantry and the boards go on layer 0.
- The grade pass applies barrel distortion (0.055). A tag placed with `camera.project` drifts off its quad toward the edges unless it goes through the same distortion.
- The world paints the course's racing line on the grass as yellow guide marks (`course.guide`, `src/render/marks.js`). Set `course.guide = null` before the build unless the line the fleet flies is the one the guide follows. Either way it is data, not an edit.
- The course needs exactly one `startPads`. Put it under your grid.
- The setup sheet is usable before the build finishes, and the field fades in when it is ready.

### The fleet

`buildHeroCraft({ lite: true })` in `src/render/herocraft.js` is the simulator's five inch, all procedural: carbon frame, cream stripe, sakura canopy, brass standoffs, three blade props, prop discs, an LED bar front (sakura) and rear (mint). Front is minus Z, 0.220 m motor to motor. It is 65 meshes and about 45 materials a copy and nothing is instanced, so fifty copies is three to four thousand draw calls before the ink pass doubles them. Build one, merge its meshes by material into instanced meshes, and draw the fleet in a handful of calls.

- Livery by instance colour on the canopy, props, discs and LED bars; the frame stays carbon. Hues a golden angle (137.5 degrees) apart at fixed lightness and chroma in OKLCH (suggested L 0.80, C 0.13), so neighbours on the grid differ. Each quad also carries its number, its line in the names box, so nothing depends on telling colours apart.
- Readability: the leading group's quads at least 40 px across at 1920 by 1080. At real size a quad is a dot beyond about 25 m, so keep the camera close or scale the fleet, and say which in PROGRESS.md.
- On the grid, blades turn at idle once armed. At race speed, the discs.

### Sponsor logos

Up to 4, as PNG, JPEG, WebP, SVG or GIF (its first frame), up to 10 MB each, read in the page and never uploaded. Transparent margins are trimmed. Each logo has a placement: boards, grass, or both, which is the default.

- **Boards** are this app's own: the world has no billboards. Vinyl panels in the `BANNER` palette of `src/art/banners.js`, painted with its painters or in their manner, on the simulator's pale grey tube frames, standing between the track and the fence so they are the background of the race camera all the way round. Logos are dealt round robin. A logo with no transparency gets a panel the colour of its own border pixels, so a JPEG in a white box is not a sticker on a sticker. With no logos, the boards carry the lettered WebFPV wordmark and `webfpv.org`.
- **Grass** is the simulator's: `groundLogo` elements in the course document, painted into the turf exactly as a course author's are. Put them in the infield where the race camera looks down on them, and paint them for that camera, the way a stadium paints its pitch for the main camera: stretch the image along the camera's line of sight by 1 / sin(depression angle) before it goes into `branding.logos`, because `paintGroundLogo` fits a logo into its box without stretching it. From the air they then look long, as pitch logos do from a blimp.
- What goes into the document is downscaled to fit the model's caps. The boards can use the full image.

### Gantry and grid

The simulator has no start lights and no finish gantry: its start line is a timing gate. Build a gantry across the track from its materials: the tube frame, a vinyl header with the chequer (`chequerDevice`) and the event title lettered on it, three amber lamps and a green, and a small scoreboard that shows the seal's fingerprint before the start. The grid is up to fifty of the simulator's start blocks (`assembleStartBlock` in `src/art/startblock.js`, two foam topped rails at 28 degrees), instanced, in rows behind the line, in entry order.

## The show

1. **Paddock.** A slow orbit over the grid while names are typed, flown from the world's own attract descriptor (`map.attract`, the centre, radius, eye height and aim the simulator's title camera uses). Each name typed drops a quad onto the next block with its tag; a deleted name's quad lifts off. An empty grid says "Type names to fill the grid".
2. **Seal.** Arming seals the draw, and the fingerprint (the commitment's first twelve hex digits, uppercase, in three groups of four: `1B39 BA47 3BA5`) is slapped onto the glass with the landing page's `@keyframes slap` (in from nearly twice the size and eight degrees off, easing in, short onto the glass, one ring back), with the full commitment under it. Then it shrinks into the corner chip it keeps for the race. The gantry's scoreboard shows it too.
3. **Lights.** An aerial shot high over the field showing the oval, the boards and the logos on the grass, descending to the start straight while the props spool up and the gantry runs the start: three amber lamps a second apart with a short tone each, a hold of 0.5 to 2 s drawn from `showSeed` (a real FPV start holds so nobody can anticipate it), then green and a long tone. By green the camera is on the rail.
4. **Race.** A side on rail camera in the infield, on a path concentric with the track, looking out at the pack with the boards behind it. It follows the leading group and leaves room ahead of the leader. The pack always crosses the screen left to right, and the camera never crosses the line. Yaw rate at most 50 degrees per second. The leader is in frame from the end of the launch to the line.
5. **Finish.** On the last straight the rail camera glides to a stop square to the finish line and holds, so the pack crosses a still frame. When first and second are under 0.25 s apart, the last 0.8 s before the line plays at a third of speed. The camera holds until the last drawn winner has crossed. The winner throws a flip over the line.
6. **Results.** The manga page opens round the held frame.

Suggested course: a stadium oval about 300 m a lap, straights about 60 m, bends about 32 m radius, 12 m wide, flags on the inside of the line, the rail about 20 m inside the line at about 5 m high, the field about 200 by 100 m. Tune it against the checks and write down what you chose.

Reduced motion: no aerial descent and no glides (cuts between still positions, a wider rail framing with slower pans), no slap (the chip appears in place), and a prominent "Skip to the result". The race still runs if they want it. The stylesheet's block and `REDUCED` in the script agree, as the landing page's rule says.

## The screens

The family's furniture, its tokens copied from the simulator's `index.html` and the board's `public/index.html`, never invented. Dark only.

- **Palette.** `--cream #f3ead4` lit type, `--sakura #e8a8b8` chrome, `--amber #ffd45c` instruments, `--mint #7dffb4` the winner and anything good, `--slate #9db3c8` type that recedes, `--deep #141c16` ground. Paper `#f7f0dc` and ink `#0b1116` for the manga page.
- **Type.** The `system-ui` stack, `ui-monospace` with `tabular-nums` for numbers, no web fonts. Eyebrows uppercase, widely tracked, over a short sakura rule.
- **Panels.** The setup sheet is the simulator's menu panel: no radius, an ink ring, a paper ring, a hard drop, a sakura top edge. The race tower uses the board's `.panel` fill and edge rule.
- **Lettering.** The wordmark (WEB in cream, FPV in sakura, RACE NAME PICKER beside it), the page titles and the winner's name are drawn by the simulator's `src/ui/lettering.js` (`paintTitle`, `drawRuns`), joined the way the board's `public/titles.js` joins it: the words stay in the DOM with a transparent fill, the canvas is aria hidden, and forced colours gets the text back. Everything else stays text.
- **OSD.** The race clock and lap count in the simulator's OSD style, its `--osd-*` tokens and eight way ink edge. Amber on the final lap.
- **Focus.** A 2 px sakura outline. Every control is reachable by keyboard. No global key arms a race.

### Setup

A sheet on the left over the live field, a bottom sheet under 900 px.

- **Event title**, optional, 40 characters, lettered on the gantry and on the results page.
- **Names**, one per line. A gutter shows each line's number and livery colour. A count ("23 of 50"), a badge on duplicates ("×3"), and "Numbers 1 to N" for numbered tickets. Pasting one comma separated line offers to split it. The odds, in words: "Each name has a 1 in 23 chance of winning", "With 3 winners, each name has a 3 in 23 chance of being one", "Sam has 3 entries: 3 in 23". A 51st line says fifty is the most the grid holds, and arming is disabled.
- **Length** 15 s, 30 s or 60 s, default 30. **Winners** 1, 2 or 3, at most N minus 1.
- **Sponsor logos**: four drop slots, each with its thumbnail, a remove control, and its boards and grass placement.
- **Arm**, the primary control: mint, styled like the arm switch on a radio, labelled "Arm and race" with "Seals the draw, then flies it" under it. One press.
- Below it: **Draws in this browser** (time, title, fingerprint, winners, receipt, replay, and a clear control), **How the draw works** (`RANDOMNESS.md`), **Verify a draw** (`verify.html`), sound on or off, present mode.

### Race

- Top centre: the OSD clock and "Lap 2 of 4".
- Left: a timing tower of the top ten (place in mono, livery chip, name, gap to the leader), its rows sliding on an overtake, the rest folded into one row ("11 to 23"). The top five on a phone.
- Over each quad, its tag: number and name in OSD ink, placed greedily by current place so no two overlap, the top three always shown.
- The corner chip: "Sealed 1B39 BA47 3BA5", with the full commitment in its accessible name.
- Beats, one line at a time, naming what is in frame: "Go", "New leader: Sam", "Final lap", "Photo finish", "Sam wins". None is a link.
- A live region announces the seal, the start, the final lap and the winner, and nothing else.
- **Present mode** (F, or its button): fullscreen, the chrome gone, the HUD sized in `vmin` for a projector, the cursor hidden when idle.

### Results

A manga page in the simulator's grammar (`src/ui/mangapage.js`: margin, gutter and border at 3.5, 2.2 and 0.65 per cent of the short side, gutters that lean, the biggest panel first), built the way the landing page builds its first screen (`src/page.js` there: one SVG of paper with the panels cut out and an ink line round each, real DOM content clipped to each quad), so every word on it is text.

- The big panel is the 3D frame of the winner at the line, seen through the paper, put in the panel's middle with `camera.setViewOffset` rather than by moving the camera. Still focus lines converge on the winner: seeded, and never animated on their own, which is the landing page's photosensitivity rule. A narration box ("Winner · 30 s · 23 names") and the name lettered across the foot.
- Second and third, when drawn, in panels of their own.
- The finishing order, all of it, the winners in mint.
- The seal: the fingerprint and the full commitment, the seed revealed, a mint tick for "the seed matches the fingerprint shown before the start", and Copy receipt, Download receipt, Verify.
- Actions: Race again (same names, a new draw), Draw again without the winners (removes the winning lines and seals a new draw), Edit names, Watch it again (the same race, marked REPLAY).
- A strip of panels on a phone.

### Verify

`verify.html` takes a pasted receipt, as text or JSON, or the one the results page links to (carried in the URL fragment, which never reaches a server). It recomputes the list digest, the commitment and the order with `src/draw.js` and shows each with a tick or a cross and one plain sentence about what that means. It links to `RANDOMNESS.md`, to `src/draw.js` on GitHub, and to `tools/verify.mjs` and `tools/verify.py`.

The receipt holds at least: the algorithm id, the title, the time sealed (UTC, ISO 8601), the canonical names in order, the number of winners, the commitment, the seed, and the order (zero based indices in JSON, one based places in the text). `RANDOMNESS.md` defines both forms exactly, and both verifiers read both.

### Sound

Silent until the first gesture, with a mute that persists. The family's motor sound is the simulator's `MotorAudio` (`src/render/audio.js`, `update(rpm, speed, atTime)` with four motor speeds): drive one from the leading group's speed, and fire its `event('gate', atTime, level)` as the leader crosses the line each lap. Never start its music, and do not copy the music files. The start tones and a short winner's sting are this app's own WebAudio. If `MotorAudio` fights you, synthesise your own and say so in PROGRESS.md.

### Everything else

- **No WebGL**: the picker still draws: the seal, a countdown, and the results page without its 3D panel.
- **Storage**: names, title, settings, the draw log (the last 50) and downscaled logos in localStorage, every access in a try/catch, and a "Forget this browser's lists" control. It works with storage blocked.
- **Privacy**: nothing leaves the page but the request for three.js. A Content-Security-Policy meta enforces it (`connect-src 'self'`, scripts from self and jsDelivr, the import map allowed by its hash). The footer says "Names and logos never leave this browser."
- **Hosting**: GitHub Pages from `main`, which the owner switches on in the repository's settings. Every URL is relative, so it works at `mathew-harvey.github.io/QuadRaceRandomNamePicker/` and under a later `webfpv.org/<mount>/`. Mounting it there is the simulator's `edge/router.js` and the owner's decision, not this task. If it is mounted, the landing page's `?v=` rule applies from that day.
- **Icon**: the simulator's `scripts/icons.js` has four accents and the family uses all four. Ship `<link rel="icon" href="data:,">` and ask the owner which accent the picker gets.
- **Marks**: no partner marks and no Betaflight name or logo. Partner placements are agreed one at a time (the board's CLAUDE.md says why), and this app runs no Betaflight code.

## Files

A suggested layout. Each file does one obvious thing.

```
index.html             the app: markup, inline styles, the import map, the CSP
verify.html            the verifier; imports src/draw.js and nothing else
src/draw.js            the draw and the receipt: no imports, no DOM, browser and Node
src/choreo.js          the plan: pure, no DOM, no Three.js
src/course.js          the oval, the rail, and the track document handed to the simulator
src/world.js           the join: shell, field, composer, gantry, grid, boards
src/fleet.js           fifty quads, instanced from buildHeroCraft
src/sponsors.js        logo intake, board and grass images, persistence
src/camera.js          the shots
src/hud.js             clock, tower, tags, beats, the seal chip
src/page.js            the manga results page
src/titles.js          the lettering join
src/sound.js           tones and the motor sound
src/app.js             the setup sheet and the state machine
sim/                   the simulator's files, byte for byte, and MANIFEST.json
scripts/vendor.js      copies the closure, writes the manifest
scripts/serve.js       a static server, adapted from the simulator's
scripts/lint.js        headers, dashes, randomness confinement, relative URLs, the manifest
scripts/shots.js       headless Chromium through the flow, adapted from the simulator's
tools/verify.mjs       command line verifier, using src/draw.js
tools/verify.py        an independent verifier, Python standard library only
tools/race-chart.html  development page: a plan drawn as a chart, not linked
tests/draw.test.js     checks 1 to 5
tests/choreo.test.js   checks 6 to 8
RANDOMNESS.md          the method, the argument, the threat model, how to verify
CLAUDE.md  README.md  PROGRESS.md  NOTICE  LICENSE  package.json  .gitignore
```

`package.json`: `"type": "module"`, `"engines": { "node": ">=22" }`, `"license": "GPL-3.0-or-later"`, no dependencies, and scripts `serve`, `test` (`node --test tests/`), `lint`, `vendor` and `shots`.

## Checks

| # | Check | Method | Pass |
|---|---|---|---|
| 1 | vectors | V1 to V3 through `src/draw.js` | exact |
| 2 | two engines | `src/draw.js` (WebCrypto) against an independent `node:crypto` implementation inside the test, 1,000 random lists of 2 to 50 names with random seeds | identical commitments and orders |
| 3 | python | `tools/verify.py` on V1 to V3 and on 200 receipts written by the app's own receipt code | identical; prints `skip` when there is no python3, never a silent pass |
| 4 | rejection | `below(n)` over an injected word source, n from 2 to 50: `limit - 1` accepted, `limit` and `2^32 - 1` rejected and the next word taken | exact |
| 5 | uniform | the three seed sets above | below the bound, and equal to the stated values |
| 6 | plan order | 3,000 plans: N in {2, 3, 5, 12, 23, 50}, every length, every storyline, fixed seeds | crossing order equals `order` in all of them |
| 7 | plan physics | the same plans | the four "must hold" bands |
| 8 | drama | the same plans | the three targets, printed on every run |
| 9 | confinement | `npm run lint` | `Math.random` nowhere outside `sim/`; `crypto.getRandomValues` and `crypto.subtle` only in `src/draw.js`; `src/draw.js` imports nothing |
| 10 | family | `npm run lint` | a GPLv3 header on every source file, no em or en dash in any tracked text file, every URL relative, `sim/` equal to its manifest |
| 11 | flow | `node scripts/shots.js`: paddock with 50 names and 4 logos, seal, lights, mid race, finish, results, verify with the receipt pasted; each capture asserts its state with `until:` before it is taken | all captured |
| 12 | console | the same run | zero errors, zero warnings, zero CSP reports |
| 13 | no early result | the same run, sampled through the race | no results page in the DOM before the winner crosses |

Checks 1 to 10 are cheap: seconds, no browser. Checks 11 to 13 drive headless Chromium the way the simulator does (`scripts/shots.js`, `tests/lib/page.js`, `tests/lib/browser.js` there: the DevTools protocol over Node's own WebSocket, no dependency). In this container Chromium is at `/opt/pw-browsers/chromium` and does not inherit the outbound proxy, so serve the three.js requests from Node through the protocol's Fetch domain, as the simulator's `scripts/shots.js` does. A frame there takes about 120 ms on the software rasteriser, which is what the presentation speed parameter is for. Do not commit screenshots.

## Milestones

Each ends with its checks green, an entry in PROGRESS.md (what changed, what was measured, what went wrong), a commit, and a push to the session's branch. Do not start one with the last one's checks red.

0. **Scaffold.** `LICENSE` (the GPLv3 text, as in the simulator), `CLAUDE.md`, `PROGRESS.md`, `package.json`, `.gitignore`, `scripts/serve.js`, `scripts/lint.js`. `CLAUDE.md` takes the family's shape (What this is, Decisions already made, Style, Working rules, Git, Review) and its decisions from this brief: the draw before the race, the algorithm pinned, randomness confined, the simulator copied and never edited, the field is the simulator's, GPLv3, no dependencies, the family's palette and lettering, names never leave the browser, reduced motion in two places that agree, relative URLs. `PROGRESS.md` is append only.
1. **The draw.** `src/draw.js`, the receipt, checks 1 to 5, both verifiers, a plain `verify.html`, `RANDOMNESS.md`. This is the product's spine: nothing else starts until it is green.
2. **The plan.** `src/course.js`, `src/choreo.js`, checks 6 to 8, and `tools/race-chart.html` (distance behind the leader against time, one line per quad) so the drama can be tuned by eye.
3. **The world.** `scripts/vendor.js` and `sim/`, `src/world.js`, `src/fleet.js`, the paddock and rail shots: a page that flies a plan round the field with no UI. `NOTICE` records what came from where: the simulator's files under `sim/` (GPLv3, at the commit in the manifest), and three.js (MIT, loaded from the CDN, not copied).
4. **The flow.** `src/app.js`, `src/hud.js`, `src/page.js`, `src/titles.js`, sponsors end to end, the draw log, `verify.html` in the family's furniture, `scripts/shots.js` and checks 11 to 13.
5. **Polish.** Sound, the aerial shot, the photo finish, the flip, present mode, reduced motion, the phone layout, the no WebGL path, the CSP. The README says what it is, how to run it (`npm run serve`), how the draw works and how to check one, and the licence.

## Not in v1

- A server, accounts, sharing, the board, counters or analytics of any kind.
- A physics simulation deciding anything. The race is a plan, by design.
- Weighted odds. One line is one ticket, and a second line is a second ticket.
- More than 50 names, or more than 3 winners a race.
- Typing a seed into a live draw, a demo with a chosen winner, or anything else that steers a result.
- Offline use, `file://`, a service worker.
- Music, spoken announcements, an image export of the results, a share card, an icon of its own (ask), translations.
- Partner marks, or Betaflight's name or logo.
- Any change to the simulator, the board or the front door. A link to the picker from them, and a mount under webfpv.org, are the owner's follow ups.

## Working rules

- The family's: a GPLv3 header on every file you write (the simulator's wording, with "This file is part of the WebFPV Race Name Picker"); no em or en dashes anywhere, commit messages included; plain JavaScript, no framework, no bundler, no TypeScript, no npm dependencies (Node's built ins for tests and scripts); comments that say why.
- Prefer one file doing an obvious thing to three files doing a clever thing.
- Git: work on the branch your session names, commit small, push at the end of every milestone. Never force push, never rewrite or reset `main`, never `git init`. If `git merge-base` between two refs comes back empty, stop and say so.
- Never change a threshold, a vector, a seed set or a band to make a check pass. Argue in PROGRESS.md.
- Never report a check as passing without running it in the same turn. A check that was not run is not evidence, and neither is a green check that cannot see what changed.
- No adversarial or multi agent review unless asked.
- Ask the owner, and wait, before changing the algorithm, adding a dependency, showing anything a sponsor or partner could read as an endorsement, or touching another repository.

## When you stop

- PROGRESS.md holds the state: the milestones done, every check with its measured value, what is not done and why, and the owner's open questions (at least: the icon's accent, a mount under webfpv.org, and whether the official partners appear here).
- Tell the owner what to look at and what would count as wrong, then ask which verification they want, as the family's CLAUDE.md requires: none, cheap (`npm test` and `npm run lint`), shots (`node scripts/shots.js`), or watch it (open the page, paste twenty names, add two logos, arm it, and look for quads that read as quads, tags that stay on them, boards behind the pack, logos legible on the grass, the fingerprint before the lights, and a winner who matches the receipt in the verifier).
