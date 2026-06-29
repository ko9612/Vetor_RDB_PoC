# 배포 가이드 — Render (프론트 + 백엔드 한 서버)

이 프로젝트는 **백엔드 1개가 프론트 화면까지 같이 서빙**한다. 따라서 Render 웹 서비스
**하나만** 띄우면 끝이다. (Pinecone 벡터 DB는 원래대로 클라우드에 따로 존재)

## 사전 준비
- GitHub 저장소에 이 코드가 올라가 있어야 한다 (Render가 git에서 받아 빌드).
- 비밀키 3개: `UPSTAGE_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX`
- Pinecone 인덱스에 수주 20건이 **한 번** 적재돼 있어야 한다(클라우드라 계속 유지).
  아직이면 로컬에서 `npm run seed -w backend` 한 번 실행.

## 배포 절차
1. [Render](https://render.com) 가입 → 대시보드에서 **New + → Blueprint**.
2. 이 저장소를 선택. Render가 루트의 `render.yaml` 을 자동으로 읽는다.
3. 환경변수 입력 화면에서 비밀키 3개를 넣는다 (`render.yaml` 에 `sync:false` 로 표시된 것).
4. **Apply / Create** → 자동으로 빌드(프론트 빌드) → 실행(백엔드)된다.
5. 끝나면 `https://<서비스이름>.onrender.com` 주소로 접속. 화면이 뜨고 검색이 동작한다.

## 동작 방식 (참고)
- `buildCommand`: `npm install && npm run build -w frontend`
  → 프론트를 `packages/frontend/dist` 로 빌드.
- `startCommand`: `npm run start -w backend`
  → 백엔드가 그 `dist` 를 정적 서빙 + `/api/*` 처리. `PORT` 는 Render가 자동 주입.
- 서버가 켜질 때 SQLite에 20건을 자동 적재(멱등). 디스크가 초기화돼도 복구된다.
- `/api/health` 를 헬스체크 경로로 사용.

## 주의 / 한계
- **무료 플랜은 일정 시간 미사용 시 잠들고(cold start)**, 다시 깨어나는 데 수십 초 걸린다.
  데모 직전에 한 번 접속해 깨워두면 좋다.
- SQLite 파일은 재배포 때마다 사라지지만, 위 자동 적재로 복구되므로 문제없다.
- 비밀키는 절대 코드/`.env` 로 커밋하지 말 것 (`.env` 는 이미 .gitignore 처리됨).
