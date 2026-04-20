const mongoose = require('mongoose');
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.CounterOrd || mongoose.model('CounterOrd', counterSchema);

const orderItemSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  productName: { type: String },
  sku: { type: String },
  variant: { type: String },
  quantity: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  subtotal: { type: Number, required: true }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  orderId: { type: String, unique: true },
  customerId: { type: String, required: true, index: true },
  customerName: { type: String },
  customerPhone: { type: String },

  // Items
  items: [orderItemSchema],

  // Pricing
  subtotal: { type: Number, required: true },
  discountAmount: { type: Number, default: 0 },
  discountCode: { type: String },
  shippingCost: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  currency: { type: String, default: 'PKR' },

  // Status
  status: {
    type: String,
    enum: ['Pending', 'Confirmed', 'Processing', 'Stitching', 'Quality Check', 'Ready', 'Dispatched', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Returned', 'Refunded'],
    default: 'Pending',
    index: true
  },

  // Shipping
  shippingMethod: { type: String, enum: ['Standard', 'Express', 'Same Day', 'Self Pickup', 'International'], default: 'Standard' },
  courierName: { type: String },
  trackingNumber: { type: String },
  shippingAddress: { type: String },
  estimatedDelivery: { type: Date },
  deliveredAt: { type: Date },

  // Source
  channel: { type: String, enum: ['Website', 'Instagram', 'WhatsApp', 'In-store', 'Phone', 'Facebook', 'TikTok', 'Other'], default: 'Other' },
  notes: { type: String },
  priority: { type: String, enum: ['Normal', 'Urgent', 'VIP'], default: 'Normal' },

  orderDate: { type: Date, default: Date.now, index: true },
  sheetRowIndex: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

// Compound indexes for filtered queries
orderSchema.index({ userId: 1, status: 1 });
orderSchema.index({ userId: 1, orderDate: -1 });

orderSchema.pre('save', async function(next) {
  if (this.isNew && !this.orderId) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: `orderId_${this.userId}` },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.orderId = `ORD-${String(counter.seq).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
