# Test PDF Generation Scripts

These scripts help you generate test PDFs for A/R 3-way matching with **real customer/supplier data** from your database.

## Quick Start

### Step 1: List Your Customers and Suppliers

First, see what customers and suppliers you have in your database:

```bash
npm run list-customers
```

This will show you:
- All customers with their IDs, names, VAT numbers, etc.
- All suppliers with their IDs, names, VAT numbers, etc.
- Your companies

**Copy the IDs** of the customer and supplier you want to use for testing.

### Step 2: Generate PDFs with Real Data

Use the customer and supplier IDs to generate PDFs:

```bash
npm run generate-test-pdfs-with-data <customer_id> <supplier_id>
```

**Example:**
```bash
npm run generate-test-pdfs-with-data abc123-def456-ghi789 xyz789-abc123-def456
```

This will generate 3 PDFs in `public/test-documents/`:
- `PO-2026-001.pdf` - Purchase Order (FROM customer TO supplier)
- `DN-2026-001.pdf` - Delivery Note (FROM supplier TO customer)
- `INV-2026-001.pdf` - Invoice (FROM supplier TO customer)

All PDFs will use **real data** from your database, so the OCR will correctly match them to existing records.

## Alternative: Manual Update

If you prefer to manually update the script:

1. Open `scripts/generate-test-pdfs.ts`
2. Update `customerInfo` with real customer data
3. Update `supplierInfo` with real supplier data
4. Run: `npm run generate-test-pdfs`

## Requirements

Make sure you have `.env.local` file with:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
# OR use service role key for full access:
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## What Gets Generated

All three PDFs will have:
- **Matching PO Number**: PO-2026-001
- **Same Line Items**: 3 items with same quantities and prices
- **Same Totals**: SAR 21,677.50
- **Real Company Data**: From your database
- **Current Dates**: January 2026 (invoice date = Jan 17, 2026)

## Testing Flow

1. Upload `PO-2026-001.pdf` in the "Pending POs" tab
2. Upload `DN-2026-001.pdf` in the "3-Way Match" → "Delivery Notes" tab
3. Create an invoice from the PO (it should auto-fill with matching data)
4. Run 3-way matching - all three should match perfectly!
