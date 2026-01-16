-- =====================================================
-- Database Migration: 3-Way Matching for A/R (Accounts Receivable)
-- =====================================================
-- This migration adds support for 3-way matching in A/R context
-- A/R 3-way matching: Customer PO + Delivery Note + Invoice
-- =====================================================

-- 1. Add customer_id to delivery_notes table for A/R support
-- Currently, delivery_notes only have supplier_id (for A/P)
-- We need customer_id to link DNs to customer POs (for A/R)
ALTER TABLE public.delivery_notes
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_delivery_notes_customer_id ON public.delivery_notes(customer_id);

-- Add index for filtering by context (A/P vs A/R)
CREATE INDEX IF NOT EXISTS idx_delivery_notes_supplier_id ON public.delivery_notes(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_notes_customer_id ON public.delivery_notes(customer_id) WHERE customer_id IS NOT NULL;

-- 2. Add context/type field to delivery_notes to distinguish A/P from A/R
-- This helps identify whether a DN is for A/P (supplier) or A/R (customer)
ALTER TABLE public.delivery_notes
ADD COLUMN IF NOT EXISTS context TEXT CHECK (context IN ('ap', 'ar')) DEFAULT 'ap';

-- Update existing records: if supplier_id exists, set context to 'ap'
UPDATE public.delivery_notes
SET context = 'ap'
WHERE context IS NULL AND supplier_id IS NOT NULL;

-- 3. Add dn_id to invoices table to link invoices to delivery notes (for A/R)
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS dn_id UUID REFERENCES public.delivery_notes(id);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_invoices_dn_id ON public.invoices(dn_id);

-- 4. Create table for A/R 3-way matches
-- Similar to three_way_matches but for Accounts Receivable
CREATE TABLE IF NOT EXISTS public.ar_three_way_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    po_id UUID NOT NULL REFERENCES public.purchase_orders(id),
    dn_id UUID REFERENCES public.delivery_notes(id),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id),
    customer_id UUID NOT NULL REFERENCES public.customers(id),
    
    -- Match status
    match_status TEXT CHECK (match_status IN ('perfect', 'partial', 'mismatch')) DEFAULT 'partial',
    match_type TEXT CHECK (match_type IN ('2-way', '3-way')) DEFAULT '2-way',
    
    -- Matching details
    po_amount NUMERIC(15, 2),
    dn_amount NUMERIC(15, 2),
    invoice_amount NUMERIC(15, 2),
    
    -- Discrepancy tracking
    amount_discrepancy NUMERIC(15, 2) DEFAULT 0,
    quantity_discrepancy NUMERIC(15, 2) DEFAULT 0,
    item_count_discrepancy INTEGER DEFAULT 0,
    
    -- Notes and metadata
    discrepancy_notes TEXT,
    match_score NUMERIC(5, 2) DEFAULT 0, -- 0-100 score of how well documents match
    matched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    matched_by UUID REFERENCES public.users(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_ar_3way_matches_company_id ON public.ar_three_way_matches(company_id);
CREATE INDEX IF NOT EXISTS idx_ar_3way_matches_po_id ON public.ar_three_way_matches(po_id);
CREATE INDEX IF NOT EXISTS idx_ar_3way_matches_dn_id ON public.ar_three_way_matches(dn_id);
CREATE INDEX IF NOT EXISTS idx_ar_3way_matches_invoice_id ON public.ar_three_way_matches(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ar_3way_matches_customer_id ON public.ar_three_way_matches(customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_3way_matches_match_status ON public.ar_three_way_matches(match_status);
CREATE INDEX IF NOT EXISTS idx_ar_3way_matches_match_type ON public.ar_three_way_matches(match_type);

-- 5. Create table for A/R anomalies (similar to procurement_anomalies for A/P)
CREATE TABLE IF NOT EXISTS public.ar_anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id),
    
    -- Related documents
    po_id UUID REFERENCES public.purchase_orders(id),
    dn_id UUID REFERENCES public.delivery_notes(id),
    invoice_id UUID REFERENCES public.invoices(id),
    
    -- Anomaly details
    anomaly_type TEXT NOT NULL CHECK (anomaly_type IN (
        'amount_mismatch',
        'quantity_mismatch',
        'item_mismatch',
        'price_mismatch',
        'missing_dn',
        'missing_invoice',
        'date_mismatch',
        'other'
    )),
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
    status TEXT CHECK (status IN ('open', 'investigating', 'resolved', 'ignored')) DEFAULT 'open',
    
    -- Discrepancy details
    expected_value TEXT, -- JSON or text description
    actual_value TEXT,   -- JSON or text description
    discrepancy_amount NUMERIC(15, 2),
    
    -- Resolution
    resolution_notes TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES public.users(id),
    
    -- Metadata
    description TEXT,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_ar_anomalies_company_id ON public.ar_anomalies(company_id);
CREATE INDEX IF NOT EXISTS idx_ar_anomalies_customer_id ON public.ar_anomalies(customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_anomalies_po_id ON public.ar_anomalies(po_id);
CREATE INDEX IF NOT EXISTS idx_ar_anomalies_dn_id ON public.ar_anomalies(dn_id);
CREATE INDEX IF NOT EXISTS idx_ar_anomalies_invoice_id ON public.ar_anomalies(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ar_anomalies_status ON public.ar_anomalies(status);
CREATE INDEX IF NOT EXISTS idx_ar_anomalies_severity ON public.ar_anomalies(severity);
CREATE INDEX IF NOT EXISTS idx_ar_anomalies_anomaly_type ON public.ar_anomalies(anomaly_type);

-- 6. Add match_status to invoices table (similar to supplier_invoices)
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS match_status TEXT CHECK (match_status IN ('unmatched', 'po_matched', 'dn_matched', 'full_matched')) DEFAULT 'unmatched';

-- Add index for filtering
CREATE INDEX IF NOT EXISTS idx_invoices_match_status ON public.invoices(match_status);

-- 7. Optional: Add context field to purchase_orders for clarity
-- This helps identify if a PO is from a customer (A/R) or to a supplier (A/P)
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

-- =====================================================
-- Summary of Changes:
-- =====================================================
-- 1. delivery_notes: Added customer_id and context fields
-- 2. invoices: Added dn_id and match_status fields
-- 3. purchase_orders: Added context field (optional, for clarity)
-- 4. Created ar_three_way_matches table for A/R matching
-- 5. Created ar_anomalies table for A/R anomaly detection
-- =====================================================
-- 
-- Usage:
-- - A/P: PO (supplier_id) + DN (supplier_id) + Supplier Invoice
-- - A/R: PO (customer_id) + DN (customer_id) + Invoice (customer_id)
-- =====================================================
