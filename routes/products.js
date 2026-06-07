const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Product = require('../models/Product');
const { GoogleSheetsService, syncAsync } = require('../services/googleSheets');
const ExcelService = require('../services/excelService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { productCreateValidation, mongoIdValidation } = require('../middleware/validators');

// Multer: store in memory, validate image types, max 10 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only image files are allowed (jpg, jpeg, png, webp, gif)'));
  },
});

/* ── Google Sheets sync ─────────────────────────────────────── */
function syncToSheets(user, product, rowIndex = null) {
  if (!user.driveConnected || !user.spreadsheetIds?.products) return;
  syncAsync(async () => {
    const tokens = user.getDecryptedTokens();
    if (!tokens) {
      console.error('Failed to decrypt tokens for Google Sheets sync');
      return;
    }
    const { accessToken, refreshToken } = tokens;
    const svc = new GoogleSheetsService(accessToken, refreshToken);
    const values = [
      product.productId, product.name, product.category, product.subcategory || '',
      product.collection || '', product.season || '', product.fabric || '',
      product.costPrice || 0, product.price, product.salePrice || '',
      product.currency || 'PKR', product.sku || '', product.stockQty || 0,
      product.status, (product.tags || []).join(', '),
      product.imageLink || product.imageViewUrl || '',
      product.supplierId || '',
      new Date(product.createdAt).toLocaleDateString(),
    ];
    if (rowIndex) await svc.updateRow(user.spreadsheetIds.products, rowIndex, values);
    else return await svc.appendRow(user.spreadsheetIds.products, values);
  });
}

/* ── Excel sync ─────────────────────────────────────────────── */
function syncToExcel(user, product) {
  if (user.storageType !== 'local_excel' || !user.localPath) return;
  new ExcelService(user.localPath).upsertProduct(product);
}

/**
 * Save an uploaded image buffer to <localPath>/Images/<filename>
 * Returns the saved file path (string) or null on failure.
 */
function saveImageLocally(user, filename, buffer) {
  try {
    if (!user.localPath) {
      console.error('Image save error: user.localPath is not configured. Please set up local storage first.');
      return null;
    }

    // Use the dedicated Images/products sub-folder
    const imagesDir = path.join(user.localPath, 'Images', 'products');
    fs.mkdirSync(imagesDir, { recursive: true });   // safety: create if missing

    const dest = path.join(imagesDir, filename);
    fs.writeFileSync(dest, buffer);
    console.log('Image saved successfully to:', dest);
    return dest;
  } catch (e) {
    console.error('Image save error:', e.message);
    console.error('Full error:', e);
    return null;
  }
}

/**
 * Delete an image file from disk (best-effort, never throws).
 */
function deleteImageLocally(imagePath) {
  if (!imagePath) return;
  try {
    // Strip file:// prefix if present
    const filePath = imagePath.startsWith('file://') ? imagePath.slice(7) : imagePath;
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.error('Image delete error:', e.message);
  }
}

// Helper function to escape regex special characters and prevent ReDoS attacks
function escapeRegex(str) {
  if (!str) return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeProductPayload(body = {}) {
  const payload = { ...body };

  if (payload.variants !== undefined) {
    if (payload.variants === '' || payload.variants === null) {
      payload.variants = [];
    } else if (typeof payload.variants === 'string') {
      try {
        const parsed = JSON.parse(payload.variants);
        payload.variants = Array.isArray(parsed) ? parsed : [];
      } catch {
        payload.variants = [];
      }
    } else if (!Array.isArray(payload.variants)) {
      payload.variants = [];
    }
  }

  return payload;
}

/* ── Routes ─────────────────────────────────────────────────── */

// GET /api/products
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, category, status, search } = req.query;
    // Enforce server-side limit cap (max 100)
    const safeLim = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const safePage = Math.max(1, parseInt(page) || 1);
    
    const query = { userId: req.user._id };
    if (category) query.category = category;
    if (status) query.status = status;
    if (search) {
      const escapedSearch = escapeRegex(search);
      query.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { productId: { $regex: escapedSearch, $options: 'i' } },
        { sku: { $regex: escapedSearch, $options: 'i' } },
      ];
    }
    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLim)
      .limit(safeLim);
    res.json({ success: true, products, total, page: safePage, totalPages: Math.ceil(total / safeLim) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/products/stats/summary
router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const [total, lowStock, categories, totalValue] = await Promise.all([
      Product.countDocuments({ userId: req.user._id }),
      Product.countDocuments({ userId: req.user._id, stockQty: { $lte: 5 } }),
      Product.distinct('category', { userId: req.user._id }),
      Product.aggregate([
        { $match: { userId: req.user._id } },
        { $group: { _id: null, total: { $sum: { $multiply: ['$price', '$stockQty'] } } } },
      ]),
    ]);
    res.json({ success: true, total, lowStock, categories: categories.length, totalValue: totalValue[0]?.total || 0 });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/products/stats/low-stock
router.get('/stats/low-stock', authMiddleware, async (req, res) => {
  try {
    const products = await Product.find({ 
      userId: req.user._id, 
      $expr: { $lte: ['$stockQty', '$lowStockAlert'] }
    })
    .sort({ stockQty: 1 })
    .limit(10)
    .select('name productId sku stockQty lowStockAlert');
    res.json({ success: true, lowStockProducts: products });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/products/:id
router.get('/:id', authMiddleware, mongoIdValidation, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, userId: req.user._id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/products
router.post('/', authMiddleware, upload.single('image'), productCreateValidation, async (req, res) => {
  console.log('[Product POST] Request received');
  console.log('[Product POST] req.body keys:', Object.keys(req.body));
  console.log('[Product POST] req.file:', req.file ? 'exists' : 'null');
  try {
    const payload = normalizeProductPayload(req.body);
    const { name, category, price } = payload;
    if (!name || !category || !price) {
      return res.status(400).json({ success: false, message: 'Name, category, and price are required' });
    }
    
    // Validate prices are non-negative
    if (Number(payload.price) < 0) {
      return res.status(400).json({ success: false, message: 'Price cannot be negative' });
    }
    if (payload.salePrice && Number(payload.salePrice) < 0) {
      return res.status(400).json({ success: false, message: 'Sale price cannot be negative' });
    }
    if (payload.costPrice && Number(payload.costPrice) < 0) {
      return res.status(400).json({ success: false, message: 'Cost price cannot be negative' });
    }
    
    // Validate sale price <= regular price
    if (payload.salePrice && Number(payload.salePrice) > Number(payload.price)) {
      return res.status(400).json({ success: false, message: 'Sale price cannot exceed regular price' });
    }
    
    // Validate stock quantity is non-negative
    if (payload.stockQty && Number(payload.stockQty) < 0) {
      return res.status(400).json({ success: false, message: 'Stock quantity cannot be negative' });
    }

    // Validate foreign keys if provided
    if (payload.supplierId) {
      const Supplier = require('../models/Supplier');
      const supplier = await Supplier.findOne({ userId: req.user._id, supplierId: payload.supplierId });
      if (!supplier) {
        return res.status(400).json({ success: false, message: 'Supplier record not found for the provided Supplier ID' });
      }
    }
    if (payload.collection) {
      const BrandCollection = require('../models/Collection');
      const col = await BrandCollection.findOne({ userId: req.user._id, name: payload.collection });
      if (!col) {
        return res.status(400).json({ success: false, message: 'Collection record not found for the provided Collection' });
      }
    }

    const product = new Product({ userId: req.user._id, ...payload });

    // Handle image upload
    console.log('[Product Upload] Image upload check:');
    console.log('  - req.file exists:', !!req.file);
    console.log('  - storageType:', req.user.storageType);
    console.log('  - localPath:', req.user.localPath);
    
    if (req.file) {
      // Sanitize filename to prevent directory traversal attacks
      const baseName = path.basename(req.file.originalname).replace(/\s/g, '_');
      const filename = `${Date.now()}_${baseName}`;
      console.log('  - filename:', filename);
      console.log('  - file size:', req.file.buffer.length);

      if (req.user.storageType === 'local_excel' && req.user.localPath) {
        // Local mode → save to <workspace>/Images/
        console.log('  - Attempting to save image locally...');
        const localPath = saveImageLocally(req.user, filename, req.file.buffer);
        console.log('  - saveImageLocally returned:', localPath);
        if (localPath) {
          product.imageLink = `file://${localPath}`;
          product.imageThumbnailUrl = `file://${localPath}`;
          console.log('  - Image path saved to product:', product.imageLink);
        } else {
          console.warn('Failed to save image locally - product will be saved without image');
        }
      } else if (req.user.storageType === 'local_excel' && !req.user.localPath) {
        console.warn('Local storage type is set but localPath is not configured. Please call POST /api/storage/setup-local first.');
      } else if (req.user.storageType === 'google_drive') {
        console.log('  - Google Drive mode - uploading to Drive...');
        try {
          const tokens = req.user.getDecryptedTokens();
          if (!tokens) {
            console.warn('Failed to decrypt tokens for Drive upload');
          } else {
            const sheetsService = new GoogleSheetsService(tokens.accessToken, tokens.refreshToken);
            
            // Get or find the Images folder in Drive
            const imagesFolderId = await sheetsService.findOrCreateSubfolder(req.user.driveId, 'Images');
            const productsFolderId = await sheetsService.findOrCreateSubfolder(imagesFolderId, 'products');
            
            // Upload file to Drive
            const uploadResult = await sheetsService.uploadFileToDrive(
              productsFolderId,
              filename,
              req.file.mimetype,
              req.file.buffer
            );
            
            console.log('  - File uploaded to Drive:', uploadResult);
            product.imageLink = uploadResult.webViewLink;
            product.imageViewUrl = uploadResult.webContentLink;
            product.imageThumbnailUrl = uploadResult.webContentLink;
            product.imageDriveFileId = uploadResult.id;
            console.log('  - Image path saved to product:', product.imageLink);
          }
        } catch (err) {
          console.error('Drive upload error:', err.message);
          console.warn('Product will be saved without image due to upload error');
        }
      }
    }

    console.log('[Product Upload] Saving product with imageLink:', product.imageLink);
    await product.save();
    syncToSheets(req.user, product);
    syncToExcel(req.user, product);
    res.status(201).json({ success: true, product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT /api/products/:id
router.put('/:id', authMiddleware, mongoIdValidation, upload.single('image'), async (req, res) => {
  try {
    const payload = normalizeProductPayload(req.body);
    const product = await Product.findOne({ _id: req.params.id, userId: req.user._id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    // Validate foreign keys if provided
    if (payload.supplierId) {
      const Supplier = require('../models/Supplier');
      const supplier = await Supplier.findOne({ userId: req.user._id, supplierId: payload.supplierId });
      if (!supplier) {
        return res.status(400).json({ success: false, message: 'Supplier record not found for the provided Supplier ID' });
      }
    }
    if (payload.collection) {
      const BrandCollection = require('../models/Collection');
      const col = await BrandCollection.findOne({ userId: req.user._id, name: payload.collection });
      if (!col) {
        return res.status(400).json({ success: false, message: 'Collection record not found for the provided Collection' });
      }
    }

    // If a new image is uploaded and there was an old image, delete it
    if (req.file && product.imageDriveFileId) {
      try {
        const tokens = req.user.getDecryptedTokens();
        if (tokens) {
          const sheetsService = new GoogleSheetsService(tokens.accessToken, tokens.refreshToken);
          await sheetsService.drive.files.delete({ fileId: product.imageDriveFileId });
          console.log('Deleted old Drive image:', product.imageDriveFileId);
        }
      } catch (err) {
        console.error('Failed to delete old Drive image:', err.message);
      }
    }
    if (req.file && product.imageLink && product.imageLink.startsWith('file://')) {
      deleteImageLocally(product.imageLink);
    }

    Object.assign(product, payload);

    console.log('[Product Update] Image upload check:');
    console.log('  - req.file exists:', !!req.file);
    console.log('  - storageType:', req.user.storageType);
    console.log('  - localPath:', req.user.localPath);

    if (req.file) {
      // Sanitize filename to prevent directory traversal attacks
      const baseName = path.basename(req.file.originalname).replace(/\s/g, '_');
      const filename = `${Date.now()}_${baseName}`;
      console.log('  - filename:', filename);
      console.log('  - file size:', req.file.buffer.length);

      if (req.user.storageType === 'local_excel' && req.user.localPath) {
        console.log('  - Attempting to save image locally...');
        const localPath = saveImageLocally(req.user, filename, req.file.buffer);
        console.log('  - saveImageLocally returned:', localPath);
        if (localPath) {
          product.imageLink = `file://${localPath}`;
          product.imageThumbnailUrl = `file://${localPath}`;
          console.log('  - Image path saved to product:', product.imageLink);
        } else {
          console.warn('Failed to save image locally - product will be saved without image');
        }
      } else if (req.user.storageType === 'local_excel' && !req.user.localPath) {
        console.warn('Local storage type is set but localPath is not configured. Please call POST /api/storage/setup-local first.');
      } else if (req.user.storageType === 'google_drive') {
        console.log('  - Google Drive mode - uploading to Drive...');
        try {
          const tokens = req.user.getDecryptedTokens();
          if (!tokens) {
            console.warn('Failed to decrypt tokens for Drive upload');
          } else {
            const sheetsService = new GoogleSheetsService(tokens.accessToken, tokens.refreshToken);
            
            // Get or find the Images folder in Drive
            const imagesFolderId = await sheetsService.findOrCreateSubfolder(req.user.driveId, 'Images');
            const productsFolderId = await sheetsService.findOrCreateSubfolder(imagesFolderId, 'products');
            
            // Upload file to Drive
            const uploadResult = await sheetsService.uploadFileToDrive(
              productsFolderId,
              filename,
              req.file.mimetype,
              req.file.buffer
            );
            
            console.log('  - File uploaded to Drive:', uploadResult);
            product.imageLink = uploadResult.webViewLink;
            product.imageViewUrl = uploadResult.webContentLink;
            product.imageThumbnailUrl = uploadResult.webContentLink;
            product.imageDriveFileId = uploadResult.id;
            console.log('  - Image path saved to product:', product.imageLink);
          }
        } catch (err) {
          console.error('Drive upload error:', err.message);
          console.warn('Product will be saved without image due to upload error');
        }
      }
    }

    // Handle image removal (frontend sends removeImage: 'true')
    if (payload.removeImage === 'true') {
      if (product.imageDriveFileId) {
        try {
          const tokens = req.user.getDecryptedTokens();
          if (tokens) {
            const sheetsService = new GoogleSheetsService(tokens.accessToken, tokens.refreshToken);
            await sheetsService.drive.files.delete({ fileId: product.imageDriveFileId });
            console.log('Deleted Drive image on removal:', product.imageDriveFileId);
          }
        } catch (err) {
          console.error('Failed to delete Drive image on removal:', err.message);
        }
      }
      if (product.imageLink && product.imageLink.startsWith('file://')) {
        deleteImageLocally(product.imageLink);
      }
      product.imageLink = '';
      product.imageViewUrl = '';
      product.imageThumbnailUrl = '';
      product.imageDriveFileId = '';
    }

    console.log('[Product Update] Saving product with imageLink:', product.imageLink);
    await product.save();
    syncToSheets(req.user, product, product.sheetRowIndex);
    syncToExcel(req.user, product);
    res.json({ success: true, product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/products/:id
router.delete('/:id', authMiddleware, mongoIdValidation, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, userId: req.user._id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    // Delete local image if it exists
    if (product.imageLink && product.imageLink.startsWith('file://')) {
      deleteImageLocally(product.imageLink);
    }

    // Delete Drive image if it exists
    if (product.imageDriveFileId) {
      try {
        const tokens = req.user.getDecryptedTokens();
        if (tokens) {
          const sheetsService = new GoogleSheetsService(tokens.accessToken, tokens.refreshToken);
          await sheetsService.drive.files.delete({ fileId: product.imageDriveFileId });
          console.log('Deleted Drive image on product delete:', product.imageDriveFileId);
        }
      } catch (err) {
        console.error('Failed to delete Drive image on product delete:', err.message);
      }
    }

    // Remove from Google Sheets
    if (product.sheetRowIndex && req.user.driveConnected) {
      syncAsync(async () => {
        const { accessToken, refreshToken } = req.user.getDecryptedTokens();
        const svc = new GoogleSheetsService(accessToken, refreshToken);
        await svc.deleteRow(req.user.spreadsheetIds.products, product.sheetRowIndex);
      });
    }

    await product.deleteOne();
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/products/auto-link-images
router.post('/auto-link-images', authMiddleware, async (req, res) => {
  try {
    const { mode = 'local' } = req.body;
    let linkedCount = 0;
    let errors = [];

    if (mode === 'local' && req.user.storageType === 'local_excel' && req.user.localPath) {
      // Scan local Images/products folder
      const imagesDir = path.join(req.user.localPath, 'Images', 'products');
      
      if (!fs.existsSync(imagesDir)) {
        return res.status(400).json({ success: false, message: 'Images/products folder does not exist' });
      }

      const imageFiles = fs.readdirSync(imagesDir).filter(file => 
        /\.(jpg|jpeg|png|webp|gif)$/i.test(file)
      );

      // Get all products
      const products = await Product.find({ userId: req.user._id });
      
      for (const product of products) {
        // Try to match by product ID first
        let matchedImage = imageFiles.find(file => 
          file.toLowerCase().includes(product.productId.toLowerCase()) ||
          file.toLowerCase().startsWith(product.productId.toLowerCase() + '_')
        );
        
        // If not found by ID, try by name
        if (!matchedImage) {
          const sanitizedName = product.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
          matchedImage = imageFiles.find(file => 
            file.toLowerCase().includes(sanitizedName) ||
            file.toLowerCase().startsWith(sanitizedName + '_')
          );
        }

        if (matchedImage) {
          const imagePath = path.join(imagesDir, matchedImage);
          const fileUrl = `file://${imagePath}`;
          
          // Update product if it doesn't already have this image
          if (product.imageLink !== fileUrl) {
            // Delete old local image if exists
            if (product.imageLink && product.imageLink.startsWith('file://')) {
              deleteImageLocally(product.imageLink);
            }
            
            product.imageLink = fileUrl;
            product.imageThumbnailUrl = fileUrl;
            await product.save();
            syncToSheets(req.user, product, product.sheetRowIndex);
            syncToExcel(req.user, product);
            linkedCount++;
          }
        }
      }
    } else if (mode === 'drive' && req.user.driveConnected) {
      // Google Drive mode - would require Drive API integration
      return res.status(501).json({ success: false, message: 'Google Drive auto-linking not yet implemented' });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid mode or storage not configured' });
    }

    res.json({ 
      success: true, 
      message: `Successfully linked ${linkedCount} product images`,
      linkedCount,
      errors 
    });
  } catch (err) { 
    res.status(500).json({ success: false, message: err.message }); 
  }
});

module.exports = router;
