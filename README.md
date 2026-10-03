# WebFPV Race Name Picker

Names in, a race of five inch quads, a winner out, and a draw anybody can check.

Up to 50 names go in. Each becomes a quad on a start grid in the WebFPV simulator's race field. The picker draws the result first, with the browser's cryptographic random generator, seals it, and shows the seal's fingerprint on screen. Then the quads race, and they cross the line in exactly the order that was drawn. The results page breaks the seal so the draw can be checked in the browser, in Node, or with Python's standard library.

It is part of the WebFPV family, with the simulator, the track builder, the board and the front door. It is a static site: there is no server, and the names and logos never leave your browser.

**Status: v1 is being built.** `PROGRESS.md` says what is done, what was measured, and what is still open. The brief it is built from is `prompts/build-v1.md`.

## Run it

```
npm run serve
```

and open the address it prints. Node 22 or later. There is nothing to install, because there are no dependencies.

## Check it

```
npm test
npm run lint
```

## Licence

GPLv3 or later, see `LICENSE`. `NOTICE` records what came from where.
