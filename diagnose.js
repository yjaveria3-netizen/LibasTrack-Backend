#!/usr/bin/env node
/**
 * Diagnostic script to identify signin issues
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('\n╔════════════════════════════════════════╗');
console.log('║  LibasTrack Backend Diagnostics       ║');
console.log('╚════════════════════════════════════════╝\n');

let hasErrors = false;

// Check environment variables
console.log('📋 Checking Environment Variables...');
const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'FRONTEND_URL'
];

const optionalEnvVars = [
  'ENCRYPTION_SECRET',
  'NODE_ENV',
  'PORT'
];

requiredEnvVars.forEach(varName => {
  if (process.env[varName]) {
    const value = varName.includes('SECRET') || varName.includes('MONGODB')
      ? '***' + process.env[varName].slice(-4)
      : process.env[varName];
    console.log(`  ✓ ${varName}: ${value}`);
  } else {
    console.log(`  ✗ ${varName}: NOT SET (REQUIRED)`);
    hasErrors = true;
  }
});

optionalEnvVars.forEach(varName => {
  if (process.env[varName]) {
    console.log(`  ✓ ${varName}: ${process.env[varName]}`);
  } else {
    console.log(`  ○ ${varName}: using default`);
  }
});

// Check dependencies
console.log('\n📦 Checking Dependencies...');
const dependencies = {
  'express': 'express',
  'mongoose': 'mongoose',
  'jsonwebtoken': 'jsonwebtoken',
  'bcryptjs': 'bcryptjs',
  'helmet': 'helmet',
  'cors': 'cors',
  'morgan': 'morgan',
  'googleapis': 'googleapis'
};

const optionalDeps = {
  'cookie-parser': 'cookie-parser (for httpOnly cookies)',
  'winston': 'winston (for logging)',
  'express-validator': 'express-validator (for input validation)'
};

Object.entries(dependencies).forEach(([name, pkg]) => {
  try {
    require(pkg);
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.log(`  ✗ ${name}: NOT INSTALLED`);
    hasErrors = true;
  }
});

console.log('\n  Optional (auto-fallback if missing):');
Object.entries(optionalDeps).forEach(([name, desc]) => {
  try {
    require(name);
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    console.log(`  ○ ${desc}: not installed (will use fallback)`);
  }
});

// Check directories
console.log('\n📁 Checking Directories...');
const dirs = ['models', 'routes', 'middleware', 'services'];
dirs.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath).length;
    console.log(`  ✓ ${dir}/ (${files} files)`);
  } else {
    console.log(`  ✗ ${dir}/ NOT FOUND`);
  }
});

// Check critical files
console.log('\n📄 Checking Critical Files...');
const criticalFiles = [
  'server.js',
  'models/User.js',
  'routes/auth.js',
  'middleware/auth.js',
  'services/encryption.js'
];
criticalFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const size = fs.statSync(filePath).size;
    console.log(`  ✓ ${file} (${size} bytes)`);
  } else {
    console.log(`  ✗ ${file} NOT FOUND`);
    hasErrors = true;
  }
});

// Summary
console.log('\n' + '═'.repeat(42));
if (hasErrors) {
  console.log('\n❌ ISSUES FOUND:\n');
  console.log('1. Install missing dependencies:');
  console.log('   npm install\n');
  console.log('2. Set required environment variables in .env:');
  requiredEnvVars.forEach(v => {
    if (!process.env[v]) console.log(`   - ${v}`);
  });
  console.log('\n3. If ENCRYPTION_SECRET is not set, generate one:');
  console.log('   node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
} else {
  console.log('\n✅ All diagnostics passed!\n');
  console.log('You can start the server with:');
  console.log('  npm start\n');
  process.exit(0);
}
