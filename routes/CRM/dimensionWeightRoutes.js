const express = require('express');
const router = express.Router();
const {
  getDimensionWeights,
  getDimensionWeight,
  createDimensionWeight,
  updateDimensionWeight,
  deleteDimensionWeight
} = require('../../controllers/CRM/dimensionWeightController');
const { protect } = require('../../middleware/authMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     DimensionWeight:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7d0"
 *         PartNo:
 *           oneOf:
 *             - type: string
 *               example: "PART-001"
 *             - type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *                 PartNo:
 *                   type: string
 *                   example: "PART-001"
 *                 PartName:
 *                   type: string
 *                   example: "Bearing Housing"
 *                 MaterialType:
 *                   type: string
 *                   example: "Copper"
 *         Thickness:
 *           type: number
 *           format: float
 *           minimum: 0.1
 *           example: 5.0
 *           description: "Thickness in mm"
 *         Width:
 *           type: number
 *           format: float
 *           minimum: 0.1
 *           example: 50.0
 *           description: "Width in mm"
 *         Length:
 *           type: number
 *           format: float
 *           minimum: 0.1
 *           example: 100.0
 *           description: "Length in mm"
 *         Density:
 *           type: number
 *           format: float
 *           minimum: 0.1
 *           example: 8.96
 *           description: "Material density in g/cm³ (default: copper = 8.96)"
 *         WeightInKG:
 *           type: number
 *           format: float
 *           minimum: 0
 *           example: 0.224
 *           description: "Calculated weight in kilograms"
 *         CreatedAt:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:30:00.000Z"
 *         UpdatedAt:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:30:00.000Z"
 * 
 *     DimensionWeightCreate:
 *       type: object
 *       required:
 *         - PartNo
 *         - Thickness
 *         - Width
 *         - Length
 *       properties:
 *         PartNo:
 *           type: string
 *           example: "PART-001"
 *           description: "Part number must exist in Items collection"
 *         Thickness:
 *           type: number
 *           format: float
 *           minimum: 0.1
 *           example: 5.0
 *           description: "Thickness in mm"
 *         Width:
 *           type: number
 *           format: float
 *           minimum: 0.1
 *           example: 50.0
 *           description: "Width in mm"
 *         Length:
 *           type: number
 *           format: float
 *           minimum: 0.1
 *           example: 100.0
 *           description: "Length in mm"
 *         Density:
 *           type: number
 *           format: float
 *           minimum: 0.1
 *           example: 8.96
 *           description: "Material density in g/cm³. Defaults to 8.96 (copper) if not provided."
 * 
 *     DimensionWeightUpdate:
 *       type: object
 *       properties:
 *         Thickness:
 *           type: number
 *           format: float
 *           minimum: 0.1
 *           example: 6.0
 *         Width:
 *           type: number
 *           format: float
 *           minimum: 0.1
 *           example: 55.0
 *         Length:
 *           type: number
 *           format: float
 *           minimum: 0.1
 *           example: 110.0
 *         Density:
 *           type: number
 *           format: float
 *           minimum: 0.1
 *           example: 7.85
 * 
 *   responses:
 *     DimensionWeightNotFound:
 *       description: Dimension weight record not found
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "Dimension weight not found"
 * 
 *     ItemNotFound:
 *       description: Item/Part not found
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "Item not found"
 * 
 *     DuplicateDimensionWeight:
 *       description: Dimension weight already exists for this part
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "Dimension weight already exists for this part"
 * 
 *     ValidationError:
 *       description: Validation error
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "Thickness is required, Width must be greater than 0.1"
 * 
 *   parameters:
 *     partNoQueryParam:
 *       in: query
 *       name: partNo
 *       schema:
 *         type: string
 *       description: Filter by part number
 * 
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * tags:
 *   name: DimensionWeights
 *   description: Dimension and weight calculation management
 */

/**
 * @swagger
 * /api/dimension-weights:
 *   get:
 *     summary: Get all dimension weights with pagination and filtering
 *     tags: [DimensionWeights]
 *     description: Retrieve all dimension weight records with optional part number filtering and pagination
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of records per page
 *       - $ref: '#/components/parameters/partNoQueryParam'
 *     responses:
 *       200:
 *         description: List of dimension weights retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DimensionWeight'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                       example: 1
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *                     totalItems:
 *                       type: integer
 *                       example: 50
 *                     itemsPerPage:
 *                       type: integer
 *                       example: 10
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 *     examples:
 *       GetDimensionWeightsResponse:
 *         value:
 *           success: true
 *           data:
 *             - _id: "64f8e9b7a1b2c3d4e5f6a7d0"
 *               PartNo:
 *                 _id: "64f8e9b7a1b2c3d4e5f6a7b8"
 *                 PartNo: "PART-001"
 *                 PartName: "Bearing Housing"
 *                 MaterialType: "Copper"
 *               Thickness: 5.0
 *               Width: 50.0
 *               Length: 100.0
 *               Density: 8.96
 *               WeightInKG: 0.224
 *               CreatedAt: "2024-01-15T10:30:00.000Z"
 *               UpdatedAt: "2024-01-15T10:30:00.000Z"
 *           pagination:
 *             currentPage: 1
 *             totalPages: 5
 *             totalItems: 50
 *             itemsPerPage: 10
 */
router.get('/', protect, getDimensionWeights);

/**
 * @swagger
 * /api/dimension-weights/{id}:
 *   get:
 *     summary: Get single dimension weight by ID
 *     tags: [DimensionWeights]
 *     description: Retrieve detailed information about a specific dimension weight record
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Dimension weight record ID
 *     responses:
 *       200:
 *         description: Dimension weight retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/DimensionWeight'
 *       404:
 *         $ref: '#/components/responses/DimensionWeightNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 *     examples:
 *       GetDimensionWeightResponse:
 *         value:
 *           success: true
 *           data:
 *             _id: "64f8e9b7a1b2c3d4e5f6a7d0"
 *             PartNo:
 *               _id: "64f8e9b7a1b2c3d4e5f6a7b8"
 *               PartNo: "PART-001"
 *               PartName: "Bearing Housing"
 *               MaterialType: "Copper"
 *             Thickness: 5.0
 *             Width: 50.0
 *             Length: 100.0
 *             Density: 8.96
 *             WeightInKG: 0.224
 *             CreatedAt: "2024-01-15T10:30:00.000Z"
 *             UpdatedAt: "2024-01-15T10:30:00.000Z"
 */
router.get('/:id', protect, getDimensionWeight);

/**
 * @swagger
 * /api/dimension-weights:
 *   post:
 *     summary: Create a new dimension weight record
 *     tags: [DimensionWeights]
 *     description: Create a new dimension weight record for calculating part weight. Only one record allowed per part number.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DimensionWeightCreate'
 *     responses:
 *       201:
 *         description: Dimension weight created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/DimensionWeight'
 *                 message:
 *                   type: string
 *                   example: "Dimension weight created successfully"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/DuplicateDimensionWeight'
 *               - $ref: '#/components/responses/ValidationError'
 *               - $ref: '#/components/responses/ItemNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 *     examples:
 *       CreateDimensionWeightRequest:
 *         value:
 *           PartNo: "PART-001"
 *           Thickness: 5.0
 *           Width: 50.0
 *           Length: 100.0
 *           Density: 8.96
 *       CreateDimensionWeightResponse:
 *         value:
 *           success: true
 *           data:
 *             _id: "64f8e9b7a1b2c3d4e5f6a7d0"
 *             PartNo: "PART-001"
 *             Thickness: 5.0
 *             Width: 50.0
 *             Length: 100.0
 *             Density: 8.96
 *             WeightInKG: 0.224
 *             CreatedAt: "2024-01-15T10:30:00.000Z"
 *             UpdatedAt: "2024-01-15T10:30:00.000Z"
 *           message: "Dimension weight created successfully"
 */
router.post('/', protect, createDimensionWeight);

/**
 * @swagger
 * /api/dimension-weights/{id}:
 *   put:
 *     summary: Update an existing dimension weight record
 *     tags: [DimensionWeights]
 *     description: Update dimension measurements and recalculate weight
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Dimension weight record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DimensionWeightUpdate'
 *     responses:
 *       200:
 *         description: Dimension weight updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/DimensionWeight'
 *                 message:
 *                   type: string
 *                   example: "Dimension weight updated successfully"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/DimensionWeightNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 *     examples:
 *       UpdateDimensionWeightRequest:
 *         value:
 *           Thickness: 6.0
 *           Width: 55.0
 *           Length: 110.0
 *       UpdateDimensionWeightResponse:
 *         value:
 *           success: true
 *           data:
 *             _id: "64f8e9b7a1b2c3d4e5f6a7d0"
 *             PartNo: "PART-001"
 *             Thickness: 6.0
 *             Width: 55.0
 *             Length: 110.0
 *             Density: 8.96
 *             WeightInKG: 0.325
 *             CreatedAt: "2024-01-15T10:30:00.000Z"
 *             UpdatedAt: "2024-01-16T14:20:00.000Z"
 *           message: "Dimension weight updated successfully"
 */
router.put('/:id', protect, updateDimensionWeight);

/**
 * @swagger
 * /api/dimension-weights/{id}:
 *   delete:
 *     summary: Delete a dimension weight record (HARD DELETE)
 *     tags: [DimensionWeights]
 *     description: Permanently delete a dimension weight record from the database
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Dimension weight record ID
 *     responses:
 *       200:
 *         description: Dimension weight deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Dimension weight deleted successfully"
 *       404:
 *         $ref: '#/components/responses/DimensionWeightNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.delete('/:id', protect, deleteDimensionWeight);

module.exports = router;