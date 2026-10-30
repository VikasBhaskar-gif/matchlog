import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { matches } from "../db/schema/index.js";
import { processMatchPredictions } from "../services/prediction.service.js";

export async function processFinishedMatchPredictions() {
  const finished = await db.query.matches.findMany({
    where: and(eq(matches.status, "FINISHED"), isNull(matches.predictionsProcessedAt)),
  });

  let processed = 0;
  for (const match of finished) {
    const result = await processMatchPredictions(match.id);
    processed += result.processed;
  }
  return { matchesHandled: finished.length, predictionsScored: processed };
}
