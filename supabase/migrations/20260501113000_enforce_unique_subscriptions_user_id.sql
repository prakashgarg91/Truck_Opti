-- The payment activation flow uses upsert(..., { onConflict: 'user_id' }) for subscriptions.
-- Enforce that contract at the database level and collapse any existing duplicate rows first.

WITH ranked_subscriptions AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'trial' THEN 1
          WHEN 'paused' THEN 2
          WHEN 'cancelled' THEN 3
          WHEN 'expired' THEN 4
          ELSE 5
        END,
        current_period_end DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS row_rank,
    FIRST_VALUE(id) OVER (
      PARTITION BY user_id
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'trial' THEN 1
          WHEN 'paused' THEN 2
          WHEN 'cancelled' THEN 3
          WHEN 'expired' THEN 4
          ELSE 5
        END,
        current_period_end DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS canonical_subscription_id
  FROM public.subscriptions
), duplicate_subscriptions AS (
  SELECT
    id AS duplicate_subscription_id,
    canonical_subscription_id
  FROM ranked_subscriptions
  WHERE row_rank > 1
)
UPDATE public.usage_tracking AS usage_tracking
SET subscription_id = duplicate_subscriptions.canonical_subscription_id
FROM duplicate_subscriptions
WHERE usage_tracking.subscription_id = duplicate_subscriptions.duplicate_subscription_id;

WITH ranked_subscriptions AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'trial' THEN 1
          WHEN 'paused' THEN 2
          WHEN 'cancelled' THEN 3
          WHEN 'expired' THEN 4
          ELSE 5
        END,
        current_period_end DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS row_rank,
    FIRST_VALUE(id) OVER (
      PARTITION BY user_id
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'trial' THEN 1
          WHEN 'paused' THEN 2
          WHEN 'cancelled' THEN 3
          WHEN 'expired' THEN 4
          ELSE 5
        END,
        current_period_end DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS canonical_subscription_id
  FROM public.subscriptions
), duplicate_subscriptions AS (
  SELECT
    id AS duplicate_subscription_id,
    canonical_subscription_id
  FROM ranked_subscriptions
  WHERE row_rank > 1
)
UPDATE public.invoices AS invoices
SET subscription_id = duplicate_subscriptions.canonical_subscription_id
FROM duplicate_subscriptions
WHERE invoices.subscription_id = duplicate_subscriptions.duplicate_subscription_id;

WITH ranked_subscriptions AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'trial' THEN 1
          WHEN 'paused' THEN 2
          WHEN 'cancelled' THEN 3
          WHEN 'expired' THEN 4
          ELSE 5
        END,
        current_period_end DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS row_rank,
    FIRST_VALUE(id) OVER (
      PARTITION BY user_id
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'trial' THEN 1
          WHEN 'paused' THEN 2
          WHEN 'cancelled' THEN 3
          WHEN 'expired' THEN 4
          ELSE 5
        END,
        current_period_end DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS canonical_subscription_id
  FROM public.subscriptions
), duplicate_subscriptions AS (
  SELECT
    id AS duplicate_subscription_id,
    canonical_subscription_id
  FROM ranked_subscriptions
  WHERE row_rank > 1
)
UPDATE public.addon_purchases AS addon_purchases
SET subscription_id = duplicate_subscriptions.canonical_subscription_id
FROM duplicate_subscriptions
WHERE addon_purchases.subscription_id = duplicate_subscriptions.duplicate_subscription_id;

WITH ranked_subscriptions AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'trial' THEN 1
          WHEN 'paused' THEN 2
          WHEN 'cancelled' THEN 3
          WHEN 'expired' THEN 4
          ELSE 5
        END,
        current_period_end DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS row_rank,
    FIRST_VALUE(id) OVER (
      PARTITION BY user_id
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'trial' THEN 1
          WHEN 'paused' THEN 2
          WHEN 'cancelled' THEN 3
          WHEN 'expired' THEN 4
          ELSE 5
        END,
        current_period_end DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS canonical_subscription_id
  FROM public.subscriptions
), duplicate_subscriptions AS (
  SELECT
    id AS duplicate_subscription_id,
    canonical_subscription_id
  FROM ranked_subscriptions
  WHERE row_rank > 1
)
UPDATE public.payment_history AS payment_history
SET subscription_id = duplicate_subscriptions.canonical_subscription_id
FROM duplicate_subscriptions
WHERE payment_history.subscription_id = duplicate_subscriptions.duplicate_subscription_id;

WITH ranked_subscriptions AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'trial' THEN 1
          WHEN 'paused' THEN 2
          WHEN 'cancelled' THEN 3
          WHEN 'expired' THEN 4
          ELSE 5
        END,
        current_period_end DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS row_rank
  FROM public.subscriptions
)
DELETE FROM public.subscriptions AS subscriptions
USING ranked_subscriptions
WHERE subscriptions.id = ranked_subscriptions.id
  AND ranked_subscriptions.row_rank > 1;

DROP INDEX IF EXISTS public.idx_subscriptions_user_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND conname = 'subscriptions_user_id_key'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
  END IF;
END $$;