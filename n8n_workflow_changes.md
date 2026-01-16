# n8n Workflow Changes for A/R Support

## Changes needed for "Upload Delivery Note (A/P)" workflow to support A/R

### 1. "Find Matching PO" Node
**Current:** Only finds A/P POs (by supplier_id)
**Change:** Make it handle both A/P and A/R based on `context` parameter

**Replace the query with:**

```sql
-- Get context from webhook (default to 'ap' for backward compatibility)
WITH context_value AS (
  SELECT COALESCE(NULLIF('{{ $('Webhook').item.json.body.context }}', ''), 'ap') as ctx
)
SELECT 
  po.id as po_id, 
  po.po_number,
  po.supplier_id,
  -- Use COALESCE to handle case where customer_id column might not exist yet
  (SELECT customer_id FROM purchase_orders WHERE id = po.id) as customer_id,
  s.vat_number as supplier_vat,
  c.vat_number as customer_vat
FROM purchase_orders po
LEFT JOIN suppliers s ON po.supplier_id = s.id
LEFT JOIN customers c ON EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'purchase_orders' 
  AND column_name = 'customer_id'
) AND po.customer_id = c.id
CROSS JOIN context_value
WHERE po.company_id = '{{ $('Webhook').item.json.body.company_id }}'
AND (
  -- For A/P: match by supplier
  (context_value.ctx = 'ap' AND po.supplier_id IS NOT NULL AND (
    po.po_number = NULLIF('{{ $('Parse OCR output using Groq AI api').item.json.poNumber }}', 'undefined')
    OR s.vat_number = CASE 
      WHEN '{{ $('Parse OCR output using Groq AI api').item.json.supplierVAT }}' IN ('undefined', 'null', '', 'NO-VAT') 
      THEN 'NO-VAT' 
      ELSE '{{ $('Parse OCR output using Groq AI api').item.json.supplierVAT }}' 
    END
  ))
  -- For A/R: match by customer (only if customer_id column exists)
  OR (context_value.ctx = 'ar' AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'purchase_orders' AND column_name = 'customer_id'
  ) AND (
    SELECT customer_id FROM purchase_orders WHERE id = po.id
  ) IS NOT NULL AND (
    po.po_number = NULLIF('{{ $('Parse OCR output using Groq AI api').item.json.poNumber }}', 'undefined')
    OR c.vat_number = CASE 
      WHEN '{{ $('Parse OCR output using Groq AI api').item.json.supplierVAT }}' IN ('undefined', 'null', '', 'NO-VAT') 
      THEN 'NO-VAT' 
      ELSE '{{ $('Parse OCR output using Groq AI api').item.json.supplierVAT }}' 
    END
  ))
)
AND po.status IN ('pending', 'partial_delivered')
ORDER BY po.po_date DESC
LIMIT 1;
```

**OR, simpler version (if you run the migration first):**

```sql
-- Get context from webhook (default to 'ap' for backward compatibility)
WITH context_value AS (
  SELECT COALESCE(NULLIF('{{ $('Webhook').item.json.body.context }}', ''), 'ap') as ctx
)
SELECT 
  po.id as po_id, 
  po.po_number,
  po.supplier_id,
  po.customer_id,
  s.vat_number as supplier_vat,
  c.vat_number as customer_vat
FROM purchase_orders po
LEFT JOIN suppliers s ON po.supplier_id = s.id
LEFT JOIN customers c ON po.customer_id = c.id
CROSS JOIN context_value
WHERE po.company_id = '{{ $('Webhook').item.json.body.company_id }}'
AND (
  -- For A/P: match by supplier
  (context_value.ctx = 'ap' AND po.supplier_id IS NOT NULL AND (
    po.po_number = NULLIF('{{ $('Parse OCR output using Groq AI api').item.json.poNumber }}', 'undefined')
    OR s.vat_number = CASE 
      WHEN '{{ $('Parse OCR output using Groq AI api').item.json.supplierVAT }}' IN ('undefined', 'null', '', 'NO-VAT') 
      THEN 'NO-VAT' 
      ELSE '{{ $('Parse OCR output using Groq AI api').item.json.supplierVAT }}' 
    END
  ))
  -- For A/R: match by customer (using supplierVAT field to find customer VAT)
  OR (context_value.ctx = 'ar' AND po.customer_id IS NOT NULL AND (
    po.po_number = NULLIF('{{ $('Parse OCR output using Groq AI api').item.json.poNumber }}', 'undefined')
    OR c.vat_number = CASE 
      WHEN '{{ $('Parse OCR output using Groq AI api').item.json.supplierVAT }}' IN ('undefined', 'null', '', 'NO-VAT') 
      THEN 'NO-VAT' 
      ELSE '{{ $('Parse OCR output using Groq AI api').item.json.supplierVAT }}' 
    END
  ))
)
AND po.status IN ('pending', 'partial_delivered')
ORDER BY po.po_date DESC
LIMIT 1;
```

### 2. "Insert Delivery Note" Node
**Current:** Only creates supplier and sets supplier_id
**Change:** Handle both A/P (supplier) and A/R (customer) based on context

**Replace the entire query with:**

```sql
-- Get context from webhook (default to 'ap')
WITH context_value AS (
  SELECT COALESCE(NULLIF('{{ $('Webhook').item.json.body.context }}', ''), 'ap') as ctx
),
-- Create or find supplier (for A/P)
supplier_upsert AS (
  INSERT INTO suppliers (company_id, name, vat_number)
  VALUES (
    '{{ $('Webhook').item.json.body.company_id }}',
    COALESCE(NULLIF('{{ $('Parse OCR output using Groq AI api').item.json.supplierName }}', ''), 'Unknown Supplier'),
    CASE 
      WHEN '{{ $('Parse OCR output using Groq AI api').item.json.supplierVAT }}' IN ('undefined', 'null', '', 'NO-VAT') 
      THEN 'NO-VAT' 
      ELSE '{{ $('Parse OCR output using Groq AI api').item.json.supplierVAT }}' 
    END
  )
  ON CONFLICT (company_id, vat_number) 
  DO UPDATE SET name = EXCLUDED.name
  RETURNING id
),
supplier_data AS (
  SELECT id FROM supplier_upsert LIMIT 1
),
-- Create or find customer (for A/R)
customer_upsert AS (
  INSERT INTO customers (company_id, name, vat_number)
  VALUES (
    '{{ $('Webhook').item.json.body.company_id }}',
    COALESCE(NULLIF('{{ $('Parse OCR output using Groq AI api').item.json.supplierName }}', ''), 'Unknown Customer'),
    CASE 
      WHEN '{{ $('Parse OCR output using Groq AI api').item.json.supplierVAT }}' IN ('undefined', 'null', '', 'NO-VAT') 
      THEN 'NO-VAT' 
      ELSE '{{ $('Parse OCR output using Groq AI api').item.json.supplierVAT }}' 
    END
  )
  ON CONFLICT (company_id, vat_number) 
  DO UPDATE SET name = EXCLUDED.name
  RETURNING id
),
customer_data AS (
  SELECT id FROM customer_upsert LIMIT 1
),
-- Insert delivery note with context-aware fields
dn_insert AS (
  INSERT INTO delivery_notes (
    company_id,
    supplier_id,
    customer_id,
    context,
    po_id,
    dn_number,
    delivery_date,
    received_by,
    status,
    pdf_url,
    extraction_data
  )
  SELECT
    '{{ $('Webhook').item.json.body.company_id }}',
    CASE WHEN context_value.ctx = 'ap' THEN (SELECT id FROM supplier_data) ELSE NULL END,
    CASE WHEN context_value.ctx = 'ar' THEN (SELECT id FROM customer_data) ELSE NULL END,
    context_value.ctx,
    NULLIF('{{ $('Find Matching PO').item.json.po_id }}', '')::uuid,
    CASE 
      WHEN '{{ $('Parse OCR output using Groq AI api').item.json.dnNumber }}' IN ('undefined', 'null', '') 
      THEN 'DN-UNKNOWN' 
      ELSE '{{ $('Parse OCR output using Groq AI api').item.json.dnNumber }}' 
    END,
    CASE 
      WHEN '{{ $('Parse OCR output using Groq AI api').item.json.deliveryDate }}' IN ('undefined', 'null', '') 
      THEN CURRENT_DATE 
      ELSE '{{ $('Parse OCR output using Groq AI api').item.json.deliveryDate }}'::date 
    END,
    CASE 
      WHEN '{{ $('Parse OCR output using Groq AI api').item.json.receivedBy }}' IN ('undefined', 'null', '') 
      THEN NULL 
      ELSE '{{ $('Parse OCR output using Groq AI api').item.json.receivedBy }}' 
    END,
    'pending',
    '{{ $('Upload pdf into supabase').item.json.pdfUrl }}',
    '{{ JSON.stringify($('Parse OCR output using Groq AI api').item.json) }}'::jsonb
  FROM context_value
  RETURNING id, dn_number, delivery_date, status, context
)
SELECT * FROM dn_insert;
```

### 3. No changes needed for:
- Webhook node (already receives context)
- Convert binary file node
- Upload PDF node
- Google Document AI node
- Prepare prompt node
- Parse OCR node (works for both, extracts "supplierName" which can be customer name for A/R)
- Insert DN Line Items node
- Update PO Status node

## Summary of Changes:
1. ✅ **"Find Matching PO"**: Now searches by supplier_id (A/P) OR customer_id (A/R) based on context
2. ✅ **"Insert Delivery Note"**: 
   - Creates supplier OR customer based on context
   - Sets `context` field ('ap' or 'ar')
   - Sets `supplier_id` if A/P, `customer_id` if A/R
   - Sets the other to NULL

## Testing:
1. Upload A/P DN (without context or context='ap') → Should work as before
2. Upload A/R DN (with context='ar') → Should create customer, set customer_id, context='ar'
