// ─────────────────────────────────────────────────────────────
// seed.ts — "두 DB에 샘플 수주 20건을 처음 채워넣는 준비 스크립트"
//
// 검색이 되려면 먼저 검색 대상이 DB에 들어있어야 한다.
// 이 스크립트는 `npm run seed -w backend` 로 한 번 실행하며,
//   - SQLite(키워드 검색용) 에 20건 INSERT
//   - Pinecone(의미 검색용)  에 20건을 임베딩해서 업로드
// 두 작업을 한꺼번에 처리한다.
// (Pinecone은 클라우드라 한 번 넣으면 계속 유지됨)
// ─────────────────────────────────────────────────────────────
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// .env 파일에서 API 키 읽어오기 (다른 import 보다 먼저 실행돼야 함)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
import { seedSqlite } from "./stores/sqlite.js";
import { seedPinecone } from "./stores/pinecone.js";
import { createSolarClient } from "./solarClient.js";

async function main() {
  // Pinecone에 넣을 때 임베딩(=Solar 호출)이 필요하므로 키가 반드시 있어야 한다
  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) throw new Error("UPSTAGE_API_KEY 가 필요합니다(.env).");

  const rdbInserted = seedSqlite();                       // ① SQLite 적재 (키 불필요)
  const solar = createSolarClient(apiKey);                // ② AI 창구 준비
  const vectorUpserted = await seedPinecone(solar);       // ③ Pinecone 적재 (임베딩 필요)

  // 몇 건씩 들어갔는지 출력 (예: {"vectorUpserted":20,"rdbInserted":20})
  console.log(JSON.stringify({ vectorUpserted, rdbInserted }));
}

// 실행하다 오류 나면 메시지 찍고 비정상 종료(코드 1)
main().catch((e) => {
  console.error("seed 실패:", e);
  process.exit(1);
});
