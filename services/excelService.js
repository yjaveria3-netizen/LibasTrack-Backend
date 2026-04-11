/**
 * LibasTrack — Excel Service
 * Creates and syncs local Excel workbooks on the user's PC
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const os = require('os');

/* ─── Rose palette for Excel theming ─── */
const ROSE       = 'FFD4756B';
const ROSE_LIGHT = 'FFFFF7F5';
const ROSE_MID   = 'FFE8A89A';
const DARK       = 'FF3D1A14';
const GRAY       = 'FF9A6E6A';
const WHITE      = 'FFFFFFFF';
const EMERALD    = 'FF4A8C68';
const AMBER      = 'FFB07C30';

/* ─── Sheet definitions ─── */
const SHEETS = {
  Products: {
    columns: [
      { header: 'Product ID',   key: 'productId',    width: 14 },
      { header: 'Name',         key: 'name',         width: 28 },
      { header: 'Category',     key: 'category',     width: 16 },
      { header: 'Season',       key: 'season',       width: 14 },
      { header: 'Fabric',       key: 'fabric',       width: 16 },
      { header: 'Cost Price',   key: 'costPrice',    width: 14 },
      { header: 'Retail Price', key: 'price',        width: 14 },
      { header: 'Sale Price',   key: 'salePrice',    width: 14 },
      { header: 'Stock Qty',    key: 'stockQty',     width: 12 },
      { header: 'Status',       key: 'status',       width: 14 },
      { header: 'Collection',   key: 'collection',   width: 18 },
      { header: 'SKU',          key: 'sku',          width: 14 },
      { header: 'Tags',         key: 'tags',         width: 22 },
      { header: 'Description',  key: 'description',  width: 36 },
      { header: 'Created At',   key: 'createdAt',    width: 18 },
    ]
  },
  Orders: {
    columns: [
      { header: 'Order ID',      key: 'orderId',         width: 14 },
      { header: 'Customer Name', key: 'customerName',    width: 22 },
      { header: 'Phone',         key: 'phone',           width: 18 },
      { header: 'City',          key: 'city',            width: 14 },
      { header: 'Status',        key: 'status',          width: 18 },
      { header: 'Channel',       key: 'channel',         width: 14 },
      { header: 'Total Amount',  key: 'totalAmount',     width: 16 },
      { header: 'Payment',       key: 'paymentMethod',   width: 16 },
      { header: 'Payment Status',key: 'paymentStatus',   width: 16 },
      { header: 'Items',         key: 'itemsSummary',    width: 32 },
      { header: 'Notes',         key: 'notes',           width: 28 },
      { header: 'Order Date',    key: 'orderDate',       width: 18 },
      { header: 'Delivery Date', key: 'deliveryDate',    width: 18 },
    ]
  },
  Customers: {
    columns: [
      { header: 'Customer ID',  key: 'customerId',   width: 14 },
      { header: 'Full Name',    key: 'fullName',     width: 24 },
      { header: 'Email',        key: 'email',        width: 26 },
      { header: 'Phone',        key: 'phone',        width: 18 },
      { header: 'WhatsApp',     key: 'whatsapp',     width: 18 },
      { header: 'City',         key: 'city',         width: 14 },
      { header: 'Country',      key: 'country',      width: 14 },
      { header: 'Segment',      key: 'segment',      width: 12 },
      { header: 'Source',       key: 'source',       width: 14 },
      { header: 'Total Spent',  key: 'totalSpent',   width: 14 },
      { header: 'Total Orders', key: 'totalOrders',  width: 14 },
      { header: 'Notes',        key: 'notes',        width: 30 },
      { header: 'Date Joined',  key: 'dateJoined',   width: 16 },
    ]
  },
  Financial: {
    columns: [
      { header: 'Transaction ID', key: 'transactionId',   width: 16 },
      { header: 'Order ID',       key: 'orderId',         width: 14 },
      { header: 'Amount',         key: 'price',           width: 16 },
      { header: 'Payment Method', key: 'paymentMethod',   width: 18 },
      { header: 'Status',         key: 'paymentStatus',   width: 14 },
      { header: 'Note',           key: 'note',            width: 28 },
      { header: 'Transaction Date', key: 'transactionDate', width: 20 },
    ]
  },
  Suppliers: {
    columns: [
      { header: 'Supplier ID',  key: 'supplierId',   width: 14 },
      { header: 'Name',         key: 'name',         width: 24 },
      { header: 'Contact',      key: 'contact',      width: 22 },
      { header: 'Category',     key: 'category',     width: 16 },
      { header: 'Rating',       key: 'rating',       width: 10 },
      { header: 'Status',       key: 'status',       width: 14 },
      { header: 'Lead Time',    key: 'leadTime',     width: 14 },
      { header: 'Min Order',    key: 'minOrder',     width: 14 },
      { header: 'Notes',        key: 'notes',        width: 30 },
    ]
  },
  Returns: {
    columns: [
      { header: 'Return ID',    key: 'returnId',     width: 14 },
      { header: 'Order ID',     key: 'orderId',      width: 14 },
      { header: 'Customer',     key: 'customerName', width: 22 },
      { header: 'Reason',       key: 'reason',       width: 22 },
      { header: 'Status',       key: 'status',       width: 16 },
      { header: 'Refund Amt',   key: 'refundAmount', width: 14 },
      { header: 'Date',         key: 'returnDate',   width: 18 },
    ]
  },
};

/**
 * Style a header row with the Rose theme
 */
function styleHeaderRow(sheet) {
  const headerRow = sheet.getRow(1);
  headerRow.eachCell(cell => {
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb: ROSE } };
    cell.font = { bold:true, color:{ argb: WHITE }, name:'Calibri', size:10 };
    cell.alignment = { vertical:'middle', horizontal:'center', wrapText:true };
    cell.border = {
      bottom: { style:'thin', color:{ argb: WHITE } },
    };
  });
  headerRow.height = 30;
}

/**
 * Add a branded cover sheet
 */
function addCoverSheet(workbook, brandName) {
  const cover = workbook.addWorksheet('ℹ Info', { 
    views: [{ showGridLines: false }]
  });
  cover.getColumn('A').width = 48;
  cover.getColumn('B').width = 28;

  cover.getCell('A1').value = '🌹 LibasTrack · Rose Edition';
  cover.getCell('A1').font = { bold:true, size:16, color:{ argb: ROSE }, name:'Calibri' };
  cover.getRow(1).height = 38;

  cover.getCell('A2').value = `Brand: ${brandName}`;
  cover.getCell('A2').font = { size:11, color:{ argb: DARK }, name:'Calibri' };

  cover.getCell('A3').value = `Generated: ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })}`;
  cover.getCell('A3').font = { size:10, color:{ argb: GRAY }, name:'Calibri' };

  cover.getCell('A5').value = 'This workbook is auto-synced by LibasTrack.';
  cover.getCell('A5').font = { italic:true, size:9, color:{ argb: GRAY } };
}

/**
 * Create a single branded workbook for a given sheet name
 */
async function createWorkbook(sheetName, brandName, folderPath) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LibasTrack';
  workbook.lastModifiedBy = 'LibasTrack';
  workbook.created = new Date();
  workbook.modified = new Date();

  addCoverSheet(workbook, brandName);

  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state:'frozen', xSplit:0, ySplit:1, showGridLines: true }],
  });

  sheet.columns = SHEETS[sheetName].columns;
  styleHeaderRow(sheet);

  // Add alternating row colors placeholder (for future data)
  sheet.properties.defaultRowHeight = 22;

  const filePath = path.join(folderPath, `${sheetName}.xlsx`);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

/**
 * MAIN: Create the full LibasTrack folder structure on the user's PC
 */
async function setupLocalFolder(userId, brandName) {
  const safeBrand = (brandName || 'MyBrand').replace(/[^a-zA-Z0-9\s-_]/g, '').trim().replace(/\s+/g, '-');
  const folderName = `LibasTrack-${safeBrand}`;
  const basePath = path.join(os.homedir(), 'Documents');
  const folderPath = path.join(basePath, folderName);

  // Create main folder
  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

  // Create Images subfolder
  const imagesPath = path.join(folderPath, 'Images');
  if (!fs.existsSync(imagesPath)) fs.mkdirSync(imagesPath);

  // Create Backups subfolder
  const backupsPath = path.join(folderPath, 'Backups');
  if (!fs.existsSync(backupsPath)) fs.mkdirSync(backupsPath);

  // Create all Excel workbooks
  const sheets = Object.keys(SHEETS);
  for (const sheetName of sheets) {
    await createWorkbook(sheetName, brandName || 'My Brand', folderPath);
  }

  // Write a README.txt
  const readmePath = path.join(folderPath, 'README.txt');
  fs.writeFileSync(readmePath, [
    `LibasTrack — Rose Edition`,
    `Brand: ${brandName}`,
    `Created: ${new Date().toLocaleDateString()}`,
    ``,
    `FOLDER STRUCTURE`,
    `────────────────`,
    `Products.xlsx   — Product catalog & inventory`,
    `Orders.xlsx     — All orders & statuses`,
    `Customers.xlsx  — Customer database & CRM`,
    `Financial.xlsx  — Transactions & payments`,
    `Suppliers.xlsx  — Vendor management`,
    `Returns.xlsx    — Returns & refunds`,
    `Images/         — Product images`,
    `Backups/        — Automatic daily backups`,
    ``,
    `All files are managed by LibasTrack automatically.`,
    `Do not manually delete or rename these files.`,
  ].join('\n'));

  return folderPath;
}

/**
 * Sync data to a specific Excel sheet (overwrite all rows)
 */
async function syncSheet(localPath, sheetName, rows) {
  if (!localPath || !SHEETS[sheetName]) return;

  const filePath = path.join(localPath, `${sheetName}.xlsx`);
  if (!fs.existsSync(filePath)) return;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  let sheet = workbook.getWorksheet(sheetName);
  if (!sheet) return;

  // Clear existing data rows (keep header)
  const lastRow = sheet.rowCount;
  for (let i = lastRow; i > 1; i--) sheet.spliceRows(i, 1);

  // Write new rows with alternating colors
  rows.forEach((row, idx) => {
    const wsRow = sheet.addRow(row);
    const isEven = idx % 2 === 0;
    wsRow.eachCell(cell => {
      cell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFFFF7F5' }
      };
      cell.font = { name: 'Calibri', size: 10, color: { argb: DARK } };
      cell.alignment = { vertical: 'middle' };
    });
    wsRow.height = 20;
  });

  workbook.modified = new Date();
  await workbook.xlsx.writeFile(filePath);
}

/**
 * Save an image file to the local Images/ folder and return its path
 */
function saveImageLocally(localPath, filename, buffer) {
  const imagesDir = path.join(localPath, 'Images');
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  const dest = path.join(imagesDir, filename);
  fs.writeFileSync(dest, buffer);
  return dest;
}

module.exports = { setupLocalFolder, syncSheet, saveImageLocally, SHEETS };
