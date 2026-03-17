// routes/employeeRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  hardDeleteEmployee,
  getEmployeeStats,
  getEmployeeYearlySummary
} = require('../../controllers/HR/employeeController');

// Middleware imports
const { protect } = require('../../middleware/authMiddleware');

// Apply authentication to all routes
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Employees
 *   description: Employee management API
 */

/**
 * @swagger
 * /api/employees:
 *   get:
 *     summary: Get all employees with advanced filtering
 *     tags: [Employees]
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
 *         name: department
 *         schema:
 *           type: string
 *         description: Department ID or name
 *       - in: query
 *         name: designation
 *         schema:
 *           type: string
 *         description: Designation ID or name
 *       - in: query
 *         name: employmentType
 *         schema:
 *           type: string
 *           enum: [Monthly, Hourly, PieceRate]
 *         description: Employment type filter
 *       - in: query
 *         name: employmentStatus
 *         schema:
 *           type: string
 *           enum: [active, resigned, terminated, retired]
 *         description: Employment status filter
 *       - in: query
 *         name: skillLevel
 *         schema:
 *           type: string
 *           enum: [Trainee, Semi-Skilled, Skilled, Highly-Skilled, Supervisor]
 *         description: Skill level filter
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search across multiple fields
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: CreatedAt
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: List of employees
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     hasNextPage:
 *                       type: boolean
 *                     hasPrevPage:
 *                       type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Employee'
 */
router.get('/', getEmployees);

/**
 * @swagger
 * /api/employees/dashboard/stats:
 *   get:
 *     summary: Get employee statistics for dashboard
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Employee statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     counts:
 *                       type: object
 *                     distributions:
 *                       type: object
 *                     trends:
 *                       type: object
 *                     salary:
 *                       type: object
 */
router.get('/dashboard/stats', getEmployeeStats);

/**
 * @swagger
 * /api/employees/summary/{employeeId}/year/{year}:
 *   get:
 *     summary: Get yearly summary for a specific employee with overtime and behavior data
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *       - in: path
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *         description: Year for summary (e.g., 2024)
 *     responses:
 *       200:
 *         description: Employee yearly summary with overtime and behavior data
 */
router.get('/summary/:employeeId/year/:year', getEmployeeYearlySummary);

/**
 * @swagger
 * /api/employees/{id}:
 *   get:
 *     summary: Get employee by ID
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *     responses:
 *       200:
 *         description: Employee details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Employee'
 */
router.get('/:id', getEmployee);

/**
 * @swagger
 * /api/employees:
 *   post:
 *     summary: Create new employee
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - FirstName
 *               - LastName
 *               - Gender
 *               - DateOfBirth
 *               - Email
 *               - Phone
 *               - Address
 *               - DepartmentID
 *               - DesignationID
 *               - DateOfJoining
 *             properties:
 *               FirstName:
 *                 type: string
 *                 maxLength: 50
 *               LastName:
 *                 type: string
 *                 maxLength: 50
 *               Gender:
 *                 type: string
 *                 enum: [M, F, O]
 *               DateOfBirth:
 *                 type: string
 *                 format: date
 *               Email:
 *                 type: string
 *                 format: email
 *               Phone:
 *                 type: string
 *                 maxLength: 15
 *               Address:
 *                 type: string
 *               DepartmentID:
 *                 type: string
 *               DesignationID:
 *                 type: string
 *               DateOfJoining:
 *                 type: string
 *                 format: date
 *               EmploymentType:
 *                 type: string
 *                 enum: [Monthly, Hourly, PieceRate]
 *                 default: Monthly
 *               BasicSalary:
 *                 type: number
 *                 default: 0
 *               HourlyRate:
 *                 type: number
 *                 default: 0
 *               PayStructureType:
 *                 type: string
 *                 enum: [Fixed, Variable, Mixed]
 *                 default: Fixed
 *               SkillLevel:
 *                 type: string
 *                 enum: [Trainee, Semi-Skilled, Skilled, Highly-Skilled, Supervisor]
 *                 default: Semi-Skilled
 *               SupervisorID:
 *                 type: string
 *               BankDetails:
 *                 type: object
 *               EmergencyContact:
 *                 type: object
 *               PAN:
 *                 type: string
 *               AadharNumber:
 *                 type: string
 *     responses:
 *       201:
 *         description: Employee created successfully
 */
router.post('/', createEmployee);


/**
 * @swagger
 * /api/employees/{id}:
 *   put:
 *     summary: Update employee
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Employee'
 *     responses:
 *       200:
 *         description: Employee updated successfully
 */
router.put('/:id' , updateEmployee);


/**
 * @swagger
 * /api/employees/{id}:
 *   delete:
 *     summary: Delete employee (soft delete - changes status to terminated)
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *     responses:
 *       200:
 *         description: Employee status changed to terminated
 */
router.delete('/:id', deleteEmployee);

/**
 * @swagger
 * /api/employees/{id}/hard:
 *   delete:
 *     summary: Hard delete employee (permanent removal - admin only)
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *     responses:
 *       200:
 *         description: Employee permanently deleted
 */
router.delete('/:id/hard', hardDeleteEmployee);

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     Employee:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           readOnly: true
 *         EmployeeID:
 *           type: string
 *           readOnly: true
 *         FirstName:
 *           type: string
 *           maxLength: 50
 *         LastName:
 *           type: string
 *           maxLength: 50
 *         FullName:
 *           type: string
 *           readOnly: true
 *         Gender:
 *           type: string
 *           enum: [M, F, O]
 *         DateOfBirth:
 *           type: string
 *           format: date
 *         Email:
 *           type: string
 *           format: email
 *         Phone:
 *           type: string
 *           maxLength: 15
 *         Address:
 *           type: string
 *         DepartmentID:
 *           oneOf:
 *             - type: string
 *             - $ref: '#/components/schemas/Department'
 *         DesignationID:
 *           oneOf:
 *             - type: string
 *             - $ref: '#/components/schemas/Designation'
 *         DateOfJoining:
 *           type: string
 *           format: date
 *         EmploymentStatus:
 *           type: string
 *           enum: [active, resigned, terminated, retired]
 *           default: active
 *         EmploymentType:
 *           type: string
 *           enum: [Monthly, Hourly, PieceRate]
 *           default: Monthly
 *         PayStructureType:
 *           type: string
 *           enum: [Fixed, Variable, Mixed]
 *           default: Fixed
 *         BasicSalary:
 *           type: number
 *           default: 0
 *         HRA:
 *           type: number
 *           default: 0
 *         ConveyanceAllowance:
 *           type: number
 *           default: 0
 *         MedicalAllowance:
 *           type: number
 *           default: 0
 *         SpecialAllowance:
 *           type: number
 *           default: 0
 *         TotalFixedSalary:
 *           type: number
 *           readOnly: true
 *         HourlyRate:
 *           type: number
 *           default: 0
 *         OvertimeRateMultiplier:
 *           type: number
 *           default: 1.5
 *         PieceRateDetails:
 *           type: array
 *           items:
 *             type: object
 *         BankDetails:
 *           type: object
 *         PFNumber:
 *           type: string
 *         UAN:
 *           type: string
 *         ESINumber:
 *           type: string
 *         PAN:
 *           type: string
 *         AadharNumber:
 *           type: string
 *         EmergencyContact:
 *           type: object
 *         SkillLevel:
 *           type: string
 *           enum: [Trainee, Semi-Skilled, Skilled, Highly-Skilled, Supervisor]
 *           default: Semi-Skilled
 *         WorkStation:
 *           type: string
 *         LineNumber:
 *           type: string
 *         SupervisorID:
 *           oneOf:
 *             - type: string
 *             - $ref: '#/components/schemas/Employee'
 *         LeaveBalances:
 *           type: object
 *         TaxDeclaration:
 *           type: object
 *         CreatedAt:
 *           type: string
 *           format: date-time
 *           readOnly: true
 *         UpdatedAt:
 *           type: string
 *           format: date-time
 *           readOnly: true
 *     Department:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         DepartmentName:
 *           type: string
 *         Description:
 *           type: string
 *     Designation:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         DesignationName:
 *           type: string
 *         Level:
 *           type: string
 *         Description:
 *           type: string
 */

module.exports = router;