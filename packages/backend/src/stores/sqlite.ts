// SqliteStore — SQLite + FTS5(bm25) 적재/검색
// 담당: db-agent | 근거: docs/DB_설계서.md

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ORDERS } from "@scm/shared";
import type { Hit } from "@scm/shared";

// ── DB 파일 경로: 프로젝트 루트 기준 data/orders.db ──
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "orders.db");

// ── 불용어 목록 (DB_설계서.md §5.3) ──
const STOP_WORDS = new Set([
  "은", "는", "이", "가", "을", "를", "의", "에", "에서",
  "로", "으로", "과", "와", "도", "만", "한", "다", "고",
  "하다", "있다", "되다", "이다", "그", "저", "것", "수",
  "등", "들", "및", "또는", "하는", "위해", "대한", "통해",
]);

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  // data 디렉토리 없으면 생성
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);

  // WAL 모드
  db.pragma("journal_mode = WAL");

  // DDL — docs/DB_설계서.md §4
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id         TEXT PRIMARY KEY,
      customer   TEXT NOT NULL,
      item       TEXT NOT NULL,
      quantity   INTEGER NOT NULL CHECK (quantity >= 0),
      deadline   TEXT NOT NULL,
      note       TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // FTS5 가상 테이블 — unicode61 토크나이저
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS orders_fts USING fts5(
      id UNINDEXED,
      customer,
      item,
      note,
      tokenize = 'unicode61'
    );
  `);

  // search_log (선택 — 관측/평가용)
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_log (
      log_id     INTEGER PRIMARY KEY AUTOINCREMENT,
      query      TEXT NOT NULL,
      keywords   TEXT,
      hit_ids    TEXT,
      engine     TEXT,
      took_ms    INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

/**
 * ORDERS 20건을 SQLite에 시드한다.
 * INSERT OR IGNORE 로 멱등성 보장. FTS 인덱스도 동기화.
 * @returns 삽입된 건수
 */
export function seedSqlite(): number {
  const d = getDb();

  const insertOrder = d.prepare(`
    INSERT OR IGNORE INTO orders (id, customer, item, quantity, deadline, note)
    VALUES (@id, @customer, @item, @quantity, @deadline, @note)
  `);

  const insertFts = d.prepare(`
    INSERT OR IGNORE INTO orders_fts (id, customer, item, note)
    VALUES (@id, @customer, @item, @note)
  `);

  let inserted = 0;

  const txn = d.transaction(() => {
    for (const o of ORDERS) {
      const r = insertOrder.run({
        id: o.id,
        customer: o.customer,
        item: o.item,
        quantity: o.quantity,
        deadline: o.deadline,
        note: o.note,
      });
      if (r.changes > 0) {
        insertFts.run({
          id: o.id,
          customer: o.customer,
          item: o.item,
          note: o.note,
        });
        inserted++;
      }
    }
  });

  txn();
  return inserted;
}

/**
 * 키워드 추출 — docs/DB_설계서.md §5.3
 * ① 구두점 제거 → ② 공백 분리 → ③ 불용어 및 1글자 필터링 → ④ 키워드 배열
 */
export function extractKeywords(query: string): string[] {
  // 구두점 제거 (유니코드 구두점 + 일반 특수문자)
  const cleaned = query.replace(/[^\p{L}\p{N}\s]/gu, " ");

  // 공백 분리 → 불용어/1글자 필터링
  return cleaned
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

/**
 * FTS5 bm25 검색 — docs/DB_설계서.md §5.2
 * bm25 점수를 0~1로 정규화 (최고점=1).
 */
export function searchFts(
  query: string,
  topK: number,
): { keywords: string[]; hits: Hit[] } {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return { keywords: [], hits: [] };

  const d = getDb();

  // MATCH 식: "kw1" OR "kw2" OR ...
  const matchExpr = keywords.map((kw) => `"${kw}"`).join(" OR ");

  const stmt = d.prepare(`
    SELECT f.id, o.customer, o.item, o.quantity, o.deadline, o.note,
           bm25(orders_fts) AS rank
    FROM orders_fts f
    JOIN orders o ON o.id = f.id
    WHERE orders_fts MATCH @matchExpr
    ORDER BY rank ASC
    LIMIT @topK
  `);

  const rows = stmt.all({ matchExpr, topK }) as Array<{
    id: string;
    customer: string;
    item: string;
    quantity: number;
    deadline: string;
    note: string;
    rank: number;
  }>;

  if (rows.length === 0) return { keywords, hits: [] };

  // bm25 점수 정규화: bm25 값은 음수(작을수록 관련도 높음)
  // 최고점(가장 작은 값)을 1로, 최저점을 0에 가깝게 변환
  const ranks = rows.map((r) => r.rank);
  const bestRank = Math.min(...ranks);  // 가장 관련도 높은 값 (가장 큰 음수)
  const worstRank = Math.max(...ranks); // 가장 관련도 낮은 값

  const hits: Hit[] = rows.map((r) => {
    // 정규화: best → 1.0, worst → ~0 (단건이면 1.0)
    let score: number;
    if (bestRank === worstRank) {
      score = 1.0;
    } else {
      score = (worstRank - r.rank) / (worstRank - bestRank);
    }

    // evidence: 이 행에서 실제 매칭된 키워드를 찾는다
    const text = `${r.customer} ${r.item} ${r.note}`.toLowerCase();
    const matched = keywords.filter((kw) => text.includes(kw.toLowerCase()));

    return {
      id: r.id,
      customer: r.customer,
      item: r.item,
      quantity: r.quantity,
      deadline: r.deadline,
      note: r.note,
      score: Math.round(score * 1000) / 1000,
      evidence: matched,
    };
  });

  return { keywords, hits };
}
