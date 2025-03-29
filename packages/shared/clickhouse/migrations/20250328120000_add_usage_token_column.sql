-- Migration to add total_usage_token column and update materialized view
-- Supports filtering by date range while maintaining individual request tracking

/*
Usage Guidelines:
- tokens column: Use for tracking individual request token counts
- total_usage_token column: Use for aggregated token usage with date range filtering
*/

-- Add new column for aggregated token usage (defaults to tokens for backward compatibility)
ALTER TABLE llm_api_key_usage
ADD COLUMN IF NOT EXISTS total_usage_token UInt64 DEFAULT tokens;

-- Update materialized view to support both use cases
CREATE MATERIALIZED VIEW IF NOT EXISTS llm_api_key_usage_by_secret
ENGINE = SummingMergeTree()
ORDER BY (llm_api_key_id, toDate(updated_at))
AS SELECT
    llm_api_key_id,
    toDate(updated_at) AS date,
    sum(tokens) AS tokens,  -- Individual request tokens
    sum(total_usage_token) AS total_usage_token,  -- Aggregated usage for filtering
    sum(cost) AS cost,
    count() AS requests
FROM llm_api_key_usage
GROUP BY llm_api_key_id, date;

-- Create indexes for performance
ALTER TABLE llm_api_key_usage
ADD INDEX idx_llm_api_key_id llm_api_key_id TYPE bloom_filter GRANULARITY 3,
ADD INDEX idx_updated_at updated_at TYPE minmax GRANULARITY 3;
