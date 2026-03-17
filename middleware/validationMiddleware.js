const { body, param, query, validationResult } = require('express-validator');

// Validation middleware
const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  };
};

// Requisition validation rules
const requisitionValidation = [
  body('department').notEmpty().withMessage('Department is required'),
  body('location').notEmpty().withMessage('Location is required'),
  body('positionTitle').notEmpty().withMessage('Position title is required'),
  body('noOfPositions').isInt({ min: 1 }).withMessage('Number of positions must be at least 1'),
  body('employmentType').isIn(['Permanent', 'Contract', 'Temporary', 'Internship']),
  body('reasonForHire').notEmpty().withMessage('Reason for hire is required'),
  body('education').notEmpty().withMessage('Education requirement is required'),
  body('experienceYears').isInt({ min: 0, max: 50 }),
  body('skills').notEmpty().withMessage('Skills are required'),
  body('budgetMin').isFloat({ min: 0 }).withMessage('Minimum budget must be a positive number'),
  body('budgetMax').isFloat({ min: 0 }).withMessage('Maximum budget must be a positive number'),
  body('grade').notEmpty().withMessage('Grade is required'),
  body('justification').notEmpty().withMessage('Justification is required')
];

// Job opening validation
const jobValidation = [
  body('requisitionId').notEmpty().withMessage('Requisition ID is required'),
  body('description').notEmpty().withMessage('Job description is required'),
  body('publishTo').isArray().withMessage('Publish to must be an array')
];

// Candidate validation
const candidateValidation = [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('source').isIn(['naukri', 'linkedin', 'indeed', 'walkin', 'reference', 'careerPage', 'other'])
];

// Interview validation
const interviewValidation = [
  body('applicationId').notEmpty().withMessage('Application ID is required'),
  body('round').isIn(['Telephonic', 'Technical', 'HR', 'Managerial', 'Final']),
  body('interviewers').isArray().withMessage('Interviewers must be an array'),
  body('scheduledAt').isISO8601().withMessage('Valid scheduled date is required'),
  body('type').isIn(['in-person', 'video', 'telephonic'])
];

// Interview feedback validation
const feedbackValidation = [
  body('ratings').optional().isObject(),
  body('ratings.technical').optional().isInt({ min: 1, max: 5 }),
  body('ratings.communication').optional().isInt({ min: 1, max: 5 }),
  body('ratings.problemSolving').optional().isInt({ min: 1, max: 5 }),
  body('ratings.culturalFit').optional().isInt({ min: 1, max: 5 }),
  body('ratings.overall').optional().isInt({ min: 1, max: 5 }),
  body('decision').optional().isIn(['select', 'reject', 'hold'])
];

// ID param validation
const validateId = [
  param('id').isMongoId().withMessage('Invalid ID format')
];

// Pagination validation
const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

module.exports = {
  validate,
  requisitionValidation,
  jobValidation,
  candidateValidation,
  interviewValidation,
  feedbackValidation,
  validateId,
  validatePagination
};