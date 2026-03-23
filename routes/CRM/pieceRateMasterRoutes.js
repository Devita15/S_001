const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/authMiddleware');
const { authorize } = require('../../middleware/roleMiddleware')
const pieceRateMasterController = require('../../controllers/HR/pieceRateMasterController');
// All routes require authentication
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: PieceRateMaster
 *   description: Piece rate master management for manufacturing operations
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     PieceRateMaster:
 *       type: object
 *       required:
 *         - productType
 *         - operation
 *         - ratePerUnit
 *         - effectiveFrom
 *       properties:
 *         productType:
 *           type: string
 *           description: Type of product (e.g., Engine Piston, Gear, Shaft)
 *         operation:
 *           type: string
 *           description: Manufacturing operation (e.g., CNC Machining, Grinding, Assembly)
 *         ratePerUnit:
 *           type: number
 *           minimum: 0
 *           description: Rate per unit in rupees
 *         uom:
 *           type: string
 *           enum: [piece, dozen, kg, meter, hour]
 *           default: piece
 *         skillLevel:
 *           type: string
 *           enum: [Unskilled, Semi-Skilled, Skilled, Highly Skilled]
 *         departmentId:
 *           type: string
 *           description: ObjectId of department
 *         effectiveFrom:
 *           type: string
 *           format: date
 *           description: Date from which this rate is effective
 *         effectiveTo:
 *           type: string
 *           format: date
 *           description: Date until which this rate is effective (null for ongoing)
 *         isActive:
 *           type: boolean
 *           default: true
 */

/**
 * @swagger
 * /api/piece-rate-master:
 *   post:
 *     summary: Create a new piece rate (Admin/HR only)
 *     tags: [PieceRateMaster]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productType
 *               - operation
 *               - ratePerUnit
 *               - effectiveFrom
 *             properties:
 *               productType:
 *                 type: string
 *                 example: "Engine Piston"
 *               operation:
 *                 type: string
 *                 example: "CNC Machining"
 *               ratePerUnit:
 *                 type: number
 *                 example: 7.50
 *               uom:
 *                 type: string
 *                 enum: [piece, dozen, kg, meter, hour]
 *                 default: piece
 *               skillLevel:
 *                 type: string
 *                 enum: [Unskilled, Semi-Skilled, Skilled, Highly Skilled]
 *               departmentId:
 *                 type: string
 *                 example: "65f1a2b3c4d5e6f7a8b9c0d1"
 *               effectiveFrom:
 *                 type: string
 *                 format: date
 *                 example: "2026-01-01"
 *               effectiveTo:
 *                 type: string
 *                 format: date
 *                 example: "2026-12-31"
 *               isActive:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Piece rate created successfully
 *       400:
 *         description: Validation error or duplicate entry
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden - insufficient permissions
 */
router.post(
  '/',
  authorize('SuperAdmin', 'HR', 'ProductionManager'),
  pieceRateMasterController.createPieceRate
);

/**
 * @swagger
 * /api/piece-rate-master:
 *   get:
 *     summary: Get all piece rates with filters
 *     tags: [PieceRateMaster]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of items per page
 *       - in: query
 *         name: productType
 *         schema:
 *           type: string
 *         description: Filter by product type (partial match)
 *       - in: query
 *         name: operation
 *         schema:
 *           type: string
 *         description: Filter by operation (partial match)
 *       - in: query
 *         name: departmentId
 *         schema:
 *           type: string
 *         description: Filter by department ID
 *       - in: query
 *         name: skillLevel
 *         schema:
 *           type: string
 *           enum: [Unskilled, Semi-Skilled, Skilled, Highly Skilled]
 *         description: Filter by skill level
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: effectiveDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Get rates valid on this date
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search across productType and operation
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Piece rates retrieved successfully
 *       401:
 *         description: Not authorized
 */
router.get('/', pieceRateMasterController.getAllPieceRates);

/**
 * @swagger
 * /api/piece-rate-master/{id}:
 *   get:
 *     summary: Get piece rate by ID
 *     tags: [PieceRateMaster]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Piece rate ID
 *     responses:
 *       200:
 *         description: Piece rate retrieved successfully
 *       404:
 *         description: Piece rate not found
 *       400:
 *         description: Invalid ID format
 */
router.get('/:id', pieceRateMasterController.getPieceRateById);

/**
 * @swagger
 * /api/piece-rate-master/{id}:
 *   put:
 *     summary: Update piece rate (Admin/HR only)
 *     tags: [PieceRateMaster]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Piece rate ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               productType:
 *                 type: string
 *               operation:
 *                 type: string
 *               ratePerUnit:
 *                 type: number
 *               uom:
 *                 type: string
 *                 enum: [piece, dozen, kg, meter, hour]
 *               skillLevel:
 *                 type: string
 *                 enum: [Unskilled, Semi-Skilled, Skilled, Highly Skilled]
 *               departmentId:
 *                 type: string
 *               effectiveFrom:
 *                 type: string
 *                 format: date
 *               effectiveTo:
 *                 type: string
 *                 format: date
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Piece rate updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden - insufficient permissions
 *       404:
 *         description: Piece rate not found
 */
router.put(
  '/:id',
  authorize('SuperAdmin', 'HR', 'ProductionManager'),
  pieceRateMasterController.updatePieceRate
);

/**
 * @swagger
 * /api/piece-rate-master/{id}:
 *   delete:
 *     summary: Delete piece rate (Admin/HR only)
 *     tags: [PieceRateMaster]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Piece rate ID
 *     responses:
 *       200:
 *         description: Piece rate deleted successfully
 *       400:
 *         description: Cannot delete rate that is in use (will be deactivated)
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden - insufficient permissions
 *       404:
 *         description: Piece rate not found
 */
router.delete(
  '/:id',
  authorize('SuperAdmin', 'HR'),
  pieceRateMasterController.deletePieceRate
);


module.exports = router;