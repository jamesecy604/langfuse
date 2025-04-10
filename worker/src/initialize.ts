import { upsertDefaultModelPrices } from "./scripts/upsertDefaultModelPrices";
import { BalanceRepository } from "../../packages/shared/src/server/services/repositories/balanceRepository";
import { logger } from "@langfuse/shared/src/server";

async function initialize() {
  try {
    // Initialize model prices
    await upsertDefaultModelPrices();

    // Sync all balances from ClickHouse to Redis
    const balanceRepo = new BalanceRepository();
    const count = await balanceRepo.syncAllBalancesToRedis();
    logger.info(`Initialized ${count} balances in Redis`);
  } catch (error) {
    logger.error("Initialization failed", error);
    throw error;
  }
}

initialize();
