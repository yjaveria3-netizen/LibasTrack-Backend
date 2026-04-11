require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!');
    
    const db = mongoose.connection.db;
    const result = await db.collection('users').updateMany(
      {}, 
      { $set: { storageType: null } }
    );
    
    console.log(`Successfully reset storageType for ${result.modifiedCount} users.`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
