const express = require('express');
const router = express.Router();
const uploadCompanyLogo = require('../../middleware/upload');
const {
  getCompanies,
  getCompany,
  createCompany,
  updateCompany,
  deleteCompany
} = require('../controllers/companyController');
const { protect } = require('../../middleware/authMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     Company:
 *       type: object
 *       required:
 *         - company_id
 *         - company_name
 *         - gstin
 *         - pan
 *         - address
 *         - state
 *         - state_code
 *         - phone
 *         - email
 *       properties:
 *         _id:
 *           type: string
 *         company_id:
 *           type: string
 *         company_name:
 *           type: string
 *         gstin:
 *           type: string
 *         pan:
 *           type: string
 *         address:
 *           type: string
 *         state:
 *           type: string
 *         state_code:
 *           type: number
 *         phone:
 *           type: string
 *         email:
 *           type: string
 *         bank_details:
 *           type: object
 *           properties:
 *             bank_name:
 *               type: string
 *             account_no:
 *               type: string
 *             ifsc:
 *               type: string
 *             branch:
 *               type: string
 *         logo_path:
 *           type: string
 *         logo_url:
 *           type: string
 *         is_active:
 *           type: boolean
 *         created_by:
 *           type: string
 *         updated_by:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * tags:
 *   name: Company
 *   description: Company management API
 */

/**
 * @swagger
 * /api/company:
 *   get:
 *     summary: Get all active companies
 *     tags: [Company]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of companies retrieved successfully
 */
router.get('/', protect, getCompanies);

/**
 * @swagger
 * /api/company/{id}:
 *   get:
 *     summary: Get company by ID
 *     tags: [Company]
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
 *         description: Company details retrieved successfully
 */
router.get('/:id', protect, getCompany);

/**
 * @swagger
 * /api/company:
 *   post:
 *     summary: Create a new company with logo
 *     tags: [Company]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - company_id
 *               - company_name
 *               - gstin
 *               - pan
 *               - address
 *               - state
 *               - state_code
 *               - phone
 *               - email
 *             properties:
 *               company_id:
 *                 type: string
 *                 example: "CMP-001"
 *               company_name:
 *                 type: string
 *                 example: "ABC Manufacturing Pvt Ltd"
 *               gstin:
 *                 type: string
 *                 example: "27ABCDE1234F1Z5"
 *               pan:
 *                 type: string
 *                 example: "ABCDE1234F"
 *               address:
 *                 type: string
 *                 example: "123 Industrial Area, Mumbai"
 *               state:
 *                 type: string
 *                 example: "Maharashtra"
 *               state_code:
 *                 type: number
 *                 example: 27
 *               phone:
 *                 type: string
 *                 example: "+91-9876543210"
 *               email:
 *                 type: string
 *                 example: "info@abcmfg.com"
 *               bank_name:
 *                 type: string
 *                 example: "State Bank of India"
 *               account_no:
 *                 type: string
 *                 example: "1234567890"
 *               ifsc:
 *                 type: string
 *                 example: "SBIN0001234"
 *               branch:
 *                 type: string
 *                 example: "Mumbai Main"
 *               is_active:
 *                 type: boolean
 *                 default: true
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: Company logo image (JPEG, PNG, GIF, WEBP - max 5MB)
 *     responses:
 *       201:
 *         description: Company created successfully
 */
router.post('/', protect, uploadCompanyLogo.single('logo'), createCompany);

/**
 * @swagger
 * /api/company/{id}:
 *   put:
 *     summary: Update company with logo
 *     tags: [Company]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               company_id:
 *                 type: string
 *               company_name:
 *                 type: string
 *               gstin:
 *                 type: string
 *               pan:
 *                 type: string
 *               address:
 *                 type: string
 *               state:
 *                 type: string
 *               state_code:
 *                 type: number
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               bank_name:
 *                 type: string
 *               account_no:
 *                 type: string
 *               ifsc:
 *                 type: string
 *               branch:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: New company logo image (replaces existing)
 *     responses:
 *       200:
 *         description: Company updated successfully
 */
router.put('/:id', protect, uploadCompanyLogo.single('logo'), updateCompany);

/**
 * @swagger
 * /api/company/{id}:
 *   delete:
 *     summary: Delete company
 *     tags: [Company]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: hard
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Set to "true" for hard delete
 *     responses:
 *       200:
 *         description: Company deleted successfully
 */
router.delete('/:id', protect, deleteCompany);

module.exports = router;