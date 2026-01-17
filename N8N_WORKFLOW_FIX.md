# N8N Workflow Fix for A/R Delivery Note Upload

## Issue
When uploading a Delivery Note in the A/R section, the n8n workflow fails with:
```
invalid input syntax for type uuid: "undefined"
```

This happens in the "Insert Delivery Note" node when `po_id` is the string `"undefined"` instead of `NULL` when no matching PO is found.

## Root Cause
In the "Find Matching PO" node, when no PO is found, the value passed to the next node is the string `"undefined"` instead of `NULL`. When the SQL query tries to cast this to UUID, it fails.

## Fix Required in N8N Workflow

### In the "Insert Delivery Note" SQL Query

Find the line that handles `po_id` and update it to handle `"undefined"` properly:

**Before:**
```sql
NULLIF('{{ $('Find Matching PO').item.json.po_id }}', '')::uuid
```

**After:**
```sql
CASE 
  WHEN '{{ $('Find Matching PO').item.json.po_id }}' IN ('undefined', 'null', '', 'NULL') THEN NULL
  ELSE NULLIF('{{ $('Find Matching PO').item.json.po_id }}', '')::uuid
END
```

Or more simply:
```sql
NULLIF(
  CASE 
    WHEN '{{ $('Find Matching PO').item.json.po_id }}' IN ('undefined', 'null', '', 'NULL') THEN ''
    ELSE '{{ $('Find Matching PO').item.json.po_id }}'
  END,
  ''
)::uuid
```

### Alternative: Fix in "Find Matching PO" Node

Alternatively, you can fix it in the "Find Matching PO" node by ensuring it returns `NULL` instead of `"undefined"`:

Add a "Code" or "Set" node after "Find Matching PO" that converts `"undefined"` to `null`:

```javascript
// In a Code node after "Find Matching PO"
const items = $input.all();
return items.map(item => {
  const poId = item.json.po_id;
  if (poId === 'undefined' || poId === 'null' || poId === '' || !poId) {
    item.json.po_id = null;
  }
  return item;
});
```

## Testing
After applying the fix:
1. Upload a Delivery Note without a matching PO
2. The DN should be created successfully with `po_id = NULL`
3. Upload a Delivery Note with a matching PO
4. The DN should be created with the correct `po_id`

## Note
The frontend now also supports creating Delivery Notes directly (without uploading a PDF) through the "Create DN" button, which bypasses n8n entirely for manual entry.
