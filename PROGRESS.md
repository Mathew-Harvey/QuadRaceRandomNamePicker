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
