import { redis } from "../redis/redis";
import { prisma } from "../../db";
import { env } from "../../env";
import { logger } from "../logger";

const SYSTEM_ORG_ID_KEY = "system:org_id";
const TABLE_CACHE_TTL = env.TABLE_CACHE_TTL || "3600";

export async function initSystemOrgId(): Promise<string> {
  // Try to get from Redis first
  if (redis) {
    try {
      const cachedId = await redis.get(SYSTEM_ORG_ID_KEY);
      if (cachedId) return cachedId;
    } catch (error) {
      logger.error("Failed to get SYSTEM_ORG_ID from Redis", error);
    }
  }

  // Fall back to database query
  const systemOrg = await prisma.organization.findFirst({
    select: { id: true },
  });

  if (!systemOrg) {
    throw new Error("No system organization found in database");
  }

  // Store in Redis if available
  if (redis) {
    try {
      await redis.set(
        SYSTEM_ORG_ID_KEY,
        systemOrg.id.toString(),
        "EX",
        TABLE_CACHE_TTL,
      );
    } catch (error) {
      logger.error("Failed to set SYSTEM_ORG_ID in Redis", error);
    }
  }

  return systemOrg.id.toString();
}
