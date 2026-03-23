const express = require('express');
const router = express.Router({ mergeParams: true });
const {
  createRevision,
  getRevision,
  getRevisionHistory,
  compareRevisions,
  generateRevisionPDF,
  emailRevision
} = require('../../controllers/BOM/bomRevisionController');
const { protect, authorize } = require('../../middleware/authMiddleware');

// All routes are protected
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: BOM Revisions
 *   description: BOM revision history and version control
 */

/**
 * @swagger
 * /api/boms/{id}/revisions:
 *   get:
 *     summary: Get revision history for a BOM
 *     tags: [BOM Revisions]
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
 *         description: Revision history retrieved successfully
 */
router.get('/', getRevisionHistory);

/**
 * @swagger
 * /api/boms/{id}/revisions/revise:
 *   post:
 *     summary: Create a new revision snapshot of the current BOM state
 *     tags: [BOM Revisions]
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
 *               change_description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Revision created successfully
 */
router.post('/revise', authorize('manager', 'production'), createRevision);

/**
 * @swagger
 * /api/boms/{id}/revisions/{rev}:
 *   get:
 *     summary: Get a specific revision snapshot
 *     tags: [BOM Revisions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: rev
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Revision retrieved successfully
 *       404:
 *         description: Revision not found
 */
router.get('/:rev', getRevision);

/**
 * @swagger
 * /api/boms/{id}/revisions/compare/{rev1}/{rev2}:
 *   get:
 *     summary: Compare two revisions and show differences
 *     tags: [BOM Revisions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: rev1
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: rev2
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Revision comparison completed
 */
router.get('/compare/:rev1/:rev2', authorize('manager', 'production'), compareRevisions);

/**
 * @swagger
 * /api/boms/{id}/revisions/{rev}/pdf:
 *   post:
 *     summary: Generate PDF for a specific revision
 *     tags: [BOM Revisions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: rev
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: PDF generated successfully
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
router.post('/:rev/pdf', authorize('manager', 'production'), generateRevisionPDF);

/**
 * @swagger
 * /api/boms/{id}/revisions/{rev}/send:
 *   post:
 *     summary: Email BOM revision PDF to recipients
 *     tags: [BOM Revisions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: rev
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *               cc:
 *                 type: string
 *               bcc:
 *                 type: string
 *               subject:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email sent successfully
 */
router.post('/:rev/send', authorize('manager', 'production'), emailRevision);

module.exports = router;