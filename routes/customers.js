const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Customer = require('../models/Customer');
const { GoogleSheetsService, syncAsync } = require('../services/googleSheets');
const ExcelService = require('../services/excelService');

// Non-blocking fire-and-forget sync
function syncToSheets(user, customer, rowIndex = null) {
  if (!user.driveConnected || !user.spreadsheetIds?.customers) return;
  syncAsync(async () => {
    const svc = new GoogleSheetsService(user.accessToken, user.refreshToken);
    const values = [
      customer.customerId, customer.fullName, customer.email || '',
      customer.phone || '', customer.whatsapp || '', customer.city || '',
      customer.country || '', customer.address || '', customer.gender || '',
      customer.segment || '', customer.source || '', customer.totalSpent || 0,
      customer.totalOrders || 0, customer.loyaltyPoints || 0,
      customer.dateJoined ? new Date(customer.dateJoined).toLocaleDateString('en-PK') : '',
      customer.isSubscribed ? 'Yes' : 'No',
      (customer.tags || []).join(', '), customer.notes || '',
    ];
    if (rowIndex) await svc.updateRow(user.spreadsheetIds.customers, rowIndex, values);
    else return await svc.appendRow(user.spreadsheetIds.customers, values);
  });
}

function syncToExcel(user, customer) {
  if (user.storageType !== 'local_excel' || !user.localPath) return;
  new ExcelService(user.localPath).upsertCustomer(customer);
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, segment } = req.query;
    const query = { userId: req.user._id };
    if (segment) query.segment = segment;
    if (search) query.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { customerId: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
    const total = await Customer.countDocuments(query);
    const customers = await Customer.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    res.json({ success: true, customers, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const total = await Customer.countDocuments({ userId: req.user._id });
    const thisMonth = await Customer.countDocuments({
      userId: req.user._id,
      dateJoined: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
    });
    res.json({ success: true, total, thisMonth });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/stats/top', authMiddleware, async (req, res) => {
  try {
    const topCustomers = await Customer.find({ userId: req.user._id })
      .sort({ totalSpent: -1 })
      .limit(5)
      .select('fullName totalSpent totalOrders segment city');
    res.json({ success: true, topCustomers });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, userId: req.user._id });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.json({ success: true, customer });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { fullName } = req.body;
    if (!fullName) return res.status(400).json({ success: false, message: 'Full name is required' });
    const customer = new Customer({ userId: req.user._id, ...req.body });
    await customer.save();
    // Fire-and-forget — API responds immediately
    syncToSheets(req.user, customer);
    syncToExcel(req.user, customer);
    res.status(201).json({ success: true, customer });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, userId: req.user._id });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    Object.assign(customer, req.body);
    await customer.save();
    syncToSheets(req.user, customer, customer.sheetRowIndex);
    syncToExcel(req.user, customer);
    res.json({ success: true, customer });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, userId: req.user._id });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    if (customer.sheetRowIndex && req.user.driveConnected) {
      syncAsync(async () => {
        const svc = new GoogleSheetsService(req.user.accessToken, req.user.refreshToken);
        await svc.deleteRow(req.user.spreadsheetIds.customers, customer.sheetRowIndex);
      });
    }
    await customer.deleteOne();
    res.json({ success: true, message: 'Customer deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;