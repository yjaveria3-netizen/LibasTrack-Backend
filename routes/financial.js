const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Financial = require('../models/Financial');
const { GoogleSheetsService } = require('../services/googleSheets');

async function syncToSheets(user, txn, rowIndex = null) {
  if (!user.driveConnected || !user.spreadsheetIds?.financial) return null;
  try {
    const service = new GoogleSheetsService(user.accessToken, user.refreshToken);
    const values = [
      txn.transactionId, txn.orderId, txn.price, txn.paymentMethod,
      txn.paymentStatus, new Date(txn.transactionDate).toLocaleDateString('en-PK')
    ];
    if (rowIndex) { await service.updateRow(user.spreadsheetIds.financial, rowIndex, values); return rowIndex; }
    return await service.appendRow(user.spreadsheetIds.financial, values);
  } catch (err) { console.error('Sheets sync error:', err.message); return null; }
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, paymentStatus, search } = req.query;
    const query = { userId: req.user._id };
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (search) query.$or = [
      { transactionId: { $regex: search, $options: 'i' } },
      { orderId: { $regex: search, $options: 'i' } }
    ];
    const total = await Financial.countDocuments(query);
    const transactions = await Financial.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    res.json({ success: true, transactions, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { orderId, price, paymentMethod, paymentStatus, transactionDate } = req.body;
    if (!orderId || !price || !paymentMethod) {
      return res.status(400).json({ success: false, message: 'Order ID, price, and payment method are required' });
    }
    const txn = new Financial({ userId: req.user._id, orderId, price, paymentMethod, paymentStatus: paymentStatus || 'Pending', transactionDate: transactionDate || new Date() });
    await txn.save();
    const rowIndex = await syncToSheets(req.user, txn);
    if (rowIndex) { txn.sheetRowIndex = rowIndex; await txn.save(); }
    res.status(201).json({ success: true, transaction: txn, message: 'Transaction recorded and synced to Google Sheets!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const txn = await Financial.findOne({ _id: req.params.id, userId: req.user._id });
    if (!txn) return res.status(404).json({ success: false, message: 'Transaction not found' });
    Object.assign(txn, req.body);
    await txn.save();
    if (txn.sheetRowIndex) await syncToSheets(req.user, txn, txn.sheetRowIndex);
    res.json({ success: true, transaction: txn, message: 'Transaction updated and synced!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const txn = await Financial.findOne({ _id: req.params.id, userId: req.user._id });
    if (!txn) return res.status(404).json({ success: false, message: 'Transaction not found' });
    if (txn.sheetRowIndex && req.user.driveConnected) {
      try { const s = new GoogleSheetsService(req.user.accessToken, req.user.refreshToken); await s.deleteRow(req.user.spreadsheetIds.financial, txn.sheetRowIndex); } catch (e) {}
    }
    await txn.deleteOne();
    res.json({ success: true, message: 'Transaction deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const total = await Financial.countDocuments({ userId: req.user._id });
    const completed = await Financial.aggregate([
      { $match: { userId: req.user._id, paymentStatus: 'Completed' } },
      { $group: { _id: null, total: { $sum: '$price' } } }
    ]);
    const pending = await Financial.aggregate([
      { $match: { userId: req.user._id, paymentStatus: 'Pending' } },
      { $group: { _id: null, total: { $sum: '$price' } } }
    ]);
    const byMethod = await Financial.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: '$paymentMethod', count: { $sum: 1 }, total: { $sum: '$price' } } }
    ]);
    res.json({ success: true, total, completedRevenue: completed[0]?.total || 0, pendingRevenue: pending[0]?.total || 0, byMethod });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
