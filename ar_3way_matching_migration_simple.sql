-- =====================================================
-- Simple Migration: A/R 3-Way Matching Support (MVP)
-- =====================================================
-- This is a minimal migration for MVP - just adds context to differentiate A/R vs A/P
-- Uses same tables, just adds a context column
-- =====================================================

-- 1. Add customer_id to delivery_notes (if it doesn't exist)
-- This allows DNs to be linked to customers for A/R
ALTER TABLE public.delivery_notes
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id);

-- 2. Add context field to delivery_notes to distinguish A/P from A/R
-- 'ap' = Accounts Payable (supplier), 'ar' = Accounts Receivable (customer)
ALTER TABLE public.delivery_notes
ADD COLUMN IF NOT EXISTS context TEXT CHECK (context IN ('ap', 'ar')) DEFAULT 'ap';

-- Update existing records: if supplier_id exists, set context to 'ap'
-- Only update if context is NULL (to avoid overwriting)
UPDATE public.delivery_notes
SET context = 'ap'
WHERE context IS NULL AND supplier_id IS NOT NULL;

-- 3. Add dn_id to invoices to link invoices to delivery notes (for A/R)
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS dn_id UUID REFERENCES public.delivery_notes(id);

-- 4. Add match_status to invoices (similar to supplier_invoices)
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS match_status TEXT CHECK (match_status IN ('unmatched', 'po_matched', 'dn_matched', 'full_matched')) DEFAULT 'unmatched';

-- 5. Create simple A/R matches table (minimal for MVP)
CREATE TABLE IF NOT EXISTS public.ar_three_way_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    po_id UUID NOT NULL REFERENCES public.purchase_orders(id),
    dn_id UUID REFERENCES public.delivery_notes(id),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id),
    customer_id UUID NOT NULL REFERENCES public.customers(id),
    
    -- Simple match status
    match_status TEXT CHECK (match_status IN ('perfect', 'partial', 'mismatch')) DEFAULT 'partial',
    match_type TEXT CHECK (match_type IN ('2-way', '3-way')) DEFAULT '2-way',
    
    -- Basic discrepancy tracking
    amount_discrepancy NUMERIC(15, 2) DEFAULT 0,
    discrepancy_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ar_3way_matches_company_id ON public.ar_three_way_matches(company_id);
CREATE INDEX IF NOT EXISTS idx_ar_3way_matches_invoice_id ON public.ar_three_way_matches(invoice_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_customer_id ON public.delivery_notes(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_notes_context ON public.delivery_notes(context);
CREATE INDEX IF NOT EXISTS idx_invoices_dn_id ON public.invoices(dn_id);
CREATE INDEX IF NOT EXISTS idx_invoices_match_status ON public.invoices(match_status);

-- 6. Add customer_id to purchase_orders (if it doesn't exist)
-- This allows POs to be linked to customers for A/R
ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_purchase_orders_customer_id ON public.purchase_orders(customer_id) WHERE customer_id IS NOT NULL;

-- 7. Add context field to purchase_orders for clarity (optional)
ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS context TEXT CHECK (context IN ('ap', 'ar'));

-- Update existing records based on supplier_id vs customer_id
UPDATE public.purchase_orders
SET context = 'ap'
WHERE context IS NULL AND supplier_id IS NOT NULL;

UPDATE public.purchase_orders
SET context = 'ar'
WHERE context IS NULL AND customer_id IS NOT NULL;

-- Add index
CREATE INDEX IF NOT EXISTS idx_purchase_orders_context ON public.purchase_orders(context);

-- 8. Create simple A/R anomalies table (minimal for MVP)
CREATE TABLE IF NOT EXISTS public.ar_anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id),
    po_id UUID REFERENCES public.purchase_orders(id),
    dn_id UUID REFERENCES public.delivery_notes(id),
    invoice_id UUID REFERENCES public.invoices(id),
    
    -- Simple anomaly tracking
    anomaly_type TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('low', 'medium', 'high')) DEFAULT 'medium',
    status TEXT CHECK (status IN ('open', 'resolved')) DEFAULT 'open',
    description TEXT,
    discrepancy_amount NUMERIC(15, 2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ar_anomalies_company_id ON public.ar_anomalies(company_id);
CREATE INDEX IF NOT EXISTS idx_ar_anomalies_status ON public.ar_anomalies(status);

-- =====================================================
-- Summary:
-- =====================================================
-- 1. delivery_notes: Added customer_id and context ('ap' or 'ar')
-- 2. invoices: Added dn_id and match_status
-- 3. purchase_orders: Added customer_id and context ('ap' or 'ar')
-- 4. Created ar_three_way_matches (simple version)
-- 5. Created ar_anomalies (simple version)
-- =====================================================
-- 
-- Usage:
-- - A/P: DN with supplier_id + context='ap'
-- - A/R: DN with customer_id + context='ar'
-- =====================================================
