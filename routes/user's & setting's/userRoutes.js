// routes/user's & setting's/userRoutes.js
'use strict';

const express = require('express');
const router  = express.Router();

const {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  grantPermissions,
  revokePermissions,
  getUserPermissions
} = require("../../controllers/user's & setting's/userController");

const { protect, can, requireSuperAdmin } = require('../../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management — list, detail, update, delete, permission management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *
 *     UserListItem:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         Username:
 *           type: string
 *           example: "hr_manager_01"
 *         Email:
 *           type: string
 *           example: "hr@company.com"
 *         Status:
 *           type: string
 *           enum: [active, inactive, blocked]
 *           example: "active"
 *         LastLogin:
 *           type: string
 *           format: date-time
 *         LoginAttempts:
 *           type: integer
 *           example: 0
 *         LockUntil:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         CreatedAt:
 *           type: string
 *           format: date-time
 *         UpdatedAt:
 *           type: string
 *           format: date-time
 *         RoleID:
 *           $ref: '#/components/schemas/RoleRef'
 *
 *     UserDetail:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         Username:
 *           type: string
 *         Email:
 *           type: string
 *         Status:
 *           type: string
 *           enum: [active, inactive, blocked]
 *         LastLogin:
 *           type: string
 *           format: date-time
 *         CreatedAt:
 *           type: string
 *           format: date-time
 *         UpdatedAt:
 *           type: string
 *           format: date-time
 *         isSuperAdmin:
 *           type: boolean
 *           example: false
 *         role:
 *           $ref: '#/components/schemas/RoleRef'
 *         permissions:
 *           type: array
 *           description: >
 *             Final resolved permissions saved at creation time.
 *             Includes source field — role | direct.
 *           items:
 *             $ref: '#/components/schemas/PermissionItem'
 *         permissionsCount:
 *           type: integer
 *           example: 9
 *
 *     UserUpdateRequest:
 *       type: object
 *       description: All fields optional — send only what you want to change
 *       properties:
 *         Username:
 *           type: string
 *           minLength: 3
 *           maxLength: 50
 *           example: "hr_manager_01_updated"
 *         Email:
 *           type: string
 *           format: email
 *           example: "hr.updated@company.com"
 *         RoleID:
 *           type: string
 *           example: "665abc000000000000000001"
 *         Status:
 *           type: string
 *           enum: [active, inactive, blocked]
 *           example: "inactive"
 *
 *     GrantRequest:
 *       type: object
 *       description: >
 *         Grant permissions to a user. Use moduleAccess/pageAccess (preferred)
 *         or raw permission IDs (fallback).
 *       properties:
 *         moduleAccess:
 *           type: object
 *           description: "Preferred: same format as role creation"
 *           example:
 *             EMPLOYEE_MASTER: true
 *         pageAccess:
 *           type: object
 *           description: "Required when moduleAccess is provided"
 *           example:
 *             EMPLOYEE_MASTER:
 *               "Employee Registry": ["DELETE"]
 *         permissions:
 *           type: array
 *           description: "Fallback: raw Permission document IDs"
 *           items:
 *             type: string
 *           example: ["665abc000000000000000010"]
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: "Optional expiry. Null = permanent."
 *           example: "2025-12-31T23:59:59.000Z"
 *
 *     RevokeRequest:
 *       type: object
 *       required: [permissions]
 *       properties:
 *         permissions:
 *           type: array
 *           description: Permission document IDs to remove
 *           items:
 *             type: string
 *           example: ["665abc000000000000000010"]
 *
 *     GrantRevokeResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "2 permission(s) granted"
 *         permissionsCount:
 *           type: integer
 *           example: 11
 *
 *     Pagination:
 *       type: object
 *       properties:
 *         currentPage:
 *           type: integer
 *           example: 1
 *         totalPages:
 *           type: integer
 *           example: 5
 *         totalItems:
 *           type: integer
 *           example: 48
 *         itemsPerPage:
 *           type: integer
 *           example: 10
 */

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/users
// ══════════════════════════════════════════════════════════════════════════════
/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: List all users (paginated)
 *     tags: [Users]
 *     description: Requires **USERS → Users → VIEW** permission.
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by Username or Email
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, blocked]
 *         description: Filter by status
 *       - in: query
 *         name: roleId
 *         schema:
 *           type: string
 *         description: Filter by Role ID
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: CreatedAt
 *           enum: [CreatedAt, UpdatedAt, Username, Email, Status, LastLogin]
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           default: desc
 *           enum: [asc, desc]
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: Users list
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
 *                     $ref: '#/components/schemas/UserListItem'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing USERS → Users → VIEW permission
 *       500:
 *         description: Server error
 */
router.get('/', protect, can('USERS', 'Users', 'VIEW'), getAllUsers);

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/users/:id
// ══════════════════════════════════════════════════════════════════════════════
/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get one user with their final resolved permissions
 *     tags: [Users]
 *     description: |
 *       Returns the user record with their permissions.
 *
 *       Permissions are **exactly what was saved at creation time** — no dynamic
 *       role resolution. The `source` field on each permission tells you whether
 *       it came from `role` or `direct` override.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/UserDetail'
 *       400:
 *         description: Invalid user ID
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing USERS → Users → VIEW permission
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/:id', protect, can('USERS', 'Users', 'VIEW'), getUserById);

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/users/:id
// ══════════════════════════════════════════════════════════════════════════════
/**
 * @swagger
 * /api/users/{id}:
 *   patch:
 *     summary: Update user (username / email / role / status)
 *     tags: [Users]
 *     description: |
 *       All body fields are optional — send only what you want to change.
 *
 *       **Note:** Changing `RoleID` does NOT automatically update the user's saved
 *       permissions. Use the grant/revoke endpoints to update permissions separately.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserUpdateRequest'
 *           example:
 *             Status: "inactive"
 *     responses:
 *       200:
 *         description: User updated successfully
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
 *                   example: "User updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/UserListItem'
 *       400:
 *         description: Validation error or role inactive
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing USERS → Users → UPDATE permission
 *       404:
 *         description: User not found
 *       409:
 *         description: Username or Email already taken
 *       500:
 *         description: Server error
 */
router.patch('/:id', protect, can('USERS', 'Users', 'UPDATE'), updateUser);

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/users/:id
// ══════════════════════════════════════════════════════════════════════════════
/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Soft-delete user (sets Status to inactive)
 *     tags: [Users]
 *     description: |
 *       Sets the user's status to `inactive`. Cannot delete your own account
 *       or any user with a SuperAdmin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deactivated successfully
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
 *                   example: "User deactivated successfully"
 *       400:
 *         description: Cannot delete your own account
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing USERS → Users → DELETE permission or target is SuperAdmin
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', protect, can('USERS', 'Users', 'DELETE'), deleteUser);

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/users/:id/permissions
// ══════════════════════════════════════════════════════════════════════════════
/**
 * @swagger
 * /api/users/{id}/permissions:
 *   get:
 *     summary: Get a user's full resolved permissions
 *     tags: [Users]
 *     description: |
 *       Returns the user's saved permission list with source tagging.
 *       This is the same list returned by `getMe` and `login`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User permissions
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
 *                   properties:
 *                     userId:
 *                       type: string
 *                     Username:
 *                       type: string
 *                     RoleName:
 *                       type: string
 *                     isSuperAdmin:
 *                       type: boolean
 *                     permissions:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PermissionItem'
 *                     total:
 *                       type: integer
 *                       example: 9
 *       400:
 *         description: Invalid user ID
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing USERS → Users → VIEW permission
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/:id/permissions', protect, can('USERS', 'Users', 'VIEW'), getUserPermissions);

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/users/:id/permissions/grant
// ══════════════════════════════════════════════════════════════════════════════
/**
 * @swagger
 * /api/users/{id}/permissions/grant:
 *   post:
 *     summary: Grant permissions to a user
 *     tags: [Users]
 *     description: |
 *       **SuperAdmin only.** Adds permissions to the user's saved list.
 *
 *       ### Two ways to grant:
 *       - **Preferred** — send `moduleAccess` + `pageAccess` (same format as role creation)
 *       - **Fallback** — send raw `permissions` ID array
 *
 *       Pass `expiresAt` to make the grant temporary.
 *       Duplicate permissions are silently skipped.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GrantRequest'
 *           examples:
 *             grantWithMaps:
 *               summary: "Grant using moduleAccess/pageAccess (preferred)"
 *               value:
 *                 moduleAccess:
 *                   EMPLOYEE_MASTER: true
 *                 pageAccess:
 *                   EMPLOYEE_MASTER:
 *                     "Employee Registry": ["DELETE", "EXPORT"]
 *             grantWithIds:
 *               summary: "Grant using raw Permission IDs (fallback)"
 *               value:
 *                 permissions: ["665abc000000000000000010", "665abc000000000000000011"]
 *                 expiresAt: null
 *             grantTemporary:
 *               summary: "Temporary grant with expiry"
 *               value:
 *                 permissions: ["665abc000000000000000010"]
 *                 expiresAt: "2025-12-31T23:59:59.000Z"
 *     responses:
 *       200:
 *         description: Permissions granted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GrantRevokeResponse'
 *       400:
 *         description: Invalid permission IDs or empty request
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: SuperAdmin access required
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.post('/:id/permissions/grant', protect, requireSuperAdmin, grantPermissions);

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/users/:id/permissions/revoke
// ══════════════════════════════════════════════════════════════════════════════
/**
 * @swagger
 * /api/users/{id}/permissions/revoke:
 *   post:
 *     summary: Revoke permissions from a user
 *     tags: [Users]
 *     description: |
 *       **SuperAdmin only.** Removes permissions from the user's saved list by Permission ID.
 *       Both `role` and `direct` sourced permissions can be revoked.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RevokeRequest'
 *           example:
 *             permissions: ["665abc000000000000000010"]
 *     responses:
 *       200:
 *         description: Permissions revoked successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GrantRevokeResponse'
 *       400:
 *         description: permissions array is required
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: SuperAdmin access required
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.post('/:id/permissions/revoke', protect, requireSuperAdmin, revokePermissions);

module.exports = router;