import type { ClickHouseClient } from "@clickhouse/client";
import { clickhouseClient } from "../clickhouse/client";
import { PrismaClient } from "@prisma/client";

interface ClickHouseUsageResult {
  llm_api_key_id: string;
  tokens: string;
  cost: string | null;
}

interface ClickHouseSingleUsageResult {
  tokens: string;
  cost: string | null;
}

export interface CostUsageRepository {
  getCostAndUsageByKey(
    llmApiKeyId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    tokens: number;
    cost: number | null;
    secretKey: string;
    provider: string;
  }>;

  getCostAndUsageByProject(
    projectId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    items: Array<{
      llmApiKeyId: string;
      tokens: number;
      cost: number | null;
      secretKey: string;
      provider: string;
    }>;
    summaryCost: number;
    summaryToken: number;
  }>;

  getUsageByProvider(
    provider: string,
    startDate?: Date,
    endDate?: Date,
    llmApiKeyId?: string,
    projectId?: string,
  ): Promise<{
    items: Array<{
      llmApiKeyId: string;
      tokens: number;
      cost: number | null;
      secretKey: string;
      provider: string;
    }>;
    summaryCost: number;
    summaryToken: number;
  }>;

  getUsageByDateRange(
    startDate: Date,
    endDate: Date,
    llmApiKeyId?: string,
    projectId?: string,
  ): Promise<{
    items: Array<{
      llmApiKeyId: string;
      tokens: number;
      cost: number | null;
      secretKey: string;
      provider: string;
    }>;
    summaryCost: number;
    summaryToken: number;
  }>;
}

export class CostUsageRepositoryImpl implements CostUsageRepository {
  constructor(
    private readonly clickhouse: ClickHouseClient,
    private readonly prisma: PrismaClient,
  ) {}

  async getCostAndUsageByKey(
    llmApiKeyId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const usageQuery = `
      SELECT 
        sum(tokens) as tokens,
        sum(cost) as cost
      FROM ${startDate ? "total_usage_token" : "llm_api_key_usage"}
      WHERE llm_api_key_id = {llmApiKeyId:String}
      ${startDate ? `AND created_at BETWEEN {startDate:DateTime} AND {endDate:DateTime}` : ""}
    `;

    const result = await this.clickhouse.query({
      query: usageQuery,
      query_params: {
        llmApiKeyId,
        ...(startDate && {
          startDate: startDate.toISOString().split(".")[0],
          endDate: (endDate || new Date()).toISOString().split(".")[0],
        }),
      },
      format: "JSON",
    });

    const keyInfo = await this.prisma.llmApiKeys.findUnique({
      where: { id: llmApiKeyId },
      select: { secretKey: true, provider: true },
    });

    const usage = ((await result.json())?.data?.[0] as
      | ClickHouseSingleUsageResult
      | undefined) || {
      tokens: "0",
      cost: null,
    };

    return {
      tokens: parseInt(usage.tokens),
      cost: usage.cost ? parseFloat(usage.cost) : null,
      secretKey: keyInfo?.secretKey || "",
      provider: keyInfo?.provider || "",
    };
  }

  async getCostAndUsageByProject(
    projectId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const keys = await this.prisma.llmApiKeys.findMany({
      where: { projectId },
      select: { id: true, secretKey: true, provider: true },
    });

    if (!keys.length) return { items: [], summaryCost: 0, summaryToken: 0 };

    const usageQuery = `
      SELECT 
        llm_api_key_id,
        sum(tokens) as tokens,
        sum(cost) as cost
      FROM ${startDate ? "total_usage_token" : "llm_api_key_usage"}
      WHERE llm_api_key_id IN ({llmApiKeyIds:Array(String)})
      ${startDate ? `AND created_at BETWEEN {startDate:DateTime} AND {endDate:DateTime}` : ""}
      GROUP BY llm_api_key_id
    `;

    const result = await this.clickhouse.query({
      query: usageQuery,
      query_params: {
        llmApiKeyIds: keys.map((k) => k.id),
        ...(startDate && {
          startDate: startDate.toISOString().split(".")[0],
          endDate: (endDate || new Date()).toISOString().split(".")[0],
        }),
      },
      format: "JSON",
    });

    const usages =
      ((await result.json())?.data as ClickHouseUsageResult[]) || [];

    let summaryCost = 0;
    let summaryToken = 0;
    const items = keys.map((key) => {
      const usage = usages.find((u) => u.llm_api_key_id === key.id) || {
        tokens: "0",
        cost: null,
      };
      const cost = usage.cost ? parseFloat(usage.cost) : null;
      const tokens = parseInt(usage.tokens);

      if (cost !== null) {
        summaryCost += cost;
      }
      summaryToken += tokens;

      return {
        llmApiKeyId: key.id,
        tokens,
        cost,
        secretKey: key.secretKey,
        provider: key.provider,
      };
    });

    return { items, summaryCost, summaryToken };
  }

  async getUsageByProvider(
    provider: string,
    startDate?: Date,
    endDate?: Date,
    llmApiKeyId?: string,
    projectId?: string,
  ) {
    const where = {
      provider,
      ...(llmApiKeyId && { id: llmApiKeyId }),
      ...(projectId && { projectId }),
    };

    const keys = await this.prisma.llmApiKeys.findMany({
      where,
      select: { id: true, secretKey: true, provider: true },
    });

    if (!keys.length) return { items: [], summaryCost: 0, summaryToken: 0 };

    const usageQuery = `
      SELECT 
        llm_api_key_id,
        sum(tokens) as tokens,
        sum(cost) as cost
      FROM ${startDate ? "total_usage_token" : "llm_api_key_usage"}
      WHERE llm_api_key_id IN ({llmApiKeyIds:Array(String)})
      ${startDate ? `AND created_at BETWEEN {startDate:DateTime} AND {endDate:DateTime}` : ""}
      GROUP BY llm_api_key_id
    `;

    const result = await this.clickhouse.query({
      query: usageQuery,
      query_params: {
        llmApiKeyIds: keys.map((k) => k.id),
        ...(startDate && {
          startDate: startDate.toISOString().split(".")[0],
          endDate: (endDate || new Date()).toISOString().split(".")[0],
        }),
      },
      format: "JSON",
    });

    const usages =
      ((await result.json())?.data as ClickHouseUsageResult[]) || [];

    // Calculate totals
    let summaryCost = 0;
    let summaryToken = 0;
    const items = keys.map((key) => {
      const usage = usages.find((u) => u.llm_api_key_id === key.id) || {
        tokens: "0",
        cost: null,
      };
      const cost = usage.cost ? parseFloat(usage.cost) : null;
      const tokens = parseInt(usage.tokens);

      if (cost !== null) {
        summaryCost += cost;
      }
      summaryToken += tokens;

      return {
        llmApiKeyId: key.id,
        tokens,
        cost,
        secretKey: key.secretKey,
        provider: key.provider,
      };
    });

    return { items, summaryCost, summaryToken };
  }

  async getUsageByDateRange(
    startDate: Date,
    endDate: Date,
    llmApiKeyId?: string,
    projectId?: string,
  ) {
    let whereClause = `created_at BETWEEN {startDate:DateTime} AND {endDate:DateTime}`;
    const queryParams: Record<string, any> = {
      startDate: startDate.toISOString().split(".")[0],
      endDate: endDate.toISOString().split(".")[0],
    };

    if (llmApiKeyId) {
      whereClause = `llm_api_key_id = {llmApiKeyId:String} AND ${whereClause}`;
      queryParams.llmApiKeyId = llmApiKeyId;
    }

    if (projectId) {
      const keys = await this.prisma.llmApiKeys.findMany({
        where: { projectId },
        select: { id: true },
      });
      if (!keys.length) return { items: [], summaryCost: 0, summaryToken: 0 };

      whereClause = `llm_api_key_id IN ({llmApiKeyIds:Array(String)}) AND ${whereClause}`;
      queryParams.llmApiKeyIds = keys.map((k) => k.id);
    }

    const usageQuery = `
      SELECT 
        llm_api_key_id,
        sum(tokens) as tokens,
        sum(cost) as cost
      FROM total_usage_token
      WHERE ${whereClause}
      GROUP BY llm_api_key_id
    `;

    const result = await this.clickhouse.query({
      query: usageQuery,
      query_params: queryParams,
      format: "JSON",
    });

    const usages =
      ((await result.json())?.data as ClickHouseUsageResult[]) || [];
    if (!usages.length) return { items: [], summaryCost: 0, summaryToken: 0 };

    // Get key info for all keys found in results
    const keyIds = [
      ...new Set(usages.map((u: any) => u.llm_api_key_id)),
    ] as string[];
    const keys = await this.prisma.llmApiKeys.findMany({
      where: { id: { in: keyIds } },
      select: { id: true, secretKey: true, provider: true },
    });

    let summaryCost = 0;
    let summaryToken = 0;
    const items = usages.map((usage) => {
      const key = keys.find((k) => k.id === usage.llm_api_key_id);
      const cost = usage.cost ? parseFloat(usage.cost) : null;
      const tokens = parseInt(usage.tokens);

      if (cost !== null) {
        summaryCost += cost;
      }
      summaryToken += tokens;

      return {
        llmApiKeyId: usage.llm_api_key_id,
        tokens,
        cost,
        secretKey: key?.secretKey || "",
        provider: key?.provider || "",
      };
    });

    return { items, summaryCost, summaryToken };
  }
}
