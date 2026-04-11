/**
 * LibasTrack — Storage Routes
 * Handles the user's choice between Google Drive and Local Excel
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const { setupLocalFolder, syncSheet } = require('../services/excelService');

/**
 * GET /storage/status
 * Returns the user's current storage type and local path
 */
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('storageType localPath driveConnected brand');
    res.json({
      storageType: user.storageType,
      localPath: user.localPath || null,
      driveConnected: user.driveConnected,
      brandName: user.brand?.name || 'My Brand',
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to get storage status' });
  }
});

/**
 * POST /storage/choose
 * Body: { type: 'google_drive' | 'local_excel' }
 * Saves the user's storage preference
 */
router.post('/choose', authMiddleware, async (req, res) => {
  const { type } = req.body;
  if (!['google_drive', 'local_excel'].includes(type)) {
    return res.status(400).json({ message: 'Invalid storage type. Must be google_drive or local_excel' });
  }

  try {
    const user = await User.findById(req.user.id);
    user.storageType = type;
    await user.save();

    res.json({ success: true, storageType: type });
  } catch (err) {
    res.status(500).json({ message: 'Failed to save storage preference' });
  }
});

/**
 * POST /storage/setup-local
 * Creates the LibasTrack folder + all Excel workbooks on the PC
 * Returns the folder path that was created
 */
router.post('/setup-local', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const brandName = user.brand?.name || 'My Brand';

    // Create folder structure + Excel files
    const folderPath = await setupLocalFolder(user._id.toString(), brandName);

    // Save path to user profile
    user.localPath = folderPath;
    user.storageType = 'local_excel';
    await user.save();

    res.json({
      success: true,
      folderPath,
      message: `LibasTrack folder created at: ${folderPath}`,
    });
  } catch (err) {
    console.error('Setup local storage error:', err);
    res.status(500).json({ message: 'Failed to create local storage: ' + err.message });
  }
});

/**
 * POST /storage/sync-excel
 * Force-syncs current DB data to all Excel sheets
 * Useful after switching to local_excel mode
 */
router.post('/sync-excel', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user.localPath) return res.status(400).json({ message: 'No local path configured' });

    // Lazy-require models to avoid circular deps
    const Product  = require('../models/Product');
    const Order    = require('../models/Order');
    const Customer = require('../models/Customer');
    const Financial = require('../models/Financial');
    const Supplier = require('../models/Supplier');

    const userId = user._id;

    const [products, orders, customers, financials, suppliers] = await Promise.all([
      Product.find({ user: userId }).lean(),
      Order.find({ user: userId }).lean(),
      Customer.find({ user: userId }).lean(),
      Financial.find({ user: userId }).lean(),
      Supplier.find({ user: userId }).lean(),
    ]);

    await Promise.all([
      syncSheet(user.localPath, 'Products', products.map(p => ({
        productId: p.productId, name: p.name, category: p.category,
        season: p.season, fabric: p.fabric, costPrice: p.costPrice,
        price: p.price, salePrice: p.salePrice, stockQty: p.stockQty,
        status: p.status, collection: p.collection, sku: p.sku,
        tags: Array.isArray(p.tags) ? p.tags.join(', ') : '',
        description: p.description,
        createdAt: p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '',
      }))),
      syncSheet(user.localPath, 'Orders', orders.map(o => ({
        orderId: o.orderId, customerName: o.customerName, phone: o.phone,
        city: o.city, status: o.status, channel: o.channel,
        totalAmount: o.totalAmount, paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        itemsSummary: (o.items||[]).map(i => `${i.name} x${i.qty}`).join('; '),
        notes: o.notes,
        orderDate: o.orderDate ? new Date(o.orderDate).toLocaleDateString() : '',
        deliveryDate: o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString() : '',
      }))),
      syncSheet(user.localPath, 'Customers', customers.map(c => ({
        customerId: c.customerId, fullName: c.fullName, email: c.email,
        phone: c.phone, whatsapp: c.whatsapp, city: c.city, country: c.country,
        segment: c.segment, source: c.source, totalSpent: c.totalSpent,
        totalOrders: c.totalOrders, notes: c.notes,
        dateJoined: c.dateJoined ? new Date(c.dateJoined).toLocaleDateString() : '',
      }))),
      syncSheet(user.localPath, 'Financial', financials.map(f => ({
        transactionId: f.transactionId, orderId: f.orderId, price: f.price,
        paymentMethod: f.paymentMethod, paymentStatus: f.paymentStatus,
        note: f.note,
        transactionDate: f.transactionDate ? new Date(f.transactionDate).toLocaleDateString() : '',
      }))),
      syncSheet(user.localPath, 'Suppliers', suppliers.map(s => ({
        supplierId: s.supplierId, name: s.name, contact: s.contact,
        category: s.category, rating: s.rating, status: s.status,
        leadTime: s.leadTime, minOrder: s.minOrder, notes: s.notes,
      }))),
    ]);

    res.json({ success: true, message: 'All Excel files updated successfully' });
  } catch (err) {
    console.error('Excel sync error:', err);
    res.status(500).json({ message: 'Excel sync failed: ' + err.message });
  }
});

/**
 * GET /storage/open-folder
 * Returns the local folder path so the frontend can display it
 */
router.get('/open-folder', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('localPath storageType');
    if (!user.localPath) return res.status(404).json({ message: 'No local folder configured' });
    res.json({ folderPath: user.localPath });
  } catch (err) {
    res.status(500).json({ message: 'Failed to get folder path' });
  }
});

module.exports = router;
