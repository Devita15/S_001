const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/authMiddleware');
const { authorize } = require('../../middleware/roleMiddleware');
const policyController = require('../../controllers/HR/policyController');
const enrollmentController = require('../../controllers/HR/enrollmentController');
const claimController = require('../../controllers/HR/claimController');

// ==================== POLICY ROUTES ====================
// All policy routes require authentication and HR role

/**
 * @route   POST /api/mediclaim/policies
 * @desc    Create a new mediclaim policy
 * @access  HR only
 */
router.post('/policies', 
  protect, 
  policyController.createPolicy
);

/**
 * @route   GET /api/mediclaim/policies
 * @desc    Get all policies with filters
 * @access  HR, Manager
 */
router.get('/policies', 
  protect, 
  policyController.getAllPolicies
);

/**
 * @route   GET /api/mediclaim/policies/renewal-report
 * @desc    Get renewal report for expiring policies
 * @access  HR only
 */
router.get('/policies/renewal-report', 
  protect, 
  policyController.getRenewalReport
);

/**
 * @route   GET /api/mediclaim/policies/:id
 * @desc    Get policy by ID with enrollments and claims
 * @access  HR, Manager
 */
router.get('/policies/:id', 
  protect, 
  policyController.getPolicyById
);

/**
 * @route   PUT /api/mediclaim/policies/:id
 * @desc    Update policy details
 * @access  HR only
 */
router.put('/policies/:id', 
  protect, 
  policyController.updatePolicy
);

/**
 * @route   DELETE /api/mediclaim/policies/:id
 * @desc    Delete a policy (only if no enrollments)
 * @access  HR only
 */
router.delete('/policies/:id', 
  protect,  
  policyController.deletePolicy
);

// ==================== ENROLLMENT ROUTES ====================

/**
 * @route   POST /api/mediclaim/enroll
 * @desc    Enroll a single employee
 * @access  HR only
 */
router.post('/enroll', 
  protect, 
  enrollmentController.enrollEmployee
);

/**
 * @route   POST /api/mediclaim/enroll/bulk
 * @desc    Bulk enroll multiple employees
 * @access  HR only
 */
router.post('/enroll/bulk', 
  protect, 
  enrollmentController.bulkEnrollEmployees
);

/**
 * @route   GET /api/mediclaim/enrollments
 * @desc    Get all enrollments with filters
 * @access  HR, Manager
 */
router.get('/enrollments', 
  protect, 
  enrollmentController.getEnrollments
);

/**
 * @route   GET /api/mediclaim/enrollments/:id
 * @desc    Get enrollment by ID
 * @access  HR, Manager, Employee (self)
 */
router.get('/enrollments/:id', 
  protect, 
  enrollmentController.getEnrollmentById
);

/**
 * @route   PUT /api/mediclaim/enrollments/:id
 * @desc    Update enrollment (add dependents, nominees)
 * @access  HR only
 */
router.put('/enrollments/:id', 
  protect, 
  enrollmentController.updateEnrollment
);

/**
 * @route   DELETE /api/mediclaim/enrollments/:id
 * @desc    Cancel enrollment
 * @access  HR only
 */
router.delete('/enrollments/:id', 
  protect, 
  enrollmentController.cancelEnrollment
);

// ==================== CLAIM ROUTES ====================

/**
 * @route   POST /api/mediclaim/claims
 * @desc    Submit a new claim
 * @access  Employee, HR
 */
router.post('/claims', 
  protect,  
  claimController.submitClaim
);

/**
 * @route   GET /api/mediclaim/claims
 * @desc    Get all claims with filters
 * @access  HR, Manager
 */
router.get('/claims', 
  protect,  
  claimController.getClaims
);

/**
 * @route   GET /api/mediclaim/claims/statistics
 * @desc    Get claim statistics
 * @access  HR only
 */
router.get('/claims/statistics', 
  protect, 
  claimController.getClaimStatistics
);

/**
 * @route   GET /api/mediclaim/claims/:id
 * @desc    Get claim by ID
 * @access  HR, Manager, Employee (own)
 */
router.get('/claims/:id', 
  protect, 
  claimController.getClaimById
);

/**
 * @route   PUT /api/mediclaim/claims/:id/status
 * @desc    Update claim status (approve/reject/settle)
 * @access  HR only
 */
router.put('/claims/:id/status', 
  protect, 
  claimController.updateClaimStatus
);

module.exports = router;