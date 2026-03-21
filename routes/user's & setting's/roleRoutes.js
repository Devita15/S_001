// routes/user's & setting's/roleRoutes.js
'use strict';

const express = require('express');
const router = express.Router();

const {
  getAllRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  getAllPermissions,
  getSidebarStructure
} = require("../../controllers/user's & setting's/roleController");

const { protect, can, requireSuperAdmin } = require('../../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Roles
 *   description: Role management and permission catalog
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     RoleCreateRequest:
 *       type: object
 *       required: [RoleName]
 *       properties:
 *         RoleName:
 *           type: string
 *           example: "HR Manager"
 *         Description:
 *           type: string
 *           example: "Manages all HR related operations"
 *         isSuperAdmin:
 *           type: boolean
 *           default: false
 *           example: false
 *         moduleAccess:
 *           type: object
 *           description: Keys = frontend MODULES constants. true = module enabled.
 *           example:
 *             EMPLOYEE_MASTER: true
 *             DEPARTMENT_MASTER: true
 *         pageAccess:
 *           type: object
 *           description: Keys = module key → page name → array of actions.
 *           example:
 *             EMPLOYEE_MASTER:
 *               "Employee Registry": ["VIEW", "CREATE", "UPDATE"]
 *             DEPARTMENT_MASTER:
 *               "Department Master": ["VIEW", "CREATE", "UPDATE"]
 *
 *     RoleUpdateRequest:
 *       type: object
 *       properties:
 *         RoleName:
 *           type: string
 *           example: "Senior HR Manager"
 *         Description:
 *           type: string
 *         IsActive:
 *           type: boolean
 *         isSuperAdmin:
 *           type: boolean
 *         moduleAccess:
 *           type: object
 *         pageAccess:
 *           type: object
 *
 *     RoleResponse:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         RoleName:
 *           type: string
 *         Description:
 *           type: string
 *         isSuperAdmin:
 *           type: boolean
 *         IsActive:
 *           type: boolean
 *         moduleAccess:
 *           type: object
 *         pageAccess:
 *           type: object
 *         permissionsCount:
 *           type: integer
 *         CreatedAt:
 *           type: string
 *           format: date-time
 *         UpdatedAt:
 *           type: string
 *           format: date-time
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 */

// ══════════════════════════════════════════════════════════════════════════════
// STATIC ROUTES (MUST COME FIRST!)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/roles/sidebar-structure:
 *   get:
 *     summary: Get module/page structure for the role-builder UI
 *     tags: [Roles]
 *     description: Returns the full catalog of modules, pages and available actions. SuperAdmin only.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sidebar structure
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
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: SuperAdmin access required
 */
router.get('/sidebar-structure', protect, requireSuperAdmin, getSidebarStructure);

/**
 * @swagger
 * /api/roles/permissions:
 *   get:
 *     summary: Get all Permission documents (flat + grouped)
 *     tags: [Roles]
 *     description: Returns every active Permission document in flat array and grouped format. SuperAdmin only.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All permissions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 total:
 *                   type: integer
 *                 flat:
 *                   type: array
 *                 grouped:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: SuperAdmin access required
 */
router.get('/permissions', protect, requireSuperAdmin, getAllPermissions);

/**
 * @swagger
 * /api/roles:
 *   get:
 *     summary: List all roles
 *     tags: [Roles]
 *     description: Requires ROLES → Roles → VIEW permission.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Filter by RoleName
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Roles list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 total:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/RoleResponse'
 */
router.get('/', protect, can('ROLES', 'Roles', 'VIEW'), getAllRoles);

/**
 * @swagger
 * /api/roles:
 *   post:
 *     summary: Create a new role
 *     tags: [Roles]
 *     description: Creates the role and automatically resolves permissions from moduleAccess + pageAccess.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RoleCreateRequest'
 *     responses:
 *       201:
 *         description: Role created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/RoleResponse'
 *       400:
 *         description: RoleName is required
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing ROLES.CREATE permission
 *       409:
 *         description: Role name already exists
 */
router.post('/', protect, can('ROLES', 'Roles', 'CREATE'), createRole);

// ══════════════════════════════════════════════════════════════════════════════
// DYNAMIC/PARAMETERIZED ROUTES (MUST COME AFTER STATIC ROUTES!)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/roles/{id}:
 *   get:
 *     summary: Get one role by ID
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role ID
 *     responses:
 *       200:
 *         description: Role detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/RoleResponse'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing ROLES.VIEW permission
 *       404:
 *         description: Role not found
 */
router.get('/:id', protect, can('ROLES', 'Roles', 'VIEW'), getRole);

/**
 * @swagger
 * /api/roles/{id}:
 *   patch:
 *     summary: Update a role (partial)
 *     tags: [Roles]
 *     description: Send only what you want to change. If moduleAccess or pageAccess is included, permissions are automatically regenerated.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RoleUpdateRequest'
 *     responses:
 *       200:
 *         description: Role updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/RoleResponse'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing ROLES.UPDATE permission
 *       404:
 *         description: Role not found
 *       409:
 *         description: Role name already taken
 */
router.patch('/:id', protect, can('ROLES', 'Roles', 'UPDATE'), updateRole);

/**
 * @swagger
 * /api/roles/{id}:
 *   delete:
 *     summary: Delete a role
 *     tags: [Roles]
 *     description: Fails if role is SuperAdmin or has active users.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role ID
 *     responses:
 *       200:
 *         description: Role deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Cannot delete - active users or SuperAdmin role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing ROLES.DELETE permission
 *       404:
 *         description: Role not found
 */
router.delete('/:id', protect, can('ROLES', 'Roles', 'DELETE'), deleteRole);

module.exports = router;