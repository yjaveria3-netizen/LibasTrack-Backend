const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const authMiddleware = require('../middleware/auth');
const { GoogleSheetsService, syncAsync } = require('../services/googleSheets');
const User = require('../models/User');

/* POST /api/drive/connect
   Connects a Google Drive folder and creates all spreadsheets.
   Uses Promise.all for parallel creation — much faster than sequential. */
router.post('/connect', authMiddleware, async (req, res) => {
  try {
    const { driveName, driveLink } = req.body;
    if (!driveName || !driveLink) {
      return res.status(400).json({ success: false, message: 'Drive name and link are required' });
    }

    const { accessToken, refreshToken } = req.user.getDecryptedTokens();
    const sheetsService = new GoogleSheetsService(accessToken, refreshToken);
    const folderId = await sheetsService.getFolderIdFromLink(driveLink);

    if (!folderId) {
      return res.status(400).json({ success: false, message: 'Invalid Google Drive folder link. Make sure you paste the full folder URL.' });
    }

    // Find or create Database subfolder
    const dbFolderId = await sheetsService.findOrCreateSubfolder(folderId, 'Database');

    // Create all spreadsheets in parallel for speed
    const sheetTypes = ['products', 'orders', 'customers', 'financial', 'suppliers', 'collections', 'returns'];
    const sheetNames = ['Products', 'Orders', 'Customers', 'Financial', 'Suppliers', 'Collections', 'Returns'];

    const sheetIds = await Promise.all(
      sheetTypes.map((type, i) => sheetsService.createSpreadsheet(sheetNames[i], dbFolderId, type))
    );

    const spreadsheetIds = {};
    sheetTypes.forEach((type, i) => { spreadsheetIds[type] = sheetIds[i]; });

    // Update user — set both google and storage type
    req.user.driveConnected = true;
    req.user.driveName = driveName;
    req.user.driveLink = driveLink;
    req.user.driveId = folderId;
    req.user.spreadsheetIds = spreadsheetIds;
    req.user.storageType = 'google_drive';
    await req.user.save();

    const baseUrl = 'https://docs.google.com/spreadsheets/d/';
    res.json({
      success: true,
      message: 'Google Drive connected! All spreadsheets created.',
      spreadsheets: Object.fromEntries(
        sheetTypes.map((type, i) => [type, `${baseUrl}${sheetIds[i]}`])
      ),
    });
  } catch (err) {
    console.error('Drive connect error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to connect drive. Check permissions.' });
  }
});

/* GET /api/drive/status */
router.get('/status', authMiddleware, async (req, res) => {
  const baseUrl = 'https://docs.google.com/spreadsheets/d/';
  const ids = req.user.spreadsheetIds || {};
  res.json({
    success: true,
    connected: req.user.driveConnected,
    storageType: req.user.storageType,
    driveName: req.user.driveName,
    driveLink: req.user.driveLink,
    spreadsheets: req.user.driveConnected ? Object.fromEntries(
      Object.entries(ids).map(([k, v]) => [k, v ? `${baseUrl}${v}` : null])
    ) : null,
  });
});

const Product = require('../models/Product');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Financial = require('../models/Financial');
const Supplier = require('../models/Supplier');
const BrandCollection = require('../models/Collection');
const Return = require('../models/Return');

/* POST /api/drive/connect-existing
   Connects to an existing folder, identifies files, and imports data. */
router.post('/connect-existing', authMiddleware, async (req, res) => {
  try {
    const { driveName, driveLink } = req.body;
    if (!driveName || !driveLink) {
      return res.status(400).json({ success: false, message: 'Drive name and link are required' });
    }

    const { accessToken, refreshToken } = req.user.getDecryptedTokens();
    const sheetsService = new GoogleSheetsService(accessToken, refreshToken);
    const folderId = await sheetsService.getFolderIdFromLink(driveLink);

    if (!folderId) {
      return res.status(400).json({ success: false, message: 'Invalid folder link' });
    }

    // 1. Scan for files
    // Check root and a "Database" subfolder
    let allFiles = await sheetsService.listFilesInFolder(folderId);
    console.log(`[Drive Connect] Found ${allFiles.length} files in root folder.`);

    const dbSubfolder = allFiles.find(f => f.name === 'Database' && f.mimeType === 'application/vnd.google-apps.folder');
    
    if (dbSubfolder) {
      console.log('[Drive Connect] Found Database subfolder. Scanning inside...');
      const subFiles = await sheetsService.listFilesInFolder(dbSubfolder.id);
      allFiles = [...allFiles, ...subFiles];
      console.log(`[Drive Connect] Total files after scanning subfolder: ${allFiles.length}`);
    }

    console.log('[Drive Connect] Files available:', allFiles.map(f => `${f.name} (${f.mimeType})`));

    // 2. Identify spreadsheets
    const sheetTypes = ['products', 'orders', 'customers', 'financial', 'suppliers', 'collections', 'returns'];
    const modelMap = {
      products: Product, orders: Order, customers: Customer,
      financial: Financial, suppliers: Supplier, collections: BrandCollection, returns: Return
    };
    const idMap = {
      products: 'productId', orders: 'orderId', customers: 'customerId',
      financial: 'transactionId', suppliers: 'supplierId', collections: 'collectionId', returns: 'returnId'
    };

    const spreadsheetIds = {};
    const importStats = {};

    for (const type of sheetTypes) {
      const file = allFiles.find(f => f.name.toLowerCase().includes(type) && (f.mimeType === 'application/vnd.google-apps.spreadsheet' || f.mimeType.includes('spreadsheet')));
      if (file) {
        console.log(`[Drive Connect] Matched ${type} to file: ${file.name}`);
        spreadsheetIds[type] = file.id;
        
        // 3. Import data from this file
        try {
          const isXlsx = file.mimeType !== 'application/vnd.google-apps.spreadsheet';
          const rows = isXlsx 
            ? await sheetsService.getExcelValues(file.id)
            : await sheetsService.getSheetValues(file.id);
          
          console.log(`[Drive Connect] Fetched ${rows?.length || 0} rows for ${type}.`);
          if (rows && rows.length > 0) {
            const bulkOps = [];
            for (let i = 0; i < rows.length; i++) {
              const rowData = sheetsService.parseRowToModel(rows[i], type);
              if (rowData && rowData[idMap[type]]) {
                bulkOps.push({
                  updateOne: {
                    filter: { userId: req.user._id, [idMap[type]]: rowData[idMap[type]] },
                    update: { $set: { ...rowData, userId: req.user._id, sheetRowIndex: i + 2 } },
                    upsert: true
                  }
                });
              }
            }
            if (bulkOps.length > 0) {
              await modelMap[type].bulkWrite(bulkOps);
              importStats[type] = bulkOps.length;
            }
          }
        } catch (err) {
          console.error(`Error importing ${type}:`, err.message);
        }
      }
    }

    // 4. Save to user
    req.user.driveConnected = true;
    req.user.driveName = driveName;
    req.user.driveLink = driveLink;
    req.user.driveId = folderId;
    req.user.spreadsheetIds = spreadsheetIds;
    req.user.storageType = 'google_drive';
    await req.user.save();

    res.json({
      success: true,
      message: 'Workspace connected and data imported successfully!',
      importStats,
      spreadsheetIds
    });

  } catch (err) {
    console.error('Drive connect-existing error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* POST /api/drive/disconnect */
router.post('/disconnect', authMiddleware, async (req, res) => {
  try {
    req.user.driveConnected = false;
    req.user.storageType = null;
    await req.user.save();
    res.json({ success: true, message: 'Drive disconnected' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;