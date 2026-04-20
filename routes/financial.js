const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Financial = require('../models/Financial');
const { GoogleSheetsService, syncAsync } = require('../services/googleSheets');
const ExcelService = require('../services/excelService');

function syncToSheets(user, txn, rowIndex = null) {
  if (!user.driveConnected || !user.spreadsheetIds?.financial) return;
  syncAsync(async () => {
    const svc = new GoogleSheetsService(user.accessToken, user.refreshToken);
    const values = [
      txn.transactionId, txn.orderId, txn.price, txn.paymentMethod,
      txn.paymentStatus, new Date(txn.transactionDate || txn.createdAt).toLocaleDateString('en-PK'),
    ];
    if (rowIndex) await svc.updateRow(user.spreadsheetIds.financial, rowIndex, values);
    else return await svc.appendRow(user.spreadsheetIds.financial, values);
  });
}

function syncToExcel(user, txn) {
  if (user.storageType !== 'local_excel' || !user.localPath) return;
  new ExcelService(user.localPath).upsertTransaction(txn);
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, paymentStatus, search } = req.query;
    const query = { userId: req.user._id };
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (search) query.$or = [
      { transactionId: { $regex: search, $options: 'i' } },
      { orderId: { $regex: search, $options: 'i' } },
    ];
    const total = await Financial.countDocuments(query);
    const transactions = await Financial.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    res.json({ success: true, transactions, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const [total, completed, pending, byMethod] = await Promise.all([
      Financial.countDocuments({ userId: req.user._id }),
      Financial.aggregate([{ $match: { userId: req.user._id, paymentStatus: 'Completed' } }, { $group: { _id: null, total: { $sum: '$price' } } }]),
      Financial.aggregate([{ $match: { userId: req.user._id, paymentStatus: 'Pending' } }, { $group: { _id: null, total: { $sum: '$price' } } }]),
      Financial.aggregate([{ $match: { userId: req.user._id } }, { $group: { _id: '$paymentMethod', count: { $sum: 1 }, total: { $sum: '$price' } } }]),
    ]);
    res.json({ success: true, total, completedRevenue: completed[0]?.total || 0, pendingRevenue: pending[0]?.total || 0, byMethod });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { orderId, price, paymentMethod } = req.body;
    if (!orderId || !price || !paymentMethod) {
      return res.status(400).json({ success: false, message: 'Order ID, price, and payment method are required' });
    }
    const txn = new Financial({ userId: req.user._id, ...req.body });
    await txn.save();
    syncToSheets(req.user, txn);
    syncToExcel(req.user, txn);
    res.status(201).json({ success: true, transaction: txn });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const txn = await Financial.findOne({ _id: req.params.id, userId: req.user._id });
    if (!txn) return res.status(404).json({ success: false, message: 'Transaction not found' });
    Object.assign(txn, req.body);
    await txn.save();
    syncToSheets(req.user, txn, txn.sheetRowIndex);
    syncToExcel(req.user, txn);
    res.json({ success: true, transaction: txn });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const txn = await Financial.findOne({ _id: req.params.id, userId: req.user._id });
    if (!txn) return res.status(404).json({ success: false, message: 'Transaction not found' });
    if (txn.sheetRowIndex && req.user.driveConnected) {
      syncAsync(async () => {
        const svc = new GoogleSheetsService(req.user.accessToken, req.user.refreshToken);
        await svc.deleteRow(req.user.spreadsheetIds.financial, txn.sheetRowIndex);
      });
    }
    await txn.deleteOne();
    res.json({ success: true, message: 'Transaction deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;