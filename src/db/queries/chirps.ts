import { asc, eq } from "drizzle-orm";
import { db } from "../index.js";
import { NewChirp, chirps } from "../schema.js";

export async function createChirp(chirp: NewChirp) {
  const [result] = await db
    .insert(chirps)
    .values(chirp)
    .returning();

  return result;
}

export async function getChirps(authorId?: string) {
  if (authorId) {
    return await db
      .select()
      .from(chirps)
      .where(eq(chirps.userId, authorId));
  }

  return await db.select().from(chirps);
}
export async function getChirp(id: string) {
  const [result] = await db
    .select()
    .from(chirps)
    .where(eq(chirps.id, id));

  return result;
}
export async function deleteChirp(chirpId: string) {
  const [result] = await db
    .delete(chirps)
    .where(eq(chirps.id, chirpId))
    .returning();

  return result;
}
