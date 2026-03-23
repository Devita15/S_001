const { body, param, validationResult } = require('express-validator');

// Validation rules for BOM creation
const validateBOMCreate = [
  body('parent_item_id')
    .notEmpty().withMessage('Parent item ID is required')
    .isMongoId().withMessage('Invalid parent item ID format'),
  
  body('bom_version')
    .notEmpty().withMessage('BOM version is required')
    .isString().withMessage('BOM version must be a string')
    .trim(),
  
  body('bom_type')
    .notEmpty().withMessage('BOM type is required')
    .isIn(['Manufacturing', 'Subcontract', 'Phantom', 'Variant'])
    .withMessage('Invalid BOM type'),
  
  body('batch_size')
    .notEmpty().withMessage('Batch size is required')
    .isInt({ min: 1 }).withMessage('Batch size must be a positive integer'),
  
  body('yield_percent')
    .optional()
    .isInt({ min: 0, max: 100 }).withMessage('Yield percent must be between 0 and 100'),
  
  body('components')
    .isArray({ min: 1 }).withMessage('At least one component is required'),
  
  body('components.*.component_item_id')
    .notEmpty().withMessage('Component item ID is required')
    .isMongoId().withMessage('Invalid component item ID format'),
  
  body('components.*.quantity_per')
    .notEmpty().withMessage('Quantity per is required')
    .isFloat({ min: 0.0001 }).withMessage('Quantity per must be greater than 0'),
  
  body('components.*.unit')
    .optional()
    .isIn(['Nos', 'Kg', 'Meter', 'Sheet', 'Roll'])
    .withMessage('Invalid unit'),
  
  body('components.*.scrap_percent')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('Scrap percent must be between 0 and 100'),
  
  body('components.*.level')
    .optional()
    .isInt({ min: 0 }).withMessage('Level must be a non-negative integer'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    next();
  }
];

// Validation for BOM update
const validateBOMUpdate = [
  param('id').isMongoId().withMessage('Invalid BOM ID format'),
  
  body('bom_version')
    .optional()
    .isString().withMessage('BOM version must be a string'),
  
  body('bom_type')
    .optional()
    .isIn(['Manufacturing', 'Subcontract', 'Phantom', 'Variant'])
    .withMessage('Invalid BOM type'),
  
  body('batch_size')
    .optional()
    .isInt({ min: 1 }).withMessage('Batch size must be a positive integer'),
  
  body('status')
    .optional()
    .isIn(['Draft', 'Active', 'Cancelled', 'Archived'])
    .withMessage('Invalid status'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    next();
  }
];

// Validation for revision creation
const validateRevisionCreate = [
  param('id').isMongoId().withMessage('Invalid BOM ID format'),
  
  body('change_description')
    .optional()
    .isString().withMessage('Change description must be a string')
    .trim(),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    next();
  }
];

module.exports = {
  validateBOMCreate,
  validateBOMUpdate,
  validateRevisionCreate
};