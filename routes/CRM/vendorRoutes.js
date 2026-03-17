const express = require('express');
const router = express.Router();
const {
  getVendors,
  getVendor,
  createVendor,
  updateVendor,
  deleteVendor,
  getVendorsDropdown
} = require('../controllers/vendorController');
const { protect } = require('../../middleware/authMiddleware');

// All routes are protected
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Vendors
 *   description: Vendor management for RM and Process suppliers
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Vendor:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         vendor_id:
 *           type: string
 *           example: "VEN-1234567890"
 *         vendor_code:
 *           type: string
 *           example: "VEN-001"
 *         vendor_name:
 *           type: string
 *           example: "ABC Metals Pvt Ltd"
 *         vendor_type:
 *           type: string
 *           enum: [RM, Process, Both]
 *           example: "Both"
 *         address:
 *           type: string
 *           example: "123 Industrial Area, Mumbai"
 *         gstin:
 *           type: string
 *           example: "27AAAAA1234A1Z5"
 *         state:
 *           type: string
 *           example: "Maharashtra"
 *         state_code:
 *           type: number
 *           example: 27
 *         contact_person:
 *           type: string
 *           example: "Rajesh Kumar"
 *         phone:
 *           type: string
 *           example: "9876543210"
 *         email:
 *           type: string
 *           example: "contact@abcmetals.com"
 *         is_active:
 *           type: boolean
 *           example: true
 *         created_by:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             username:
 *               type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *
 *     VendorCreate:
 *       type: object
 *       required:
 *         - vendor_name
 *         - vendor_type
 *         - address
 *         - gstin
 *         - state
 *         - state_code
 *         - contact_person
 *         - phone
 *         - email
 *       properties:
 *         vendor_code:
 *           type: string
 *           example: "VEN-001"
 *           description: "Auto-generated if not provided"
 *         vendor_name:
 *           type: string
 *           example: "ABC Metals Pvt Ltd"
 *         vendor_type:
 *           type: string
 *           enum: [RM, Process, Both]
 *           example: "Both"
 *         address:
 *           type: string
 *           example: "123 Industrial Area, Mumbai"
 *         gstin:
 *           type: string
 *           example: "27AAAAA1234A1Z5"
 *         state:
 *           type: string
 *           example: "Maharashtra"
 *         state_code:
 *           type: number
 *           example: 27
 *         contact_person:
 *           type: string
 *           example: "Rajesh Kumar"
 *         phone:
 *           type: string
 *           example: "9876543210"
 *         email:
 *           type: string
 *           example: "contact@abcmetals.com"
 *
 *     VendorUpdate:
 *       type: object
 *       properties:
 *         vendor_name:
 *           type: string
 *         vendor_type:
 *           type: string
 *           enum: [RM, Process, Both]
 *         address:
 *           type: string
 *         gstin:
 *           type: string
 *         state:
 *           type: string
 *         state_code:
 *           type: number
 *         contact_person:
 *           type: string
 *         phone:
 *           type: string
 *         email:
 *           type: string
 *         is_active:
 *           type: boolean
 *
 *     VendorDropdown:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         vendor_id:
 *           type: string
 *         vendor_code:
 *           type: string
 *         vendor_name:
 *           type: string
 *         vendor_type:
 *           type: string
 *         gstin:
 *           type: string
 *         state:
 *           type: string
 *         state_code:
 *           type: number
 *
 *   responses:
 *     VendorNotFound:
 *       description: Vendor not found
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
 *                 example: "Vendor not found"
 *
 *     DuplicateVendor:
 *       description: Vendor with this code already exists
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
 *                 example: "vendor_code already exists"
 *
 *   parameters:
 *     vendorTypeQuery:
 *       in: query
 *       name: vendor_type
 *       schema:
 *         type: string
 *         enum: [RM, Process, Both]
 *       description: Filter by vendor type
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/vendors:
 *   get:
 *     summary: Get all vendors with pagination and filtering
 *     tags: [Vendors]
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
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - $ref: '#/components/parameters/vendorTypeQuery'
 *       - in: query
 *         name: state_code
 *         schema:
 *           type: number
 *         description: Filter by state code
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in name, code, GSTIN, email
 *     responses:
 *       200:
 *         description: Vendors retrieved successfully
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
 *                     $ref: '#/components/schemas/Vendor'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     totalItems:
 *                       type: integer
 *                     itemsPerPage:
 *                       type: integer
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', protect, getVendors);

/**
 * @swagger
 * /api/vendors/dropdown:
 *   get:
 *     summary: Get vendors for dropdown
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/vendorTypeQuery'
 *     responses:
 *       200:
 *         description: Vendors retrieved successfully
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
 *                     $ref: '#/components/schemas/VendorDropdown'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/dropdown', protect, getVendorsDropdown);

/**
 * @swagger
 * /api/vendors/{id}:
 *   get:
 *     summary: Get single vendor by ID
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
 *     responses:
 *       200:
 *         description: Vendor retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Vendor'
 *       404:
 *         $ref: '#/components/responses/VendorNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/:id', protect, getVendor);

/**
 * @swagger
 * /api/vendors:
 *   post:
 *     summary: Create a new vendor
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VendorCreate'
 *     responses:
 *       201:
 *         description: Vendor created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Vendor'
 *                 message:
 *                   type: string
 *                   example: "Vendor created successfully"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/DuplicateVendor'
 *               - $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/', protect, createVendor);

/**
 * @swagger
 * /api/vendors/{id}:
 *   put:
 *     summary: Update an existing vendor
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VendorUpdate'
 *     responses:
 *       200:
 *         description: Vendor updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Vendor'
 *                 message:
 *                   type: string
 *                   example: "Vendor updated successfully"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/DuplicateVendor'
 *               - $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/VendorNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.put('/:id', protect, updateVendor);

/**
 * @swagger
 * /api/vendors/{id}:
 *   delete:
 *     summary: Deactivate a vendor (SOFT DELETE)
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
 *     responses:
 *       200:
 *         description: Vendor deactivated successfully
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
 *                   example: "Vendor deactivated successfully"
 *       404:
 *         $ref: '#/components/responses/VendorNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.delete('/:id', protect, deleteVendor);

module.exports = router;