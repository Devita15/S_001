const express = require('express');
const router = express.Router();
const incrementController = require('../../controllers/HR/incrementController');
const { protect, authorize } = require('../../middleware/authMiddleware');

// Protect all routes
router.use(protect);

// Preview endpoints (accessible by HR/Admin)
router.post('/preview/batch', 
  authorize('Admin', 'HR'), 
  incrementController.previewBatchIncrements
);

router.get('/preview/employee/:employeeId', 
  authorize('Admin', 'HR'), 
  incrementController.previewEmployeeIncrement
);

// Summary endpoint
router.get('/summary/:year', 
  authorize('Admin', 'HR', 'Manager'), 
  incrementController.getIncrementSummary
);

// CRUD operations (HR/Admin only)
router.route('/')
  .post(authorize('Admin', 'HR'), incrementController.createIncrement)
  .get(authorize('Admin', 'HR', 'Manager'), incrementController.getIncrements);

router.route('/:id')
  .get(authorize('Admin', 'HR', 'Manager', 'Employee'), incrementController.getIncrementById)
  .put(authorize('Admin', 'HR'), incrementController.updateIncrement);

// Workflow endpoints
router.put('/:id/hr-review', 
  authorize('Admin', 'HR'), 
  incrementController.hrReview
);

router.put('/:id/department-approve', 
  authorize('Admin', 'Manager'), 
  incrementController.departmentApprove
);

router.put('/:id/finance-approve', 
  authorize('Admin', 'Finance'), 
  incrementController.financeApprove
);

router.put('/:id/apply', 
  authorize('Admin'), 
  incrementController.applyIncrement
);

router.put('/:id/reject', 
  authorize('Admin', 'HR', 'Manager', 'Finance'), 
  incrementController.rejectIncrement
);

module.exports = router;