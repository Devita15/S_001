const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/authMiddleware');
const {
  getCompanyFinancial,
  createOrUpdateCompanyFinancial,
  updateCompanyFinancial,
  deleteCompanyFinancial,
  getCompanyFinancialStats
} = require("../../controllers/user's & setting's/companyFinancialController");

// All routes are protected
router.use(protect);

// Get company financial settings (with optional companyId query)
router.get('/', getCompanyFinancial);

// Get statistics
router.get('/stats', getCompanyFinancialStats);

// Create or update (POST handles both create and update)
router.post('/',createOrUpdateCompanyFinancial);

// Update by ID
router.put('/:id', updateCompanyFinancial);

// Delete (soft delete)
router.delete('/:id', deleteCompanyFinancial);

module.exports = router;