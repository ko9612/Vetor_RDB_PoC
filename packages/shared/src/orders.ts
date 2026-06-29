import type { Order } from "./types.js";

/**
 * 공통 샘플 데이터 — 과거 수주 이력 20건 (SSOT).
 * docs/시나리오_정의서.md 와 한 글자도 다르면 안 됨.
 */
export const ORDERS: Order[] = [
  { id: "SO-001", customer: "한빛전자",     item: "LED 패널 모듈",        quantity: 5000,  deadline: "2025-08-15", note: "긴급 납기 요청, 라인 정지 위험으로 우선 생산 필요" },
  { id: "SO-002", customer: "대성기계",     item: "산업용 베어링",        quantity: 1200,  deadline: "2025-09-30", note: "정기 발주, 품질 인증서 동봉 요청" },
  { id: "SO-003", customer: "서원식품",     item: "냉장 보관 소스",       quantity: 8000,  deadline: "2025-07-20", note: "콜드체인 유지 필수, 상온 노출 시 반품" },
  { id: "SO-004", customer: "미래모빌리티", item: "전기차 배터리 셀",     quantity: 3000,  deadline: "2025-10-10", note: "신규 고객, 안전 규격 KC 인증 필요" },
  { id: "SO-005", customer: "동방물산",     item: "수출용 포장재",        quantity: 15000, deadline: "2025-08-01", note: "해외 선적 일정 맞춰 납기 엄수, 영문 라벨 표기" },
  { id: "SO-006", customer: "한빛전자",     item: "OLED 디스플레이",      quantity: 2500,  deadline: "2025-11-05", note: "재발주 건, 이전 납품 품질 양호" },
  { id: "SO-007", customer: "청정농산",     item: "신선 채소 패키지",     quantity: 6000,  deadline: "2025-07-05", note: "저온 유통 필요, 신선도 클레임 이력 있음" },
  { id: "SO-008", customer: "강성산업",     item: "정밀 금형",            quantity: 50,    deadline: "2025-12-20", note: "맞춤 제작, 기존 금형 재활용 가능 여부 검토 요청" },
  { id: "SO-009", customer: "대성기계",     item: "유압 실린더",          quantity: 800,   deadline: "2025-09-15", note: "납기 지연 시 페널티 조항 포함 계약" },
  { id: "SO-010", customer: "누리텍",       item: "반도체 웨이퍼",        quantity: 1000,  deadline: "2025-10-25", note: "클린룸 환경 운송, 진동 방지 포장 필수" },
  { id: "SO-011", customer: "서원식품",     item: "냉동 만두",            quantity: 12000, deadline: "2025-08-30", note: "냉동 차량 배송, 해동 시 전량 폐기 처리" },
  { id: "SO-012", customer: "미래모빌리티", item: "충전 커넥터",          quantity: 4000,  deadline: "2025-11-15", note: "전기차 부품, 향후 추가 발주 가능성 높음" },
  { id: "SO-013", customer: "동방물산",     item: "컨테이너 적재 부자재", quantity: 9000,  deadline: "2025-09-05", note: "선박 일정 변동 잦음, 유연한 납기 대응 필요" },
  { id: "SO-014", customer: "강성산업",     item: "프레스 부품",          quantity: 300,   deadline: "2025-12-01", note: "도면 변경 빈번, 사전 설계 협의 필요" },
  { id: "SO-015", customer: "청정농산",     item: "유기농 과일 박스",     quantity: 4500,  deadline: "2025-07-12", note: "온도 민감 품목, 빠른 배송 요구" },
  { id: "SO-016", customer: "한빛전자",     item: "전원 공급 장치",       quantity: 3500,  deadline: "2025-10-01", note: "생산 차질로 조기 납품 희망, 우선순위 상향" },
  { id: "SO-017", customer: "누리텍",       item: "PCB 기판",             quantity: 7000,  deadline: "2025-09-20", note: "정전기 방지 포장 필수, 습도 관리 요구" },
  { id: "SO-018", customer: "대진건설",     item: "철근 자재",            quantity: 20000, deadline: "2025-08-10", note: "대량 납품, 현장 직배송, 분할 납기 협의" },
  { id: "SO-019", customer: "세종화학",     item: "산업용 접착제",        quantity: 2000,  deadline: "2025-07-25", note: "위험물 운송 규정 준수, MSDS 첨부 필수" },
  { id: "SO-020", customer: "미래모빌리티", item: "배터리 관리 시스템",   quantity: 1500,  deadline: "2025-11-20", note: "신규 양산 프로젝트, 품질 테스트 강화 요구" },
];

/** 수주 1건을 임베딩/검색에 쓸 자연어 문장으로 직렬화 (Pinecone_인덱스설계서.md 템플릿) */
export function orderToText(o: Order): string {
  return `고객사 ${o.customer}, 품목 ${o.item}, 수량 ${o.quantity}, 납기 ${o.deadline}. 특이사항: ${o.note}`;
}
