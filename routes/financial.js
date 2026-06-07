const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Financial = require('../models/Financial');
const Order = require('../models/Order');
const { GoogleSheetsService, syncAsync } = require('../services/googleSheets');
const ExcelService = require('../services/excelService');
const { mongoIdValidation } = require('../middleware/validators');

function syncToSheets(user, txn, rowIndex = null) {
  if (!user.driveConnected || !user.spreadsheetIds?.financial) return;
  syncAsync(async () => {
    const tokens = user.getDecryptedTokens();
    if (!tokens) {
      console.error('Failed to decrypt tokens for Google Sheets sync');
      return;
    }
    const { accessToken, refreshToken } = tokens;
    const svc = new GoogleSheetsService(accessToken, refreshToken);
    // Headers: Transaction ID, Order ID, Customer ID, Customer Name, Order Status, Order Total, Amount, Payment Method, Payment Status, Transaction Date
    const values = [
      txn.transactionId, txn.orderId, txn.customerId || '', txn.customerName || '',
      txn.orderStatus || '', txn.orderTotal || 0, txn.amount || txn.price || 0,
      txn.paymentMethod, txn.paymentStatus,
      new Date(txn.transactionDate || txn.createdAt).toLocaleDateString('en-PK'),
    ];
    if (rowIndex) await svc.updateRow(user.spreadsheetIds.financial, rowIndex, values);
    else return await svc.appendRow(user.spreadsheetIds.financial, values);
  });
}

function syncToExcel(user, txn) {
  if (user.storageType !== 'local_excel' || !user.localPath) return;
  new ExcelService(user.localPath).upsertTransaction(txn);
}

async function populateFinancialRelations(userId, payload) {
  if (!payload.orderId) return payload;

  const order = await Order.findOne({ userId, orderId: payload.orderId })
    .select('customerId customerName status total');

  if (!order) return payload;
  payload.customerId = order.customerId || payload.customerId;
  payload.customerName = order.customerName || payload.customerName;
  payload.orderStatus = order.status || payload.orderStatus;
  payload.orderTotal = Number(order.total || 0);
  return payload;
}

// Helper function to escape regex special characters
function escapeRegex(str) {
  if (!str) return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, paymentStatus, search } = req.query;
    const query = { userId: req.user._id };
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (search) {
      const escapedSearch = escapeRegex(search);
      query.$or = [
        { transactionId: { $regex: escapedSearch, $options: 'i' } },
        { orderId: { $regex: escapedSearch, $options: 'i' } },
      ];
    }
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
    const payload = { ...req.body };
    const { orderId, price, paymentMethod } = payload;
    if (!orderId || !price || !paymentMethod) {
      return res.status(400).json({ success: false, message: 'Order ID, price, and payment method are required' });
    }
    
    // Validate price is positive
    if (Number(price) < 0) {
      return res.status(400).json({ success: false, message: 'Price cannot be negative' });
    }

    // Validate orderId exists
    const order = await Order.findOne({ userId: req.user._id, orderId });
    if (!order) {
      return res.status(400).json({ success: false, message: 'Order record not found for the provided Order ID' });
    }

    await populateFinancialRelations(req.user._id, payload);
    const txn = new Financial({ userId: req.user._id, ...payload });
    await txn.save();
    syncToSheets(req.user, txn);
    syncToExcel(req.user, txn);
    res.status(201).json({ success: true, transaction: txn });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', authMiddleware, mongoIdValidation, async (req, res) => {
  try {
    const txn = await Financial.findOne({ _id: req.params.id, userId: req.user._id });
    if (!txn) return res.status(404).json({ success: false, message: 'Transaction not found' });
    const payload = { ...req.body };

    // Validate orderId if provided
    if (payload.orderId) {
      const order = await Order.findOne({ userId: req.user._id, orderId: payload.orderId });
      if (!order) {
        return res.status(400).json({ success: false, message: 'Order record not found for the provided Order ID' });
      }
    }

    await populateFinancialRelations(req.user._id, payload);
    Object.assign(txn, payload);
    await txn.save();
    syncToSheets(req.user, txn, txn.sheetRowIndex);
    syncToExcel(req.user, txn);
    res.json({ success: true, transaction: txn });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', authMiddleware, mongoIdValidation, async (req, res) => {
  try {
    const txn = await Financial.findOne({ _id: req.params.id, userId: req.user._id });
    if (!txn) return res.status(404).json({ success: false, message: 'Transaction not found' });
    if (txn.sheetRowIndex && req.user.driveConnected) {
      syncAsync(async () => {
        const { accessToken, refreshToken } = req.user.getDecryptedTokens();
        const svc = new GoogleSheetsService(accessToken, refreshToken);
        await svc.deleteRow(req.user.spreadsheetIds.financial, txn.sheetRowIndex);
      });
    }
    await txn.deleteOne();
    res.json({ success: true, message: 'Transaction deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
