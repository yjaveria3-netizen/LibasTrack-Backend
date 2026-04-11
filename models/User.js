const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
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
    founded: { type: String, default: '' },
    category: {
      type: String,
      enum: ['Luxury', 'Premium', 'Contemporary', 'Fast Fashion', 'Streetwear', 'Bridal', 'Kids', 'Sportswear', 'Modest Fashion', 'Other'],
      default: 'Contemporary'
    },
    onboardingComplete: { type: Boolean, default: false }
  },

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

  // OAuth
  accessToken: { type: String },
  refreshToken: { type: String },
  tokenExpiry: { type: Date },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
