require('dotenv').config();
const express = require('express');
const compression = require('compression');
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
  console.warn('⚠️ cookie-parser not installed. Run: npm install cookie-parser');
  cookieParser = () => (req, res, next) => next();
}

const app = express();

// ✅ Trust proxy (Render, Heroku, etc.)
app.set('trust proxy', 1);

// Disable ETag (avoid caching issues in auth)
app.set('etag', false);

// ─────────────────────────────────────────────────────
// 📁 Logs directory
// ─────────────────────────────────────────────────────
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ─────────────────────────────────────────────────────
// 🛡️ Security + Middleware
// ─────────────────────────────────────────────────────
app.use(compression({ threshold: 1024 }));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const configuredOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URLS,
  process.env.CORS_ORIGINS,
]
  .filter(Boolean)
  .flatMap((value) => value.split(','))
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([
  'http://localhost:3000',
  'http://localhost:5000',
  'https://libastrack.com',
  'https://www.libastrack.com',
  'https://www.libastrack.live',
  ...configuredOrigins,
]));

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow Postman, curl

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('❌ CORS BLOCKED:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// ✅ Preflight support (VERY IMPORTANT)
app.options('*', cors());

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(sanitizePayload);
app.use(cookieParser());
app.use(morgan('dev'));

// ─────────────────────────────────────────────────────
// 🚫 Rate Limiting
// ─────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many authentication attempts, try later',
  skip: (req) => process.env.NODE_ENV !== 'production',
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV !== 'production',
});

app.use('/api/auth/google', authLimiter);
app.use('/api/auth/google/callback', authLimiter);
app.use('/api/', apiLimiter);

// ─────────────────────────────────────────────────────
// 🧠 Error Handling (process-level)
// ─────────────────────────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', err);
});

// ─────────────────────────────────────────────────────
// 🗄️ MongoDB
// ─────────────────────────────────────────────────────
logger.info('Connecting to MongoDB...');

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => {
  logger.info('✅ MongoDB connected', {
    db: mongoose.connection.name,
  });
})
.catch(err => {
  logger.error('❌ MongoDB connection failed', err);
});

// ─────────────────────────────────────────────────────
// � Static Files (Frontend)
// ─────────────────────────────────────────────────────
const frontendBuildPath = path.join(__dirname, '../frontend/build');
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath, {
    maxAge: '7d',
    immutable: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));

  // Serve index.html for SPA routing
  app.get('/', (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
}

// ─────────────────────────────────────────────────────
// �🚀 Routes
// ─────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/financial', require('./routes/financial'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/returns', require('./routes/returns'));
app.use('/api/checklist', require('./routes/checklist'));
app.use('/api/collections', require('./routes/collections'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/drive', require('./routes/drive'));
app.use('/api/storage', require('./routes/storage'));

// ─────────────────────────────────────────────────────
// ❤️ Health Check
// ─────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// ─────────────────────────────────────────────────────
// ❌ 404 Handler
// ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// ─────────────────────────────────────────────────────
// 💥 Global Error Handler
// ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Server error', {
    message: err.message,
    url: req.url,
  });

  if (err.name === 'CastError' || err.kind === 'ObjectId') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format',
    });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File too large (max 10MB)',
    });
  }

  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// ─────────────────────────────────────────────────────
// 🚀 Start Server
// ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`, {
    env: process.env.NODE_ENV,
    frontend: process.env.FRONTEND_URL,
  });
});
