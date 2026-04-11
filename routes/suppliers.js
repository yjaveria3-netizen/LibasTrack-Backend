const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Supplier = require('../models/Supplier');
const { GoogleSheetsService } = require('../services/googleSheets');

async function syncToSheets(user, s, rowIndex = null) {
  if (!user.driveConnected || !user.spreadsheetIds?.suppliers) return null;
  try {
    const svc = new GoogleSheetsService(user.accessToken, user.refreshToken);
    const vals = [s.supplierId, s.name, s.contactPerson||'', s.phone||'', s.email||'', s.category, s.city||'', s.country, s.rating||'', s.leadTimeDays||'', s.isActive?'Active':'Inactive'];
    if (rowIndex) { await svc.updateRow(user.spreadsheetIds.suppliers, rowIndex, vals); return rowIndex; }
    return await svc.appendRow(user.spreadsheetIds.suppliers, vals);
  } catch (err) { console.error('Sheets sync error:', err.message); return null; }
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page=1, limit=20, search, category } = req.query;
    const query = { userId: req.user._id };
    if (category) query.category = category;
    if (search) query.$or = [{ name: { $regex: search, $options:'i' } }, { supplierId: { $regex: search, $options:'i' } }];
    const total = await Supplier.countDocuments(query);
    const suppliers = await Supplier.find(query).sort({ createdAt:-1 }).skip((page-1)*limit).limit(parseInt(limit));
    res.json({ success:true, suppliers, total, page:parseInt(page), totalPages:Math.ceil(total/limit) });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const supplier = new Supplier({ userId: req.user._id, ...req.body });
    await supplier.save();
    const rowIndex = await syncToSheets(req.user, supplier);
    if (rowIndex) { supplier.sheetRowIndex = rowIndex; await supplier.save(); }
    res.status(201).json({ success:true, supplier });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ _id:req.params.id, userId:req.user._id });
    if (!supplier) return res.status(404).json({ success:false, message:'Not found' });
    Object.assign(supplier, req.body);
    await supplier.save();
    if (supplier.sheetRowIndex) await syncToSheets(req.user, supplier, supplier.sheetRowIndex);
    res.json({ success:true, supplier });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ _id:req.params.id, userId:req.user._id });
    if (!supplier) return res.status(404).json({ success:false, message:'Not found' });
    if (supplier.sheetRowIndex && req.user.driveConnected) {
      try { const s = new GoogleSheetsService(req.user.accessToken, req.user.refreshToken); await s.deleteRow(req.user.spreadsheetIds.suppliers, supplier.sheetRowIndex); } catch(e) {}
    }
    await supplier.deleteOne();
    res.json({ success:true, message:'Supplier deleted' });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const total = await Supplier.countDocuments({ userId:req.user._id });
    const active = await Supplier.countDocuments({ userId:req.user._id, isActive:true });
    const byCategory = await Supplier.aggregate([{ $match:{ userId:req.user._id } }, { $group:{ _id:'$category', count:{ $sum:1 } } }]);
    res.json({ success:true, total, active, byCategory });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

module.exports = router;
