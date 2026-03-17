const express = require('express');
const router = express.Router();
const {
  uploadDocument,
  verifyDocument,
  getDocuments,
  getDocumentById,
  generateUploadUrl,
  downloadDocument
} = require('../controllers/documentController');
const { protect } = require('../../middleware/authMiddleware');
const upload = require('../../middleware/uploadMiddleware');
const { validate } = require('../../middleware/validationMiddleware');
const { body } = require('express-validator');

const verifyValidation = [
  body('verified').isBoolean().withMessage('Verified must be true or false'),
  body('comments').optional().isString()
];

// Public routes (with token for candidate upload)
router.post('/upload-token', upload.single('document'), uploadDocument);

// Protected routes
router.use(protect);

router.get('/', getDocuments);
router.get('/upload-url',  generateUploadUrl);
router.post('/upload', upload.single('document'), uploadDocument);
router.get('/:id', getDocumentById);
router.get('/:id/download', downloadDocument);
router.put('/:id/verify', validate(verifyValidation), verifyDocument);

module.exports = router;