// routes/user's & setting's/authRoutes.js
'use strict';

const express = require('express');
const router  = express.Router();

const {
  register,
  login,
  getMe,
  changePassword,
  logout,
  updateUserPermissions
} = require("../../controllers/user's & setting's/authController");

const { protect, requireSuperAdmin } = require('../../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: Login, registration, profile and password management
 */

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *
 *   schemas:
 *
 *     RoleRef:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "665abc000000000000000001"
 *         RoleName:
 *           type: string
 *           example: "HR Manager"
 *         isSuperAdmin:
 *           type: boolean
 *           example: false
 *
 *     PermissionItem:
 *       type: object
 *       description: >
 *         One resolved permission entry. source tells you where it came from.
 *       properties:
 *         _id:
 *           type: string
 *           example: "665abc000000000000000010"
 *         module:
 *           type: string
 *           example: "EMPLOYEE_MASTER"
 *         page:
 *           type: string
 *           example: "Employee Registry"
 *         action:
 *           type: string
 *           example: "VIEW"
 *           enum: [VIEW, CREATE, UPDATE, DELETE, EXPORT, IMPORT, PRINT, APPROVE, REJECT]
 *         name:
 *           type: string
 *           example: "EMPLOYEE_MASTER.Employee Registry.VIEW"
 *         source:
 *           type: string
 *           example: "role"
 *           enum: [role, direct, superadmin]
 *
 *     RegisterRequest:
 *       type: object
 *       required: [Username, Email, Password, RoleID]
 *       properties:
 *         Username:
 *           type: string
 *           minLength: 3
 *           maxLength: 50
 *           example: "john_doe"
 *         Email:
 *           type: string
 *           format: email
 *           example: "john@company.com"
 *         Password:
 *           type: string
 *           minLength: 6
 *           example: "SecurePass@123"
 *         RoleID:
 *           type: string
 *           example: "665abc000000000000000001"
 *         Status:
 *           type: string
 *           enum: [active, inactive]
 *           default: active
 *           example: "active"
 *         moduleAccess:
 *           type: object
 *           description: >
 *             Optional. Module-level toggles. If provided, only these permissions
 *             are saved on the user (overrides role defaults). Same format as role creation.
 *             If NOT provided, all role permissions are saved automatically.
 *           example:
 *             EMPLOYEE_MASTER: true
 *             DEPARTMENT_MASTER: true
 *         pageAccess:
 *           type: object
 *           description: >
 *             Required when moduleAccess is provided.
 *             Maps module → page → actions array. Same format as role creation.
 *           example:
 *             EMPLOYEE_MASTER:
 *               "Employee Registry": ["VIEW", "CREATE"]
 *             DEPARTMENT_MASTER:
 *               "Department Master": ["VIEW"]
 *
 *     LoginRequest:
 *       type: object
 *       required: [email, password]
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: "john@company.com"
 *         password:
 *           type: string
 *           minLength: 6
 *           example: "SecurePass@123"
 *
 *     ChangePasswordRequest:
 *       type: object
 *       required: [currentPassword, newPassword]
 *       properties:
 *         currentPassword:
 *           type: string
 *           example: "OldPass@123"
 *         newPassword:
 *           type: string
 *           minLength: 6
 *           example: "NewPass@456"
 *
 *     UpdatePermissionsRequest:
 *       type: object
 *       description: >
 *         Grant or revoke permissions directly on a user.
 *         Use moduleAccess + pageAccess (preferred) or raw grant IDs.
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
 *         grant:
 *           type: array
 *           description: "Fallback: raw Permission IDs to add"
 *           items:
 *             type: string
 *           example: ["665abc000000000000000010"]
 *         revoke:
 *           type: array
 *           description: "Permission IDs to remove"
 *           items:
 *             type: string
 *           example: ["665abc000000000000000011"]
 *
 *     RegisterResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "User registered successfully"
 *         data:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             Username:
 *               type: string
 *             Email:
 *               type: string
 *             RoleName:
 *               type: string
 *             isSuperAdmin:
 *               type: boolean
 *             Status:
 *               type: string
 *             permissionsCount:
 *               type: integer
 *               example: 9
 *
 *     LoginResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         token:
 *           type: string
 *           example: "eyJhbGci..."
 *         refreshToken:
 *           type: string
 *           example: "eyJhbGci..."
 *         user:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             Username:
 *               type: string
 *             Email:
 *               type: string
 *             Status:
 *               type: string
 *             LastLogin:
 *               type: string
 *               format: date-time
 *             isSuperAdmin:
 *               type: boolean
 *             role:
 *               $ref: '#/components/schemas/RoleRef'
 *             permissions:
 *               type: array
 *               description: >
 *                 Final resolved permissions saved at creation time.
 *                 Pass directly to hasSafePagePermission() on the frontend.
 *               items:
 *                 $ref: '#/components/schemas/PermissionItem'
 *             permissionsCount:
 *               type: integer
 *               example: 9
 *
 *     MeResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             Username:
 *               type: string
 *             Email:
 *               type: string
 *             Status:
 *               type: string
 *             LastLogin:
 *               type: string
 *               format: date-time
 *             isSuperAdmin:
 *               type: boolean
 *             role:
 *               $ref: '#/components/schemas/RoleRef'
 *             permissions:
 *               type: array
 *               description: >
 *                 Exact permissions saved on this user at creation time.
 *                 This is the single source of truth — no dynamic role resolution.
 *               items:
 *                 $ref: '#/components/schemas/PermissionItem'
 *             permissionsCount:
 *               type: integer
 *               example: 9
 *
 *     UpdatePermissionsResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Permissions updated"
 *         permissionsCount:
 *           type: integer
 *           example: 10
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: "Descriptive error message"
 */

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/register
// ══════════════════════════════════════════════════════════════════════════════
/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     description: |
 *       **SuperAdmin only.** Creates a new user account and assigns a role.
 *
 *       ### Permission Resolution at Creation
 *       - **If `moduleAccess` + `pageAccess` are provided** → only those permissions
 *         are saved on the user (even if the role has more). This lets you create a user
 *         with fewer permissions than the role.
 *       - **If neither is provided** → all role permissions are saved automatically.
 *
 *       The saved list is final — `getMe` and `login` return exactly these permissions
 *       with no dynamic role lookup.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *           examples:
 *             rolePermissionsOnly:
 *               summary: "Use all role permissions (no overrides)"
 *               value:
 *                 Username: "hr_manager_01"
 *                 Email: "hr.manager@company.com"
 *                 Password: "HrPass@2024"
 *                 RoleID: "665abc000000000000000001"
 *                 Status: "active"
 *             customPermissions:
 *               summary: "Custom permissions — only 2 instead of all role permissions"
 *               value:
 *                 Username: "hr_limited"
 *                 Email: "hr.limited@company.com"
 *                 Password: "HrPass@2024"
 *                 RoleID: "665abc000000000000000001"
 *                 Status: "active"
 *                 moduleAccess:
 *                   EMPLOYEE_MASTER: true
 *                 pageAccess:
 *                   EMPLOYEE_MASTER:
 *                     "Employee Registry": ["VIEW"]
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RegisterResponse'
 *       400:
 *         description: Validation error or role inactive
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Caller is not SuperAdmin
 *       404:
 *         description: Role not found
 *       409:
 *         description: Username or Email already exists
 *       500:
 *         description: Server error
 */
router.post('/register', protect, requireSuperAdmin, register);

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/login
// ══════════════════════════════════════════════════════════════════════════════
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login and receive JWT
 *     tags: [Authentication]
 *     description: |
 *       Authenticate with email + password.
 *       - Returns a short-lived JWT `token` and a `refreshToken`
 *       - Returns the user's **final resolved permissions** (saved at creation time)
 *       - Account locks for **1 hour** after 5 consecutive failed attempts
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *           example:
 *             email: "hr.manager@company.com"
 *             password: "HrPass@2024"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Missing email or password
 *       401:
 *         description: Invalid credentials / account locked / account inactive / role inactive
 *       500:
 *         description: Server error
 */
router.post('/login', login);

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/auth/me
// ══════════════════════════════════════════════════════════════════════════════
/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile + permissions
 *     tags: [Authentication]
 *     description: |
 *       Returns the authenticated user's profile and their permissions.
 *
 *       Permissions returned are **exactly what was saved at creation time** —
 *       no dynamic role resolution. Call this on app load to get a fresh copy.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MeResponse'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/me', protect, getMe);

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/auth/change-password
// ══════════════════════════════════════════════════════════════════════════════
/**
 * @swagger
 * /api/auth/change-password:
 *   put:
 *     summary: Change own password
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePasswordRequest'
 *           example:
 *             currentPassword: "OldPass@123"
 *             newPassword: "NewPass@456"
 *     responses:
 *       200:
 *         description: Password changed successfully
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
 *                   example: "Password changed successfully"
 *       400:
 *         description: Current password is incorrect or missing fields
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.put('/change-password', protect, changePassword);

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/logout
// ══════════════════════════════════════════════════════════════════════════════
/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout and invalidate refresh token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
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
 *                   example: "Logged out successfully"
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/logout', protect, logout);

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/auth/users/:id/permissions
// ══════════════════════════════════════════════════════════════════════════════
/**
 * @swagger
 * /api/auth/users/{id}/permissions:
 *   patch:
 *     summary: Grant or revoke permissions on a user
 *     tags: [Authentication]
 *     description: |
 *       **SuperAdmin only.** Add or remove permissions directly on a user's saved list.
 *
 *       ### Two ways to grant:
 *       - **Preferred** — send `moduleAccess` + `pageAccess` (same format as role creation)
 *       - **Fallback** — send raw `grant` Permission ID array
 *
 *       ### To revoke:
 *       - Send `revoke` array with Permission IDs to remove
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Target user ID
 *         example: "665abc000000000000000099"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdatePermissionsRequest'
 *           examples:
 *             grantWithMaps:
 *               summary: "Grant using moduleAccess/pageAccess (preferred)"
 *               value:
 *                 moduleAccess:
 *                   EMPLOYEE_MASTER: true
 *                 pageAccess:
 *                   EMPLOYEE_MASTER:
 *                     "Employee Registry": ["DELETE"]
 *             grantWithIds:
 *               summary: "Grant using raw Permission IDs (fallback)"
 *               value:
 *                 grant: ["665abc000000000000000010"]
 *                 revoke: []
 *             revokeOnly:
 *               summary: "Revoke permissions"
 *               value:
 *                 revoke: ["665abc000000000000000011"]
 *     responses:
 *       200:
 *         description: Permissions updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UpdatePermissionsResponse'
 *       400:
 *         description: One or more permission IDs are invalid
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: SuperAdmin access required
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.patch('/users/:id/permissions', protect, requireSuperAdmin, updateUserPermissions);

module.exports = router;