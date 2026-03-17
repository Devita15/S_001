const express = require('express');
const router = express.Router();
const {
  createRequisition,
  submitRequisition,
  approveRequisition,
  rejectRequisition,
  getRequisitions,
  getRequisitionById,
  updateRequisition,
  addComment,
  getRequisitionStats,
  deleteRequisition
} = require('../../controllers/HR/requisitionController');
const { protect } = require('../../middleware/authMiddleware');
const { validate, requisitionValidation, validateId } = require('../../middleware/validationMiddleware');

// All routes require authentication
router.use(protect);

// Statistics route
router.get('/stats/dashboard',  getRequisitionStats);

// Main routes
router.route('/')
  .get(getRequisitions)
  .post(validate(requisitionValidation), createRequisition);

// Single requisition routes
router.route('/:id')
  .get(validate(validateId), getRequisitionById)
  .put(validate(validateId), updateRequisition)
  .delete(validate(validateId), deleteRequisition);

// Action routes
router.put('/:id/submit', validate(validateId), submitRequisition);
router.post('/:id/approve', validate(validateId),  approveRequisition);
router.post('/:id/reject', validate(validateId),  rejectRequisition);
router.post('/:id/comments', validate(validateId), addComment);

module.exports = router;