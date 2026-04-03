const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { GoogleSheetsService, PRODUCT_HEADERS, ORDER_HEADERS, CUSTOMER_HEADERS, FINANCIAL_HEADERS } = require('../services/googleSheets');
const User = require('../models/User');

// Connect drive
router.post('/connect', authMiddleware, async (req, res) => {
  try {
    const { driveName, driveLink } = req.body;
    if (!driveName || !driveLink) {
      return res.status(400).json({ success: false, message: 'Drive name and link are required' });
    }

    const sheetsService = new GoogleSheetsService(req.user.accessToken, req.user.refreshToken);
    const folderId = sheetsService.extractFolderId(driveLink);

    if (!folderId) {
      return res.status(400).json({ success: false, message: 'Invalid Google Drive folder link' });
    }

    // Find or create Database subfolder
    const { google } = require('googleapis');
    const oauth2Client = new (require('googleapis').google.auth.OAuth2)(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({ access_token: req.user.accessToken, refresh_token: req.user.refreshToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Find Database folder or use root folder
    let dbFolderId = folderId;
    try {
      const dbSearch = await drive.files.list({
        q: `'${folderId}' in parents and name='Database' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)'
      });
      if (dbSearch.data.files.length > 0) {
        dbFolderId = dbSearch.data.files[0].id;
      }
    } catch (e) {
      console.log('Database subfolder not found, using root folder');
    }

    // Create spreadsheets for each data type
    const [productsSheetId, ordersSheetId, customersSheetId, financialSheetId] = await Promise.all([
      sheetsService.findOrCreateSpreadsheet(dbFolderId, 'Products', PRODUCT_HEADERS),
      sheetsService.findOrCreateSpreadsheet(dbFolderId, 'Orders', ORDER_HEADERS),
      sheetsService.findOrCreateSpreadsheet(dbFolderId, 'Customer', CUSTOMER_HEADERS),
      sheetsService.findOrCreateSpreadsheet(dbFolderId, 'Financial', FINANCIAL_HEADERS)
    ]);

    // Update user
    req.user.driveConnected = true;
    req.user.driveName = driveName;
    req.user.driveLink = driveLink;
    req.user.driveId = folderId;
    req.user.spreadsheetIds = {
      products: productsSheetId,
      orders: ordersSheetId,
      customers: customersSheetId,
      financial: financialSheetId
    };
    await req.user.save();

    res.json({
      success: true,
      message: 'Google Drive connected successfully! Spreadsheets are ready.',
      spreadsheets: {
        products: `https://docs.google.com/spreadsheets/d/${productsSheetId}`,
        orders: `https://docs.google.com/spreadsheets/d/${ordersSheetId}`,
        customers: `https://docs.google.com/spreadsheets/d/${customersSheetId}`,
        financial: `https://docs.google.com/spreadsheets/d/${financialSheetId}`
      }
    });
  } catch (err) {
    console.error('Drive connect error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to connect drive' });
  }
});

// Get drive status
router.get('/status', authMiddleware, async (req, res) => {
  res.json({
    success: true,
    connected: req.user.driveConnected,
    driveName: req.user.driveName,
    driveLink: req.user.driveLink,
    spreadsheets: req.user.spreadsheetIds ? {
      products: req.user.spreadsheetIds.products ? `https://docs.google.com/spreadsheets/d/${req.user.spreadsheetIds.products}` : null,
      orders: req.user.spreadsheetIds.orders ? `https://docs.google.com/spreadsheets/d/${req.user.spreadsheetIds.orders}` : null,
      customers: req.user.spreadsheetIds.customers ? `https://docs.google.com/spreadsheets/d/${req.user.spreadsheetIds.customers}` : null,
      financial: req.user.spreadsheetIds.financial ? `https://docs.google.com/spreadsheets/d/${req.user.spreadsheetIds.financial}` : null
    } : null
  });
});

module.exports = router;
