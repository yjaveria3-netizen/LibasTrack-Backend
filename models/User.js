const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../services/encryption');

const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  avatar: { type: String },

  // Brand identity — set during onboarding
  brand: {
    name: { type: String, default: '' },
    tagline: { type: String, default: '' },
    logo: { type: String, default: '' },          // Drive URL
    primaryColor: { type: String, default: '#1a1a1a' },
    accentColor: { type: String, default: '#c9a96e' },
    currency: { type: String, default: 'PKR' },
    country: { type: String, default: 'Pakistan' },
    website: { type: String, default: '' },
    instagram: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    founded: { type: String, default: '' },
    category: {
      type: String,
      enum: ['Luxury', 'Premium', 'Contemporary', 'Fast Fashion', 'Streetwear', 'Bridal', 'Kids', 'Sportswear', 'Modest Fashion', 'Other'],
      default: 'Contemporary'
    },
    onboardingComplete: { type: Boolean, default: false }
  },

  // Storage preference
  storageType: { type: String, enum: ['google_drive', 'local_excel', null], default: null },
  localPath: { type: String, default: '' },   // absolute path to LibasTrack folder on PC

  // Google Drive/Sheets
  driveConnected: { type: Boolean, default: false },
  driveName: { type: String },
  driveLink: { type: String },
  driveId: { type: String },
  spreadsheetIds: {
    products: { type: String },
    orders: { type: String },
    customers: { type: String },
    financial: { type: String },
    suppliers: { type: String },
    collections: { type: String },
    returns: { type: String }
  },

  // OAuth — tokens encrypted at rest
  accessToken: { type: String },      // encrypted AES-256
  refreshToken: { type: String },     // encrypted AES-256
  tokenExpiry: { type: Date },
  createdAt: { type: Date, default: Date.now, index: true },
  lastLogin: { type: Date, default: Date.now }
});

// ─────────────────────────────────────────
// Encryption hooks: auto-encrypt on save, decrypt on retrieval
// ─────────────────────────────────────────

userSchema.pre('save', function(next) {
  if (this.isModified('accessToken') && this.accessToken) {
    this.accessToken = encrypt(this.accessToken);
  }
  if (this.isModified('refreshToken') && this.refreshToken) {
    this.refreshToken = encrypt(this.refreshToken);
  }
  next();
});

// Add virtual getters for decrypted tokens
userSchema.virtual('decryptedAccessToken').get(function() {
  return this.accessToken ? decrypt(this.accessToken) : null;
});

userSchema.virtual('decryptedRefreshToken').get(function() {
  return this.refreshToken ? decrypt(this.refreshToken) : null;
});

// Helper method to get decrypted tokens safely
userSchema.methods.getDecryptedTokens = function() {
  return {
    accessToken: this.accessToken ? decrypt(this.accessToken) : null,
    refreshToken: this.refreshToken ? decrypt(this.refreshToken) : null
  };
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
