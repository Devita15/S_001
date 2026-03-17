// routes/holidayRoutes.js
const express = require('express');
const router = express.Router();
const holidayController = require('../controllers/holidayController');
const { protect } = require('../../middleware/authMiddleware');

router.use(protect);

/**
 * @swagger
 * /api/holidays:
 *   post:
 *     summary: Create holiday
 *     tags: [Holidays]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - Name
 *               - Date
 *               - Type
 *               - Year
 *             properties:
 *               Name:
 *                 type: string
 *                 example: "Republic Day"
 *               Date:
 *                 type: string
 *                 format: date
 *                 example: "2024-01-26"
 *               Type:
 *                 type: string
 *                 enum: [National, State, Festival, Optional, Company]
 *                 default: National
 *               Description:
 *                 type: string
 *                 example: "Indian Republic Day"
 *               Year:
 *                 type: number
 *                 example: 2024
 *               IsRecurring:
 *                 type: boolean
 *                 default: false
 *               ApplicableDepartments:
 *                 type: array
 *                 items:
 *                   type: string
 *               IsActive:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Holiday created successfully
 */
router.post('/', holidayController.createHoliday);

/**
 * @swagger
 * /api/holidays:
 *   get:
 *     summary: Get all holidays
 *     tags: [Holidays]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema:
 *           type: number
 *         description: Filter by year
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [National, State, Festival, Optional, Company]
 *         description: Filter by holiday type
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Holidays retrieved successfully
 */
router.get('/', holidayController.getHolidays);

/**
 * @swagger
 * /api/holidays/{id}:
 *   put:
 *     summary: Update holiday
 *     tags: [Holidays]
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               Name:
 *                 type: string
 *               Date:
 *                 type: string
 *                 format: date
 *               Type:
 *                 type: string
 *               Description:
 *                 type: string
 *               IsActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Holiday updated successfully
 */
router.put('/:id', holidayController.updateHoliday);

/**
 * @swagger
 * /api/holidays/{id}:
 *   delete:
 *     summary: Delete holiday
 *     tags: [Holidays]
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
 *         description: Holiday deleted successfully
 */
router.delete('/:id', holidayController.deleteHoliday);

/**
 * @swagger
 * /api/holidays/check/{date}:
 *   get:
 *     summary: Check if date is holiday
 *     tags: [Holidays]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         example: "2024-01-26"
 *     responses:
 *       200:
 *         description: Holiday check completed
 */
router.get('/check/:date', holidayController.checkHoliday);

module.exports = router;