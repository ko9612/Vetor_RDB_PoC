// CompareBoard — 좌(벡터) / 우(RDB) 동시 비교
// 근거: docs/화면_설계서.md §3

import type { PanelState } from "../reducer.js";
import { ResultPanel } from "./ResultPanel.js";
import styles from "./CompareBoard.module.css";

interface Props {
  vector: PanelState;
  rdb: PanelState;
  onRetry?: () => void;
}

export function CompareBoard({ vector, rdb, onRetry }: Props) {
  return (
    <div className={styles.board}>
      <ResultPanel kind="vector" state={vector} onRetry={onRetry} />
      <ResultPanel kind="rdb" state={rdb} onRetry={onRetry} />
    </div>
  );
}
