import path from "node:path";
import { runMigrations } from "../src/db/migrate.js";
import { seedCategories, syncChallengesFromDisk } from "../src/services/challenge.service.js";

async function main(): Promise<void> {
  await runMigrations();
  await seedCategories();
  await syncChallengesFromDisk(path.join(process.cwd(), "challenges"));
  console.log("seed complete");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
