const express = require('express');
const router = express.Router();
const {
  getRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  getRoleStats,
  getRolesDropdown
} = require("../../controllers/user's & setting's/roleController");
const { protect } = require('../../middleware/authMiddleware');

// router.use(protect);

/**
 * @swagger
 * /api/roles:
 *   get:
 *     summary: Get all roles
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Roles retrieved
 */
router.get('/', getRoles);

/**
 * @swagger
 * /api/roles/stats:
 *   get:
 *     summary: Get role statistics
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stats retrieved
 */
router.get('/stats', getRoleStats);

/**
 * @swagger
 * /api/roles/dropdown:
 *   get:
 *     summary: Get roles dropdown
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dropdown list retrieved
 */
router.get('/dropdown', getRolesDropdown);

/**
 * @swagger
 * /api/roles/{id}:
 *   get:
 *     summary: Get single role
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Role retrieved
 */
router.get('/:id', getRole);

/**
 * @swagger
 * /api/roles:
 *   post:
 *     summary: Create role
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               RoleName:
 *                 type: string
 *                 example: "HR Manager"
 *               Description:
 *                 type: string
 *                 example: "Human Resources Manager"
 *               IsActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Role created
 */
router.post('/', createRole);

/**
 * @swagger
 * /api/roles/{id}:
 *   put:
 *     summary: Update role
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               RoleName:
 *                 type: string
 *                 example: "Senior HR Manager"
 *               Description:
 *                 type: string
 *                 example: "Updated description"
 *               IsActive:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Role updated
 */
router.put('/:id', updateRole);

/**
 * @swagger
 * /api/roles/{id}:
 *   delete:
 *     summary: Delete role
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Role deleted
 */
router.delete('/:id', deleteRole);

module.exports = router;