'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Plus, Trash2, Loader2, X, Calendar, Upload, Paperclip, ChevronDown } from 'lucide-react';
import Link from 'next/link';

interface Customer {
  id: string;
  name: string;
  company_name?: string;
  email?: string;
}

interface POLineItem {
  id: string;
  po_id: string;
  item_number?: string;
  description?: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  unit_of_measurement?: string;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  po_date: string;
  currency: string;
  amount: string;
  tax_amount: string;
  status: string;
  supplier_id?: string;
  notes?: string;
  expected_delivery_date?: string;
  line_items?: POLineItem[];
}

interface LineItem {
  item_name?: string; // Product/service name
  description: string;
  account: string;
  quantity: number;
  unit_price: number;
  tax_rate: string;
  discount: number;
  amount: number;
}

interface WafeqAccount {
  id: string;
  name: string;
  code?: string;
  type?: string;
  account_type?: string;
}

interface WafeqTaxRate {
  id: string;
  name: string;
  rate?: number;
}

function CreateInvoicePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedPOId, setSelectedPOId] = useState('');
  
  const [formData, setFormData] = useState({
    customer_id: '',
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: new Date().toISOString().split('T')[0],
    currency: 'SAR',
    purchase_order: '',
    purchase_order_id: '',
    reference: '',
    project: '',
    warehouse: '',
    notes: '',
    prices_exc_tax: true
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { item_name: '', description: '', account: '', quantity: 1, unit_price: 0, tax_rate: '', discount: 0, amount: 0 }
  ]);
  
  const [accounts, setAccounts] = useState<WafeqAccount[]>([]);
  const [taxRates, setTaxRates] = useState<WafeqTaxRate[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  
  // Default account and tax rate for all invoices (fallback)
  const DEFAULT_ACCOUNT = 'acc_KEi3RuQTxLXvaCostgNDnq';
  const DEFAULT_TAX_RATE = 'tax_VhZKtotYoETzeWP6puoJ7g';

  useEffect(() => {
    loadData();
  }, []);

  // Auto-select PO from URL parameter
  useEffect(() => {
    const poIdFromUrl = searchParams.get('po_id');
    if (poIdFromUrl && purchaseOrders.length > 0) {
      const po = purchaseOrders.find(p => p.id === poIdFromUrl);
      if (po) {
        handlePOSelection(poIdFromUrl);
      }
    }
  }, [searchParams, purchaseOrders]);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const { data: userData } = await supabase
      .from('users')
      .select('company_id')
      .eq('auth_user_id', user.id)
      .single();

    if (userData) {
      setCompanyId(userData.company_id);
      await Promise.all([
        loadCustomers(userData.company_id),
        loadPurchaseOrders(userData.company_id),
        loadWafeqOptions()
      ]);
      // Auto-generate invoice number
      const invoiceNumber = await generateInvoiceNumber(userData.company_id);
      setFormData(prev => ({ ...prev, invoice_number: invoiceNumber }));
    }

    setLoading(false);
  };

  const loadWafeqOptions = async () => {
    setLoadingOptions(true);
    try {
      // Load accounts and tax rates from Wafeq
      const [accountsResponse, taxRatesResponse] = await Promise.all([
        fetch('/api/wafeq/accounts'),
        fetch('/api/wafeq/tax-rates')
      ]);

      if (accountsResponse.ok) {
        const accountsData = await accountsResponse.json();
        const fetchedAccounts = accountsData.accounts || [];
        
        // Log accounts to debug
        console.log('Fetched accounts:', fetchedAccounts);
        
        setAccounts(fetchedAccounts);
        
        // Set default account if available
        if (fetchedAccounts.length > 0) {
          const defaultAccount = fetchedAccounts.find((acc: WafeqAccount) => 
            acc.id === DEFAULT_ACCOUNT || acc.name?.toLowerCase().includes('revenue')
          ) || fetchedAccounts[0];
          
          // Set default for all line items
          setLineItems(prev => prev.map(item => ({
            ...item,
            account: defaultAccount.id
          })));
        }
      } else {
        console.error('Failed to load accounts:', await accountsResponse.text());
      }

      if (taxRatesResponse.ok) {
        const taxRatesData = await taxRatesResponse.json();
        setTaxRates(taxRatesData.taxRates || []);
        
        // Set default tax rate if available
        if (taxRatesData.taxRates && taxRatesData.taxRates.length > 0) {
          const defaultTaxRate = taxRatesData.taxRates.find((tr: WafeqTaxRate) => 
            tr.id === DEFAULT_TAX_RATE || tr.rate === 15
          ) || taxRatesData.taxRates[0];
          
          // Set default for all line items
          setLineItems(prev => prev.map(item => ({
            ...item,
            tax_rate: defaultTaxRate.id
          })));
        }
      }
    } catch (err) {
      console.error('Error loading Wafeq options:', err);
    } finally {
      setLoadingOptions(false);
    }
  };

  const loadCustomers = async (company_id: string) => {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, company_name, email, wafeq_id')
      .eq('company_id', company_id)
      .order('company_name', { ascending: true });

    if (data) {
      setCustomers(data);
    } else if (error) {
      console.error('Error loading customers:', error);
      setError('Failed to load customers');
    }
  };


  const loadPurchaseOrders = async (company_id: string) => {
    try {
      // Load purchase orders that can be invoiced (delivered or partial_delivered)
      const { data: poData, error: poError } = await supabase
        .from('purchase_orders')
        .select('id, po_number, po_date, currency, amount, tax_amount, status, supplier_id, notes, expected_delivery_date')
        .eq('company_id', company_id)
        .in('status', ['delivered', 'partial_delivered', 'pending'])
        .order('po_date', { ascending: false });

      if (poError) {
        console.error('Error loading purchase orders:', poError);
        setPurchaseOrders([]);
        return;
      }

      if (!poData || poData.length === 0) {
        setPurchaseOrders([]);
        return;
      }

      // Load line items for all purchase orders
      const poIds = poData.map(po => po.id);
      console.log('Loading line items for PO IDs:', poIds);
      const { data: lineItemsData, error: lineItemsError } = await supabase
        .from('po_line_items')
        .select('id, po_id, item_number, description, quantity, unit_price, total_amount, unit_of_measure, unit_of_measurement')
        .in('po_id', poIds);
      
      console.log('Loaded line items data:', lineItemsData);
      console.log('Line items error:', lineItemsError);

      if (lineItemsError) {
        console.warn('Error loading PO line items:', lineItemsError);
        // Continue without line items
      }

      // Map purchase orders with their line items
      const ordersWithLineItems = poData.map(po => {
        const poLineItems = lineItemsData?.filter(item => item.po_id === po.id) || [];
        console.log(`PO ${po.po_number} (${po.id}) has ${poLineItems.length} line items:`, poLineItems);
        return {
          ...po,
          line_items: poLineItems
        };
      });

      console.log('All purchase orders with line items:', ordersWithLineItems);
      setPurchaseOrders(ordersWithLineItems);
    } catch (err: any) {
      console.error('Exception loading purchase orders:', err);
      setPurchaseOrders([]);
    }
  };

  const handlePOSelection = async (poId: string) => {
    setSelectedPOId(poId);
    const selectedPO = purchaseOrders.find(po => po.id === poId);
    
    console.log('Selected PO:', selectedPO);
    console.log('PO Line Items:', selectedPO?.line_items);
    console.log('Line items type:', typeof selectedPO?.line_items);
    console.log('Is array?', Array.isArray(selectedPO?.line_items));
    console.log('Line items length:', selectedPO?.line_items?.length);
    
    if (selectedPO) {
      // Prefill invoice data from purchase order
      setFormData(prev => ({
        ...prev,
        purchase_order: selectedPO.po_number,
        purchase_order_id: selectedPO.id,
        currency: selectedPO.currency || prev.currency,
        invoice_date: new Date().toISOString().split('T')[0], // Use today's date
        due_date: selectedPO.expected_delivery_date 
          ? new Date(selectedPO.expected_delivery_date).toISOString().split('T')[0]
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
        reference: selectedPO.po_number,
        notes: selectedPO.notes || prev.notes
      }));

      // Prefill line items from PO
      const defaultAccount = accounts.find(acc => acc.id === DEFAULT_ACCOUNT)?.id || accounts[0]?.id || DEFAULT_ACCOUNT;
      const defaultTaxRate = taxRates.find(tr => tr.id === DEFAULT_TAX_RATE)?.id || taxRates[0]?.id || DEFAULT_TAX_RATE;

      // Calculate tax rate from PO totals
      const poAmount = parseFloat(selectedPO.amount || '0');
      const poTaxAmount = parseFloat(selectedPO.tax_amount || '0');
      const subtotal = poAmount - poTaxAmount;
      const calculatedTaxRate = subtotal > 0 && poTaxAmount > 0
        ? taxRates.find(tr => Math.abs((tr.rate || 0) - ((poTaxAmount / subtotal) * 100)) < 1)?.id
        : null;

      // Check if PO has line items in po_line_items table
      if (selectedPO.line_items && Array.isArray(selectedPO.line_items) && selectedPO.line_items.length > 0) {
        console.log('Using PO line items:', selectedPO.line_items);
        // Use line items from po_line_items table
        const poLineItems = selectedPO.line_items.map((poItem: any, index: number) => {
          // Parse numeric values (they come as strings from database)
          const quantity = typeof poItem.quantity === 'string' 
            ? parseFloat(poItem.quantity) || 1 
            : (poItem.quantity || 1);
          
          const unitPrice = typeof poItem.unit_price === 'string'
            ? parseFloat(poItem.unit_price) || 0
            : (poItem.unit_price || 0);
          
          const totalAmount = typeof poItem.total_amount === 'string'
            ? parseFloat(poItem.total_amount) || (quantity * unitPrice)
            : (poItem.total_amount || (quantity * unitPrice));
          
          // Extract item name from description
          // Example: "Dell Laptop XPS 15 - i7, 16GB RAM, 512GB SSD" -> "Dell Laptop"
          const description = poItem.description || '';
          let itemName = '';
          
          if (description) {
            // Get the part before dash or comma (main product name)
            let productName = description.split(' - ')[0].split(',')[0].trim();
            
            // Extract brand/product name (first 2 words: brand + product type)
            // "Dell Laptop XPS 15" -> "Dell Laptop"
            // "HP Printer LaserJet Pro" -> "HP Printer"
            // "DELL Laptop" -> "DELL Laptop"
            const words = productName.split(/\s+/).filter((w: string) => w.length > 0);
            if (words.length >= 2) {
              // Take first 2 words (brand + product type)
              itemName = words.slice(0, 2).join(' ');
            } else if (words.length === 1) {
              // If only one word, use it (e.g., "DELL")
              itemName = words[0];
            } else {
              itemName = productName;
            }
          } else if (poItem.item_number && poItem.item_number !== 'N/A') {
            itemName = poItem.item_number;
          } else {
            // Fallback: use a generic name
            itemName = `Item from ${selectedPO.po_number}`;
          }
          
          // Ensure item_name is not empty
          if (!itemName || itemName.trim() === '') {
            itemName = `Item ${index + 1}`;
          }
          
          // Calculate amount with tax
          const taxRateObj = taxRates.find(tr => tr.id === (calculatedTaxRate || defaultTaxRate));
          const taxRatePercent = taxRateObj?.rate ? taxRateObj.rate / 100 : 0;
          const subtotal = (quantity * unitPrice) - 0; // discount is 0
          const amountWithTax = subtotal * (1 + taxRatePercent);
          
          return {
            item_name: itemName,
            description: description, // Use the full description from PO line item (e.g., "Dell Laptop XPS 15 - i7, 16GB RAM, 512GB SSD")
            account: defaultAccount,
            quantity: quantity, // Use actual quantity from PO
            unit_price: unitPrice, // Use actual unit price from PO
            tax_rate: calculatedTaxRate || defaultTaxRate,
            discount: 0,
            amount: amountWithTax
          };
        });
        
        console.log('Mapped line items:', poLineItems);
        setLineItems(poLineItems);
      } else {
        // Fallback: Create a single line item with the PO total amount
        // This should rarely happen if PO line items are loaded correctly
        console.warn('No line items found for PO, using fallback. PO:', selectedPO);
        console.warn('Line items check:', {
          hasLineItems: !!selectedPO.line_items,
          isArray: Array.isArray(selectedPO.line_items),
          length: selectedPO.line_items?.length,
          lineItems: selectedPO.line_items
        });
        
        // Try to reload PO line items directly
        const { data: directLineItems, error: directError } = await supabase
          .from('po_line_items')
          .select('*')
          .eq('po_id', selectedPO.id);
        
        if (directLineItems && directLineItems.length > 0) {
          console.log('Found line items via direct query:', directLineItems);
          // Use the direct line items
          const directPoLineItems = directLineItems.map((poItem: any, index: number) => {
            const quantity = typeof poItem.quantity === 'string' 
              ? parseFloat(poItem.quantity) || 1 
              : (poItem.quantity || 1);
            const unitPrice = typeof poItem.unit_price === 'string'
              ? parseFloat(poItem.unit_price) || 0
              : (poItem.unit_price || 0);
            const description = poItem.description || '';
            const itemName = description.split(' - ')[0].split(',')[0].trim().split(' ').slice(0, 2).join(' ') || `Item ${index + 1}`;
            
            const taxRateObj = taxRates.find(tr => tr.id === (calculatedTaxRate || defaultTaxRate));
            const taxRatePercent = taxRateObj?.rate ? taxRateObj.rate / 100 : 0;
            const subtotal = (quantity * unitPrice);
            const amountWithTax = subtotal * (1 + taxRatePercent);
            
            return {
              item_name: itemName,
              description: description, // Full description from PO
              account: defaultAccount,
              quantity: quantity,
              unit_price: unitPrice,
              tax_rate: calculatedTaxRate || defaultTaxRate,
              discount: 0,
              amount: amountWithTax
            };
          });
          setLineItems(directPoLineItems);
        } else {
          // Last resort fallback
          setLineItems([
            {
              item_name: `Products from ${selectedPO.po_number}`,
              description: `Invoice for ${selectedPO.po_number}`,
              account: defaultAccount,
              quantity: 1,
              unit_price: subtotal,
              tax_rate: calculatedTaxRate || defaultTaxRate,
              discount: 0,
              amount: poAmount
            }
          ]);
        }
      }

      // Try to match customer from supplier_id if available
      // In A/R context, the supplier in PO might be the customer we're invoicing
      if (selectedPO.supplier_id) {
        // Check if supplier_id matches any customer
        const matchingCustomer = customers.find(c => c.id === selectedPO.supplier_id);
        if (matchingCustomer) {
          setFormData(prev => ({ ...prev, customer_id: matchingCustomer.id }));
        }
      }
    }
  };

  const generateInvoiceNumber = async (company_id: string): Promise<string> => {
    try {
      // Get the latest invoice number from Supabase
      const { data: supabaseData, error: supabaseError } = await supabase
        .from('invoices')
        .select('invoice_number')
        .eq('company_id', company_id)
        .order('created_at', { ascending: false })
        .limit(1);

      // Get the latest invoice number from Wafeq
      let wafeqInvoiceNumbers: string[] = [];
      try {
        const wafeqResponse = await fetch('/api/wafeq/invoices');
        if (wafeqResponse.ok) {
          const wafeqData = await wafeqResponse.json();
          if (wafeqData.invoices && Array.isArray(wafeqData.invoices)) {
            wafeqInvoiceNumbers = wafeqData.invoices
              .map((inv: any) => inv.invoice_number)
              .filter((num: string) => num && num.match(/INV-\d+/i));
          }
        }
      } catch (wafeqErr) {
        console.warn('Could not fetch Wafeq invoices for number generation:', wafeqErr);
        // Continue with Supabase data only
      }

      // Collect all existing invoice numbers
      const existingNumbers = new Set<string>();
      
      if (supabaseData && supabaseData.length > 0) {
        supabaseData.forEach((inv: any) => {
          if (inv.invoice_number) {
            existingNumbers.add(inv.invoice_number.toUpperCase());
          }
        });
      }
      
      wafeqInvoiceNumbers.forEach((num: string) => {
        existingNumbers.add(num.toUpperCase());
      });

      // Find the highest invoice number
      let maxNumber = 0;
      existingNumbers.forEach((num: string) => {
        const match = num.match(/INV-(\d+)/i);
        if (match) {
          const numValue = parseInt(match[1], 10);
          if (numValue > maxNumber) {
            maxNumber = numValue;
          }
        }
      });

      // Generate next number
      const nextNumber = maxNumber + 1;
      return `INV-${nextNumber.toString().padStart(4, '0')}`;
    } catch (err) {
      console.error('Error generating invoice number:', err);
      return 'INV-0001';
    }
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    
    // Auto-calculate line amount (subtotal + tax for this line)
    const quantity = updated[index].quantity || 0;
    const unitPrice = updated[index].unit_price || 0;
    const discount = updated[index].discount || 0;
    
    // Get tax rate percentage from taxRates array using the ID
    let taxRatePercent = 0;
    if (updated[index].tax_rate) {
      const taxRateObj = taxRates.find(tr => tr.id === updated[index].tax_rate);
      if (taxRateObj && taxRateObj.rate !== undefined) {
        taxRatePercent = taxRateObj.rate / 100;
      } else {
        // Fallback: try to parse as number if it's not an ID
        taxRatePercent = parseFloat(updated[index].tax_rate) / 100 || 0;
      }
    }
    
    // Calculate: (quantity * unit_price - discount) * (1 + tax_rate)
    const subtotal = (quantity * unitPrice) - discount;
    const lineTotal = subtotal * (1 + taxRatePercent);
    
    updated[index].amount = lineTotal;
    
    setLineItems(updated);
  };

  const addLineItem = () => {
    // Use default account and tax rate for new line items
    const defaultAccount = accounts.find(acc => acc.id === DEFAULT_ACCOUNT)?.id || accounts[0]?.id || '';
    const defaultTaxRate = taxRates.find(tr => tr.id === DEFAULT_TAX_RATE)?.id || taxRates[0]?.id || '';
    
    setLineItems([...lineItems, { 
      item_name: '',
      description: '', 
      account: defaultAccount, 
      quantity: 1, 
      unit_price: 0, 
      tax_rate: defaultTaxRate, 
      discount: 0, 
      amount: 0 
    }]);
  };

  const clearLineItems = () => {
    if (confirm('Are you sure you want to clear all line items?')) {
      const defaultAccount = accounts.find(acc => acc.id === DEFAULT_ACCOUNT)?.id || accounts[0]?.id || '';
      const defaultTaxRate = taxRates.find(tr => tr.id === DEFAULT_TAX_RATE)?.id || taxRates[0]?.id || '';
      
      setLineItems([{ 
        item_name: '',
        description: '', 
        account: defaultAccount, 
        quantity: 1, 
        unit_price: 0, 
        tax_rate: defaultTaxRate, 
        discount: 0, 
        amount: 0 
      }]);
    }
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const calculateSubtotal = () => {
    // Subtotal is always before tax
    return lineItems.reduce((sum, item) => {
      const quantity = item.quantity || 0;
      const unitPrice = item.unit_price || 0;
      const discount = item.discount || 0;
      return sum + (quantity * unitPrice - discount);
    }, 0);
  };

  const calculateVAT = () => {
    // Calculate VAT based on each line item's tax rate
    return lineItems.reduce((sum, item) => {
      const quantity = item.quantity || 0;
      const unitPrice = item.unit_price || 0;
      const discount = item.discount || 0;
      
      // Get tax rate percentage from taxRates array using the ID
      let taxRatePercent = 0;
      if (item.tax_rate) {
        const taxRateObj = taxRates.find(tr => tr.id === item.tax_rate);
        if (taxRateObj && taxRateObj.rate !== undefined) {
          taxRatePercent = taxRateObj.rate / 100;
        } else {
          // Fallback: try to parse as number if it's not an ID
          taxRatePercent = parseFloat(item.tax_rate) / 100 || 0;
        }
      }
      
      const subtotal = (quantity * unitPrice - discount);
      return sum + (subtotal * taxRatePercent);
    }, 0);
  };

  const calculateTotal = () => {
    // Total is always subtotal + VAT
    return calculateSubtotal() + calculateVAT();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    // Validation
    if (!formData.customer_id) {
      setError('Please select a customer');
      setSubmitting(false);
      return;
    }

    if (!formData.invoice_number.trim()) {
      setError('Please enter an invoice number');
      setSubmitting(false);
      return;
    }

    if (lineItems.some(item => !item.description.trim() || item.quantity <= 0 || item.unit_price <= 0)) {
      setError('Please fill in all required line item fields (Description, Quantity, Price) with valid values');
      setSubmitting(false);
      return;
    }

    try {
      // Step 1: Get customer's Wafeq ID
      const { data: customerData } = await supabase
        .from('customers')
        .select('wafeq_id')
        .eq('id', formData.customer_id)
        .single();

      if (!customerData?.wafeq_id) {
        throw new Error('Customer is not synced with Wafeq. Please sync the customer first.');
      }

      // Step 2: Create invoice in Wafeq first (with retry logic for duplicate invoice numbers)
      let currentInvoiceNumber = formData.invoice_number.trim();
      let wafeqResponse;
      let retryCount = 0;
      const maxRetries = 5;

      while (retryCount < maxRetries) {
        wafeqResponse = await fetch('/api/wafeq/invoices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            customer_id: customerData.wafeq_id, // Use Wafeq contact ID
            invoice_number: currentInvoiceNumber,
            invoice_date: formData.invoice_date,
            due_date: formData.due_date,
            currency: formData.currency,
            line_items: lineItems.map(item => {
              // Use selected account/tax_rate, or fallback to defaults
              const accountId = item.account || DEFAULT_ACCOUNT;
              const taxRateId = item.tax_rate || DEFAULT_TAX_RATE;
              
              // Combine item_name and description for Wafeq description field
              const description = item.item_name 
                ? `${item.item_name}${item.description ? ` - ${item.description}` : ''}`
                : item.description.trim();
              
              return {
                description: description,
                account: accountId,
                quantity: item.quantity,
                unit_price: item.unit_price,
                tax_rate: taxRateId,
                discount: item.discount || 0,
                amount: item.amount
              };
            }),
            purchase_order: formData.purchase_order.trim() || undefined,
            reference: formData.reference.trim() || undefined,
            notes: formData.notes.trim() || undefined
          })
        });

        if (wafeqResponse.ok) {
          break; // Success, exit retry loop
        }

        const errorData = await wafeqResponse.json();
        
        // Check if it's a duplicate invoice number error
        const isDuplicateError = errorData.error?.includes('duplicate_invoice_number') ||
                                 errorData.errors?.some((e: any) => e.code === 'invalid' && e.detail === 'duplicate_invoice_number');
        
        if (isDuplicateError && retryCount < maxRetries - 1) {
          // Auto-increment invoice number and retry
          const match = currentInvoiceNumber.match(/INV-(\d+)/i);
          if (match) {
            const currentNum = parseInt(match[1], 10);
            currentInvoiceNumber = `INV-${(currentNum + 1).toString().padStart(4, '0')}`;
            retryCount++;
            console.log(`Invoice number already exists, trying: ${currentInvoiceNumber}`);
            // Update form data with new invoice number
            setFormData(prev => ({ ...prev, invoice_number: currentInvoiceNumber }));
            continue;
          }
        }
        
        // If not a duplicate error or max retries reached, throw error
        throw new Error(errorData.error || 'Failed to create invoice in Wafeq');
      }

      if (!wafeqResponse || !wafeqResponse.ok) {
        const errorData = await wafeqResponse?.json();
        throw new Error(errorData?.error || 'Failed to create invoice in Wafeq after retries');
      }

      const wafeqResult = await wafeqResponse!.json();
      const wafeqInvoice = wafeqResult.invoice || wafeqResult;
      const wafeqId = wafeqResult.wafeq_id || wafeqInvoice.id;
      
      // Update invoice number in form data if it was changed during retry
      if (currentInvoiceNumber !== formData.invoice_number.trim()) {
        setFormData(prev => ({ ...prev, invoice_number: currentInvoiceNumber }));
      }

      if (!wafeqId) {
        throw new Error('Wafeq did not return an invoice ID');
      }

      // Step 3: Save invoice to Supabase with Wafeq data
      const subtotal = calculateSubtotal();
      const vat = calculateVAT();
      const total = calculateTotal(); // This is subtotal + vat

      // Calculate total amount (amount + tax_amount)
      // According to schema: amount is numeric NOT NULL, tax_amount is numeric (nullable)
      const totalAmount = subtotal + vat;
      
      const invoiceData: any = {
        company_id: companyId,
        customer_id: formData.customer_id,
        invoice_number: currentInvoiceNumber, // Use the final invoice number (may have been incremented during retry)
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        currency: formData.currency || 'SAR', // Default to SAR per schema
        amount: totalAmount, // Total amount (subtotal + tax) - numeric type
        tax_amount: vat, // Tax amount - numeric type (nullable in schema)
        status: 'pending', // Default per schema
        wafeq_invoice_id: wafeqId, // Column name is wafeq_invoice_id (text type)
        po_id: formData.purchase_order_id || null, // Link to purchase order (run add_po_id_to_invoices.sql migration first)
        extraction_data: {
          // Store additional data in extraction_data (jsonb type)
          subtotal: subtotal,
          total_amount: totalAmount, // Same as amount, stored for reference
          lineItems: lineItems.map(item => ({
            item_name: item.item_name,
            description: item.description,
            account: item.account,
            quantity: item.quantity,
            unit_price: item.unit_price,
            tax_rate: item.tax_rate,
            discount: item.discount,
            amount: item.amount
          }))
        }
      };
      
      // Store optional fields in extraction_data (columns don't exist in schema)
      if (formData.reference && formData.reference.trim()) {
        invoiceData.extraction_data.reference = formData.reference.trim();
      }
      if (formData.purchase_order && formData.purchase_order.trim()) {
        invoiceData.extraction_data.purchase_order = formData.purchase_order.trim();
      }
      if (formData.purchase_order_id) {
        invoiceData.extraction_data.purchase_order_id = formData.purchase_order_id;
      }
      if (formData.notes && formData.notes.trim()) {
        invoiceData.extraction_data.notes = formData.notes.trim();
      }

      const { data: savedInvoice, error: supabaseError } = await supabase
        .from('invoices')
        .insert(invoiceData)
        .select()
        .single();

      if (supabaseError) {
        console.error('Error saving invoice to Supabase:', supabaseError);
        throw new Error(`Failed to save invoice: ${supabaseError.message}`);
      }

      // Step 4: Redirect to invoices list page (invoices tab)
      router.push(`/dashboard/invoices?id=${savedInvoice.id}`);
    } catch (err: any) {
      console.error('Error creating invoice:', err);
      setError(err.message || 'Failed to create invoice. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const selectedCustomer = customers.find(c => c.id === formData.customer_id);
  const currencySymbols: { [key: string]: string } = {
    'SAR': 'SAR',
    'USD': 'USD $',
    'EUR': 'EUR €',
    'CAD': 'CAD $'
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Top Header - Wafeq Style */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="p-2 hover:bg-gray-100 rounded-lg transition">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </Link>
              <span className="text-gray-600 font-medium">Standard Invoice</span>
            </div>
            <div className="flex items-center gap-4">
              <button className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
                <Paperclip className="w-4 h-4" />
                <span className="text-sm">Attachments 0</span>
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <form onSubmit={handleSubmit}>
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          <div className="grid grid-cols-3 gap-6">
            {/* Left Column - Invoice Details */}
            <div className="col-span-2 space-y-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-6">Tax Invoice</h1>
                
                {/* Invoice Fields */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Customer <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.customer_id}
                        onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      >
                        <option value="">Required</option>
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.company_name || customer.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Invoice number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.invoice_number}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                        title="Invoice number is auto-generated"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Currency <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <select
                          value={formData.currency}
                          onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none pr-8"
                          required
                        >
                          <option value="SAR">SAR</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="CAD">CAD</option>
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Date <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="date"
                          value={formData.invoice_date}
                          onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
                        />
                        <Calendar className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Due date <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="date"
                          value={formData.due_date}
                          onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
                        />
                        <Calendar className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Purchase order
                        <span className="ml-2 text-xs text-gray-500 font-normal">(Select to prefill)</span>
                      </label>
                      <select
                        value={selectedPOId}
                        onChange={(e) => {
                          if (e.target.value) {
                            handlePOSelection(e.target.value);
                          } else {
                            setSelectedPOId('');
                            setFormData(prev => ({ ...prev, purchase_order: '', purchase_order_id: '' }));
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select Purchase Order (Optional)</option>
                        {purchaseOrders.map((po) => (
                          <option key={po.id} value={po.id}>
                            {po.po_number} - {po.currency} {parseFloat(po.amount || '0').toFixed(2)} ({po.status})
                          </option>
                        ))}
                      </select>
                      {formData.purchase_order && (
                        <input
                          type="text"
                          value={formData.purchase_order}
                          readOnly
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 mt-2 text-sm"
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                      <input
                        type="text"
                        value={formData.reference}
                        onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Optional"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
                      <select
                        value={formData.project}
                        onChange={(e) => setFormData({ ...formData, project: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Optional</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse</label>
                      <select
                        value={formData.warehouse}
                        onChange={(e) => setFormData({ ...formData, warehouse: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Optional</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="mt-8">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Item Name</th>
                          <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Description <span className="text-red-500">*</span></th>
                          <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Account <span className="text-red-500">*</span></th>
                          <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Qty <span className="text-red-500">*</span></th>
                          <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Price <span className="text-red-500">*</span></th>
                          <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Line Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((item, index) => (
                          <tr key={index} className="border-b border-gray-100">
                            <td className="py-3 px-2">
                              <input
                                type="text"
                                value={item.item_name || ''}
                                onChange={(e) => updateLineItem(index, 'item_name', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                placeholder="Product/Service name"
                              />
                              <a href="#" className="text-xs text-blue-600 hover:underline mt-1 block">+ Product or service</a>
                            </td>
                            <td className="py-3 px-2">
                              <input
                                type="text"
                                value={item.description}
                                onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                placeholder="Required"
                                required
                              />
                            </td>
                            <td className="py-3 px-2">
                              <select
                                value={item.account}
                                onChange={(e) => updateLineItem(index, 'account', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white text-gray-900"
                                required
                                disabled={loadingOptions || accounts.length === 0}
                              >
                                <option value="" className="text-gray-500">{loadingOptions ? 'Loading...' : 'Select Account'}</option>
                                {accounts.map((account) => {
                                  // Show account type instead of ID
                                  const accountType = account.type || account.account_type || 'Account';
                                  const displayName = account.name || account.code || 'Unknown Account';
                                  const displayCode = account.code || '';
                                  
                                  return (
                                    <option key={account.id} value={account.id} className="text-gray-900">
                                      {accountType}: {displayName} {displayCode ? `(${displayCode})` : ''}
                                    </option>
                                  );
                                })}
                              </select>
                              {item.account && accounts.find(acc => acc.id === item.account) && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {accounts.find(acc => acc.id === item.account)?.type || 
                                   accounts.find(acc => acc.id === item.account)?.account_type ||
                                   'Account'}: {accounts.find(acc => acc.id === item.account)?.name || 
                                   accounts.find(acc => acc.id === item.account)?.code ||
                                   'Selected'}
                                </div>
                              )}
                              <a href="#" className="text-xs text-blue-600 hover:underline mt-1 block">+ Cost center</a>
                            </td>
                            <td className="py-3 px-2">
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={item.quantity}
                                onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                required
                              />
                            </td>
                            <td className="py-3 px-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unit_price}
                                onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                placeholder="Required"
                                required
                              />
                              <select
                                value={item.tax_rate}
                                onChange={(e) => updateLineItem(index, 'tax_rate', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm mt-1"
                                disabled={loadingOptions}
                              >
                                <option value="">Select Tax Rate</option>
                                {taxRates.map((taxRate) => (
                                  <option key={taxRate.id} value={taxRate.id}>
                                    {taxRate.name} {taxRate.rate ? `(${taxRate.rate}%)` : ''}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-3 px-2">
                              <div className="text-sm font-medium text-gray-900">
                                {currencySymbols[formData.currency] || formData.currency} {item.amount.toFixed(2)}
                              </div>
                              <a href="#" className="text-xs text-blue-600 hover:underline mt-1 block">+ Discount</a>
                            </td>
                            <td className="py-3 px-2">
                              {lineItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeLineItem(index)}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                                  title="Remove line"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center gap-3 mt-4">
                    <button
                      type="button"
                      onClick={addLineItem}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      Add line
                    </button>
                    <button
                      type="button"
                      onClick={clearLineItems}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-medium"
                    >
                      <Trash2 className="w-4 h-4" />
                      Clear lines
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Company Info & Summary */}
            <div className="space-y-6">
              {/* Company Logo Upload */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition cursor-pointer">
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Upload logo</p>
              </div>

              {/* Company Info */}
              <div className="text-sm text-gray-600">
                <p className="font-semibold text-gray-900">Company Name</p>
                <p className="mt-1">Country</p>
                <p className="mt-1">Tax registration number: —</p>
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                <div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
                    <input
                      type="checkbox"
                      checked={formData.prices_exc_tax}
                      onChange={(e) => setFormData({ ...formData, prices_exc_tax: e.target.checked })}
                      className="rounded"
                    />
                    Prices are exc. tax
                  </label>
                </div>
                <a href="#" className="text-sm text-blue-600 hover:underline block">+ Discount on total</a>
                
                <div className="pt-4 border-t border-gray-200 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Subtotal</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {currencySymbols[formData.currency] || formData.currency} {calculateSubtotal().toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total VAT</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {currencySymbols[formData.currency] || formData.currency} {calculateVAT().toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                    <span className="text-base font-bold text-gray-900">Total</span>
                    <span className="text-base font-bold text-blue-600">
                      {currencySymbols[formData.currency] || formData.currency} {calculateTotal().toFixed(2)}
                    </span>
                  </div>
                </div>
                <a href="#" className="text-sm text-blue-600 hover:underline block pt-2">+ Retention</a>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Invoice'
                  )}
                </button>
                <Link
                  href="/dashboard"
                  className="block w-full mt-3 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-center font-semibold"
                >
                  Cancel
                </Link>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CreateInvoicePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <CreateInvoicePageContent />
    </Suspense>
  );
}
