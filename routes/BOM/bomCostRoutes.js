const express = require('express');
const router = express.Router();
const {
  costRollup,
  calculateComponentCost
} = require('../../controllers/BOM/bomCostController');
const { protect } = require('../../middleware/authMiddleware');

// All routes are protected
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: BOM Costing
 *   description: BOM cost calculation and rollup
 */

/**
 * @swagger
 * /api/boms/cost/component:
 *   post:
 *     summary: Calculate cost for a single component based on current RM rates
 *     tags: [BOM Costing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - component_item_id
 *               - quantity
 *             properties:
 *               component_item_id:
 *                 type: string
 *               quantity:
 *                 type: number
 *               scrap_percent:
 *                 type: number
 *                 default: 0
 *     responses:
 *       200:
 *         description: Component cost calculated successfully
 */
router.post('/component', calculateComponentCost);

/**
 * @swagger
 * /api/boms/{id}/cost-rollup:
 *   get:
 *     summary: Calculate total material cost for BOM including all sub-components
 *     tags: [BOM Costing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: quantity
 *         schema:
 *           type: number
 *           default: 1
 *     responses:
 *       200:
 *         description: Cost rollup calculated successfully
 */
router.get('/:id/cost-rollup', costRollup);

module.exports = router;