// ════════════════════════════════════════════════════════════════
// stores/pinecone.ts — 【의미 검색 창고】 관리
//
// ┌─ Pinecone이란? ─────────────────────────────────────────────────┐
// │  일반 DB는 글자를 저장하지만, Pinecone은 '의미 좌표'를 저장한다.
// │
// │  예를 들어 "긴급 납기" 라는 수주를 저장할 때,
// │  그 문장을 AI가 [0.12, -0.87, 0.43, ... ] 처럼
// │  4096개의 숫자(= 벡터)로 변환해서 Pinecone에 넣는다.
// │
// │  나중에 "빨리 보내야 해요"를 검색하면,
// │  이것도 4096개 숫자로 변환해서 '방향이 가장 가까운' 수주를 찾는다.
// │  → 단어가 달라도 의미가 비슷하면 찾아지는 원리.
// └────────────────────────────────────────────────────────────────┘
//
// ┌─ SQLite(sqlite.ts)와의 차이 ────────────────────────────────────┐
// │  SQLite : 글자가 저장됨 → 단어가 있어야 검색됨 (키워드 검색)
// │  Pinecone: 숫자 좌표가 저장됨 → 방향이 가까우면 검색됨 (의미)
// └────────────────────────────────────────────────────────────────┘
//
// ┌─ 이 파일이 하는 3가지 일 ──────────────────────────────────────────┐
// │  1) ensureIndex  : 창고(인덱스)가 없으면 클라우드에 새로 만든다
// │  2) seedPinecone : 수주 20건을 의미 좌표로 변환해 창고에 올린다
// │                    (최초 1회 또는 seed 명령 실행 시)
// │  3) searchVector : 질의 좌표와 가장 가까운 수주 TOP-K를 찾는다
// │                    (검색할 때마다 실행)
// └─────────────────────────────────────────────────────────────────┘
// ════════════════════════════════════════════════════════════════

import { Pinecone } from "@pinecone-database/pinecone";
import { ORDERS, orderToText } from "@scm/shared";
import type { Hit } from "@scm/shared";
import type { SolarClient } from "../solarClient.js";

// ── 창고 설정값 ──
const INDEX_NAME = process.env.PINECONE_INDEX ?? "scm-orders"; // 창고(인덱스) 이름
const DIMENSION = 4096;        // 벡터 1개를 구성하는 숫자 개수 (Solar AI가 4096개를 만든다)
const METRIC = "cosine";       // 유사도 계산 방식 — 두 좌표의 '방향' 차이로 유사도를 잰다
                               // (방향이 같으면 1.0, 완전히 반대면 0.0)
const CLOUD = "aws";           // 창고를 올려둔 클라우드 제공사
const REGION = "us-east-1";   // 창고가 위치한 지역

// ── 내부 헬퍼: Pinecone 접속 클라이언트 반환 ──────────────────────
// API 키로 Pinecone 클라우드에 접속하는 '열쇠'를 만든다.
// API 키가 없으면 시작부터 에러를 발생시켜 이후 단계를 막는다.
function getPinecone(): Pinecone {
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) throw new Error("PINECONE_API_KEY 가 필요합니다(.env).");
  return new Pinecone({ apiKey });
}

// ════════════════════════════════════════════════════════════════
// [1] ensureIndex — 창고(인덱스) 준비
// ════════════════════════════════════════════════════════════════
// Pinecone 클라우드에 수주 좌표를 보관할 창고가 있는지 확인하고,
// 없으면 새로 만든다. 이미 있으면 아무것도 하지 않는다(멱등).
//
// 창고 설정:
//   - 4096차원: 수주 1건 = 숫자 4096개짜리 좌표 1점
//   - cosine 거리: 두 좌표가 '같은 방향'일수록 유사하다고 판단
//   - serverless: 서버 관리 없이 AWS 클라우드가 알아서 운영
async function ensureIndex(pc: Pinecone): Promise<void> {
  const list = await pc.listIndexes();
  const exists = list.indexes?.some((idx) => idx.name === INDEX_NAME);
  if (exists) return;

  await pc.createIndex({
    name: INDEX_NAME,
    dimension: DIMENSION,
    metric: METRIC,
    spec: {
      serverless: {
        cloud: CLOUD,
        region: REGION,
      },
    },
    waitUntilReady: true, // 창고가 실제로 사용 가능해질 때까지 기다린다
  });
}

// ════════════════════════════════════════════════════════════════
// [2] seedPinecone — 수주 20건을 창고에 저장
// ════════════════════════════════════════════════════════════════
// 이 함수는 처음 셋업할 때(npm run seed) 1번 실행한다.
// Pinecone은 클라우드 DB라 한번 올리면 서버가 꺼져도 유지된다.
//
// 처리 흐름:
//   수주 1건  →  자연어 문장으로 변환  →  AI가 숫자 4096개로 변환  →  창고에 저장
//   (repeat × 20건)
//
// 저장 형태: { id: "SO-001", values: [0.12, -0.87, ...4096개], metadata: {고객사, 품목...} }
// metadata는 검색 결과를 화면에 보여줄 때 필요한 수주 원본 정보다.
export async function seedPinecone(solar: SolarClient): Promise<number> {
  const pc = getPinecone();
  await ensureIndex(pc); // 창고가 없으면 먼저 만든다

  const index = pc.index(INDEX_NAME);

  // 수주 20건의 좌표 레코드를 모을 배열
  const records: Array<{
    id: string;
    values: number[];
    metadata: Record<string, string | number>;
  }> = [];

  // 수주 20건을 하나씩 처리: 문장으로 만들고 → AI가 숫자 좌표로 변환
  for (const order of ORDERS) {
    const text = orderToText(order);                    // 수주 데이터 → 자연어 문장 (예: "고객사 A, 품목 볼트...")
    const values = await solar.embed(text, "passage");  // 문장 → 숫자 4096개 (저장용은 "passage" 모델)

    records.push({
      id: order.id,
      values,
      metadata: {
        // 검색 결과 화면에 표시할 수주 원본 정보
        customer: order.customer,
        item: order.item,
        quantity: order.quantity,
        deadline: order.deadline,
        note: order.note,
        text, // 원본 문장도 함께 저장 (디버깅/확인용)
      },
    });
  }

  // 모은 20건을 한 번에 Pinecone에 저장한다 (배치 업로드)
  // Pinecone 권장 배치 크기가 100 이하라서 20건은 한 번에 처리 가능
  await index.upsert(records);

  return records.length; // 저장 완료 건수 반환
}

// ════════════════════════════════════════════════════════════════
// [3] searchVector — 의미 좌표로 유사 수주 TOP-K 검색
// ════════════════════════════════════════════════════════════════
// 검색할 때마다 실행된다.
//
// 처리 흐름:
//   질의문의 좌표(qVector)  →  Pinecone에서 방향이 가장 가까운 수주 topK건 반환
//   (좌표끼리 cosine 거리를 계산 → 거리가 짧을수록 score 높음 → 상위 K건 반환)
//
// 반환 결과: Hit[] — 각 수주의 원본 정보 + score(유사도 0~1) 포함
// evidence(근거 배지)는 여기서 비워두고, vectorEngine에서 채운다.
export async function searchVector(
  qVector: number[], // 질의문을 AI가 변환한 4096차원 좌표
  topK: number,      // 몇 건까지 가져올지
): Promise<Hit[]> {
  const pc = getPinecone();
  const index = pc.index(INDEX_NAME);

  // 질의 좌표와 가장 가까운(방향이 비슷한) 수주 topK건을 요청
  const result = await index.query({
    vector: qVector,
    topK,
    includeMetadata: true, // 고객사·품목 등 원본 정보도 함께 받는다
  });

  if (!result.matches) return [];

  // Pinecone 응답 형식 → 화면이 사용하는 Hit 형식으로 변환
  // score = cosine 유사도 (0~1, 높을수록 더 유사한 수주)
  return result.matches.map((m) => {
    const meta = m.metadata as Record<string, string | number> | undefined;
    return {
      id: m.id,
      customer: (meta?.customer as string) ?? "",
      item: (meta?.item as string) ?? "",
      quantity: (meta?.quantity as number) ?? 0,
      deadline: (meta?.deadline as string) ?? "",
      note: (meta?.note as string) ?? "",
      score: m.score ?? 0,
      evidence: [], // 근거 태그는 vectorEngine.ts에서 의미 태그로 채운다
    };
  });
}
