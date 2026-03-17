const express = require('express');
const router = express.Router();
const {
  initiateOffer,
  submitForApproval,
  approveOffer,
  rejectOffer,
  generateOfferLetter,
  sendOfferLetter,
  viewOffer,
  acceptOffer,
  viewOfferHTML  ,
  getCandidateApprovedOffers,
  getOffers

} = require('../controllers/offerController');
const { protect } = require('../../middleware/authMiddleware');
const { validate } = require('../../middleware/validationMiddleware');
const { body } = require('express-validator');

// Validation rules
const initiateOfferValidation = [
  body('candidateId').notEmpty().withMessage('Candidate ID is required'),
  body('applicationId').notEmpty().withMessage('Application ID is required'),
  body('ctcComponents.basic').isNumeric().withMessage('Basic salary must be a number'),
  body('joiningDate').optional().isISO8601().withMessage('Valid joining date is required')
];

const approveValidation = [
  body('comments').optional().isString(),
  body('signature').optional().isString()
];

const rejectValidation = [
  body('reason').notEmpty().withMessage('Rejection reason is required')
];

const acceptValidation = [
  body('token').notEmpty().withMessage('Token is required'),
  body('signature').optional().isString(),
  body('signatureType').optional().isIn(['digital', 'image', 'text'])
];

// Public routes (with token)
router.get('/view/:token', viewOffer);
router.post('/:id/accept', acceptOffer);

// Protected routes
router.use(protect);

router.get('/', 
  getOffers
);

router.post('/initiate',  validate(initiateOfferValidation), initiateOffer);
router.post('/:id/submit-approval', submitForApproval);
router.post('/:id/approve', validate(approveValidation), approveOffer);
router.post('/:id/reject', validate(rejectValidation), rejectOffer);
router.get('/:id/generate-letter', generateOfferLetter);
router.post('/:id/send', sendOfferLetter);
router.get('/:id/html', viewOfferHTML);
router.get('/candidate/:candidateId/approved', getCandidateApprovedOffers);

module.exports = router;