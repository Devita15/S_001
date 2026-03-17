const express = require('express');
const router = express.Router();
const {
  getDesignations,
  getDesignation,
  createDesignation,
  updateDesignation,
  deleteDesignation
} = require('../../controllers/HR/designationController');
const { protect } = require('../../middleware/authMiddleware');

// Public routes
router.get('/', protect,getDesignations);
router.get('/:id',protect, getDesignation);
router.post('/', protect,createDesignation);
router.put('/:id',protect, updateDesignation);
router.delete('/:id', protect,deleteDesignation); // Hard delete

module.exports = router;