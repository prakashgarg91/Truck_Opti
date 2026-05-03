-- Prevent duplicate invoice creation when payment verification paths replay the same provider transaction.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_subscription_id_razorpay_payment_id_key
ON public.invoices (subscription_id, razorpay_payment_id)
WHERE razorpay_payment_id IS NOT NULL;