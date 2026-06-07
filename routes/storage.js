const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const os = require('os');
const ExcelService = require('../services/excelService');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Financial = require('../models/Financial');
const Supplier = require('../models/Supplier');
const Return = require('../models/Return');
const Collection = require('../models/Collection');

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
    console.log('[Local Setup] Starting local storage setup...');
    const brandName = (req.user.brand?.name || 'MyBrand')
      .replace(/[^a-zA-Z0-9 _-]/g, '')
      .trim();
    console.log('[Local Setup] Brand name:', brandName);

    const { customPath } = req.body;
    console.log('[Local Setup] Custom path received:', customPath);

    // Determine root folder
    let baseDir;
    if (customPath && customPath.trim()) {
      const trimmed = customPath.trim();
      
      // Normalize path (handle both forward and backward slashes)
      const normalizedPath = trimmed.replace(/\//g, '\\');
      
      // Check if it looks like an absolute path (starts with drive letter or /)
      const isAbsolute = path.isAbsolute(normalizedPath) || /^[A-Za-z]:/.test(normalizedPath);
      
      console.log('[Local Setup] Normalized path:', normalizedPath);
      console.log('[Local Setup] Is absolute:', isAbsolute);
      
      if (!isAbsolute) {
        console.log('[Local Setup] Path is not absolute, returning error');
        return res.status(400).json({
          success: false,
          message: 'Please provide a full absolute path (e.g. C:\\Users\\Name\\Desktop\\MyBrand)',
        });
      }
      baseDir = path.normalize(normalizedPath);
    } else {
      baseDir = path.join(os.homedir(), 'Documents', 'LibasTrack', brandName);
    }
    
    console.log('[Local Setup] Base directory:', baseDir);

    // Create sub-folders
    const spreadsheetsDir = path.join(baseDir, 'Database');
    const imagesDir = path.join(baseDir, 'Images');
    const productImagesDir = path.join(imagesDir, 'products');
    const customerImagesDir = path.join(imagesDir, 'customers');

    console.log('[Local Setup] Creating directories...');
    console.log('[Local Setup] Database dir:', spreadsheetsDir);
    console.log('[Local Setup] Images dir:', imagesDir);
    console.log('[Local Setup] Products images dir:', productImagesDir);
    console.log('[Local Setup] Customers images dir:', customerImagesDir);

    fs.mkdirSync(spreadsheetsDir, { recursive: true });
    fs.mkdirSync(productImagesDir, { recursive: true });
    fs.mkdirSync(customerImagesDir, { recursive: true });
    console.log('[Local Setup] Directories created successfully');

    // Create workbooks inside Database/
    console.log('[Local Setup] Creating Excel workbooks...');
    const created = [];
    for (const wb of WORKBOOKS) {
      const filePath = path.join(spreadsheetsDir, wb.filename);
      console.log('[Local Setup] Checking file:', filePath);
      if (!fs.existsSync(filePath)) {
        const workbook = await createStyledWorkbook(wb.sheet, wb.headers);
        await workbook.xlsx.writeFile(filePath);
        console.log('[Local Setup] Created:', wb.filename);
      } else {
        console.log('[Local Setup] File already exists:', wb.filename);
      }
      created.push(wb.filename);
    }
    console.log('[Local Setup] Excel workbooks created:', created);

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
    console.log('[Local Setup] User document updated');

    // Sync existing data from MongoDB to Excel files
    try {
      console.log('[Local Setup] Starting sync of existing MongoDB data to Excel files...');
      const excelService = new ExcelService(baseDir);
      
      // Sync Products
      console.log('[Local Setup] Fetching products...');
      const products = await Product.find({ userId: req.user._id });
      console.log(`[Local Setup] Found ${products.length} products to sync`);
      for (const product of products) {
        await excelService.upsertProduct(product);
      }
      
      // Sync Orders
      console.log('[Local Setup] Fetching orders...');
      const orders = await Order.find({ userId: req.user._id });
      console.log(`[Local Setup] Found ${orders.length} orders to sync`);
      for (const order of orders) {
        await excelService.upsertOrder(order);
      }
      
      // Sync Customers
      console.log('[Local Setup] Fetching customers...');
      const customers = await Customer.find({ userId: req.user._id });
      console.log(`[Local Setup] Found ${customers.length} customers to sync`);
      for (const customer of customers) {
        await excelService.upsertCustomer(customer);
      }
      
      // Sync Financial
      console.log('[Local Setup] Fetching financial transactions...');
      const financials = await Financial.find({ userId: req.user._id });
      console.log(`[Local Setup] Found ${financials.length} financial transactions to sync`);
      for (const financial of financials) {
        await excelService.upsertTransaction(financial);
      }
      
      // Sync Suppliers
      console.log('[Local Setup] Fetching suppliers...');
      const suppliers = await Supplier.find({ userId: req.user._id });
      console.log(`[Local Setup] Found ${suppliers.length} suppliers to sync`);
      for (const supplier of suppliers) {
        await excelService.upsertSupplier(supplier);
      }
      
      // Sync Returns
      console.log('[Local Setup] Fetching returns...');
      const returns = await Return.find({ userId: req.user._id });
      console.log(`[Local Setup] Found ${returns.length} returns to sync`);
      for (const ret of returns) {
        await excelService.upsertReturn(ret);
      }
      
      // Sync Collections
      console.log('[Local Setup] Fetching collections...');
      const collections = await Collection.find({ userId: req.user._id });
      console.log(`[Local Setup] Found ${collections.length} collections to sync`);
      for (const collection of collections) {
        await excelService.upsertCollection(collection);
      }
      
      console.log(`[Local Setup] ✅ Sync complete: ${products.length} products, ${orders.length} orders, ${customers.length} customers, ${financials.length} transactions, ${suppliers.length} suppliers, ${returns.length} returns, ${collections.length} collections synced to local Excel files`);
    } catch (syncError) {
      console.error('[Local Setup] ❌ Error syncing existing data to Excel:', syncError.message);
      console.error('[Local Setup] Full error:', syncError);
    }

    console.log('[Local Setup] Setup complete, sending response');
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
      
      // Sync existing data from MongoDB to Excel files
      try {
        const excelService = new ExcelService(baseDir);
        
        // Sync Products
        const products = await Product.find({ userId: req.user._id });
        for (const product of products) {
          await excelService.upsertProduct(product);
        }
        
        // Sync Orders
        const orders = await Order.find({ userId: req.user._id });
        for (const order of orders) {
          await excelService.upsertOrder(order);
        }
        
        // Sync Customers
        const customers = await Customer.find({ userId: req.user._id });
        for (const customer of customers) {
          await excelService.upsertCustomer(customer);
        }
        
        // Sync Financial
        const financials = await Financial.find({ userId: req.user._id });
        for (const financial of financials) {
          await excelService.upsertTransaction(financial);
        }
        
        // Sync Suppliers
        const suppliers = await Supplier.find({ userId: req.user._id });
        for (const supplier of suppliers) {
          await excelService.upsertSupplier(supplier);
        }
        
        // Sync Returns
        const returns = await Return.find({ userId: req.user._id });
        for (const ret of returns) {
          await excelService.upsertReturn(ret);
        }
        
        // Sync Collections
        const collections = await Collection.find({ userId: req.user._id });
        for (const collection of collections) {
          await excelService.upsertCollection(collection);
        }
        
        console.log(`Synced ${products.length} products, ${orders.length} orders, ${customers.length} customers, ${financials.length} transactions, ${suppliers.length} suppliers, ${returns.length} returns, ${collections.length} collections to local Excel files`);
      } catch (syncError) {
        console.error('Error syncing existing data to Excel:', syncError.message);
      }
    }
    
    await req.user.save();
    res.json({ success: true, storageType, localPath: req.user.localPath });
  } catch (err) {
    console.error('Storage switch error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
