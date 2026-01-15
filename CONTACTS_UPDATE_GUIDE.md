# Contacts Page Update Guide

## Summary of Changes Needed

The contacts page has been partially updated to match Wafeq's structure. Here's what needs to be completed:

### ✅ Completed:
1. Database migration SQL file updated with all Wafeq fields
2. Contact interface updated with Wafeq fields
3. Form data state updated
4. Contact loading/mapping updated

### ⚠️ Still Needs Update:

1. **handleCreate()** - Update to use new formData structure
2. **handleEdit()** - Update to populate formData with Wafeq fields
3. **handleSubmit()** - **CRITICAL**: Change flow to:
   - Create/Update in Wafeq FIRST via n8n
   - Fetch the created/updated contact from Wafeq
   - Save the fetched data to Supabase
4. **syncWithWafeq()** - Update to match new Wafeq payload structure
5. **Form fields** - Update all form inputs to match Wafeq structure
6. **Table display** - Update to show Wafeq fields

## New Flow (Create):

```
User fills form → 
  Create in Wafeq (via n8n) → 
  Get wafeq_id and full contact data back → 
  Save to Supabase with wafeq_id
```

## New Flow (Update):

```
User edits form → 
  Update in Wafeq (via n8n with wafeq_id) → 
  Get updated contact data back → 
  Update Supabase
```

## n8n Webhook Endpoints Needed:

1. `POST /webhook/create-wafeq-contact` - Creates contact in Wafeq, returns wafeq_id and full contact
2. `POST /webhook/update-wafeq-contact` - Updates contact in Wafeq, returns updated contact
3. `POST /webhook/delete-wafeq-contact` - Deletes contact in Wafeq
4. `POST /webhook/fetch-wafeq-contact` - Fetches contact from Wafeq by wafeq_id

## Next Steps:

The file `app/dashboard/contacts/page.tsx` needs the handleSubmit function completely rewritten to implement the Wafeq-first flow.
