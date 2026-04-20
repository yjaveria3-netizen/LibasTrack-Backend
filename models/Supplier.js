const mongoose = require('mongoose');
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.CounterSup || mongoose.model('CounterSup', counterSchema);

const supplierSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  supplierId: { type: String, unique: true },
  name: { type: String, required: true },
  contactPerson: { type: String },
  email: { type: String },
  phone: { type: String },
  whatsapp: { type: String },
  address: { type: String },
  city: { type: String },
  country: { type: String, default: 'Pakistan' },
  category: { type: String, enum: ['Fabric', 'Embroidery', 'Stitching', 'Packaging', 'Printing', 'Accessories', 'Wholesale', 'Other'], default: 'Fabric', index: true },
  materials: [String],
  rating: { type: Number, min: 1, max: 5 },
  leadTimeDays: { type: Number },
  minimumOrder: { type: String },
  paymentTerms: { type: String },
  notes: { type: String },
  isActive: { type: Boolean, default: true, index: true },
  totalPurchased: { type: Number, default: 0 },
  sheetRowIndex: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

// Compound index for filtered queries
supplierSchema.index({ userId: 1, isActive: 1 });

supplierSchema.pre('save', async function(next) {
  if (this.isNew && !this.supplierId) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: `supplierId_${this.userId}` },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.supplierId = `SUP-${String(counter.seq).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.models.Supplier || mongoose.model('Supplier', supplierSchema);
