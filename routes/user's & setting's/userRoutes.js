const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
} = require("../../controllers/user's & setting's/userController");
const { protect, authorize } = require('../../middleware/authMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     RoleResponse:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         RoleName:
 *           type: string
 *           example: "SuperAdmin"
 *         Description:
 *           type: string
 *           example: "Full system access"
 *         Permissions:
 *           type: array
 *           items:
 *             type: string
 *           example: ["manage_users", "manage_roles", "view_reports"]
 * 
 *     EmployeeResponse:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b9"
 *         FirstName:
 *           type: string
 *           example: "John"
 *         LastName:
 *           type: string
 *           example: "Doe"
 *         Email:
 *           type: string
 *           example: "john.doe@company.com"
 *         EmployeeID:
 *           type: string
 *           example: "EMP001"
 *         DepartmentID:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             DepartmentName:
 *               type: string
 *         DesignationID:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             DesignationName:
 *               type: string
 *             Level:
 *               type: number
 * 
 *     UserResponse:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7c0"
 *         Username:
 *           type: string
 *           example: "john_doe"
 *         Email:
 *           type: string
 *           example: "john@example.com"
 *         RoleID:
 *           $ref: '#/components/schemas/RoleResponse'
 *         EmployeeID:
 *           $ref: '#/components/schemas/EmployeeResponse'
 *         Status:
 *           type: string
 *           enum: [active, inactive, blocked]
 *           example: "active"
 *         LastLogin:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:30:00.000Z"
 *         LoginAttempts:
 *           type: number
 *           example: 0
 *         LockUntil:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         CreatedAt:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:30:00.000Z"
 *         UpdatedAt:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:30:00.000Z"
 * 
 *     UserUpdateRequest:
 *       type: object
 *       properties:
 *         Username:
 *           type: string
 *           example: "john_doe_updated"
 *           minLength: 3
 *           maxLength: 50
 *         Email:
 *           type: string
 *           format: email
 *           example: "john.updated@example.com"
 *         RoleID:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         EmployeeID:
 *           type: string
 *           nullable: true
 *           example: "64f8e9b7a1b2c3d4e5f6a7b9"
 *           description: "Set to null or empty string to remove employee link"
 *         Status:
 *           type: string
 *           enum: [active, inactive, blocked]
 *         LoginAttempts:
 *           type: number
 *           example: 0
 *         LockUntil:
 *           type: string
 *           format: date-time
 *           nullable: true
 * 
 *     PaginationInfo:
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
 *           example: 45
 *         itemsPerPage:
 *           type: integer
 *           example: 10
 *         hasNextPage:
 *           type: boolean
 *           example: true
 *         hasPrevPage:
 *           type: boolean
 *           example: false
 * 
 *     UsersListResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             users:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserResponse'
 *             pagination:
 *               $ref: '#/components/schemas/PaginationInfo'
 *         message:
 *           type: string
 *           example: "Users retrieved successfully"
 * 
 *     BulkUpdateRequest:
 *       type: object
 *       required:
 *         - userIds
 *         - status
 *       properties:
 *         userIds:
 *           type: array
 *           items:
 *             type: string
 *           example: ["64f8e9b7a1b2c3d4e5f6a7c0", "64f8e9b7a1b2c3d4e5f6a7c1"]
 *         status:
 *           type: string
 *           enum: [active, inactive, blocked]
 *           example: "active"
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
 *   name: User Management
 *   description: User management and administration endpoints
 */

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users with filtering and pagination
 *     tags: [User Management]
 *     description: Retrieve paginated list of users with optional filtering (Admin/SuperAdmin only)
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
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by username or email
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, blocked]
 *         description: Filter by user status
 *       - in: query
 *         name: roleId
 *         schema:
 *           type: string
 *         description: Filter by role ID
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: CreatedAt
 *           enum: [CreatedAt, UpdatedAt, Username, Email, Status, LastLogin]
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           default: desc
 *           enum: [asc, desc]
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UsersListResponse'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Not authorized, no token"
 *       403:
 *         description: Not authorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Not authorized to access this route"
 *       500:
 *         description: Server error
 */
router.get('/', getAllUsers);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [User Management]
 *     description: Retrieve detailed user information by ID (Admin/SuperAdmin only)
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
 *         description: User retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/UserResponse'
 *                 message:
 *                   type: string
 *                   example: "User retrieved successfully"
 *       400:
 *         description: Invalid user ID format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid user ID format"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "User not found"
 *       500:
 *         description: Server error
 */
router.get('/:id', getUserById);

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user details
 *     tags: [User Management]
 *     description: Update user information (Admin/SuperAdmin only)
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
 *                 data:
 *                   $ref: '#/components/schemas/UserResponse'
 *                 message:
 *                   type: string
 *                   example: "User updated successfully"
 *       400:
 *         description: Bad request - validation error or username/email taken
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Username or Email is already taken"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: User, Role, or Employee not found
 *       500:
 *         description: Server error
 */
router.put('/:id', updateUser);

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Soft delete user
 *     tags: [User Management]
 *     description: Soft delete user by setting status to inactive (Admin/SuperAdmin only)
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
 *         description: User deleted successfully
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
 *                   example: "User deleted successfully"
 *       400:
 *         description: Invalid user ID format
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized or cannot delete SuperAdmin
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Cannot delete SuperAdmin users"
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', deleteUser);

module.exports = router;