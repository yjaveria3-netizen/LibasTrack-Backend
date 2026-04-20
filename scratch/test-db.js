require('dotenv').config();
const mongoose = require('mongoose');

console.log('Testing MongoDB connection...');
console.log('URI:', process.env.MONGODB_URI ? 'Defined' : 'UNDEFINED');

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ Connection successful!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Connection failed:');
    console.error(err);
    process.exit(1);
  });
