// ─────────────────────────────────────────────────────────────
// solarClient.ts — "AI(Upstage Solar)에 말 거는 창구"
//
// 이 파일이 하는 일은 딱 2가지다:
//   1) embed()     : 문장 → 숫자 4096개로 변환 (= "임베딩". 의미를 좌표로 바꾼 것)
//   2) recommend() : 검색된 과거 수주를 근거로 AI가 대응방안 글을 작성
//
// Upstage Solar는 OpenAI와 사용법이 똑같아서, OpenAI 공식 SDK를 그대로 쓰되
// 접속 주소(baseURL)만 Upstage로 바꿔서 쓴다.
// ─────────────────────────────────────────────────────────────

import OpenAI from "openai";
import type { Hit } from "@scm/shared";

// 임베딩 종류: 저장할 문서는 "passage", 검색하는 질문은 "query" 모델을 쓴다
// (Solar는 둘을 다른 모델로 처리해야 검색 정확도가 높음)
export type EmbedKind = "passage" | "query";

// 다른 파일들이 이 SolarClient 를 받아서 embed/recommend 를 호출한다
export interface SolarClient {
  embed(text: string, kind: EmbedKind): Promise<number[]>;        // 문장 → 숫자 4096개
  recommend(query: string, hits: Hit[]): Promise<string>;          // 대응 방안 글 생성
}

// AI에게 주는 "역할 지시문" — 어떤 톤·관점으로 답할지 고정한다
const SYSTEM_PROMPT = `당신은 SCM 영업 담당자를 돕는 어시스턴트입니다.
새 수주 문의와 과거 유사 수주 이력을 바탕으로,
실무적인 대응 방안을 한국어로 간결하게 제안하세요.
근거가 된 과거 수주의 특이사항(납기/품질/운송 조건 등)을 반드시 반영하세요.`;

// 검색된 과거 수주들을 보기 좋은 글로 정리해서 AI에게 "이걸 근거로 답해줘" 하고 넘긴다
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

// API 키를 받아서 SolarClient 1개를 만들어 돌려준다(서버 시작 시 1번 호출)
export function createSolarClient(apiKey: string): SolarClient {
  // OpenAI SDK를 쓰되 접속 주소만 Upstage로 교체 (사용법은 OpenAI와 동일)
  const openai = new OpenAI({
    apiKey,
    baseURL: "https://api.upstage.ai/v1/solar",
    timeout: 30_000,       // 30초 안에 응답 없으면 포기
    maxRetries: 1,         // 실패 시 1번만 자동 재시도
  });

  return {
    // 문장 1개 → 의미를 담은 숫자 4096개(벡터)로 변환
    async embed(text: string, kind: EmbedKind): Promise<number[]> {
      // 저장용 문서와 검색용 질문은 서로 다른 모델을 쓴다
      const model = kind === "passage"
        ? "solar-embedding-1-large-passage"  // DB에 넣을 과거 수주용
        : "solar-embedding-1-large-query";   // 사용자가 친 검색어용

      const response = await openai.embeddings.create({
        model,
        input: text,
        encoding_format: "float",
      });

      return response.data[0].embedding; // 숫자 4096개 배열
    },

    // 검색된 과거 수주(hits)를 근거로 AI가 "대응 방안" 글을 써준다
    async recommend(query: string, hits: Hit[]): Promise<string> {
      const response = await openai.chat.completions.create({
        model: "solar-pro2",   // 글 생성용 LLM 모델
        temperature: 0.3,      // 낮을수록 일관되고 보수적인 답(0~1)
        messages: [
          { role: "system", content: SYSTEM_PROMPT },                 // 역할 지시
          { role: "user", content: buildUserPrompt(query, hits) },    // 실제 질문+근거
        ],
      });

      return response.choices[0]?.message?.content ?? ""; // AI가 쓴 글(없으면 빈 문자열)
    },
  };
}
