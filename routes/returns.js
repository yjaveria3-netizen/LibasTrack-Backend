const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Return = require('../models/Return');
const Order = require('../models/Order');
const { GoogleSheetsService, syncAsync } = require('../services/googleSheets');
const ExcelService = require('../services/excelService');
const { mongoIdValidation } = require('../middleware/validators');

function syncToSheets(user, ret, rowIndex = null) {
  if (!user.driveConnected || !user.spreadsheetIds?.returns) return;
  syncAsync(async () => {
    const tokens = user.getDecryptedTokens();
    if (!tokens) {
      console.error('Failed to decrypt tokens for Google Sheets sync');
      return;
    }
    const { accessToken, refreshToken } = tokens;
    const svc = new GoogleSheetsService(accessToken, refreshToken);
    // Headers: Return ID, Order ID, Customer ID, Customer Name, Product ID, Product Name, Reason, Type, Status, Refund Amount, Return Date, Notes
    const values = [
      ret.returnId, ret.orderId, ret.customerId || '', ret.customerName || '',
      ret.productId || '', ret.productName || '',
      ret.reason, ret.type || '', ret.status,
      ret.refundAmount || 0,
      new Date(ret.requestDate || ret.createdAt).toLocaleDateString('en-PK'),
      ret.notes || '',
    ];
    if (rowIndex) await svc.updateRow(user.spreadsheetIds.returns, rowIndex, values);
    else return await svc.appendRow(user.spreadsheetIds.returns, values);
  });
}

function syncToExcel(user, ret) {
  if (user.storageType !== 'local_excel' || !user.localPath) return;
  new ExcelService(user.localPath).upsertReturn(ret);
}

async function populateReturnRelations(userId, payload) {
  if (!payload.orderId) return payload;
  const order = await Order.findOne({ userId, orderId: payload.orderId })
    .select('customerId customerName items');
  if (!order) return payload;

  payload.customerId = payload.customerId || order.customerId || '';
  payload.customerName = payload.customerName || order.customerName || '';

  if ((!payload.productId || !payload.productName) && Array.isArray(order.items) && order.items.length > 0) {
    const item = order.items[0];
    payload.productId = payload.productId || item.productId || '';
    payload.productName = payload.productName || item.productName || '';
  }

  return payload;
}

// Helper function to escape regex special characters
function escapeRegex(str) {
  if (!str) return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page=1, limit=15, search, status, type } = req.query;
    const query = { userId: req.user._id };
    if (status) query.status = status;
    if (type) query.type = type;
    if (search) {
      const escapedSearch = escapeRegex(search);
      query.$or = [
        { orderId: { $regex: escapedSearch, $options:'i' } },
        { customerId: { $regex: escapedSearch, $options:'i' } },
        { customerName: { $regex: escapedSearch, $options:'i' } },
        { returnId: { $regex: escapedSearch, $options:'i' } },
      ];
    }
    const total = await Return.countDocuments(query);
    const returns = await Return.find(query).sort({ createdAt:-1 }).skip((page-1)*limit).limit(parseInt(limit));
    res.json({ success:true, returns, total, page:parseInt(page), totalPages:Math.ceil(total/limit) });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const total = await Return.countDocuments({ userId: req.user._id });
    const pending = await Return.countDocuments({ userId: req.user._id, status: { $in: ['Requested','Approved','Item Received','Inspected'] } });
    const completed = await Return.countDocuments({ userId: req.user._id, status: { $in: ['Completed','Refund Issued','Exchange Dispatched'] } });
    const refundAgg = await Return.aggregate([
      { $match: { userId: req.user._id, status: { $in: ['Refund Issued','Completed'] } } },
      { $group: { _id: null, total: { $sum: '$refundAmount' } } }
    ]);
    const byReason = await Return.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: '$reason', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    res.json({ success:true, total, pending, completed, totalRefunded: refundAgg[0]?.total || 0, byReason });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

// GET /api/returns/:id
router.get('/:id', authMiddleware, mongoIdValidation, async (req, res) => {
  try {
    const ret = await Return.findOne({ _id: req.params.id, userId: req.user._id });
    if (!ret) return res.status(404).json({ success: false, message: 'Return not found' });
    res.json({ success: true, return: ret });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});


router.post('/', authMiddleware, async (req, res) => {
  try {
    const payload = { ...req.body };

    // Validate orderId exists
    if (payload.orderId) {
      const order = await Order.findOne({ userId: req.user._id, orderId: payload.orderId });
      if (!order) {
        return res.status(400).json({ success: false, message: 'Order record not found for the provided Order ID' });
      }
    }

    // Validate customerId if provided
    if (payload.customerId) {
      const Customer = require('../models/Customer');
      const customer = await Customer.findOne({ userId: req.user._id, customerId: payload.customerId });
      if (!customer) {
        return res.status(400).json({ success: false, message: 'Customer record not found for the provided Customer ID' });
      }
    }

    // Validate productId if provided
    if (payload.productId) {
      const Product = require('../models/Product');
      const product = await Product.findOne({ userId: req.user._id, productId: payload.productId });
      if (!product) {
        return res.status(400).json({ success: false, message: 'Product record not found for the provided Product ID' });
      }
    }

    await populateReturnRelations(req.user._id, payload);
    const ret = new Return({ userId: req.user._id, ...payload });
    await ret.save();
    syncToSheets(req.user, ret);
    syncToExcel(req.user, ret);
    res.status(201).json({ success:true, return: ret });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

router.put('/:id', authMiddleware, mongoIdValidation, async (req, res) => {
  try {
    const ret = await Return.findOne({ _id: req.params.id, userId: req.user._id });
    if (!ret) return res.status(404).json({ success:false, message:'Not found' });
    const payload = { ...req.body };

    // Validate orderId if provided
    if (payload.orderId) {
      const order = await Order.findOne({ userId: req.user._id, orderId: payload.orderId });
      if (!order) {
        return res.status(400).json({ success: false, message: 'Order record not found for the provided Order ID' });
      }
    }

    // Validate customerId if provided
    if (payload.customerId) {
      const Customer = require('../models/Customer');
      const customer = await Customer.findOne({ userId: req.user._id, customerId: payload.customerId });
      if (!customer) {
        return res.status(400).json({ success: false, message: 'Customer record not found for the provided Customer ID' });
      }
    }

    // Validate productId if provided
    if (payload.productId) {
      const Product = require('../models/Product');
      const product = await Product.findOne({ userId: req.user._id, productId: payload.productId });
      if (!product) {
        return res.status(400).json({ success: false, message: 'Product record not found for the provided Product ID' });
      }
    }

    await populateReturnRelations(req.user._id, payload);
    Object.assign(ret, payload);
    await ret.save();
    syncToSheets(req.user, ret, ret.sheetRowIndex);
    syncToExcel(req.user, ret);
    res.json({ success:true, return: ret });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

router.delete('/:id', authMiddleware, mongoIdValidation, async (req, res) => {
  try {
    const ret = await Return.findOne({ _id: req.params.id, userId: req.user._id });
    if (!ret) return res.status(404).json({ success:false, message:'Not found' });
    if (ret.sheetRowIndex && req.user.driveConnected) {
      syncAsync(async () => {
        const { accessToken, refreshToken } = req.user.getDecryptedTokens();
        const svc = new GoogleSheetsService(accessToken, refreshToken);
        await svc.deleteRow(req.user.spreadsheetIds.returns, ret.sheetRowIndex);
      });
    }
    await ret.deleteOne();
    res.json({ success:true, message:'Return deleted' });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

module.exports = router;
