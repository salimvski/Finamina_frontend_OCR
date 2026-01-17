import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

// Common data for all documents
// NOTE: These should match existing customers/suppliers in your database
// For A/R flow: Customer sends PO, Supplier (you) sends DN and Invoice
const customerInfo = {
  name: 'Customer Company', // Update to match existing customer name
  company_name: 'Customer Company', // Wafeq field
  address: '123 Business Park, Suite 400',
  city: 'Riyadh',
  country: 'Saudi Arabia',
  vatNumber: '310123456700003', // Common Saudi VAT format
  tax_registration_number: '310123456700003', // Wafeq field
  email: 'procurement@customer.com',
  phone: '+966 11 234 5678'
};

// Default to Desert Tech Solutions
const supplierInfo = {
  name: 'Desert Tech Solutions',
  company_name: 'Desert Tech Solutions',
  address: '456 Commerce Street',
  city: 'Jeddah',
  country: 'Saudi Arabia',
  vatNumber: '310987654300003', // Common Saudi VAT format
  tax_registration_number: '310987654300003',
  email: 'sales@deserttech.sa',
  phone: '+966 12 345 6789'
};

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
function generatePO() {
  return createPDF('PO-2026-001.pdf', (doc) => {
    // Header
    doc.fontSize(20).text('PURCHASE ORDER', { align: 'center' });
    doc.moveDown();
    
    // PO Number and Date
    doc.fontSize(12);
    doc.text(`PO Number: ${poNumber}`, { align: 'right' });
    doc.text(`Date: ${poDate}`, { align: 'right' });
    doc.moveDown(2);

    // From (Customer) - This should match an existing customer in your database
    doc.fontSize(14).text('FROM:', { underline: true });
    doc.fontSize(11);
    doc.text(customerInfo.company_name || customerInfo.name);
    doc.text(customerInfo.address);
    doc.text(customerInfo.city);
    doc.text(`VAT: ${customerInfo.tax_registration_number || customerInfo.vatNumber}`);
    doc.text(`Email: ${customerInfo.email}`);
    doc.text(`Phone: ${customerInfo.phone}`);
    doc.moveDown();

    // To (Supplier) - This should match your company name
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
    lineItems.forEach((item, index) => {
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
function generateDN() {
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

    // From (Supplier) - This should match your company name
    doc.fontSize(14).text('FROM:', { underline: true });
    doc.fontSize(11);
    doc.text(supplierInfo.company_name || supplierInfo.name);
    doc.text(supplierInfo.address);
    doc.text(supplierInfo.city);
    doc.text(`VAT: ${supplierInfo.tax_registration_number || supplierInfo.vatNumber}`);
    doc.moveDown();

    // To (Customer) - This should match an existing customer in your database
    doc.fontSize(14).text('TO:', { underline: true });
    doc.fontSize(11);
    doc.text(customerInfo.company_name || customerInfo.name);
    doc.text(customerInfo.address);
    doc.text(customerInfo.city);
    doc.text(`VAT: ${customerInfo.tax_registration_number || customerInfo.vatNumber}`);
    doc.moveDown(2);

    // Line Items Table
    doc.fontSize(12).text('DELIVERED ITEMS:', { underline: true });
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
function generateInvoice() {
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

    // From (Supplier) - This should match your company name
    doc.fontSize(14).text('FROM:', { underline: true });
    doc.fontSize(11);
    doc.text(supplierInfo.company_name || supplierInfo.name);
    doc.text(supplierInfo.address);
    doc.text(supplierInfo.city);
    doc.text(`VAT: ${supplierInfo.tax_registration_number || supplierInfo.vatNumber}`);
    doc.text(`Email: ${supplierInfo.email}`);
    doc.text(`Phone: ${supplierInfo.phone}`);
    doc.moveDown();

    // To (Customer) - This should match an existing customer in your database
    doc.fontSize(14).text('BILL TO:', { underline: true });
    doc.fontSize(11);
    doc.text(customerInfo.company_name || customerInfo.name);
    doc.text(customerInfo.address);
    doc.text(customerInfo.city);
    doc.text(`VAT: ${customerInfo.tax_registration_number || customerInfo.vatNumber}`);
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
  console.log('📄 Generating test PDFs for A/R 3-way matching...\n');
  
  try {
    await generatePO();
    await generateDN();
    await generateInvoice();
    
    console.log('\n✅ All PDFs generated successfully!');
    console.log('📁 Location: public/test-documents/');
    console.log('\nDocuments:');
    console.log(`  1. ${poNumber}.pdf - Purchase Order (FROM Customer TO Supplier)`);
    console.log(`  2. ${dnNumber}.pdf - Delivery Note (FROM Supplier TO Customer)`);
    console.log(`  3. ${invoiceNumber}.pdf - Invoice (FROM Supplier TO Customer)`);
    console.log('\nAll documents have matching:');
    console.log('  - PO Number: ' + poNumber);
    console.log('  - Line items (3 items, same quantities and prices)');
    console.log('  - Total amount: SAR ' + total.toFixed(2));
    console.log('\n⚠️  IMPORTANT:');
    console.log('  - Customer/Supplier names in PDFs are placeholders');
    console.log('  - Make sure to use existing customers/suppliers from your database');
    console.log('  - The OCR will extract company names - they should match existing records');
    console.log('  - Update customerInfo and supplierInfo in this script to match your data');
  } catch (error) {
    console.error('❌ Error generating PDFs:', error);
    process.exit(1);
  }
}

main();
