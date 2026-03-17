const express = require('express');
const router = express.Router();
const {
  getRawMaterials,
  getCurrentRates,
  getRawMaterial,
  createRawMaterial,
  updateRawMaterial,
  deleteRawMaterial,
  getRawMaterialsDropdown,
  bulkCreateRawMaterials
} = require('../controllers/rawMaterialController');
const { protect } = require('../../middleware/authMiddleware');

// All routes are protected
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Raw Materials
 *   description: Raw material master management with complete pricing data
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     RawMaterial:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         MaterialName:
 *           type: string
 *           example: "Copper"
 *         Grade:
 *           type: string
 *           example: "C11000"
 *         RatePerKG:
 *           type: number
 *           example: 850.5
 *         ScrapPercentage:
 *           type: number
 *           example: 5
 *         scrap_rate_per_kg:
 *           type: number
 *           example: 42.53
 *           description: "Calculated from ScrapPercentage if not provided"
 *         TransportLossPercentage:
 *           type: number
 *           example: 2
 *         profile_conversion_rate:
 *           type: number
 *           example: 60
 *           description: "Profile conversion rate in Rs/kg"
 *         transport_rate_per_kg:
 *           type: number
 *           example: 17.01
 *           description: "Calculated from TransportLossPercentage"
 *         EffectiveRate:
 *           type: number
 *           example: 910.04
 *           description: "Final effective rate after all calculations"
 *         DateEffective:
 *           type: string
 *           format: date
 *           example: "2024-01-15"
 *         IsActive:
 *           type: boolean
 *           example: true
 *
 *     RawMaterialCreate:
 *       type: object
 *       required:
 *         - MaterialName
 *         - Grade
 *         - RatePerKG
 *         - DateEffective
 *       properties:
 *         MaterialName:
 *           type: string
 *           example: "Copper"
 *         Grade:
 *           type: string
 *           example: "C11000"
 *         RatePerKG:
 *           type: number
 *           example: 850.5
 *         ScrapPercentage:
 *           type: number
 *           example: 5
 *           default: 0
 *         scrap_rate_per_kg:
 *           type: number
 *           example: 42.53
 *           description: "Auto-calculated if not provided"
 *         TransportLossPercentage:
 *           type: number
 *           example: 2
 *           default: 0
 *         profile_conversion_rate:
 *           type: number
 *           example: 60
 *           default: 0
 *         transport_rate_per_kg:
 *           type: number
 *           example: 17.01
 *           description: "Auto-calculated if not provided"
 *         DateEffective:
 *           type: string
 *           format: date
 *           example: "2024-01-15"
 *         IsActive:
 *           type: boolean
 *           default: true
 *
 *     RawMaterialUpdate:
 *       type: object
 *       properties:
 *         RatePerKG:
 *           type: number
 *         ScrapPercentage:
 *           type: number
 *         scrap_rate_per_kg:
 *           type: number
 *         TransportLossPercentage:
 *           type: number
 *         profile_conversion_rate:
 *           type: number
 *         transport_rate_per_kg:
 *           type: number
 *         DateEffective:
 *           type: string
 *           format: date
 *         IsActive:
 *           type: boolean
 *
 *   responses:
 *     RawMaterialNotFound:
 *       description: Raw material not found
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
 *                 example: "Raw material not found"
 *     
 *     DuplicateRawMaterial:
 *       description: Raw material with this name and grade already exists
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
 *                 example: "Raw material with this name and grade already exists"
 */

/**
 * @swagger
 * /api/raw-materials:
 *   get:
 *     summary: Get all raw materials with pagination
 *     tags: [Raw Materials]
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
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: materialName
 *         schema:
 *           type: string
 *         description: Filter by material name
 *       - in: query
 *         name: grade
 *         schema:
 *           type: string
 *         description: Filter by grade
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Raw materials retrieved successfully
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
 *                     $ref: '#/components/schemas/RawMaterial'
 *                 pagination:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', protect, getRawMaterials);

/**
 * @swagger
 * /api/raw-materials/current-rates:
 *   get:
 *     summary: Get current effective rates for all materials
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current rates retrieved successfully
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
 *                     $ref: '#/components/schemas/RawMaterial'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/current-rates', protect, getCurrentRates);

/**
 * @swagger
 * /api/raw-materials/dropdown:
 *   get:
 *     summary: Get raw materials for dropdown selection
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Raw materials dropdown retrieved successfully
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
 *                     type: object
 *                     properties:
 *                       MaterialName:
 *                         type: string
 *                       Grade:
 *                         type: string
 *                       RatePerKG:
 *                         type: number
 *                       EffectiveRate:
 *                         type: number
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/dropdown', protect, getRawMaterialsDropdown);

/**
 * @swagger
 * /api/raw-materials/bulk:
 *   post:
 *     summary: Bulk create/update raw materials
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               $ref: '#/components/schemas/RawMaterialCreate'
 *     responses:
 *       200:
 *         description: Bulk operation completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                 message:
 *                   type: string
 *                   example: "Bulk operation completed successfully"
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/bulk', protect, bulkCreateRawMaterials);

/**
 * @swagger
 * /api/raw-materials/{id}:
 *   get:
 *     summary: Get raw material by ID
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Raw material ID
 *     responses:
 *       200:
 *         description: Raw material retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/RawMaterial'
 *       404:
 *         $ref: '#/components/responses/RawMaterialNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/:id', protect, getRawMaterial);

/**
 * @swagger
 * /api/raw-materials:
 *   post:
 *     summary: Create a new raw material
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RawMaterialCreate'
 *     responses:
 *       201:
 *         description: Raw material created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/RawMaterial'
 *                 message:
 *                   type: string
 *                   example: "Raw material created successfully"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/DuplicateRawMaterial'
 *               - $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/', protect, createRawMaterial);

/**
 * @swagger
 * /api/raw-materials/{id}:
 *   put:
 *     summary: Update an existing raw material
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Raw material ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RawMaterialUpdate'
 *     responses:
 *       200:
 *         description: Raw material updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/RawMaterial'
 *                 message:
 *                   type: string
 *                   example: "Raw material updated successfully"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/DuplicateRawMaterial'
 *               - $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/RawMaterialNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.put('/:id', protect, updateRawMaterial);

/**
 * @swagger
 * /api/raw-materials/{id}:
 *   delete:
 *     summary: Deactivate a raw material (soft delete)
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Raw material ID
 *     responses:
 *       200:
 *         description: Raw material deactivated successfully
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
 *                   example: "Raw material deactivated successfully"
 *       404:
 *         $ref: '#/components/responses/RawMaterialNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.delete('/:id', protect, deleteRawMaterial);

module.exports = router;