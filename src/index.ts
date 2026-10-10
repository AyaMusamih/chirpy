import express, {
  NextFunction,
  Request,
  Response,
} from "express";

import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";

import { config } from "./config.js";
import {
  createUser,
  deleteAllUsers,
  getUserByEmail,
  updateUser,
  upgradeUserToChirpyRed,
} from "./db/queries/users.js";
import {
  createChirp,
  getChirps,
  getChirp,
  deleteChirp,
} from "./db/queries/chirps.js";
import {
  hashPassword,
  checkPasswordHash,
  makeJWT,
  makeRefreshToken,
  getBearerToken,
  validateJWT,
  getAPIKey,
} from "./auth.js";
import {
  createRefreshToken,
  getUserFromRefreshToken,
  revokeRefreshToken,
} from "./db/queries/refreshTokens.js";

const app = express();
app.use(express.json());

const migrationClient = postgres(config.db.url, { max: 1 });

await migrate(
  drizzle(migrationClient),
  config.db.migrationConfig,
);

function middlewareLogResponses(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.on("finish", () => {
    if (res.statusCode >= 400) {
      console.log(
        `[NON-OK] ${req.method} ${req.url} - Status: ${res.statusCode}`,
      );
    }
  });

  next();
}


function middlewareMetricsInc(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  config.api.fileserverHits++;
  next();
}

app.use(middlewareLogResponses);

app.use("/app", middlewareMetricsInc);

app.use("/app", express.static("./src/app"));

function handlerReadiness(req: Request, res: Response): void {
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send("OK");
}

function handlerMetrics(req: Request, res: Response): void {
  res.set("Content-Type", "text/html; charset=utf-8");

  res.send(`
<html>
  <body>
    <h1>Welcome, Chirpy Admin</h1>
    <p>Chirpy has been visited ${config.api.fileserverHits} times!</p>
  </body>
</html>
  `);
}

async function handlerGetChirp(
  req: Request,
  res: Response,
): Promise<void> {
  const chirp = await getChirp(req.params.chirpId as string);

  if (!chirp) {
    throw new NotFoundError("Chirp not found");
  }

  res.status(200).json(chirp);
}

async function handlerGetChirps(
  req: Request,
  res: Response,
): Promise<void> {
  let authorId = "";
  const authorIdQuery = req.query.authorId;

  if (typeof authorIdQuery === "string") {
    authorId = authorIdQuery;
  }

  const chirps = await getChirps(authorId || undefined);

  let sort = "asc";
  const sortQuery = req.query.sort;

  if (typeof sortQuery === "string") {
    sort = sortQuery;
  }

  chirps.sort((a, b) => {
    if (sort === "desc") {
      return b.createdAt.getTime() - a.createdAt.getTime();
    }

    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  res.status(200).json(chirps);
}

async function handlerDeleteChirp(
  req: Request,
  res: Response,
): Promise<void> {
  let userID: string;

  try {
    const token = getBearerToken(req);
    userID = validateJWT(token, config.jwtSecret);
  } catch {
    throw new UnauthorizedError("Invalid or missing token");
  }

  const chirpId = req.params.chirpId as string;
  const chirp = await getChirp(chirpId);

  if (!chirp) {
    throw new NotFoundError("Chirp not found");
  }

  if (chirp.userId !== userID) {
    throw new ForbiddenError("You are not the author of this chirp");
  }

  await deleteChirp(chirpId);

  res.status(204).end();
}

async function handlerReset(
  req: Request,
  res: Response,
): Promise<void> {
  if (config.api.platform !== "dev") {
    throw new ForbiddenError("Forbidden");
  }

  config.api.fileserverHits = 0;

  await deleteAllUsers();

  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send("Hits reset to 0");
}

async function handlerCreateChirp(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body;

let token: string;
let userID: string;

try {
  token = getBearerToken(req);
  userID = validateJWT(token, config.jwtSecret);
} catch {
  throw new UnauthorizedError("Invalid or missing token");
}

  if (typeof body.body !== "string") {
    res.status(400).json({
      error: "Invalid request body",
    });
    return;
  }

  if (body.body.length > 140) {
    throw new BadRequestError(
      "Chirp is too long. Max length is 140",
    );
  }

  const profaneWords = ["kerfuffle", "sharbert", "fornax"];

  const words = body.body.split(" ");

  const cleanedWords = words.map((word: string) => {
    if (profaneWords.includes(word.toLowerCase())) {
      return "****";
    }

    return word;
  });

  const cleanedBody = cleanedWords.join(" ");

  const chirp = await createChirp({
  body: cleanedBody,
  userId: userID,
});

  res.status(201).json(chirp);
}

class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
  }
}

class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
  }
}

class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
  }
}

class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
  }
}

async function handlerCreateUser(
  req: Request,
  res: Response,
): Promise<void> {
  const hashedPassword = await hashPassword(req.body.password);

  const user = await createUser({
    email: req.body.email,
    hashedPassword,
  });

  if (!user) {
    throw new BadRequestError("Email already exists");
  }

  const { hashedPassword: _, ...userResponse } = user;

  res.status(201).json(userResponse);
}

async function handlerUpdateUser(
  req: Request,
  res: Response,
): Promise<void> {
  let userId: string;

  try {
    const token = getBearerToken(req);
    userId = validateJWT(token, config.jwtSecret);
  } catch {
    throw new UnauthorizedError("Invalid or missing token");
  }

  const { email, password } = req.body;

  if (typeof email !== "string" || typeof password !== "string") {
    throw new BadRequestError("Email and password are required");
  }

  const hashedPassword = await hashPassword(password);

  const user = await updateUser(userId, email, hashedPassword);

  if (!user) {
    throw new UnauthorizedError("User not found");
  }

  const { hashedPassword: _, ...userResponse } = user;

  res.status(200).json(userResponse);
}

async function handlerLogin(
  req: Request,
  res: Response,
): Promise<void> {
  const { email, password } = req.body;

  const user = await getUserByEmail(email);

  if (!user) {
    throw new UnauthorizedError("incorrect email or password");
  }

  const passwordMatches = await checkPasswordHash(
    password,
    user.hashedPassword,
  );

  if (!passwordMatches) {
    throw new UnauthorizedError("incorrect email or password");
  }

  const token = makeJWT(user.id, 3600, config.jwtSecret);

  const refreshToken = makeRefreshToken();

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + 60 * 24 * 60 * 60 * 1000,
  );

  await createRefreshToken({
    token: refreshToken,
    userId: user.id,
    expiresAt,
  });

  const { hashedPassword: _, ...userResponse } = user;

  res.status(200).json({
    ...userResponse,
    token,
    refreshToken,
  });
}

async function handlerRefresh(
  req: Request,
  res: Response,
): Promise<void> {
  let refreshToken: string;

  try {
    refreshToken = getBearerToken(req);
  } catch {
    throw new UnauthorizedError("Invalid refresh token");
  }

  const user = await getUserFromRefreshToken(refreshToken);

  if (!user) {
    throw new UnauthorizedError("Invalid refresh token");
  }

  const token = makeJWT(user.id, 3600, config.jwtSecret);

  res.status(200).json({ token });
}

async function handlerRevoke(
  req: Request,
  res: Response,
): Promise<void> {
  let refreshToken: string;

  try {
    refreshToken = getBearerToken(req);
  } catch {
    throw new UnauthorizedError("Invalid refresh token");
  }

  await revokeRefreshToken(refreshToken);

  res.status(204).end();
}

async function handlerPolkaWebhook(
  req: Request,
  res: Response,
): Promise<void> {
    let apiKey: string;

  try {
    apiKey = getAPIKey(req);
  } catch {
    throw new UnauthorizedError("Invalid API key");
  }

  if (apiKey !== config.api.polkaKey) {
    throw new UnauthorizedError("Invalid API key");
  }
  const { event, data } = req.body;

  if (event !== "user.upgraded") {
    res.status(204).end();
    return;
  }

  const userId = data?.userId;

  if (typeof userId !== "string") {
    throw new BadRequestError("Invalid userId");
  }

  const user = await upgradeUserToChirpyRed(userId);

  if (!user) {
    throw new NotFoundError("User not found");
  }

  res.status(204).end();
}

app.post("/api/users", handlerCreateUser);

app.put("/api/users", handlerUpdateUser);

app.post("/admin/reset", handlerReset);

app.post("/api/chirps", handlerCreateChirp);

app.get("/api/chirps", handlerGetChirps);

app.get("/api/chirps/:chirpId", handlerGetChirp);

app.delete("/api/chirps/:chirpId", handlerDeleteChirp);

app.get("/api/healthz", handlerReadiness);

app.get("/admin/metrics", handlerMetrics);

app.post("/api/login", handlerLogin);
app.post("/api/refresh", handlerRefresh);
app.post("/api/revoke", handlerRevoke);
app.post("/api/polka/webhooks", handlerPolkaWebhook);
app.use(errorHandler);




function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof BadRequestError) {
    res.status(400).json({
      error: err.message,
    });
    return;
  }

  if (err instanceof UnauthorizedError) {
    res.status(401).json({
      error: err.message,
    });
    return;
  }

  if (err instanceof ForbiddenError) {
    res.status(403).json({
      error: err.message,
    });
    return;
  }

  if (err instanceof NotFoundError) {
    res.status(404).json({
      error: err.message,
    });
    return;
  }

  console.log(err);

  res.status(500).json({
    error: "Something went wrong on our end",
  });
}

app.listen(config.api.port, () => {
  console.log(
    `Server is running at http://localhost:${config.api.port}`,
  );
});