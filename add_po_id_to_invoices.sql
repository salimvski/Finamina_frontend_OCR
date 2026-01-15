-- =====================================================
-- Add po_id column to invoices table
-- =====================================================
-- This allows invoices to be linked to purchase orders
-- Run this in your Supabase SQL Editor
-- =====================================================

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS po_id uuid REFERENCES public.purchase_orders(id);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_invoices_po_id ON public.invoices(po_id);
