// PineconeStore — Pinecone 인덱스 생성/업서트/검색
// 담당: db-agent | 근거: docs/Pinecone_인덱스설계서.md

import { Pinecone } from "@pinecone-database/pinecone";
import { ORDERS, orderToText } from "@scm/shared";
import type { Hit } from "@scm/shared";
import type { SolarClient } from "../solarClient.js";

// ── 상수 (Pinecone_인덱스설계서.md §2) ──
const INDEX_NAME = process.env.PINECONE_INDEX ?? "scm-orders";
const DIMENSION = 4096;
const METRIC = "cosine";
const CLOUD = "aws";
const REGION = "us-east-1";

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

  for (const order of ORDERS) {
    const text = orderToText(order);
    const values = await solar.embed(text, "passage");

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

  const result = await index.query({
    vector: qVector,
    topK,
    includeMetadata: true,
  });

  if (!result.matches) return [];

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
