# SCM 유사 수주 검색 PoC

## 프로젝트 개요

SCM 영업 담당자가 새로운 수주 문의를 접수했을 때, 과거의 유사한 수주 이력을 자동으로 검색하여 대응 방안을 추천받는 AI 시스템입니다.

동일한 데이터(20건)와 시나리오(5개) 위에서 **벡터 DB(Pinecone + Upstage Solar Embedding)** 기반 의미 검색과 **RDB(SQLite FTS5)** 기반 키워드 검색을 좌/우 화면에서 동시에 비교하여, 유사 수주 검색 과제에 어떤 방식이 적합한지 정량/정성적으로 검증합니다.

## 기술 스택

| 구분 | 기술 |
|------|------|
| 런타임 | Node.js 20+ / TypeScript |
| 백엔드 | Express |
| 프론트엔드 | React 18 + Vite |
| RDB | SQLite (better-sqlite3, FTS5, bm25) |
| 벡터 DB | Pinecone (dim 4096, cosine) |
| LLM/임베딩 | Upstage Solar (OpenAI 호환 SDK) |
| 구조 | 모노레포 (npm workspaces), 프레임워크(LangChain 등) 미사용 |

## 프로젝트 구조

```
├── docs/                              설계 문서 (SSOT, 10종)
├── data/                              SQLite DB 파일 저장 (시드 실행 시 생성)
│   └── orders.db                        수주 20건 + FTS5 인덱스
├── packages/
│   ├── shared/                        공통 타입·데이터 (모든 패키지의 SSOT)
│   │   └── src/
│   │       ├── types.ts                 Order, Hit, PanelResult, SearchResponse 등 타입
│   │       ├── orders.ts                수주 20건 데이터 + orderToText 직렬화 함수
│   │       ├── scenarios.ts             테스트 시나리오 5개 (S1~S5)
│   │       └── index.ts                 re-export
│   ├── backend/                       Express API 서버
│   │   └── src/
│   │       ├── index.ts                 Express 앱 + 6개 엔드포인트 라우팅
│   │       ├── orchestrator.ts          두 엔진 병렬 실행 (Promise.allSettled + 실패 격리)
│   │       ├── solarClient.ts           Upstage Solar LLM/Embedding 클라이언트
│   │       ├── seed.ts                  샘플 데이터 적재 스크립트
│   │       ├── engines/
│   │       │   ├── vectorEngine.ts        Pinecone cosine 검색 → LLM 추천 생성
│   │       │   └── rdbEngine.ts           SQLite FTS5 bm25 검색 → LLM 추천 생성
│   │       └── stores/
│   │           ├── sqlite.ts              SQLite DDL, 시드, FTS5 검색, 키워드 추출
│   │           └── pinecone.ts            Pinecone 인덱스 upsert, 벡터 검색
│   └── frontend/                      React 좌우 비교 UI
│       └── src/
│           ├── App.tsx                  루트 컴포넌트, useReducer 상태 관리
│           ├── api.ts                   fetch 래퍼 (POST /api/search, GET /api/health)
│           ├── reducer.ts               검색 상태 리듀서 (5개 패널 상태)
│           └── components/
│               ├── Header.tsx             타이틀 + 연결 상태 뱃지
│               ├── SearchForm.tsx         질의 입력 + 시나리오 칩 (S1~S5)
│               ├── CompareBoard.tsx       좌(벡터)/우(RDB) 2열 레이아웃
│               └── ResultPanel.tsx        결과 카드 + 점수 바 + 근거 뱃지 + 추천
├── .env.example                       환경변수 템플릿
├── CLAUDE.md                          Claude Code 프로젝트 컨텍스트
└── package.json                       모노레포 루트 (npm workspaces)
```

> `node_modules/`는 루트에만 존재합니다 (npm workspaces 통합 관리).

## 주요 코드 설명

### 백엔드 (`packages/backend/src/`)

**solarClient.ts** -- Upstage Solar API 호출 클라이언트

OpenAI 호환 SDK의 baseURL을 Upstage Solar 엔드포인트로 교체하여 임베딩과 LLM 추천을 제공한다. `embed()`는 passage/query 모델을 구분하여 4096차원 벡터를 생성하고, `recommend()`는 검색된 유사 수주 이력을 시스템 프롬프트와 함께 LLM에 전달하여 대응 방안 3~4가지를 생성한다. 타임아웃 30초, 자동 재시도 1회가 설정되어 있다.

**stores/sqlite.ts** -- SQLite DDL, 시드, FTS5 검색, 키워드 추출

서버 기동 시 `orders` 테이블과 `orders_fts` FTS5 가상 테이블을 생성(DDL)하고, 수주 20건을 INSERT OR IGNORE로 멱등 시드한다. 검색 시 질의문에서 구두점 제거, 공백 분리, 불용어/1글자 필터링으로 키워드를 추출한 뒤 FTS5 MATCH(OR 결합)로 bm25 검색을 수행한다. bm25 원시 점수(음수)를 0~1로 정규화하고, 각 히트에서 실제 매칭된 키워드를 evidence로 첨부한다.

**stores/pinecone.ts** -- Pinecone 업서트, 벡터 검색

인덱스가 없으면 serverless 인덱스를 자동 생성(dim 4096, cosine, AWS us-east-1)하고, 수주 20건을 `orderToText`로 직렬화한 뒤 Solar passage 임베딩을 거쳐 배치 업서트한다. 검색 시 질의 임베딩 벡터로 cosine TOP-K 쿼리를 수행하고, 메타데이터(고객사/품목/납기/특이사항)를 포함한 Hit 배열을 반환한다.

**engines/vectorEngine.ts** -- 벡터 검색 파이프라인

질의문을 Solar query 모델로 임베딩하고, Pinecone cosine 검색으로 유사 수주를 조회한 뒤, 각 히트에 의미 태그(cosine 점수)를 evidence로 부여한다. 결과가 있으면 LLM 추천을 생성하고, 없으면 empty 상태를 반환한다. 모든 예외를 catch하여 error 상태로 변환함으로써 실패 격리를 보장한다.

**engines/rdbEngine.ts** -- RDB 검색 파이프라인

SQLite FTS5의 `searchFts()`를 호출하여 키워드 기반 검색을 수행한다. 결과 0건이면 LLM을 호출하지 않고 empty를 반환하여 환각을 방지한다. 결과가 있으면 추출된 키워드를 evidence로 부여하고 LLM 추천을 생성한다. vectorEngine과 동일하게 try-catch로 실패를 격리한다.

**orchestrator.ts** -- 병렬 실행 + 실패 격리

`Promise.allSettled`로 벡터 엔진과 RDB 엔진을 동시에 실행하여, 한쪽이 실패해도 다른 쪽 결과가 정상 반환되도록 격리한다(NFR-09). 요청에 포함된 engines 배열에 따라 선택적으로 엔진을 실행하고, 미선택 엔진은 즉시 empty를 반환한다. 최종적으로 vector/rdb 두 PanelResult를 하나의 SearchResponse로 합성한다.

**index.ts** -- Express 엔드포인트

6개 API 라우트를 정의한다. `/api/search`(통합 검색), `/api/search/vector`(벡터 단독), `/api/search/rdb`(RDB 단독), `/api/seed`(데이터 적재), `/api/scenarios`(시나리오 반환), `/api/health`(헬스체크). API 키가 없어도 서버가 기동되도록 SolarClient를 조건부로 생성하며, 키 미설정 시 검색 요청에 500 오류를 반환한다.

### 프론트엔드 (`packages/frontend/src/`)

**App.tsx** -- 루트 컴포넌트

`useReducer`로 벡터/RDB 양쪽 패널 상태를 관리한다. 검색 실행 시 API 응답을 받아 각 패널에 독립적으로 dispatch하여 한쪽 오류가 다른 쪽에 영향을 주지 않도록 격리한다. 동일 질의 재요청 방지를 위한 클라이언트 캐시(Map)를 유지하고, 30초 간격으로 헬스체크를 수행하여 연결 상태 뱃지를 갱신한다.

**reducer.ts** -- 상태 관리

5개 패널 상태(idle/loading/success/empty/error)를 정의하고, `SEARCH_START`(양쪽 loading 전환), `PANEL_RESULT`(엔진별 결과 매핑), `PANEL_ERROR`(에러 매핑), `RESET`(초기화) 액션을 처리한다. 백엔드의 PanelResult를 프론트엔드 PanelState로 변환하는 `panelResultToState` 함수가 success/empty/error 분기를 담당한다.

**api.ts** -- API 호출

`fetch` 래퍼로 `POST /api/search`와 `GET /api/health`를 호출한다. 검색 요청에는 15초 타임아웃(AbortController)을 적용하고, HTTP 오류 시 응답 body에서 에러 메시지를 추출하여 throw한다. 헬스체크는 5초 타임아웃으로 서버 연결 여부를 boolean으로 반환한다.

## 환경 설정

1. `.env.example`을 복사하여 `.env` 파일을 생성합니다.

```bash
cp .env.example .env
```

2. `.env` 파일에 실제 API 키를 입력합니다.

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `UPSTAGE_API_KEY` | 필수 | Upstage Solar API 키 (LLM + Embedding) |
| `PINECONE_API_KEY` | 필수 | Pinecone API 키 (벡터 DB) |
| `PINECONE_INDEX` | 선택 | Pinecone 인덱스 이름 (기본: scm-orders) |
| `PORT` | 선택 | 서버 포트 (기본: 8080) |

## 실행 방법

```bash
# 1. 의존성 설치
npm install

# 2. 샘플 데이터 적재 (SQLite + Pinecone에 수주 20건 시드)
npm run seed -w backend

# 3. 백엔드 API 서버 실행 (포트 8080)
npm run dev -w backend

# 4. 프론트엔드 UI 실행 (포트 5173, /api -> :8080 프록시)
npm run dev -w frontend

# 타입 체크 (전체 워크스페이스)
npm run typecheck

# 프론트엔드 빌드
npm run build -w frontend
```

브라우저에서 `http://localhost:5173` 으로 접속합니다.

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/search` | 벡터+RDB 동시 검색 및 LLM 추천 |
| POST | `/api/search/vector` | 벡터 단독 검색 |
| POST | `/api/search/rdb` | RDB 단독 검색 |
| POST | `/api/seed` | 샘플 20건 적재 (Pinecone/SQLite) |
| GET | `/api/scenarios` | 테스트 시나리오 5개 반환 |
| GET | `/api/health` | 헬스 체크 |

## 테스트 시나리오

5개 시나리오는 질의문의 키워드가 정답 수주 이력과 의도적으로 겹치지 않도록 설계되어 있습니다. 이를 통해 키워드 검색(RDB)의 한계와 의미 검색(벡터)의 강점을 비교합니다.

| 시나리오 | 질의 핵심 | 정답 수주 | RDB 기대 | 벡터 기대 |
|----------|-----------|-----------|----------|-----------|
| S1 긴급/우선생산 | 설비 멈출 위험, 빨리 보내야 | SO-001, SO-016 | 실패 | 성공 |
| S2 콜드체인 | 냉동·냉장 상태로 차갑게 운반 | SO-003, SO-007, SO-011, SO-015 | 부분 | 성공 |
| S3 수출/선적 | 배로 해외 출고 일정 | SO-005, SO-013 | 부분 | 성공 |
| S4 맞춤/설계변경 | 형상 맞춤, 도안 변경 | SO-008, SO-014 | 실패 | 성공 |
| S5 정전기/클린 | 전기 충격, 먼지에 약한 부품 | SO-010, SO-017 | 실패 | 성공 |

- **S1, S4, S5**: RDB 완전 실패 (키워드 불일치) -> 벡터 성공 (의미 클러스터 탐지)
- **S2, S3**: RDB 부분 성공 (일부 키워드 매칭) -> 벡터 성공 (다건 탐지)
- RDB 결과 0건 시 "검색 결과 없음"과 사유를 표시하고 LLM 추천을 생략합니다 (환각 방지).

## 핵심 검증 포인트

- `POST /api/search`가 `vector`/`rdb` 두 블록을 동시 반환
- S1/S4/S5에서 RDB는 "결과 없음", 벡터는 정답 수주 탐지
- 좌우 동시 비교 화면에서 점수(cosine/bm25)와 근거(매칭 키워드/의미 태그) 표시
- 한쪽 엔진 실패가 다른 패널에 영향을 주지 않는 실패 격리 구조

## 설계 문서

`docs/` 디렉토리에 10종의 설계 문서가 포함되어 있습니다.

| 문서 | 내용 |
|------|------|
| 요구사항_정의서.md | FR/NFR 요구사항, 인수 기준 |
| 시나리오_정의서.md | 수주 20건 + 시나리오 5개 (SSOT) |
| 화면_설계서.md | 좌우 비교 UI, 5개 패널 상태 |
| 프론트엔드_기능정의서.md | 컴포넌트/상태 모델 |
| API_연동명세서.md | FE-BE 요청/응답 포맷 |
| DB_설계서.md | SQLite 스키마, FTS5, DDL |
| Pinecone_인덱스설계서.md | 벡터 인덱스 사양 (dim 4096, cosine) |
| API_명세서.md | 백엔드 엔드포인트 |
| 아키텍처_설계서.md | 벡터/RDB 처리 흐름 |
| RAG_파이프라인_설계서.md | 임베딩 전략, 프롬프트, 검색 비교 |
