-- =====================================================
-- Database Migration: Add Optional Invoice Fields
-- =====================================================
-- Run these queries in your Supabase SQL Editor
-- This adds optional fields for invoices that are commonly used
-- =====================================================

-- Add optional invoice fields
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS reference TEXT,
ADD COLUMN IF NOT EXISTS purchase_order TEXT,
ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id),
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_invoices_purchase_order_id ON invoices(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_reference ON invoices(reference);

-- =====================================================
-- Note: If you prefer to keep these fields in extraction_data
-- (JSONB column), you don't need to run this migration.
-- The current code stores them in extraction_data, which works fine.
-- =====================================================
