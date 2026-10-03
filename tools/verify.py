#!/usr/bin/env python3
# verify.py: check a WebFPV Race Name Picker receipt with Python's standard
# library and nothing else.
#
#   python3 tools/verify.py receipt.txt
#   python3 tools/verify.py receipt.json other.txt
#   python3 tools/verify.py --json receipt.txt     (one JSON object per receipt)
#   python3 tools/verify.py -                      (read one receipt from stdin)
#
# WHY THIS FILE EXISTS. The picker's draw is checked by the browser, by
# tools/verify.mjs (which runs src/draw.js in Node) and by this, which shares
# no code with either. The algorithm was written down first and each side
# implements it from the words, so a mistake in one is a disagreement with the
# other, and tests/draw.test.js runs both over the same receipts. If you
# would rather not trust the picker's JavaScript at all, this is the file to
# read: it is the whole of webfpv-picker/v1 in about eighty lines.
#
# It differs from src/draw.js on purpose where it can. The words are a lazy
# generator, so there is no "ran out of words, fetch more" step to get wrong.
# The receipt's text form is read by a grammar written from RANDOMNESS.md and
# not by porting the JavaScript parser.
#
# Exit status: 0 if every receipt checks out, 1 if any does not, 2 for usage.
#
# This file is part of the WebFPV Race Name Picker.
#
# The WebFPV Race Name Picker is free software: you can redistribute it
# and/or modify it under the terms of the GNU General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# The WebFPV Race Name Picker is distributed in the hope that it will be
# useful, but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with the WebFPV Race Name Picker. If not, see
# <https://www.gnu.org/licenses/>.

import hashlib
import hmac
import json
import re
import struct
import sys

ALGORITHM = "webfpv-picker/v1"
MIN_NAMES, MAX_NAMES, MAX_WINNERS, NAME_LENGTH = 2, 50, 3, 80


# ---------------------------------------------------------------- the draw

def sha256(*parts):
    h = hashlib.sha256()
    for part in parts:
        h.update(part)
    return h.digest()


def list_digest(names):
    return sha256("\n".join(names).encode("utf-8"))


def commitment(seed, digest):
    return sha256(b"webfpv-picker/v1/commit", b"\x00", seed, digest)


def show_seed(seed, digest):
    return hmac.new(seed, b"webfpv-picker/v1/show\x00" + digest, hashlib.sha256).digest()


def words(seed, digest):
    """The blocks end to end, read as consecutive big endian uint32, forever."""
    j = 0
    while True:
        block = hmac.new(
            seed, b"webfpv-picker/v1/draw\x00" + digest + struct.pack(">I", j), hashlib.sha256
        ).digest()
        j += 1
        for k in range(8):
            yield struct.unpack(">I", block[4 * k:4 * k + 4])[0]


def below(n, stream):
    limit = 2 ** 32 - (2 ** 32 % n)
    for x in stream:
        if x < limit:
            return x % n


def shuffle(count, stream):
    order = list(range(count))
    for i in range(count - 1, 0, -1):
        k = below(i + 1, stream)
        order[i], order[k] = order[k], order[i]
    return order


def derive(names, seed):
    digest = list_digest(names)
    return {
        "listDigest": digest.hex(),
        "commitment": commitment(seed, digest).hex(),
        "showSeed": show_seed(seed, digest).hex(),
        "order": shuffle(len(names), words(seed, digest)),
    }


# --------------------------------------------------------------- receipts

class ReceiptError(Exception):
    pass


TEXT_FIELDS = {
    "algorithm": "algorithm",
    "title": "title",
    "sealed": "sealedAt",
    "winners": "winners",
    "length": "length",
    "list digest": "listDigest",
    "commitment": "commitment",
    "seed": "seed",
}


def parse_text(text):
    lines = re.split(r"\r\n|\r|\n", text)
    state = {"at": 0}

    def peek():
        while state["at"] < len(lines) and lines[state["at"]].strip() == "":
            state["at"] += 1
        return lines[state["at"]] if state["at"] < len(lines) else None

    def take():
        line = peek()
        if line is not None:
            state["at"] += 1
        return line

    raw = {}
    if peek() is not None and re.match(r"^webfpv race name picker receipt\s*$", peek(), re.I):
        take()
    while peek() is not None:
        line = peek()
        m = re.match(r"^([a-z][a-z ]*?):[ \t]*(.*)$", line, re.I)
        if not m:
            raise ReceiptError('cannot read the line "%s"' % line.strip()[:60])
        key, value = m.group(1).lower(), m.group(2).strip()
        take()
        if key == "names":
            if "names" in raw:
                raise ReceiptError("the names are listed twice")
            if not re.match(r"^\d+$", value):
                raise ReceiptError('"names:" should say how many names there are')
            raw["names"] = []
            for k in range(1, int(value) + 1):
                e = re.match(r"^(\d+)\. (.*)$", take() or "")
                if not e or int(e.group(1)) != k:
                    raise ReceiptError("name %d is missing or out of place" % k)
                raw["names"].append(e.group(2))
        elif key == "finishing order":
            if "order" in raw:
                raise ReceiptError("the finishing order is given twice")
            if "names" not in raw:
                raise ReceiptError("the finishing order comes before the names")
            order = []
            for p in range(1, len(raw["names"]) + 1):
                e = re.match(r"^place (\d+): entry (\d+) \((.*)\)$", take() or "")
                if not e or int(e.group(1)) != p:
                    raise ReceiptError("place %d is missing or out of place" % p)
                entry = int(e.group(2))
                if entry < 1 or entry > len(raw["names"]) or raw["names"][entry - 1] != e.group(3):
                    raise ReceiptError("place %d names an entry the list does not agree with" % p)
                order.append(entry - 1)
            raw["order"] = order
        elif key in TEXT_FIELDS:
            if TEXT_FIELDS[key] in raw:
                raise ReceiptError('"%s" is given twice' % key)
            raw[TEXT_FIELDS[key]] = value
        # Any other "key: value" line is a label and is ignored.
    return raw


def whole(value, what):
    if isinstance(value, bool):
        raise ReceiptError("%s is not a whole number" % what)
    if isinstance(value, str) and re.match(r"^\d+$", value):
        return int(value)
    if isinstance(value, int):
        return value
    raise ReceiptError("%s is not a whole number" % what)


def hex_field(value, what):
    if not isinstance(value, str) or not re.match(r"^[0-9a-fA-F]{64}$", value.strip()):
        raise ReceiptError("%s should be 64 hexadecimal digits" % what)
    return value.strip().lower()


def normalise(raw):
    if not isinstance(raw, dict):
        raise ReceiptError("a receipt is an object")
    if not isinstance(raw.get("algorithm"), str) or raw["algorithm"] == "":
        raise ReceiptError("no method is named")
    names = raw.get("names")
    if not isinstance(names, list) or not all(isinstance(n, str) for n in names):
        raise ReceiptError("no list of names")
    if not MIN_NAMES <= len(names) <= MAX_NAMES:
        raise ReceiptError("%d names is outside %d to %d" % (len(names), MIN_NAMES, MAX_NAMES))
    if not isinstance(raw.get("sealedAt"), str) or raw["sealedAt"] == "":
        raise ReceiptError("no time sealed")
    winners = whole(raw.get("winners"), "winners")
    if not 1 <= winners <= min(MAX_WINNERS, len(names) - 1):
        raise ReceiptError("%d winners is not possible for %d names" % (winners, len(names)))
    order = raw.get("order")
    if not isinstance(order, list):
        raise ReceiptError("no finishing order")
    order = [whole(v, "the order") for v in order]
    if sorted(order) != list(range(len(names))):
        raise ReceiptError("the order does not name every entry once")
    return {
        "algorithm": raw["algorithm"],
        "names": names,
        "winners": winners,
        "listDigest": hex_field(raw.get("listDigest"), "the list digest"),
        "commitment": hex_field(raw.get("commitment"), "the commitment"),
        "seed": hex_field(raw.get("seed"), "the seed"),
        "order": order,
    }


def parse(text):
    text = text.lstrip("﻿").strip()
    if text == "":
        raise ReceiptError("the receipt is empty")
    if text[0] == "{":
        try:
            raw = json.loads(text)
        except ValueError as e:
            raise ReceiptError("starts like JSON and does not parse: %s" % e)
        return normalise(raw)
    return normalise(parse_text(text))


# ------------------------------------------------------------------ checks

def check(receipt):
    """One dict per receipt: what the arithmetic gives and whether it agrees."""
    if receipt["algorithm"] != ALGORITHM:
        return {"ok": False, "error": "this verifier checks %s and the receipt says %s" % (ALGORITHM, receipt["algorithm"])}
    try:
        derived = derive(receipt["names"], bytes.fromhex(receipt["seed"]))
    except UnicodeEncodeError:
        return {"ok": False, "error": "a name cannot be written as UTF-8"}
    checks = {
        "digest": derived["listDigest"] == receipt["listDigest"],
        "commitment": derived["commitment"] == receipt["commitment"],
        "order": derived["order"] == receipt["order"],
    }
    return {
        "ok": all(checks.values()),
        "error": None,
        "listDigest": derived["listDigest"],
        "commitment": derived["commitment"],
        "showSeed": derived["showSeed"],
        "order": derived["order"],
        "checks": checks,
        "names": receipt["names"],
        "winners": receipt["winners"],
    }


def report(label, result):
    print(label)
    if result.get("error"):
        print("  FAIL  %s" % result["error"])
        return
    for key, text, value in (
        ("digest", "list digest", result["listDigest"]),
        ("commitment", "commitment", result["commitment"]),
        ("order", "finishing order", " ".join(str(e + 1) for e in result["order"])),
    ):
        print("  %-4s  %-16s %s" % ("ok" if result["checks"][key] else "FAIL", text, value))
    names, order, winners = result["names"], result["order"], result["winners"]
    print("  winner%s: %s" % ("s" if winners > 1 else "", ", ".join(names[e] for e in order[:winners])))
    print("  %s" % ("the draw checks out" if result["ok"] else "THIS DRAW DOES NOT CHECK OUT"))


def main(argv):
    as_json = "--json" in argv
    paths = [a for a in argv if a != "--json"]
    if not paths or any(a.startswith("--") for a in paths):
        sys.stderr.write("usage: verify.py [--json] RECEIPT [RECEIPT ...]   (use - for standard input)\n")
        return 2
    everything_ok = True
    for path in paths:
        try:
            if path == "-":
                text = sys.stdin.read()
            else:
                with open(path, encoding="utf-8-sig") as handle:
                    text = handle.read()
            result = check(parse(text))
        except (OSError, ReceiptError) as e:
            result = {"ok": False, "error": str(e)}
        everything_ok = everything_ok and result["ok"]
        if as_json:
            slim = {k: result[k] for k in ("ok", "error", "listDigest", "commitment", "showSeed", "order", "checks") if k in result}
            slim["file"] = path
            print(json.dumps(slim, sort_keys=True, separators=(",", ":")))
        else:
            report(path, result)
    return 0 if everything_ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
