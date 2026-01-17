import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Get customer ID from command line arguments
// Default supplier to Desert Tech Solutions
const DESERT_TECH_ID = '22222222-2222-2222-2222-222222222222';
const customerId = process.argv[2];
const supplierId = process.argv[3] || DESERT_TECH_ID;

if (!customerId) {
  console.error('❌ Usage: npm run generate-test-pdfs-with-data <customer_id> [supplier_id]');
  console.error('   First run: npm run list-customers');
  console.error('   Then copy the customer ID');
  console.error(`   Supplier defaults to Desert Tech Solutions (${DESERT_TECH_ID})`);
  process.exit(1);
}

if (supplierId === DESERT_TECH_ID) {
  console.log('✅ Using Desert Tech Solutions as supplier (default)');
}

// Matching line items across all documents
const lineItems = [
  {
    description: 'Dell Laptop XPS 15 - i7, 16GB RAM, 512GB SSD',
    quantity: 3,
    unitPrice: 4500.00,
    unit: 'pcs'
  },
  {
    description: 'Logitech MX Master 3 Wireless Mouse',
    quantity: 5,
    unitPrice: 350.00,
    unit: 'pcs'
  },
  {
    description: 'Samsung 27" 4K Monitor',
    quantity: 2,
    unitPrice: 1800.00,
    unit: 'pcs'
  }
];

// Calculate totals
const subtotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
const vatRate = 0.15; // 15% VAT
const vatAmount = subtotal * vatRate;
const total = subtotal + vatAmount;

// Document numbers (using 2026 for current year)
const poNumber = 'PO-2026-001';
const dnNumber = 'DN-2026-001';
const invoiceNumber = 'INV-2026-001';

// Dates (PO -> DN -> Invoice) - Current dates around January 17, 2026
const poDate = '2026-01-10';
const dnDate = '2026-01-15';
const invoiceDate = '2026-01-17'; // Current date
const dueDate = '2026-02-17'; // 30 days from invoice date

async function fetchCustomerData(customerId: string) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single();

  if (error || !data) {
    throw new Error(`Customer not found: ${error?.message || 'Unknown error'}`);
  }

  return {
    name: data.name || data.company_name || 'Unknown',
    company_name: data.company_name || data.name || 'Unknown',
    address: data.street_address || data.address || 'Address not set',
    city: data.city || 'City not set',
    country: data.country || 'Saudi Arabia',
    vatNumber: data.tax_registration_number || data.vat_number || 'VAT not set',
    tax_registration_number: data.tax_registration_number || data.vat_number || 'VAT not set',
    email: data.email || 'email@example.com',
    phone: data.phone || '+966 XX XXX XXXX'
  };
}

async function fetchSupplierData(supplierId: string) {
  // Try suppliers table first
  let { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', supplierId)
    .single();

  // If not found in suppliers, try companies table (for A/R, supplier is your company)
  if (error || !data) {
    const { data: companyData, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', supplierId)
      .single();

    if (companyError || !companyData) {
      throw new Error(`Supplier/Company not found: ${error?.message || companyError?.message || 'Unknown error'}`);
    }

    // Use company data
    data = companyData;
  }

  return {
    name: data.name || 'Unknown',
    company_name: data.name || 'Unknown',
    address: data.address || 'Address not set',
    city: data.city || 'City not set',
    country: data.country || 'Saudi Arabia',
    vatNumber: data.vat_number || data.tax_registration_number || 'VAT not set',
    tax_registration_number: data.tax_registration_number || data.vat_number || 'VAT not set',
    email: data.email || 'sales@company.com',
    phone: data.phone || '+966 XX XXX XXXX'
  };
}

function createPDF(filename: string, content: (doc: PDFDocument) => void) {
  const outputPath = path.join(process.cwd(), 'public', 'test-documents', filename);
  const dir = path.dirname(outputPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  content(doc);

  doc.end();

  return new Promise<void>((resolve, reject) => {
    stream.on('finish', () => {
      console.log(`✅ Generated: ${filename}`);
      resolve();
    });
    stream.on('error', reject);
  });
}

// 1. Purchase Order (FROM Customer TO Supplier)
function generatePO(customerInfo: any, supplierInfo: any) {
  return createPDF('PO-2026-001.pdf', (doc) => {
    // Header
    doc.fontSize(20).text('PURCHASE ORDER', { align: 'center' });
    doc.moveDown();
    
    // PO Number and Date
    doc.fontSize(12);
    doc.text(`PO Number: ${poNumber}`, { align: 'right' });
    doc.text(`Date: ${poDate}`, { align: 'right' });
    doc.moveDown(2);

    // From (Customer)
    doc.fontSize(14).text('FROM:', { underline: true });
    doc.fontSize(11);
    doc.text(customerInfo.company_name || customerInfo.name);
    doc.text(customerInfo.address);
    doc.text(customerInfo.city);
    doc.text(`VAT: ${customerInfo.tax_registration_number || customerInfo.vatNumber}`);
    doc.text(`Email: ${customerInfo.email}`);
    doc.text(`Phone: ${customerInfo.phone}`);
    doc.moveDown();

    // To (Supplier)
    doc.fontSize(14).text('TO:', { underline: true });
    doc.fontSize(11);
    doc.text(supplierInfo.company_name || supplierInfo.name);
    doc.text(supplierInfo.address);
    doc.text(supplierInfo.city);
    doc.text(`VAT: ${supplierInfo.tax_registration_number || supplierInfo.vatNumber}`);
    doc.moveDown(2);

    // Line Items Table
    doc.fontSize(12).text('ITEMS:', { underline: true });
    doc.moveDown(0.5);
    
    // Table header
    const tableTop = doc.y;
    doc.fontSize(10);
    doc.text('Description', 50, tableTop);
    doc.text('Qty', 350, tableTop);
    doc.text('Unit', 400, tableTop);
    doc.text('Unit Price', 450, tableTop, { width: 100, align: 'right' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Line items
    lineItems.forEach((item) => {
      const y = doc.y;
      doc.text(item.description, 50, y, { width: 280 });
      doc.text(item.quantity.toString(), 350, y);
      doc.text(item.unit, 400, y);
      doc.text(`SAR ${item.unitPrice.toFixed(2)}`, 450, y, { width: 100, align: 'right' });
      doc.moveDown(1);
    });

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Totals
    doc.text('Subtotal:', 400, doc.y, { width: 100, align: 'right' });
    doc.text(`SAR ${subtotal.toFixed(2)}`, 450, doc.y, { width: 100, align: 'right' });
    doc.moveDown(0.5);
    doc.text(`VAT (15%):`, 400, doc.y, { width: 100, align: 'right' });
    doc.text(`SAR ${vatAmount.toFixed(2)}`, 450, doc.y, { width: 100, align: 'right' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Total:', 400, doc.y, { width: 100, align: 'right' });
    doc.text(`SAR ${total.toFixed(2)}`, 450, doc.y, { width: 100, align: 'right' });
    doc.font('Helvetica').fontSize(10);
    doc.moveDown(2);

    // Notes
    doc.text('Notes:', { underline: true });
    doc.text('Expected delivery date: 2026-01-15');
    doc.text('Payment terms: Net 30 days');
  });
}

// 2. Delivery Note (FROM Supplier TO Customer)
function generateDN(customerInfo: any, supplierInfo: any) {
  return createPDF('DN-2026-001.pdf', (doc) => {
    // Header
    doc.fontSize(20).text('DELIVERY NOTE', { align: 'center' });
    doc.moveDown();
    
    // DN Number and Date
    doc.fontSize(12);
    doc.text(`DN Number: ${dnNumber}`, { align: 'right' });
    doc.text(`Date: ${dnDate}`, { align: 'right' });
    doc.text(`PO Reference: ${poNumber}`, { align: 'right' });
    doc.moveDown(2);

    // From (Supplier)
    doc.fontSize(14).text('FROM:', { underline: true });
    doc.fontSize(11);
    doc.text(supplierInfo.company_name || supplierInfo.name);
    doc.text(supplierInfo.address);
    doc.text(supplierInfo.city);
    doc.text(`VAT: ${supplierInfo.tax_registration_number || supplierInfo.vatNumber}`);
    doc.moveDown();

    // To (Customer)
    doc.fontSize(14).text('TO:', { underline: true });
    doc.fontSize(11);
    doc.text(customerInfo.company_name || customerInfo.name);
    doc.text(customerInfo.address);
    doc.text(customerInfo.city);
    doc.text(`VAT: ${customerInfo.tax_registration_number || customerInfo.vatNumber}`);
    doc.moveDown(2);

    // Line Items Table (same as PO)
    doc.fontSize(12).text('DELIVERED ITEMS:', { underline: true });
    doc.moveDown(0.5);
    
    const tableTop = doc.y;
    doc.fontSize(10);
    doc.text('Description', 50, tableTop);
    doc.text('Qty', 350, tableTop);
    doc.text('Unit', 400, tableTop);
    doc.text('Unit Price', 450, tableTop, { width: 100, align: 'right' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    lineItems.forEach((item) => {
      const y = doc.y;
      doc.text(item.description, 50, y, { width: 280 });
      doc.text(item.quantity.toString(), 350, y);
      doc.text(item.unit, 400, y);
      doc.text(`SAR ${item.unitPrice.toFixed(2)}`, 450, y, { width: 100, align: 'right' });
      doc.moveDown(1);
    });

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Totals
    doc.text('Subtotal:', 400, doc.y, { width: 100, align: 'right' });
    doc.text(`SAR ${subtotal.toFixed(2)}`, 450, doc.y, { width: 100, align: 'right' });
    doc.moveDown(0.5);
    doc.text(`VAT (15%):`, 400, doc.y, { width: 100, align: 'right' });
    doc.text(`SAR ${vatAmount.toFixed(2)}`, 450, doc.y, { width: 100, align: 'right' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Total:', 400, doc.y, { width: 100, align: 'right' });
    doc.text(`SAR ${total.toFixed(2)}`, 450, doc.y, { width: 100, align: 'right' });
    doc.font('Helvetica').fontSize(10);
    doc.moveDown(2);

    // Delivery info
    doc.text('Delivery Information:', { underline: true });
    doc.text('Delivery Date: 2026-01-15');
    doc.text('Carrier: Express Logistics');
    doc.text('Tracking Number: TRK-2026-001234');
    doc.moveDown();
    doc.text('Received by: ___________________');
    doc.text('Signature: ___________________');
  });
}

// 3. Invoice (FROM Supplier TO Customer)
function generateInvoice(customerInfo: any, supplierInfo: any) {
  return createPDF('INV-2026-001.pdf', (doc) => {
    // Header
    doc.fontSize(20).text('INVOICE', { align: 'center' });
    doc.moveDown();
    
    // Invoice Number and Date
    doc.fontSize(12);
    doc.text(`Invoice Number: ${invoiceNumber}`, { align: 'right' });
    doc.text(`Invoice Date: ${invoiceDate}`, { align: 'right' });
    doc.text(`Due Date: ${dueDate}`, { align: 'right' });
    doc.text(`PO Reference: ${poNumber}`, { align: 'right' });
    doc.text(`DN Reference: ${dnNumber}`, { align: 'right' });
    doc.moveDown(2);

    // From (Supplier)
    doc.fontSize(14).text('FROM:', { underline: true });
    doc.fontSize(11);
    doc.text(supplierInfo.company_name || supplierInfo.name);
    doc.text(supplierInfo.address);
    doc.text(supplierInfo.city);
    doc.text(`VAT: ${supplierInfo.tax_registration_number || supplierInfo.vatNumber}`);
    doc.text(`Email: ${supplierInfo.email}`);
    doc.text(`Phone: ${supplierInfo.phone}`);
    doc.moveDown();

    // To (Customer)
    doc.fontSize(14).text('BILL TO:', { underline: true });
    doc.fontSize(11);
    doc.text(customerInfo.company_name || customerInfo.name);
    doc.text(customerInfo.address);
    doc.text(customerInfo.city);
    doc.text(`VAT: ${customerInfo.tax_registration_number || customerInfo.vatNumber}`);
    doc.moveDown(2);

    // Line Items Table (same as PO and DN)
    doc.fontSize(12).text('ITEMS:', { underline: true });
    doc.moveDown(0.5);
    
    const tableTop = doc.y;
    doc.fontSize(10);
    doc.text('Description', 50, tableTop);
    doc.text('Qty', 350, tableTop);
    doc.text('Unit', 400, tableTop);
    doc.text('Unit Price', 450, tableTop, { width: 100, align: 'right' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    lineItems.forEach((item) => {
      const y = doc.y;
      doc.text(item.description, 50, y, { width: 280 });
      doc.text(item.quantity.toString(), 350, y);
      doc.text(item.unit, 400, y);
      doc.text(`SAR ${item.unitPrice.toFixed(2)}`, 450, y, { width: 100, align: 'right' });
      doc.moveDown(1);
    });

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Totals
    doc.text('Subtotal:', 400, doc.y, { width: 100, align: 'right' });
    doc.text(`SAR ${subtotal.toFixed(2)}`, 450, doc.y, { width: 100, align: 'right' });
    doc.moveDown(0.5);
    doc.text(`VAT (15%):`, 400, doc.y, { width: 100, align: 'right' });
    doc.text(`SAR ${vatAmount.toFixed(2)}`, 450, doc.y, { width: 100, align: 'right' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Total:', 400, doc.y, { width: 100, align: 'right' });
    doc.text(`SAR ${total.toFixed(2)}`, 450, doc.y, { width: 100, align: 'right' });
    doc.font('Helvetica').fontSize(10);
    doc.moveDown(2);

    // Payment info
    doc.text('Payment Terms:', { underline: true });
    doc.text('Net 30 days');
    doc.text(`Due Date: ${dueDate}`);
    doc.moveDown();
    doc.text('Bank Details:');
    doc.text(`Account Name: ${supplierInfo.company_name || supplierInfo.name}`);
    doc.text('IBAN: SA1234567890123456789012');
    doc.text('Bank: Al Rajhi Bank');
  });
}

// Main execution
async function main() {
  console.log('📄 Generating test PDFs with real customer/supplier data...\n');
  console.log(`Customer ID: ${customerId}`);
  console.log(`Supplier ID: ${supplierId}${supplierId === DESERT_TECH_ID ? ' (Desert Tech Solutions - default)' : ''}\n`);

  try {
    const customerInfo = await fetchCustomerData(customerId);
    const supplierInfo = await fetchSupplierData(supplierId);

    console.log(`✅ Customer: ${customerInfo.company_name}`);
    console.log(`✅ Supplier: ${supplierInfo.company_name}\n`);

    await generatePO(customerInfo, supplierInfo);
    await generateDN(customerInfo, supplierInfo);
    await generateInvoice(customerInfo, supplierInfo);

    console.log('\n✅ All PDFs generated successfully!');
    console.log('📁 Location: public/test-documents/');
    console.log('\nDocuments:');
    console.log(`  1. ${poNumber}.pdf - Purchase Order`);
    console.log(`  2. ${dnNumber}.pdf - Delivery Note`);
    console.log(`  3. ${invoiceNumber}.pdf - Invoice`);
    console.log('\nAll documents use real data from your database!');
  } catch (error: any) {
    console.error('❌ Error generating PDFs:', error.message);
    process.exit(1);
  }
}

main();
