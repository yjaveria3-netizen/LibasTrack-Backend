const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Order = require('../models/Order');
const { GoogleSheetsService } = require('../services/googleSheets');

async function syncToSheets(user, order, rowIndex = null) {
  if (!user.driveConnected || !user.spreadsheetIds?.orders) return null;
  try {
    const service = new GoogleSheetsService(user.accessToken, user.refreshToken);
    const values = [
      order.orderId, order.customerId, order.productId, order.quantity,
      order.total, order.status, new Date(order.orderDate).toLocaleDateString('en-PK')
    ];
    if (rowIndex) { await service.updateRow(user.spreadsheetIds.orders, rowIndex, values); return rowIndex; }
    return await service.appendRow(user.spreadsheetIds.orders, values);
  } catch (err) { console.error('Sheets sync error:', err.message); return null; }
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const query = { userId: req.user._id };
    if (status) query.status = status;
    if (search) query.$or = [
      { orderId: { $regex: search, $options: 'i' } },
      { customerId: { $regex: search, $options: 'i' } }
    ];
    const total = await Order.countDocuments(query);
    const orders = await Order.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    res.json({ success: true, orders, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { customerId, productId, quantity, total, status, orderDate } = req.body;
    if (!customerId || !productId || !quantity || !total) {
      return res.status(400).json({ success: false, message: 'Customer ID, Product ID, quantity, and total are required' });
    }
    const order = new Order({ userId: req.user._id, customerId, productId, quantity, total, status: status || 'Pending', orderDate: orderDate || new Date() });
    await order.save();
    const rowIndex = await syncToSheets(req.user, order);
    if (rowIndex) { order.sheetRowIndex = rowIndex; await order.save(); }
    res.status(201).json({ success: true, order, message: 'Order created and synced to Google Sheets!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    Object.assign(order, req.body);
    await order.save();
    if (order.sheetRowIndex) await syncToSheets(req.user, order, order.sheetRowIndex);
    res.json({ success: true, order, message: 'Order updated and synced!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.sheetRowIndex && req.user.driveConnected) {
      try { const s = new GoogleSheetsService(req.user.accessToken, req.user.refreshToken); await s.deleteRow(req.user.spreadsheetIds.orders, order.sheetRowIndex); } catch (e) {}
    }
    await order.deleteOne();
    res.json({ success: true, message: 'Order deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const total = await Order.countDocuments({ userId: req.user._id });
    const pending = await Order.countDocuments({ userId: req.user._id, status: 'Pending' });
    const delivered = await Order.countDocuments({ userId: req.user._id, status: 'Delivered' });
    const revenue = await Order.aggregate([
      { $match: { userId: req.user._id, status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    res.json({ success: true, total, pending, delivered, revenue: revenue[0]?.total || 0 });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
