const express = require('express');
const router = express.Router();
const {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplatesDropdown
} = require('../../controllers/CRM/templateController');
const { protect } = require('../../middleware/authMiddleware');

// All routes are protected
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Templates
 *   description: Excel template management for costing
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     TemplateProcessMapping:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         mapping_id:
 *           type: string
 *         process_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             process_name:
 *               type: string
 *             category:
 *               type: string
 *             rate_type:
 *               type: string
 *         excel_column_name:
 *           type: string
 *         column_order:
 *           type: number
 *         is_visible:
 *           type: boolean
 *
 *     Template:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         template_id:
 *           type: string
 *           example: "TMP-1234567890"
 *         template_name:
 *           type: string
 *           example: "Busbar Costing Template"
 *         description:
 *           type: string
 *           example: "Standard template for busbar costing"
 *         file_path:
 *           type: string
 *           example: "/uploads/templates/busbar_template.xlsx"
 *         is_active:
 *           type: boolean
 *           example: true
 *         process_mappings:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/TemplateProcessMapping'
 *         created_by:
 *           type: object
 *         createdAt:
 *           type: string
 *           format: date-time
 *
 *     TemplateCreate:
 *       type: object
 *       required:
 *         - template_name
 *       properties:
 *         template_name:
 *           type: string
 *           example: "Busbar Costing Template"
 *         description:
 *           type: string
 *         file_path:
 *           type: string
 *         process_mappings:
 *           type: array
 *           items:
 *             type: object
 *             required:
 *               - process_id
 *               - excel_column_name
 *               - column_order
 *             properties:
 *               process_id:
 *                 type: string
 *               excel_column_name:
 *                 type: string
 *               column_order:
 *                 type: number
 *               is_visible:
 *                 type: boolean
 *
 *     TemplateDropdown:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         template_id:
 *           type: string
 *         template_name:
 *           type: string
 *
 *   responses:
 *     TemplateNotFound:
 *       description: Template not found
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
 *                 example: "Template not found"
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/templates:
 *   get:
 *     summary: Get all templates
 *     tags: [Templates]
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
 *           default: 10
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
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
 *                     $ref: '#/components/schemas/Template'
 *                 pagination:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', protect, getTemplates);

/**
 * @swagger
 * /api/templates/dropdown:
 *   get:
 *     summary: Get templates for dropdown
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
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
 *                     $ref: '#/components/schemas/TemplateDropdown'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/dropdown', protect, getTemplatesDropdown);

/**
 * @swagger
 * /api/templates/{id}:
 *   get:
 *     summary: Get template by ID with process mappings
 *     tags: [Templates]
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
 *         description: Template retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Template'
 *       404:
 *         $ref: '#/components/responses/TemplateNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/:id', protect, getTemplate);

/**
 * @swagger
 * /api/templates:
 *   post:
 *     summary: Create a new template
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TemplateCreate'
 *     responses:
 *       201:
 *         description: Template created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Template'
 *                 message:
 *                   type: string
 *                   example: "Template created successfully"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/DuplicateTemplate'
 *               - $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/', protect, createTemplate);

/**
 * @swagger
 * /api/templates/{id}:
 *   put:
 *     summary: Update a template
 *     tags: [Templates]
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
 *               template_name:
 *                 type: string
 *               description:
 *                 type: string
 *               file_path:
 *                 type: string
 *               process_mappings:
 *                 type: array
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Template updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Template'
 *                 message:
 *                   type: string
 *                   example: "Template updated successfully"
 *       404:
 *         $ref: '#/components/responses/TemplateNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.put('/:id', protect, updateTemplate);

/**
 * @swagger
 * /api/templates/{id}:
 *   delete:
 *     summary: Delete a template (SOFT DELETE)
 *     tags: [Templates]
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
 *         description: Template deleted successfully
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
 *                   example: "Template deactivated successfully"
 *       404:
 *         $ref: '#/components/responses/TemplateNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.delete('/:id', protect, deleteTemplate);

module.exports = router;