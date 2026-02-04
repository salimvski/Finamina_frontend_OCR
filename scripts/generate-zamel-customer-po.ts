import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

// A/R Flow: Customer (Zamel logistics) sends PO to Supplier (Desert Tech Solutions)
// This PO can be uploaded in the "Invoices" page under "Pending POs" tab

const customerInfo = {
  name: 'Zamel logistics',
  company_name: 'Zamel logistics',
  address: 'Industrial Zone, King Fahd Road',
  city: 'Riyadh',
  country: 'Saudi Arabia',
  vatNumber: '300123456700003',
  email: 'procurement@zamellogistics.sa',
  phone: '+966 11 555 0000',
};

const supplierInfo = {
  name: 'Desert Tech Solutions',
  company_name: 'Desert Tech Solutions',
  address: '456 Commerce Street',
  city: 'Jeddah',
  country: 'Saudi Arabia',
  vatNumber: '310987654300003',
  email: 'sales@deserttech.sa',
  phone: '+966 12 345 6789',
};

const poNumber = 'PO-ZAMEL-2026-001';
const poDate = '2026-01-28';

const lineItems = [
  {
    description: 'IT Infrastructure Setup - Server Rack & Networking Equipment',
    quantity: 1,
    unitPrice: 25000.0,
    unit: 'set',
  },
  {
    description: 'HP ProLiant DL380 Gen10 Server',
    quantity: 2,
    unitPrice: 15000.0,
    unit: 'pcs',
  },
  {
    description: 'Cisco Catalyst 2960-X Series Switch',
    quantity: 3,
    unitPrice: 3500.0,
    unit: 'pcs',
  },
];

const subtotal = lineItems.reduce(
  (sum, item) => sum + item.quantity * item.unitPrice,
  0,
);
const vatRate = 0.15; // 15% VAT
const vatAmount = subtotal * vatRate;
const total = subtotal + vatAmount;

function createPDF(
  filename: string,
  content: (doc: any) => void,
): Promise<void> {
  const outputPath = path.join(
    process.cwd(),
    'public',
    'test-documents',
    filename,
  );
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

async function generateCustomerPO() {
  return createPDF('PO-ZAMEL-2026-001.pdf', (doc) => {
    // Header
    doc.fontSize(20).text('PURCHASE ORDER', { align: 'center' });
    doc.moveDown();

    // PO Number and Date
    doc.fontSize(12);
    doc.text(`PO Number: ${poNumber}`, { align: 'right' });
    doc.text(`Date: ${poDate}`, { align: 'right' });
    doc.moveDown(2);

    // From (Customer - Zamel logistics)
    doc.fontSize(14).text('FROM (Buyer):', { underline: true });
    doc.fontSize(11);
    doc.text(customerInfo.company_name || customerInfo.name);
    doc.text(customerInfo.address);
    doc.text(`${customerInfo.city}, ${customerInfo.country}`);
    doc.text(`VAT: ${customerInfo.vatNumber}`);
    doc.text(`Email: ${customerInfo.email}`);
    doc.text(`Phone: ${customerInfo.phone}`);
    doc.moveDown();

    // To (Supplier - Desert Tech Solutions)
    doc.fontSize(14).text('TO (Supplier):', { underline: true });
    doc.fontSize(11);
    doc.text(supplierInfo.company_name || supplierInfo.name);
    doc.text(supplierInfo.address);
    doc.text(`${supplierInfo.city}, ${supplierInfo.country}`);
    doc.text(`VAT: ${supplierInfo.vatNumber}`);
    doc.text(`Email: ${supplierInfo.email}`);
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
      doc.text(`SAR ${item.unitPrice.toFixed(2)}`, 450, y, {
        width: 100,
        align: 'right',
      });
      doc.moveDown(1.2);
    });

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Totals
    doc.text('Subtotal:', 400, doc.y, { width: 100, align: 'right' });
    doc.text(`SAR ${subtotal.toFixed(2)}`, 450, doc.y, {
      width: 100,
      align: 'right',
    });
    doc.moveDown(0.5);
    doc.text(`VAT (${(vatRate * 100).toFixed(0)}%):`, 400, doc.y, {
      width: 100,
      align: 'right',
    });
    doc.text(`SAR ${vatAmount.toFixed(2)}`, 450, doc.y, {
      width: 100,
      align: 'right',
    });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Total:', 400, doc.y, { width: 100, align: 'right' });
    doc.text(`SAR ${total.toFixed(2)}`, 450, doc.y, {
      width: 100,
      align: 'right',
    });
    doc.font('Helvetica').fontSize(10);
    doc.moveDown(2);

    // Terms
    doc.text('Payment Terms:', { underline: true });
    doc.text('Net 30 days from delivery date');
    doc.moveDown(0.5);
    doc.text('Delivery Terms:', { underline: true });
    doc.text('Expected delivery within 14 days of PO acceptance');
    doc.moveDown(0.5);
    doc.text('Notes:', { underline: true });
    doc.text('Please confirm receipt and expected delivery date within 2 business days.');
  });
}

async function main() {
  console.log('📄 Generating Customer PO for Zamel logistics (A/R Flow)…\n');
  try {
    await generateCustomerPO();
    console.log('\n✅ Customer PO generated successfully!');
    console.log('📁 Location: public/test-documents/PO-ZAMEL-2026-001.pdf');
    console.log('\n📋 Next steps:');
    console.log('1. Upload this PO in the "Invoices" page → "Pending POs" tab → "Upload Customer PO"');
    console.log('2. Create an invoice linked to this PO');
    console.log('3. Create a delivery note for the invoice');
    console.log('\n💡 Customer details:');
    console.log(`   Company: ${customerInfo.company_name}`);
    console.log(`   VAT: ${customerInfo.vatNumber}`);
    console.log(`   Total: SAR ${total.toFixed(2)} (incl. 15% VAT)`);
  } catch (err) {
    console.error('❌ Error generating Customer PO:', err);
    process.exit(1);
  }
}

main();
