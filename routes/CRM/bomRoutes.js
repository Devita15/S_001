const express = require('express');
const router = express.Router();
const {
  createBOM,
  getBOMs,
  getBOMById,
  updateBOM,
  setDefaultBOM,
  explodeBOM,
  whereUsed,
  validateBOM,
  copyBOM
} = require('../controllers/bomController');
const { protect, authorize } = require('../middleware/auth');

// All routes are protected
router.use(protect);

// Public routes (all roles)
router.get('/', getBOMs);
router.get('/where-used/:componentId', whereUsed);
router.get('/:id', getBOMById);
router.get('/:id/explosion', explodeBOM);
router.get('/:id/validate', validateBOM);

// Protected routes - Admin, Manager
router.post('/', authorize('admin', 'manager'), createBOM);
router.post('/:id/set-default', authorize('manager'), setDefaultBOM);
router.post('/:id/copy', authorize('manager', 'production'), copyBOM);
router.put('/:id', authorize('manager', 'production'), updateBOM);

module.exports = router;