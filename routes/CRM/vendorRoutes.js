// const express = require('express');
// const router = express.Router();
// const {
//   getVendors,
//   getVendor,
//   createVendor,
//   updateVendor,
//   deleteVendor,
//   getVendorsDropdown
// } = require('../../controllers/CRM/vendorController');
// const { protect } = require('../../middleware/authMiddleware');

// // All routes are protected
// router.use(protect);

// /**
//  * @swagger
//  * tags:
//  *   name: Vendors
//  *   description: Vendor management for RM and Process suppliers
//  */

// /**
//  * @swagger
//  * components:
//  *   schemas:
//  *     Vendor:
//  *       type: object
//  *       properties:
//  *         _id:
//  *           type: string
//  *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
//  *         vendor_id:
//  *           type: string
//  *           example: "VEN-1234567890"
//  *         vendor_code:
//  *           type: string
//  *           example: "VEN-001"
//  *         vendor_name:
//  *           type: string
//  *           example: "ABC Metals Pvt Ltd"
//  *         vendor_type:
//  *           type: string
//  *           enum: [RM, Process, Both]
//  *           example: "Both"
//  *         address:
//  *           type: string
//  *           example: "123 Industrial Area, Mumbai"
//  *         gstin:
//  *           type: string
//  *           example: "27AAAAA1234A1Z5"
//  *         state:
//  *           type: string
//  *           example: "Maharashtra"
//  *         state_code:
//  *           type: number
//  *           example: 27
//  *         contact_person:
//  *           type: string
//  *           example: "Rajesh Kumar"
//  *         phone:
//  *           type: string
//  *           example: "9876543210"
//  *         email:
//  *           type: string
//  *           example: "contact@abcmetals.com"
//  *         is_active:
//  *           type: boolean
//  *           example: true
//  *         created_by:
//  *           type: object
//  *           properties:
//  *             _id:
//  *               type: string
//  *             username:
//  *               type: string
//  *         createdAt:
//  *           type: string
//  *           format: date-time
//  *
//  *     VendorCreate:
//  *       type: object
//  *       required:
//  *         - vendor_name
//  *         - vendor_type
//  *         - address
//  *         - gstin
//  *         - state
//  *         - state_code
//  *         - contact_person
//  *         - phone
//  *         - email
//  *       properties:
//  *         vendor_code:
//  *           type: string
//  *           example: "VEN-001"
//  *           description: "Auto-generated if not provided"
//  *         vendor_name:
//  *           type: string
//  *           example: "ABC Metals Pvt Ltd"
//  *         vendor_type:
//  *           type: string
//  *           enum: [RM, Process, Both]
//  *           example: "Both"
//  *         address:
//  *           type: string
//  *           example: "123 Industrial Area, Mumbai"
//  *         gstin:
//  *           type: string
//  *           example: "27AAAAA1234A1Z5"
//  *         state:
//  *           type: string
//  *           example: "Maharashtra"
//  *         state_code:
//  *           type: number
//  *           example: 27
//  *         contact_person:
//  *           type: string
//  *           example: "Rajesh Kumar"
//  *         phone:
//  *           type: string
//  *           example: "9876543210"
//  *         email:
//  *           type: string
//  *           example: "contact@abcmetals.com"
//  *
//  *     VendorUpdate:
//  *       type: object
//  *       properties:
//  *         vendor_name:
//  *           type: string
//  *         vendor_type:
//  *           type: string
//  *           enum: [RM, Process, Both]
//  *         address:
//  *           type: string
//  *         gstin:
//  *           type: string
//  *         state:
//  *           type: string
//  *         state_code:
//  *           type: number
//  *         contact_person:
//  *           type: string
//  *         phone:
//  *           type: string
//  *         email:
//  *           type: string
//  *         is_active:
//  *           type: boolean
//  *
//  *     VendorDropdown:
//  *       type: object
//  *       properties:
//  *         _id:
//  *           type: string
//  *         vendor_id:
//  *           type: string
//  *         vendor_code:
//  *           type: string
//  *         vendor_name:
//  *           type: string
//  *         vendor_type:
//  *           type: string
//  *         gstin:
//  *           type: string
//  *         state:
//  *           type: string
//  *         state_code:
//  *           type: number
//  *
//  *   responses:
//  *     VendorNotFound:
//  *       description: Vendor not found
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             properties:
//  *               success:
//  *                 type: boolean
//  *                 example: false
//  *               message:
//  *                 type: string
//  *                 example: "Vendor not found"
//  *
//  *     DuplicateVendor:
//  *       description: Vendor with this code already exists
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             properties:
//  *               success:
//  *                 type: boolean
//  *                 example: false
//  *               message:
//  *                 type: string
//  *                 example: "vendor_code already exists"
//  *
//  *   parameters:
//  *     vendorTypeQuery:
//  *       in: query
//  *       name: vendor_type
//  *       schema:
//  *         type: string
//  *         enum: [RM, Process, Both]
//  *       description: Filter by vendor type
//  *
//  *   securitySchemes:
//  *     bearerAuth:
//  *       type: http
//  *       scheme: bearer
//  *       bearerFormat: JWT
//  */

// /**
//  * @swagger
//  * /api/vendors:
//  *   get:
//  *     summary: Get all vendors with pagination and filtering
//  *     tags: [Vendors]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: query
//  *         name: page
//  *         schema:
//  *           type: integer
//  *           default: 1
//  *         description: Page number
//  *       - in: query
//  *         name: limit
//  *         schema:
//  *           type: integer
//  *           default: 10
//  *         description: Items per page
//  *       - in: query
//  *         name: is_active
//  *         schema:
//  *           type: boolean
//  *         description: Filter by active status
//  *       - $ref: '#/components/parameters/vendorTypeQuery'
//  *       - in: query
//  *         name: state_code
//  *         schema:
//  *           type: number
//  *         description: Filter by state code
//  *       - in: query
//  *         name: search
//  *         schema:
//  *           type: string
//  *         description: Search in name, code, GSTIN, email
//  *     responses:
//  *       200:
//  *         description: Vendors retrieved successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: true
//  *                 data:
//  *                   type: array
//  *                   items:
//  *                     $ref: '#/components/schemas/Vendor'
//  *                 pagination:
//  *                   type: object
//  *                   properties:
//  *                     currentPage:
//  *                       type: integer
//  *                     totalPages:
//  *                       type: integer
//  *                     totalItems:
//  *                       type: integer
//  *                     itemsPerPage:
//  *                       type: integer
//  *       401:
//  *         description: Not authenticated
//  *       500:
//  *         description: Server error
//  */
// router.get('/', protect, getVendors);

// /**
//  * @swagger
//  * /api/vendors/dropdown:
//  *   get:
//  *     summary: Get vendors for dropdown
//  *     tags: [Vendors]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - $ref: '#/components/parameters/vendorTypeQuery'
//  *     responses:
//  *       200:
//  *         description: Vendors retrieved successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: true
//  *                 data:
//  *                   type: array
//  *                   items:
//  *                     $ref: '#/components/schemas/VendorDropdown'
//  *       401:
//  *         description: Not authenticated
//  *       500:
//  *         description: Server error
//  */
// router.get('/dropdown', protect, getVendorsDropdown);

// /**
//  * @swagger
//  * /api/vendors/{id}:
//  *   get:
//  *     summary: Get single vendor by ID
//  *     tags: [Vendors]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: path
//  *         name: id
//  *         required: true
//  *         schema:
//  *           type: string
//  *         description: Vendor ID
//  *     responses:
//  *       200:
//  *         description: Vendor retrieved successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: true
//  *                 data:
//  *                   $ref: '#/components/schemas/Vendor'
//  *       404:
//  *         $ref: '#/components/responses/VendorNotFound'
//  *       401:
//  *         description: Not authenticated
//  *       500:
//  *         description: Server error
//  */
// router.get('/:id', protect, getVendor);

// /**
//  * @swagger
//  * /api/vendors:
//  *   post:
//  *     summary: Create a new vendor
//  *     tags: [Vendors]
//  *     security:
//  *       - bearerAuth: []
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             $ref: '#/components/schemas/VendorCreate'
//  *     responses:
//  *       201:
//  *         description: Vendor created successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: true
//  *                 data:
//  *                   $ref: '#/components/schemas/Vendor'
//  *                 message:
//  *                   type: string
//  *                   example: "Vendor created successfully"
//  *       400:
//  *         description: Bad request
//  *         content:
//  *           application/json:
//  *             oneOf:
//  *               - $ref: '#/components/responses/DuplicateVendor'
//  *               - $ref: '#/components/responses/ValidationError'
//  *       401:
//  *         description: Not authenticated
//  *       500:
//  *         description: Server error
//  */
// router.post('/', protect, createVendor);

// /**
//  * @swagger
//  * /api/vendors/{id}:
//  *   put:
//  *     summary: Update an existing vendor
//  *     tags: [Vendors]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: path
//  *         name: id
//  *         required: true
//  *         schema:
//  *           type: string
//  *         description: Vendor ID
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             $ref: '#/components/schemas/VendorUpdate'
//  *     responses:
//  *       200:
//  *         description: Vendor updated successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: true
//  *                 data:
//  *                   $ref: '#/components/schemas/Vendor'
//  *                 message:
//  *                   type: string
//  *                   example: "Vendor updated successfully"
//  *       400:
//  *         description: Bad request
//  *         content:
//  *           application/json:
//  *             oneOf:
//  *               - $ref: '#/components/responses/DuplicateVendor'
//  *               - $ref: '#/components/responses/ValidationError'
//  *       404:
//  *         $ref: '#/components/responses/VendorNotFound'
//  *       401:
//  *         description: Not authenticated
//  *       500:
//  *         description: Server error
//  */
// router.put('/:id', protect, updateVendor);

// /**
//  * @swagger
//  * /api/vendors/{id}:
//  *   delete:
//  *     summary: Deactivate a vendor (SOFT DELETE)
//  *     tags: [Vendors]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: path
//  *         name: id
//  *         required: true
//  *         schema:
//  *           type: string
//  *         description: Vendor ID
//  *     responses:
//  *       200:
//  *         description: Vendor deactivated successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: true
//  *                 message:
//  *                   type: string
//  *                   example: "Vendor deactivated successfully"
//  *       404:
//  *         $ref: '#/components/responses/VendorNotFound'
//  *       401:
//  *         description: Not authenticated
//  *       500:
//  *         description: Server error
//  */
// router.delete('/:id', protect, deleteVendor);

// module.exports = router;

// routes/CRM/vendorRoutes.js
const express = require('express');
const router = express.Router();
const {
  // Basic CRUD
  getAllVendors,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
  getVendorsDropdown,
  
  // AVL & Blacklist
  avlApproveVendor,
  blacklistVendor,
  
  // // Performance & Analytics
  // getVendorScorecard,
  // compareVendors,
  // getVendorHistory
} = require('../../controllers/CRM/vendorController');

const { protect, authorize } = require('../../middleware/authMiddleware');

// All routes are protected
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Vendors
 *   description: Complete Vendor Management including AVL, Blacklist, Scorecard, and Performance Tracking
 */

// ======================================================
// COMMON COMPONENTS
// ======================================================

/**
 * @swagger
 * components:
 *   schemas:
 *     # ========== BANK DETAILS SCHEMA ==========
 *     BankDetails:
 *       type: object
 *       properties:
 *         bank_name:
 *           type: string
 *           example: "HDFC Bank"
 *         account_no:
 *           type: string
 *           example: "50100123456789"
 *         ifsc:
 *           type: string
 *           example: "HDFC0001234"
 *         branch:
 *           type: string
 *           example: "MIDC Industrial Area"
 *         account_name:
 *           type: string
 *           example: "ABC Metals Pvt Ltd"
 *         account_type:
 *           type: string
 *           enum: [Current, Savings, Cash Credit, Overdraft]
 *           example: "Current"
 *
 *     # ========== VENDOR FULL SCHEMA ==========
 *     Vendor:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         vendor_id:
 *           type: string
 *           example: "VND-202503-0042"
 *         vendor_code:
 *           type: string
 *           example: "ABC-001"
 *         vendor_name:
 *           type: string
 *           example: "ABC Metals Pvt Ltd"
 *         vendor_type:
 *           type: string
 *           enum: [Raw Material, Consumable, Subcontractor, Capital Goods, Service, Utilities, Other]
 *           example: "Raw Material"
 *         supply_category:
 *           type: array
 *           items:
 *             type: string
 *           example: ["Copper Strip", "Aluminium Profile"]
 *         address:
 *           type: string
 *           example: "123 Industrial Area, MIDC, Mumbai"
 *         gstin:
 *           type: string
 *           example: "27AAAAA1234A1Z5"
 *         pan:
 *           type: string
 *           example: "AAAAA1234A"
 *         state:
 *           type: string
 *           example: "Maharashtra"
 *         state_code:
 *           type: number
 *           example: 27
 *         msme_number:
 *           type: string
 *           example: "UDYAM-MH-01-1234567"
 *         msme_category:
 *           type: string
 *           enum: [Micro, Small, Medium, Not MSME, null]
 *           example: "Small"
 *         contact_person:
 *           type: string
 *           example: "Rajesh Kumar"
 *         phone:
 *           type: string
 *           example: "9876543210"
 *         alternate_phone:
 *           type: string
 *           example: "9876543211"
 *         email:
 *           type: string
 *           example: "contact@abcmetals.com"
 *         website:
 *           type: string
 *           example: "www.abcmetals.com"
 *         payment_terms:
 *           type: string
 *           enum: [Advance, On Delivery, Net 15, Net 30, Net 45, Net 60, Net 90, LC, Custom]
 *           example: "Net 30"
 *         credit_days:
 *           type: number
 *           example: 30
 *         currency:
 *           type: string
 *           enum: [INR, USD, EUR, GBP, AED, JPY]
 *           example: "INR"
 *         bank_details:
 *           $ref: '#/components/schemas/BankDetails'
 *         
 *         # AVL Fields
 *         avl_approved:
 *           type: boolean
 *           example: true
 *         avl_items:
 *           type: array
 *           items:
 *             type: string
 *           example: ["64f8e9b7a1b2c3d4e5f6a7c1", "64f8e9b7a1b2c3d4e5f6a7c2"]
 *         avl_approved_by:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             Username:
 *               type: string
 *             Email:
 *               type: string
 *         avl_approved_at:
 *           type: string
 *           format: date-time
 *         avl_review_date:
 *           type: string
 *           format: date
 *           example: "2026-03-18"
 *         
 *         # Performance Ratings
 *         quality_rating:
 *           type: number
 *           example: 4.5
 *           minimum: 0
 *           maximum: 5
 *         delivery_rating:
 *           type: number
 *           example: 4.2
 *           minimum: 0
 *           maximum: 5
 *         price_rating:
 *           type: number
 *           example: 4.8
 *           minimum: 0
 *           maximum: 5
 *         overall_rating:
 *           type: number
 *           example: 4.5
 *           minimum: 0
 *           maximum: 5
 *         
 *         # Blacklist
 *         blacklisted:
 *           type: boolean
 *           example: false
 *         blacklist_reason:
 *           type: string
 *           example: null
 *         blacklisted_by:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             Username:
 *               type: string
 *         blacklisted_at:
 *           type: string
 *           format: date-time
 *         
 *         # Status
 *         is_active:
 *           type: boolean
 *           example: true
 *         created_by:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             Username:
 *               type: string
 *         updated_by:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             Username:
 *               type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     # ========== CREATE VENDOR SCHEMA ==========
 *     VendorCreate:
 *       type: object
 *       required:
 *         - vendor_code
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
 *           example: "ABC-001"
 *           description: "Unique vendor code"
 *         vendor_name:
 *           type: string
 *           example: "ABC Metals Pvt Ltd"
 *         vendor_type:
 *           type: string
 *           enum: [Raw Material, Consumable, Subcontractor, Capital Goods, Service, Utilities, Other]
 *           example: "Raw Material"
 *         supply_category:
 *           type: array
 *           items:
 *             type: string
 *           example: ["Copper Strip", "Aluminium Profile"]
 *         address:
 *           type: string
 *           example: "123 Industrial Area, MIDC, Mumbai"
 *         gstin:
 *           type: string
 *           example: "27AAAAA1234A1Z5"
 *         pan:
 *           type: string
 *           example: "AAAAA1234A"
 *         state:
 *           type: string
 *           example: "Maharashtra"
 *         state_code:
 *           type: number
 *           example: 27
 *         msme_number:
 *           type: string
 *           example: "UDYAM-MH-01-1234567"
 *         msme_category:
 *           type: string
 *           enum: [Micro, Small, Medium, Not MSME]
 *         contact_person:
 *           type: string
 *           example: "Rajesh Kumar"
 *         phone:
 *           type: string
 *           example: "9876543210"
 *         alternate_phone:
 *           type: string
 *           example: "9876543211"
 *         email:
 *           type: string
 *           example: "contact@abcmetals.com"
 *         website:
 *           type: string
 *           example: "www.abcmetals.com"
 *         payment_terms:
 *           type: string
 *           enum: [Advance, On Delivery, Net 15, Net 30, Net 45, Net 60, Net 90, LC, Custom]
 *           default: "Net 30"
 *         credit_days:
 *           type: number
 *           default: 30
 *         currency:
 *           type: string
 *           enum: [INR, USD, EUR, GBP, AED, JPY]
 *           default: "INR"
 *         bank_details:
 *           $ref: '#/components/schemas/BankDetails'
 *
 *     # ========== UPDATE VENDOR SCHEMA ==========
 *     VendorUpdate:
 *       type: object
 *       properties:
 *         vendor_name:
 *           type: string
 *         vendor_type:
 *           type: string
 *           enum: [Raw Material, Consumable, Subcontractor, Capital Goods, Service, Utilities, Other]
 *         supply_category:
 *           type: array
 *           items:
 *             type: string
 *         address:
 *           type: string
 *         gstin:
 *           type: string
 *         pan:
 *           type: string
 *         state:
 *           type: string
 *         state_code:
 *           type: number
 *         msme_number:
 *           type: string
 *         msme_category:
 *           type: string
 *           enum: [Micro, Small, Medium, Not MSME]
 *         contact_person:
 *           type: string
 *         phone:
 *           type: string
 *         alternate_phone:
 *           type: string
 *         email:
 *           type: string
 *         website:
 *           type: string
 *         payment_terms:
 *           type: string
 *           enum: [Advance, On Delivery, Net 15, Net 30, Net 45, Net 60, Net 90, LC, Custom]
 *         credit_days:
 *           type: number
 *         currency:
 *           type: string
 *           enum: [INR, USD, EUR, GBP, AED, JPY]
 *         bank_details:
 *           $ref: '#/components/schemas/BankDetails'
 *         is_active:
 *           type: boolean
 *
 *     # ========== DROPDOWN SCHEMA ==========
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
 *         avl_approved:
 *           type: boolean
 *         blacklisted:
 *           type: boolean
 *
 *     # ========== AVL APPROVAL SCHEMA ==========
 *     AVLApproval:
 *       type: object
 *       required:
 *         - avl_items
 *       properties:
 *         avl_items:
 *           type: array
 *           items:
 *             type: string
 *           example: ["64f8e9b7a1b2c3d4e5f6a7c1", "64f8e9b7a1b2c3d4e5f6a7c2"]
 *           description: "Array of Item IDs that this vendor is approved to supply"
 *
 *     # ========== BLACKLIST SCHEMA ==========
 *     Blacklist:
 *       type: object
 *       required:
 *         - blacklist_reason
 *       properties:
 *         blacklist_reason:
 *           type: string
 *           example: "Repeated quality rejections - 3 NCRs in last month"
 *           description: "Reason for blacklisting the vendor"
 *
 *     # ========== SCORECARD SCHEMA ==========
 *     Scorecard:
 *       type: object
 *       properties:
 *         vendor:
 *           type: object
 *           properties:
 *             vendor_id:
 *               type: string
 *             vendor_name:
 *               type: string
 *             vendor_code:
 *               type: string
 *             avl_approved:
 *               type: boolean
 *             blacklisted:
 *               type: boolean
 *         current_month:
 *           type: object
 *           properties:
 *             period:
 *               type: string
 *               example: "Mar-2025"
 *             quality:
 *               type: object
 *               properties:
 *                 rating:
 *                   type: number
 *                 total_received:
 *                   type: number
 *                 total_accepted:
 *                   type: number
 *                 rejection_percent:
 *                   type: number
 *             delivery:
 *               type: object
 *               properties:
 *                 rating:
 *                   type: number
 *                 total_pos:
 *                   type: number
 *                 on_time_pos:
 *                   type: number
 *                 on_time_percent:
 *                   type: number
 *             price:
 *               type: object
 *               properties:
 *                 rating:
 *                   type: number
 *                 total_rfqs:
 *                   type: number
 *                 l1_count:
 *                   type: number
 *                 l1_percent:
 *                   type: number
 *             overall_rating:
 *               type: number
 *         history:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               period:
 *                 type: string
 *               quality_rating:
 *                 type: number
 *               delivery_rating:
 *                 type: number
 *               price_rating:
 *                 type: number
 *               overall_rating:
 *                 type: number
 *
 *     # ========== COMPARISON SCHEMA ==========
 *     VendorComparison:
 *       type: array
 *       items:
 *         type: object
 *         properties:
 *           vendor:
 *             type: object
 *             properties:
 *               _id:
 *                 type: string
 *               vendor_id:
 *                 type: string
 *               vendor_code:
 *                 type: string
 *               vendor_name:
 *                 type: string
 *               vendor_type:
 *                 type: string
 *               avl_approved:
 *                 type: boolean
 *               blacklisted:
 *                 type: boolean
 *               msme_category:
 *                 type: string
 *               payment_terms:
 *                 type: string
 *               credit_days:
 *                 type: number
 *           ratings:
 *             type: object
 *             properties:
 *               quality:
 *                 type: number
 *               delivery:
 *                 type: number
 *               price:
 *                 type: number
 *               overall:
 *                 type: number
 *           latest_performance:
 *             type: object
 *             properties:
 *               period:
 *                 type: string
 *               rejection_percent:
 *                 type: number
 *               on_time_percent:
 *                 type: number
 *               l1_percent:
 *                 type: number
 *
 *     # ========== HISTORY SCHEMA ==========
 *     VendorHistory:
 *       type: object
 *       properties:
 *         vendor:
 *           type: object
 *           properties:
 *             vendor_id:
 *               type: string
 *             vendor_name:
 *               type: string
 *         history:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [PO, GRN, Purchase Invoice, Payment]
 *               document_no:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date-time
 *               amount:
 *                 type: number
 *               status:
 *                 type: string
 *               details:
 *                 type: object
 *         pagination:
 *           type: object
 *           properties:
 *             page:
 *               type: number
 *             limit:
 *               type: number
 *             total:
 *               type: number
 *             pages:
 *               type: number
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
 *               error:
 *                 type: string
 *                 example: "VENDOR_NOT_FOUND"
 *
 *     DuplicateVendorCode:
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
 *                 example: "Vendor code already exists"
 *               error:
 *                 type: string
 *                 example: "DUPLICATE_VENDOR_CODE"
 *
 *     DuplicateGSTIN:
 *       description: Vendor with this GSTIN already exists
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
 *                 example: "Vendor with this GSTIN already exists"
 *               error:
 *                 type: string
 *                 example: "DUPLICATE_GSTIN"
 *
 *     ValidationError:
 *       description: Validation error
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
 *                 example: "Validation failed"
 *               errors:
 *                 type: object
 *
 *   parameters:
 *     vendorTypeQuery:
 *       in: query
 *       name: vendor_type
 *       schema:
 *         type: string
 *         enum: [Raw Material, Consumable, Subcontractor, Capital Goods, Service, Utilities, Other]
 *       description: Filter by vendor type
 *
 *     avlApprovedQuery:
 *       in: query
 *       name: avl_approved
 *       schema:
 *         type: boolean
 *       description: Filter by AVL approval status
 *
 *     blacklistedQuery:
 *       in: query
 *       name: blacklisted
 *       schema:
 *         type: boolean
 *       description: Filter by blacklist status
 *
 *     supplyCategoryQuery:
 *       in: query
 *       name: supply_category
 *       schema:
 *         type: string
 *       description: Filter by supply category
 *
 *     minRatingQuery:
 *       in: query
 *       name: min_rating
 *       schema:
 *         type: number
 *         minimum: 0
 *         maximum: 5
 *       description: Minimum overall rating
 *
 *     maxRatingQuery:
 *       in: query
 *       name: max_rating
 *       schema:
 *         type: number
 *         minimum: 0
 *         maximum: 5
 *       description: Maximum overall rating
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

// ======================================================
// BASIC CRUD ENDPOINTS
// ======================================================

/**
 * @swagger
 * /api/vendors:
 *   get:
 *     summary: Get all vendors with pagination and advanced filtering
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
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in vendor name, code, GSTIN, contact person
 *       - $ref: '#/components/parameters/vendorTypeQuery'
 *       - $ref: '#/components/parameters/avlApprovedQuery'
 *       - $ref: '#/components/parameters/blacklistedQuery'
 *       - $ref: '#/components/parameters/supplyCategoryQuery'
 *       - $ref: '#/components/parameters/minRatingQuery'
 *       - $ref: '#/components/parameters/maxRatingQuery'
 *       - in: query
 *         name: state_code
 *         schema:
 *           type: number
 *         description: Filter by state code
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [vendor_name, vendor_code, overall_rating, quality_rating, createdAt]
 *           default: vendor_name
 *         description: Sort field
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Sort order
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
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', protect, getAllVendors);

/**
 * @swagger
 * /api/vendors/{id}:
 *   get:
 *     summary: Get single vendor by ID with populated references
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID (MongoDB ObjectId)
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
router.get('/:id', protect, getVendorById);

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
 *                 message:
 *                   type: string
 *                   example: "Vendor created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Vendor'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/DuplicateVendorCode'
 *               - $ref: '#/components/responses/DuplicateGSTIN'
 *               - $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/', protect, authorize('admin', 'manager'), createVendor);

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
 *                 message:
 *                   type: string
 *                   example: "Vendor updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Vendor'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/DuplicateGSTIN'
 *               - $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/VendorNotFound'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden - insufficient permissions
 *       500:
 *         description: Server error
 */
router.put('/:id', protect, authorize('admin', 'manager'), updateVendor);

/**
 * @swagger
 * /api/vendors/{id}:
 *   delete:
 *     summary: Soft delete / deactivate a vendor
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
 *       403:
 *         description: Forbidden - admin only
 *       500:
 *         description: Server error
 */
router.delete('/:id', protect, authorize('admin'), deleteVendor);

// ======================================================
// AVL & BLACKLIST ENDPOINTS
// ======================================================

/**
 * @swagger
 * /api/vendors/{id}/avl-approve:
 *   put:
 *     summary: Approve vendor for AVL (Approved Vendor List)
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
 *             $ref: '#/components/schemas/AVLApproval'
 *     responses:
 *       200:
 *         description: Vendor approved for AVL successfully
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
 *                   example: "Vendor approved for AVL successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     vendor_id:
 *                       type: string
 *                     vendor_name:
 *                       type: string
 *                     avl_approved:
 *                       type: boolean
 *                     avl_items:
 *                       type: array
 *                     avl_approved_by:
 *                       type: string
 *                     avl_approved_at:
 *                       type: string
 *                     avl_review_date:
 *                       type: string
 *       400:
 *         description: Bad request
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
 *                   example: "At least one item must be specified for AVL approval"
 *                 error:
 *                   type: string
 *                   example: "AVL_ITEMS_REQUIRED"
 *       404:
 *         $ref: '#/components/responses/VendorNotFound'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden - admin/manager only
 *       500:
 *         description: Server error
 */
router.put('/:id/avl-approve', protect, authorize('admin', 'manager'), avlApproveVendor);

/**
 * @swagger
 * /api/vendors/{id}/blacklist:
 *   put:
 *     summary: Blacklist a vendor
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
 *             $ref: '#/components/schemas/Blacklist'
 *     responses:
 *       200:
 *         description: Vendor blacklisted successfully
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
 *                   example: "Vendor blacklisted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     vendor_id:
 *                       type: string
 *                     vendor_name:
 *                       type: string
 *                     blacklisted:
 *                       type: boolean
 *                     blacklist_reason:
 *                       type: string
 *                     blacklisted_by:
 *                       type: string
 *                     blacklisted_at:
 *                       type: string
 *                     avl_approved:
 *                       type: boolean
 *       400:
 *         description: Bad request
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
 *                   example: "Blacklist reason is required"
 *                 error:
 *                   type: string
 *                   example: "BLACKLIST_REASON_REQUIRED"
 *       404:
 *         $ref: '#/components/responses/VendorNotFound'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden - admin/manager only
 *       500:
 *         description: Server error
 */
router.put('/:id/blacklist', protect, authorize('admin', 'manager'), blacklistVendor);

// // ======================================================
// // PERFORMANCE & ANALYTICS ENDPOINTS
// // ======================================================

// /**
//  * @swagger
//  * /api/vendors/{id}/scorecard:
//  *   get:
//  *     summary: Get vendor performance scorecard with 6-month trend
//  *     tags: [Vendors]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: path
//  *         name: id
//  *         required: true
//  *         schema:
//  *           type: string
//  *         description: Vendor ID
//  *     responses:
//  *       200:
//  *         description: Vendor scorecard retrieved successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: true
//  *                 data:
//  *                   $ref: '#/components/schemas/Scorecard'
//  *       404:
//  *         $ref: '#/components/responses/VendorNotFound'
//  *       401:
//  *         description: Not authenticated
//  *       500:
//  *         description: Server error
//  */
// router.get('/:id/scorecard', protect, getVendorScorecard);

// /**
//  * @swagger
//  * /api/vendors/compare:
//  *   get:
//  *     summary: Compare multiple vendors side by side
//  *     tags: [Vendors]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: query
//  *         name: ids
//  *         required: true
//  *         schema:
//  *           type: string
//  *         description: Comma-separated list of vendor IDs (e.g., id1,id2,id3)
//  *         example: "64f8e9b7a1b2c3d4e5f6a7b8,64f8e9b7a1b2c3d4e5f6a7b9,64f8e9b7a1b2c3d4e5f6a7c0"
//  *     responses:
//  *       200:
//  *         description: Vendor comparison retrieved successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: true
//  *                 data:
//  *                   $ref: '#/components/schemas/VendorComparison'
//  *       400:
//  *         description: Bad request
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: false
//  *                 message:
//  *                   type: string
//  *                   example: "At least 2 vendors required for comparison"
//  *                 error:
//  *                   type: string
//  *                   example: "MIN_TWO_VENDORS_REQUIRED"
//  *       401:
//  *         description: Not authenticated
//  *       500:
//  *         description: Server error
//  */
// router.get('/compare', protect, compareVendors);

// /**
//  * @swagger
//  * /api/vendors/{id}/history:
//  *   get:
//  *     summary: Get vendor transaction history (POs, GRNs, Invoices, Payments)
//  *     tags: [Vendors]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: path
//  *         name: id
//  *         required: true
//  *         schema:
//  *           type: string
//  *         description: Vendor ID
//  *       - in: query
//  *         name: page
//  *         schema:
//  *           type: integer
//  *           default: 1
//  *         description: Page number
//  *       - in: query
//  *         name: limit
//  *         schema:
//  *           type: integer
//  *           default: 20
//  *         description: Items per page
//  *       - in: query
//  *         name: from_date
//  *         schema:
//  *           type: string
//  *           format: date
//  *         description: Filter from date
//  *       - in: query
//  *         name: to_date
//  *         schema:
//  *           type: string
//  *           format: date
//  *         description: Filter to date
//  *       - in: query
//  *         name: type
//  *         schema:
//  *           type: string
//  *           enum: [po, grn, invoice, payment]
//  *         description: Filter by transaction type
//  *     responses:
//  *       200:
//  *         description: Vendor history retrieved successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: true
//  *                 data:
//  *                   $ref: '#/components/schemas/VendorHistory'
//  *       404:
//  *         $ref: '#/components/responses/VendorNotFound'
//  *       401:
//  *         description: Not authenticated
//  *       500:
//  *         description: Server error
//  */
// router.get('/:id/history', protect, getVendorHistory);

module.exports = router;