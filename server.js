require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const customerRoutes = require('./routes/customers');
const financialRoutes = require('./routes/financial');
const driveRoutes = require('./routes/drive');
const checklistRoutes = require('./routes/checklist');
const supplierRoutes = require('./routes/suppliers');

const app = express();

app.use(helmet());
app.use(morgan('dev'));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use('/api/', limiter);

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/financial', financialRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/checklist', checklistRoutes);
app.use('/api/suppliers', supplierRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Fashion Brand Platform API running', timestamp: new Date() });
});

// Serve favicon to stop proxy noise
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

app.use('*', (req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

// MongoDB connection with retry
const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fashion_brand_platform';
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ MongoDB connected successfully');
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 API health: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('  MongoDB is not running. Fix options:');
    console.error('');
    console.error('  Option 1 (Local):');
    console.error('    Open a new terminal and run: mongod');
    console.error('    Or: mongod --dbpath "C:\\data\\db"');
    console.error('');
    console.error('  Option 2 (Windows Service):');
    console.error('    Run as admin: net start MongoDB');
    console.error('');
    console.error('  Option 3 (Free Cloud - MongoDB Atlas):');
    console.error('    1. Go to mongodb.com/atlas/database');
    console.error('    2. Create free cluster');
    console.error('    3. Copy connection string');
    console.error('    4. Set MONGODB_URI in backend/.env');
    console.error('');
    console.error('  Then restart: npm run dev');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    process.exit(1);
  }
};

connectDB();

module.exports = app;