const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  avatar: { type: String },
  driveConnected: { type: Boolean, default: false },
  driveName: { type: String },
  driveLink: { type: String },
  driveId: { type: String },
  spreadsheetIds: {
    products: { type: String },
    orders: { type: String },
    customers: { type: String },
    financial: { type: String }
  },
  accessToken: { type: String },
  refreshToken: { type: String },
  tokenExpiry: { type: Date },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
