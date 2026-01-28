import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

// Simple A/P test PDFs for a single supplier PO
// PO is created in the app as PO-2026-004 for supplier "Zamel logistics"
// This script generates:
//  - DN-2026-004.pdf  (Delivery Note)
//  - INV-2026-004.pdf (Supplier Invoice)

const supplierInfo = {
  name: 'Zamel logistics',
  address: 'Industrial Zone, Riyadh',
  city: 'Riyadh',
  country: 'Saudi Arabia',
  vatNumber: '300123456700003',
  email: 'billing@zamellogistics.sa',
  phone: '+966 11 555 0000',
};

const companyInfo = {
  name: 'Your Company Name',
  address: 'Business Park, Riyadh',
  city: 'Riyadh',
  country: 'Saudi Arabia',
  vatNumber: '310000000000003',
};

const poNumber = 'PO-2026-004';
const dnNumber = 'DN-2026-004';
const invoiceNumber = 'INV-2026-004';

const poDate = '2026-01-27';
const dnDate = '2026-01-27';
const invoiceDate = '2026-01-27';
const dueDate = '2026-02-26';

const lineItems = [
  {
    description: 'DELL XPS',
    quantity: 1,
    unitPrice: 1000.0,
    unit: 'pcs',
  },
];

const subtotal = lineItems.reduce(
  (sum, item) => sum + item.quantity * item.unitPrice,
  0,
);
const vatRate = 0; // 0% VAT to keep totals simple
const vatAmount = subtotal * vatRate;
const total = subtotal + vatAmount;

function createPDF(
  filename: string,
  content: (doc: PDFDocument) => void,
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

async function generateDN() {
  return createPDF('DN-2026-004.pdf', doc => {
    doc.fontSize(20).text('DELIVERY NOTE', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12);
    doc.text(`DN Number: ${dnNumber}`, { align: 'right' });
    doc.text(`Date: ${dnDate}`, { align: 'right' });
    doc.text(`PO Reference: ${poNumber}`, { align: 'right' });
    doc.moveDown(2);

    // From (Supplier)
    doc.fontSize(14).text('FROM (Supplier):', { underline: true });
    doc.fontSize(11);
    doc.text(supplierInfo.name, { continued: false });
    doc.text(supplierInfo.address);
    doc.text(supplierInfo.city);
    doc.text(`VAT: ${supplierInfo.vatNumber}`);
    doc.text(`Email: ${supplierInfo.email}`);
    doc.text(`Phone: ${supplierInfo.phone}`);
    doc.moveDown();

    // To (Your company)
    doc.fontSize(14).text('TO (Buyer):', { underline: true });
    doc.fontSize(11);
    doc.text(companyInfo.name);
    doc.text(companyInfo.address);
    doc.text(companyInfo.city);
    doc.text(`VAT: ${companyInfo.vatNumber}`);
    doc.moveDown(2);

    // Items
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

    lineItems.forEach(item => {
      const y = doc.y;
      doc.text(item.description, 50, y, { width: 280 });
      doc.text(item.quantity.toString(), 350, y);
      doc.text(item.unit, 400, y);
      doc.text(`SAR ${item.unitPrice.toFixed(2)}`, 450, y, {
        width: 100,
        align: 'right',
      });
      doc.moveDown(1);
    });

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

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

    doc.text('Delivery Information:', { underline: true });
    doc.text(`Delivery Date: ${dnDate}`);
    doc.text('Delivered in good condition.');
  });
}

async function generateInvoice() {
  return createPDF('INV-2026-004.pdf', doc => {
    doc.fontSize(20).text('INVOICE', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12);
    doc.text(`Invoice Number: ${invoiceNumber}`, { align: 'right' });
    doc.text(`Invoice Date: ${invoiceDate}`, { align: 'right' });
    doc.text(`Due Date: ${dueDate}`, { align: 'right' });
    doc.text(`PO Reference: ${poNumber}`, { align: 'right' });
    doc.text(`DN Reference: ${dnNumber}`, { align: 'right' });
    doc.moveDown(2);

    // From (Supplier)
    doc.fontSize(14).text('FROM (Supplier):', { underline: true });
    doc.fontSize(11);
    doc.text(supplierInfo.name, { continued: false });
    doc.text(supplierInfo.address);
    doc.text(supplierInfo.city);
    doc.text(`VAT: ${supplierInfo.vatNumber}`);
    doc.text(`Email: ${supplierInfo.email}`);
    doc.text(`Phone: ${supplierInfo.phone}`);
    doc.moveDown();

    // To (Buyer)
    doc.fontSize(14).text('BILL TO (Buyer):', { underline: true });
    doc.fontSize(11);
    doc.text(companyInfo.name);
    doc.text(companyInfo.address);
    doc.text(companyInfo.city);
    doc.text(`VAT: ${companyInfo.vatNumber}`);
    doc.moveDown(2);

    // Items
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

    lineItems.forEach(item => {
      const y = doc.y;
      doc.text(item.description, 50, y, { width: 280 });
      doc.text(item.quantity.toString(), 350, y);
      doc.text(item.unit, 400, y);
      doc.text(`SAR ${item.unitPrice.toFixed(2)}`, 450, y, {
        width: 100,
        align: 'right',
      });
      doc.moveDown(1);
    });

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

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

    doc.text('Payment Terms:', { underline: true });
    doc.text('Payment due within 30 days of invoice date.');
  });
}

async function main() {
  console.log('📄 Generating A/P test PDFs for PO-2026-004…\n');
  try {
    await generateDN();
    await generateInvoice();
    console.log('\n✅ All A/P PDFs generated successfully!');
    console.log('📁 Location: public/test-documents/');
    console.log('  - DN-2026-004.pdf (Delivery Note)');
    console.log('  - INV-2026-004.pdf (Supplier Invoice)');
  } catch (err) {
    console.error('❌ Error generating A/P PDFs:', err);
    process.exit(1);
  }
}

main();

