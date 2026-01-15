-- =====================================================
-- Database Migration: Wafeq-Compatible Contact Fields
-- =====================================================
-- Run these queries in your Supabase SQL Editor
-- This matches Wafeq's exact contact creation structure
-- =====================================================

-- 1. Business and VAT Treatment (Required)
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS company_name TEXT, -- Required (same as name, but keeping for clarity)
ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Saudi Arabia',
ADD COLUMN IF NOT EXISTS tax_registration_number TEXT; -- VAT/Tax number

-- 2. Address Fields (Optional) - Matching Wafeq structure
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS street_address TEXT, -- Street address
ADD COLUMN IF NOT EXISTS building_number TEXT,
ADD COLUMN IF NOT EXISTS district TEXT,
ADD COLUMN IF NOT EXISTS address_additional_number TEXT,
ADD COLUMN IF NOT EXISTS postal_code TEXT;

-- 3. Invoicing Information (Optional)
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS contact_code TEXT, -- Code for invoicing
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS relationship TEXT, -- customer, supplier, both
ADD COLUMN IF NOT EXISTS payment_terms TEXT,
ADD COLUMN IF NOT EXISTS contact_id_type TEXT, -- ID type (national_id, commercial_registration, etc.)
ADD COLUMN IF NOT EXISTS id_number TEXT; -- ID number

-- 4. Contact Defaults - Selling (Optional)
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS default_revenue_account TEXT,
ADD COLUMN IF NOT EXISTS default_revenue_cost_center TEXT,
ADD COLUMN IF NOT EXISTS default_revenue_tax_rate TEXT;

-- 5. Contact Defaults - Purchasing (Optional)
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS default_expense_account TEXT,
ADD COLUMN IF NOT EXISTS default_expense_cost_center TEXT,
ADD COLUMN IF NOT EXISTS default_expense_tax_rate TEXT;

-- 6. Wafeq Integration Fields
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS wafeq_id TEXT,
ADD COLUMN IF NOT EXISTS wafeq_synced_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS wafeq_created_at TIMESTAMP WITH TIME ZONE;

-- 7. Legacy field mapping (for backward compatibility)
-- If you had 'name', we'll use it as company_name
-- If you had 'vat_number', we'll map it to tax_registration_number
DO $$
BEGIN
    -- Map existing name to company_name if company_name is null
    UPDATE customers 
    SET company_name = name 
    WHERE company_name IS NULL AND name IS NOT NULL;
    
    -- Map existing vat_number to tax_registration_number if tax_registration_number is null
    UPDATE customers 
    SET tax_registration_number = vat_number 
    WHERE tax_registration_number IS NULL AND vat_number IS NOT NULL;
    
    -- Map existing contact_type to relationship if relationship is null
    UPDATE customers 
    SET relationship = contact_type 
    WHERE relationship IS NULL AND contact_type IS NOT NULL;
END $$;

-- 8. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_wafeq_id ON customers(wafeq_id);
CREATE INDEX IF NOT EXISTS idx_customers_relationship ON customers(relationship);
CREATE INDEX IF NOT EXISTS idx_customers_company_id_relationship ON customers(company_id, relationship);
CREATE INDEX IF NOT EXISTS idx_customers_tax_registration ON customers(tax_registration_number);

-- 9. Set defaults for existing records
UPDATE customers 
SET country = 'Saudi Arabia' 
WHERE country IS NULL;

UPDATE customers 
SET relationship = 'customer' 
WHERE relationship IS NULL;

-- =====================================================
-- Optional: Create beneficiaries table for bank payments
-- =====================================================
CREATE TABLE IF NOT EXISTS contact_beneficiaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    bank_name TEXT,
    account_number TEXT,
    iban TEXT,
    swift_code TEXT,
    beneficiary_name TEXT,
    is_default BOOLEAN DEFAULT false,
    wafeq_beneficiary_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_beneficiaries_contact_id ON contact_beneficiaries(contact_id);
CREATE INDEX idx_beneficiaries_company_id ON contact_beneficiaries(company_id);

-- =====================================================
-- Verify the changes
-- =====================================================
-- Run this to see the updated table structure:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'customers'
-- ORDER BY ordinal_position;
