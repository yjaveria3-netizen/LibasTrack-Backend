const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const { GoogleSheetsService, syncAsync } = require('../services/googleSheets');
const ExcelService = require('../services/excelService');
const PDFDocument = require('pdfkit');

function syncToSheets(user, order, rowIndex = null) {
  if (!user.driveConnected || !user.spreadsheetIds?.orders) return;
  syncAsync(async () => {
    const { accessToken, refreshToken } = user.getDecryptedTokens();
    const svc = new GoogleSheetsService(accessToken, refreshToken);
    const values = [
      order.orderId, order.customerId, order.customerName || '', order.customerPhone || '',
      order.subtotal, order.discountAmount || 0, order.shippingCost || 0, order.taxAmount || 0,
      order.total, order.currency || 'PKR', order.status, order.channel || '',
      order.priority || 'Normal', order.shippingMethod || '', order.courierName || '',
      order.trackingNumber || '', order.shippingAddress || '',
      order.estimatedDelivery ? new Date(order.estimatedDelivery).toLocaleDateString() : '',
      order.notes || '',
      new Date(order.orderDate || order.createdAt).toLocaleDateString('en-PK'),
    ];
    if (rowIndex) await svc.updateRow(user.spreadsheetIds.orders, rowIndex, values);
    else return await svc.appendRow(user.spreadsheetIds.orders, values);
  });
}

function syncToExcel(user, order) {
  if (user.storageType !== 'local_excel' || !user.localPath) return;
  new ExcelService(user.localPath).upsertOrder(order);
}

function normalizeOrderPayload(body = {}) {
  const payload = { ...body };

  if (payload.items !== undefined) {
    if (payload.items === '' || payload.items === null) {
      payload.items = [];
    } else if (typeof payload.items === 'string') {
      try {
        const parsed = JSON.parse(payload.items);
        payload.items = Array.isArray(parsed) ? parsed : [];
      } catch {
        payload.items = [];
      }
    } else if (!Array.isArray(payload.items)) {
      payload.items = [];
    }

    payload.items = payload.items.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  }

  return payload;
}

async function populateOrderRelations(userId, payload) {
  if (!payload.customerId) return payload;
  const customer = await Customer.findOne({ userId, customerId: payload.customerId }).select('fullName phone');
  if (!customer) return payload;

  payload.customerName = customer.fullName;
  if (!payload.customerPhone) payload.customerPhone = customer.phone || '';
  return payload;
}

async function refreshCustomerStats(userId, customerId) {
  if (!customerId) return;

  const customer = await Customer.findOne({ userId, customerId });
  if (!customer) return;

  const [stats] = await Order.aggregate([
    { $match: { userId, customerId, status: { $nin: ['Cancelled', 'Returned', 'Refunded'] } } },
    {
      $group: {
        _id: null,
        totalSpent: { $sum: '$total' },
        totalOrders: { $sum: 1 },
        lastOrderDate: { $max: '$orderDate' },
      },
    },
  ]);

  customer.totalSpent = stats?.totalSpent || 0;
  customer.totalOrders = stats?.totalOrders || 0;
  customer.averageOrderValue = customer.totalOrders > 0 ? customer.totalSpent / customer.totalOrders : 0;
  customer.lastOrderDate = stats?.lastOrderDate || null;
  await customer.save();
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const query = { userId: req.user._id };
    if (status) query.status = status;
    if (search) query.$or = [
      { orderId: { $regex: search, $options: 'i' } },
      { customerId: { $regex: search, $options: 'i' } },
      { customerName: { $regex: search, $options: 'i' } },
    ];
    const total = await Order.countDocuments(query);
    const orders = await Order.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    res.json({ success: true, orders, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const [total, pending, delivered, revenue] = await Promise.all([
      Order.countDocuments({ userId: req.user._id }),
      Order.countDocuments({ userId: req.user._id, status: 'Pending' }),
      Order.countDocuments({ userId: req.user._id, status: 'Delivered' }),
      Order.aggregate([
        { $match: { userId: req.user._id, status: { $nin: ['Cancelled', 'Returned', 'Refunded'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
    ]);
    res.json({ success: true, total, pending, delivered, revenue: revenue[0]?.total || 0 });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/stats/revenue-chart', authMiddleware, async (req, res) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const orders = await Order.aggregate([
      {
        $match: {
          userId: req.user._id,
          status: { $nin: ['Cancelled', 'Returned', 'Refunded'] },
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } },
          total: { $sum: '$total' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Create an array of the last 6 months to ensure no gaps
    const sparkData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const mText = monthNames[d.getMonth()];
      const yNum = d.getFullYear();
      
      const found = orders.find(o => o._id.month === d.getMonth() + 1 && o._id.year === yNum);
      sparkData.push({ m: mText, v: found ? found.total : 0 });
    }

    res.json({ success: true, sparkData });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/stats/top-products', authMiddleware, async (req, res) => {
  try {
    const topProducts = await Order.aggregate([
      { $match: { userId: req.user._id, status: { $nin: ['Cancelled', 'Returned', 'Refunded'] } } },
      { $unwind: '$items' },
      { $group: {
          _id: '$items.productId',
          name: { $first: '$items.productName' },
          sold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.subtotal' }
      }},
      { $sort: { sold: -1 } },
      { $limit: 5 }
    ]);
    res.json({ success: true, topProducts });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const payload = normalizeOrderPayload(req.body);
    const { customerId, total } = payload;
    if (!customerId || !total) {
      return res.status(400).json({ success: false, message: 'Customer ID and total are required' });
    }

    await populateOrderRelations(req.user._id, payload);
    const order = new Order({ userId: req.user._id, ...payload });
    await order.save();
    await refreshCustomerStats(req.user._id, order.customerId);
    syncToSheets(req.user, order);
    syncToExcel(req.user, order);
    res.status(201).json({ success: true, order });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const payload = normalizeOrderPayload(req.body);
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    await populateOrderRelations(req.user._id, payload);
    Object.assign(order, payload);
    await order.save();
    await refreshCustomerStats(req.user._id, order.customerId);
    syncToSheets(req.user, order, order.sheetRowIndex);
    syncToExcel(req.user, order);
    res.json({ success: true, order });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id/invoice', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Build the PDF
    const doc = new PDFDocument({ margin: 50 });
    const filename = `Invoice_${order.orderId}.pdf`;

    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');

    doc.pipe(res);

    // Header
    doc.fontSize(20).text('INVOICE', { align: 'right' });
    doc.fontSize(10).text(req.user.brand?.name || 'LibasTrack Brand', 50, 50);
    doc.text(req.user.brand?.email || '');
    
    // Order Info
    doc.moveDown(2);
    doc.text(`Order ID: ${order.orderId}`);
    doc.text(`Date: ${new Date(order.orderDate).toLocaleDateString()}`);
    doc.text(`Status: ${order.status}`);
    
    // Bill To
    doc.moveDown();
    doc.fontSize(12).text('Bill To:', { underline: true });
    doc.fontSize(10).text(order.customerName || 'N/A');
    doc.text(order.customerPhone || '');
    doc.text(order.shippingAddress || '');

    // Items line
    doc.moveDown(2);
    doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Table Header
    const tableTop = doc.y;
    doc.text('Item', 50, tableTop);
    doc.text('Qty', 300, tableTop);
    doc.text('Unit Price', 400, tableTop);
    doc.text('Total', 500, tableTop);

    doc.moveDown(0.5);
    doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Items
    let currentY = doc.y;
    if (order.items && order.items.length > 0) {
      order.items.forEach(item => {
        doc.text(item.productName || item.productId, 50, currentY);
        doc.text(item.quantity.toString(), 300, currentY);
        doc.text(`${order.currency} ${item.unitPrice}`, 400, currentY);
        doc.text(`${order.currency} ${item.subtotal}`, 500, currentY);
        currentY += 20;
      });
    } else {
      doc.text('No items logged', 50, currentY);
      currentY += 20;
    }
    
    doc.y = currentY;
    doc.moveDown();
    doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    // Summary
    doc.text(`Subtotal: ${order.currency} ${order.subtotal}`, { align: 'right' });
    if (order.shippingCost) doc.text(`Shipping: ${order.currency} ${order.shippingCost}`, { align: 'right' });
    if (order.discountAmount) doc.text(`Discount: -${order.currency} ${order.discountAmount}`, { align: 'right' });
    if (order.taxAmount) doc.text(`Tax: ${order.currency} ${order.taxAmount}`, { align: 'right' });
    
    doc.moveDown();
    doc.fontSize(14).text(`TOTAL: ${order.currency} ${order.total}`, { align: 'right', underline: true });

    // Footer
    doc.moveDown(4);
    doc.fontSize(10).text('Thank you for your business!', { align: 'center' });

    doc.end();

  } catch (err) {
    console.error('PDF error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate PDF' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const customerId = order.customerId;
    if (order.sheetRowIndex && req.user.driveConnected) {
      syncAsync(async () => {
        const { accessToken, refreshToken } = req.user.getDecryptedTokens();
        const svc = new GoogleSheetsService(accessToken, refreshToken);
        await svc.deleteRow(req.user.spreadsheetIds.orders, order.sheetRowIndex);
      });
    }
    await order.deleteOne();
    await refreshCustomerStats(req.user._id, customerId);
    res.json({ success: true, message: 'Order deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;