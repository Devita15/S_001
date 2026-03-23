const express = require('express');
const router = express.Router();
const upload = require('../../middleware/uploadMiddleware');
const {
  addCandidate,
  uploadResume,
  getCandidates,
  getCandidateById,
  updateCandidateStatus,
  addCandidateNote,
  shortlistCandidate,
  updateCandidate, 
  updateCandidateResume,
} = require('../../controllers/HR/candidateController');
const { protect } = require('../../middleware/authMiddleware');
const { validate, candidateValidation, validateId } = require('../../middleware/validationMiddleware');

router.use(protect);

router.route('/')
  .get(getCandidates)
  .post( validate(candidateValidation), addCandidate);

router.post('/upload-resume', upload.single('resume'), uploadResume);

router.route('/:id')
  .get(validate(validateId), getCandidateById)
  .put(updateCandidate); 

router.put('/:id/resume', 
  upload.single('resume'), 
  updateCandidateResume
); 

router.put('/:id/status', validate(validateId),  updateCandidateStatus);
router.post('/:id/notes', validate(validateId), addCandidateNote);
router.post('/:id/shortlist', validate(validateId),  shortlistCandidate);

module.exports = router;