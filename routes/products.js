const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Product = require('../models/Product');
const { GoogleSheetsService, syncAsync } = require('../services/googleSheets');
const ExcelService = require('../services/excelService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { productCreateValidation, mongoIdValidation } = require('../middleware/validators');

// Multer: store in memory, validate image types, max 10 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only image files are allowed (jpg, jpeg, png, webp, gif)'));
  },
});

/* ── Google Sheets sync ─────────────────────────────────────── */
function syncToSheets(user, product, rowIndex = null) {
  if (!user.driveConnected || !user.spreadsheetIds?.products) return;
  syncAsync(async () => {
    const { accessToken, refreshToken } = user.getDecryptedTokens();
    const svc = new GoogleSheetsService(accessToken, refreshToken);
    const values = [
      product.productId, product.name, product.category, product.subcategory || '',
      product.collection || '', product.season || '', product.fabric || '',
      product.costPrice || 0, product.price, product.salePrice || '',
      product.currency || 'PKR', product.sku || '', product.stockQty || 0,
      product.status, (product.tags || []).join(', '),
      product.imageLink || product.imageViewUrl || '',
      new Date(product.createdAt).toLocaleDateString(),
    ];
    if (rowIndex) await svc.updateRow(user.spreadsheetIds.products, rowIndex, values);
    else return await svc.appendRow(user.spreadsheetIds.products, values);
  });
}

/* ── Excel sync ─────────────────────────────────────────────── */
function syncToExcel(user, product) {
  if (user.storageType !== 'local_excel' || !user.localPath) return;
  new ExcelService(user.localPath).upsertProduct(product);
}

/**
 * Save an uploaded image buffer to <localPath>/Images/<filename>
 * Returns the saved file path (string) or null on failure.
 */
function saveImageLocally(user, filename, buffer) {
  try {
    if (!user.localPath) return null;

    // Use the dedicated Images/products sub-folder
    const imagesDir = path.join(user.localPath, 'Images', 'products');
    fs.mkdirSync(imagesDir, { recursive: true });   // safety: create if missing

    const dest = path.join(imagesDir, filename);
    fs.writeFileSync(dest, buffer);
    return dest;
  } catch (e) {
    console.error('Image save error:', e.message);
    return null;
  }
}

/**
 * Delete an image file from disk (best-effort, never throws).
 */
function deleteImageLocally(imagePath) {
  if (!imagePath) return;
  try {
    // Strip file:// prefix if present
    const filePath = imagePath.startsWith('file://') ? imagePath.slice(7) : imagePath;
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.error('Image delete error:', e.message);
  }
}

function normalizeProductPayload(body = {}) {
  const payload = { ...body };

  if (payload.variants !== undefined) {
    if (payload.variants === '' || payload.variants === null) {
      payload.variants = [];
    } else if (typeof payload.variants === 'string') {
      try {
        const parsed = JSON.parse(payload.variants);
        payload.variants = Array.isArray(parsed) ? parsed : [];
      } catch {
        payload.variants = [];
      }
    } else if (!Array.isArray(payload.variants)) {
      payload.variants = [];
    }
  }

  return payload;
}

/* ── Routes ─────────────────────────────────────────────────── */

// GET /api/products
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, category, status, search } = req.query;
    // Enforce server-side limit cap (max 100)
    const safeLim = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const safePage = Math.max(1, parseInt(page) || 1);
    
    const query = { userId: req.user._id };
    if (category) query.category = category;
    if (status) query.status = status;
    if (search) query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { productId: { $regex: search, $options: 'i' } },
      { sku: { $regex: search, $options: 'i' } },
    ];
    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLim)
      .limit(safeLim);
    res.json({ success: true, products, total, page: safePage, totalPages: Math.ceil(total / safeLim) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/products/stats/summary
router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const [total, lowStock, categories, totalValue] = await Promise.all([
      Product.countDocuments({ userId: req.user._id }),
      Product.countDocuments({ userId: req.user._id, stockQty: { $lte: 5 } }),
      Product.distinct('category', { userId: req.user._id }),
      Product.aggregate([
        { $match: { userId: req.user._id } },
        { $group: { _id: null, total: { $sum: { $multiply: ['$price', '$stockQty'] } } } },
      ]),
    ]);
    res.json({ success: true, total, lowStock, categories: categories.length, totalValue: totalValue[0]?.total || 0 });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/products/stats/low-stock
router.get('/stats/low-stock', authMiddleware, async (req, res) => {
  try {
    const products = await Product.find({ 
      userId: req.user._id, 
      $expr: { $lte: ['$stockQty', '$lowStockAlert'] }
    })
    .sort({ stockQty: 1 })
    .limit(10)
    .select('name productId sku stockQty lowStockAlert');
    res.json({ success: true, lowStockProducts: products });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/products/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, userId: req.user._id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/products
router.post('/', authMiddleware, upload.single('image'), productCreateValidation, async (req, res) => {
  try {
    const payload = normalizeProductPayload(req.body);
    const { name, category, price } = payload;
    if (!name || !category || !price) {
      return res.status(400).json({ success: false, message: 'Name, category, and price are required' });
    }

    const product = new Product({ userId: req.user._id, ...payload });

    // Handle image upload
    if (req.file) {
      const filename = `${Date.now()}_${req.file.originalname.replace(/\s/g, '_')}`;

      if (req.user.storageType === 'local_excel' && req.user.localPath) {
        // Local mode → save to <workspace>/Images/
        const localPath = saveImageLocally(req.user, filename, req.file.buffer);
        if (localPath) {
          product.imageLink = `file://${localPath}`;
          product.imageThumbnailUrl = `file://${localPath}`;
        }
      }
      // Google Drive image upload is handled client-side (Drive API);
      // the imageLink / imageViewUrl fields come in via req.body in that flow.
    }

    await product.save();
    syncToSheets(req.user, product);
    syncToExcel(req.user, product);
    res.status(201).json({ success: true, product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT /api/products/:id
router.put('/:id', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const payload = normalizeProductPayload(req.body);
    const product = await Product.findOne({ _id: req.params.id, userId: req.user._id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    // If a new image is uploaded and there was an old local image, delete it
    if (req.file && product.imageLink && product.imageLink.startsWith('file://')) {
      deleteImageLocally(product.imageLink);
    }

    Object.assign(product, payload);

    if (req.file) {
      const filename = `${Date.now()}_${req.file.originalname.replace(/\s/g, '_')}`;

      if (req.user.storageType === 'local_excel' && req.user.localPath) {
        const localPath = saveImageLocally(req.user, filename, req.file.buffer);
        if (localPath) {
          product.imageLink = `file://${localPath}`;
          product.imageThumbnailUrl = `file://${localPath}`;
        }
      }
    }

    // Handle image removal (frontend sends removeImage: 'true')
    if (payload.removeImage === 'true') {
      if (product.imageLink && product.imageLink.startsWith('file://')) {
        deleteImageLocally(product.imageLink);
      }
      product.imageLink = '';
      product.imageViewUrl = '';
      product.imageThumbnailUrl = '';
      product.imageDriveFileId = '';
    }

    await product.save();
    syncToSheets(req.user, product, product.sheetRowIndex);
    syncToExcel(req.user, product);
    res.json({ success: true, product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/products/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, userId: req.user._id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    // Delete local image if it exists
    if (product.imageLink && product.imageLink.startsWith('file://')) {
      deleteImageLocally(product.imageLink);
    }

    // Remove from Google Sheets
    if (product.sheetRowIndex && req.user.driveConnected) {
      syncAsync(async () => {
        const { accessToken, refreshToken } = req.user.getDecryptedTokens();
        const svc = new GoogleSheetsService(accessToken, refreshToken);
        await svc.deleteRow(req.user.spreadsheetIds.products, product.sheetRowIndex);
      });
    }

    await product.deleteOne();
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;