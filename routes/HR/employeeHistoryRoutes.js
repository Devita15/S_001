// routes/employeeHistoryRoutes.js
const express = require('express');
const router = express.Router();
const employeeHistoryController = require('../../controllers/HR/employeeHistoryController');
const { protect } = require('../../middleware/authMiddleware');
const { authorize } = require('../../middleware/roleMiddleware');

// All routes require authentication
router.use(protect);

// Get complete employee history
router.route('/:employeeId/history')
  .get(authorize('HR', 'Admin', 'SuperAdmin', 'Supervisor'), employeeHistoryController.getEmployeeHistory);

// Get employee history summary only
router.route('/:employeeId/history/summary')
  .get(authorize('HR', 'Admin', 'SuperAdmin', 'Supervisor'), employeeHistoryController.getEmployeeHistorySummary);

// Get employee salary history only
router.route('/:employeeId/history/salary')
  .get(authorize('HR', 'Admin', 'SuperAdmin', 'Supervisor'), employeeHistoryController.getSalaryHistory);

module.exports = router;