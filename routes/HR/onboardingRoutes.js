// routes/onboardingRoutes.js
const express = require('express');
const router = express.Router();
const {
  createOnboarding,
  getOnboardingDetails,
  updateOnboardingStatus
} = require('../../controllers/HR/onboardingController');
const { protect } = require('../../middleware/authMiddleware');

// All routes are protected and require HR/Admin access
router.post('/create', protect, createOnboarding);
router.get('/:employeeId', protect, getOnboardingDetails);
router.put('/update-status/:employeeId', protect, updateOnboardingStatus);

module.exports = router;