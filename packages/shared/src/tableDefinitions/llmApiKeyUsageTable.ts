import { UiColumnMappings } from "./types";

export const llmApiKeyUsageTableUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "API Key",
    uiTableId: "display_secret_key",
    clickhouseTableName: "total_usage_token",
    clickhouseSelect: "llm_api_key_id",
  },
  {
    uiTableName: "Tokens",
    uiTableId: "tokens",
    clickhouseTableName: "total_usage_token",
    clickhouseSelect: "tokens",
  },
  {
    uiTableName: "Cost",
    uiTableId: "cost",
    clickhouseTableName: "total_usage_token",
    clickhouseSelect: "cost",
  },

  {
    uiTableName: "Timestamp",
    uiTableId: "timestamp",
    clickhouseTableName: "total_usage_token",
    clickhouseSelect: "created_at",
  },
];
