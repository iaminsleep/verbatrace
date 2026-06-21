import assert from "node:assert/strict";
import { test } from "node:test";
import { wrapSrtText } from "./srt";

test("SRT wrapping keeps text beyond two display lines", () => {
  const marker = "END_OF_TRANSCRIPT";
  const input = `one two three four five six seven eight nine ten ${marker}`;
  const output = wrapSrtText(input);

  assert.match(output, /END_OF_TRANSCRIPT/);
  assert.equal(output.replace(/\n/g, " "), input);
});
