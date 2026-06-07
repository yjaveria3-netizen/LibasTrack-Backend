const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const os = require('os');

const BRAND_BLUE = 'FF38BDF8';
const HEADER_BG = 'FF0EA5E9';
const HEADER_FONT = 'FFFFFFFF';

async function createStyledWorkbook(sheetName, headers) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LibasTrack';
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const headerRow = ws.addRow(headers);
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 11, name: 'Calibri' };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: BRAND_BLUE } } };
  });

  headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = Math.max(h.length + 4, 18);
  });
  ws.getRow(1).height = 28;
  return wb;
}

const WORKBOOKS = [
  {
    filename: 'Products.xlsx',
    sheet: 'Products',
    headers: ['Product ID', 'Name', 'Category', 'Subcategory', 'Collection', 'Season', 'Fabric',
      'Cost Price', 'Price', 'Sale Price', 'Currency', 'SKU', 'Stock Qty', 'Status',
      'Tags', 'Image Path', 'Supplier ID', 'Created At'],
  },
  {
    filename: 'Orders.xlsx',
    sheet: 'Orders',
    headers: ['Order ID', 'Customer ID', 'Customer Name', 'Customer Phone', 'Subtotal',
      'Discount', 'Shipping', 'Tax', 'Total', 'Currency', 'Status', 'Channel',
      'Priority', 'Shipping Method', 'Courier', 'Tracking #', 'Shipping Address',
      'Est. Delivery', 'Notes', 'Order Date'],
  },
  {
    filename: 'Customers.xlsx',
    sheet: 'Customers',
    headers: ['Customer ID', 'Full Name', 'Email', 'Phone', 'WhatsApp', 'City', 'Country',
      'Address', 'Gender', 'Segment', 'Source', 'Total Spent', 'Total Orders',
      'Loyalty Points', 'Date Joined', 'Subscribed', 'Tags', 'Notes'],
  },
  {
    filename: 'Financial.xlsx',
    sheet: 'Transactions',
    headers: ['Transaction ID', 'Order ID', 'Customer ID', 'Customer Name', 'Order Status', 'Order Total', 'Amount', 'Payment Method', 'Payment Status', 'Transaction Date'],
  },
  {
    filename: 'Suppliers.xlsx',
    sheet: 'Suppliers',
    headers: ['Supplier ID', 'Name', 'Contact Person', 'Email', 'Phone', 'WhatsApp', 'City',
      'Country', 'Category', 'Materials', 'Rating', 'Lead Time (Days)', 'Min Order',
      'Payment Terms', 'Active', 'Total Purchased', 'Notes'],
  },
  {
    filename: 'Returns.xlsx',
    sheet: 'Returns',
    headers: ['Return ID', 'Order ID', 'Customer ID', 'Customer Name', 'Product ID', 'Product Name', 'Reason', 'Type', 'Status',
      'Refund Amount', 'Return Date', 'Notes'],
  },
  {
    filename: 'Collections.xlsx',
    sheet: 'Collections',
    headers: ['Collection ID', 'Name', 'Description', 'Season', 'Year', 'Theme', 'Status',
      'Launch Date', 'Product Count', 'Notes'],
  },
];

/**
 * POST /api/storage/setup-local
 *
 * Body (optional):
 *   customPath — absolute path to use as the workspace root
 *
 * Folder structure:
 *   <root>/
 *     Database/       ← all .xlsx files
 *     Images/
 *       products/     ← product photos
 *       customers/    ← customer photos
 *     README.txt
 */
router.post('/setup-local', authMiddleware, async (req, res) => {
  try {
    const brandName = (req.user.brand?.name || 'MyBrand')
      .replace(/[^a-zA-Z0-9 _-]/g, '')
      .trim();

    const { customPath } = req.body;

    // Debug logging
    console.log('Received customPath:', customPath);
    console.log('Type:', typeof customPath);

    // Determine root folder
    let baseDir;
    if (customPath && customPath.trim()) {
      const trimmed = customPath.trim();
      
      console.log('Trimmed path:', trimmed);
      
      // Normalize path (handle both forward and backward slashes)
      const normalizedPath = trimmed.replace(/\//g, '\\');
      
      console.log('Normalized path:', normalizedPath);
      
      // Check if it looks like an absolute path (starts with drive letter or /)
      const isAbsolute = path.isAbsolute(normalizedPath) || /^[A-Za-z]:/.test(normalizedPath);
      
      console.log('Is absolute check:', isAbsolute);
      console.log('path.isAbsolute result:', path.isAbsolute(normalizedPath));
      
      if (!isAbsolute) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a full absolute path (e.g. C:\\Users\\Name\\Desktop\\MyBrand)',
        });
      }
      baseDir = path.normalize(normalizedPath);
    } else {
      baseDir = path.join(os.homedir(), 'Documents', 'LibasTrack', brandName);
    }

    // Create sub-folders
    const spreadsheetsDir = path.join(baseDir, 'Database');
    const imagesDir = path.join(baseDir, 'Images');
    const productImagesDir = path.join(imagesDir, 'products');
    const customerImagesDir = path.join(imagesDir, 'customers');

    fs.mkdirSync(spreadsheetsDir, { recursive: true });
    fs.mkdirSync(productImagesDir, { recursive: true });
    fs.mkdirSync(customerImagesDir, { recursive: true });

    // Create workbooks inside Database/
    const created = [];
    for (const wb of WORKBOOKS) {
      const filePath = path.join(spreadsheetsDir, wb.filename);
      if (!fs.existsSync(filePath)) {
        const workbook = await createStyledWorkbook(wb.sheet, wb.headers);
        await workbook.xlsx.writeFile(filePath);
      }
      created.push(wb.filename);
    }

    // README
    const readmePath = path.join(baseDir, 'README.txt');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(readmePath,
        `LibasTrack — ${brandName}\n` +
        `Created: ${new Date().toLocaleDateString()}\n\n` +
        `Folder structure:\n` +
        `  Database/       All Excel data files\n` +
        `  Images/         Photos saved by LibasTrack\n` +
        `    products/     Product images\n` +
        `    customers/    Customer images\n\n` +
        `DO NOT manually edit files while LibasTrack is running.\n`
      );
    }

    // Persist to user document
    req.user.storageType = 'local_excel';
    req.user.localPath = baseDir;
    await req.user.save();

    res.json({
      success: true,
      folderPath: baseDir,
      spreadsheetsPath: spreadsheetsDir,
      imagesPath: imagesDir,
      filesCreated: created,
      message: `Workspace created at ${baseDir}`,
    });
  } catch (err) {
    console.error('Local setup error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* GET /api/storage/status */
router.get('/status', authMiddleware, (req, res) => {
  const base = req.user.localPath || null;
  res.json({
    success: true,
    storageType: req.user.storageType,
    localPath: base,
    spreadsheetsPath: base ? path.join(base, 'Database') : null,
    imagesPath: base ? path.join(base, 'Images') : null,
    driveConnected: req.user.driveConnected,
    driveName: req.user.driveName,
    driveLink: req.user.driveLink,
  });
});

/* POST /api/storage/switch */
router.post('/switch', authMiddleware, async (req, res) => {
  try {
    const { storageType } = req.body;
    if (!['local_excel', 'google_drive'].includes(storageType)) {
      return res.status(400).json({ success: false, message: 'Invalid storage type' });
    }
    
    req.user.storageType = storageType;
    
    // If switching to local_excel and no localPath is set, auto-setup
    if (storageType === 'local_excel' && !req.user.localPath) {
      const brandName = (req.user.brand?.name || 'MyBrand')
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .trim();
      
      const baseDir = path.join(os.homedir(), 'Documents', 'LibasTrack', brandName);
      
      // Create folder structure
      const spreadsheetsDir = path.join(baseDir, 'Database');
      const imagesDir = path.join(baseDir, 'Images');
      const productImagesDir = path.join(imagesDir, 'products');
      const customerImagesDir = path.join(imagesDir, 'customers');
      
      fs.mkdirSync(spreadsheetsDir, { recursive: true });
      fs.mkdirSync(productImagesDir, { recursive: true });
      fs.mkdirSync(customerImagesDir, { recursive: true });
      
      // Create workbooks
      const created = [];
      for (const wb of WORKBOOKS) {
        const filePath = path.join(spreadsheetsDir, wb.filename);
        if (!fs.existsSync(filePath)) {
          const workbook = await createStyledWorkbook(wb.sheet, wb.headers);
          await workbook.xlsx.writeFile(filePath);
          created.push(wb.filename);
        }
      }
      
      // README
      const readmePath = path.join(baseDir, 'README.txt');
      if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(readmePath,
          `LibasTrack — ${brandName}\n` +
          `Created: ${new Date().toLocaleDateString()}\n\n` +
          `Folder structure:\n` +
          `  Database/       All Excel data files\n` +
          `  Images/         Photos saved by LibasTrack\n` +
          `    products/     Product images\n` +
          `    customers/    Customer images\n\n` +
          `DO NOT manually edit files while LibasTrack is running.\n`
        );
      }
      
      // Save localPath to user
      req.user.localPath = baseDir;
      console.log('Auto-setup local storage at:', baseDir);
    }
    
    await req.user.save();
    res.json({ success: true, storageType, localPath: req.user.localPath });
  } catch (err) {
    console.error('Storage switch error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
