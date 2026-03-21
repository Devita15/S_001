'use strict';

const express     = require('express');
const router      = express.Router();
const nc          = require('../../controllers/CRM/Leadnotificationcontroller');
const { protect } = require('../../middleware/authMiddleware');

// All routes require authentication
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Lead Notifications
 *   description: CRM overdue follow-up notifications — generated daily by CRON at 8AM IST
 */

/**
 * @swagger
 * components:
 *   schemas:
 *
 *     LeadNotification:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         type:
 *           type: string
 *           enum: [OVERDUE_FOLLOWUP]
 *           example: "OVERDUE_FOLLOWUP"
 *         title:
 *           type: string
 *           example: "Follow-up Overdue"
 *         message:
 *           type: string
 *           example: "Follow-up overdue for Siemens India Ltd (LEAD-202503-0001)"
 *         is_read:
 *           type: boolean
 *           example: false
 *         due_date:
 *           type: string
 *           format: date-time
 *           example: "2025-03-10T00:00:00.000Z"
 *         lead_id:
 *           type: object
 *           nullable: true
 *           properties:
 *             lead_id:             { type: string,  example: "LEAD-202503-0001" }
 *             company_name:        { type: string,  example: "Siemens India Ltd" }
 *             subject:             { type: string,  example: "Copper Busbar 1000A enquiry" }
 *             status:              { type: string,  example: "Qualified" }
 *             next_follow_up_date: { type: string,  format: date-time }
 *             priority:            { type: string,  example: "High" }
 *         assigned_to:
 *           type: object
 *           nullable: true
 *           properties:
 *             first_name: { type: string, example: "Rahul" }
 *             last_name:  { type: string, example: "Sharma" }
 *             email:      { type: string, example: "rahul@company.com" }
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/lead-notifications/unread-count
// Must be before /:id route
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/lead-notifications/unread-count:
 *   get:
 *     summary: Get total unread notification count — for navbar badge
 *     description: |
 *       Lightweight endpoint — returns just the count.
 *       Call this on page load to show the red badge number on the bell icon.
 *     tags: [Lead Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:      { type: boolean, example: true }
 *                 unread_count: { type: integer, example: 7 }
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/unread-count', nc.getUnreadCount);


// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/lead-notifications/mark-all-read
// Must be before /:id route
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/lead-notifications/mark-all-read:
 *   put:
 *     summary: Mark ALL unread notifications as read
 *     description: |
 *       Marks every unread overdue follow-up notification as read globally.
 *       Useful for managers who want to clear the notification panel in one click.
 *     tags: [Lead Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string,  example: "7 notifications marked as read" }
 *                 updated: { type: integer, example: 7 }
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.put('/mark-all-read', nc.markAllRead);


// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/lead-notifications/clear-all-read
// Must be before /:id route
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/lead-notifications/clear-all-read:
 *   delete:
 *     summary: Delete all read notifications — cleanup
 *     description: |
 *       Permanently deletes all notifications that are already marked as read.
 *       Use this to keep the notifications collection clean.
 *       Unread notifications are NOT affected.
 *     tags: [Lead Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Read notifications deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string,  example: "12 read notifications cleared" }
 *                 deleted: { type: integer, example: 12 }
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.delete('/clear-all-read', nc.clearAllRead);


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/lead-notifications
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/lead-notifications:
 *   get:
 *     summary: Get all overdue follow-up notifications — visible to everyone
 *     description: |
 *       Returns all CRM overdue follow-up notifications.
 *       Everyone in the system sees all notifications.
 *
 *       **Optional filters:**
 *       - `is_read` — filter read or unread
 *       - `assigned_to` — filter by salesperson ObjectId
 *       - `from_date` / `to_date` — filter by creation date
 *
 *       Response includes `unread_count` for navbar badge update.
 *     tags: [Lead Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page,        schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit,       schema: { type: integer, default: 20, maximum: 100 } }
 *       - { in: query, name: is_read,     schema: { type: boolean }, description: "true = read only, false = unread only" }
 *       - { in: query, name: assigned_to, schema: { type: string },  description: "Employee ObjectId to filter by salesperson" }
 *       - { in: query, name: from_date,   schema: { type: string, format: date } }
 *       - { in: query, name: to_date,     schema: { type: string, format: date } }
 *     responses:
 *       200:
 *         description: Notification list with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 unread_count:
 *                   type: integer
 *                   example: 5
 *                   description: "Total unread count — use for navbar badge"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/LeadNotification'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:  { type: integer, example: 1 }
 *                     limit: { type: integer, example: 20 }
 *                     total: { type: integer, example: 5 }
 *                     pages: { type: integer, example: 1 }
 *             examples:
 *               with_data:
 *                 summary: Response with notifications
 *                 value:
 *                   success: true
 *                   unread_count: 2
 *                   data:
 *                     - _id: "64f8e9b7a1b2c3d4e5f6a7b8"
 *                       type: "OVERDUE_FOLLOWUP"
 *                       title: "Follow-up Overdue"
 *                       message: "Follow-up overdue for Siemens India Ltd (LEAD-202503-0001)"
 *                       is_read: false
 *                       due_date: "2025-03-10T00:00:00.000Z"
 *                       lead_id:
 *                         lead_id: "LEAD-202503-0001"
 *                         company_name: "Siemens India Ltd"
 *                         status: "Qualified"
 *                         priority: "High"
 *                       assigned_to:
 *                         first_name: "Rahul"
 *                         last_name: "Sharma"
 *                         email: "rahul@company.com"
 *                   pagination:
 *                     page: 1
 *                     limit: 20
 *                     total: 2
 *                     pages: 1
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', nc.getAllNotifications);


// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/lead-notifications/:id/read
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/lead-notifications/{id}/read:
 *   put:
 *     summary: Mark a single notification as read
 *     tags: [Lead Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Notification MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Notification marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/LeadNotification' }
 *       404:
 *         description: Notification not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string,  example: "Notification not found" }
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.put('/:id/read', nc.markOneRead);


// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/lead-notifications/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/lead-notifications/{id}:
 *   delete:
 *     summary: Delete a single notification permanently
 *     tags: [Lead Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Notification MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Notification deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string,  example: "Notification deleted" }
 *       404:
 *         description: Notification not found
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.delete('/:id', nc.deleteOne);


module.exports = router;