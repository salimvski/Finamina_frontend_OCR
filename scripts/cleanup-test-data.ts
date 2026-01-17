import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import * as readline from 'readline';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve));
}

async function cleanupTestData() {
  console.log('🧹 Test Data Cleanup Tool\n');
  console.log('This will remove test data from your database.');
  console.log('⚠️  WARNING: This action cannot be undone!\n');

  const confirm = await question('Type "DELETE" to confirm cleanup: ');
  
  if (confirm !== 'DELETE') {
    console.log('❌ Cleanup cancelled.');
    rl.close();
    return;
  }

  console.log('\n🔄 Starting cleanup...\n');

  try {
    // Get company ID (use Desert Tech Solutions)
    const companyId = '22222222-2222-2222-2222-222222222222';
    
    // 1. Delete A/R 3-way matches
    console.log('1. Cleaning A/R 3-way matches...');
    const { error: matchesError } = await supabase
      .from('ar_three_way_matches')
      .delete()
      .eq('company_id', companyId);
    
    if (matchesError) {
      console.log(`   ⚠️  Warning: ${matchesError.message}`);
    } else {
      console.log('   ✅ A/R matches cleaned');
    }

    // 2. Delete A/R anomalies
    console.log('2. Cleaning A/R anomalies...');
    const { error: anomaliesError } = await supabase
      .from('ar_anomalies')
      .delete()
      .eq('company_id', companyId);
    
    if (anomaliesError) {
      console.log(`   ⚠️  Warning: ${anomaliesError.message}`);
    } else {
      console.log('   ✅ A/R anomalies cleaned');
    }

    // 3. Delete test invoices (with specific invoice numbers)
    console.log('3. Cleaning test invoices...');
    const testInvoiceNumbers = ['INV-2026-001', 'INV-2025-001'];
    const { error: invoicesError } = await supabase
      .from('invoices')
      .delete()
      .eq('company_id', companyId)
      .in('invoice_number', testInvoiceNumbers);
    
    if (invoicesError) {
      console.log(`   ⚠️  Warning: ${invoicesError.message}`);
    } else {
      console.log('   ✅ Test invoices cleaned');
    }

    // 4. Delete test delivery notes
    console.log('4. Cleaning test delivery notes...');
    const testDNNumbers = ['DN-2026-001', 'DN-2025-001'];
    const { error: dnError } = await supabase
      .from('delivery_notes')
      .delete()
      .eq('company_id', companyId)
      .like('dn_number', 'DN-202%');
    
    if (dnError) {
      console.log(`   ⚠️  Warning: ${dnError.message}`);
    } else {
      console.log('   ✅ Test delivery notes cleaned');
    }

    // 5. Delete test purchase orders
    console.log('5. Cleaning test purchase orders...');
    const testPONumbers = ['PO-2026-001', 'PO-2025-001'];
    const { error: poError } = await supabase
      .from('purchase_orders')
      .delete()
      .eq('company_id', companyId)
      .like('po_number', 'PO-202%');
    
    if (poError) {
      console.log(`   ⚠️  Warning: ${poError.message}`);
    } else {
      console.log('   ✅ Test purchase orders cleaned');
    }

    // 6. Delete PO line items (orphaned)
    console.log('6. Cleaning orphaned PO line items...');
    const { data: allPOs } = await supabase
      .from('purchase_orders')
      .select('id')
      .eq('company_id', companyId);
    
    if (allPOs && allPOs.length > 0) {
      const poIds = allPOs.map(po => po.id);
      const { error: lineItemsError } = await supabase
        .from('po_line_items')
        .delete()
        .not('po_id', 'in', `(${poIds.join(',')})`);
      
      if (lineItemsError) {
        console.log(`   ⚠️  Warning: ${lineItemsError.message}`);
      } else {
        console.log('   ✅ Orphaned line items cleaned');
      }
    }

    // 7. Delete DN line items (orphaned)
    console.log('7. Cleaning orphaned DN line items...');
    const { data: allDNs } = await supabase
      .from('delivery_notes')
      .select('id')
      .eq('company_id', companyId);
    
    if (allDNs && allDNs.length > 0) {
      const dnIds = allDNs.map(dn => dn.id);
      const { error: dnLineItemsError } = await supabase
        .from('dn_line_items')
        .delete()
        .not('dn_id', 'in', `(${dnIds.join(',')})`);
      
      if (dnLineItemsError) {
        console.log(`   ⚠️  Warning: ${dnLineItemsError.message}`);
      } else {
        console.log('   ✅ Orphaned DN line items cleaned');
      }
    }

    console.log('\n✅ Cleanup completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Generate fresh test PDFs: npm run generate-test-pdfs-with-data <customer_id>');
    console.log('   2. Upload PO first');
    console.log('   3. Upload DN');
    console.log('   4. Create invoice from PO');
    console.log('   5. Run 3-way matching\n');

  } catch (error: any) {
    console.error('❌ Error during cleanup:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

cleanupTestData();
