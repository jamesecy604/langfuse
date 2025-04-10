ALTER TABLE totalUsage 
ADD COLUMN type Enum8('topup' = 1, 'refund' = 2, 'usage' = 3) DEFAULT 3
