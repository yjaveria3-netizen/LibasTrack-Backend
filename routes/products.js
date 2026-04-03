const express = require('express');
const router = express.Router();
const multer = require('multer');
const authMiddleware = require('../middleware/auth');
const Product = require('../models/Product');
const { GoogleSheetsService, PRODUCT_HEADERS } = require('../services/googleSheets');
const DriveUploadService = require('../services/driveUpload');

// Multer — memory storage, max 10MB, images only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed (JPEG, PNG, WEBP, GIF)'));
  }
});

function getExt(mime) {
  const map = { 'image/jpeg':'.jpg','image/jpg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif' };
  return map[mime] || '.jpg';
}

async function getProductImagesFolderId(user) {
  if (!user.driveConnected || !user.driveId) return null;
  try {
    const svc = new DriveUploadService(user.accessToken, user.refreshToken);
    const imagesFolderId = await svc.findOrCreateFolder(user.driveId, 'Images');
    return await svc.findOrCreateFolder(imagesFolderId, 'Product');
  } catch (err) {
    console.error('Product folder error:', err.message);
    return null;
  }
}

async function syncToSheets(user, product, rowIndex = null) {
  if (!user.driveConnected || !user.spreadsheetIds?.products) return null;
  try {
    const service = new GoogleSheetsService(user.accessToken, user.refreshToken);
    const values = [
      product.productId, product.name, product.category, product.size || '',
      product.color || '', product.price, product.stockQty,
      product.imageViewUrl || product.imageLink || ''
    ];
    if (rowIndex) { await service.updateRow(user.spreadsheetIds.products, rowIndex, values); return rowIndex; }
    return await service.appendRow(user.spreadsheetIds.products, values);
  } catch (err) { console.error('Sheets sync error:', err.message); return null; }
}

// GET all
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, category, search } = req.query;
    const query = { userId: req.user._id };
    if (category) query.category = category;
    if (search) query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { productId: { $regex: search, $options: 'i' } }
    ];
    const total = await Product.countDocuments(query);
    const products = await Product.find(query).sort({ createdAt: -1 }).skip((page-1)*limit).limit(parseInt(limit));
    res.json({ success: true, products, total, page: parseInt(page), totalPages: Math.ceil(total/limit) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET single
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, userId: req.user._id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST create with image upload
router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { name, category, size, color, price, stockQty } = req.body;
    if (!name || !category || !price)
      return res.status(400).json({ success: false, message: 'Name, category, and price are required' });

    let imageLink = '', imageViewUrl = '', imageDriveFileId = '', imageThumbnailUrl = '';

    if (req.file && req.user.driveConnected) {
      try {
        const folderId = await getProductImagesFolderId(req.user);
        if (folderId) {
          const svc = new DriveUploadService(req.user.accessToken, req.user.refreshToken);
          const uploaded = await svc.uploadImage(
            req.file.buffer,
            `${name.replace(/\s+/g,'_')}_${Date.now()}${getExt(req.file.mimetype)}`,
            req.file.mimetype, folderId
          );
          imageLink = uploaded.viewUrl;
          imageViewUrl = uploaded.viewUrl;
          imageDriveFileId = uploaded.fileId;
          imageThumbnailUrl = uploaded.directUrl;
        }
      } catch (e) { console.error('Image upload failed:', e.message); }
    }

    const product = new Product({
      userId: req.user._id, name, category, size, color,
      price: parseFloat(price), stockQty: parseInt(stockQty) || 0,
      imageLink, imageViewUrl, imageDriveFileId, imageThumbnailUrl
    });
    await product.save();
    const rowIndex = await syncToSheets(req.user, product);
    if (rowIndex) { product.sheetRowIndex = rowIndex; await product.save(); }

    res.status(201).json({
      success: true, product,
      message: imageLink
        ? 'Product created! Image uploaded to Drive & synced to Sheets!'
        : 'Product created and synced to Sheets!'
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT update with optional new image
router.put('/:id', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, userId: req.user._id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const { name, category, size, color, price, stockQty } = req.body;
    if (name) product.name = name;
    if (category) product.category = category;
    if (size !== undefined) product.size = size;
    if (color !== undefined) product.color = color;
    if (price) product.price = parseFloat(price);
    if (stockQty !== undefined) product.stockQty = parseInt(stockQty);

    if (req.file && req.user.driveConnected) {
      try {
        if (product.imageDriveFileId) {
          const svc = new DriveUploadService(req.user.accessToken, req.user.refreshToken);
          await svc.deleteFile(product.imageDriveFileId);
        }
        const folderId = await getProductImagesFolderId(req.user);
        if (folderId) {
          const svc = new DriveUploadService(req.user.accessToken, req.user.refreshToken);
          const uploaded = await svc.uploadImage(
            req.file.buffer,
            `${product.name.replace(/\s+/g,'_')}_${Date.now()}${getExt(req.file.mimetype)}`,
            req.file.mimetype, folderId
          );
          product.imageLink = uploaded.viewUrl;
          product.imageViewUrl = uploaded.viewUrl;
          product.imageDriveFileId = uploaded.fileId;
          product.imageThumbnailUrl = uploaded.directUrl;
        }
      } catch (e) { console.error('Image update failed:', e.message); }
    }

    await product.save();
    if (product.sheetRowIndex) await syncToSheets(req.user, product, product.sheetRowIndex);
    res.json({ success: true, product, message: 'Product updated and synced!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE product + Drive image
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, userId: req.user._id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    if (product.sheetRowIndex && req.user.driveConnected) {
      try { const s = new GoogleSheetsService(req.user.accessToken, req.user.refreshToken); await s.deleteRow(req.user.spreadsheetIds.products, product.sheetRowIndex); } catch (e) {}
    }
    if (product.imageDriveFileId && req.user.driveConnected) {
      try { const s = new DriveUploadService(req.user.accessToken, req.user.refreshToken); await s.deleteFile(product.imageDriveFileId); } catch (e) {}
    }
    await product.deleteOne();
    res.json({ success: true, message: 'Product and image deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET stats
router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const total = await Product.countDocuments({ userId: req.user._id });
    const lowStock = await Product.countDocuments({ userId: req.user._id, stockQty: { $lte: 5 } });
    const categories = await Product.distinct('category', { userId: req.user._id });
    const totalValue = await Product.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: null, total: { $sum: { $multiply: ['$price','$stockQty'] } } } }
    ]);
    res.json({ success: true, total, lowStock, categories: categories.length, totalValue: totalValue[0]?.total || 0 });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;