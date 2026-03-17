const express = require('express');
const router = express.Router();
const {
  getItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  getItemsDropdown
} = require('../controllers/itemController');
const { protect } = require('../../middleware/authMiddleware');

// All routes are protected
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Items
 *   description: Item/Part master management with support for multiple templates
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Item:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         item_id:
 *           type: string
 *           example: "ITEM-1234567890"
 *         part_no:
 *           type: string
 *           example: "BR-001"
 *         part_description:
 *           type: string
 *           example: "Copper Busbar 10x50x100"
 *         drawing_no:
 *           type: string
 *           example: "DRG-2024-001"
 *         revision_no:
 *           type: string
 *           example: "A"
 *         rm_grade:
 *           type: string
 *           example: "C11000"
 *         density:
 *           type: number
 *           example: 8.96
 *         unit:
 *           type: string
 *           enum: [Nos, Kg, Meter, Set, Piece]
 *           example: "Nos"
 *         hsn_code:
 *           type: string
 *           example: "740710"
 *         
 *         # New fields for Template 2
 *         item_no:
 *           type: string
 *           example: "CB71945"
 *         material:
 *           type: string
 *           example: "Copper"
 *         rm_source:
 *           type: string
 *           example: "New India CT"
 *         rm_type:
 *           type: string
 *           example: "Strip"
 *         rm_spec:
 *           type: string
 *           example: "Copper"
 *         strip_size:
 *           type: number
 *           example: 3660
 *         pitch:
 *           type: number
 *           example: 42
 *         no_of_cavity:
 *           type: number
 *           example: 1
 *         rm_rejection_percent:
 *           type: number
 *           example: 2.0
 *         scrap_realisation_percent:
 *           type: number
 *           example: 98
 *         
 *         is_active:
 *           type: boolean
 *           example: true
 *         created_by:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             username:
 *               type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *
 *     ItemCreate:
 *       type: object
 *       required:
 *         - part_no
 *         - part_description
 *         - rm_grade
 *         - density
 *         - unit
 *         - hsn_code
 *       properties:
 *         part_no:
 *           type: string
 *           example: "BR-001"
 *         part_description:
 *           type: string
 *           example: "Copper Busbar 10x50x100"
 *         drawing_no:
 *           type: string
 *           example: "DRG-2024-001"
 *         revision_no:
 *           type: string
 *           example: "A"
 *         rm_grade:
 *           type: string
 *           example: "C11000"
 *         density:
 *           type: number
 *           example: 8.96
 *         unit:
 *           type: string
 *           enum: [Nos, Kg, Meter, Set, Piece]
 *           example: "Nos"
 *         hsn_code:
 *           type: string
 *           example: "740710"
 *         
 *         # Optional Template 2 fields
 *         item_no:
 *           type: string
 *           example: "CB71945"
 *         material:
 *           type: string
 *           example: "Copper"
 *         rm_source:
 *           type: string
 *           example: "New India CT"
 *         rm_type:
 *           type: string
 *           example: "Strip"
 *         rm_spec:
 *           type: string
 *           example: "Copper"
 *         strip_size:
 *           type: number
 *           example: 3660
 *         pitch:
 *           type: number
 *           example: 42
 *         no_of_cavity:
 *           type: number
 *           example: 1
 *         rm_rejection_percent:
 *           type: number
 *           example: 2.0
 *         scrap_realisation_percent:
 *           type: number
 *           example: 98
 *
 *     ItemUpdate:
 *       type: object
 *       properties:
 *         part_description:
 *           type: string
 *         drawing_no:
 *           type: string
 *         revision_no:
 *           type: string
 *         rm_grade:
 *           type: string
 *         density:
 *           type: number
 *         unit:
 *           type: string
 *           enum: [Nos, Kg, Meter, Set, Piece]
 *         hsn_code:
 *           type: string
 *         item_no:
 *           type: string
 *         material:
 *           type: string
 *         rm_source:
 *           type: string
 *         rm_type:
 *           type: string
 *         rm_spec:
 *           type: string
 *         strip_size:
 *           type: number
 *         pitch:
 *           type: number
 *         no_of_cavity:
 *           type: number
 *         rm_rejection_percent:
 *           type: number
 *         scrap_realisation_percent:
 *           type: number
 *         is_active:
 *           type: boolean
 *
 *     ItemDropdown:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         item_id:
 *           type: string
 *         part_no:
 *           type: string
 *         part_description:
 *           type: string
 *         item_no:
 *           type: string
 *         material:
 *           type: string
 *         rm_grade:
 *           type: string
 *         density:
 *           type: number
 *         unit:
 *           type: string
 *
 *   responses:
 *     ItemNotFound:
 *       description: Item not found
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
 *     DuplicateItem:
 *       description: Item with this part number already exists
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
 *                 example: "Item with this part number already exists"
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/items:
 *   get:
 *     summary: Get all items with pagination and filtering
 *     tags: [Items]
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
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in part_no, description, drawing_no, rm_grade, item_no, material, rm_source, rm_type, rm_spec
 *     responses:
 *       200:
 *         description: Items retrieved successfully
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
 *                     $ref: '#/components/schemas/Item'
 *                 pagination:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', protect, getItems);

/**
 * @swagger
 * /api/items/dropdown:
 *   get:
 *     summary: Get items for dropdown
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Items retrieved successfully
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
 *                     $ref: '#/components/schemas/ItemDropdown'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/dropdown', protect, getItemsDropdown);

/**
 * @swagger
 * /api/items/{id}:
 *   get:
 *     summary: Get single item by ID
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Item ID
 *     responses:
 *       200:
 *         description: Item retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Item'
 *       404:
 *         $ref: '#/components/responses/ItemNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/:id', protect, getItem);

/**
 * @swagger
 * /api/items:
 *   post:
 *     summary: Create a new item with support for all templates
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ItemCreate'
 *     responses:
 *       201:
 *         description: Item created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Item'
 *                 message:
 *                   type: string
 *                   example: "Item created successfully"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/DuplicateItem'
 *               - $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/', protect, createItem);

/**
 * @swagger
 * /api/items/{id}:
 *   put:
 *     summary: Update an existing item
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ItemUpdate'
 *     responses:
 *       200:
 *         description: Item updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Item'
 *                 message:
 *                   type: string
 *                   example: "Item updated successfully"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/DuplicateItem'
 *               - $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/ItemNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.put('/:id', protect, updateItem);

/**
 * @swagger
 * /api/items/{id}:
 *   delete:
 *     summary: Deactivate an item (SOFT DELETE)
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Item ID
 *     responses:
 *       200:
 *         description: Item deactivated successfully
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
 *                   example: "Item deactivated successfully"
 *       404:
 *         $ref: '#/components/responses/ItemNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.delete('/:id', protect, deleteItem);

module.exports = router;