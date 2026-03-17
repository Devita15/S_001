const express = require('express');
const router = express.Router();
const {
  getTaxes,
  getTax,
  createTax,
  updateTax,
  deleteTax
} = require('../controllers/taxController');
const { protect } = require('../../middleware/authMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     Tax:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         HSNCode:
 *           type: string
 *           example: "8483.30.90"
 *           description: "Harmonized System Nomenclature Code (must be unique)"
 *         GSTPercentage:
 *           type: number
 *           format: float
 *           example: 18.0
 *           minimum: 0
 *           maximum: 100
 *           description: "Total GST percentage"
 *         CGSTPercentage:
 *           type: number
 *           format: float
 *           example: 9.0
 *           minimum: 0
 *           maximum: 50
 *           description: "Central GST percentage (calculated automatically)"
 *         SGSTPercentage:
 *           type: number
 *           format: float
 *           example: 9.0
 *           minimum: 0
 *           maximum: 50
 *           description: "State GST percentage (calculated automatically)"
 *         IGSTPercentage:
 *           type: number
 *           format: float
 *           example: 0.0
 *           minimum: 0
 *           maximum: 100
 *           description: "Integrated GST percentage (for interstate transactions)"
 *         Description:
 *           type: string
 *           example: "Bearings and parts thereof"
 *         IsActive:
 *           type: boolean
 *           example: true
 *         CreatedAt:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:30:00.000Z"
 *         UpdatedAt:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:30:00.000Z"
 * 
 *     TaxCreate:
 *       type: object
 *       required:
 *         - HSNCode
 *         - GSTPercentage
 *       properties:
 *         HSNCode:
 *           type: string
 *           example: "8483.30.90"
 *           description: "Unique HSN code"
 *         GSTPercentage:
 *           type: number
 *           format: float
 *           example: 18.0
 *           minimum: 0
 *           maximum: 100
 *         GSTType:
 *           type: string
 *           enum: [CGST/SGST, IGST]
 *           example: "CGST/SGST"
 *           description: "GST type determines how GSTPercentage is split"
 *         Description:
 *           type: string
 *           example: "Bearings and parts thereof"
 *           default: ""
 * 
 *     TaxUpdate:
 *       type: object
 *       properties:
 *         HSNCode:
 *           type: string
 *           example: "8483.30.91"
 *         GSTPercentage:
 *           type: number
 *           format: float
 *           example: 12.0
 *           minimum: 0
 *           maximum: 100
 *         GSTType:
 *           type: string
 *           enum: [CGST/SGST, IGST]
 *           example: "IGST"
 *         Description:
 *           type: string
 *           example: "Updated description for bearings"
 *         IsActive:
 *           type: boolean
 *           example: false
 * 
 *   responses:
 *     TaxNotFound:
 *       description: Tax record not found
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
 *                 example: "Tax not found"
 * 
 *     DuplicateHSNCode:
 *       description: Tax with this HSN code already exists
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
 *                 example: "Tax with this HSN code already exists"
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
 *                 example: "HSN code is required, GST percentage must be between 0 and 100"
 * 
 *     TaxInUse:
 *       description: Cannot delete tax because it's used in items
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
 *                 example: "Cannot delete tax. 5 item(s) are using this HSN code."
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
 *   name: Taxes
 *   description: HSN Code and GST rate management
 */

/**
 * @swagger
 * /api/taxes:
 *   get:
 *     summary: Get all active taxes with pagination and search
 *     tags: [Taxes]
 *     description: Retrieve all active tax records with optional HSN code filtering
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: hsnCode
 *         schema:
 *           type: string
 *         description: Search by HSN code (case-insensitive partial match)
 *     responses:
 *       200:
 *         description: List of taxes retrieved successfully
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
 *                     $ref: '#/components/schemas/Tax'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                       example: 1
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *                     totalItems:
 *                       type: integer
 *                       example: 50
 *                     itemsPerPage:
 *                       type: integer
 *                       example: 10
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 *     examples:
 *       GetTaxesResponse:
 *         value:
 *           success: true
 *           data:
 *             - _id: "64f8e9b7a1b2c3d4e5f6a7b8"
 *               HSNCode: "8483.30.90"
 *               GSTPercentage: 18.0
 *               CGSTPercentage: 9.0
 *               SGSTPercentage: 9.0
 *               IGSTPercentage: 0.0
 *               Description: "Bearings and parts thereof"
 *               IsActive: true
 *               CreatedAt: "2024-01-15T10:30:00.000Z"
 *               UpdatedAt: "2024-01-15T10:30:00.000Z"
 *             - _id: "64f8e9b7a1b2c3d4e5f6a7b9"
 *               HSNCode: "7414.21.00"
 *               GSTPercentage: 12.0
 *               CGSTPercentage: 6.0
 *               SGSTPercentage: 6.0
 *               IGSTPercentage: 0.0
 *               Description: "Copper tubes and pipes"
 *               IsActive: true
 *               CreatedAt: "2024-01-15T10:35:00.000Z"
 *               UpdatedAt: "2024-01-15T10:35:00.000Z"
 *           pagination:
 *             currentPage: 1
 *             totalPages: 5
 *             totalItems: 50
 *             itemsPerPage: 10
 */
router.get('/', protect, getTaxes);

/**
 * @swagger
 * /api/taxes/{id}:
 *   get:
 *     summary: Get single tax by ID
 *     tags: [Taxes]
 *     description: Retrieve detailed information about a specific tax record
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tax record ID
 *     responses:
 *       200:
 *         description: Tax retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Tax'
 *       404:
 *         $ref: '#/components/responses/TaxNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 *     examples:
 *       GetTaxResponse:
 *         value:
 *           success: true
 *           data:
 *             _id: "64f8e9b7a1b2c3d4e5f6a7b8"
 *             HSNCode: "8483.30.90"
 *             GSTPercentage: 18.0
 *             CGSTPercentage: 9.0
 *             SGSTPercentage: 9.0
 *             IGSTPercentage: 0.0
 *             Description: "Bearings and parts thereof"
 *             IsActive: true
 *             CreatedAt: "2024-01-15T10:30:00.000Z"
 *             UpdatedAt: "2024-01-15T10:30:00.000Z"
 */
router.get('/:id', protect, getTax);

/**
 * @swagger
 * /api/taxes:
 *   post:
 *     summary: Create a new tax record
 *     tags: [Taxes]
 *     description: |
 *       Create a new tax record with HSN code and GST rates.
 *       
 *       **GST Calculation Rules:**
 *       - If GSTType is "CGST/SGST": GSTPercentage is split equally between CGST and SGST
 *       - If GSTType is "IGST": GSTPercentage is assigned to IGST only
 *       
 *       **Example:** GSTPercentage = 18.0
 *       - CGST/SGST: CGST = 9.0%, SGST = 9.0%, IGST = 0%
 *       - IGST: CGST = 0%, SGST = 0%, IGST = 18.0%
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TaxCreate'
 *     responses:
 *       201:
 *         description: Tax created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Tax'
 *                 message:
 *                   type: string
 *                   example: "Tax created successfully"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/DuplicateHSNCode'
 *               - $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 *     examples:
 *       CreateTaxRequestCGST:
 *         summary: Create tax with CGST/SGST split
 *         value:
 *           HSNCode: "8483.30.90"
 *           GSTPercentage: 18.0
 *           GSTType: "CGST/SGST"
 *           Description: "Bearings and parts thereof"
 *       CreateTaxRequestIGST:
 *         summary: Create tax with IGST
 *         value:
 *           HSNCode: "7414.21.00"
 *           GSTPercentage: 12.0
 *           GSTType: "IGST"
 *           Description: "Copper tubes and pipes"
 *       CreateTaxResponse:
 *         value:
 *           success: true
 *           data:
 *             _id: "64f8e9b7a1b2c3d4e5f6a7b8"
 *             HSNCode: "8483.30.90"
 *             GSTPercentage: 18.0
 *             CGSTPercentage: 9.0
 *             SGSTPercentage: 9.0
 *             IGSTPercentage: 0.0
 *             Description: "Bearings and parts thereof"
 *             IsActive: true
 *             CreatedAt: "2024-01-15T10:30:00.000Z"
 *             UpdatedAt: "2024-01-15T10:30:00.000Z"
 *           message: "Tax created successfully"
 */
router.post('/', protect, createTax);

/**
 * @swagger
 * /api/taxes/{id}:
 *   put:
 *     summary: Update an existing tax record
 *     tags: [Taxes]
 *     description: |
 *       Update tax information including HSN code and GST rates.
 *       
 *       **Important:** If GSTType or GSTPercentage changes, CGST/SGST/IGST percentages are recalculated automatically.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tax record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TaxUpdate'
 *     responses:
 *       200:
 *         description: Tax updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Tax'
 *                 message:
 *                   type: string
 *                   example: "Tax updated successfully"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/DuplicateHSNCode'
 *               - $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/TaxNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 *     examples:
 *       UpdateTaxRequest:
 *         value:
 *           GSTPercentage: 12.0
 *           GSTType: "IGST"
 *           Description: "Updated description for interstate transactions"
 *       UpdateTaxResponse:
 *         value:
 *           success: true
 *           data:
 *             _id: "64f8e9b7a1b2c3d4e5f6a7b8"
 *             HSNCode: "8483.30.90"
 *             GSTPercentage: 12.0
 *             CGSTPercentage: 0.0
 *             SGSTPercentage: 0.0
 *             IGSTPercentage: 12.0
 *             Description: "Updated description for interstate transactions"
 *             IsActive: true
 *             CreatedAt: "2024-01-15T10:30:00.000Z"
 *             UpdatedAt: "2024-01-16T14:20:00.000Z"
 *           message: "Tax updated successfully"
 */
router.put('/:id', protect, updateTax);

/**
 * @swagger
 * /api/taxes/{id}:
 *   delete:
 *     summary: Delete a tax record (HARD DELETE)
 *     tags: [Taxes]
 *     description: |
 *       Permanently delete a tax record. Cannot delete if HSN code is being used by any items.
 *       
 *       **Checks before deletion:**
 *       1. Tax record exists
 *       2. No items are using this HSN code
 *       
 *       **Note:** This action cannot be undone.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tax record ID
 *     responses:
 *       200:
 *         description: Tax deleted successfully
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
 *                   example: "Tax deleted successfully"
 *       400:
 *         $ref: '#/components/responses/TaxInUse'
 *       404:
 *         $ref: '#/components/responses/TaxNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.delete('/:id', protect, deleteTax);

module.exports = router;