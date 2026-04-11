const mongoose = require('mongoose');
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.model('CounterRet', counterSchema);

const returnSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  returnId: { type: String, unique: true },
  orderId: { type: String, required: true },
  customerId: { type: String },
  customerName: { type: String },
  productId: { type: String },
  productName: { type: String },
  quantity: { type: Number, default: 1 },
  reason: {
    type: String,
    enum: ['Wrong Size','Wrong Item','Defective/Damaged','Not as Described','Changed Mind','Duplicate Order','Late Delivery','Quality Issue','Other'],
    default: 'Defective/Damaged'
  },
  type: { type: String, enum: ['Refund','Exchange','Store Credit'], default: 'Refund' },
  status: {
    type: String,
    enum: ['Requested','Approved','Item Received','Inspected','Refund Issued','Exchange Dispatched','Completed','Rejected'],
    default: 'Requested'
  },
  refundAmount: { type: Number, default: 0 },
  refundMethod: { type: String, default: 'Original Payment Method' },
  notes: { type: String },
  requestDate: { type: Date, default: Date.now },
  sheetRowIndex: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

returnSchema.pre('save', async function(next) {
  if (this.isNew && !this.returnId) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: `returnId_${this.userId}` },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.returnId = `RET-${String(counter.seq).padStart(4, '0')}`;
  }
  next();
});

const Return = mongoose.model('Return', returnSchema);

/* ── Routes ── */
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page=1, limit=15, search, status, type } = req.query;
    const query = { userId: req.user._id };
    if (status) query.status = status;
    if (type) query.type = type;
    if (search) query.$or = [
      { orderId: { $regex: search, $options:'i' } },
      { customerId: { $regex: search, $options:'i' } },
      { customerName: { $regex: search, $options:'i' } },
      { returnId: { $regex: search, $options:'i' } },
    ];
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
    res.json({ success:true, total, pending, completed, totalRefunded: refundAgg[0]?.total || 0 });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const ret = new Return({ userId: req.user._id, ...req.body });
    await ret.save();
    res.status(201).json({ success:true, return: ret });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const ret = await Return.findOne({ _id: req.params.id, userId: req.user._id });
    if (!ret) return res.status(404).json({ success:false, message:'Not found' });
    Object.assign(ret, req.body);
    await ret.save();
    res.json({ success:true, return: ret });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const ret = await Return.findOne({ _id: req.params.id, userId: req.user._id });
    if (!ret) return res.status(404).json({ success:false, message:'Not found' });
    await ret.deleteOne();
    res.json({ success:true, message:'Return deleted' });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

module.exports = router;
