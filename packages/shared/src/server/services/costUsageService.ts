import { CostUsageRepository } from "../repositories/costUsageRepository";
import { prisma } from "../../db";
import { ApiError } from "../../errors";

export class CostUsageService {
  constructor(private readonly costUsageRepository: CostUsageRepository) {}

  async getCostAndUsageByKey(
    llmApiKeyId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    return this.costUsageRepository.getCostAndUsageByKey(
      llmApiKeyId,
      startDate,
      endDate,
    );
  }

  async getCostAndUsageByProject(
    projectId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    return this.costUsageRepository.getCostAndUsageByProject(
      projectId,
      startDate,
      endDate,
    );
  }

  async getUsageByDisplaySecretKey(displaySecretKey: string) {
    const key = await prisma.llmApiKeys.findFirst({
      where: { displaySecretKey },
      select: { id: true },
    });
    if (!key) throw new ApiError("LLM API Key not found", 404);

    return this.costUsageRepository.getCostAndUsageByKey(key.id);
  }

  async getUsageByProvider(provider: string, startDate?: Date, endDate?: Date) {
    return this.costUsageRepository.getUsageByProvider(
      provider,
      startDate,
      endDate,
    );
  }

  async getUsageByDateRange(
    startDate: Date,
    endDate: Date,
    llmApiKeyId?: string,
  ) {
    return this.costUsageRepository.getUsageByDateRange(
      startDate,
      endDate,
      llmApiKeyId,
    );
  }
}
