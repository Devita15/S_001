const express = require('express');
const router = express.Router();
const {
  createBOM,
  getBOMs,
  getBOMById,
  updateBOM,
  setDefaultBOM,
  explodeBOM,
  whereUsed,
  validateBOM,
  copyBOM,
  approveBOM
} = require('../../controllers/BOM/bomController');
const { protect, authorize } = require('../../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: BOM
 *   description: Bill of Materials management - Phase 04
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     BomComponent:
 *       type: object
 *       required:
 *         - level
 *         - component_item_id
 *         - component_part_no
 *         - component_desc
 *         - quantity_per
 *         - unit
 *       properties:
 *         level:
 *           type: integer
 *           example: 1
 *           description: BOM explosion level
 *         component_item_id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7c5"
 *         component_part_no:
 *           type: string
 *           example: "STRIP-CU-100X1.5"
 *         component_desc:
 *           type: string
 *           example: "Copper Strip C11000 100mm x 1.5mm"
 *         quantity_per:
 *           type: number
 *           example: 1.05
 *         unit:
 *           type: string
 *           enum: [Nos, Kg, Meter, Sheet, Roll]
 *           example: "Kg"
 *         scrap_percent:
 *           type: number
 *           example: 5
 *           default: 0
 *         is_phantom:
 *           type: boolean
 *           default: false
 *         is_subcontract:
 *           type: boolean
 *           default: false
 *         subcontract_vendor:
 *           type: string
 *         reference_designator:
 *           type: string
 *         remarks:
 *           type: string
 *
 *     BomCreateRequest:
 *       type: object
 *       required:
 *         - parent_item_id
 *         - bom_version
 *         - bom_type
 *         - batch_size
 *         - components
 *       properties:
 *         parent_item_id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         bom_version:
 *           type: string
 *           example: "v2.0"
 *         bom_type:
 *           type: string
 *           enum: [Manufacturing, Subcontract, Phantom, Variant]
 *           example: "Manufacturing"
 *         batch_size:
 *           type: integer
 *           example: 1
 *         yield_percent:
 *           type: number
 *           example: 100
 *           default: 100
 *         setup_time_min:
 *           type: number
 *           example: 30
 *         cycle_time_min:
 *           type: number
 *           example: 5.5
 *         effective_from:
 *           type: string
 *           format: date
 *           example: "2025-01-01"
 *         effective_to:
 *           type: string
 *           format: date
 *         components:
 *           type: array
 *           minItems: 1
 *           items:
 *             $ref: '#/components/schemas/BomComponent'
 *         status:
 *           type: string
 *           enum: [Draft, Active, Cancelled, Archived]
 *           default: "Draft"
 *
 *     Bom:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         bom_id:
 *           type: string
 *           example: "BOM-202503-0081"
 *         parent_item_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             part_no:
 *               type: string
 *             part_description:
 *               type: string
 *         parent_part_no:
 *           type: string
 *         bom_version:
 *           type: string
 *         is_default:
 *           type: boolean
 *         effective_from:
 *           type: string
 *           format: date
 *         effective_to:
 *           type: string
 *           format: date
 *         bom_type:
 *           type: string
 *         batch_size:
 *           type: integer
 *         yield_percent:
 *           type: number
 *         setup_time_min:
 *           type: number
 *         cycle_time_min:
 *           type: number
 *         components:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/BomComponent'
 *         approved_by:
 *           type: object
 *         approved_at:
 *           type: string
 *           format: date-time
 *         status:
 *           type: string
 *         is_active:
 *           type: boolean
 *         current_revision:
 *           type: integer
 *         revision_count:
 *           type: integer
 *         created_by:
 *           type: object
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_by:
 *           type: object
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     BomExplosionResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *           properties:
 *             bom_id:
 *               type: string
 *             parent_item:
 *               type: object
 *             requested_quantity:
 *               type: number
 *             total_components:
 *               type: integer
 *             total_quantity_by_unit:
 *               type: object
 *             explosion:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   level:
 *                     type: integer
 *                   part_no:
 *                     type: string
 *                   description:
 *                     type: string
 *                   quantity:
 *                     type: number
 *                   unit:
 *                     type: string
 *                   scrap_percent:
 *                     type: number
 *                   is_phantom:
 *                     type: boolean
 *                   is_subcontract:
 *                     type: boolean
 *             summary:
 *               type: object
 *
 *   responses:
 *     BomNotFound:
 *       description: BOM not found
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
 *                 example: "BOM not found"
 *
 *     DuplicateVersionError:
 *       description: BOM version already exists
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
 *                 example: "BOM version v2.0 already exists for this item"
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

// All routes are protected
router.use(protect);

/**
 * @swagger
 * /api/boms:
 *   get:
 *     summary: Get all BOMs with pagination and filtering
 *     tags: [BOM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: parent_item
 *         schema:
 *           type: string
 *       - in: query
 *         name: bom_type
 *         schema:
 *           type: string
 *           enum: [Manufacturing, Subcontract, Phantom, Variant]
 *       - in: query
 *         name: is_default
 *         schema:
 *           type: string
 *           enum: [true, false]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Draft, Active, Cancelled, Archived]
 *       - in: query
 *         name: bom_version
 *         schema:
 *           type: string
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           default: -created_at
 *     responses:
 *       200:
 *         description: BOMs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Bom'
 *                 pagination:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', getBOMs);

/**
 * @swagger
 * /api/boms/where-used/{componentId}:
 *   get:
 *     summary: Find all BOMs where an item is used as a component
 *     tags: [BOM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: componentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Where-used analysis retrieved successfully
 *       404:
 *         description: Component item not found
 */
router.get('/where-used/:componentId', whereUsed);

/**
 * @swagger
 * /api/boms/{id}:
 *   get:
 *     summary: Get single BOM by ID
 *     tags: [BOM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: BOM retrieved successfully
 *       404:
 *         $ref: '#/components/responses/BomNotFound'
 */
router.get('/:id', getBOMById);

/**
 * @swagger
 * /api/boms/{id}/explosion:
 *   get:
 *     summary: Multi-level BOM explosion with quantity calculation
 *     tags: [BOM]
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
 *       - in: query
 *         name: effective_date
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: BOM exploded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BomExplosionResponse'
 *       400:
 *         description: Circular reference detected
 *       404:
 *         $ref: '#/components/responses/BomNotFound'
 */
router.get('/:id/explosion', explodeBOM);

/**
 * @swagger
 * /api/boms/{id}/validate:
 *   get:
 *     summary: Validate BOM structure
 *     tags: [BOM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: BOM validation completed
 */
router.get('/:id/validate', validateBOM);

/**
 * @swagger
 * /api/boms:
 *   post:
 *     summary: Create a new BOM
 *     tags: [BOM]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BomCreateRequest'
 *     responses:
 *       201:
 *         description: BOM created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Bom'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Parent item not found
 */
router.post('/', authorize('admin', 'manager', 'production'), createBOM);

/**
 * @swagger
 * /api/boms/{id}/set-default:
 *   post:
 *     summary: Set BOM as the default version for its parent item
 *     tags: [BOM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: BOM set as default successfully
 *       400:
 *         description: BOM not approved or not active
 *       404:
 *         $ref: '#/components/responses/BomNotFound'
 */
router.post('/:id/set-default', authorize('manager'), setDefaultBOM);

/**
 * @swagger
 * /api/boms/{id}/copy:
 *   post:
 *     summary: Copy BOM to create a new version
 *     tags: [BOM]
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
 *               - new_version
 *             properties:
 *               new_version:
 *                 type: string
 *               change_description:
 *                 type: string
 *     responses:
 *       201:
 *         description: BOM copied successfully
 *       400:
 *         $ref: '#/components/responses/DuplicateVersionError'
 *       404:
 *         $ref: '#/components/responses/BomNotFound'
 */
router.post('/:id/copy', authorize('manager', 'production'), copyBOM);

/**
 * @swagger
 * /api/boms/{id}/approve:
 *   post:
 *     summary: Approve BOM for production use
 *     tags: [BOM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: BOM approved successfully
 *       400:
 *         description: BOM not in Draft status
 *       404:
 *         $ref: '#/components/responses/BomNotFound'
 */
router.post('/:id/approve', authorize('manager', 'qa'), approveBOM);

/**
 * @swagger
 * /api/boms/{id}:
 *   put:
 *     summary: Update BOM (creates new revision if components change)
 *     tags: [BOM]
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
 *             properties:
 *               bom_version:
 *                 type: string
 *               bom_type:
 *                 type: string
 *               batch_size:
 *                 type: integer
 *               yield_percent:
 *                 type: number
 *               setup_time_min:
 *                 type: number
 *               cycle_time_min:
 *                 type: number
 *               components:
 *                 type: array
 *               effective_from:
 *                 type: string
 *                 format: date
 *               effective_to:
 *                 type: string
 *                 format: date
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: BOM updated successfully
 *       400:
 *         description: Validation error or duplicate version
 *       404:
 *         $ref: '#/components/responses/BomNotFound'
 */
router.put('/:id', authorize('manager', 'production'), updateBOM);

module.exports = router;