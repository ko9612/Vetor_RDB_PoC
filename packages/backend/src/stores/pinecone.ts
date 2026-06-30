// ─────────────────────────────────────────────────────────────
// stores/pinecone.ts — "의미 검색용 창고(벡터 DB) 관리"
//
// Pinecone은 "숫자 벡터"를 저장하고, 그와 가장 비슷한 벡터를 찾아주는 클라우드 DB다.
// 이 파일은 3가지를 한다:
//   1) ensureIndex   : 창고(인덱스)가 없으면 새로 만든다
//   2) seedPinecone  : 과거 수주 20건을 임베딩해서 창고에 올린다 (seed 때 1회)
//   3) searchVector  : 검색어 벡터와 가장 비슷한 수주 TOP-K를 찾는다 (검색할 때마다)
// ─────────────────────────────────────────────────────────────

import { Pinecone } from "@pinecone-database/pinecone";
import { ORDERS, orderToText } from "@scm/shared";
import type { Hit } from "@scm/shared";
import type { SolarClient } from "../solarClient.js";

// ── 창고 설정값 ──
const INDEX_NAME = process.env.PINECONE_INDEX ?? "scm-orders"; // 창고(인덱스) 이름
const DIMENSION = 4096;        // 벡터 1개의 숫자 개수 (Solar 임베딩이 4096개를 만듦)
const METRIC = "cosine";       // 유사도 계산 방식(코사인) — 방향이 비슷할수록 높은 점수
const CLOUD = "aws";           // 클라우드 제공사
const REGION = "us-east-1";    // 지역

/** 내부 헬퍼: Pinecone 클라이언트 싱글턴 */
function getPinecone(): Pinecone {
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) throw new Error("PINECONE_API_KEY 가 필요합니다(.env).");
  return new Pinecone({ apiKey });
}

/**
 * 인덱스가 없으면 serverless 인덱스를 생성한다.
 * 이미 존재하면 무시(멱등).
 */
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
    waitUntilReady: true,
  });
}

/**
 * ORDERS 20건을 Pinecone에 업서트한다.
 * orderToText 로 직렬화 → solar.embed(text, "passage") 로 임베딩 → 배치 업서트.
 * @returns 업서트 건수
 */
export async function seedPinecone(solar: SolarClient): Promise<number> {
  const pc = getPinecone();
  await ensureIndex(pc);

  const index = pc.index(INDEX_NAME);

  // 임베딩 생성 + 레코드 구성
  const records: Array<{
    id: string;
    values: number[];
    metadata: Record<string, string | number>;
  }> = [];

  // 수주 20건을 하나씩: 문장으로 만들고 → 숫자 벡터로 변환해 모은다
  for (const order of ORDERS) {
    const text = orderToText(order);                    // 수주 → 자연어 문장
    const values = await solar.embed(text, "passage");  // 문장 → 숫자 4096개

    records.push({
      id: order.id,
      values,
      metadata: {
        customer: order.customer,
        item: order.item,
        quantity: order.quantity,
        deadline: order.deadline,
        note: order.note,
        text,
      },
    });
  }

  // 배치 upsert (Pinecone 권장 배치 크기 100 이하, 20건이므로 한 번에)
  await index.upsert(records);

  return records.length;
}

/**
 * cosine TOP-K 쿼리.
 * @param qVector 질의 임베딩 벡터 (4096-d)
 * @param topK 반환 건수
 * @returns Hit[] (score=cosine 유사도, evidence=[])
 */
export async function searchVector(
  qVector: number[],
  topK: number,
): Promise<Hit[]> {
  const pc = getPinecone();
  const index = pc.index(INDEX_NAME);

  // 검색어 벡터(qVector)와 가장 비슷한 수주 topK개를 요청
  const result = await index.query({
    vector: qVector,
    topK,
    includeMetadata: true, // 고객사/품목 등 부가정보도 함께 받기
  });

  if (!result.matches) return [];

  // Pinecone 응답을 화면이 쓰는 Hit 모양으로 변환 (score = 유사도)
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
      evidence: [], // 벡터 엔진에서 의미 태그는 별도 생성
    };
  });
}
