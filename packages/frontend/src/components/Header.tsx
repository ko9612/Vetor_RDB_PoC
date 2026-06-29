// Header — 타이틀 + 연결 상태 배지
// 근거: docs/화면_설계서.md §3.1

import styles from "./Header.module.css";

interface Props {
  connected: boolean | null; // null = 확인 중
}

export function Header({ connected }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.titleGroup}>
        <h1 className={styles.title}>유사 수주 검색 PoC</h1>
        <span className={styles.subtitle}>벡터 DB &#x27F7; RDB 비교</span>
      </div>
      <span
        className={`${styles.badge} ${connected ? styles.connected : styles.disconnected}`}
      >
        <span
          className={`${styles.dot} ${connected ? styles.dotGreen : styles.dotRed}`}
        />
        {connected === null ? "확인 중..." : connected ? "연결됨" : "연결 오류"}
      </span>
    </header>
  );
}
