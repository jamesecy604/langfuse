import { commandClickhouse, queryClickhouse } from "./clickhouse";
import {
  createLLMApiKeyUsageFilterFromFilterState,
  getLLMApiKeyDefaultFilter,
} from "../queries/clickhouse-sql/factory";
import { FilterState } from "../../types";
import { FilterList } from "../queries/clickhouse-sql/clickhouse-filter";
import { clickhouseLLMApiKeySearchCondition } from "../queries/clickhouse-sql/search";
import { llmApiKeyUsageTableUiColumnDefinitions } from "../../tableDefinitions/llmApiKeyUsageTable";

export const getLLMApiKeyMetrics = async (
  llmApiKeyIds: string[],
  filter: FilterState,
) => {
  if (llmApiKeyIds.length === 0) {
    return [];
  }

  const { usageFilter } = getLLMApiKeyDefaultFilter({
    tracesPrefix: "t",
  });

  usageFilter.push(
    ...createLLMApiKeyUsageFilterFromFilterState(
      filter,
      llmApiKeyUsageTableUiColumnDefinitions,
    ),
  );

  const chFilterRes = usageFilter.apply();

  const query = `
      SELECT 
        llm_api_key_id,
        sum(tokens) as tokens,
        sum(cost) as cost
      FROM total_usage_token
      WHERE llm_api_key_id IN ({llmApiKeyIds: Array(String)})
      ${chFilterRes.query ? `AND ${chFilterRes.query}` : ""}
      GROUP BY llm_api_key_id
    `;

  const rows = await queryClickhouse<{
    llm_api_key_id: string;
    tokens: string;
    cost: string | null;
  }>({
    query,
    params: {
      llmApiKeyIds,
      ...chFilterRes.params,
    },
    tags: {
      feature: "usage",
      type: "llm_api_key",
      kind: "metrics",
    },
  });

  return rows.map((row) => ({
    llmApiKeyId: row.llm_api_key_id,
    tokens: parseInt(row.tokens),
    cost: row.cost ? parseFloat(row.cost) : null,
  }));
};

export const getUsageGroupedByLLMApiKeys = async (
  filter: FilterState,
  searchQuery?: string,
  limit?: number,
  offset?: number,
) => {
  const chFilter = new FilterList(
    filter.length > 0
      ? createLLMApiKeyUsageFilterFromFilterState(
          filter,
          llmApiKeyUsageTableUiColumnDefinitions,
        )
      : [],
  );
  const chFilterRes =
    filter.length > 0 ? chFilter.apply() : { query: "", params: {} };
  const search = clickhouseLLMApiKeySearchCondition(searchQuery);

  const query = `
      SELECT 
        llm_api_key_id,
        sum(tokens) as tokens,
        sum(cost) as cost
      FROM total_usage_token
      WHERE llm_api_key_id IS NOT NULL
      AND llm_api_key_id != ''
      ${chFilterRes.query ? `AND ${chFilterRes.query}` : ""}
      ${search.query}
      GROUP BY llm_api_key_id
      ORDER BY tokens DESC
      ${limit !== undefined ? `LIMIT {limit: Int32}` : ""}
      ${offset !== undefined ? `OFFSET {offset: Int32}` : ""}
    `;

  const rows = await queryClickhouse<{
    llm_api_key_id: string;
    tokens: string;
    cost: string | null;
  }>({
    query,
    params: {
      limit,
      offset,
      ...chFilterRes.params,
      ...search.params,
    },
    tags: {
      feature: "usage",
      type: "llm_api_key",
      kind: "grouped",
    },
  });

  return rows.map((row) => ({
    llmApiKeyId: row.llm_api_key_id,
    tokens: parseInt(row.tokens),
    cost: row.cost ? parseFloat(row.cost) : null,
  }));
};

export const getTotalLLMApiKeyCount = async (
  filter: FilterState,
  searchQuery?: string,
): Promise<{ totalCount: number }> => {
  const chFilter = new FilterList(
    filter.length > 0
      ? createLLMApiKeyUsageFilterFromFilterState(
          filter,
          llmApiKeyUsageTableUiColumnDefinitions,
        )
      : [],
  );
  const chFilterRes =
    filter.length > 0 ? chFilter.apply() : { query: "", params: {} };
  const search = clickhouseLLMApiKeySearchCondition(searchQuery);

  const query = `
      SELECT COUNT(DISTINCT llm_api_key_id) as totalCount
      FROM total_usage_token
      WHERE llm_api_key_id IS NOT NULL
      AND llm_api_key_id != ''
      ${chFilterRes.query ? `AND ${chFilterRes.query}` : ""}
      ${search.query}
    `;

  const rows = await queryClickhouse<{ totalCount: string }>({
    query,
    params: {
      ...chFilterRes.params,
      ...search.params,
    },
    tags: {
      feature: "usage",
      type: "llm_api_key",
      kind: "count",
    },
  });

  return {
    totalCount: rows.length > 0 ? parseInt(rows[0].totalCount) : 0,
  };
};

export const hasAnyLLMApiKey = async () => {
  const query = `
      SELECT 1
      FROM total_usage_token
      WHERE llm_api_key_id IS NOT NULL
      AND llm_api_key_id != ''
      LIMIT 1
    `;

  const rows = await queryClickhouse<{ 1: number }>({
    query,
    tags: {
      feature: "usage",
      type: "llm_api_key",
      kind: "hasAny",
    },
  });

  return rows.length > 0;
};
