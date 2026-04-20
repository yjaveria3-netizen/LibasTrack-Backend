require('dotenv').config();
const mongoose = require('mongoose');

if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not defined in .env');
    process.exit(1);
}

console.log('Attempting to connect to MongoDB...');

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB.');
        const db = mongoose.connection.db;
        
        // Clear all users
        const result = await db.collection('users').deleteMany({});
        console.log(`Successfully deleted ${result.deletedCount} user(s).`);
        
        console.log('Logins have been reset. You will need to log in again.');
        process.exit(0);
    })
    .catch(err => {
        console.error('Error during reset:', err);
        process.exit(1);
    });
