const express = require('express');
const router = express.Router();
const {
  getQuotations,
  getQuotation,
  createQuotation
} = require('../../controllers/CRM/quotationController');
const { protect } = require('../../middleware/authMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     VendorInfo:
 *       type: object
 *       required:
 *         - type
 *       properties:
 *         type:
 *           type: string
 *           enum: [Existing, New]
 *           example: "Existing"
 *         id:
 *           type: string
 *           example: "699edad52668ad28b8854111"
 *           description: "Required if type is 'Existing'"
 *
 *     NewVendorDetails:
 *       type: object
 *       required:
 *         - vendor_name
 *         - state
 *         - state_code
 *         - address
 *         - city
 *         - pincode
 *         - contact_person
 *         - phone
 *         - email
 *       properties:
 *         vendor_name:
 *           type: string
 *           example: "ABC Engineering Works"
 *         vendor_type:
 *           type: string
 *           enum: [Both, Vendor, Customer]
 *           example: "Both"
 *         gstin:
 *           type: string
 *           example: "27ABCDE1234F1Z5"
 *         state:
 *           type: string
 *           example: "Maharashtra"
 *         state_code:
 *           type: number
 *           example: 27
 *         address:
 *           type: string
 *           example: "Plot No. 123, MIDC Industrial Area"
 *         city:
 *           type: string
 *           example: "Mumbai"
 *         pincode:
 *           type: string
 *           example: "400001"
 *         contact_person:
 *           type: string
 *           example: "Rajesh Kumar"
 *         phone:
 *           type: string
 *           example: "9876543210"
 *         email:
 *           type: string
 *           example: "rajesh@abcengineering.com"
 *         pan:
 *           type: string
 *           example: "ABCDE1234F"
 *
 *     RemarksInfo:
 *       type: object
 *       properties:
 *         internal:
 *           type: string
 *           example: "Urgent delivery required within 2 weeks"
 *         customer:
 *           type: string
 *           example: "Please ensure all parts are tested before dispatch and provide test certificates"
 *
 *     FinancialsInfo:
 *       type: object
 *       properties:
 *         gst_percentage:
 *           type: number
 *           example: 18
 *           default: 18
 *
 *     ICCInfo:
 *       type: object
 *       properties:
 *         credit_on_input_days:
 *           type: number
 *           example: -30
 *           default: -30
 *         wip_fg_days:
 *           type: number
 *           example: 30
 *           default: 30
 *         credit_to_customer_days:
 *           type: number
 *           example: 45
 *           default: 45
 *         cost_of_capital:
 *           type: number
 *           example: 0.10
 *           default: 0.10
 *
 *     CostingParameters:
 *       type: object
 *       properties:
 *         ohp_percent_on_material:
 *           type: number
 *           example: 0.10
 *           default: 0.10
 *         ohp_percent_on_labour:
 *           type: number
 *           example: 0.15
 *           default: 0.15
 *         inspection_cost_per_nos:
 *           type: number
 *           example: 0.20
 *           default: 0.20
 *         tool_maintenance_cost_per_nos:
 *           type: number
 *           example: 0.20
 *           default: 0.20
 *         packing_cost_per_nos:
 *           type: number
 *           example: 5.00
 *           default: 5.00
 *         plating_cost_per_kg:
 *           type: number
 *           example: 70.00
 *           default: 70.00
 *         margin_percent:
 *           type: number
 *           example: 15
 *           default: 15
 *
 *     ItemProcess:
 *       type: object
 *       required:
 *         - process_id
 *         - rate_per_hour
 *         - hours
 *       properties:
 *         process_id:
 *           type: string
 *           example: "69a720ecfde48ece6e502ab3"
 *         rate_per_hour:
 *           type: number
 *           example: 252.50
 *         hours:
 *           type: number
 *           example: 1.5
 *         outsourced_vendor_id:
 *           type: string
 *           nullable: true
 *           example: null
 *
 *     QuotationItem:
 *       type: object
 *       required:
 *         - part_no
 *         - quantity
 *         - processes
 *       properties:
 *         part_no:
 *           type: string
 *           example: "BR-009"
 *         quantity:
 *           type: number
 *           example: 100
 *         costing_parameters:
 *           $ref: '#/components/schemas/CostingParameters'
 *         processes:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ItemProcess'
 *
 *     QuotationCreateRequest:
 *       type: object
 *       required:
 *         - vendor
 *         - items
 *       properties:
 *         vendor:
 *           $ref: '#/components/schemas/VendorInfo'
 *         new_vendor_details:
 *           $ref: '#/components/schemas/NewVendorDetails'
 *           description: "Required if vendor.type is 'New'"
 *         template_id:
 *           type: string
 *           example: "69a81713603b3e061ae69284"
 *         valid_till:
 *           type: string
 *           format: date
 *           example: "2025-04-30"
 *         remarks:
 *           $ref: '#/components/schemas/RemarksInfo'
 *         financials:
 *           $ref: '#/components/schemas/FinancialsInfo'
 *         icc:
 *           $ref: '#/components/schemas/ICCInfo'
 *         items:
 *           type: array
 *           minItems: 1
 *           items:
 *             $ref: '#/components/schemas/QuotationItem'
 *
 *     QuotationItemProcess:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7d0"
 *         qip_id:
 *           type: string
 *           example: "QIP-20240215-001"
 *         process_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *               example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *             ProcessName:
 *               type: string
 *               example: "Cutting"
 *             RateType:
 *               type: string
 *               example: "Per Nos"
 *         process_name:
 *           type: string
 *           example: "Cutting"
 *         rate_type:
 *           type: string
 *           enum: [Per Nos, Per Kg, Per Hour, Fixed]
 *           example: "Per Nos"
 *         rate_entered:
 *           type: number
 *           example: 5
 *         quantity:
 *           type: number
 *           example: 100
 *         weight:
 *           type: number
 *           example: 0.044
 *         hours:
 *           type: number
 *           example: 2
 *         calculated_cost:
 *           type: number
 *           example: 500
 *
 *     QuotationItem:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7c5"
 *         PartNo:
 *           type: string
 *           example: "BR-009"
 *         PartName:
 *           type: string
 *           example: "Copper Bushing"
 *         Description:
 *           type: string
 *           example: "Copper bushing for motor application"
 *         HSNCode:
 *           type: string
 *           example: "741421"
 *         Unit:
 *           type: string
 *           enum: [Nos, Kg, Meter, Set, Piece]
 *           example: "Nos"
 *         Quantity:
 *           type: number
 *           example: 100
 *         Thickness:
 *           type: number
 *           example: 5
 *         Width:
 *           type: number
 *           example: 50
 *         Length:
 *           type: number
 *           example: 100
 *         Weight:
 *           type: number
 *           example: 0.044
 *         RMCost:
 *           type: number
 *           example: 37.40
 *         ProcessCost:
 *           type: number
 *           example: 13.88
 *         OverheadPercent:
 *           type: number
 *           example: 10
 *         OverheadAmount:
 *           type: number
 *           example: 5.13
 *         MarginPercent:
 *           type: number
 *           example: 15
 *         MarginAmount:
 *           type: number
 *           example: 7.69
 *         SubCost:
 *           type: number
 *           example: 51.28
 *         FinalRate:
 *           type: number
 *           example: 64.10
 *         Amount:
 *           type: number
 *           example: 6410
 *         processes:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/QuotationItemProcess'
 *
 *     Quotation:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         QuotationNo:
 *           type: string
 *           example: "QT-202402-1234"
 *         QuotationDate:
 *           type: string
 *           format: date-time
 *           example: "2024-02-15T10:30:00.000Z"
 *         ValidTill:
 *           type: string
 *           format: date-time
 *           example: "2024-03-15T10:30:00.000Z"
 *         TemplateID:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             template_name:
 *               type: string
 *             template_code:
 *               type: string
 *         TemplateName:
 *           type: string
 *           example: "Detailed Busbar Quotation"
 *         CompanyID:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *               example: "64f8e9b7a1b2c3d4e5f6a7c0"
 *             CompanyName:
 *               type: string
 *               example: "ABC Manufacturing Co."
 *             GSTIN:
 *               type: string
 *               example: "27ABCDE1234F1Z5"
 *         VendorID:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *               example: "64f8e9b7a1b2c3d4e5f6a7c1"
 *             VendorName:
 *               type: string
 *               example: "XYZ Suppliers"
 *         VendorName:
 *           type: string
 *           example: "XYZ Suppliers"
 *         VendorGSTIN:
 *           type: string
 *           example: "27XYZAB1234C1D2"
 *         VendorState:
 *           type: string
 *           example: "Gujarat"
 *         VendorStateCode:
 *           type: number
 *           example: 24
 *         VendorType:
 *           type: string
 *           enum: [Existing, New]
 *           example: "Existing"
 *         GSTType:
 *           type: string
 *           enum: [CGST/SGST, IGST]
 *           example: "IGST"
 *         Items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/QuotationItem'
 *         SubTotal:
 *           type: number
 *           example: 6410
 *         GSTPercentage:
 *           type: number
 *           example: 18
 *         GSTAmount:
 *           type: number
 *           example: 1153.80
 *         GrandTotal:
 *           type: number
 *           example: 7563.80
 *         AmountInWords:
 *           type: string
 *           example: "Seven Thousand Five Hundred Sixty Three Rupees and Eighty Paise Only"
 *         TermsConditions:
 *           type: array
 *           items:
 *             type: object
 *         InternalRemarks:
 *           type: string
 *           example: "Urgent delivery required within 2 weeks"
 *         CustomerRemarks:
 *           type: string
 *           example: "Please ensure all parts are tested before dispatch and provide test certificates"
 *         Status:
 *           type: string
 *           enum: [Draft, Sent, Approved, Rejected, Cancelled]
 *           example: "Draft"
 *         IsActive:
 *           type: boolean
 *           example: true
 *         CreatedBy:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *               example: "64f8e9b7a1b2c3d4e5f6a7c2"
 *             Username:
 *               type: string
 *               example: "john.doe"
 *         CreatedAt:
 *           type: string
 *           format: date-time
 *           example: "2024-02-15T10:30:00.000Z"
 *
 *   responses:
 *     QuotationNotFound:
 *       description: Quotation not found
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
 *                 example: "Quotation not found"
 *
 *     CompanyNotFound:
 *       description: Company not found
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
 *                 example: "No active company found"
 *
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
 *                 example: "Vendor not found or inactive"
 *
 *     ItemNotFound:
 *       description: Item not found
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
 *                 example: "Item \"BR-009\" not found in Item master"
 *
 *     ProcessNotFound:
 *       description: Process not found
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
 *                 example: "Process not found: 69a720ecfde48ece6e502ab3"
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
 *                 example: "Vendor information is required"
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
 *   name: Quotations
 *   description: Quotation management with dynamic calculation
 */

/**
 * @swagger
 * /api/quotations:
 *   get:
 *     summary: Get all quotations with pagination and filtering
 *     tags: [Quotations]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Draft, Sent, Approved, Rejected, Cancelled]
 *         description: Filter by status
 *       - in: query
 *         name: vendorId
 *         schema:
 *           type: string
 *         description: Filter by vendor ID
 *       - in: query
 *         name: templateId
 *         schema:
 *           type: string
 *         description: Filter by template ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in QuotationNo or VendorName
 *     responses:
 *       200:
 *         description: Quotations retrieved successfully
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
 *                     $ref: '#/components/schemas/Quotation'
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
 *                 statistics:
 *                   type: object
 *                   properties:
 *                     totalQuotations:
 *                       type: integer
 *                     totalAmount:
 *                       type: number
 *                     avgAmount:
 *                       type: number
 *                     draftCount:
 *                       type: integer
 *                     sentCount:
 *                       type: integer
 *                     approvedCount:
 *                       type: integer
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', protect, getQuotations);

/**
 * @swagger
 * /api/quotations/{id}:
 *   get:
 *     summary: Get single quotation by ID
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quotation ID
 *     responses:
 *       200:
 *         description: Quotation retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Quotation'
 *       404:
 *         $ref: '#/components/responses/QuotationNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/:id', protect, getQuotation);

/**
 * @swagger
 * /api/quotations:
 *   post:
 *     summary: Create a new quotation with dynamic calculation and download Excel
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/QuotationCreateRequest'
 *           example:
 *             vendor:
 *               type: "Existing"
 *               id: "699edad52668ad28b8854111"
 *             template_id: "69a81713603b3e061ae69284"
 *             valid_till: "2025-04-30"
 *             remarks:
 *               internal: "Urgent delivery required within 2 weeks"
 *               customer: "Please ensure all parts are tested before dispatch and provide test certificates"
 *             financials:
 *               gst_percentage: 18
 *             icc:
 *               credit_on_input_days: -30
 *               wip_fg_days: 30
 *               credit_to_customer_days: 45
 *               cost_of_capital: 0.10
 *             items:
 *               - part_no: "BR-009"
 *                 quantity: 100
 *                 costing_parameters:
 *                   ohp_percent_on_material: 0.10
 *                   ohp_percent_on_labour: 0.15
 *                   inspection_cost_per_nos: 0.20
 *                   tool_maintenance_cost_per_nos: 0.20
 *                   packing_cost_per_nos: 5.00
 *                   plating_cost_per_kg: 70.00
 *                   margin_percent: 15
 *                 processes:
 *                   - process_id: "69a720ecfde48ece6e502ab3"
 *                     rate_per_hour: 252.50
 *                     hours: 1.5
 *                     outsourced_vendor_id: null
 *                   - process_id: "69a72113fde48ece6e502acd"
 *                     rate_per_hour: 45.75
 *                     hours: 2.0
 *                     outsourced_vendor_id: null
 *     responses:
 *       200:
 *         description: Quotation created successfully and Excel file downloaded
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Disposition:
 *             schema:
 *               type: string
 *               example: attachment; filename=TEMPLATE_CODE_QT-202402-1234.xlsx
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/ValidationError'
 *               - $ref: '#/components/responses/ItemNotFound'
 *               - $ref: '#/components/responses/ProcessNotFound'
 *       404:
 *         oneOf:
 *           - $ref: '#/components/responses/CompanyNotFound'
 *           - $ref: '#/components/responses/VendorNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/', protect, createQuotation);

module.exports = router;