const express = require('express');
const router  = express.Router();
const {
  getRawMaterials,
  getCurrentRates,
  getRawMaterial,
  createRawMaterial,
  updateRawMaterial,
  deleteRawMaterial,
  getRawMaterialsDropdown,
  bulkCreateRawMaterials,
} = require('../../controllers/CRM/rawMaterialController');
const { protect } = require('../../middleware/authMiddleware');

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Raw Materials
 *   description: Raw Material Master — grades, current market rates, scrap rates, transport costs
 */

/**
 * @swagger
 * components:
 *   schemas:
 *
 *     RawMaterial:
 *       type: object
 *       properties:
 *         _id:                    { type: string }
 *         MaterialName:           { type: string,  example: "Copper" }
 *         Grade:                  { type: string,  example: "C11000" }
 *         Description:            { type: string,  example: "Electrolytic Tough Pitch Copper" }
 *         RatePerKG:              { type: number,  example: 850.50,  description: "Base ₹/kg market rate" }
 *         profile_conversion_rate: { type: number, example: 60,     description: "₹/kg for profile conversion. Auto-added to total_rm_rate." }
 *         total_rm_rate:          { type: number,  example: 910.50,  description: "Auto-computed: RatePerKG + profile_conversion_rate" }
 *         ScrapPercentage:        { type: number,  example: 5 }
 *         scrap_rate_per_kg:      { type: number,  example: 42.53,   description: "Auto-computed from ScrapPercentage if not provided" }
 *         TransportLossPercentage: { type: number, example: 2 }
 *         transport_rate_per_kg:  { type: number,  example: 17.01,   description: "Auto-computed from TransportLossPercentage if not provided" }
 *         EffectiveRate:          { type: number,  example: 972.04,  description: "Auto-computed: RatePerKG × (1 + (Scrap% + Transport%) / 100)" }
 *         DateEffective:          { type: string,  format: date,     example: "2025-03-20" }
 *         DateExpiry:             { type: string,  format: date,     example: null }
 *         density:                { type: number,  example: 8.96,    description: "g/cm³ — optional here, Item Master is primary source" }
 *         unit:                   { type: string,  enum: [Kg, Gram, Ton, Meter], example: "Kg" }
 *         IsActive:               { type: boolean, example: true }
 *         CreatedBy:
 *           type: object
 *           properties:
 *             _id:      { type: string }
 *             username: { type: string }
 *         createdAt: { type: string, format: date-time }
 *
 *     RawMaterialCreate:
 *       type: object
 *       required: [MaterialName, Grade, RatePerKG, DateEffective]
 *       properties:
 *         MaterialName:
 *           type: string
 *           example: "Copper"
 *           description: "Material family name. e.g. Copper, Aluminium, Mild Steel, EPDM Rubber"
 *         Grade:
 *           type: string
 *           example: "C11000"
 *           description: "Grade code. Must match rm_grade in Item Master for feasibility check to pass. Case-insensitive match."
 *         Description:
 *           type: string
 *           example: "Electrolytic Tough Pitch Copper — IS 191"
 *         RatePerKG:
 *           type: number
 *           example: 850.50
 *           description: "Current market ₹/kg base rate."
 *         profile_conversion_rate:
 *           type: number
 *           example: 60
 *           default: 0
 *           description: "₹/kg added for profile conversion. total_rm_rate = RatePerKG + this."
 *         ScrapPercentage:
 *           type: number
 *           example: 5
 *           default: 0
 *           description: "% scrap. scrap_rate_per_kg auto-computed as (RatePerKG × ScrapPercentage / 100) if not provided."
 *         scrap_rate_per_kg:
 *           type: number
 *           example: 42.53
 *           description: "Override auto-computed scrap rate if needed."
 *         TransportLossPercentage:
 *           type: number
 *           example: 2
 *           default: 0
 *           description: "% transport loss. transport_rate_per_kg auto-computed if not provided."
 *         transport_rate_per_kg:
 *           type: number
 *           example: 17.01
 *           description: "Override auto-computed transport rate if needed."
 *         DateEffective:
 *           type: string
 *           format: date
 *           example: "2025-03-20"
 *           description: "Date this rate is valid from. Always send today's date when entering new rates. System fetches latest by this field."
 *         DateExpiry:
 *           type: string
 *           format: date
 *           example: null
 *           description: "Leave null for open-ended rates."
 *         density:
 *           type: number
 *           example: 8.96
 *           description: "g/cm³ — optional. Item Master is primary source for density."
 *         unit:
 *           type: string
 *           enum: [Kg, Gram, Ton, Meter]
 *           default: "Kg"
 *         IsActive:
 *           type: boolean
 *           default: true
 *
 *     RawMaterialUpdate:
 *       type: object
 *       minProperties: 1
 *       description: All fields optional. Creating a new rate record is preferred over updating — keeps rate history intact.
 *       properties:
 *         RatePerKG:               { type: number }
 *         profile_conversion_rate: { type: number }
 *         ScrapPercentage:         { type: number }
 *         scrap_rate_per_kg:       { type: number }
 *         TransportLossPercentage: { type: number }
 *         transport_rate_per_kg:   { type: number }
 *         DateEffective:           { type: string, format: date }
 *         DateExpiry:              { type: string, format: date }
 *         density:                 { type: number }
 *         unit:                    { type: string, enum: [Kg, Gram, Ton, Meter] }
 *         IsActive:                { type: boolean }
 *
 *     RawMaterialDropdown:
 *       type: object
 *       properties:
 *         _id:                    { type: string }
 *         MaterialName:           { type: string }
 *         Grade:                  { type: string }
 *         RatePerKG:              { type: number }
 *         EffectiveRate:          { type: number }
 *         scrap_rate_per_kg:      { type: number }
 *         profile_conversion_rate: { type: number }
 *
 *   responses:
 *     RawMaterialNotFound:
 *       description: Raw material not found
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success: { type: boolean, example: false }
 *               message: { type: string,  example: "Raw material not found" }
 *     DuplicateRawMaterial:
 *       description: Raw material with this name and grade already exists
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success: { type: boolean, example: false }
 *               message: { type: string,  example: "Raw material with this name and grade already exists" }
 */

// ─────────────────────────────────────────────────────────────────────────────
// NAMED ROUTES — must be before /:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/raw-materials/current-rates:
 *   get:
 *     summary: Get latest active rate for every material+grade combination
 *     description: Uses aggregation to return only the most recent DateEffective record per MaterialName+Grade. This is what the feasibility check uses internally.
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current rates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { type: array, items: { $ref: '#/components/schemas/RawMaterial' } }
 */
router.get('/current-rates', getCurrentRates);

/**
 * @swagger
 * /api/raw-materials/dropdown:
 *   get:
 *     summary: Get active raw materials for dropdown selection
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Raw materials dropdown list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { type: array, items: { $ref: '#/components/schemas/RawMaterialDropdown' } }
 */
router.get('/dropdown', getRawMaterialsDropdown);

/**
 * @swagger
 * /api/raw-materials/bulk:
 *   post:
 *     summary: Bulk create or update raw material rates
 *     description: |
 *       Upserts by (MaterialName + Grade + DateEffective). Use this to import rate sheets.
 *       Each object in the array follows RawMaterialCreate schema.
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               $ref: '#/components/schemas/RawMaterialCreate'
 *           example:
 *             - MaterialName: "Copper"
 *               Grade: "C11000"
 *               RatePerKG: 855
 *               DateEffective: "2025-03-20"
 *               ScrapPercentage: 5
 *               IsActive: true
 *             - MaterialName: "Aluminium"
 *               Grade: "AA6063 T5"
 *               RatePerKG: 210
 *               DateEffective: "2025-03-20"
 *               ScrapPercentage: 3
 *               IsActive: true
 *     responses:
 *       200:
 *         description: Bulk operation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:  { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     matched:  { type: integer, example: 0 }
 *                     modified: { type: integer, example: 0 }
 *                     upserted: { type: integer, example: 2 }
 *                 message:  { type: string, example: "Bulk operation completed successfully" }
 */
router.post('/bulk', bulkCreateRawMaterials);

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/raw-materials:
 *   get:
 *     summary: Get all raw material records with pagination
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page,         schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit,        schema: { type: integer, default: 10 } }
 *       - { in: query, name: materialName, schema: { type: string },  description: "Filter by MaterialName (regex)" }
 *       - { in: query, name: grade,        schema: { type: string },  description: "Filter by Grade (regex)" }
 *       - { in: query, name: isActive,     schema: { type: boolean }, description: "Filter by IsActive" }
 *     responses:
 *       200:
 *         description: Raw materials list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:    { type: boolean, example: true }
 *                 data:       { type: array, items: { $ref: '#/components/schemas/RawMaterial' } }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:  { type: integer }
 *                     totalPages:   { type: integer }
 *                     totalItems:   { type: integer }
 *                     itemsPerPage: { type: integer }
 */
router.get('/', getRawMaterials);

/**
 * @swagger
 * /api/raw-materials/{id}:
 *   get:
 *     summary: Get single raw material by MongoDB _id
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Raw material detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/RawMaterial' }
 *       404:
 *         $ref: '#/components/responses/RawMaterialNotFound'
 */
router.get('/:id', getRawMaterial);

/**
 * @swagger
 * /api/raw-materials:
 *   post:
 *     summary: Create a new raw material rate record
 *     description: |
 *       **Auto-computed fields (do not send):**
 *       - `total_rm_rate` = RatePerKG + profile_conversion_rate
 *       - `scrap_rate_per_kg` = (RatePerKG × ScrapPercentage / 100) if scrap_rate_per_kg not provided
 *       - `transport_rate_per_kg` = (RatePerKG × TransportLossPercentage / 100) if not provided
 *       - `EffectiveRate` = RatePerKG × (1 + (ScrapPercentage + TransportLossPercentage) / 100)
 *
 *       **Feasibility check dependency:**
 *       `Grade` here must match `material_grade` in the lead's enquired_items (case-insensitive).
 *       Always set `IsActive: true` and `DateEffective` to today's date.
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RawMaterialCreate'
 *           examples:
 *             copper_c11000:
 *               summary: Copper C11000 — most common grade
 *               value:
 *                 MaterialName: "Copper"
 *                 Grade: "C11000"
 *                 Description: "Electrolytic Tough Pitch Copper IS 191"
 *                 RatePerKG: 855
 *                 profile_conversion_rate: 60
 *                 ScrapPercentage: 5
 *                 TransportLossPercentage: 2
 *                 DateEffective: "2025-03-20"
 *                 density: 8.96
 *                 unit: "Kg"
 *                 IsActive: true
 *             aluminium_6063:
 *               summary: Aluminium AA6063 T5
 *               value:
 *                 MaterialName: "Aluminium"
 *                 Grade: "AA6063 T5"
 *                 RatePerKG: 210
 *                 ScrapPercentage: 3
 *                 TransportLossPercentage: 1
 *                 DateEffective: "2025-03-20"
 *                 density: 2.70
 *                 unit: "Kg"
 *                 IsActive: true
 *             mild_steel:
 *               summary: Mild Steel IS2062 E250
 *               value:
 *                 MaterialName: "Mild Steel"
 *                 Grade: "IS2062 E250"
 *                 RatePerKG: 58
 *                 ScrapPercentage: 8
 *                 TransportLossPercentage: 2
 *                 DateEffective: "2025-03-20"
 *                 density: 7.85
 *                 unit: "Kg"
 *                 IsActive: true
 *             epdm_rubber:
 *               summary: EPDM Rubber 70 Shore A
 *               value:
 *                 MaterialName: "EPDM Rubber"
 *                 Grade: "EPDM 70 Shore A"
 *                 RatePerKG: 320
 *                 ScrapPercentage: 10
 *                 DateEffective: "2025-03-20"
 *                 density: 1.20
 *                 unit: "Kg"
 *                 IsActive: true
 *     responses:
 *       201:
 *         description: Raw material created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/RawMaterial' }
 *                 message: { type: string, example: "Raw material created successfully" }
 *       400:
 *         $ref: '#/components/responses/DuplicateRawMaterial'
 */
router.post('/', createRawMaterial);

/**
 * @swagger
 * /api/raw-materials/{id}:
 *   put:
 *     summary: Update raw material record
 *     description: |
 *       Prefer creating a new record with a new DateEffective to keep rate history.
 *       Only update if you made a data entry error.
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RawMaterialUpdate'
 *           example:
 *             RatePerKG: 860
 *             DateEffective: "2025-03-21"
 *     responses:
 *       200:
 *         description: Raw material updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/RawMaterial' }
 *                 message: { type: string, example: "Raw material updated successfully" }
 *       404:
 *         $ref: '#/components/responses/RawMaterialNotFound'
 */
router.put('/:id', updateRawMaterial);

/**
 * @swagger
 * /api/raw-materials/{id}:
 *   delete:
 *     summary: Soft-delete — sets IsActive=false
 *     tags: [Raw Materials]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Raw material deactivated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Raw material deactivated successfully" }
 *       404:
 *         $ref: '#/components/responses/RawMaterialNotFound'
 */
router.delete('/:id', deleteRawMaterial);

module.exports = router;