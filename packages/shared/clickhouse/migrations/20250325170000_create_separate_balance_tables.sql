-- Create separate tables for balance tracking
CREATE TABLE IF NOT EXISTS current_balance (
    userId String,
    balance Float64,
    updatedAt DateTime64(3, 'UTC') DEFAULT now()
) ENGINE = ReplacingMergeTree()
ORDER BY (userId);

CREATE TABLE IF NOT EXISTS topup (
    id UUID,
    userId String,
    amount Float64,
    timestamp DateTime64(3, 'UTC') DEFAULT now(),
    description String,
    PRIMARY KEY (id)
) ENGINE = ReplacingMergeTree()
ORDER BY (id, timestamp);

CREATE TABLE IF NOT EXISTS totalUsage (
    id UUID,
    userId String,
    amount Float64,
    timestamp DateTime64(3, 'UTC') DEFAULT now(),
    description String,
    PRIMARY KEY (id)
) ENGINE = ReplacingMergeTree()
ORDER BY (id, timestamp);
