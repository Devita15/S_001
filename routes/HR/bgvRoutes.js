const express = require('express');
const router = express.Router();
const {
  initiateBGV,
  getBGVStatus,
  getBGVReport,
  handleWebhook,
  getAllBGV,
  decideBGV
} = require('../controllers/bgvController');
const { protect } = require('../../middleware/authMiddleware');

// Public webhook endpoint (no auth)
router.post('/webhook', handleWebhook);

// Protected routes
router.use(protect);

router.post('/initiate', initiateBGV);
router.get('/:id',  getBGVStatus);
router.get('/:id/report', getBGVReport);
// Add these routes to your existing router
router.get('/',  getAllBGV);
router.put('/:id/decision',  decideBGV);

module.exports = router;