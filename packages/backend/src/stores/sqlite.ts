// ─────────────────────────────────────────────────────────────
// stores/sqlite.ts — "키워드 검색용 창고(SQLite) 관리"
//
// SQLite는 서버 안에 든 작은 파일 DB(별도 DB 서버 아님).
// FTS5 = SQLite의 "전문검색(full-text search)" 기능으로, 단어가 든 행을 빠르게 찾는다.
// 이 파일은 3가지를 한다:
//   1) getDb         : DB 파일을 열고 테이블을 준비한다(없으면 생성)
//   2) seedSqlite    : 과거 수주 20건을 넣는다 (서버 시작/seed 때, 중복은 무시)
//   3) searchFts     : 검색어에서 단어를 뽑아 그 단어가 든 수주를 찾는다 (검색할 때마다)
//      + extractKeywords : 검색어를 단어로 쪼개고 불용어를 거르는 보조 함수
// ─────────────────────────────────────────────────────────────

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

// ── 불용어: 검색에 의미 없는 조사·흔한 말. 키워드에서 빼버린다 ──
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

  // DDL
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
 * 키워드 추출 — 검색어 문장을 "검색에 쓸 단어들"로 정리한다.
 * 예) "긴급 납기가 필요한 부품이에요" → ["긴급","납기","필요한","부품이에요"]
 * 처리: ① 특수문자 제거 → ② 공백으로 단어 분리 → ③ 1글자·불용어 제거
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
 * 키워드 검색 본체 — 뽑은 단어가 든 수주를 FTS5로 찾고 점수순으로 돌려준다.
 * bm25 = 검색 관련도 점수(원래는 음수). 화면 표시를 위해 0~1로 바꾼다(최고점=1).
 */
export function searchFts(
  query: string,
  topK: number,
): { keywords: string[]; hits: Hit[] } {
  const keywords = extractKeywords(query);
  // 쓸만한 단어가 하나도 없으면 검색할 게 없으므로 빈 결과
  if (keywords.length === 0) return { keywords: [], hits: [] };

  const d = getDb();

  // FTS5 검색식 만들기: 단어 중 하나라도 들어있으면 매칭 (예: "긴급" OR "납기")
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
