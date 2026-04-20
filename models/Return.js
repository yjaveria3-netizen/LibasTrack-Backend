const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.CounterRet || mongoose.model('CounterRet', counterSchema);

const returnSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  returnId: { type: String, unique: true },
  orderId: { type: String, required: true, index: true },
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
    default: 'Requested',
    index: true
  },
  refundAmount: { type: Number, default: 0 },
  refundMethod: { type: String, default: 'Original Payment Method' },
  notes: { type: String },
  requestDate: { type: Date, default: Date.now },
  sheetRowIndex: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

// Compound index for filtered queries
returnSchema.index({ userId: 1, status: 1 });

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

module.exports = mongoose.models.Return || mongoose.model('Return', returnSchema);
