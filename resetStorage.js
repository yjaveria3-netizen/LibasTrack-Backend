const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/libastrack').then(async () => {
    const db = mongoose.connection.db;
    await db.collection('users').updateMany({}, { $set: { storageType: null } });
    console.log('Reset storageType');
    process.exit(0);
});
