require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes      = require('./routes/auth');
const productRoutes   = require('./routes/products');
const orderRoutes     = require('./routes/orders');
const customerRoutes  = require('./routes/customers');
const financialRoutes = require('./routes/financial');
const driveRoutes     = require('./routes/drive');
const checklistRoutes = require('./routes/checklist');
const supplierRoutes  = require('./routes/suppliers');
const returnRoutes    = require('./routes/returns');

const app = express();

app.use(helmet());
app.use(morgan('dev'));

const limiter = rateLimit({ windowMs: 15*60*1000, max: 300 });
app.use('/api/', limiter);

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth',      authRoutes);
app.use('/api/products',  productRoutes);
app.use('/api/orders',    orderRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/financial', financialRoutes);
app.use('/api/drive',     driveRoutes);
app.use('/api/checklist', checklistRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/returns',   returnRoutes);

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/api/health', (req, res) => {
  res.json({ status:'OK', app:'LibasTrack', timestamp: new Date() });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ success:false, message: err.message || 'Server Error' });
});

app.use('*', (req, res) => res.status(404).json({ success:false, message:'Route not found' }));

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/libastrack';
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ MongoDB connected');
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`🚀 LibasTrack API → http://localhost:${PORT}`));
  } catch (err) {
    console.error('❌ MongoDB failed:', err.message);
    console.error('\n  Run: mongod   or   net start MongoDB\n  Or set MONGODB_URI in backend/.env\n');
    process.exit(1);
  }
};

connectDB();
module.exports = app;