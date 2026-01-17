# Test Documents for A/R 3-Way Matching

These PDFs are generated test documents for testing the A/R (Accounts Receivable) 3-way matching flow.

## Documents

1. **PO-2026-001.pdf** - Purchase Order (FROM Customer TO Supplier)
   - Date: 2026-01-10
   - Customer sends this PO to you

2. **DN-2026-001.pdf** - Delivery Note (FROM Supplier TO Customer)
   - Date: 2026-01-15
   - References: PO-2026-001
   - You deliver goods to customer

3. **INV-2026-001.pdf** - Invoice (FROM Supplier TO Customer)
   - Date: 2026-01-17 (current date)
   - Due Date: 2026-02-17
   - References: PO-2026-001, DN-2026-001
   - You invoice the customer

## Matching Data

All three documents have:
- **PO Number**: PO-2026-001 (referenced in DN and Invoice)
- **Line Items** (same in all 3):
  - Dell Laptop XPS 15 - Qty: 3, Price: SAR 4,500.00
  - Logitech MX Master 3 Mouse - Qty: 5, Price: SAR 350.00
  - Samsung 27" 4K Monitor - Qty: 2, Price: SAR 1,800.00
- **Totals**:
  - Subtotal: SAR 18,850.00
  - VAT (15%): SAR 2,827.50
  - **Total: SAR 21,677.50**

## Important Notes

⚠️ **Before using these documents:**

1. **Update Customer/Supplier Names**: The PDFs currently use placeholder names:
   - Customer: "Customer Company"
   - Supplier: "Your Company Name"

2. **Match Existing Records**: 
   - The OCR will extract company names from the PDFs
   - These names **must match** existing customers/suppliers in your database
   - Update `customerInfo` and `supplierInfo` in `scripts/generate-test-pdfs.ts` to match your actual data

3. **To Regenerate with Your Data**:
   ```bash
   # Edit scripts/generate-test-pdfs.ts
   # Update customerInfo and supplierInfo with your actual customer/supplier data
   npm run generate-test-pdfs
   ```

## Testing Flow

1. Upload **PO-2026-001.pdf** in the "Pending POs" tab
2. Upload **DN-2026-001.pdf** in the "3-Way Match" → "Delivery Notes" tab
3. Create an invoice from the PO (it should auto-fill with matching data)
4. Run 3-way matching - all three should match perfectly

## Dates

All dates are set to January 2026:
- PO Date: 2026-01-10
- DN Date: 2026-01-15
- Invoice Date: 2026-01-17 (current date)
- Due Date: 2026-02-17 (30 days from invoice date)
