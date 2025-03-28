-- Create tables for tracking LLM API key token usage and costs
CREATE TABLE IF NOT EXISTS llm_api_key_usage
(
    id String,
    updated_at DateTime,
    llm_api_key_id String,
    tokens UInt64,
    cost Nullable(Decimal(18, 6)),
    _version UInt64 DEFAULT 1
)
ENGINE = ReplacingMergeTree(_version)
PRIMARY KEY (llm_api_key_id)
ORDER BY (llm_api_key_id)
TTL updated_at + INTERVAL 90 DAY;

-- Create table for tracking token usage history
CREATE TABLE IF NOT EXISTS total_usage_token
(
    id String,
    created_at DateTime,
    updated_at DateTime,
    llm_api_key_id String,
    tokens UInt64,
    cost Nullable(Decimal(18, 6)),
    _version UInt64 DEFAULT 1
)
ENGINE = ReplacingMergeTree(_version)
PRIMARY KEY (llm_api_key_id, id)
ORDER BY (llm_api_key_id, id, updated_at)
TTL updated_at + INTERVAL 180 DAY;
