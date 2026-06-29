// SolarClient — Upstage Solar(OpenAI 호환) LLM/임베딩 호출
// 담당: backend-agent | 근거: docs/RAG_파이프라인_설계서.md, docs/API_명세서.md(§9)

import OpenAI from "openai";
import type { Hit } from "@scm/shared";

export type EmbedKind = "passage" | "query";

export interface SolarClient {
  embed(text: string, kind: EmbedKind): Promise<number[]>;        // 4096-d
  recommend(query: string, hits: Hit[]): Promise<string>;          // 대응 방안 생성
}

const SYSTEM_PROMPT = `당신은 SCM 영업 담당자를 돕는 어시스턴트입니다.
새 수주 문의와 과거 유사 수주 이력을 바탕으로,
실무적인 대응 방안을 한국어로 간결하게 제안하세요.
근거가 된 과거 수주의 특이사항(납기/품질/운송 조건 등)을 반드시 반영하세요.`;

function buildUserPrompt(query: string, hits: Hit[]): string {
  const hitsText = hits
    .map(
      (h, i) =>
        `${i + 1}) [유사도 ${h.score.toFixed(2)}] 고객사 ${h.customer}, 품목 ${h.item}, 수량 ${h.quantity}, 납기 ${h.deadline}. 특이사항: ${h.note}`
    )
    .join("\n");

  return `[새 수주 문의]
${query}

[검색된 과거 유사 수주 이력]
${hitsText}

위 이력을 근거로 대응 시 주의사항과 권장 액션을 3~4가지로 제시해 주세요.`;
}

export function createSolarClient(apiKey: string): SolarClient {
  const openai = new OpenAI({
    apiKey,
    baseURL: "https://api.upstage.ai/v1/solar",
    timeout: 30_000,       // 30초 타임아웃
    maxRetries: 1,         // 1회 자동 재시도(지수 백오프)
  });

  return {
    async embed(text: string, kind: EmbedKind): Promise<number[]> {
      const model = kind === "passage"
        ? "solar-embedding-1-large-passage"
        : "solar-embedding-1-large-query";

      const response = await openai.embeddings.create({
        model,
        input: text,
        encoding_format: "float",
      });

      return response.data[0].embedding;
    },

    async recommend(query: string, hits: Hit[]): Promise<string> {
      const response = await openai.chat.completions.create({
        model: "solar-pro2",
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(query, hits) },
        ],
      });

      return response.choices[0]?.message?.content ?? "";
    },
  };
}
