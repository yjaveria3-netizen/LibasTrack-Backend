require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const logger = require('./middleware/logger');
const sanitizePayload = require('./middleware/sanitizePayload');

let cookieParser;
try {
  cookieParser = require('cookie-parser');
} catch (err) {
  console.warn('⚠️  cookie-parser not installed. Installing critical dependencies...');
  console.warn('    Run: npm install cookie-parser winston');
  // Simple fallback parser that does nothing
  cookieParser = () => (req, res, next) => next();
}

const app = express();

// Prevent conditional 304 responses for API JSON payloads (especially auth state).
app.set('etag', false);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ── Security & middleware ─────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(sanitizePayload);
app.use(cookieParser());
app.use(morgan('dev'));

// Rate limiters with different strictness levels
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                     // 10 requests per window (stricter for auth)
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many authentication attempts, please try again later',
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 200,                    // 200 requests per window (looser for data routes)
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply limiters to specific routes
app.use('/api/auth/google', authLimiter);
app.use('/api/auth/google/callback', authLimiter);
app.use('/api/', apiLimiter);

// ── Diagnostic Logging ────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { reason, promise });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

// ── MongoDB ──────────────────────────────────────────
logger.info('Attempting MongoDB connection...');
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => {
    logger.info('✅ MongoDB connected successfully', {
      dbName: mongoose.connection.name,
      host: mongoose.connection.host
    });
  })
  .catch(err => {
    logger.error('❌ MongoDB connection error', {
      message: err.message,
      code: err.code
    });
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
  logger.error('Server error', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });
  
  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File too large. Maximum is 10MB.' });
  }
  res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`🚀 LibasTrack backend running`, {
    port: PORT,
    frontend: process.env.FRONTEND_URL,
    env: process.env.NODE_ENV || 'development'
  });
});