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
