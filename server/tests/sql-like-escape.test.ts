import assert from "node:assert/strict";
import test from "node:test";
import { escapeSqlLikePatternFragment, ilikeContainsPattern } from "../sql-like-escape";

test("escapeSqlLikePatternFragment escapes wildcards and backslash", () => {
  assert.equal(escapeSqlLikePatternFragment("a%b_c\\d"), "a\\%b\\_c\\\\d");
});

test("ilikeContainsPattern wraps trimmed input", () => {
  assert.equal(ilikeContainsPattern("  x  "), "%x%");
  assert.equal(ilikeContainsPattern("50%"), "%50\\%%");
});
