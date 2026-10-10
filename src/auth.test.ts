import { beforeAll, describe, expect, it } from "vitest";
import {
  checkPasswordHash,
  hashPassword,
  makeJWT,
  validateJWT,
} from "./auth.js";

describe("JWT", () => {
  const userID = "user-123";
  const secret = "test-secret";
  let token: string;

  beforeAll(() => {
    token = makeJWT(userID, 3600, secret);
  });

  it("should create and validate a JWT", () => {
    const result = validateJWT(token, secret);

    expect(result).toBe(userID);
  });

  it("should reject an expired token", () => {
    const expiredToken = makeJWT(userID, -1, secret);

    expect(() => validateJWT(expiredToken, secret)).toThrow();
  });

  it("should reject a token signed with the wrong secret", () => {
    expect(() => validateJWT(token, "wrong-secret")).toThrow();
  });
});

describe("Password Hashing", () => {
  const password = "correctPassword123!";
  let hash: string;

  beforeAll(async () => {
    hash = await hashPassword(password);
  });

  it("should accept the correct password", async () => {
    const result = await checkPasswordHash(password, hash);

    expect(result).toBe(true);
  });

  it("should reject the wrong password", async () => {
    const result = await checkPasswordHash("wrong-password", hash);

    expect(result).toBe(false);
  });
});
