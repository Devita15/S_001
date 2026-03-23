const express = require('express');
const router = express.Router();
const incrementPolicyController = require('../../controllers/HR/incrementPolicyController');
const { protect, authorize } = require('../../middleware/authMiddleware');

// All routes require authentication and admin/HR role
router.use(protect);
router.use(authorize('Admin', 'HR'));

router.route('/')
  .post(incrementPolicyController.createPolicy)
  .get(incrementPolicyController.getPolicies);

router.get('/active/:year', incrementPolicyController.getActivePolicy);

router.route('/:id')
  .put(incrementPolicyController.updatePolicy);

router.put('/:id/activate', incrementPolicyController.activatePolicy);

module.exports = router;