// routes/safetyRoutes.js
const express = require('express');
const router = express.Router();
const safetyController = require('../../controllers/HR/safetyController');
const upload = require('../../middleware/upload');

/**
 * @swagger
 * tags:
 *   name: PPE Management
 *   description: Personal Protective Equipment management
 */

/**
 * @swagger
 * tags:
 *   name: Safety Training
 *   description: Employee safety training and certifications
 */

/**
 * @swagger
 * tags:
 *   name: Accident/Incident
 *   description: Workplace accident and incident reporting
 */

/**
 * @swagger
 * tags:
 *   name: Medical Records
 *   description: Employee medical checkups and health records
 */

/**
 * @swagger
 * tags:
 *   name: Dashboard & Reports
 *   description: Safety dashboard and reporting
 */

// PPE Routes

/**
 * @swagger
 * /api/safety/ppe:
 *   post:
 *     summary: Create a new PPE item
 *     tags: [PPE Management]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - category
 *               - validityDays
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Safety Helmet"
 *               category:
 *                 type: string
 *                 enum: [Head, Eye, Hearing, Hand, Foot, Body, Respiratory, Fall Protection]
 *                 example: "Head"
 *               validityDays:
 *                 type: integer
 *                 example: 365
 *               description:
 *                 type: string
 *                 example: "Industrial safety helmet with chin strap"
 *     responses:
 *       201:
 *         description: PPE created successfully
 *       400:
 *         description: Bad request
 */
router.post('/ppe', safetyController.createPPE);

/**
 * @swagger
 * /api/safety/ppe:
 *   get:
 *     summary: Get all PPE items
 *     tags: [PPE Management]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of PPE items
 */
router.get('/ppe', safetyController.getAllPPE);


/**
 * @swagger
 * /api/safety/ppe/{id}:
 *   put:
 *     summary: Update PPE item
 *     tags: [PPE Management]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: PPE ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               category:
 *                 type: string
 *               validityDays:
 *                 type: integer
 *               description:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: PPE updated successfully
 *       404:
 *         description: PPE not found
 */
router.put('/ppe/:id', safetyController.updatePPE);

/**
 * @swagger
 * /api/safety/ppe/{id}:
 *   delete:
 *     summary: Delete PPE item
 *     tags: [PPE Management]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: PPE ID
 *     responses:
 *       200:
 *         description: PPE deleted successfully
 *       404:
 *         description: PPE not found
 */
router.delete('/ppe/:id', safetyController.deletePPE);

// PPE Issuance Routes

/**
 * @swagger
 * /api/safety/ppe/issue:
 *   post:
 *     summary: Issue PPE to employee
 *     tags: [PPE Management]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - employee
 *               - ppe
 *               - condition
 *               - issuedBy
 *             properties:
 *               employee:
 *                 type: string
 *                 example: "60d5ec9b8b3d8a001c8e4f1a"
 *               ppe:
 *                 type: string
 *                 example: "60d5ec9b8b3d8a001c8e4f2b"
 *               condition:
 *                 type: string
 *                 enum: [New, Good, Fair, Poor, Damaged]
 *                 example: "New"
 *               issuedBy:
 *                 type: string
 *                 example: "60d5ec9b8b3d8a001c8e4f3c"
 *               remarks:
 *                 type: string
 *                 example: "Issued for welding department"
 *     responses:
 *       201:
 *         description: PPE issued successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: PPE or Employee not found
 */
router.post('/ppe/issue', safetyController.issuePPE);

/**
 * @swagger
 * /api/safety/ppe/issuance:
 *   get:
 *     summary: Get all PPE issuances
 *     tags: [PPE Management]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Expired, Returned, Damaged, Lost]
 *         description: Filter by issuance status
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by issue date from
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by issue date to
 *       - in: query
 *         name: employee
 *         schema:
 *           type: string
 *         description: Filter by employee ID
 *     responses:
 *       200:
 *         description: List of PPE issuances
 */
router.get('/ppe/issuance', safetyController.getAllIssuances);

/**
 * @swagger
 * /api/safety/ppe/expiring-soon:
 *   get:
 *     summary: Get PPE items expiring soon (within 30 days)
 *     tags: [PPE Management]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to check for expiry
 *     responses:
 *       200:
 *         description: List of expiring PPE items
 */
router.get('/ppe/expiring-soon', safetyController.getExpiringPPE);

/**
 * @swagger
 * /api/safety/ppe/{id}:
 *   get:
 *     summary: Get PPE by ID
 *     tags: [PPE Management]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: PPE ID
 *     responses:
 *       200:
 *         description: PPE details
 *       404:
 *         description: PPE not found
 */
router.get('/ppe/:id', safetyController.getPPEById);

/**
 * @swagger
 * /api/safety/employee/{employeeId}/ppe:
 *   get:
 *     summary: Get PPE issued to specific employee
 *     tags: [PPE Management]
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by PPE status
 *     responses:
 *       200:
 *         description: Employee's PPE list
 *       404:
 *         description: Employee not found
 */
router.get('/employee/:employeeId/ppe', safetyController.getEmployeePPE);

/**
 * @swagger
 * /api/safety/ppe/issuance/{id}/return:
 *   put:
 *     summary: Return PPE item
 *     tags: [PPE Management]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: PPE Issuance ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - returnCondition
 *             properties:
 *               returnCondition:
 *                 type: string
 *                 enum: [Good, Fair, Poor, Damaged]
 *                 example: "Fair"
 *               remarks:
 *                 type: string
 *                 example: "Returned after resignation"
 *     responses:
 *       200:
 *         description: PPE returned successfully
 *       404:
 *         description: PPE issuance not found
 */
router.put('/ppe/issuance/:id/return', safetyController.returnPPE);

// Training Routes

/**
 * @swagger
 * /api/safety/training:
 *   post:
 *     summary: Create a new safety training program
 *     tags: [Safety Training]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - category
 *               - durationHours
 *               - validityMonths
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Fire Safety Training"
 *               description:
 *                 type: string
 *                 example: "Training on fire prevention and emergency response"
 *               category:
 *                 type: string
 *                 enum: [General, Fire Safety, Machine Safety, Chemical Safety, Electrical Safety, First Aid, Emergency Response]
 *                 example: "Fire Safety"
 *               durationHours:
 *                 type: number
 *                 example: 4
 *               validityMonths:
 *                 type: integer
 *                 example: 12
 *               isMandatory:
 *                 type: boolean
 *                 example: true
 *               department:
 *                 type: string
 *                 example: "60d5ec9b8b3d8a001c8e4f5d"
 *     responses:
 *       201:
 *         description: Training created successfully
 *       400:
 *         description: Bad request
 */
router.post('/training', safetyController.createTraining);

// Update safety training
/**
 * @swagger
 * /api/safety/training/{id}:
 *   put:
 *     summary: Update an existing safety training program
 *     tags: [Safety Training]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Training ID
 *         example: "60d5ec9b8b3d8a001c8e4f1a"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Title of the training program
 *                 example: "Advanced Fire Safety Training"
 *               description:
 *                 type: string
 *                 description: Detailed description of the training
 *                 example: "Advanced training on fire prevention and emergency response"
 *               category:
 *                 type: string
 *                 enum: [General, Fire Safety, Machine Safety, Material Handling, Chemical Safety, Safety Compliance, Electrical Safety, First Aid, Emergency Response]
 *                 description: Category of the training
 *                 example: "Fire Safety"
 *               durationHours:
 *                 type: number
 *                 description: Duration in hours
 *                 example: 6
 *               validityMonths:
 *                 type: integer
 *                 description: Validity period in months
 *                 example: 24
 *               isMandatory:
 *                 type: boolean
 *                 description: Whether training is mandatory
 *                 example: true
 *               department:
 *                 type: string
 *                 description: Department ID (optional)
 *                 example: "60d5ec9b8b3d8a001c8e4f5d"
 *               isActive:
 *                 type: boolean
 *                 description: Whether training is active
 *                 example: true
 *     responses:
 *       200:
 *         description: Training updated successfully
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
 *       400:
 *         description: Bad request - validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Validation failed: durationHours must be at least 0.5"
 *       404:
 *         description: Training not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Safety training not found"
 */
router.put('/training/:id', safetyController.updateTraining);

// Delete safety training
/**
 * @swagger
 * /api/safety/training/{id}:
 *   delete:
 *     summary: Delete a safety training program
 *     tags: [Safety Training]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Training ID
 *         example: "60d5ec9b8b3d8a001c8e4f1a"
 *     responses:
 *       200:
 *         description: Training deleted successfully
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
 *                   example: "Safety training deleted successfully"
 *                 data:
 *                   type: object
 *                   example: {}
 *       404:
 *         description: Training not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Safety training not found"
 *       400:
 *         description: Invalid ID format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Invalid training ID format"
 */
router.delete('/training/:id', safetyController.deleteTraining);

/**
 * @swagger
 * /api/safety/training:
 *   get:
 *     summary: Get all training programs
 *     tags: [Safety Training]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: isMandatory
 *         schema:
 *           type: boolean
 *         description: Filter by mandatory status
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Filter by department
 *     responses:
 *       200:
 *         description: List of training programs
 */
router.get('/training', safetyController.getAllTraining);

/**
 * @swagger
 * /api/safety/training/assign:
 *   post:
 *     summary: Assign training to employee
 *     tags: [Safety Training]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - employee
 *               - training
 *               - trainer
 *             properties:
 *               employee:
 *                 type: string
 *                 example: "60d5ec9b8b3d8a001c8e4f1a"
 *               training:
 *                 type: string
 *                 example: "60d5ec9b8b3d8a001c8e4f2c"
 *               trainer:
 *                 type: string
 *                 example: "Safety Officer John"
 *               trainingDate:
 *                 type: string
 *                 format: date
 *                 example: "2024-01-15"
 *               certificateNumber:
 *                 type: string
 *                 example: "CERT-2024-001"
 *               score:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *                 example: 85
 *     responses:
 *       201:
 *         description: Training assigned successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Training or Employee not found
 */
router.post('/training/assign', safetyController.assignTraining);

/**
 * @swagger
 * /api/safety/employee/{employeeId}/training:
 *   get:
 *     summary: Get training records for specific employee
 *     tags: [Safety Training]
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Completed, Pending, Failed, Expired]
 *         description: Filter by training status
 *     responses:
 *       200:
 *         description: Employee's training records
 *       404:
 *         description: Employee not found
 */
router.get('/employee/:employeeId/training', safetyController.getEmployeeTraining);

/**
 * @swagger
 * /api/safety/training/expiring-soon:
 *   get:
 *     summary: Get training certifications expiring soon
 *     tags: [Safety Training]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to check for expiry
 *     responses:
 *       200:
 *         description: List of expiring training certifications
 */
router.get('/training/expiring-soon', safetyController.getExpiringTraining);

// Accident/Incident Routes

/**
 * @swagger
 * /api/safety/accidents:
 *   post:
 *     summary: Report a new accident/incident
 *     tags: [Accident/Incident]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - employee
 *               - location
 *               - injuryType
 *               - severity
 *               - description
 *               - reportedBy
 *             properties:
 *               employee:
 *                 type: string
 *                 example: "60d5ec9b8b3d8a001c8e4f1a"
 *               date:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-01-15T09:30:00Z"
 *               location:
 *                 type: string
 *                 example: "Welding Section - Line 3"
 *               department:
 *                 type: string
 *                 example: "60d5ec9b8b3d8a001c8e4f5d"
 *               machineId:
 *                 type: string
 *                 example: "MACH-001"
 *               machineName:
 *                 type: string
 *                 example: "MIG Welding Machine"
 *               injuryType:
 *                 type: string
 *                 enum: [Cut, Burn, Fracture, Sprain, Electric Shock, Eye Injury, Hearing Loss, Respiratory, Chemical Exposure, Other]
 *                 example: "Burn"
 *               bodyPartAffected:
 *                 type: string
 *                 example: "Right Hand"
 *               severity:
 *                 type: string
 *                 enum: [Minor, Moderate, Major, Fatal]
 *                 example: "Minor"
 *               description:
 *                 type: string
 *                 example: "Minor burn on right hand while welding"
 *               immediateAction:
 *                 type: string
 *                 example: "First aid applied, burn cream administered"
 *               rootCause:
 *                 type: string
 *                 example: "Improper PPE usage"
 *               reportedBy:
 *                 type: string
 *                 example: "60d5ec9b8b3d8a001c8e4f3c"
 *               lostDays:
 *                 type: integer
 *                 example: 0
 *     responses:
 *       201:
 *         description: Accident reported successfully
 *       400:
 *         description: Bad request
 */
router.post('/accidents', safetyController.createAccident);

/**
 * @swagger
 * /api/safety/accidents:
 *   get:
 *     summary: Get all accidents/incidents
 *     tags: [Accident/Incident]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by accident date from
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by accident date to
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [Minor, Moderate, Major, Fatal]
 *         description: Filter by severity
 *       - in: query
 *         name: investigationStatus
 *         schema:
 *           type: string
 *           enum: [Open, Under Investigation, Closed, Resolved]
 *         description: Filter by investigation status
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Filter by department
 *     responses:
 *       200:
 *         description: List of accidents/incidents
 */
router.get('/accidents', safetyController.getAllAccidents);

/**
 * @swagger
 * /api/safety/employee/{employeeId}/accidents:
 *   get:
 *     summary: Get accidents for specific employee
 *     tags: [Accident/Incident]
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *     responses:
 *       200:
 *         description: Employee's accident records
 *       404:
 *         description: Employee not found
 */
router.get('/employee/:employeeId/accidents', safetyController.getEmployeeAccidents);

/**
 * @swagger
 * /api/safety/accidents/{id}/investigate:
 *   put:
 *     summary: Update accident investigation details
 *     tags: [Accident/Incident]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Accident ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rootCause:
 *                 type: string
 *                 example: "Operator not wearing proper gloves"
 *               correctiveAction:
 *                 type: string
 *                 example: "Retraining on PPE usage"
 *               preventiveAction:
 *                 type: string
 *                 example: "Regular safety audits"
 *               investigationStatus:
 *                 type: string
 *                 enum: [Open, Under Investigation, Closed, Resolved]
 *                 example: "Closed"
 *               investigationDate:
 *                 type: string
 *                 format: date
 *                 example: "2024-01-16"
 *               investigationBy:
 *                 type: string
 *                 example: "60d5ec9b8b3d8a001c8e4f3c"
 *               costIncurred:
 *                 type: number
 *                 example: 500
 *     responses:
 *       200:
 *         description: Investigation updated successfully
 *       404:
 *         description: Accident not found
 */
router.put('/accidents/:id/investigate', safetyController.updateInvestigation);

/**
 * @swagger
 * /api/safety/accidents/stats:
 *   get:
 *     summary: Get accident statistics
 *     tags: [Accident/Incident]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for statistics
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for statistics
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Filter by department
 *     responses:
 *       200:
 *         description: Accident statistics
 */
router.get('/accidents/stats', safetyController.getAccidentStats);

/**
 * @swagger
 * /api/safety/medical-records:
 *   post:
 *     summary: Create a new medical record
 *     tags: [Medical Records]
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - employee
 *               - checkupType
 *               - doctorName
 *               - fitnessStatus
 *             properties:
 *               # Basic Information
 *               employee:
 *                 type: string
 *                 description: Employee ID
 *                 example: "60d5ec9b8b3d8a001c8e4f1a"
 *               checkupDate:
 *                 type: string
 *                 format: date
 *                 description: Date of checkup
 *                 example: "2024-01-15"
 *               checkupType:
 *                 type: string
 *                 enum: [Pre-Employment, Annual, Periodic, Post-Accident, Return to Work, Special]
 *                 description: Type of medical checkup
 *                 example: "Annual"
 *               doctorName:
 *                 type: string
 *                 description: Name of the doctor
 *                 example: "Dr. Sharma"
 *               clinicName:
 *                 type: string
 *                 description: Name of the clinic/hospital
 *                 example: "Factory Medical Center"
 *               
 *               # Vital Signs
 *               bloodPressure:
 *                 type: string
 *                 description: Blood pressure reading
 *                 example: "120/80"
 *               heartRate:
 *                 type: integer
 *                 description: Heart rate in BPM
 *                 example: 72
 *               temperature:
 *                 type: number
 *                 format: float
 *                 description: Body temperature in Fahrenheit
 *                 example: 98.6
 *               respiratoryRate:
 *                 type: integer
 *                 description: Respiratory rate per minute
 *                 example: 16
 *               height:
 *                 type: number
 *                 format: float
 *                 description: Height in cm
 *                 example: 175
 *               weight:
 *                 type: number
 *                 format: float
 *                 description: Weight in kg
 *                 example: 70
 *               bmi:
 *                 type: number
 *                 format: float
 *                 description: Body Mass Index
 *                 example: 22.9
 *               
 *               # Medical Examination
 *               visionLeft:
 *                 type: string
 *                 description: Left eye vision test result
 *                 example: "6/6"
 *               visionRight:
 *                 type: string
 *                 description: Right eye vision test result
 *                 example: "6/6"
 *               hearingTest:
 *                 type: string
 *                 description: Hearing test result
 *                 example: "Normal"
 *               respiratoryTest:
 *                 type: string
 *                 description: Respiratory test result
 *                 example: "Normal"
 *               musculoskeletal:
 *                 type: string
 *                 description: Musculoskeletal examination result
 *                 example: "Normal"
 *               neurological:
 *                 type: string
 *                 description: Neurological examination result
 *                 example: "Normal"
 *               
 *               # Lab Results
 *               bloodGroup:
 *                 type: string
 *                 enum: [A+, A-, B+, B-, AB+, AB-, O+, O-]
 *                 description: Blood group
 *                 example: "O+"
 *               hemoglobin:
 *                 type: number
 *                 format: float
 *                 description: Hemoglobin level
 *                 example: 14.5
 *               sugarFasting:
 *                 type: number
 *                 format: float
 *                 description: Fasting blood sugar
 *                 example: 95
 *               sugarPostPrandial:
 *                 type: number
 *                 format: float
 *                 description: Post prandial blood sugar
 *                 example: 120
 *               cholesterol:
 *                 type: number
 *                 format: float
 *                 description: Cholesterol level
 *                 example: 180
 *               
 *               # Fitness Status
 *               fitnessStatus:
 *                 type: string
 *                 enum: [Fit, Fit with Restrictions, Unfit, Temporarily Unfit]
 *                 description: Fitness status
 *                 example: "Fit"
 *               restrictions:
 *                 type: array
 *                 description: Work restrictions
 *                 items:
 *                   type: string
 *                   enum: [No Heavy Lifting, No Standing > 4hrs, No Night Shift, No Machine Operation, Limited Mobility, Other]
 *                 example: ["No Heavy Lifting"]
 *               
 *               # Additional Information
 *               recommendations:
 *                 type: string
 *                 description: Doctor's recommendations
 *                 example: "Regular eye checkup recommended"
 *               remarks:
 *                 type: string
 *                 description: Additional remarks
 *                 example: "Employee in good health"
 *               reportFile:
 *                 type: string
 *                 format: binary
 *                 description: Medical report PDF/Image file (max 5MB)
 *               nextCheckupDate:
 *                 type: string
 *                 format: date
 *                 description: Next scheduled checkup date
 *                 example: "2024-12-15"
 *     responses:
 *       201:
 *         description: Medical record created successfully
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
 *                 error:
 *                   type: string
 *                   example: "Validation failed: employee is required"
 */
router.post('/medical-records', upload.single('reportFile'), safetyController.createMedicalRecord);

/**
 * @swagger
 * /api/safety/medical-records/{id}:
 *   put:
 *     summary: Update an existing medical record
 *     tags: [Medical Records]
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Medical record ID
 *         example: "60d5ec9b8b3d8a001c8e4f1a"
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               # Basic Information
 *               employee:
 *                 type: string
 *                 description: Employee ID
 *                 example: "60d5ec9b8b3d8a001c8e4f1a"
 *               checkupDate:
 *                 type: string
 *                 format: date
 *                 description: Date of checkup
 *                 example: "2024-01-15"
 *               checkupType:
 *                 type: string
 *                 enum: [Pre-Employment, Annual, Periodic, Post-Accident, Return to Work, Special]
 *                 description: Type of medical checkup
 *                 example: "Annual"
 *               doctorName:
 *                 type: string
 *                 description: Name of the doctor
 *                 example: "Dr. Sharma"
 *               clinicName:
 *                 type: string
 *                 description: Name of the clinic/hospital
 *                 example: "Factory Medical Center"
 *               
 *               # Vital Signs
 *               bloodPressure:
 *                 type: string
 *                 description: Blood pressure reading
 *                 example: "120/80"
 *               heartRate:
 *                 type: integer
 *                 description: Heart rate in BPM
 *                 example: 72
 *               temperature:
 *                 type: number
 *                 format: float
 *                 description: Body temperature in Fahrenheit
 *                 example: 98.6
 *               respiratoryRate:
 *                 type: integer
 *                 description: Respiratory rate per minute
 *                 example: 16
 *               height:
 *                 type: number
 *                 format: float
 *                 description: Height in cm
 *                 example: 175
 *               weight:
 *                 type: number
 *                 format: float
 *                 description: Weight in kg
 *                 example: 70
 *               bmi:
 *                 type: number
 *                 format: float
 *                 description: Body Mass Index
 *                 example: 22.9
 *               
 *               # Medical Examination
 *               visionLeft:
 *                 type: string
 *                 description: Left eye vision test result
 *                 example: "6/6"
 *               visionRight:
 *                 type: string
 *                 description: Right eye vision test result
 *                 example: "6/6"
 *               hearingTest:
 *                 type: string
 *                 description: Hearing test result
 *                 example: "Normal"
 *               respiratoryTest:
 *                 type: string
 *                 description: Respiratory test result
 *                 example: "Normal"
 *               musculoskeletal:
 *                 type: string
 *                 description: Musculoskeletal examination result
 *                 example: "Normal"
 *               neurological:
 *                 type: string
 *                 description: Neurological examination result
 *                 example: "Normal"
 *               
 *               # Lab Results
 *               bloodGroup:
 *                 type: string
 *                 enum: [A+, A-, B+, B-, AB+, AB-, O+, O-]
 *                 description: Blood group
 *                 example: "O+"
 *               hemoglobin:
 *                 type: number
 *                 format: float
 *                 description: Hemoglobin level
 *                 example: 14.5
 *               sugarFasting:
 *                 type: number
 *                 format: float
 *                 description: Fasting blood sugar
 *                 example: 95
 *               sugarPostPrandial:
 *                 type: number
 *                 format: float
 *                 description: Post prandial blood sugar
 *                 example: 120
 *               cholesterol:
 *                 type: number
 *                 format: float
 *                 description: Cholesterol level
 *                 example: 180
 *               
 *               # Fitness Status
 *               fitnessStatus:
 *                 type: string
 *                 enum: [Fit, Fit with Restrictions, Unfit, Temporarily Unfit]
 *                 description: Fitness status
 *                 example: "Fit"
 *               restrictions:
 *                 type: array
 *                 description: Work restrictions
 *                 items:
 *                   type: string
 *                   enum: [No Heavy Lifting, No Standing > 4hrs, No Night Shift, No Machine Operation, Limited Mobility, Other]
 *                 example: ["No Heavy Lifting"]
 *               
 *               # Additional Information
 *               recommendations:
 *                 type: string
 *                 description: Doctor's recommendations
 *                 example: "Regular eye checkup recommended"
 *               remarks:
 *                 type: string
 *                 description: Additional remarks
 *                 example: "Employee in good health"
 *               reportFile:
 *                 type: string
 *                 format: binary
 *                 description: Medical report PDF/Image file (max 5MB)
 *               nextCheckupDate:
 *                 type: string
 *                 format: date
 *                 description: Next scheduled checkup date
 *                 example: "2024-12-15"
 *     responses:
 *       200:
 *         description: Medical record updated successfully
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
 *       400:
 *         description: Bad request - validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Validation failed: doctorName is required"
 *       404:
 *         description: Medical record not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Medical record not found"
 */
router.put('/medical-records/:id', upload.single('reportFile'), safetyController.updateMedicalRecord);

/**
 * @swagger
 * /api/safety/medical-records/{id}:
 *   delete:
 *     summary: Delete a medical record
 *     tags: [Medical Records]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Medical record ID
 *         example: "60d5ec9b8b3d8a001c8e4f1a"
 *     responses:
 *       200:
 *         description: Medical record deleted successfully
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
 *                   example: "Medical record deleted successfully"
 *                 data:
 *                   type: object
 *                   example: {}
 *       404:
 *         description: Medical record not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Medical record not found"
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
 *                 error:
 *                   type: string
 *                   example: "Invalid ID format"
 */
router.delete('/medical-records/:id', safetyController.deleteMedicalRecord);

/**
 * @swagger
 * /api/safety/medical-records:
 *   get:
 *     summary: Get all medical records
 *     tags: [Medical Records]
 *     parameters:
 *       - in: query
 *         name: checkupType
 *         schema:
 *           type: string
 *         description: Filter by checkup type
 *       - in: query
 *         name: fitnessStatus
 *         schema:
 *           type: string
 *         description: Filter by fitness status
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by checkup date from
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by checkup date to
 *     responses:
 *       200:
 *         description: List of medical records
 */
router.get('/medical-records', safetyController.getAllMedicalRecords);

/**
 * @swagger
 * /api/safety/employee/{employeeId}/medical-records:
 *   get:
 *     summary: Get medical records for specific employee
 *     tags: [Medical Records]
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *     responses:
 *       200:
 *         description: Employee's medical records
 *       404:
 *         description: Employee not found
 */
router.get('/employee/:employeeId/medical-records', safetyController.getEmployeeMedicalRecords);

/**
 * @swagger
 * /api/safety/medical-records/upcoming-checkups:
 *   get:
 *     summary: Get upcoming medical checkups
 *     tags: [Medical Records]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to check for upcoming checkups
 *     responses:
 *       200:
 *         description: List of upcoming medical checkups
 */
router.get('/medical-records/upcoming-checkups', safetyController.getUpcomingCheckups);

// Dashboard & Reports Routes

/**
 * @swagger
 * /api/safety/dashboard/stats:
 *   get:
 *     summary: Get safety dashboard statistics
 *     tags: [Dashboard & Reports]
 *     responses:
 *       200:
 *         description: Dashboard statistics
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
 *                     activePPE:
 *                       type: integer
 *                       description: Number of active PPE items
 *                     expiringPPE:
 *                       type: integer
 *                       description: Number of PPE items expiring soon
 *                     recentAccidents:
 *                       type: integer
 *                       description: Number of accidents in last 30 days
 *                     pendingInvestigations:
 *                       type: integer
 *                       description: Number of pending accident investigations
 *                     upcomingCheckups:
 *                       type: integer
 *                       description: Number of upcoming medical checkups
 *                     activeTrainings:
 *                       type: integer
 *                       description: Number of active training certifications
 */
router.get('/dashboard/stats', safetyController.getDashboardStats);

module.exports = router;