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

    const sheetsService = new GoogleSheetsService(req.user.accessToken, req.user.refreshToken);
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