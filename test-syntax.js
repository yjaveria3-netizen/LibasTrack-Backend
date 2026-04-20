#!/usr/bin/env node

// Quick test to verify server syntax
console.log('Testing backend startup...\n');

try {
  // Test require all critical modules
  console.log('✓ Checking requires...');
  require('express');
  require('mongoose');
  require('jsonwebtoken');
  
  console.log('✓ Loading models...');
  require('./models/User');
  require('./models/Product');
  require('./models/ChecklistItem');
  
  console.log('✓ Loading middleware...');
  require('./middleware/auth');
  require('./middleware/logger');
  require('./middleware/validators');
  
  console.log('✓ Loading routes...');
  require('./routes/auth');
  require('./routes/products');
  
  console.log('✓ Loading services...');
  require('./services/encryption');
  require('./services/googleSheets');
  
  console.log('\n✅ All modules loaded successfully!');
  console.log('\nNext steps:');
  console.log('1. Run: npm install');
  console.log('2. Set environment variables in .env');
  console.log('3. Start server with: npm start');
  
  process.exit(0);
} catch (err) {
  console.error('\n❌ Error loading modules:');
  console.error(err.message);
  console.error('\nStack:', err.stack);
  process.exit(1);
}
