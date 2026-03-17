const express = require('express');
const router = express.Router();
const {
  getMaterials,
  getMaterial,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  getMaterialsDropdown
} = require('../controllers/materialController');
const { protect } = require('../../middleware/authMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     Material:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         material_id:
 *           type: string
 *           example: "MAT-001"
 *         MaterialCode:
 *           type: string
 *           example: "CU-001"
 *         MaterialName:
 *           type: string
 *           example: "Copper"
 *         Description:
 *           type: string
 *           example: "Electrolytic Copper Grade A"
 *         Density:
 *           type: number
 *           format: float
 *           example: 8.96
 *         Unit:
 *           type: string
 *           enum: [Kg, Gram, Ton]
 *           example: "Kg"
 *         Standard:
 *           type: string
 *           example: "ASTM B152"
 *         Grade:
 *           type: string
 *           example: "C11000"
 *         Color:
 *           type: string
 *           example: "Reddish"
 *         EffectiveRate:
 *           type: number
 *           format: float
 *           example: 850.50
 *         IsActive:
 *           type: boolean
 *           example: true
 *         CreatedBy:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *               example: "64f8e9b7a1b2c3d4e5f6a7c0"
 *             Username:
 *               type: string
 *               example: "john.doe"
 *             Email:
 *               type: string
 *               example: "john.doe@example.com"
 *         UpdatedBy:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *               example: "64f8e9b7a1b2c3d4e5f6a7c1"
 *             Username:
 *               type: string
 *               example: "jane.doe"
 *             Email:
 *               type: string
 *               example: "jane.doe@example.com"
 *         CreatedAt:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:30:00.000Z"
 *         UpdatedAt:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:30:00.000Z"
 * 
 *     MaterialCreate:
 *       type: object
 *       required:
 *         - MaterialCode
 *         - MaterialName
 *         - Density
 *         - Unit
 *         - EffectiveRate
 *       properties:
 *         material_id:
 *           type: string
 *           example: "MAT-001"
 *           description: "Auto-generated if not provided"
 *         MaterialCode:
 *           type: string
 *           example: "CU-001"
 *           description: "Must be unique"
 *         MaterialName:
 *           type: string
 *           example: "Copper"
 *         Description:
 *           type: string
 *           example: "Electrolytic Copper Grade A"
 *         Density:
 *           type: number
 *           format: float
 *           example: 8.96
 *           minimum: 0.1
 *           maximum: 25
 *         Unit:
 *           type: string
 *           enum: [Kg, Gram, Ton]
 *           example: "Kg"
 *         Standard:
 *           type: string
 *           example: "ASTM B152"
 *         Grade:
 *           type: string
 *           example: "C11000"
 *         Color:
 *           type: string
 *           example: "Reddish"
 *         EffectiveRate:
 *           type: number
 *           format: float
 *           example: 850.50
 *           minimum: 0
 * 
 *     MaterialUpdate:
 *       type: object
 *       properties:
 *         MaterialCode:
 *           type: string
 *           example: "CU-002"
 *         MaterialName:
 *           type: string
 *           example: "Copper - Pure"
 *         Description:
 *           type: string
 *           example: "Updated description"
 *         Density:
 *           type: number
 *           format: float
 *           example: 8.94
 *         Unit:
 *           type: string
 *           enum: [Kg, Gram, Ton]
 *           example: "Kg"
 *         Standard:
 *           type: string
 *           example: "ASTM B152-13"
 *         Grade:
 *           type: string
 *           example: "C11000"
 *         Color:
 *           type: string
 *           example: "Red"
 *         EffectiveRate:
 *           type: number
 *           format: float
 *           example: 875.00
 *         IsActive:
 *           type: boolean
 *           example: false
 * 
 *     MaterialDropdown:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         material_id:
 *           type: string
 *           example: "MAT-001"
 *         MaterialCode:
 *           type: string
 *           example: "CU-001"
 *         MaterialName:
 *           type: string
 *           example: "Copper"
 *         Density:
 *           type: number
 *           example: 8.96
 *         Unit:
 *           type: string
 *           example: "Kg"
 *         EffectiveRate:
 *           type: number
 *           example: 850.50
 * 
 *   responses:
 *     MaterialNotFound:
 *       description: Material not found
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
 *                 example: "Material not found"
 * 
 *     DuplicateMaterial:
 *       description: Material with this code already exists
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
 *                 example: "MaterialCode already exists"
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
 *                 example: "Material name is required, Density must be at least 0.1"
 * 
 *     MaterialInUse:
 *       description: Cannot delete material because it's used in items
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
 *                 example: "Cannot delete material. It is used in 5 active item(s)."
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
 *   name: Materials
 *   description: Raw material management
 */

/**
 * @swagger
 * /api/materials:
 *   get:
 *     summary: Get all materials with pagination and filtering
 *     tags: [Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in MaterialCode, MaterialName, material_id, Description
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Materials retrieved successfully
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
 *                     $ref: '#/components/schemas/Material'
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
 */
router.get('/', protect, getMaterials);

/**
 * @swagger
 * /api/materials/dropdown:
 *   get:
 *     summary: Get active materials for dropdown
 *     tags: [Materials]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Materials retrieved successfully
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
 *                     $ref: '#/components/schemas/MaterialDropdown'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/dropdown', protect, getMaterialsDropdown);

/**
 * @swagger
 * /api/materials/{id}:
 *   get:
 *     summary: Get single material by ID
 *     tags: [Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Material ID
 *     responses:
 *       200:
 *         description: Material retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Material'
 *       404:
 *         $ref: '#/components/responses/MaterialNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/:id', protect, getMaterial);

/**
 * @swagger
 * /api/materials:
 *   post:
 *     summary: Create a new material
 *     tags: [Materials]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MaterialCreate'
 *     responses:
 *       201:
 *         description: Material created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Material'
 *                 message:
 *                   type: string
 *                   example: "Material created successfully"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/DuplicateMaterial'
 *               - $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/', protect, createMaterial);

/**
 * @swagger
 * /api/materials/{id}:
 *   put:
 *     summary: Update an existing material
 *     tags: [Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Material ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MaterialUpdate'
 *     responses:
 *       200:
 *         description: Material updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Material'
 *                 message:
 *                   type: string
 *                   example: "Material updated successfully"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/DuplicateMaterial'
 *               - $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/MaterialNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.put('/:id', protect, updateMaterial);

/**
 * @swagger
 * /api/materials/{id}:
 *   delete:
 *     summary: Deactivate a material (SOFT DELETE)
 *     tags: [Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Material ID
 *     responses:
 *       200:
 *         description: Material deactivated successfully
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
 *                   example: "Material deactivated successfully"
 *       400:
 *         $ref: '#/components/responses/MaterialInUse'
 *       404:
 *         $ref: '#/components/responses/MaterialNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.delete('/:id', protect, deleteMaterial);

module.exports = router;