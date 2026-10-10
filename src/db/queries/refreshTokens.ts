import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../index.js";
import { NewRefreshToken, refreshTokens, users } from "../schema.js";

export async function createRefreshToken(token: NewRefreshToken) {
  const [result] = await db
    .insert(refreshTokens)
    .values(token)
    .returning();

  return result;
}

export async function getUserFromRefreshToken(token: string) {
  const [result] = await db
    .select({ user: users })
    .from(refreshTokens)
    .innerJoin(users, eq(refreshTokens.userId, users.id))
    .where(
      and(
        eq(refreshTokens.token, token),
        gt(refreshTokens.expiresAt, new Date()),
        isNull(refreshTokens.revokedAt),
      ),
    );

  return result?.user;
}

export async function revokeRefreshToken(token: string) {
  const now = new Date();

  await db
    .update(refreshTokens)
    .set({
      revokedAt: now,
      updatedAt: now,
    })
    .where(eq(refreshTokens.token, token));
}