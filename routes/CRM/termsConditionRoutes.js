const express = require('express');
const router = express.Router();
const {
  getTermsConditions,
  getTermsCondition,
  createTermsCondition,
  updateTermsCondition,
  deleteTermsCondition
} = require('../controllers/termsConditionController');

/**
 * @swagger
 * tags:
 *   name: Terms & Conditions
 *   description: Terms and conditions management API
 */

/**
 * @swagger
 * /api/terms-conditions:
 *   get:
 *     summary: Get all terms and conditions
 *     tags: [Terms & Conditions]
 *     description: Retrieve all terms and conditions sorted by sequence
 *     responses:
 *       200:
 *         description: List of terms and conditions retrieved successfully
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
 *                     $ref: '#/components/schemas/TermsCondition'
 *       500:
 *         description: Server error
 */
router.get('/', getTermsConditions);

/**
 * @swagger
 * /api/terms-conditions/{id}:
 *   get:
 *     summary: Get a specific term and condition by ID
 *     tags: [Terms & Conditions]
 *     description: Retrieve detailed information about a specific term and condition
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Terms & Condition ID
 *         example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *     responses:
 *       200:
 *         description: Term and condition details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/TermsCondition'
 *       404:
 *         description: Term and condition not found
 *       500:
 *         description: Server error
 */
router.get('/:id', getTermsCondition);

/**
 * @swagger
 * /api/terms-conditions:
 *   post:
 *     summary: Create a new term and condition
 *     tags: [Terms & Conditions]
 *     description: Create a new term and condition entry
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - Title
 *               - Description
 *               - Sequence
 *             properties:
 *               Title:
 *                 type: string
 *                 example: "Payment Terms"
 *                 description: Title of the term
 *               Description:
 *                 type: string
 *                 example: "Payment must be made within 30 days of invoice date."
 *                 description: Detailed description of the term
 *               Sequence:
 *                 type: integer
 *                 example: 1
 *                 minimum: 1
 *                 description: Display order sequence
 *     responses:
 *       201:
 *         description: Term and condition created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/TermsCondition'
 *                 message:
 *                   type: string
 *                   example: "Terms & condition created successfully"
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/', createTermsCondition);

/**
 * @swagger
 * /api/terms-conditions/{id}:
 *   put:
 *     summary: Update an existing term and condition
 *     tags: [Terms & Conditions]
 *     description: Update information of a specific term and condition
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Terms & Condition ID
 *         example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               Title:
 *                 type: string
 *                 example: "Updated Payment Terms"
 *               Description:
 *                 type: string
 *                 example: "Payment must be made within 45 days of invoice date."
 *               Sequence:
 *                 type: integer
 *                 example: 2
 *                 minimum: 1
 *     responses:
 *       200:
 *         description: Term and condition updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/TermsCondition'
 *                 message:
 *                   type: string
 *                   example: "Terms & condition updated successfully"
 *       400:
 *         description: Validation error
 *       404:
 *         description: Term and condition not found
 *       500:
 *         description: Server error
 */
router.put('/:id', updateTermsCondition);

/**
 * @swagger
 * /api/terms-conditions/{id}:
 *   delete:
 *     summary: Delete a term and condition
 *     tags: [Terms & Conditions]
 *     description: Permanently delete a term and condition (hard delete)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Terms & Condition ID
 *         example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *     responses:
 *       200:
 *         description: Term and condition deleted successfully
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
 *                   example: "Terms & condition deleted successfully"
 *       404:
 *         description: Term and condition not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', deleteTermsCondition);

module.exports = router;