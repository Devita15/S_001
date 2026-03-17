const express = require('express');
const router = express.Router();
const {
  getDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  deleteDepartment
} = require('../controllers/departmentController');
const { protect } = require('../../middleware/authMiddleware');

// Public routes
router.get('/', protect,getDepartments);
router.get('/:id', protect,getDepartment);
router.post('/', protect,createDepartment);
router.put('/:id', protect,updateDepartment);
router.delete('/:id', protect,deleteDepartment); // Hard delete

module.exports = router;