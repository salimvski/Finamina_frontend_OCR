# Backend Specification: FastAPI Replacement for n8n

This document describes what you need to build in **FastAPI** (or any backend) to replace the current **n8n** workflows. Once implemented, the frontend will call your FastAPI base URL instead of `NEXT_PUBLIC_N8N_URL`.

---

## Wafeq: Handled by the Frontend (Not Replaced by FastAPI)

**Wafeq** is the accounting/invoicing platform (contacts, sales invoices, accounts, tax rates). It is **fully integrated from the frontend** via Next.js API routes that proxy to Wafeq using `WAFEQ_API_KEY`. Your FastAPI backend does **not** need to implement or replace any Wafeq functionality.

| What | Where | Notes |
|------|--------|--------|
| **Contacts** (customers/suppliers) | `POST/GET /api/wafeq/contacts`, `GET/PUT/DELETE /api/wafeq/contacts/[wafeqId]` | Create, list, update, delete in Wafeq; frontend keeps Supabase `customers` in sync with `wafeq_id`. |
| **Invoices** (sales) | `POST/GET /api/wafeq/invoices`, `GET/PATCH /api/wafeq/invoices/[wafeqId]` | Create and update sales invoices in Wafeq; frontend also writes to Supabase `invoices` with `wafeq_invoice_id`. |
| **Accounts** | `GET /api/wafeq/accounts` | Used for invoice line-item account dropdowns. |
| **Tax rates** | `GET /api/wafeq/tax-rates` | Used for invoice line-item tax dropdowns. |
| **Purchase orders in Wafeq** | `POST /api/wafeq/purchase-orders` | API route exists but **is not used** by the UI today. |

**PO creation in the app:**

- **Customer POs (A/R):** User uploads a PDF → n8n/FastAPI does OCR → row is inserted into **Supabase** `customer_purchase_orders` only. No Wafeq.
- **A/P POs (manual “Create PO”):** User fills the form → row is inserted into **Supabase** `purchase_orders` (and `po_line_items`) only. The frontend does **not** call Wafeq to create a PO.
- **A/P POs (upload PDF):** User uploads a PDF → n8n/FastAPI does OCR → row is inserted into **Supabase** `purchase_orders` only. No Wafeq.

So all PO creation (customer PO, manual A/P PO, uploaded A/P PO) is **Supabase-only**. Wafeq is used for **contacts** and **sales invoices** (and optionally accounts/tax rates); the frontend keeps handling that with `WAFEQ_API_KEY` in the Next.js app. Your backend only needs Supabase (+ OCR + Lean for the endpoints below).

---

## 1. Overview: What n8n Does Today

| Frontend action | Current n8n webhook | Purpose |
|-----------------|---------------------|---------|
| Upload Customer PO (A/R) | `POST /webhook/upload-customer-po` | OCR PDF → insert `customer_purchase_orders` |
| Upload Purchase Order (A/P or A/R) | `POST /webhook/upload-purchase-order` | OCR PDF → insert `purchase_orders` |
| Upload Delivery Note | `POST /webhook/upload-delivery-note` | OCR PDF → insert `delivery_notes` |
| Upload Supplier Invoice | `POST /webhook/upload-supplier-invoice` | OCR PDF → insert `supplier_invoices` |
| A/R 3-way quality check (invoice edit) | `POST /webhook/ar-three-way-check` | Compare PO / DN / Invoice; return warnings |
| Lean reconciliation (fetch bank txns) | `POST /webhook/lean-reconciliation` | Sync with Lean API → `bank_transactions` |
| A/P 3-way match run | `POST /webhook/run-three-way-match` | Match PO / DN / Supplier invoice |
| Reconcile suppliers | `POST /webhook/reconcile-suppliers` | Supplier reconciliation (optional) |

**Note:** “Check Payment Status” for customer invoices is **not** in n8n; it is already implemented in the Next.js app at `POST /api/check-invoice-payment` (uses Supabase `bank_transactions`). No backend replacement needed for that.

---

## 2. Environment / Config Your Backend Needs

- **Supabase**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or equivalent) to read/write tables.
- **Lean API** (only for lean-reconciliation): API key / base URL for fetching bank transactions.
- **OCR**: Either an external OCR/LLM API (e.g. OpenAI, Google Document AI, or a dedicated document API) or your own model. The frontend only sends the file; your backend does the extraction.

The frontend will be configured with a single base URL (e.g. `NEXT_PUBLIC_BACKEND_URL=https://api.yourdomain.com`). All paths below are relative to that base.

---

## 3. API Contract: Document Upload Endpoints

The frontend sends **multipart/form-data** with:

- `data` — file (PDF or image: JPEG, PNG). Max size 10MB.
- `company_id` — UUID string (required for all).
- For Delivery Note only: `context` — string, typically `"ar"` for A/R.

Responses:

- **Success:** `200` with JSON body (see each endpoint). For uploads that create a single record, returning the created row (or `id`, `po_number`, etc.) allows the frontend to show immediate feedback.
- **Error:** `4xx` / `5xx` with JSON `{ "success": false, "error": "message" }` or `{ "error": "message" }`. The frontend shows `error` to the user.

---

### 3.1. Upload Customer PO (A/R)

**Request**

- `POST /webhook/upload-customer-po` (or e.g. `POST /api/upload/customer-po` if you prefer)
- Form: `data` (file), `company_id` (string)

**What to do**

1. Validate file (PDF/image, size ≤ 10MB) and `company_id`.
2. Run OCR on the PDF/image to extract at least:
   - PO number, date, currency, total amount
   - Buyer/customer name (company name) — used to match to `customers` (e.g. by `company_name` or `name`).
3. Optionally: line items (description, quantity, unit price, amount).
4. Resolve **customer_id**:
   - Match extracted buyer/company name to `customers` (e.g. `company_name` or `name`, case-insensitive) for the same `company_id` (if your schema links customers to company).
   - If no match: insert can use `customer_id = null` or create a placeholder customer; the frontend can still show the PO and match by name later.
5. Insert one row into **`customer_purchase_orders`** with at least:
   - `company_id`, `customer_id` (or null), `po_number`, `po_date`, `amount`, `currency`, `status` (e.g. `'pending'`).
   - Optional: `expected_delivery_date`, line items in a JSON/JSONB column if you have one.

**Response (success)**

Return JSON the frontend can use for polling or display, e.g.:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "po_number": "PO-ZAMEL-2026-001",
    "customer_id": "uuid-or-null",
    "amount": "75325.00",
    "currency": "SAR"
  }
}
```

Or at minimum: `{ "success": true, "data": { "po_number": "..." } }`. Frontend may poll Supabase for the new PO by `po_number` or `created_at`.

---

### 3.2. Upload Purchase Order (A/P or A/R)

**Request**

- `POST /webhook/upload-purchase-order`
- Form: `data` (file), `company_id` (string)

**What to do**

1. Validate file and `company_id`.
2. OCR: extract PO number, date, amounts, buyer name, supplier name (if present), line items.
3. Resolve:
   - **customer_id** (A/R): match buyer name to `customers` for this company.
   - **supplier_id** (A/P): match supplier name to `suppliers` for this company.
4. Insert into **`purchase_orders`** with:
   - `company_id`, `customer_id` and/or `supplier_id` (as appropriate), `po_number`, `amount`, `currency`, `context` (e.g. `'ar'` or `'ap'`), etc.
   - Line items into **`po_line_items`** if that table exists.

**Response**

- `200` + `{ "success": true, "message": "Purchase order uploaded successfully" }` (or include created `id` / `po_number` in `data`).

---

### 3.3. Upload Delivery Note

**Request**

- `POST /webhook/upload-delivery-note`
- Form: `data` (file), `company_id` (string), `context` (string, default `"ar"`)

**What to do**

1. Validate file and `company_id`.
2. OCR: DN number, date, amounts, references (e.g. PO reference), line items.
3. Resolve:
   - **po_id**: e.g. match PO reference from PDF to `purchase_orders.po_number` for this `company_id`.
   - **customer_id** (if `context === 'ar'`): from PO’s `customer_id` if `po_id` found; else try match by company name.
   - **supplier_id** (if A/P): from PO’s supplier or leave null if your schema allows.
4. Insert into **`delivery_notes`** with:
   - `company_id`, `po_id` (or null), `customer_id`, `supplier_id` (nullable if A/R), `dn_number`, `delivery_date`, `context`, `amount` and/or `extraction_data` (e.g. `{ "amount": 123 }`).
5. If your DB has **`dn_line_items`**, insert line items.

**Response**

- `200` + `{ "success": true, "message": "Delivery note uploaded and processed successfully" }`.

The frontend may then fetch recent `delivery_notes` by `company_id` and patch A/R fields (e.g. set `context='ar'`, `customer_id` from PO) if needed; your backend can do that in one place to simplify the frontend.

---

### 3.4. Upload Supplier Invoice

**Request**

- `POST /webhook/upload-supplier-invoice`
- Form: `data` (file), `company_id` (string)

**What to do**

1. Validate file and `company_id`.
2. OCR: invoice number, date, due date, supplier name, amounts, line items, PO reference (if any).
3. Resolve **supplier_id** from `suppliers` by name (and company).
4. Insert into **`supplier_invoices`** with:
   - `company_id`, `supplier_id`, invoice number, dates, amount, tax, status, and any `extraction_data` (line items, references).

**Response**

- `200` + `{ "success": true, "message": "Invoice uploaded successfully" }` (or include created record in `data`).

---

## 4. API Contract: Non-Upload Endpoints

These are JSON POSTs (no file).

---

### 4.1. A/R 3-Way Quality Check

**Request**

- `POST /webhook/ar-three-way-check`
- Body: `{ "invoice_id": "uuid" }`

**What to do**

1. Load invoice by `invoice_id`; get `po_id`, `dn_id`, `customer_id`, line items (e.g. from `extraction_data.lineItems`).
2. Load PO and DN; get their line items / quantities / amounts.
3. Compare:
   - Quantities: ordered (PO) vs delivered (DN) vs invoiced (Invoice).
   - Amounts: PO vs DN vs Invoice.
4. Build list of **warnings** (e.g. “Quantity mismatch on item X”, “Amount mismatch”).

**Response**

```json
{
  "matched": true | false,
  "warnings": ["Warning 1", "Warning 2"],
  "mismatches": {
    "quantities": { ... },
    "amounts": { ... }
  }
}
```

Frontend uses this on the invoice edit page to show a green/yellow panel and the list of warnings.

---

### 4.2. Lean Reconciliation (Fetch Bank Transactions)

**Request**

- `POST /webhook/lean-reconciliation`
- Body: `{ "company_id": "uuid" }` (or whatever the frontend sends; check `/api/n8n-proxy` — it forwards the request body).

**What to do**

1. Use **Lean API** (or your bank aggregation) to fetch transactions for the company’s linked bank account(s).
2. Map to your DB: insert/update **`bank_transactions`** (and possibly **`bank_accounts`**) in Supabase. Fields typically include:
   - `bank_account_id`, `amount`, `transaction_date`, `credit_debit_indicator`, `description`, `lean_transaction_id`, etc.
3. Optionally run matching logic (e.g. set `matched_invoice_id`, `is_reconciled`) if you do it in this step; otherwise the app’s “Check Payment Status” and reconciliation page can do it.

**Response**

- `200` + JSON, e.g. `{ "success": true, "synced": 42 }` or similar. Frontend reconciliation page only needs to know success so it can refetch from Supabase.

---

### 4.3. A/P 3-Way Match Run

**Request**

- `POST /webhook/run-three-way-match`
- Body: typically `{ "company_id": "uuid" }` (confirm from procurement/suppliers page code).

**What to do**

1. Load unmatched POs, delivery notes, supplier invoices for the company.
2. Match by PO reference, amounts, quantities (your business rules).
3. Insert/update **`three_way_matches`** (and possibly **`procurement_anomalies`** for mismatches).

**Response**

- `200` + e.g. `{ "success": true, "matches_created": 5 }`. Frontend may show a toast and refetch lists.

---

### 4.4. Reconcile Suppliers

**Request**

- `POST /webhook/reconcile-suppliers`
- Body: likely `{ "company_id": "uuid" }` or similar (check reconciliation page).

**What to do**

- Run your supplier reconciliation logic (e.g. match supplier invoices to payments or bank transactions) and update DB accordingly.

**Response**

- `200` + JSON indicating success (e.g. `{ "success": true }`).

---

## 5. Database (Supabase) Tables You Will Use

- **customer_purchase_orders** — Customer POs (A/R); link to `customers` via `customer_id`.
- **purchase_orders** — POs (A/R: `customer_id`; A/P: `supplier_id`); `context` = `'ar'` | `'ap'`.
- **po_line_items** — Optional; line items for POs.
- **delivery_notes** — `company_id`, `customer_id`, `supplier_id` (nullable for A/R), `po_id`, `dn_number`, `delivery_date`, `context`, `extraction_data`.
- **dn_line_items** — Optional.
- **supplier_invoices** — A/P supplier invoices.
- **bank_accounts**, **bank_transactions** — For Lean sync; `matched_invoice_id`, `matched_supplier_invoice_id`, `is_reconciled`.
- **three_way_matches**, **procurement_anomalies** — A/P 3-way match results.
- **customers**, **suppliers** — For resolving names from OCR to IDs.

Use **service role** (or equivalent) so your backend can insert/update regardless of RLS.

---

## 6. File Validation (Align with Frontend)

- **Allowed types:** PDF, JPEG, PNG (MIME: `application/pdf`, `image/jpeg`, `image/png`).
- **Max size:** 10 MB.
- Reject with `400` and clear error message if invalid.

---

## 7. CORS and Base URL

- Enable CORS for the frontend origin (e.g. `https://your-app.vercel.app`).
- Frontend will call: `NEXT_PUBLIC_BACKEND_URL` + path (e.g. `https://api.example.com/webhook/upload-customer-po`). You can keep paths as `/webhook/...` for minimal frontend changes, or use `/api/...` and update the frontend to use the new paths.

---

## 8. Summary: Endpoints to Implement

| # | Method | Path | Input | Purpose |
|---|--------|------|--------|---------|
| 1 | POST | `/webhook/upload-customer-po` | Form: `data`, `company_id` | OCR → `customer_purchase_orders` |
| 2 | POST | `/webhook/upload-purchase-order` | Form: `data`, `company_id` | OCR → `purchase_orders` (+ line items) |
| 3 | POST | `/webhook/upload-delivery-note` | Form: `data`, `company_id`, `context` | OCR → `delivery_notes` |
| 4 | POST | `/webhook/upload-supplier-invoice` | Form: `data`, `company_id` | OCR → `supplier_invoices` |
| 5 | POST | `/webhook/ar-three-way-check` | JSON: `{ "invoice_id" }` | Compare PO/DN/Invoice → warnings |
| 6 | POST | `/webhook/lean-reconciliation` | JSON: `{ "company_id" }` | Sync Lean → `bank_transactions` |
| 7 | POST | `/webhook/run-three-way-match` | JSON: `{ "company_id" }` | A/P 3-way match → `three_way_matches` |
| 8 | POST | `/webhook/reconcile-suppliers` | JSON: body from reconciliation page | Supplier reconciliation |

After implementation, set `NEXT_PUBLIC_BACKEND_URL` (or keep `NEXT_PUBLIC_N8N_URL` and point it to FastAPI) and update the frontend to call your backend base URL instead of n8n.
