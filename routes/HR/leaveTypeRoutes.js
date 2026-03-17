const express = require('express');
const router = express.Router();
const {
  getLeaveTypes,
  getLeaveType,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType
} = require('../../controllers/HR/leaveTypeController');
const { protect } = require('../../middleware/authMiddleware');
router.use(protect);

// Public routes
router.get('/', protect,getLeaveTypes);
router.get('/:id',protect, getLeaveType);
router.post('/', protect,createLeaveType);
router.put('/:id', protect,updateLeaveType);
router.delete('/:id', protect,deleteLeaveType); // Hard delete

module.exports = router;