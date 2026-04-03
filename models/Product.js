const mongoose = require('mongoose');
const counterSchema = new mongoose.Schema({ _id: String, seq: Number });
const Counter = mongoose.model('Counter', counterSchema);

const productSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productId: { type: String, unique: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  size: { type: String },
  color: { type: String },
  price: { type: Number, required: true },
  stockQty: { type: Number, default: 0 },
  imageLink: { type: String },
  sheetRowIndex: { type: Number },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

productSchema.pre('save', async function(next) {
  if (this.isNew && !this.productId) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: 'productId' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.productId = `PRD-${String(counter.seq).padStart(4, '0')}`;
  }
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Product', productSchema);
