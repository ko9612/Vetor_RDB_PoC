// CompareBoard — 좌(벡터) / 우(RDB) 동시 비교
// 근거: docs/화면_설계서.md §3

import type { PanelState } from "../store.js";
import { ResultPanel } from "./ResultPanel.js";

interface Props {
  vector: PanelState;
  rdb: PanelState;
  onRetry?: () => void;
}

export function CompareBoard({ vector, rdb, onRetry }: Props) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <ResultPanel kind="vector" state={vector} onRetry={onRetry} />
      <ResultPanel kind="rdb" state={rdb} onRetry={onRetry} />
    </div>
  );
}
