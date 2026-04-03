const mongoose = require('mongoose');
const counterSchema = new mongoose.Schema({ _id: String, seq: Number });
const Counter = mongoose.model('Counter3', counterSchema);

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderId: { type: String, unique: true },
  customerId: { type: String, required: true },
  productId: { type: String, required: true },
  quantity: { type: Number, required: true },
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned'],
    default: 'Pending'
  },
  orderDate: { type: Date, default: Date.now },
  sheetRowIndex: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

orderSchema.pre('save', async function(next) {
  if (this.isNew && !this.orderId) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: 'orderId' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.orderId = `ORD-${String(counter.seq).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
