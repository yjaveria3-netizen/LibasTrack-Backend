const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Product = require('../models/Product');
const { GoogleSheetsService, PRODUCT_HEADERS } = require('../services/googleSheets');

// Helper to sync to Google Sheets
async function syncToSheets(user, product, rowIndex = null) {
  if (!user.driveConnected || !user.spreadsheetIds?.products) return null;
  try {
    const service = new GoogleSheetsService(user.accessToken, user.refreshToken);
    const values = [
      product.productId, product.name, product.category, product.size || '',
      product.color || '', product.price, product.stockQty, product.imageLink || ''
    ];
    if (rowIndex) {
      await service.updateRow(user.spreadsheetIds.products, rowIndex, values);
      return rowIndex;
    } else {
      const row = await service.appendRow(user.spreadsheetIds.products, values);
      return row;
    }
  } catch (err) {
    console.error('Sheets sync error:', err.message);
    return null;
  }
}

// Get all products
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
    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ success: true, products, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get single product
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, userId: req.user._id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create product
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, category, size, color, price, stockQty, imageLink } = req.body;
    if (!name || !category || !price) {
      return res.status(400).json({ success: false, message: 'Name, category, and price are required' });
    }

    const product = new Product({ userId: req.user._id, name, category, size, color, price, stockQty: stockQty || 0, imageLink });
    await product.save();

    const rowIndex = await syncToSheets(req.user, product);
    if (rowIndex) { product.sheetRowIndex = rowIndex; await product.save(); }

    res.status(201).json({ success: true, product, message: 'Product created and synced to Google Sheets!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update product
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, userId: req.user._id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    Object.assign(product, req.body);
    await product.save();

    if (product.sheetRowIndex) await syncToSheets(req.user, product, product.sheetRowIndex);

    res.json({ success: true, product, message: 'Product updated and synced!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete product
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, userId: req.user._id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    if (product.sheetRowIndex && req.user.driveConnected) {
      try {
        const service = new GoogleSheetsService(req.user.accessToken, req.user.refreshToken);
        await service.deleteRow(req.user.spreadsheetIds.products, product.sheetRowIndex);
      } catch (e) { console.error('Sheet delete error:', e.message); }
    }

    await product.deleteOne();
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get stats
router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const total = await Product.countDocuments({ userId: req.user._id });
    const lowStock = await Product.countDocuments({ userId: req.user._id, stockQty: { $lte: 5 } });
    const categories = await Product.distinct('category', { userId: req.user._id });
    const totalValue = await Product.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: null, total: { $sum: { $multiply: ['$price', '$stockQty'] } } } }
    ]);
    res.json({ success: true, total, lowStock, categories: categories.length, totalValue: totalValue[0]?.total || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
