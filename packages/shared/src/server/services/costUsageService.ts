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

  async getFilteredCostUsage(
    displaySecretKey: string,
    filters?: {
      from?: Date;
      to?: Date;
      provider?: string;
    },
  ) {
    const key = await prisma.llmApiKeys.findFirst({
      where: { displaySecretKey },
      select: { id: true },
    });
    if (!key) throw new ApiError("LLM API Key not found", 404);

    if (filters?.provider && (filters.from || filters.to)) {
      return this.costUsageRepository.getUsageByProvider(
        filters.provider,
        filters.from,
        filters.to,
        key.id,
      );
    } else if (filters?.provider) {
      return this.costUsageRepository.getUsageByProvider(
        filters.provider,
        undefined,
        undefined,
        key.id,
      );
    } else if (filters?.from || filters?.to) {
      return this.costUsageRepository.getUsageByDateRange(
        filters.from ?? new Date(0),
        filters.to ?? new Date(),
        key.id,
      );
    }

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

  async getUsageByDisplaySecretKeyAndProvider(
    displaySecretKey: string,
    provider: string,
  ) {
    const key = await prisma.llmApiKeys.findFirst({
      where: { displaySecretKey },
      select: { id: true },
    });
    if (!key) throw new ApiError("LLM API Key not found", 404);

    return this.costUsageRepository.getUsageByProvider(
      provider,
      undefined,
      undefined,
      key.id,
    );
  }

  async getUsageByDisplaySecretKeyAndDateRange(
    displaySecretKey: string,
    startDate: Date,
    endDate: Date,
  ) {
    const key = await prisma.llmApiKeys.findFirst({
      where: { displaySecretKey },
      select: { id: true },
    });
    if (!key) throw new ApiError("LLM API Key not found", 404);

    return this.costUsageRepository.getUsageByDateRange(
      startDate,
      endDate,
      key.id,
    );
  }
}
