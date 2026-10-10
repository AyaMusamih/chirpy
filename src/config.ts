import type { MigrationConfig } from "drizzle-orm/migrator";

export type APIConfig = {
  fileserverHits: number;
  port: number;
  platform: string;
  polkaKey: string;
};

export type DBConfig = {
  url: string;
  migrationConfig: MigrationConfig;
};

process.loadEnvFile();

function envOrThrow(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export const config: {
  jwtSecret: string;
  api: APIConfig;
  db: DBConfig;
} = {
  jwtSecret: envOrThrow("JWT_SECRET"),

  api: {
    fileserverHits: 0,
    port: Number(envOrThrow("PORT")),
    platform: envOrThrow("PLATFORM"),
    polkaKey: envOrThrow("POLKA_KEY"),
  },
  db: {
    url: envOrThrow("DB_URL"),
    migrationConfig: {
      migrationsFolder: "./src/db/migrations",
    },
  },
};