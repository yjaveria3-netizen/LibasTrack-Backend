const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Financial = require('../models/Financial');
const Supplier = require('../models/Supplier');
const ReturnModel = require('../models/Return');

router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      productStats,
      orderStats,
      customerStats,
      financialStats,
      supplierStats,
      returnStats,
      revenueChartData,
      topProducts,
      topCustomers,
      lowStockProducts,
    ] = await Promise.all([
      Promise.all([
        Product.countDocuments({ userId }),
        Product.countDocuments({ userId, stockQty: { $lte: 5 } }),
        Product.distinct('category', { userId }),
        Product.aggregate([
          { $match: { userId } },
          { $group: { _id: null, total: { $sum: { $multiply: ['$price', '$stockQty'] } } } },
        ]),
      ]),
      Promise.all([
        Order.countDocuments({ userId }),
        Order.countDocuments({ userId, status: 'Pending' }),
        Order.countDocuments({ userId, status: 'Delivered' }),
        Order.aggregate([
          { $match: { userId, status: { $nin: ['Cancelled', 'Returned', 'Refunded'] } } },
          { $group: { _id: null, total: { $sum: '$total' } } },
        ]),
      ]),
      Promise.all([
        Customer.countDocuments({ userId }),
        Customer.countDocuments({ userId, dateJoined: { $gte: thisMonthStart } }),
      ]),
      Promise.all([
        Financial.countDocuments({ userId }),
        Financial.aggregate([
          { $match: { userId, paymentStatus: 'Completed' } },
          { $group: { _id: null, total: { $sum: '$price' } } },
        ]),
        Financial.aggregate([
          { $match: { userId, paymentStatus: 'Pending' } },
          { $group: { _id: null, total: { $sum: '$price' } } },
        ]),
      ]),
      Promise.all([
        Supplier.countDocuments({ userId }),
        Supplier.countDocuments({ userId, isActive: true }),
      ]),
      Promise.all([
        ReturnModel.countDocuments({ userId }),
        ReturnModel.countDocuments({ userId, status: { $in: ['Requested', 'Approved', 'Item Received', 'Inspected'] } }),
        ReturnModel.countDocuments({ userId, status: { $in: ['Completed', 'Refund Issued', 'Exchange Dispatched'] } }),
        ReturnModel.aggregate([
          { $match: { userId, status: { $in: ['Refund Issued', 'Completed'] } } },
          { $group: { _id: null, total: { $sum: '$refundAmount' } } },
        ]),
      ]),
      Order.aggregate([
        {
          $match: {
            userId,
            status: { $nin: ['Cancelled', 'Returned', 'Refunded'] },
            createdAt: { $gte: sixMonthsAgo },
          },
        },
        {
          $group: {
            _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } },
            total: { $sum: '$total' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      Order.aggregate([
        { $match: { userId, status: { $nin: ['Cancelled', 'Returned', 'Refunded'] } } },
        { $unwind: '$items' },
        { $group: {
            _id: '$items.productId',
            name: { $first: '$items.productName' },
            sold: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.subtotal' },
        } },
        { $sort: { sold: -1 } },
        { $limit: 5 },
      ]),
      Customer.find({ userId }).sort({ totalSpent: -1 }).limit(5)
        .select('fullName totalSpent totalOrders segment city')
        .lean(),
      Product.find({ userId, stockQty: { $lte: 5 } })
        .sort({ stockQty: 1 })
        .limit(10)
        .select('name productId sku stockQty')
        .lean(),
    ]);

    const revenueSeries = revenueChartData.reduce((acc, entry) => {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthIndex = entry._id.month - 1;
      const label = `${monthNames[monthIndex]} ${entry._id.year}`;
      acc[label] = entry.total;
      return acc;
    }, {});

    const chart = [];
    for (let i = 5; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = date.toLocaleString('default', { month: 'short' });
      chart.push({ m: label, v: revenueSeries[`${label} ${date.getFullYear()}`] || 0 });
    }

    res.json({
      success: true,
      products: {
        total: productStats[0],
        lowStock: productStats[1],
        categories: productStats[2].length,
        totalValue: productStats[3][0]?.total || 0,
      },
      orders: {
        total: orderStats[0],
        pending: orderStats[1],
        delivered: orderStats[2],
        revenue: orderStats[3][0]?.total || 0,
      },
      customers: {
        total: customerStats[0],
        thisMonth: customerStats[1],
      },
      financial: {
        total: financialStats[0],
        completedRevenue: financialStats[1][0]?.total || 0,
        pendingRevenue: financialStats[2][0]?.total || 0,
      },
      suppliers: {
        total: supplierStats[0],
        active: supplierStats[1],
      },
      returns: {
        total: returnStats[0],
        pending: returnStats[1],
        completed: returnStats[2],
        totalRefunded: returnStats[3][0]?.total || 0,
      },
      sparkData: chart,
      topProducts,
      topCustomers,
      lowStock: lowStockProducts,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
