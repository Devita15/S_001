const express = require('express');
const router = express.Router();
const {
  scheduleInterview,
  rescheduleInterview,
  cancelInterview,
  submitFeedback,
  getInterviews,
  getInterviewById
} = require('../../controllers/HR/interviewController');
const { protect } = require('../../middleware/authMiddleware');
const { validate, interviewValidation, feedbackValidation, validateId } = require('../../middleware/validationMiddleware');

router.use(protect);

router.route('/')
  .get(getInterviews)
  .post( validate(interviewValidation), scheduleInterview);

router.get('/:id', validate(validateId), getInterviewById);

router.put('/:id/reschedule', validate(validateId), rescheduleInterview);
router.post('/:id/cancel', validate(validateId),  cancelInterview);
router.post('/:id/feedback', validate(validateId),  validate(feedbackValidation), submitFeedback);

module.exports = router;