/**
 * DANGER: This script deletes ALL user records from the database.
 * This is irreversible and will delete all user accounts, brand settings,
 * storage configurations, and OAuth tokens.
 * 
 * Usage: node delete-all-users.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function deleteAllUsers() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/libastrack';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Count users before deletion
    const countBefore = await User.countDocuments();
    console.log(`Found ${countBefore} user(s) in the database`);

    if (countBefore === 0) {
      console.log('No users to delete. Exiting.');
      process.exit(0);
    }

    // Confirm deletion
    console.log('\n⚠️  WARNING: This will delete ALL user records!');
    console.log('This action is IRREVERSIBLE.');
    console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to proceed...');

    // Wait 5 seconds for user to cancel
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Delete all users
    const result = await User.deleteMany({});
    console.log(`\n✅ Deleted ${result.deletedCount} user(s)`);

    // Verify deletion
    const countAfter = await User.countDocuments();
    console.log(`Users remaining: ${countAfter}`);

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

deleteAllUsers();
