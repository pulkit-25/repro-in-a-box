import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { parse } from "csv-parse";
import { Readable } from "node:stream";
import multer from "multer";
import { buildSyntheticRows, store, type DataRow } from "./store.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "buggyboard-dev-secret";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

export const app = express();
app.use(cors());
app.use(express.json());

type AuthedRequest = express.Request & { userId: string };

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as { userId: string };
    (req as AuthedRequest).userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  const user = store.getUserByEmail(email ?? "");
  if (!user || !bcrypt.compareSync(password ?? "", user.passwordHash)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "24h" });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

app.get("/api/auth/me", auth, (req, res) => {
  const user = store.getUserById((req as AuthedRequest).userId);
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({ id: user.id, email: user.email, name: user.name });
});

app.get("/api/dashboard/stats", auth, (req, res) => {
  res.json(store.stats((req as AuthedRequest).userId));
});

app.get("/api/projects", auth, (req, res) => {
  res.json(
    store.listProjects((req as AuthedRequest).userId).map((p) => ({
      id: p.id,
      name: p.name,
      rowCount: p.rowCount,
      createdAt: p.createdAt,
    }))
  );
});

app.post("/api/projects", auth, (req, res) => {
  const { name } = req.body as { name?: string };
  const project = store.createProject((req as AuthedRequest).userId, name || "Untitled");
  res.status(201).json({ id: project.id, name: project.name, rowCount: 0 });
});

app.post("/api/projects/:id/seed-large", auth, (req, res) => {
  const projectId = String(req.params.id);
  const project = store.getProject(projectId);
  if (!project || project.userId !== (req as AuthedRequest).userId) {
    return res.status(404).json({ error: "Project not found" });
  }
  store.replaceRows(project.id, buildSyntheticRows(project.id), 213000);
  res.json({ rowCount: project.rowCount });
});

app.post("/api/projects/:id/upload", auth, upload.single("file"), async (req, res) => {
  const projectId = String(req.params.id);
  const project = store.getProject(projectId);
  if (!project || project.userId !== (req as AuthedRequest).userId) {
    return res.status(404).json({ error: "Project not found" });
  }
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file" });

  const records: Record<string, string>[] = [];
  const parser = Readable.from(file.buffer).pipe(parse({ columns: true, skip_empty_lines: true }));
  for await (const record of parser) {
    records.push(record as Record<string, string>);
    if (records.length > 2500) break;
  }

  const stored: DataRow[] = records.slice(0, 400).map((row) => ({
    projectId: project.id,
    date: row.date ?? row.Date ?? "",
    country: row.country ?? row.Country ?? "",
    revenue: parseFloat(row.revenue ?? row.Revenue ?? "0"),
    users: parseInt(row.users ?? row.Users ?? "0", 10),
    orders: parseInt(row.orders ?? row.Orders ?? "0", 10),
  }));

  const rowCount = records.length >= 2500 ? 213000 : records.length;
  store.replaceRows(project.id, stored, rowCount);
  res.json({ rowCount });
});

app.get("/api/analytics", auth, (req, res) => {
  const dateRange = (req.query.dateRange as string) ?? "7d";
  const country = (req.query.country as string) ?? "";
  const result = store.analytics((req as AuthedRequest).userId, dateRange, country);
  const delay = result.isLargeDataset ? 600 : 0;
  setTimeout(() => res.json(result), delay);
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "BuggyBoard" });
});

export default app;
