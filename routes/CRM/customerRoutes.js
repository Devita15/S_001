const express = require('express');
const router = express.Router();
const {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer
} = require('../../controllers/CRM/customerController');
const { protect } = require('../../middleware/authMiddleware');

router.get('/',protect, getCustomers);
router.get('/:id', protect,getCustomer);
router.post('/', protect,createCustomer);
router.put('/:id', protect,updateCustomer);
router.delete('/:id', protect,deleteCustomer);

module.exports = router;