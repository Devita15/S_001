const express = require('express');
const router = express.Router();
const {
  getProcessDetails,
  getProcessDetail,
  getProcessDetailsByPart,
  createProcessDetail,
  updateProcessDetail,
  deleteProcessDetail
} = require('../controllers/processDetailController');
const { protect } = require('../../middleware/authMiddleware');

router.use(protect);

router.route('/')
  .get(getProcessDetails)
  .post(createProcessDetail);

router.get('/part/:partNo', getProcessDetailsByPart);

router.route('/:id')
  .get(getProcessDetail)
  .put(updateProcessDetail)
  .delete(deleteProcessDetail);

module.exports = router;