import argon2 from "argon2";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Request } from "express";
import { randomBytes } from "node:crypto";


export async function hashPassword(
  password: string,
): Promise<string> {
  return await argon2.hash(password);
}

export async function checkPasswordHash(
  password: string,
  hash: string,
): Promise<boolean> {
  return await argon2.verify(hash, password);
}

type TokenPayload = Pick<JwtPayload, "iss" | "sub" | "iat" | "exp">;

export function makeJWT(
  userID: string,
  expiresIn: number,
  secret: string,
): string {
  const iat = Math.floor(Date.now() / 1000);

  const payload: TokenPayload = {
    iss: "chirpy",
    sub: userID,
    iat,
    exp: iat + expiresIn,
  };

  return jwt.sign(payload, secret);
}

export function validateJWT(
  tokenString: string,
  secret: string,
): string {
  const payload = jwt.verify(tokenString, secret);

  if (typeof payload === "string" || typeof payload.sub !== "string") {
    throw new Error("Invalid token payload");
  }

  return payload.sub;
}

export function getBearerToken(req: Request): string {
  const authHeader = req.get("Authorization");

  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }

  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new Error("Invalid Authorization header");
  }

  return token.trim();
}

export function makeRefreshToken(): string {
  return randomBytes(32).toString("hex");
}
export function getAPIKey(req: Request): string {
  const authHeader = req.get("Authorization");

  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }

  const [scheme, key] = authHeader.split(" ");

  if (scheme !== "ApiKey" || !key) {
    throw new Error("Invalid Authorization header");
  }

  return key.trim();
}