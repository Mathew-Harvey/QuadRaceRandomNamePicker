# How the draw works, and how to check one

The WebFPV Race Name Picker draws the result before the race, seals it, shows the seal on screen, and then flies the quads so that they finish in exactly the order that was drawn. This file is the whole argument, for somebody who would like to be able to disagree with it. Everything it says is about `webfpv-picker/v1`, the method written in [`src/draw.js`](src/draw.js).

If you only want to check a draw you were shown, skip to [Checking a draw](#checking-a-draw).

## The claim

1. **The order is chosen first.** When the operator presses "Arm and race" the picker takes 32 random bytes from your browser's cryptographic random generator and works out the complete finishing order. Nothing the race does afterwards, no frame time, no camera, no physics, no slow computer, can change who wins, because the race is a plan made from an order that already exists.
2. **The order is sealed before anybody can see it.** The fingerprint on screen before the start is the first 12 hex digits of a hash that commits to the seed and the list of names. The seed is shown after the finish.
3. **Anybody can check it.** The receipt carries the names, the seed and the order. A short program recomputes the commitment and the order from the names and the seed, and either they match what was shown or they do not. There are three such programs, one of which shares no code with the page.
4. **Every name has the same chance at every place.** With 23 names each has exactly 1 chance in 23 of winning, and the same chance of coming second, and so on. A name entered three times has three tickets.

That is the whole of what is claimed. The page says "drawn with your browser's cryptographic random generator" and "sealed before the start", and never says "100% random", "truly random" or "provably fair" as a bare claim, because none of those is what this is. What it does not prove is [set out below](#what-this-does-not-prove).

## Why the order is drawn before the race

The usual duck race is a program in which the animation decides. The ducks move by small random amounts every frame and whoever is in front at the end wins. Nobody can audit that: the result is whatever one particular run of the animation produced, usually from the engine's ordinary random function, and the person who knows how it works has no way to show you that the winner was not chosen.

Here the direction is reversed. The result comes first and the race is a show of it. The plan that moves the quads (`src/choreo.js`) is a pure function of the finishing order, the names, the length chosen and a second seed that only decides how the race looks. A test makes 3,000 plans and checks that every one of them has the quads crossing the line in exactly the drawn order.

## The method, `webfpv-picker/v1`

This is the specification. `src/draw.js`, `tools/verify.mjs` and the independent `tools/verify.py` all implement it, and the tests hold all three to the same test vectors below. It is pinned: it is not improved in place, because a change would invalidate every receipt anybody kept. A better method would be `webfpv-picker/v2`, beside this one.

### Inputs

- **names**: 2 to 50 strings, in the order entered. Before sealing each is made canonical: Unicode NFC, control characters and each run of whitespace collapsed to one space, trimmed, lone surrogates replaced with U+FFFD, and cut to at most 80 code points. Empty lines are dropped. Duplicates are separate entries, which is how a raffle gives somebody two tickets. A canonical name never contains a newline, and that is what makes the join below unambiguous. The receipt carries the canonical names, and a verifier uses them exactly as written.
- **seed**: 32 bytes from `crypto.getRandomValues`, taken once, when the operator arms the race, and from nowhere else.

### The computation

Strings are UTF-8. `||` is concatenation, `0x00` is one zero byte, and `u32be(j)` is four bytes, big endian. `listDigest` and `seed` are the raw 32 bytes, not their hex spelling.

```
listDigest = SHA-256( names joined with "\n" )
commitment = SHA-256( "webfpv-picker/v1/commit" || 0x00 || seed || listDigest )
block(j)   = HMAC-SHA-256( key = seed,
                           msg = "webfpv-picker/v1/draw" || 0x00 || listDigest || u32be(j) ),   j = 0, 1, 2, ...
words      = the blocks end to end, read as consecutive big endian uint32
below(n)   : limit = 2^32 - (2^32 mod n)
             take words until one, x, is below limit; return x mod n
order      = [0, 1, ..., N-1]
             for i = N-1 down to 1:  k = below(i + 1);  swap order[i] and order[k]
showSeed   = HMAC-SHA-256( key = seed,
                           msg = "webfpv-picker/v1/show" || 0x00 || listDigest )
```

`order[0]` is the index of the winner, `order[1]` of second place, and so on. The whole finishing order is the draw, and the first W places are the W winners (W is 1, 2 or 3). `showSeed` seeds everything the race does for looks: it is a different message under the same key, so the look of a race and its result come from separate streams, and a replay of a receipt is the same race.

The fingerprint on the glass is the first 12 hex digits of `commitment`, uppercase, in three groups of four: `1B39 BA47 3BA5`.

### A worked example

Five names, `Alice`, `Bob`, `Charlie`, `Dee`, `Eve`, and the seed `000102...1f` (the bytes 0 to 31).

1. `listDigest` is the SHA-256 of the 23 bytes `Alice\nBob\nCharlie\nDee\nEve`, which is `8c8b9a7c...bbc87`.
2. `commitment` is the SHA-256 of the 23 bytes of `webfpv-picker/v1/commit`, a zero byte, the 32 seed bytes and the 32 digest bytes (88 bytes in all), which is `1b39ba47...5076c`.
3. `block(0)` is the HMAC under the seed of `webfpv-picker/v1/draw`, a zero byte, the digest and `00 00 00 00`. Its first four bytes, read big endian, are the first word. Five names need four words, which one block holds with room to spare.
4. The shuffle starts with `[0, 1, 2, 3, 4]` and takes four numbers: `below(5)`, `below(4)`, `below(3)`, `below(2)`. The finishing order that comes out is `[0, 4, 2, 3, 1]`: Alice, Eve, Charlie, Dee, Bob.

The complete values are in [the test vectors](#test-vectors). If you implement the method in another language, those are what to check against.

## Why each piece is there

**256 bits of seed from the operating system's generator.** A shuffle can only reach as many orderings as its generator has states. 50 names have 50! orderings, which is about 2^214.2 (3.04 x 10^64). The ordinary random function in the major engines is, at the time of writing, a generator with 128 bits of state (xorshift128+ or a close relative), and 2^128 is about 3.4 x 10^38: for 35 names or more it cannot reach every ordering, whatever it is seeded with. A 256 bit seed has more states than 50 names have orderings. The operating system's generator is also the one the browser provides for keys, which is the strongest source a web page has.

**HMAC-SHA-256 in counter mode.** The seed is expanded into as many words as the shuffle needs by computing HMAC-SHA-256 under the seed over a counter, the shape of the counter mode in NIST SP 800-108. HMAC is a standard pseudorandom function, so to anybody who does not hold the seed the words are as good as uniform. The label and the list digest are inside every message, so the stream cannot be reused for another list or another purpose.

**Rejection sampling.** `x mod n` on a 32 bit word is slightly biased unless 2^32 is a multiple of n, so words at or above `limit` are thrown away and the next one is taken. The accepted range, 0 up to `limit`, is a whole number of multiples of n, so what is left is exactly uniform. For n a power of two nothing is ever rejected. The worst case is n = 50, where a word is rejected about once in 93 million, and a whole 50 name shuffle meets one about once in 8 million draws.

**Fisher-Yates.** The shuffle (Durstenfeld's form) on exactly uniform integers gives each of the N! orderings probability exactly 1 / N!. That is the statement behind "each name has a 1 in 23 chance of winning" and behind every other place. A shuffle that looks similar but swaps with `below(N)` at every step does not have this property, and `tests/draw.test.js` runs one on the same data to show that the statistic used here can fail.

**Commit, then reveal.** The commitment is on screen before the lights and the seed is shown after the finish. Because `listDigest` is inside the commitment, the list cannot be swapped afterwards either: a different list gives a different digest, and so a different commitment. SHA-256 is collision resistant and the seed is 256 bits, so there is no practical way to find a second seed and list with the same commitment, and the commitment tells nobody the order before the reveal.

## What this does not prove

It cannot stop an operator running draws off camera until one suits them. That is the limit of anything that runs on a client, and it is worth saying plainly.

- **Reruns.** Whoever runs the picker can press "Arm and race" as many times as they like, in as many windows as they like, and show only the draw they prefer. The picker makes this visible and does not make it impossible. Every arming makes a fresh seal with its own time. Every seal is written to this browser's draw log before the countdown starts, so a reload mid race loses the show and not the result, and the log lists every draw made in the browser, finished or not. An operator who clears the log, uses another browser or a private window is not stopped by any of this.
- **A page that lies.** The commitment protects the draw against being changed after it was shown, relative to what the audience saw. It does not protect against a page that was altered to show something else. The picker is a static site with no build step, so what is served is what is in the repository, and `src/draw.js` is short enough to read. If you doubt the page, check the receipt with `tools/verify.py`, which is a different program.
- **Labels.** The commitment covers the names and the seed, and so the order. It does not cover the title, the time sealed, the number of winners or the length of the show. A receipt with a different title still checks out. They are labels on a draw, not part of it.
- **A weak machine.** If the operating system's random generator is compromised, so is every key that machine makes. That is outside what a web page can defend against.
- **Who chose the names.** The draw is exactly fair over the list it is given. Whether the list was fair is a human matter.

### To run a draw nobody has to take on trust

1. Say the rules before arming: one draw, no redraw.
2. Share or record the screen from before the names are typed, so a second window cannot be used off camera.
3. Let the audience see the fingerprint before the start.
4. After the finish, show the "Draws in this browser" list: there should be one new line.
5. Post the receipt where everybody can see it. Anyone can check it at `verify.html`, with `node tools/verify.mjs`, or with `python3 tools/verify.py`.

## The receipt

The results page offers two forms of the same receipt, and every verifier reads both.

### JSON

<!-- receipt-json -->
```json
{
  "algorithm": "webfpv-picker/v1",
  "title": "Friday raffle",
  "sealedAt": "2026-10-03T09:30:00.000Z",
  "names": [
    "Alice",
    "Bob",
    "Charlie",
    "Dee",
    "Eve"
  ],
  "winners": 1,
  "length": 30,
  "listDigest": "8c8b9a7c80af341b7d7d0110ff13c968082a14a829924533560d37361edbbc87",
  "commitment": "1b39ba473ba5b7094ef3df3e6e0f2e6953c56cb1c120efb1303e3401a6c5076c",
  "seed": "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  "order": [0, 4, 2, 3, 1]
}
```

| Key | Meaning |
| --- | --- |
| `algorithm` | `webfpv-picker/v1`. A verifier that does not know the method says so and checks nothing. |
| `title` | The event title, a label, at most 40 characters. May be empty. |
| `sealedAt` | When the draw was sealed, UTC, ISO 8601. A label. |
| `names` | The canonical names, in the order entered. |
| `winners` | How many places are winners, 1 to 3, at most N - 1. A label. |
| `length` | Optional. Seconds of race, a label that lets a replay be the same race. |
| `listDigest` | The list digest, 64 hex digits. |
| `commitment` | The commitment shown before the start, 64 hex digits. |
| `seed` | The seed, revealed after the finish, 64 hex digits. |
| `order` | The finishing order as **zero based** entry indices. `order[0]` is the winner's index. |

### Text

The form you can paste into a message. Its entries and places are **one based**, because people count from one.

<!-- receipt-text -->
```
WebFPV Race Name Picker receipt
algorithm: webfpv-picker/v1
title: Friday raffle
sealed: 2026-10-03T09:30:00.000Z
winners: 1
length: 30
list digest: 8c8b9a7c80af341b7d7d0110ff13c968082a14a829924533560d37361edbbc87
commitment: 1b39ba473ba5b7094ef3df3e6e0f2e6953c56cb1c120efb1303e3401a6c5076c
seed: 000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f

names: 5
1. Alice
2. Bob
3. Charlie
4. Dee
5. Eve

finishing order:
place 1: entry 1 (Alice)
place 2: entry 5 (Eve)
place 3: entry 3 (Charlie)
place 4: entry 4 (Dee)
place 5: entry 2 (Bob)
```

The grammar, as the verifiers read it:

- Lines end with LF or CRLF. Blank lines are ignored anywhere. A leading byte order mark is ignored. The first line, `WebFPV Race Name Picker receipt`, is optional.
- A `key: value` line, with the key as listed, sets that field: `algorithm`, `title`, `sealed` (which is `sealedAt`), `winners`, `length`, `list digest`, `commitment` and `seed`. The value runs to the end of the line, and leading and trailing spaces are trimmed. A key given twice is an error. Any other `key: value` line is ignored, so a later receipt can add a label.
- `names: N` is followed by exactly N lines, `1. name` to `N. name`, in order. The name is everything after the first `. `.
- `finishing order:` is followed by exactly N lines, `place 1: entry k (name)` to `place N: entry k (name)`. `k` is the **one based** entry number, and the name in parentheses has to be the name of that entry, or the receipt contradicts itself and is refused.
- Hex digits are read in either case.
- `N` is 2 to 50, and `winners` is 1 to 3 and no more than N - 1.

## Checking a draw

Three ways, from the easiest to the most independent.

**In the browser.** Open `verify.html` and paste the receipt, or follow the link on the results page, which carries the receipt in the address after the `#`, where a server never sees it. It recomputes the list digest, the commitment and the order with `src/draw.js` and puts a tick or a cross by each, with one sentence about what that means.

**In Node.**

```
node tools/verify.mjs receipt.txt
```

This runs the same `src/draw.js`, so it answers "does the file I was shown say what it claims".

**With Python's standard library, and nothing of ours.**

```
python3 tools/verify.py receipt.txt
```

`tools/verify.py` is about eighty lines of the method plus a reader for the receipt, written from this document and sharing no code with the page. If the two disagree with each other, one of them has a bug, and `tests/draw.test.js` runs both over 200 receipts the page's own code wrote, and over tampered ones, on every test run. Both tools exit 0 when every receipt checks out and 1 when one does not.

A tick on the commitment line means: this seed and this list produce exactly the commitment that was on screen before the start. A tick on the order line means: this seed and this list produce exactly this finishing order, so nobody chose it afterwards. If you saw the fingerprint on screen, compare it with the first 12 digits of the commitment.

## Test vectors

Computed by Node's `crypto` module, by Python's `hashlib` and `hmac`, and by WebCrypto, and the three agree. Indices are zero based. If your implementation disagrees with these, your implementation is wrong.

**V1**

```
names       Alice, Bob, Charlie, Dee, Eve
seed        000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
listDigest  8c8b9a7c80af341b7d7d0110ff13c968082a14a829924533560d37361edbbc87
commitment  1b39ba473ba5b7094ef3df3e6e0f2e6953c56cb1c120efb1303e3401a6c5076c
order       0 4 2 3 1   (Alice, Eve, Charlie, Dee, Bob)
showSeed    024665687403d0414d840325fc0f8af4b93b2b16d9ce927d30507b68cd3c5f15
```

**V2**

```
names       "Pilot 01" to "Pilot 50", two digits each
seed        SHA-256 of the text "webfpv-picker test vector 2"
            = 56b586c93e39bf905aba908b5fb827789b17805aad6e066123df8b2631e4cfb6
listDigest  191879b268c25fc766759d8668a0df109867dbf1768307fd4e2035cc2dc0aaca
commitment  f9e4d3fa78082e8132eb1b6ef594a851047efe6531e90f2c754158037cc7fef6
order       35 28 0 13 48 25 47 27 37 5 18 8 16 17 31 33 24 23 43 45 15 38 41 20 39
            12 36 9 14 2 30 10 4 44 7 6 22 11 21 49 3 32 46 42 1 34 26 19 29 40
            (Pilot 36 wins)
showSeed    804c799cbc6e44db2b9713a4b7bda901d31f92b94e38468229fe50cd8f6b2836
```

**V3**

```
names       Zoë, Søren, 李雷, José, Ngāi Tahu, Ōtautahi   (NFC)
seed        a5 repeated 32 times
listDigest  26540588d38fe12e29ff93cff688d440009f85ffd27a834fb7ac2f38984dab72
commitment  9fe17fab35ff5d33dd4202a2397882d7f619092545a83986a58417a21266aab5
order       1 0 5 4 3 2   (Søren, Zoë, Ōtautahi, Ngāi Tahu, José, 李雷)
showSeed    c657892a758a5a5f18d3093fa35397d911fc964fbfd8c77611f643073d74570f
```

### Uniformity

Over fixed seed sets, so the statistics are reproducible. The names are the numbers `1` to `N` as strings, and seed `i` of set `S` is the SHA-256 of the text `webfpv-picker/test/S/i`, with `i` in decimal, counting from 0.

| Set | Draws | Statistic | Pass below (the 0.999 point) | A correct implementation gives |
| --- | --- | --- | --- | --- |
| `uniform-4` | 240,000 | chi-squared over the 24 orderings | 49.73 (23 dof) | 20.696, all 24 seen |
| `uniform-50` | 100,000 | chi-squared over the 50 winners | 85.35 (49 dof) | 46.083 |
| `uniform-7` | 140,000 | chi-squared of who lands at each of the 7 places | 22.46 each (6 dof) | 8.717, 4.364, 5.787, 10.422, 1.225, 11.282, 6.446 |

For contrast, the naive shuffle, which visits every position down to 0 and swaps each with a uniformly chosen index of the whole array, scores 7,143.9 on `uniform-4`. The same mistake inside the correct loop (stopping at 1) scores 60,861.4. A statistic that can fail is the only kind worth passing.

`npm test` runs all of it, in about ten seconds. The checks are numbered as in the brief the picker was built from: 1 the vectors, 2 two engines (`src/draw.js` on WebCrypto against a second implementation on `node:crypto`, 1,000 random lists), 3 Python, 4 rejection (`below(n)` over words chosen by hand, n from 2 to 50), 5 uniformity.

## Where everything is

| File | What it is |
| --- | --- |
| [`src/draw.js`](src/draw.js) | The draw, the seal and the receipt. No imports, no DOM. The only file that asks for randomness or hashing. |
| [`tools/verify.mjs`](tools/verify.mjs) | Command line verifier in Node, over `src/draw.js`. |
| [`tools/verify.py`](tools/verify.py) | Independent verifier, Python standard library only. |
| [`verify.html`](verify.html) | The verifier in the browser. |
| [`tests/draw.test.js`](tests/draw.test.js) | The vectors, the second implementation, the statistics. |
| [`scripts/lint.js`](scripts/lint.js) | Holds the rules as greps: the ordinary random function is nowhere outside `sim/`, the browser's randomness and hashing are in `src/draw.js` only, and `src/draw.js` imports nothing. |

## Changing the method

Do not. A change invalidates every receipt anybody kept and every claim anybody made from one. If the method is wrong, say why to the owner before changing a character, and the fix is a `webfpv-picker/v2` that sits beside this one, with its own vectors, while `v1` receipts stay checkable forever.
