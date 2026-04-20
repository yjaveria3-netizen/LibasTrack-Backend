require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const app = express();

// ── Security & middleware ─────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(morgan('dev'));

// Rate limiter — more generous limits for dev
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ── Diagnostic Logging ────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception:', err);
});

// ── MongoDB ──────────────────────────────────────────
console.log('Attempting MongoDB connection...');
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    console.log('   DB Name:', mongoose.connection.name);
    console.log('   Connection Host:', mongoose.connection.host);
  })
  .catch(err => {
    console.error('❌ MongoDB connection error details:');
    console.error('   Message:', err.message);
    console.error('   Code:', err.code);
    if (err.message.includes('whitelist')) {
      console.error('   TIP: Your IP address may not be whitelisted in MongoDB Atlas.');
    }
  });


// ── Routes ──────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/financial', require('./routes/financial'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/returns', require('./routes/returns'));
app.use('/api/checklist', require('./routes/checklist'));
app.use('/api/collections', require('./routes/collections'));
app.use('/api/drive', require('./routes/drive'));
app.use('/api/storage', require('./routes/storage'));

// ── Health check ─────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// ── 404 handler ──────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ─────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File too large. Maximum is 10MB.' });
  }
  res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 LibasTrack backend running on port ${PORT}`);
  console.log(`   Frontend: ${process.env.FRONTEND_URL}`);
});