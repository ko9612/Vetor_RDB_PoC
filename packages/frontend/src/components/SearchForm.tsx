// SearchForm + ScenarioChips
// 근거: docs/프론트엔드_기능정의서.md §4.1, §4.3

import { useState } from "react";
import { SCENARIOS } from "@scm/shared";
import type { Scenario } from "@scm/shared";

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
    <form className="mb-7" onSubmit={handleSubmit}>
      <label className="mb-2 block text-[0.9375rem] font-semibold" htmlFor="query-input">
        새 수주 내용
      </label>
      <textarea
        id="query-input"
        className="min-h-20 w-full resize-y rounded-lg border border-slate-200 p-3 text-[0.9375rem] text-slate-800 transition-colors placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-[3px] focus:ring-teal-600/15"
        placeholder="수주 내용을 입력하세요 (예: 긴급 납기가 필요한 부품...)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveChip(null);
        }}
        disabled={loading}
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          className="rounded-lg bg-teal-600 px-6 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors enabled:hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-[0.55]"
          disabled={!canSubmit}
        >
          {loading ? "검색 중..." : "검색하기"}
        </button>
        {!query.trim() && (
          <span className="text-[0.8125rem] text-slate-500">수주 내용을 입력하세요</span>
        )}
      </div>

      {/* 시나리오 칩 */}
      <div className="mt-4">
        <span className="mr-2 text-[0.8125rem] text-slate-500">빠른 시나리오:</span>
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`my-1 mr-1 inline-block rounded-full border px-3.5 py-1.5 text-[0.8125rem] transition-all disabled:cursor-not-allowed disabled:opacity-[0.55] ${
              activeChip === s.id
                ? "border-teal-600 bg-teal-600 text-white hover:bg-teal-700"
                : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-100"
            }`}
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
