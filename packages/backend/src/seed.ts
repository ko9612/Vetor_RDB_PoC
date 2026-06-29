// 시드 스크립트 — 샘플 20건을 SQLite/Pinecone 에 적재 (npm run seed -w backend)
// 담당: db-agent | 근거: docs/DB_설계서.md, docs/Pinecone_인덱스설계서.md
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
import { seedSqlite } from "./stores/sqlite.js";
import { seedPinecone } from "./stores/pinecone.js";
import { createSolarClient } from "./solarClient.js";

async function main() {
  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) throw new Error("UPSTAGE_API_KEY 가 필요합니다(.env).");

  const rdbInserted = seedSqlite();
  const solar = createSolarClient(apiKey);
  const vectorUpserted = await seedPinecone(solar);

  console.log(JSON.stringify({ vectorUpserted, rdbInserted }));
}

main().catch((e) => {
  console.error("seed 실패:", e);
  process.exit(1);
});
