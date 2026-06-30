// ════════════════════════════════════════════════════════════════
// stores/sqlite.ts — 【키워드 검색 창고】 관리
//
// ┌─ SQLite란? ─────────────────────────────────────────────────────┐
// │  서버 안에 내장된 작은 파일 DB다. (별도 DB 서버 불필요)
// │  data/orders.db 라는 파일 하나가 곧 DB 전체다.
// └─────────────────────────────────────────────────────────────────┘
//
// ┌─ FTS5란? ───────────────────────────────────────────────────────┐
// │  SQLite에 내장된 "전문검색(Full-Text Search)" 기능이다.
// │ 
// │  동작 방식: 수주를 저장할 때 단어별로 색인(인덱스)을 만들어 둔다.
// │  검색할 때는 색인에서 단어를 바로 찾는다. (책 뒤 '찾아보기'와 같음)
// │
// │  한계: 색인에 단어가 있어야만 찾는다.
// │    → "냉동"을 색인에 넣었는데 "차갑게"로 검색하면 0건
// │    → 이것이 벡터 검색과 다른 결정적 차이
// └─────────────────────────────────────────────────────────────────┘
//
// ┌─ Pinecone(pinecone.ts)과의 차이 ───────────────────────────────┐
// │  SQLite : 단어가 DB 안에 있어야 찾는다 (글자 = 키워드 검색)
// │  Pinecone: 의미 좌표가 비슷하면 찾는다 (뜻 = 의미 검색)
// └───────────────────────────────────────────────────────────────┘
//
// ┌─ 이 파일이 하는 4가지 일 ──────────────────────────────────────────┐
// │  1) getDb           : DB 파일을 열고 테이블 3개를 준비한다
// │                       (없으면 자동 생성, 있으면 그냥 연결)
// │  2) seedSqlite      : 수주 20건을 DB에 저장한다
// │                       (서버 시작 시 자동 실행, 중복은 무시)
// │  3) extractKeywords : 검색어 문장에서 '유효한 단어'만 추려낸다
// │                       (조사·불용어 제거, searchFts에서 사용)
// │  4) searchFts       : 추린 단어들이 들어있는 수주를 찾는다
// │                       (검색할 때마다 실행, 점수는 0~1로 정규화)
// └─────────────────────────────────────────────────────────────────┘
// ════════════════════════════════════════════════════════════════

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ORDERS } from "@scm/shared";
import type { Hit } from "@scm/shared";

// ── DB 파일 경로: 프로젝트 루트 기준 data/orders.db ──────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "orders.db");

// ── 불용어 목록: 검색에 의미 없는 조사·접속사 등 ──
// 예: "긴급한 납기가 필요한" → "긴급한", "납기", "필요한" 추출
//     "가", "한", "필요한" 중 "가"와 "한"은 불용어라 제거
// 이 목록에 없더라도 1글자 단어는 모두 제거한다 (검색 의미 없음)
const STOP_WORDS = new Set([
  "은", "는", "이", "가", "을", "를", "의", "에", "에서",
  "로", "으로", "과", "와", "도", "만", "한", "다", "고",
  "하다", "있다", "되다", "이다", "그", "저", "것", "수",
  "등", "들", "및", "또는", "하는", "위해", "대한", "통해",
]);

// DB 연결을 한 번만 열고 재사용하기 위한 변수 (싱글턴)
let db: Database.Database | null = null;

// ════════════════════════════════════════════════════════════════
// [1] getDb — DB 연결 + 테이블 준비
// ════════════════════════════════════════════════════════════════
// DB 파일이 없으면 새로 만들고, 이미 있으면 연결만 한다.
// 테이블 3개를 준비한다:
//
//   ① orders         : 수주 원본 데이터 (id, 고객사, 품목, 수량, 납기, 특이사항)
//   ② orders_fts     : 키워드 색인 (FTS5 가상 테이블 — 글자로 빠르게 찾기 위한 색인)
//                      orders 와 1:1 매핑. 검색 전용이라 직접 수정 안 함.
//   ③ search_log     : 검색 이력 기록 (어떤 단어로 검색했고 결과가 뭔지 관측용)
//
// 한 번 열면 서버가 끄기 전까지 재사용한다 (매번 열면 느려지므로)
function getDb(): Database.Database {
  if (db) return db; // 이미 열려있으면 재사용

  // data 디렉토리가 없으면 먼저 만든다
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);

  // WAL 모드: 읽기와 쓰기를 동시에 처리할 수 있어 성능이 좋다
  db.pragma("journal_mode = WAL");

  // ① 수주 원본 테이블 (DB_설계서.md §4)
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

  // ② FTS5 키워드 색인 테이블
  // USING fts5         : "이 테이블은 전문검색 색인으로 써라"는 선언
  // id UNINDEXED       : id는 색인 안 하고 그냥 참조용으로만 씀
  // tokenize='unicode61': 한글·영문·숫자를 모두 올바르게 단어로 쪼갬
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS orders_fts USING fts5(
      id UNINDEXED,
      customer,
      item,
      note,
      tokenize = 'unicode61'
    );
  `);

  // ③ 검색 이력 테이블 (관측/평가용 — 실제 검색 기능에는 영향 없음)
  // 어떤 키워드로 검색했는지, 결과는 무엇이었는지 기록해 나중에 분석할 수 있다.
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

// ════════════════════════════════════════════════════════════════
// [2] seedSqlite — 수주 20건 DB에 저장
// ════════════════════════════════════════════════════════════════
// 서버가 시작될 때 자동으로 실행된다.
// INSERT OR IGNORE: 이미 저장된 수주는 무시하므로 몇 번 실행해도 중복되지 않는다.
// FTS 색인(orders_fts)에도 같은 데이터를 동시에 넣어 검색이 바로 되도록 한다.
//
// @returns 실제로 새로 삽입된 건수 (이미 다 있으면 0)
export function seedSqlite(): number {
  const d = getDb();

  // 수주 원본 저장 쿼리 (이미 있으면 건너뜀)
  const insertOrder = d.prepare(`
    INSERT OR IGNORE INTO orders (id, customer, item, quantity, deadline, note)
    VALUES (@id, @customer, @item, @quantity, @deadline, @note)
  `);

  // FTS 색인 저장 쿼리 (원본과 동기화)
  const insertFts = d.prepare(`
    INSERT OR IGNORE INTO orders_fts (id, customer, item, note)
    VALUES (@id, @customer, @item, @note)
  `);

  let inserted = 0;

  // 트랜잭션: 20건 전체를 한 덩어리로 처리. 중간에 실패하면 전체 취소.
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
        // 원본이 새로 들어갔을 때만 FTS 색인에도 추가 (동기화)
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

// ════════════════════════════════════════════════════════════════
// [3] extractKeywords — 검색어에서 유효한 단어만 추출
// ════════════════════════════════════════════════════════════════
// 검색어를 그대로 DB에 던지면 조사나 무의미한 단어까지 검색되어 노이즈가 많다.
// 그래서 먼저 "실제로 의미 있는 단어"만 골라낸다.
//
// 처리 순서:
//   ① 특수문자·구두점 제거  →  "긴급!납기?" → "긴급 납기"
//   ② 공백으로 단어 분리   →  ["긴급", "납기"]
//   ③ 1글자 단어 제거      →  ["a", "이"] 등 제거
//   ④ 불용어 제거          →  조사·흔한 말 제거
//
// 예: "긴급 납기가 필요한 부품이에요" → ["긴급", "납기가", "필요한", "부품이에요"]
//   (완전히 깔끔한 형태소 분석은 아니지만, PoC 수준에서는 충분히 동작한다)
export function extractKeywords(query: string): string[] {
  // 구두점·특수문자 제거 (한글·영문·숫자·공백만 남긴다)
  const cleaned = query.replace(/[^\p{L}\p{N}\s]/gu, " ");

  // 공백으로 쪼개고 → 1글자 이하 또는 불용어는 제거
  return cleaned
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

// ════════════════════════════════════════════════════════════════
// [4] searchFts — 키워드 포함 수주 검색 + 점수 정규화
// ════════════════════════════════════════════════════════════════
// 검색할 때마다 실행된다. 두 단계로 동작한다:
//   [A] 키워드 추출 → FTS5로 DB에서 해당 단어 포함 수주 검색
//   [B] 검색 점수(bm25) → 0~1 사이 점수로 변환 (화면 점수 바 표시용)
//
// bm25란?
//   단어가 얼마나 '관련성 있게' 들어있는지를 수치화한 점수다.
//   SQLite는 이 값을 음수로 반환한다 (작을수록 관련도 높음, 예: -5.2가 -1.3보다 높음)
//   → 화면에 보여주기 위해 "가장 관련 높은 것 = 1.0"으로 뒤집어서 변환한다.
//
// @returns { keywords: 추출된 단어 목록, hits: 검색 결과 (점수·근거 포함) }
export function searchFts(
  query: string,
  topK: number,
): { keywords: string[]; hits: Hit[] } {
  const keywords = extractKeywords(query);

  // 유효한 단어가 하나도 없으면 검색 자체를 하지 않는다
  // (모두 불용어거나 1글자였을 때)
  if (keywords.length === 0) return { keywords: [], hits: [] };

  const d = getDb();

  // 검색식 만들기: 단어 중 하나라도 들어있으면 매칭 (OR 검색)
  // 예: ["냉동", "냉장"] → '"냉동" OR "냉장"'
  // 큰따옴표로 감싸는 이유: FTS5에서 구문 검색(phrase search)으로 처리되어 더 정확하다.
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

  // rank ASC: bm25는 음수라서 오름차순이 '관련도 높은 순' 이다
  const rows = stmt.all({ matchExpr, topK }) as Array<{
    id: string;
    customer: string;
    item: string;
    quantity: number;
    deadline: string;
    note: string;
    rank: number; // bm25 원시 값 (음수, 작을수록 관련도 높음)
  }>;

  if (rows.length === 0) return { keywords, hits: [] };

  // ── bm25 점수 정규화: 음수 값 → 0~1 범위로 변환 ─────────────
  // 화면에서 "점수 0.87" 처럼 사람이 읽기 쉬운 형태로 표시하기 위함
  //
  // 변환 방법:
  //   bestRank  = 가장 관련도 높은 수주의 bm25 값 (가장 큰 음수, 예: -5.2)
  //   worstRank = 가장 관련도 낮은 수주의 bm25 값 (0에 가까운 음수, 예: -0.8)
  //   score = (worstRank - 해당rank) / (worstRank - bestRank)
  //   → bestRank인 수주는 score = 1.0, worstRank인 수주는 score ≈ 0
  //   → 단건이면 score = 1.0 (비교 대상이 없으므로)
  const ranks = rows.map((r) => r.rank);
  const bestRank = Math.min(...ranks);   // 가장 관련도 높은 값 (가장 큰 음수)
  const worstRank = Math.max(...ranks);  // 가장 관련도 낮은 값

  const hits: Hit[] = rows.map((r) => {
    let score: number;
    if (bestRank === worstRank) {
      score = 1.0; // 결과가 1건뿐이면 만점
    } else {
      score = (worstRank - r.rank) / (worstRank - bestRank);
    }

    // ── 이 수주가 '어떤 단어 때문에' 찾혔는지 확인 ──────────────
    // 전체 키워드 중 실제로 이 수주 텍스트에 들어있는 것만 evidence로 남긴다.
    // 예: 키워드 ["냉동", "냉장", "정온"] 중 "냉동", "냉장"만 이 수주에 있으면
    //     evidence = ["냉동", "냉장"] → 화면 배지로 "키워드: 냉동", "키워드: 냉장" 표시
    const text = `${r.customer} ${r.item} ${r.note}`.toLowerCase();
    const matched = keywords.filter((kw) => text.includes(kw.toLowerCase()));

    return {
      id: r.id,
      customer: r.customer,
      item: r.item,
      quantity: r.quantity,
      deadline: r.deadline,
      note: r.note,
      score: Math.round(score * 1000) / 1000, // 소수점 3자리까지만 (예: 0.873)
      evidence: matched,
    };
  });

  return { keywords, hits };
}
