#!/usr/bin/env node
/**
 * Quick setup script to fix common issues
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('\n╔════════════════════════════════════════╗');
console.log('║  LibasTrack Backend Quick Setup        ║');
console.log('╚════════════════════════════════════════╝\n');

// Check if .env exists
const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');

if (!fs.existsSync(envPath)) {
  console.log('⚠️  .env file not found.\n');
  
  if (fs.existsSync(envExamplePath)) {
    console.log('Creating .env from .env.example...');
    fs.copyFileSync(envExamplePath, envPath);
    console.log('✓ .env created\n');
  } else {
    console.log('Creating .env template...\n');
    const template = `# IMPORTANT: Never commit real credentials to git

# MongoDB
MONGODB_URI=<your-mongodb-connection-string>

# JWT & Encryption
JWT_SECRET=<generate-a-strong-random-secret>
ENCRYPTION_SECRET=${crypto.randomBytes(32).toString('hex')}

# Google OAuth
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback

# Frontend
FRONTEND_URL=http://localhost:3000

# Server
PORT=5000
NODE_ENV=development
LOG_LEVEL=info
`;
    fs.writeFileSync(envPath, template);
    console.log('✓ .env created with template\n');
    console.log('📝 Please update the following in .env:');
    console.log('  1. MONGODB_URI - your MongoDB connection string');
    console.log('  2. JWT_SECRET - a random secret key');
    console.log('  3. GOOGLE_CLIENT_ID - from Google Cloud Console');
    console.log('  4. GOOGLE_CLIENT_SECRET - from Google Cloud Console');
    console.log('  5. GOOGLE_REDIRECT_URI - your OAuth callback URL\n');
  }
}

console.log('📦 Checking if npm install needed...');
const nodeModulesPath = path.join(__dirname, 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  console.log('⚠️  node_modules not found\n');
  console.log('Run this command to install dependencies:');
  console.log('  npm install\n');
} else {
  console.log('✓ node_modules exists\n');
}

console.log('✅ Setup check complete!\n');
console.log('Next steps:');
console.log('1. Update .env with your credentials');
console.log('2. Run: npm install');
console.log('3. Run: npm start');
console.log('4. Test at: http://localhost:3000\n');
