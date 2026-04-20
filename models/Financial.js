const mongoose = require('mongoose');
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.CounterFin || mongoose.model('CounterFin', counterSchema);

const financialSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  transactionId: { type: String, unique: true },
  orderId: { type: String, required: true, index: true },
  customerId: { type: String, index: true },
  customerName: { type: String },
  orderStatus: { type: String },
  orderTotal: { type: Number, default: 0 },
  price: { type: Number, required: true },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'EasyPaisa', 'JazzCash', 'Card', 'COD', 'Stripe', 'PayPal', 'Wise', 'Other'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Completed', 'Failed', 'Refunded'],
    default: 'Pending',
    index: true
  },
  transactionDate: { type: Date, default: Date.now, index: true },
  sheetRowIndex: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

// Compound indexes for filtered queries
financialSchema.index({ userId: 1, paymentStatus: 1 });
financialSchema.index({ userId: 1, transactionDate: -1 });

financialSchema.pre('save', async function(next) {
  if (this.isNew && !this.transactionId) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: `transactionId_${this.userId}` },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.transactionId = `TXN-${String(counter.seq).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.models.Financial || mongoose.model('Financial', financialSchema);
