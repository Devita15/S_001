const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getProfile,
  changePassword,
  logout
} = require('../controllers/authController');
const { protect } = require('../../middleware/authMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     UserRegister:
 *       type: object
 *       required:
 *         - Username
 *         - Email
 *         - Password
 *         - RoleID
 *       properties:
 *         Username:
 *           type: string
 *           example: "john_doe"
 *           minLength: 3
 *           maxLength: 50
 *         Email:
 *           type: string
 *           format: email
 *           example: "john@example.com"
 *         Password:
 *           type: string
 *           example: "SecurePass123"
 *           minLength: 6
 *         RoleID:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         EmployeeID:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b9"
 *           description: "Optional, not allowed for SuperAdmin role"
 *         Status:
 *           type: string
 *           enum: [active, inactive]
 *           default: "active"
 * 
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: "superadmin@company.com"
 *         password:
 *           type: string
 *           example: "SuperAdmin@123"
 *           minLength: 6
 * 
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
 *         CreatedAt:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:30:00.000Z"
 *         UpdatedAt:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:30:00.000Z"
 * 
 *     LoginResponse:
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
 *               example: "64f8e9b7a1b2c3d4e5f6a7c0"
 *             Username:
 *               type: string
 *               example: "john_doe"
 *             Email:
 *               type: string
 *               example: "john@example.com"
 *             EmployeeID:
 *               $ref: '#/components/schemas/EmployeeResponse'
 *             RoleID:
 *               $ref: '#/components/schemas/RoleResponse'
 *             RoleName:
 *               type: string
 *               example: "Manager"
 *             Status:
 *               type: string
 *               example: "active"
 *             LastLogin:
 *               type: string
 *               format: date-time
 *               example: "2024-01-15T10:30:00.000Z"
 *             token:
 *               type: string
 *               example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *         message:
 *           type: string
 *           example: "Login successful"
 * 
 *     RegisterResponse:
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
 *               example: "64f8e9b7a1b2c3d4e5f6a7c0"
 *             Username:
 *               type: string
 *               example: "john_doe"
 *             Email:
 *               type: string
 *               example: "john@example.com"
 *             RoleID:
 *               $ref: '#/components/schemas/RoleResponse'
 *             RoleName:
 *               type: string
 *               example: "Manager"
 *             EmployeeID:
 *               $ref: '#/components/schemas/EmployeeResponse'
 *             Status:
 *               type: string
 *               example: "active"
 *             token:
 *               type: string
 *               example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *         message:
 *           type: string
 *           example: "User registered successfully"
 * 
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     description: Create a new user account. SuperAdmin cannot be linked to an employee.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserRegister'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RegisterResponse'
 *       400:
 *         description: Bad request - validation error
 *       404:
 *         description: Role or Employee not found
 *       409:
 *         description: User already exists
 *       500:
 *         description: Server error
 *     examples:
 *       Request:
 *         summary: Example registration request
 *         value:
 *           Username: "john_doe"
 *           Email: "john@example.com"
 *           Password: "SecurePass123"
 *           RoleID: "64f8e9b7a1b2c3d4e5f6a7b8"
 *           EmployeeID: "64f8e9b7a1b2c3d4e5f6a7b9"
 *           Status: "active"
 *       Response:
 *         summary: Example registration response
 *         value:
 *           success: true
 *           data:
 *             _id: "64f8e9b7a1b2c3d4e5f6a7c0"
 *             Username: "john_doe"
 *             Email: "john@example.com"
 *             RoleID: 
 *               _id: "64f8e9b7a1b2c3d4e5f6a7b8"
 *               RoleName: "Manager"
 *               Description: "Department manager"
 *             RoleName: "Manager"
 *             EmployeeID: 
 *               _id: "64f8e9b7a1b2c3d4e5f6a7b9"
 *               FirstName: "John"
 *               LastName: "Doe"
 *               Email: "john.doe@company.com"
 *             Status: "active"
 *             token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *           message: "User registered successfully"
 */
router.post('/register', register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user with email and password
 *     tags: [Authentication]
 *     description: Authenticate user and return JWT token. Accounts lock after 5 failed attempts.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
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
 *         description: Invalid credentials or account locked
 *       500:
 *         description: Server error
 */
router.post('/login', login);

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [Authentication]
 *     description: Retrieve authenticated user's profile information
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
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
 *       401:
 *         description: Not authenticated - Missing or invalid token
 *       500:
 *         description: Server error
 */
router.get('/profile', protect, getProfile);

/**
 * @swagger
 * /api/auth/change-password:
 *   put:
 *     summary: Change user password
 *     tags: [Authentication]
 *     description: Change authenticated user's password
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: "OldPassword123"
 *                 description: "Current password for verification"
 *               newPassword:
 *                 type: string
 *                 example: "NewSecurePass456"
 *                 description: "New password (min 6 characters)"
 *                 minLength: 6
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
 *         description: Current password is incorrect
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.put('/change-password', protect, changePassword);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Authentication]
 *     description: Logout endpoint (JWT tokens are client-side)
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

module.exports = router;