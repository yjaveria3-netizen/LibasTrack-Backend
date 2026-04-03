const mongoose = require('mongoose');
const counterSchema = new mongoose.Schema({ _id: String, seq: Number });
const Counter = mongoose.model('Counter2', counterSchema);

const customerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  customerId: { type: String, unique: true },
  fullName: { type: String, required: true },
  email: { type: String },
  phone: { type: String },
  address: { type: String },
  dateJoined: { type: Date, default: Date.now },
  sheetRowIndex: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

customerSchema.pre('save', async function(next) {
  if (this.isNew && !this.customerId) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: 'customerId' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.customerId = `CUS-${String(counter.seq).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Customer', customerSchema);
