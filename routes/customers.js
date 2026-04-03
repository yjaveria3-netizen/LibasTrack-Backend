const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Customer = require('../models/Customer');
const { GoogleSheetsService } = require('../services/googleSheets');

async function syncToSheets(user, customer, rowIndex = null) {
  if (!user.driveConnected || !user.spreadsheetIds?.customers) return null;
  try {
    const service = new GoogleSheetsService(user.accessToken, user.refreshToken);
    const values = [
      customer.customerId, customer.fullName, customer.email || '',
      customer.phone || '', customer.address || '',
      new Date(customer.dateJoined).toLocaleDateString('en-PK')
    ];
    if (rowIndex) { await service.updateRow(user.spreadsheetIds.customers, rowIndex, values); return rowIndex; }
    return await service.appendRow(user.spreadsheetIds.customers, values);
  } catch (err) { console.error('Sheets sync error:', err.message); return null; }
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const query = { userId: req.user._id };
    if (search) query.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { customerId: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
    const total = await Customer.countDocuments(query);
    const customers = await Customer.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    res.json({ success: true, customers, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
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
    const { fullName, email, phone, address, dateJoined } = req.body;
    if (!fullName) return res.status(400).json({ success: false, message: 'Full name is required' });
    const customer = new Customer({ userId: req.user._id, fullName, email, phone, address, dateJoined: dateJoined || new Date() });
    await customer.save();
    const rowIndex = await syncToSheets(req.user, customer);
    if (rowIndex) { customer.sheetRowIndex = rowIndex; await customer.save(); }
    res.status(201).json({ success: true, customer, message: 'Customer added and synced to Google Sheets!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, userId: req.user._id });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    Object.assign(customer, req.body);
    await customer.save();
    if (customer.sheetRowIndex) await syncToSheets(req.user, customer, customer.sheetRowIndex);
    res.json({ success: true, customer, message: 'Customer updated and synced!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, userId: req.user._id });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    if (customer.sheetRowIndex && req.user.driveConnected) {
      try { const s = new GoogleSheetsService(req.user.accessToken, req.user.refreshToken); await s.deleteRow(req.user.spreadsheetIds.customers, customer.sheetRowIndex); } catch (e) {}
    }
    await customer.deleteOne();
    res.json({ success: true, message: 'Customer deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const total = await Customer.countDocuments({ userId: req.user._id });
    const thisMonth = await Customer.countDocuments({ userId: req.user._id, dateJoined: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } });
    res.json({ success: true, total, thisMonth });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
