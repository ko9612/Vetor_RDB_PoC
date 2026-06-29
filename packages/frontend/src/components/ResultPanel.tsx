// ResultPanel — 벡터/RDB 결과 패널 (5개 상태 독립 렌더)
// 근거: docs/화면_설계서.md §3~4, docs/프론트엔드_기능정의서.md §3

import type { Hit, Engine } from "@scm/shared";
import type { PanelState } from "../reducer.js";
import styles from "./ResultPanel.module.css";

interface Props {
  kind: Engine;
  state: PanelState;
  onRetry?: () => void;
}

/* ── 메인 컴포넌트 ── */
export function ResultPanel({ kind, state, onRetry }: Props) {
  const isVector = kind === "vector";

  return (
    <div className={styles.panel}>
      {/* 패널 헤더 */}
      <div
        className={`${styles.panelHeader} ${isVector ? styles.panelHeaderVector : styles.panelHeaderRdb}`}
      >
        <span>
          {isVector ? "\uD83D\uDD0D 의미 검색 (벡터 DB)" : "\uD83D\uDCDD 키워드 검색 (RDB)"}
        </span>
        <span className={styles.engineLabel}>
          {isVector ? "Pinecone \u00B7 Solar Embedding" : "SQLite FTS5 \u00B7 bm25"}
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
      <div className={styles.body}>
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
    <div className={styles.keywordsBar}>
      <span>추출 키워드:</span>
      {keywords.map((kw, i) => (
        <span key={i} className={styles.keywordBadge}>{kw}</span>
      ))}
    </div>
  );
}

/* ── IDLE ── */
function IdleView() {
  return (
    <div className={styles.idleState}>
      <div className={styles.idleIcon} aria-hidden="true">&#x1F50E;</div>
      <div className={styles.idleText}>수주 내용을 입력하고 검색하세요</div>
    </div>
  );
}

/* ── LOADING (스켈레톤) ── */
function LoadingView() {
  return (
    <div className={styles.skeleton}>
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.skeletonCard}>
          <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
          <div className={`${styles.skeletonLine} ${styles.skeletonLineMedium}`} />
          <div className={`${styles.skeletonLine} ${styles.skeletonLineFull}`} />
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
        <div className={`${styles.advicePane} ${isVector ? styles.adviceVector : styles.adviceRdb}`}>
          <div className={styles.adviceTitle}>AI 대응 방안</div>
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
    <div className={`${styles.card} ${isVector ? styles.cardVector : styles.cardRdb}`}>
      {/* 상단: 순위 + SO-ID + 고객사 */}
      <div className={styles.cardTop}>
        <span className={`${styles.rankBadge} ${isVector ? styles.rankVector : styles.rankRdb}`}>
          #{rank}
        </span>
        <span className={styles.soId}>{hit.id}</span>
        <span className={styles.customer}>{hit.customer}</span>
      </div>

      {/* 메타 정보 */}
      <div className={styles.meta}>
        <span className={styles.metaItem}>품목: {hit.item}</span>
        <span className={styles.metaItem}>수량: {hit.quantity.toLocaleString()}</span>
        <span className={styles.metaItem}>납기: {hit.deadline}</span>
      </div>

      {/* 비고 */}
      {hit.note && <div className={styles.note}>{hit.note}</div>}

      {/* 점수 바 */}
      <div className={styles.scoreRow}>
        <span className={styles.scoreLabel}>
          {isVector ? "유사도" : "BM25"}
        </span>
        <div className={styles.scoreBarOuter}>
          <div
            className={`${styles.scoreBarInner} ${isVector ? styles.barVector : styles.barRdb}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={styles.scoreValue}>{pct}%</span>
      </div>

      {/* 근거 배지 */}
      {hit.evidence && hit.evidence.length > 0 && (
        <div className={styles.evidenceRow}>
          {hit.evidence.map((ev, i) => (
            <span
              key={i}
              className={`${styles.evidenceBadge} ${isVector ? styles.evidenceVector : styles.evidenceRdb}`}
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
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon} aria-hidden="true">&#x26A0;&#xFE0F;</div>
      <div className={styles.emptyTitle}>검색 결과 없음</div>
      <div className={styles.emptyReason}>{reason}</div>
      <div className={styles.emptyAdvice}>근거 부족으로 추천 생략</div>
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
    <div className={styles.errorState}>
      <div className={styles.errorIcon} aria-hidden="true">&#x26D4;</div>
      <div>일시적 오류가 발생했습니다</div>
      <div className={styles.errorMessage}>{message}</div>
      {onRetry && (
        <button className={styles.retryBtn} onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  );
}
