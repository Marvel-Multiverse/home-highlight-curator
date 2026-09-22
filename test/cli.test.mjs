import test from "node:test";
import assert from "node:assert/strict";
import { parseArguments } from "../src/cli.mjs";

test("valida count e modos mutuamente exclusivos", () => {
  assert.equal(parseArguments(["--count", "3", "--dry-run"]).count, 3);
  assert.throws(() => parseArguments(["--count", "0"]), /entre 1 e 100/);
  assert.throws(() => parseArguments(["--count", "101"]), /entre 1 e 100/);
  assert.throws(() => parseArguments(["--dry-run", "--publish"]), /simultaneamente/);
});
