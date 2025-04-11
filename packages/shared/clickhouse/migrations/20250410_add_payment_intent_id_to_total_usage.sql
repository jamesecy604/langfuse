-- Migration to add paymentIntentId column to totalUsage table
ALTER TABLE totalUsage
ADD COLUMN IF NOT EXISTS paymentIntentId Nullable(String)
COMMENT 'Stripe payment intent ID for tracking transactions';
