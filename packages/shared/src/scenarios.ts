import type { Scenario } from "./types.js";

/**
 * 공통 테스트 시나리오 5개 (SSOT).
 * 질의문은 정답 수주와 키워드가 거의 겹치지 않도록 설계됨 →
 * 키워드 검색(RDB)은 누락, 의미 검색(벡터)은 탐지.
 * docs/시나리오_정의서.md 와 한 글자도 다르면 안 됨.
 */
export const SCENARIOS: Scenario[] = [
  {
    id: "S1",
    title: "긴급 납기 / 우선 생산",
    query: "설비가 멈출 수 있어 최대한 빨리 보내야 하는 수주",
    answer: ["SO-001", "SO-016"],
    rdbExpect: "fail",
    vectorExpect: "success",
  },
  {
    id: "S2",
    title: "콜드체인 / 저온 유통",
    query: "냉동·냉장 상태로 차갑게 운반해야 하는 수주",
    answer: ["SO-003", "SO-007", "SO-011", "SO-015"],
    rdbExpect: "partial",
    vectorExpect: "success",
  },
  {
    id: "S3",
    title: "수출 / 선적 일정 연동",
    query: "배로 해외에 내보내는 일정에 맞춰 출고해야 하는 수주",
    answer: ["SO-005", "SO-013"],
    rdbExpect: "partial",
    vectorExpect: "success",
  },
  {
    id: "S4",
    title: "맞춤 제작 / 잦은 설계 변경",
    query: "원하는 형상을 새로 맞추고 도안을 자주 바꾸는 수주",
    answer: ["SO-008", "SO-014"],
    rdbExpect: "fail",
    vectorExpect: "success",
  },
  {
    id: "S5",
    title: "정전기·미세입자 민감 / 클린 운송",
    query: "전기 충격이나 미세 먼지에 약해 깨끗한 환경에서 다뤄야 하는 수주",
    answer: ["SO-010", "SO-017"],
    rdbExpect: "fail",
    vectorExpect: "success",
  },
];
