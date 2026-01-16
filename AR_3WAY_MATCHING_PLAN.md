# A/R 3-Way Matching Implementation Plan

## Current n8n Webhooks Available:
1. ✅ `/webhook/upload-purchase-order` - Already exists
2. ✅ `/webhook/upload-delivery-note` - Already exists (used for A/P)
3. ✅ `/webhook/run-three-way-match` - Already exists (for A/P only)
4. ✅ `/webhook/upload-invoice` - Already exists

## Solution: NO NEW N8N WORKFLOWS NEEDED

### What We'll Do:

1. **Upload Delivery Note (A/R)**
   - ✅ Use existing `/webhook/upload-delivery-note`
   - ✅ Pass `context='ar'` in FormData
   - ✅ Existing workflow should save DN with `context='ar'` and `customer_id`

2. **3-Way Matching (A/R)**
   - ✅ Create Next.js API route: `/api/ar/three-way-match`
   - ✅ Implement matching logic in TypeScript (no n8n needed)
   - ✅ Compare PO + DN + Invoice data
   - ✅ Save results to `ar_three_way_matches` table
   - ✅ Detect anomalies and save to `ar_anomalies` table

### Benefits:
- ✅ No new n8n workflows required
- ✅ Works immediately after migration
- ✅ Full control over matching logic
- ✅ Easy to test and debug
- ✅ Can be enhanced later if needed

### What Needs Confirmation:

1. **Can `/webhook/upload-delivery-note` handle `context='ar'` parameter?**
   - If yes: Perfect, we use it as-is
   - If no: We might need to modify it slightly OR create a simple API route for DN upload

2. **Matching Logic Complexity:**
   - Simple: Compare amounts, quantities, item counts
   - Medium: Compare line items, prices, descriptions
   - Which level do you prefer for MVP?

## Implementation Plan:

### Step 1: Database Migration
- Run `ar_3way_matching_migration_simple.sql`
- Adds `customer_id` and `context` to `delivery_notes`
- Creates `ar_three_way_matches` and `ar_anomalies` tables

### Step 2: Create API Route for Matching
- Create `app/api/ar/three-way-match/route.ts`
- Implement matching logic (compare PO, DN, Invoice)
- Save matches and anomalies to database

### Step 3: Update Frontend
- Change `handleRun3WayMatch` to call `/api/ar/three-way-match` instead of n8n
- Keep DN upload using existing webhook

### Step 4: Test
- Upload PO (A/R)
- Upload DN (A/R) with `context='ar'`
- Create Invoice
- Run matching
- Check results

## Questions for You:

1. **Can the existing `/webhook/upload-delivery-note` accept and use `context='ar'` parameter?**
   - If yes, we're good
   - If no, we can create a simple API route for DN upload

2. **What level of matching do you want for MVP?**
   - Simple: Just compare total amounts
   - Medium: Compare amounts + quantities + basic item matching
   - Advanced: Full line-item comparison (can add later)

3. **Should we proceed with this plan?**
   - Yes: I'll implement the API route for matching
   - No: Suggest alternative approach
