const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const BrandCollection = require('../models/Collection');
const { GoogleSheetsService, syncAsync } = require('../services/googleSheets');
const ExcelService = require('../services/excelService');

function syncToSheets(user, col, rowIndex = null) {
    if (!user.driveConnected || !user.spreadsheetIds?.collections) return null;
    syncAsync(async () => {
        const { accessToken, refreshToken } = user.getDecryptedTokens();
        const svc = new GoogleSheetsService(accessToken, refreshToken);
        const values = [
            col.collectionId, col.name, col.description || '', col.season || '',
            col.year || '', col.theme || '', col.status,
            col.launchDate ? new Date(col.launchDate).toLocaleDateString() : '',
            col.productCount || 0, col.notes || '',
        ];
        if (rowIndex) await svc.updateRow(user.spreadsheetIds.collections, rowIndex, values);
        else return await svc.appendRow(user.spreadsheetIds.collections, values);
    });
}

function syncToExcel(user, col) {
    if (user.storageType !== 'local_excel' || !user.localPath) return;
    const svc = new ExcelService(user.localPath);
    // fire-and-forget
    svc.upsertCollection && svc.upsertCollection(col).catch(() => { });
}

router.get('/', authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 20, status, search } = req.query;
        const query = { userId: req.user._id };
        if (status) query.status = status;
        if (search) query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { collectionId: { $regex: search, $options: 'i' } },
            { theme: { $regex: search, $options: 'i' } },
        ];
        const total = await BrandCollection.countDocuments(query);
        const collections = await BrandCollection.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
        res.json({ success: true, collections, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/stats/summary', authMiddleware, async (req, res) => {
    try {
        const total = await BrandCollection.countDocuments({ userId: req.user._id });
        const active = await BrandCollection.countDocuments({ userId: req.user._id, status: { $in: ['Planning', 'Production', 'Ready'] } });
        const launched = await BrandCollection.countDocuments({ userId: req.user._id, status: 'Launched' });
        res.json({ success: true, total, active, launched });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
    try {
        const { name, description, season, year, theme, status, launchDate, notes } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Collection name is required' });
        const col = new BrandCollection({ userId: req.user._id, name, description, season, year, theme, status: status || 'Planning', launchDate, notes });
        await col.save();
        syncToSheets(req.user, col);
        syncToExcel(req.user, col);
        res.status(201).json({ success: true, collection: col });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const col = await BrandCollection.findOne({ _id: req.params.id, userId: req.user._id });
        if (!col) return res.status(404).json({ success: false, message: 'Collection not found' });
        Object.assign(col, req.body);
        await col.save();
        syncToSheets(req.user, col, col.sheetRowIndex);
        syncToExcel(req.user, col);
        res.json({ success: true, collection: col });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const col = await BrandCollection.findOne({ _id: req.params.id, userId: req.user._id });
        if (!col) return res.status(404).json({ success: false, message: 'Collection not found' });
        await col.deleteOne();
        res.json({ success: true, message: 'Collection deleted' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;