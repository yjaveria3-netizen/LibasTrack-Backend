const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Supplier = require('../models/Supplier');
const { GoogleSheetsService, syncAsync } = require('../services/googleSheets');
const ExcelService = require('../services/excelService');

function syncToSheets(user, s, rowIndex = null) {
  if (!user.driveConnected || !user.spreadsheetIds?.suppliers) return;
  syncAsync(async () => {
    const svc = new GoogleSheetsService(user.accessToken, user.refreshToken);
    const values = [
      s.supplierId, s.name, s.contactPerson || '', s.email || '', s.phone || '',
      s.whatsapp || '', s.city || '', s.country || '', s.category || '',
      (s.materials || []).join(', '), s.rating || '', s.leadTimeDays || '',
      s.minimumOrder || '', s.paymentTerms || '', s.isActive ? 'Yes' : 'No',
      s.totalPurchased || 0, s.notes || '',
    ];
    if (rowIndex) await svc.updateRow(user.spreadsheetIds.suppliers, rowIndex, values);
    else return await svc.appendRow(user.spreadsheetIds.suppliers, values);
  });
}

function syncToExcel(user, supplier) {
  if (user.storageType !== 'local_excel' || !user.localPath) return;
  new ExcelService(user.localPath).upsertSupplier(supplier);
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, category } = req.query;
    const query = { userId: req.user._id };
    if (category) query.category = category;
    if (search) query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { supplierId: { $regex: search, $options: 'i' } },
      { contactPerson: { $regex: search, $options: 'i' } },
    ];
    const total = await Supplier.countDocuments(query);
    const suppliers = await Supplier.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    res.json({ success: true, suppliers, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const [total, active] = await Promise.all([
      Supplier.countDocuments({ userId: req.user._id }),
      Supplier.countDocuments({ userId: req.user._id, isActive: true }),
    ]);
    res.json({ success: true, total, active });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Supplier name is required' });
    const supplier = new Supplier({ userId: req.user._id, ...req.body });
    await supplier.save();
    syncToSheets(req.user, supplier);
    syncToExcel(req.user, supplier);
    res.status(201).json({ success: true, supplier });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ _id: req.params.id, userId: req.user._id });
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
    Object.assign(supplier, req.body);
    await supplier.save();
    syncToSheets(req.user, supplier, supplier.sheetRowIndex);
    syncToExcel(req.user, supplier);
    res.json({ success: true, supplier });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ _id: req.params.id, userId: req.user._id });
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
    if (supplier.sheetRowIndex && req.user.driveConnected) {
      syncAsync(async () => {
        const svc = new GoogleSheetsService(req.user.accessToken, req.user.refreshToken);
        await svc.deleteRow(req.user.spreadsheetIds.suppliers, supplier.sheetRowIndex);
      });
    }
    await supplier.deleteOne();
    res.json({ success: true, message: 'Supplier deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;