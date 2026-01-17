# Finamina Frontend – Project State for LLM Context

**Purpose:** Hand this file to another LLM or developer so they can understand the project and continue work without full conversation history.

---

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19
- **Styling:** Tailwind CSS v4
- **Database / Auth:** Supabase (Auth, Postgres, RLS)
- **External APIs:** Wafeq (accounting/invoicing), n8n (webhooks, OCR, Lean sync), Lean (bank transactions, via n8n)
- **Deploy:** Vercel (frontend); n8n self‑hosted (e.g. Hetzner)

---

## Project Layout

```
app/
  api/
    ar/                    # A/R (Accounts Receivable)
      check-invoice-payment/   # Match bank_transactions to invoice, mark paid, set matched_invoice_id
      create-delivery-note/    # Create DN in DB, link to invoice (dn_id), optionally invoice_id in payload
      three-way-match/         # PO + DN + Invoice matching → ar_three_way_matches, ar_anomalies
      upload-delivery-note/    # Proxy to n8n webhook for DN PDF; then patch DN (context=ar, customer_id)
    wafeq/
      accounts, contacts, invoices, tax-rates
  dashboard/
    admin/                  # reset-demo-x7k9p2, testing-guide
    cashflow, contacts, customers, deliveries/create
    invoices/               # List, create, [id], [id]/edit
    procurement, reconciliation, suppliers, transactions
  login, signup, page.tsx (→ /dashboard or /login)
lib/
  supabase.ts              # Browser client (createBrowserClient)
  supabase-server.ts       # Server/admin client (createClient, SUPABASE_SERVICE_ROLE_KEY or anon)
  error-handling.ts, validation.ts, toast.tsx, customerRisk.ts
scripts/                   # Excluded from tsconfig; run with tsx
  generate-test-pdfs*.ts, list-customers-suppliers.ts, cleanup-test-data.ts
```

---

## Main Flows

### A/R (Sales / Invoices)

1. **Upload PO** (n8n) → `purchase_orders` (A/R: `customer_id` set).
2. **Create Invoice** (`/dashboard/invoices/create`): Wafeq + Supabase; links `po_id`; optional `customer_po_reference` in `extraction_data`.
3. **Create DN** (modal on `/dashboard/invoices` or `/dashboard/deliveries/create`): `POST /api/ar/create-delivery-note`. If `invoice_id` is sent, backend sets `invoices.dn_id`. DN uses `delivery_date`; `extraction_data.amount` from line items.
4. **Run 3‑Way Match** (Invoices → 3‑Way Match tab): `POST /api/ar/three-way-match` with `company_id`. Reads `invoices` with `po_id`, optionally `dn_id`; loads PO and DN; writes `ar_three_way_matches` and `ar_anomalies`; updates `invoices.match_status`.
5. **Check Payment Status** (invoice edit): `POST /api/ar/check-invoice-payment` with `invoice_id`. Finds matching `bank_transactions` (amount ±tolerance, credit, date window); sets `invoices.status=paid`, `paid_at`; sets `bank_transactions.matched_invoice_id`, `is_reconciled`.

### A/P (Procurement / Suppliers)

- Procurement: POs, DNs, 3‑way match (supplier).
- Suppliers: supplier invoices; uploads go to n8n.

### Reconciliation

- `bank_transactions` from Lean (via n8n). `matched_invoice_id` / `matched_supplier_invoice_id`; `reconciliation_matches` exists. Reconciliation page calls n8n `webhook/lean-reconciliation`.

---

## Database (Supabase) – Tables We Rely On

- **companies, users** (auth, company_id)
- **customers, suppliers**
- **invoices**: `company_id`, `customer_id`, `po_id`, `dn_id`, `amount`, `tax_amount`, `status`, `paid_at`, `match_status`, `extraction_data` (JSONB: `lineItems`, `customer_po_reference`, etc.), `wafeq_invoice_id`
- **purchase_orders**: `company_id`, `customer_id` (A/R), `supplier_id` (A/P), `po_number`, `amount`, `context` (optional)
- **po_line_items**
- **delivery_notes**: `company_id`, `customer_id`, `supplier_id` (NOT NULL in DB; A/R uses placeholder or `ALTER TABLE … DROP NOT NULL`), `po_id`, `dn_number`, `delivery_date`, `context`, `extraction_data` (e.g. `invoice_id`, `amount`)
- **dn_line_items**
- **ar_three_way_matches**: `company_id`, `po_id`, `invoice_id`, `dn_id` (optional), `customer_id`, `match_type` (2-way/3-way), `match_status` (perfect/partial/mismatch), `amount_discrepancy`
- **ar_anomalies**
- **bank_accounts, bank_transactions**: `lean_transaction_id`, `amount`, `transaction_date`, `credit_debit_indicator`, `matched_invoice_id`, `matched_supplier_invoice_id`, `is_reconciled`
- **reconciliation_matches**
- **supplier_invoices**, **three_way_matches**, **procurement_anomalies**, etc.

**Useful migration (if missing):**  
`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS dn_id UUID REFERENCES delivery_notes(id);`  
`ALTER TABLE delivery_notes ALTER COLUMN supplier_id DROP NOT NULL;` (for A/R DNs without supplier)

---

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (API routes, server; do not expose)
- `NEXT_PUBLIC_N8N_URL` (n8n base, e.g. `https://n8n.example.com`)
- `WAFEQ_API_KEY` (Wafeq)
- `PLACEHOLDER_SUPPLIER_ID_FOR_AR` (optional): UUID of a “dummy” supplier used as `supplier_id` for A/R DNs when `delivery_notes.supplier_id` is NOT NULL.

---

## N8n Webhooks (Used by the App)

- **Upload PO / DN / Supplier invoice:** app sends file + `company_id` (and for DN upload: `context=ar`) to n8n; n8n OCR and inserts into Postgres.
- **`/webhook/ar-three-way-check`:** `{ invoice_id }` – quality check PO/DN/Invoice (optional; we also have app-side 3‑way match).
- **`/webhook/check-invoice-payment`:** superseded by `/api/ar/check-invoice-payment` which uses `bank_transactions` in Supabase.
- **`/webhook/lean-reconciliation`:** `{ company_id }` – bulk Lean sync / reconciliation.
- **`/webhook/upload-delivery-note`:** DN PDF upload; `context` and `company_id` passed.

---

## Patterns in the Codebase

- **API routes:** Prefer `supabaseAdmin` from `@/lib/supabase-server` so RLS does not block.
- **`safeApiCall`** (from `@/lib/error-handling`): returns `{ success, data?, error? }`; use `result.data` for the actual API payload.
- **Toasts:** `useToast` from `@/lib/toast`; `validateFile`, `getErrorMessage`, `fetchWithTimeout` from `lib/`.
- **`useSearchParams`:** Wrap usage in `<Suspense>` where required by Next.js.

---

## Known Issues / Current State

1. **A/R 3‑Way Match returns “0 matches, 0 anomalies”**  
   - Requires: `invoices.po_id` not null; for 3‑way, `invoices.dn_id` set (create DN with “Link to Invoice” so backend can set `dn_id`).  
   - `purchase_orders` should have `customer_id` for A/R.  
   - If `invoices.dn_id` is missing, add the column and/or check that create-delivery-note runs the update and that the frontend sends `invoice_id`.

2. **DN table “Invalid Date”**  
   - Resolved by using `delivery_date` (and fallback `dn_date`) and `new Date((dn.delivery_date || dn.dn_date) as string).toLocaleDateString('en-CA')`.

3. **DN amount “-”**  
   - Backend stores `extraction_data.amount` from line items; UI uses `dn.amount || dn.extraction_data?.amount`.

4. **`delivery_notes.supplier_id` NOT NULL**  
   - A/R create-delivery-note uses `PLACEHOLDER_SUPPLIER_ID_FOR_AR` or the first company supplier; otherwise migration to make it nullable.

5. **`invoices.dn_id`**  
   - If the column is missing, create-DN’s invoice update fails; a warning is returned. Add the column if needed.

6. **n8n DN upload:**  
   - If `po_id` is `"undefined"` (string), n8n’s “Insert Delivery Note” can fail (UUID). See `N8N_WORKFLOW_FIX.md` for converting to NULL.

---

## Build and Deploy

- **Build:** `npm run build` (must pass for Vercel).  
- **Scripts:** `scripts/` is excluded from `tsconfig.json` to avoid PDFDocument/typed script errors; run with `tsx` (e.g. `npm run generate-test-pdfs`).
- **Deploy:**  
  - Frontend: Vercel; set env vars in the project.  
  - n8n: e.g. Hetzner Docker; configure CORS for the frontend origin; set `NEXT_PUBLIC_N8N_URL` accordingly.

---

## Demo / Testing

- **Reset demo:** `/dashboard/admin/reset-demo-x7k9p2` (TEST_COMPANY_ID: `22222222-2222-2222-2222-222222222222`).
- **Testing guide:** `/dashboard/admin/testing-guide`.
- **Sample PDFs:** `public/test-documents/`; `npm run generate-test-pdfs` or `generate-test-pdfs-with-data <customer_id> [supplier_id]`; `npm run list-customers` to get IDs.

---

## Summary for an LLM

You are working on **Finamina**, a Next.js + Supabase app for A/R, A/P, procurement, and reconciliation. It integrates with **Wafeq** (invoicing) and **n8n** (OCR, Lean, webhooks). A/R 3‑way matching (PO + DN + Invoice) and “Check Payment Status” (match to `bank_transactions` and mark invoice paid) are implemented in the app; n8n is used for uploads and Lean sync. The main open issue is **A/R 3‑way match producing 0 matches** when it should not; it is important to verify `invoices.po_id`, `invoices.dn_id`, `purchase_orders.customer_id`, and that create-delivery-note correctly links the invoice when `invoice_id` is provided.
