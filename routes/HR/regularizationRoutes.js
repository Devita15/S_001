// routes/regularizationRoutes.js
const express = require('express');
const router = express.Router();
const regularizationController = require('../../controllers/HR/regularizationController');
const { protect } = require('../../middleware/authMiddleware');

router.use(protect);

/**
 * @swagger
 * /api/regularization:
 *   post:
 *     summary: Create regularization request
 *     tags: [Regularization]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - employeeId
 *               - date
 *               - requestType
 *               - reason
 *             properties:
 *               employeeId:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2024-01-15"
 *               requestType:
 *                 type: string
 *                 enum: [missed-punch, correct-time, work-from-home, on-duty]
 *               requestedIn:
 *                 type: string
 *                 format: date-time
 *               requestedOut:
 *                 type: string
 *                 format: date-time
 *               reason:
 *                 type: string
 *                 example: "Forgot to punch out"
 *               supportingDocument:
 *                 type: string
 *                 description: URL to supporting document
 *     responses:
 *       201:
 *         description: Regularization request created
 */
router.post('/', regularizationController.createRequest);

/**
 * @swagger
 * /api/regularization:
 *   get:
 *     summary: Get regularization requests
 *     tags: [Regularization]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: employeeId
 *         schema:
 *           type: string
 *         description: Filter by employee ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Pending, Approved, Rejected, Cancelled]
 *         description: Filter by status
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for filtering
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for filtering
 *     responses:
 *       200:
 *         description: Regularization requests retrieved
 */
router.get('/', regularizationController.getRequests);


router.delete('/:id', regularizationController.deleteRegularization);
/**
 * @swagger
 * /api/regularization/{id}/status:
 *   put:
 *     summary: Approve/reject regularization request
 *     tags: [Regularization]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [Approved, Rejected]
 *               remarks:
 *                 type: string
 *                 example: "Approved with remarks"
 *     responses:
 *       200:
 *         description: Regularization request updated
 */
router.put('/:id/status', regularizationController.updateRequestStatus);

module.exports = router;