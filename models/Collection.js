const mongoose = require('mongoose');
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.model('CounterBrandCol', counterSchema);

// Named 'BrandCollection' to avoid Mongoose reserved 'collection' keyword warning
const brandCollectionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  collectionId: { type: String, unique: true },
  name: { type: String, required: true },
  description: { type: String },
  season: { type: String },
  year: { type: Number },
  theme: { type: String },
  status: {
    type: String,
    enum: ['Planning', 'Production', 'Ready', 'Launched', 'Archived'],
    default: 'Planning'
  },
  launchDate: { type: Date },
  productCount: { type: Number, default: 0 },
  coverImageUrl: { type: String },
  notes: { type: String },
  sheetRowIndex: { type: Number },
  createdAt: { type: Date, default: Date.now }
}, { suppressReservedKeysWarning: true });

brandCollectionSchema.pre('save', async function(next) {
  if (this.isNew && !this.collectionId) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: `collectionId_${this.userId}` },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.collectionId = `COL-${String(counter.seq).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('BrandCollection', brandCollectionSchema);
