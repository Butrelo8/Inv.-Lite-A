import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request } from "express";
import { getAuthUser } from "./auth-user";

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
