const express = require('express');
const router = express.Router();
const subdealerController = require('../controllers/subdealerController');
const { protect } = require('../middlewares/auth');
const { logAction } = require('../middlewares/audit');

// CRITICAL: This must come BEFORE any middleware that needs req.body
router.use(express.json());

// Now these middleware can safely access req.body
// Create a new subdealer
router.post('/',
  protect,
  logAction('CREATE', 'Subdealer'),
  subdealerController.createSubdealer
);

// Get all subdealers
router.get('/',
  protect,
  subdealerController.getAllSubdealers
);
// Get a specific subdealer by ID
router.get('/:id',
  protect,
  subdealerController.getSubdealerById
);

// Update a subdealer
router.put('/:id',
  protect,
  logAction('UPDATE', 'Subdealer'),
  subdealerController.updateSubdealer
);

// Update subdealer status
router.patch('/:id/status',
  protect,
  logAction('UPDATE_STATUS', 'Subdealer'),
  subdealerController.updateSubdealerStatus
);

// Delete a subdealer
router.delete('/:id',
  protect,
  logAction('DELETE', 'Subdealer'),
  subdealerController.deleteSubdealer
);

// Get financial summary for a specific subdealer
router.get('/:id/financial-summary',
  protect,
  subdealerController.getSubdealerFinancialSummary
);

// Get all subdealers with their financial summaries
router.get('/financials/all',
  protect,
  subdealerController.getAllSubdealersWithFinancialSummary
);

// Get subdealers by branch
router.get('/branch/:branchId',
  protect,
  subdealerController.getSubdealersByBranch
);

router.get('/:id/headers',protect, subdealerController.getSubdealerHeaders);
module.exports = router;