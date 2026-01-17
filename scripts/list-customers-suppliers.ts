import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function listCustomersAndSuppliers() {
  console.log('📋 Fetching customers and suppliers from database...\n');

  try {
    // Get all customers
    const { data: customers, error: customerError } = await supabase
      .from('customers')
      .select('id, name, company_name, email, phone, tax_registration_number, vat_number, city, country')
      .order('company_name', { ascending: true })
      .limit(20);

    if (customerError) {
      console.error('❌ Error fetching customers:', customerError);
    } else {
      console.log('👥 CUSTOMERS:');
      console.log('─'.repeat(80));
      if (customers && customers.length > 0) {
        customers.forEach((customer, index) => {
          console.log(`\n${index + 1}. ${customer.company_name || customer.name || 'N/A'}`);
          console.log(`   ID: ${customer.id}`);
          console.log(`   Email: ${customer.email || 'N/A'}`);
          console.log(`   Phone: ${customer.phone || 'N/A'}`);
          console.log(`   VAT: ${customer.tax_registration_number || customer.vat_number || 'N/A'}`);
          console.log(`   City: ${customer.city || 'N/A'}`);
        });
      } else {
        console.log('   No customers found');
      }
    }

    console.log('\n\n');

    // Get all suppliers (only select columns that exist)
    const { data: suppliers, error: supplierError } = await supabase
      .from('suppliers')
      .select('id, name, email, phone, vat_number, address')
      .order('name', { ascending: true })
      .limit(20);

    if (supplierError) {
      console.error('❌ Error fetching suppliers:', supplierError);
      console.error('   Note: Make sure you have suppliers in your database');
    } else {
      console.log('🏢 SUPPLIERS:');
      console.log('─'.repeat(80));
      if (suppliers && suppliers.length > 0) {
        suppliers.forEach((supplier, index) => {
          console.log(`\n${index + 1}. ${supplier.name || 'N/A'}`);
          console.log(`   ID: ${supplier.id}`);
          console.log(`   Email: ${supplier.email || 'N/A'}`);
          console.log(`   Phone: ${supplier.phone || 'N/A'}`);
          console.log(`   VAT: ${supplier.vat_number || 'N/A'}`);
          console.log(`   Address: ${supplier.address || 'N/A'}`);
        });
      } else {
        console.log('   No suppliers found');
        console.log('   💡 You need to create suppliers first in the app');
      }
    }

    // Get company info
    const { data: companies, error: companyError } = await supabase
      .from('companies')
      .select('id, name')
      .limit(5);

    if (!companyError && companies && companies.length > 0) {
      console.log('\n\n🏭 COMPANIES:');
      console.log('─'.repeat(80));
      companies.forEach((company, index) => {
        const isDesertTech = company.id === '22222222-2222-2222-2222-222222222222';
        const marker = isDesertTech ? ' ⭐ (Default Supplier)' : '';
        console.log(`\n${index + 1}. ${company.name}${marker}`);
        console.log(`   ID: ${company.id}`);
        if (isDesertTech) {
          console.log('   💡 This is the default supplier for PDF generation');
        }
      });
    }

    console.log('\n\n💡 TIPS:');
    if (!customers || customers.length === 0) {
      console.log('   ⚠️  No customers found. You need to create customers first:');
      console.log('      - Go to /dashboard/contacts');
      console.log('      - Add a new customer');
      console.log('      - Then run this script again\n');
    }
    if (!suppliers || suppliers.length === 0) {
      console.log('   ⚠️  No suppliers found. For A/R testing:');
      console.log('      - The supplier is YOUR company (one of the companies listed above)');
      console.log('      - You can use a company ID as the supplier ID');
      console.log('      - Or create a supplier in the app\n');
    }
    console.log('   📝 To generate PDFs:');
    console.log('      npm run generate-test-pdfs-with-data <customer_id>');
    console.log('      (Supplier defaults to Desert Tech Solutions)');
    console.log('      Or specify: npm run generate-test-pdfs-with-data <customer_id> <supplier_id>\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

listCustomersAndSuppliers();
