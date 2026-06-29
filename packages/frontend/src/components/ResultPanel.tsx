// ResultPanel — 벡터/RDB 결과 패널 (5개 상태 독립 렌더)
// 근거: docs/화면_설계서.md §3~4, docs/프론트엔드_기능정의서.md §3

import type { Hit, Engine } from "@scm/shared";
import type { PanelState } from "../store.js";

interface Props {
  kind: Engine;
  state: PanelState;
  onRetry?: () => void;
}

/* ── 메인 컴포넌트 ── */
export function ResultPanel({ kind, state, onRetry }: Props) {
  const isVector = kind === "vector";

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      {/* 패널 헤더 */}
      <div
        className={`flex items-center gap-2 px-5 py-3.5 text-[0.9375rem] font-bold text-white ${
          isVector ? "bg-teal-600" : "bg-amber-600"
        }`}
      >
        <span>
          {isVector ? "🔍 의미 검색 (벡터 DB)" : "📝 키워드 검색 (RDB)"}
        </span>
        <span className="text-[0.8125rem] font-normal opacity-[0.85]">
          {isVector ? "Pinecone · Solar Embedding" : "SQLite FTS5 · bm25"}
        </span>
      </div>

      {/* RDB 키워드 배지 */}
      {!isVector && state.status === "success" && state.keywords && state.keywords.length > 0 && (
        <KeywordBadges keywords={state.keywords} />
      )}
      {!isVector && state.status === "empty" && state.keywords && state.keywords.length > 0 && (
        <KeywordBadges keywords={state.keywords} />
      )}

      {/* 상태별 본문 */}
      <div className="flex-1 p-5">
        {state.status === "idle" && <IdleView />}
        {state.status === "loading" && <LoadingView />}
        {state.status === "success" && (
          <SuccessView hits={state.hits} advice={state.advice} kind={kind} />
        )}
        {state.status === "empty" && <EmptyView reason={state.reason} />}
        {state.status === "error" && (
          <ErrorView message={state.message} onRetry={onRetry} />
        )}
      </div>
    </div>
  );
}

/* ── 키워드 배지 바 ── */
function KeywordBadges({ keywords }: { keywords: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 bg-amber-100 px-5 py-2 text-[0.8125rem] text-amber-800">
      <span>추출 키워드:</span>
      {keywords.map((kw, i) => (
        <span
          key={i}
          className="inline-block rounded border border-amber-600 bg-white px-2 py-0.5 text-xs text-amber-600"
        >
          {kw}
        </span>
      ))}
    </div>
  );
}

/* ── IDLE ── */
function IdleView() {
  return (
    <div className="px-5 py-15 text-center text-slate-400">
      <div className="mb-3 text-[2.5rem]" aria-hidden="true">&#x1F50E;</div>
      <div className="text-[0.9375rem]">수주 내용을 입력하고 검색하세요</div>
    </div>
  );
}

/* ── LOADING (스켈레톤) ── */
function LoadingView() {
  return (
    <div className="p-5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="mb-3 rounded-lg border border-slate-200 p-4">
          <div className="mb-2.5 h-3 w-3/5 animate-pulse rounded bg-slate-200" />
          <div className="mb-2.5 h-3 w-4/5 animate-pulse rounded bg-slate-200" />
          <div className="mb-2.5 h-3 w-full animate-pulse rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

/* ── SUCCESS ── */
function SuccessView({
  hits,
  advice,
  kind,
}: {
  hits: Hit[];
  advice: string;
  kind: Engine;
}) {
  const isVector = kind === "vector";

  return (
    <>
      {hits.map((hit, idx) => (
        <ResultCard key={hit.id} hit={hit} rank={idx + 1} kind={kind} />
      ))}

      {/* AI 대응 방안 */}
      {advice && (
        <div
          className={`mt-5 whitespace-pre-wrap rounded-lg p-4 text-sm leading-[1.7] ${
            isVector ? "border border-teal-200 bg-teal-50" : "border border-amber-200 bg-amber-50"
          }`}
        >
          <div className="mb-2 flex items-center gap-1.5 text-[0.8125rem] font-bold">
            AI 대응 방안
          </div>
          {advice}
        </div>
      )}
    </>
  );
}

/* ── ResultCard ── */
function ResultCard({
  hit,
  rank,
  kind,
}: {
  hit: Hit;
  rank: number;
  kind: Engine;
}) {
  const isVector = kind === "vector";
  const pct = Math.round(hit.score * 100);

  return (
    <div
      className={`relative mb-3 rounded-lg border border-slate-200 p-4 transition-all last:mb-0 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] ${
        isVector ? "hover:border-teal-600" : "hover:border-amber-600"
      }`}
    >
      {/* 상단: 순위 + SO-ID + 고객사 */}
      <div className="mb-2 flex items-center gap-2.5">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
            isVector ? "bg-teal-600" : "bg-amber-600"
          }`}
        >
          #{rank}
        </span>
        <span className="text-[0.9375rem] font-bold">{hit.id}</span>
        <span className="text-sm text-slate-500">{hit.customer}</span>
      </div>

      {/* 메타 정보 */}
      <div className="mb-2 flex flex-wrap gap-3 text-[0.8125rem] text-slate-500">
        <span className="flex items-center gap-1">품목: {hit.item}</span>
        <span className="flex items-center gap-1">수량: {hit.quantity.toLocaleString()}</span>
        <span className="flex items-center gap-1">납기: {hit.deadline}</span>
      </div>

      {/* 비고 */}
      {hit.note && <div className="mb-2.5 text-[0.8125rem] leading-normal text-slate-600">{hit.note}</div>}

      {/* 점수 바 */}
      <div className="mb-2 flex items-center gap-2.5">
        <span className="min-w-10 text-xs text-slate-500">
          {isVector ? "유사도" : "BM25"}
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded bg-slate-200">
          <div
            className={`h-full rounded transition-[width] duration-[400ms] ease-out ${
              isVector ? "bg-teal-600" : "bg-amber-600"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="min-w-12 text-right text-[0.8125rem] font-bold">{pct}%</span>
      </div>

      {/* 근거 배지 */}
      {hit.evidence && hit.evidence.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hit.evidence.map((ev, i) => (
            <span
              key={i}
              className={`inline-block rounded px-2 py-0.5 text-xs ${
                isVector
                  ? "border border-teal-200 bg-teal-100 text-teal-600"
                  : "border border-amber-200 bg-amber-100 text-amber-600"
              }`}
            >
              {ev}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── EMPTY ── */
function EmptyView({ reason }: { reason: string }) {
  return (
    <div className="px-5 py-10 text-center text-slate-500">
      <div className="mb-3 text-[2.5rem]" aria-hidden="true">&#x26A0;&#xFE0F;</div>
      <div className="mb-2 text-base font-semibold text-slate-800">검색 결과 없음</div>
      <div className="text-sm text-slate-500">{reason}</div>
      <div className="mt-4 text-[0.8125rem] italic text-slate-400">근거 부족으로 추천 생략</div>
    </div>
  );
}

/* ── ERROR ── */
function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="px-5 py-10 text-center text-red-800">
      <div className="mb-3 text-[2.5rem]" aria-hidden="true">&#x26D4;</div>
      <div>일시적 오류가 발생했습니다</div>
      <div className="mb-4 text-sm">{message}</div>
      {onRetry && (
        <button
          className="rounded-lg border border-slate-200 bg-white px-5 py-2 text-sm text-slate-800 transition-colors hover:bg-slate-100"
          onClick={onRetry}
        >
          다시 시도
        </button>
      )}
    </div>
  );
}
