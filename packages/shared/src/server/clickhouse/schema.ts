export const ClickhouseTableNames = {
  traces: "traces",
  observations: "observations",
  scores: "scores",
  total_usage_token: "total_usage_token",
} as const;

export type ClickhouseTableName = keyof typeof ClickhouseTableNames;
