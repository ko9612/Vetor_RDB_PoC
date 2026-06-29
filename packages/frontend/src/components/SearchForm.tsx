// SearchForm + ScenarioChips
// 근거: docs/프론트엔드_기능정의서.md §4.1, §4.3

import { useState } from "react";
import { SCENARIOS } from "@scm/shared";
import type { Scenario } from "@scm/shared";
import styles from "./SearchForm.module.css";

interface Props {
  loading: boolean;
  onSearch: (query: string) => void;
}

export function SearchForm({ loading, onSearch }: Props) {
  const [query, setQuery] = useState("");
  const [activeChip, setActiveChip] = useState<string | null>(null);

  const canSubmit = query.trim().length > 0 && !loading;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit) onSearch(query.trim());
  };

  const handleChipClick = (scenario: Scenario) => {
    setQuery(scenario.query);
    setActiveChip(scenario.id);
    onSearch(scenario.query);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.label} htmlFor="query-input">
        새 수주 내용
      </label>
      <textarea
        id="query-input"
        className={styles.textarea}
        placeholder="수주 내용을 입력하세요 (예: 긴급 납기가 필요한 부품...)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveChip(null);
        }}
        disabled={loading}
      />

      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.searchBtn}
          disabled={!canSubmit}
        >
          {loading ? "검색 중..." : "검색하기"}
        </button>
        {!query.trim() && (
          <span className={styles.helper}>수주 내용을 입력하세요</span>
        )}
      </div>

      {/* 시나리오 칩 */}
      <div className={styles.chipsWrap}>
        <span className={styles.chipsLabel}>빠른 시나리오:</span>
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`${styles.chip} ${activeChip === s.id ? styles.chipActive : ""}`}
            onClick={() => handleChipClick(s)}
            disabled={loading}
          >
            {s.id} {s.title}
          </button>
        ))}
      </div>
    </form>
  );
}
