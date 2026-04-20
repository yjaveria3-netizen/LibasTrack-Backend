const { body, query, param, validationResult } = require('express-validator');

// Error handler middleware for validations
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => ({ field: e.param, message: e.msg }))
    });
  }
  next();
};

// ────────────────────────────────────────
// Auth validations
// ────────────────────────────────────────

const brandUpdateValidation = [
  body('name').optional().trim().isLength({ max: 200 }).withMessage('Brand name must be 200 characters or less'),
  body('tagline').optional().trim().isLength({ max: 500 }).withMessage('Tagline must be 500 characters or less'),
  body('logo').optional().trim().isURL().withMessage('Logo must be a valid URL'),
  body('primaryColor').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Primary color must be a valid hex color'),
  body('accentColor').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Accent color must be a valid hex color'),
  body('currency').optional().isIn(['PKR', 'USD', 'EUR', 'AUD', 'CAD', 'GBP']).withMessage('Invalid currency'),
  body('country').optional().trim().isLength({ max: 100 }).withMessage('Country must be 100 characters or less'),
  body('website').optional().trim().isURL().withMessage('Website must be a valid URL'),
  body('instagram').optional().trim().isLength({ max: 200 }).withMessage('Instagram handle must be 200 characters or less'),
  body('phone').optional().trim().isLength({ max: 20 }).withMessage('Phone must be 20 characters or less'),
  body('address').optional().trim().isLength({ max: 500 }).withMessage('Address must be 500 characters or less'),
  body('city').optional().trim().isLength({ max: 100 }).withMessage('City must be 100 characters or less'),
  body('founded').optional().trim().isLength({ max: 50 }).withMessage('Founded must be 50 characters or less'),
  body('category').optional().isIn(['Luxury', 'Premium', 'Contemporary', 'Fast Fashion', 'Streetwear', 'Bridal', 'Kids', 'Sportswear', 'Modest Fashion', 'Other']).withMessage('Invalid category'),
  handleValidationErrors
];

// ────────────────────────────────────────
// Product validations
// ────────────────────────────────────────

const productCreateValidation = [
  body('name').notEmpty().trim().isLength({ max: 300 }).withMessage('Product name is required and must be 300 characters or less'),
  body('category').notEmpty().trim().isLength({ max: 100 }).withMessage('Category is required'),
  body('subcategory').optional().trim().isLength({ max: 100 }).withMessage('Subcategory must be 100 characters or less'),
  body('collection').optional().trim().isLength({ max: 100 }).withMessage('Collection must be 100 characters or less'),
  body('fabric').optional().trim().isLength({ max: 200 }).withMessage('Fabric must be 200 characters or less'),
  body('price').notEmpty().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('costPrice').optional().isFloat({ min: 0 }).withMessage('Cost price must be a positive number'),
  body('salePrice').optional().isFloat({ min: 0 }).withMessage('Sale price must be a positive number'),
  body('stockQty').optional().isInt({ min: 0 }).withMessage('Stock quantity must be a non-negative integer'),
  body('status').optional().isIn(['Active', 'Draft', 'Archived', 'Out of Stock']).withMessage('Invalid status'),
  body('sku').optional().trim().isLength({ max: 50 }).withMessage('SKU must be 50 characters or less'),
  handleValidationErrors
];

const listPaginationValidation = [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('sort').optional().trim().isLength({ max: 100 }).withMessage('Sort parameter must be 100 characters or less'),
  handleValidationErrors
];

// ────────────────────────────────────────
// Order validations
// ────────────────────────────────────────

const orderCreateValidation = [
  body('customerId').notEmpty().trim().withMessage('Customer ID is required'),
  body('items').isArray({ min: 1 }).withMessage('Items must be a non-empty array'),
  body('items.*.productId').notEmpty().withMessage('Product ID is required for each item'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
  body('items.*.unitPrice').isFloat({ min: 0 }).withMessage('Unit price must be a positive number'),
  body('subtotal').isFloat({ min: 0 }).withMessage('Subtotal must be a positive number'),
  body('total').isFloat({ min: 0 }).withMessage('Total must be a positive number'),
  body('status').optional().isIn(['Pending', 'Confirmed', 'Processing', 'Stitching', 'Quality Check', 'Ready', 'Dispatched', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Returned', 'Refunded']).withMessage('Invalid status'),
  handleValidationErrors
];

// ────────────────────────────────────────
// Customer validations
// ────────────────────────────────────────

const customerCreateValidation = [
  body('fullName').notEmpty().trim().isLength({ max: 300 }).withMessage('Full name is required and must be 300 characters or less'),
  body('email').optional().isEmail().withMessage('Email must be valid'),
  body('phone').optional().trim().isLength({ max: 20 }).withMessage('Phone must be 20 characters or less'),
  body('whatsapp').optional().trim().isLength({ max: 20 }).withMessage('WhatsApp must be 20 characters or less'),
  body('address').optional().trim().isLength({ max: 500 }).withMessage('Address must be 500 characters or less'),
  body('city').optional().trim().isLength({ max: 100 }).withMessage('City must be 100 characters or less'),
  body('segment').optional().isIn(['VIP', 'Loyal', 'Regular', 'New', 'At Risk', 'Inactive']).withMessage('Invalid segment'),
  body('source').optional().isIn(['Instagram', 'Website', 'WhatsApp', 'Walk-in', 'Referral', 'Facebook', 'TikTok', 'Other']).withMessage('Invalid source'),
  handleValidationErrors
];

// ────────────────────────────────────────
// Checklist validations
// ────────────────────────────────────────

const checklistItemCreateValidation = [
  body('phase').notEmpty().trim().isLength({ max: 200 }).withMessage('Phase is required'),
  body('task').notEmpty().trim().isLength({ max: 500 }).withMessage('Task is required and must be 500 characters or less'),
  body('responsible').optional().trim().isLength({ max: 200 }).withMessage('Responsible must be 200 characters or less'),
  body('priority').optional().isIn(['Low', 'Medium', 'High']).withMessage('Invalid priority'),
  body('notes').optional().trim().isLength({ max: 1000 }).withMessage('Notes must be 1000 characters or less'),
  handleValidationErrors
];

// ────────────────────────────────────────
// ID param validations
// ────────────────────────────────────────

const mongoIdValidation = [
  param('id').isMongoId().withMessage('Invalid ID format'),
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  brandUpdateValidation,
  productCreateValidation,
  listPaginationValidation,
  orderCreateValidation,
  customerCreateValidation,
  checklistItemCreateValidation,
  mongoIdValidation
};
