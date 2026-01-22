'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { Trash2, RefreshCw, Database, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

const TEST_COMPANY_ID = '22222222-2222-2222-2222-222222222222';

export default function ResetDemoPage() {
  const { showToast } = useToast();
  const [resetting, setResetting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [lastReset, setLastReset] = useState<string | null>(null);
  const [seededCustomerCount, setSeededCustomerCount] = useState<number>(0);

  const loadStats = async () => {
    try {
      const [
        { count: invoices, error: invoiceError },
        { count: pos, error: poError },
        { count: dns, error: dnError },
        { count: customers, error: customerError },
        { count: suppliers, error: supplierError },
        { count: matches, error: matchError },
        { count: anomalies, error: anomalyError }
      ] = await Promise.all([
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('company_id', TEST_COMPANY_ID),
        supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).eq('company_id', TEST_COMPANY_ID),
        supabase.from('delivery_notes').select('*', { count: 'exact', head: true }).eq('company_id', TEST_COMPANY_ID),
        supabase.from('customers').select('*', { count: 'exact', head: true }).eq('company_id', TEST_COMPANY_ID),
        supabase.from('suppliers').select('*', { count: 'exact', head: true }).eq('company_id', TEST_COMPANY_ID),
        supabase.from('ar_three_way_matches').select('*', { count: 'exact', head: true }).eq('company_id', TEST_COMPANY_ID),
        supabase.from('ar_anomalies').select('*', { count: 'exact', head: true }).eq('company_id', TEST_COMPANY_ID)
      ]);

      // Log any errors
      if (invoiceError) console.error('Error loading invoices:', invoiceError);
      if (poError) console.error('Error loading POs:', poError);
      if (dnError) console.error('Error loading DNs:', dnError);
      if (customerError) console.error('Error loading customers:', customerError);
      if (supplierError) console.error('Error loading suppliers:', supplierError);
      if (matchError) console.error('Error loading matches:', matchError);
      if (anomalyError) console.error('Error loading anomalies:', anomalyError);

      // Also check for the seeded customer specifically
      const { count: seededCount } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', TEST_COMPANY_ID)
        .eq('company_name', 'Desert Tech Solutions');

      const newStats = {
        invoices: invoices || 0,
        pos: pos || 0,
        dns: dns || 0,
        customers: customers || 0,
        suppliers: suppliers || 0,
        matches: matches || 0,
        anomalies: anomalies || 0
      };

      console.log('Stats loaded:', newStats);
      console.log(`Seeded customer (Desert Tech Solutions): ${seededCount || 0}`);
      setStats(newStats);
      setSeededCustomerCount(seededCount || 0);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  useEffect(() => {
    loadStats();
    const saved = localStorage.getItem('lastReset');
    if (saved) setLastReset(saved);
  }, []);

  const resetDemoData = async () => {
    if (!confirm('⚠️ Are you sure? This will delete ALL test data for this company.\n\nThis action cannot be undone!')) {
      return;
    }

    setResetting(true);
    const deletedCounts: Record<string, number> = {};

    try {
      // Delete in correct order (respects foreign keys)
      
      // 1. Reconciliation matches
      const { count: recMatches } = await supabase
        .from('reconciliation_matches')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', TEST_COMPANY_ID);
      await supabase
        .from('reconciliation_matches')
        .delete()
        .eq('company_id', TEST_COMPANY_ID);
      deletedCounts.reconciliation_matches = recMatches || 0;

      // 2. Procurement anomalies
      const { count: procAnomalies } = await supabase
        .from('procurement_anomalies')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', TEST_COMPANY_ID);
      await supabase
        .from('procurement_anomalies')
        .delete()
        .eq('company_id', TEST_COMPANY_ID);
      deletedCounts.procurement_anomalies = procAnomalies || 0;

      // 3. A/R anomalies
      const { count: arAnomalies } = await supabase
        .from('ar_anomalies')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', TEST_COMPANY_ID);
      await supabase
        .from('ar_anomalies')
        .delete()
        .eq('company_id', TEST_COMPANY_ID);
      deletedCounts.ar_anomalies = arAnomalies || 0;

      // 4. A/R 3-way matches
      const { count: arMatches } = await supabase
        .from('ar_three_way_matches')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', TEST_COMPANY_ID);
      await supabase
        .from('ar_three_way_matches')
        .delete()
        .eq('company_id', TEST_COMPANY_ID);
      deletedCounts.ar_matches = arMatches || 0;

      // 5. Three way matches (A/P)
      const { count: threeWayMatches } = await supabase
        .from('three_way_matches')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', TEST_COMPANY_ID);
      await supabase
        .from('three_way_matches')
        .delete()
        .eq('company_id', TEST_COMPANY_ID);
      deletedCounts.three_way_matches = threeWayMatches || 0;

      // 6. Email logs
      const { data: invoiceIds } = await supabase
        .from('invoices')
        .select('id')
        .eq('company_id', TEST_COMPANY_ID);
      
      if (invoiceIds && invoiceIds.length > 0) {
        const { count: emailLogs } = await supabase
          .from('email_logs')
          .select('*', { count: 'exact', head: true })
          .in('invoice_id', invoiceIds.map(i => i.id));
        await supabase
          .from('email_logs')
          .delete()
          .in('invoice_id', invoiceIds.map(i => i.id));
        deletedCounts.email_logs = emailLogs || 0;
      }

      // 7. Bank transactions
      const { data: bankAccounts } = await supabase
        .from('bank_accounts')
        .select('id')
        .eq('company_id', TEST_COMPANY_ID);
      
      if (bankAccounts && bankAccounts.length > 0) {
        const { count: bankTransactions } = await supabase
          .from('bank_transactions')
          .select('*', { count: 'exact', head: true })
          .in('bank_account_id', bankAccounts.map(b => b.id));
        await supabase
          .from('bank_transactions')
          .delete()
          .in('bank_account_id', bankAccounts.map(b => b.id));
        deletedCounts.bank_transactions = bankTransactions || 0;
      }

      // 8. DN line items
      const { data: dnIds } = await supabase
        .from('delivery_notes')
        .select('id')
        .eq('company_id', TEST_COMPANY_ID);
      
      if (dnIds && dnIds.length > 0) {
        const { count: dnLineItems } = await supabase
          .from('dn_line_items')
          .select('*', { count: 'exact', head: true })
          .in('dn_id', dnIds.map(d => d.id));
        await supabase
          .from('dn_line_items')
          .delete()
          .in('dn_id', dnIds.map(d => d.id));
        deletedCounts.dn_line_items = dnLineItems || 0;
      }

      // 9. Delivery notes
      const { count: deliveryNotes } = await supabase
        .from('delivery_notes')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', TEST_COMPANY_ID);
      await supabase
        .from('delivery_notes')
        .delete()
        .eq('company_id', TEST_COMPANY_ID);
      deletedCounts.delivery_notes = deliveryNotes || 0;

      // 10. Invoice items (delete before invoices)
      if (invoiceIds && invoiceIds.length > 0) {
        const { count: invoiceItems } = await supabase
          .from('invoice_items')
          .select('*', { count: 'exact', head: true })
          .in('invoice_id', invoiceIds.map(i => i.id));
        await supabase
          .from('invoice_items')
          .delete()
          .in('invoice_id', invoiceIds.map(i => i.id));
        deletedCounts.invoice_items = invoiceItems || 0;
      }

      // 11. Customer Purchase Orders (delete before invoices since invoices may reference them)
      const { count: customerPOs } = await supabase
        .from('customer_purchase_orders')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', TEST_COMPANY_ID);
      
      // First, clear customer_po_id references from invoices to break foreign key constraints
      await supabase
        .from('invoices')
        .update({ customer_po_id: null })
        .eq('company_id', TEST_COMPANY_ID)
        .not('customer_po_id', 'is', null);
      
      // Then delete customer purchase orders
      await supabase
        .from('customer_purchase_orders')
        .delete()
        .eq('company_id', TEST_COMPANY_ID);
      deletedCounts.customer_purchase_orders = customerPOs || 0;

      // 12. Invoices (delete BEFORE purchase orders since invoices reference POs)
      const { count: invoices } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', TEST_COMPANY_ID);
      
      // First, clear po_id references from invoices to break foreign key constraints
      await supabase
        .from('invoices')
        .update({ po_id: null })
        .eq('company_id', TEST_COMPANY_ID)
        .not('po_id', 'is', null);
      
      // Then delete invoices
      await supabase
        .from('invoices')
        .delete()
        .eq('company_id', TEST_COMPANY_ID);
      deletedCounts.invoices = invoices || 0;

      // 13. PO line items - Get all POs first
      const { data: allPOs } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('company_id', TEST_COMPANY_ID);
      
      const poCount = allPOs?.length || 0;
      
      // Delete PO line items first (if any POs exist)
      if (allPOs && allPOs.length > 0) {
        const poIds = allPOs.map(po => po.id);
        const { count: poLineItems } = await supabase
          .from('po_line_items')
          .select('*', { count: 'exact', head: true })
          .in('po_id', poIds);
        await supabase
          .from('po_line_items')
          .delete()
          .in('po_id', poIds);
        deletedCounts.po_line_items = poLineItems || 0;
      }

      // 14. Purchase orders - Now safe to delete (invoices already deleted)
      const { error: poDeleteError } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('company_id', TEST_COMPANY_ID);
      
      if (poDeleteError) {
        console.error('Error deleting POs:', poDeleteError);
        showToast(`Warning: Some POs may not have been deleted: ${poDeleteError.message}`, 'warning');
      }
      
      // Verify deletion - check if any POs remain
      const { count: remainingPOs, data: remainingPOsData } = await supabase
        .from('purchase_orders')
        .select('id, po_number')
        .eq('company_id', TEST_COMPANY_ID);
      
      if (remainingPOs && remainingPOs > 0) {
        const poNumbers = remainingPOsData?.map(po => po.po_number).join(', ') || 'unknown';
        showToast(`Warning: ${remainingPOs} PO(s) still remain (${poNumbers}). Use "Force Delete" button below.`, 'warning');
        console.warn('Remaining POs:', remainingPOsData);
      }
      
      deletedCounts.purchase_orders = poCount || 0;

      // 15. Supplier invoices
      const { count: supplierInvoices } = await supabase
        .from('supplier_invoices')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', TEST_COMPANY_ID);
      await supabase
        .from('supplier_invoices')
        .delete()
        .eq('company_id', TEST_COMPANY_ID);
      deletedCounts.supplier_invoices = supplierInvoices || 0;

      // 16. Customers (optional - comment out if you want to keep customers)
      // const { count: customers } = await supabase
      //   .from('customers')
      //   .delete({ count: 'exact' })
      //   .eq('company_id', TEST_COMPANY_ID);
      // deletedCounts.customers = customers || 0;

      // 17. Suppliers (optional - comment out if you want to keep suppliers)
      // const { count: suppliers } = await supabase
      //   .from('suppliers')
      //   .delete({ count: 'exact' })
      //   .eq('company_id', TEST_COMPANY_ID);
      // deletedCounts.suppliers = suppliers || 0;

      const totalDeleted = Object.values(deletedCounts).reduce((sum, count) => sum + count, 0);
      
      setLastReset(new Date().toISOString());
      localStorage.setItem('lastReset', new Date().toISOString());
      
      showToast(`✅ Reset complete! Deleted ${totalDeleted} records`, 'success');
      await loadStats();
      
    } catch (error: any) {
      console.error('Error resetting demo data:', error);
      
      // Better error message extraction
      let errorMessage = 'Unknown error occurred';
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.error_description) {
        errorMessage = error.error_description;
      } else if (error?.details) {
        errorMessage = error.details;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.code) {
        errorMessage = `Database error (${error.code}): ${error.message || 'Check console for details'}`;
      }
      
      showToast(`❌ Error: ${errorMessage}`, 'error');
    } finally {
      setResetting(false);
    }
  };

  const seedSampleData = async () => {
    if (!confirm('This will create sample test data. Continue?')) {
      return;
    }

    setSeeding(true);
    try {
      // First, clean up ALL duplicate customers for this company
      const { data: allCustomers, count: customerCount } = await supabase
        .from('customers')
        .select('id', { count: 'exact' })
        .eq('company_id', TEST_COMPANY_ID)
        .eq('company_name', 'Desert Tech Solutions');

      console.log(`Found ${customerCount || 0} existing customers for Desert Tech Solutions`);

      // If there are any customers (duplicates or single), delete ALL of them first
      if (allCustomers && allCustomers.length > 0) {
        console.log(`Deleting ${allCustomers.length} existing customer(s) to start fresh...`);
        const { error: deleteError } = await supabase
          .from('customers')
          .delete()
          .in('id', allCustomers.map(c => c.id));
        
        if (deleteError) {
          console.error('Error deleting existing customers:', deleteError);
          throw deleteError;
        }
        console.log(`✅ Deleted ${allCustomers.length} existing customer(s)`);
        
        // Wait a moment for the delete to complete
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Create or update test customer (use upsert)
      const customerData = {
        company_id: TEST_COMPANY_ID,
        company_name: 'Desert Tech Solutions',
        name: 'Desert Tech Solutions',
        email: 'procurement@deserttech.sa',
        phone: '+966 11 234 5678',
        tax_registration_number: '310123456700003',
        vat_number: '310123456700003',
        city: 'Riyadh',
        country: 'Saudi Arabia',
        street_address: '123 Business Park, Suite 400'
      };

      // Try insert first, if it fails due to duplicate, use update
      let { data: customer, error: customerError } = await supabase
        .from('customers')
        .insert(customerData)
        .select()
        .limit(1);

      // If insert fails due to unique constraint, update instead
      if (customerError && (customerError.code === '23505' || customerError.message?.includes('duplicate'))) {
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('id')
          .eq('company_id', TEST_COMPANY_ID)
          .eq('company_name', 'Desert Tech Solutions')
          .limit(1)
          .maybeSingle();

        if (existingCustomer) {
          // Update existing customer
          const { data: updatedCustomer, error: updateError } = await supabase
            .from('customers')
            .update(customerData)
            .eq('id', existingCustomer.id)
            .select()
            .single();
          
          customer = updatedCustomer;
          customerError = updateError;
        }
      }

      if (customerError) {
        console.error('Customer creation/update error:', customerError);
        throw customerError;
      }

      // Verify customer was created/updated
      if (!customer || (Array.isArray(customer) && customer.length === 0)) {
        // Final check - maybe customer exists but query didn't return it
        const { data: verifyCustomer, count: verifyCount } = await supabase
          .from('customers')
          .select('id', { count: 'exact' })
          .eq('company_id', TEST_COMPANY_ID)
          .eq('company_name', 'Desert Tech Solutions')
          .limit(1);
        
        console.log(`Verification: Found ${verifyCount || 0} customers`);
        
        if (verifyCount && verifyCount > 0) {
          showToast(`✅ Customer exists! (${verifyCount} found). Refreshing stats...`, 'success');
          await loadStats();
          return;
        }
        
        throw new Error('Customer was not created/updated. Please check console for details.');
      }

      // Success - customer was created or updated
      const customerArray = Array.isArray(customer) ? customer : [customer];
      console.log('✅ Customer created/updated successfully:', customerArray[0]?.id);
      
      showToast('✅ Sample customer created/updated successfully!', 'success');
      
      // Force refresh stats with a small delay to ensure DB is updated
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadStats();
      
      // Double-check stats after refresh
      const { count: finalCustomerCount } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', TEST_COMPANY_ID);
      
      console.log(`Final customer count: ${finalCustomerCount || 0}`);
      
    } catch (error: any) {
      console.error('Error seeding data:', error);
      
      // Better error message extraction
      let errorMessage = 'Unknown error occurred';
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.error_description) {
        errorMessage = error.error_description;
      } else if (error?.details) {
        errorMessage = error.details;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.code) {
        errorMessage = `Database error (${error.code}): ${error.message || 'Check console for details'}`;
      }
      
      showToast(`❌ Error: ${errorMessage}`, 'error');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Demo Data Management</h1>
          <p className="text-gray-600">Reset and manage test data for demo purposes</p>
        </div>

        {/* Current Stats */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Database className="w-5 h-5" />
            Current Test Data
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 p-4 rounded">
              <div className="text-2xl font-bold text-gray-900">{stats.invoices || 0}</div>
              <div className="text-sm text-gray-600">Invoices</div>
            </div>
            <div className="bg-gray-50 p-4 rounded">
              <div className="text-2xl font-bold text-gray-900">{stats.pos || 0}</div>
              <div className="text-sm text-gray-600">Purchase Orders</div>
            </div>
            <div className="bg-gray-50 p-4 rounded">
              <div className="text-2xl font-bold text-gray-900">{stats.dns || 0}</div>
              <div className="text-sm text-gray-600">Delivery Notes</div>
            </div>
            <div className="bg-gray-50 p-4 rounded">
              <div className="text-2xl font-bold text-gray-900">{stats.matches || 0}</div>
              <div className="text-sm text-gray-600">3-Way Matches</div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600 mb-2">Additional Info:</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-3 rounded">
                <div className="text-lg font-semibold text-gray-900">{stats.customers || 0}</div>
                <div className="text-xs text-gray-600">Total Customers</div>
              </div>
              <div className="bg-green-50 p-3 rounded">
                <div className="text-lg font-semibold text-gray-900">{seededCustomerCount}</div>
                <div className="text-xs text-gray-600">Seeded Customer (Desert Tech)</div>
              </div>
              <div className="bg-purple-50 p-3 rounded">
                <div className="text-lg font-semibold text-gray-900">{stats.suppliers || 0}</div>
                <div className="text-xs text-gray-600">Suppliers</div>
              </div>
            </div>
            {stats.customers && stats.customers > seededCustomerCount && (
              <div className="mt-2 text-xs text-orange-600">
                ⚠️ Note: {stats.customers - seededCustomerCount} other customer(s) exist for this test company
              </div>
            )}
          </div>
          {lastReset && (
            <div className="mt-4 text-sm text-gray-500">
              Last reset: {new Date(lastReset).toLocaleString()}
            </div>
          )}
        </div>

        {/* Reset Button */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="bg-red-100 p-3 rounded-lg">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-2">Reset All Test Data</h2>
              <p className="text-gray-600 mb-4">
                This will delete all invoices, purchase orders, delivery notes, matches, and related data for the test company.
                <span className="font-semibold text-red-600"> This action cannot be undone!</span>
              </p>
              <button
                onClick={resetDemoData}
                disabled={resetting}
                className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {resetting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-5 h-5" />
                    Delete All Test Data
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Force Delete Orphaned POs */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="bg-orange-100 p-3 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-2">Force Delete Orphaned POs</h2>
              <p className="text-gray-600 mb-4">
                If some POs weren't deleted (due to foreign key constraints), this will remove invoice references first, then delete the POs.
              </p>
              <button
                onClick={async () => {
                  if (!confirm('This will remove po_id from invoices first, then delete remaining POs. Continue?')) return;
                  
                  setResetting(true);
                  try {
                    // Find remaining POs
                    const { data: remainingPOs } = await supabase
                      .from('purchase_orders')
                      .select('id')
                      .eq('company_id', TEST_COMPANY_ID);
                    
                    if (remainingPOs && remainingPOs.length > 0) {
                      const poIds = remainingPOs.map(p => p.id);
                      
                      // Remove po_id from invoices first
                      await supabase
                        .from('invoices')
                        .update({ po_id: null })
                        .in('po_id', poIds);
                      
                      // Delete PO line items
                      await supabase
                        .from('po_line_items')
                        .delete()
                        .in('po_id', poIds);
                      
                      // Now delete POs
                      await supabase
                        .from('purchase_orders')
                        .delete()
                        .in('id', poIds);
                      
                      showToast(`Successfully deleted ${remainingPOs.length} orphaned PO(s)`, 'success');
                      await loadStats();
                    } else {
                      showToast('No orphaned POs found', 'info');
                    }
                  } catch (error: any) {
                    showToast(`Error: ${error.message}`, 'error');
                  } finally {
                    setResetting(false);
                  }
                }}
                disabled={resetting}
                className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {resetting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5" />
                    Force Delete Remaining POs
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Seed Data Button */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="bg-green-100 p-3 rounded-lg">
              <RefreshCw className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-2">Seed Sample Data</h2>
              <p className="text-gray-600 mb-4">
                Create a test customer (Desert Tech Solutions) ready for testing.
              </p>
              <button
                onClick={seedSampleData}
                disabled={seeding}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {seeding ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Seeding...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    Create Sample Customer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Quick Links</h2>
          <div className="space-y-2">
            <Link href="/dashboard/admin/testing-guide" className="block text-blue-600 hover:text-blue-700">
              📖 Testing Guide →
            </Link>
            <Link href="/dashboard/invoices" className="block text-blue-600 hover:text-blue-700">
              📄 A/R Invoices →
            </Link>
            <Link href="/dashboard/procurement" className="block text-blue-600 hover:text-blue-700">
              📦 A/P Procurement →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
