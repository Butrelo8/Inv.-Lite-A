import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request } from "express";
import { getAuthUser, getAuthUserId } from "./auth-user";

describe("getAuthUser", () => {
  it("returns undefined when user is absent", () => {
    assert.equal(getAuthUser({} as Request), undefined);
  });

  it("returns the Passport user when present", () => {
    const user = { id: 7, username: "admin", role: "admin" };
    const req = { user } as Request;
    assert.deepEqual(getAuthUser(req), user);
  });
});

describe("getAuthUserId", () => {
  it("returns null when user is absent", () => {
    assert.equal(getAuthUserId({} as Request), null);
  });

  it("returns null when id is not a finite number", () => {
    assert.equal(getAuthUserId({ user: { id: NaN, username: "x", role: "viewer" } } as Request), null);
    assert.equal(getAuthUserId({ user: { id: Number.POSITIVE_INFINITY, username: "x", role: "viewer" } } as Request), null);
  });

  it("returns numeric id when valid", () => {
    assert.equal(getAuthUserId({ user: { id: 42, username: "u", role: "editor" } } as Request), 42);
  });
});
