const express = require('express');
const router = express.Router();
const {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeStats
} = require('../controllers/employeeController');
const { protect } = require('../../middleware/authMiddleware');
const { authorize } = require('../../middleware/roleMiddleware');

// All routes are protected
router.use(protect);

router.get('/', protect, getEmployees);
router.get('/stats', protect, getEmployeeStats);

router.get('/:id', protect,getEmployee);

router.post('/', protect,createEmployee);
router.put('/:id', protect, updateEmployee);
router.delete('/:id',protect,deleteEmployee);

module.exports = router;