require('dotenv').config();
const mongoose = require('mongoose');

if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not defined in .env');
    process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const db = mongoose.connection.db;
    await db.collection('users').updateMany({}, { $set: { storageType: null } });
    console.log('Reset storageType');
    process.exit(0);
}).catch(err => {
    console.error('Connection error:', err);
    process.exit(1);
});
