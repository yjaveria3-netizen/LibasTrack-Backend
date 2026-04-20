const mongoose = require('mongoose');
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.CounterProd || mongoose.model('CounterProd', counterSchema);

async function getNextUniqueProductId() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: 'productId_global' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const candidate = `PRD-${String(counter.seq).padStart(4, '0')}`;
    const exists = await mongoose.models.Product.exists({ productId: candidate });
    if (!exists) return candidate;
  }

  throw new Error('Unable to generate unique product ID. Please try again.');
}

const variantSchema = new mongoose.Schema({
  size: String,
  color: String,
  sku: String,
  stock: { type: Number, default: 0 },
  additionalPrice: { type: Number, default: 0 }
}, { _id: false });

const productSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  productId: { type: String, unique: true },
  name: { type: String, required: true },
  description: { type: String },
  category: { type: String, required: true, index: true },
  subcategory: { type: String },
  collection: { type: String },
  season: { type: String, enum: ['SS24','AW24','SS25','AW25','SS26','AW26','Year-Round','Limited Edition','Custom'], default: 'Year-Round' },
  fabric: { type: String },
  careInstructions: { type: String },
  origin: { type: String, default: 'Pakistan' },

  // Pricing
  costPrice: { type: Number, default: 0 },
  price: { type: Number, required: true },
  salePrice: { type: Number },
  isOnSale: { type: Boolean, default: false },
  currency: { type: String, default: 'PKR' },

  // Inventory
  sku: { type: String },
  barcode: { type: String },
  stockQty: { type: Number, default: 0 },
  lowStockAlert: { type: Number, default: 5 },
  variants: [variantSchema],

  // Status
  status: { type: String, enum: ['Active', 'Draft', 'Archived', 'Out of Stock'], default: 'Active', index: true },
  isFeatured: { type: Boolean, default: false },
  tags: [String],

  // Images
  imageLink: { type: String },
  imageViewUrl: { type: String },
  imageThumbnailUrl: { type: String },
  imageDriveFileId: { type: String },
  additionalImages: [String],

  // Supplier
  supplierId: { type: String },

  sheetRowIndex: { type: Number },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  // 'collection' is a reserved Mongoose key — suppress the warning since it's intentional here
  suppressReservedKeysWarning: true
});

// Compound indexes for filtered queries
productSchema.index({ userId: 1, status: 1 });
productSchema.index({ userId: 1, category: 1 });


productSchema.pre('save', async function(next) {
  if (this.isNew && !this.productId) {
    this.productId = await getNextUniqueProductId();
  }
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
