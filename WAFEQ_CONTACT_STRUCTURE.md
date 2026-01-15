# Wafeq Contact Structure - Implementation Guide

## Flow
1. **Create**: User fills form → Create in Wafeq via n8n → Fetch created contact from Wafeq → Save to Supabase
2. **Update**: User edits form → Update in Wafeq via n8n → Fetch updated contact from Wafeq → Update Supabase
3. **Delete**: User deletes → Delete in Wafeq via n8n → Delete from Supabase

## Wafeq Contact Fields

### Business and VAT Treatment (Required)
- `company_name` (Required) - Company name
- `country` (Optional) - Country
- `tax_registration_number` (Optional) - Tax registration number

### Address (Optional)
- `city` - City
- `street_address` - Street address
- `building_number` - Building number
- `district` - District
- `address_additional_number` - Address additional number
- `postal_code` - Postal code

### Invoicing Information (Optional)
- `contact_code` - Code
- `email` - Email
- `phone` - Phone
- `relationship` - Relationship (customer/supplier/both)
- `payment_terms` - Payment terms
- `contact_id_type` - Contact ID Type
- `id_number` - ID Number

### Contact Defaults - Selling (Optional)
- `default_revenue_account` - Default revenue account
- `default_revenue_cost_center` - Default revenue cost center
- `default_revenue_tax_rate` - Default revenue tax rate

### Contact Defaults - Purchasing (Optional)
- `default_expense_account` - Default expense account
- `default_expense_cost_center` - Default expense cost center
- `default_expense_tax_rate` - Default expense tax rate

## n8n Webhook Payload Structure

### Create Contact
```json
{
  "action": "create",
  "company_id": "uuid",
  "contact": {
    "company_name": "Required",
    "country": "Saudi Arabia",
    "tax_registration_number": "optional",
    "city": "optional",
    "street_address": "optional",
    "building_number": "optional",
    "district": "optional",
    "address_additional_number": "optional",
    "postal_code": "optional",
    "contact_code": "optional",
    "email": "optional",
    "phone": "optional",
    "relationship": "customer|supplier|both",
    "payment_terms": "optional",
    "contact_id_type": "optional",
    "id_number": "optional",
    "default_revenue_account": "optional",
    "default_revenue_cost_center": "optional",
    "default_revenue_tax_rate": "optional",
    "default_expense_account": "optional",
    "default_expense_cost_center": "optional",
    "default_expense_tax_rate": "optional"
  }
}
```

### Update Contact
```json
{
  "action": "update",
  "company_id": "uuid",
  "wafeq_id": "wafeq_contact_id",
  "contact": { ... same as create ... }
}
```

### Delete Contact
```json
{
  "action": "delete",
  "company_id": "uuid",
  "wafeq_id": "wafeq_contact_id"
}
```

### Fetch Contact (after create/update)
```json
{
  "action": "fetch",
  "wafeq_id": "wafeq_contact_id"
}
```

## Response from n8n (after create/update)
```json
{
  "wafeq_id": "wafeq_contact_id",
  "contact": {
    // Full contact object from Wafeq
  }
}
```
