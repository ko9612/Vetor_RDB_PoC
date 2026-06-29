// Express API 엔트리 — 담당: backend-agent | 근거: docs/API_명세서.md
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
import express from "express";
import { SCENARIOS } from "@scm/shared";
import type { SearchRequest, Engine } from "@scm/shared";
import { createSolarClient } from "./solarClient.js";
import { search } from "./orchestrator.js";
import { seedSqlite } from "./stores/sqlite.js";
import { seedPinecone } from "./stores/pinecone.js";
import { runVector } from "./engines/vectorEngine.js";
import { runRdb } from "./engines/rdbEngine.js";

const app = express();
app.use(express.json());

// 요청 로깅 — 어떤 API가 들어왔고 어떤 상태코드로 응답했는지 (메서드 경로 → 상태 소요시간)
// /api/health 는 연결 배지용 주기 폴링이라 로그에서 제외(노이즈 방지)
app.use((req, res, next) => {
  if (req.path === "/api/health") return next();
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

const PORT = Number(process.env.PORT ?? 8080);

// SolarClient 인스턴스 (API 키 없으면 null — 빌드/타입체크는 통과)
const solar = process.env.UPSTAGE_API_KEY
  ? createSolarClient(process.env.UPSTAGE_API_KEY)
  : null;

// ---------- GET /api/health ----------
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    upstage: Boolean(process.env.UPSTAGE_API_KEY),
    pinecone: Boolean(process.env.PINECONE_API_KEY),
    sqlite: true,
  });
});

// ---------- GET /api/scenarios ----------
app.get("/api/scenarios", (_req, res) => {
  res.json({ scenarios: SCENARIOS });
});

// ---------- POST /api/search — vector/rdb 동시 검색 ----------
app.post("/api/search", async (req, res) => {
  try {
    if (!solar) {
      res.status(500).json({ error: { code: "INTERNAL", message: "UPSTAGE_API_KEY 미설정" } });
      return;
    }

    const body = req.body as Partial<SearchRequest>;
    const query = body.query?.trim() ?? "";
    if (!query) {
      res.status(400).json({ error: { code: "INVALID_QUERY", message: "query 누락 또는 빈 문자열" } });
      return;
    }

    const topK = body.topK ?? 3;
    const engines: Engine[] = body.engines ?? ["vector", "rdb"];

    const result = await search(query, topK, engines, solar);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: { code: "INTERNAL", message: err instanceof Error ? err.message : String(err) } });
  }
});

// ---------- POST /api/search/vector — 벡터 단독 검색 ----------
app.post("/api/search/vector", async (req, res) => {
  try {
    if (!solar) {
      res.status(500).json({ error: { code: "INTERNAL", message: "UPSTAGE_API_KEY 미설정" } });
      return;
    }

    const body = req.body as Partial<SearchRequest>;
    const query = body.query?.trim() ?? "";
    if (!query) {
      res.status(400).json({ error: { code: "INVALID_QUERY", message: "query 누락 또는 빈 문자열" } });
      return;
    }

    const topK = body.topK ?? 3;
    const result = await runVector(query, topK, solar);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: { code: "INTERNAL", message: err instanceof Error ? err.message : String(err) } });
  }
});

// ---------- POST /api/search/rdb — RDB 단독 검색 ----------
app.post("/api/search/rdb", async (req, res) => {
  try {
    if (!solar) {
      res.status(500).json({ error: { code: "INTERNAL", message: "UPSTAGE_API_KEY 미설정" } });
      return;
    }

    const body = req.body as Partial<SearchRequest>;
    const query = body.query?.trim() ?? "";
    if (!query) {
      res.status(400).json({ error: { code: "INVALID_QUERY", message: "query 누락 또는 빈 문자열" } });
      return;
    }

    const topK = body.topK ?? 3;
    const result = await runRdb(query, topK, solar);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: { code: "INTERNAL", message: err instanceof Error ? err.message : String(err) } });
  }
});

// ---------- POST /api/seed — 샘플 20건 적재 ----------
app.post("/api/seed", async (req, res) => {
  try {
    if (!solar) {
      res.status(500).json({ error: { code: "INTERNAL", message: "UPSTAGE_API_KEY 미설정" } });
      return;
    }

    const rdbInserted = seedSqlite();
    const vectorUpserted = await seedPinecone(solar);
    res.json({ vectorUpserted, rdbInserted });
  } catch (err) {
    res.status(500).json({ error: { code: "INTERNAL", message: err instanceof Error ? err.message : String(err) } });
  }
});

app.listen(PORT, () => console.log(`backend listening on :${PORT}`));
