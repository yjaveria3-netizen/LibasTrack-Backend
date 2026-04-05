const mongoose = require('mongoose');
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.model('CounterCust', counterSchema);

const customerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  customerId: { type: String, unique: true },
  fullName: { type: String, required: true },
  email: { type: String },
  phone: { type: String },
  whatsapp: { type: String },
  address: { type: String },
  city: { type: String },
  country: { type: String, default: 'Pakistan' },
  postalCode: { type: String },
  dateOfBirth: { type: Date },
  gender: { type: String, enum: ['Female', 'Male', 'Non-binary', 'Prefer not to say'] },

  // CRM
  segment: { type: String, enum: ['VIP', 'Loyal', 'Regular', 'New', 'At Risk', 'Inactive'], default: 'New' },
  loyaltyPoints: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  totalOrders: { type: Number, default: 0 },
  averageOrderValue: { type: Number, default: 0 },
  lastOrderDate: { type: Date },
  preferredPayment: { type: String },
  preferredCategories: [String],
  notes: { type: String },
  source: { type: String, enum: ['Instagram', 'Website', 'WhatsApp', 'Walk-in', 'Referral', 'Facebook', 'TikTok', 'Other'], default: 'Other' },
  isSubscribed: { type: Boolean, default: true },
  tags: [String],

  dateJoined: { type: Date, default: Date.now },
  sheetRowIndex: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

customerSchema.pre('save', async function(next) {
  if (this.isNew && !this.customerId) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: `customerId_${this.userId}` },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.customerId = `CUS-${String(counter.seq).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Customer', customerSchema);