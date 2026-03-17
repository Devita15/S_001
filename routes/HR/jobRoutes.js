const express = require('express');
const router = express.Router();
const {
  createJobOpening,
  publishJob,
  getJobs,
  getJobById,
  updateJob,
  closeJob,
  deleteJob  
} = require('../../controllers/HR/jobController');
const { protect } = require('../../middleware/authMiddleware');
const { validate, jobValidation, validateId } = require('../../middleware/validationMiddleware');

router.use(protect);

router.route('/')
  .get(getJobs)
  .post( validate(jobValidation), createJobOpening);

router.route('/:id')
  .get(validate(validateId), getJobById)
  .put(validate(validateId),  updateJob)
  .delete(validate(validateId), deleteJob); 

router.post('/:id/publish', validate(validateId), publishJob);
router.post('/:id/close', validate(validateId), closeJob);

module.exports = router;