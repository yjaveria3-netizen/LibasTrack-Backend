const mongoose = require('mongoose');
const counterSchema = new mongoose.Schema({ _id: String, seq: Number });
const Counter = mongoose.model('Counter4', counterSchema);

const financialSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  transactionId: { type: String, unique: true },
  orderId: { type: String, required: true },
  price: { type: Number, required: true },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'EasyPaisa', 'JazzCash', 'Card', 'COD'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Completed', 'Failed', 'Refunded'],
    default: 'Pending'
  },
  transactionDate: { type: Date, default: Date.now },
  sheetRowIndex: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

financialSchema.pre('save', async function(next) {
  if (this.isNew && !this.transactionId) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: 'transactionId' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.transactionId = `TXN-${String(counter.seq).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Financial', financialSchema);
