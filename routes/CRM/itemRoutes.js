const express = require('express');
const router  = express.Router();
const {
  getItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  getItemsDropdown,
} = require('../../controllers/CRM/itemController');
const { protect } = require('../../middleware/authMiddleware');

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Items
 *   description: Item / Part Master — single source of truth for every item in the system
 */

/**
 * @swagger
 * components:
 *   schemas:
 *
 *     Item:
 *       type: object
 *       properties:
 *         _id:              { type: string }
 *         item_id:          { type: string,  example: "ITEM-1710000000000" }
 *         part_no:          { type: string,  example: "BR-001" }
 *         part_description: { type: string,  example: "Copper Busbar 100x10mm Nickel Plated" }
 *         drawing_no:       { type: string,  example: "DRG-2024-001" }
 *         revision_no:      { type: string,  example: "A" }
 *         item_type:
 *           type: string
 *           enum: [Finished Good, Semi-Finished, Raw Material, Consumable, Tool, Packing]
 *           example: "Finished Good"
 *         item_category:    { type: string,  example: "Busbar" }
 *         rm_grade:         { type: string,  example: "C11000" }
 *         density:          { type: number,  example: 8.96, description: "g/cm³" }
 *         rm_source:        { type: string,  example: "Hindalco" }
 *         rm_type:          { type: string,  example: "Strip" }
 *         rm_spec:          { type: string,  example: "IS 191" }
 *         material:         { type: string,  example: "Copper" }
 *         item_no:          { type: string,  example: "CB71945" }
 *         strip_size:       { type: number,  example: 3660 }
 *         pitch:            { type: number,  example: 42 }
 *         no_of_cavity:     { type: number,  example: 1 }
 *         rm_rejection_percent:      { type: number, example: 2.0 }
 *         scrap_realisation_percent: { type: number, example: 98 }
 *         unit:
 *           type: string
 *           enum: [Nos, Kg, Meter, Set, Piece]
 *           example: "Nos"
 *         hsn_code:         { type: string,  example: "7407" }
 *         reorder_level:    { type: number,  example: 100 }
 *         reorder_qty:      { type: number,  example: 500 }
 *         min_stock:        { type: number,  example: 50 }
 *         max_stock:        { type: number,  example: 2000 }
 *         lead_time_days:   { type: number,  example: 7 }
 *         procurement_type:
 *           type: string
 *           enum: [Manufacture, Purchase, Subcontract, Free Issue]
 *           example: "Manufacture"
 *         is_active:        { type: boolean, example: true }
 *         created_by:
 *           type: object
 *           properties:
 *             _id:      { type: string }
 *             username: { type: string }
 *             email:    { type: string }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     ItemCreate:
 *       type: object
 *       required: [part_no, part_description, rm_grade, density, unit, hsn_code]
 *       properties:
 *         part_no:
 *           type: string
 *           example: "BR-001"
 *           description: "Auto-uppercased. Must be unique across the system."
 *         part_description:
 *           type: string
 *           example: "Copper Busbar 100x10mm Nickel Plated"
 *         drawing_no:
 *           type: string
 *           example: "DRG-2024-001"
 *         revision_no:
 *           type: string
 *           example: "A"
 *           default: "0"
 *         item_type:
 *           type: string
 *           enum: [Finished Good, Semi-Finished, Raw Material, Consumable, Tool, Packing]
 *           default: "Finished Good"
 *           example: "Finished Good"
 *           description: "Determines stock accounts and transaction rules."
 *         item_category:
 *           type: string
 *           example: "Busbar"
 *         rm_grade:
 *           type: string
 *           example: "C11000"
 *           description: "Must match a Grade in RawMaterial Master for feasibility check to pass."
 *         density:
 *           type: number
 *           example: 8.96
 *           description: "g/cm³. Copper=8.96, Aluminium=2.70, Steel=7.85, Rubber=1.20"
 *         rm_source:
 *           type: string
 *           example: "Hindalco"
 *         rm_type:
 *           type: string
 *           example: "Strip"
 *           description: "Strip | Profile | Sheet | Wire | Tube | Compound | Bar | Rod | Coil"
 *         rm_spec:
 *           type: string
 *           example: "IS 191"
 *         material:
 *           type: string
 *           example: "Copper"
 *           description: "Auto-set from rm_grade on save if not provided."
 *         item_no:
 *           type: string
 *           example: "CB71945"
 *           description: "Auto-set from part_no on save if not provided."
 *         strip_size:
 *           type: number
 *           example: 3660
 *           description: "Strip width in mm — for press shop."
 *         pitch:
 *           type: number
 *           example: 42
 *           description: "Progressive die pitch in mm."
 *         no_of_cavity:
 *           type: number
 *           example: 1
 *           default: 1
 *           description: "Cavities per press stroke."
 *         rm_rejection_percent:
 *           type: number
 *           example: 2.0
 *           default: 2.0
 *           description: "RM wastage allowance %. Default 2% for busbars, 3-5% for stampings."
 *         scrap_realisation_percent:
 *           type: number
 *           example: 98
 *           default: 98
 *           description: "% of scrap value actually recovered on sale."
 *         unit:
 *           type: string
 *           enum: [Nos, Kg, Meter, Set, Piece]
 *           example: "Nos"
 *         hsn_code:
 *           type: string
 *           example: "7407"
 *           description: "GST HSN code. 7407=copper bars/rods, 7604=aluminium profiles, 7326=steel stampings."
 *         reorder_level:
 *           type: number
 *           example: 100
 *           default: 0
 *         reorder_qty:
 *           type: number
 *           example: 500
 *           default: 0
 *         min_stock:
 *           type: number
 *           example: 50
 *           default: 0
 *         max_stock:
 *           type: number
 *           example: 2000
 *           default: 0
 *         lead_time_days:
 *           type: number
 *           example: 7
 *           default: 0
 *         procurement_type:
 *           type: string
 *           enum: [Manufacture, Purchase, Subcontract, Free Issue]
 *           default: "Manufacture"
 *           example: "Manufacture"
 *
 *     ItemUpdate:
 *       type: object
 *       minProperties: 1
 *       description: All fields optional — at least one required.
 *       properties:
 *         part_description:          { type: string }
 *         drawing_no:                { type: string }
 *         revision_no:               { type: string }
 *         item_type:                 { type: string, enum: [Finished Good, Semi-Finished, Raw Material, Consumable, Tool, Packing] }
 *         item_category:             { type: string }
 *         rm_grade:                  { type: string }
 *         density:                   { type: number }
 *         rm_source:                 { type: string }
 *         rm_type:                   { type: string }
 *         rm_spec:                   { type: string }
 *         material:                  { type: string }
 *         item_no:                   { type: string }
 *         strip_size:                { type: number }
 *         pitch:                     { type: number }
 *         no_of_cavity:              { type: number }
 *         rm_rejection_percent:      { type: number }
 *         scrap_realisation_percent: { type: number }
 *         unit:                      { type: string, enum: [Nos, Kg, Meter, Set, Piece] }
 *         hsn_code:                  { type: string }
 *         reorder_level:             { type: number }
 *         reorder_qty:               { type: number }
 *         min_stock:                 { type: number }
 *         max_stock:                 { type: number }
 *         lead_time_days:            { type: number }
 *         procurement_type:          { type: string, enum: [Manufacture, Purchase, Subcontract, Free Issue] }
 *         is_active:                 { type: boolean }
 *
 *     ItemDropdown:
 *       type: object
 *       properties:
 *         _id:              { type: string }
 *         item_id:          { type: string }
 *         part_no:          { type: string }
 *         part_description: { type: string }
 *         item_no:          { type: string }
 *         material:         { type: string }
 *         rm_grade:         { type: string }
 *         density:          { type: number }
 *         unit:             { type: string }
 *
 *   responses:
 *     ItemNotFound:
 *       description: Item not found
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success: { type: boolean, example: false }
 *               message: { type: string,  example: "Item not found" }
 *     DuplicateItem:
 *       description: Item with this part number already exists
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success: { type: boolean, example: false }
 *               message: { type: string,  example: "Item with this part number already exists" }
 */

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/items/dropdown  — must be before /:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/items/dropdown:
 *   get:
 *     summary: Get active items for dropdown selection
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Items dropdown list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ItemDropdown'
 */
router.get('/dropdown', getItemsDropdown);

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/items:
 *   get:
 *     summary: Get all items with pagination and search
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page,      schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit,     schema: { type: integer, default: 10 } }
 *       - { in: query, name: is_active, schema: { type: boolean }, description: "Filter by active status" }
 *       - { in: query, name: search,    schema: { type: string },  description: "Searches: part_no, part_description, drawing_no, rm_grade, item_no, material, rm_source, rm_type, rm_spec" }
 *     responses:
 *       200:
 *         description: Items list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:    { type: boolean, example: true }
 *                 data:       { type: array, items: { $ref: '#/components/schemas/Item' } }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:  { type: integer }
 *                     totalPages:   { type: integer }
 *                     totalItems:   { type: integer }
 *                     itemsPerPage: { type: integer }
 */
router.get('/', getItems);

/**
 * @swagger
 * /api/items/{id}:
 *   get:
 *     summary: Get single item by MongoDB _id
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Item detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/Item' }
 *       404:
 *         $ref: '#/components/responses/ItemNotFound'
 */
router.get('/:id', getItem);

/**
 * @swagger
 * /api/items:
 *   post:
 *     summary: Create a new item in Item Master
 *     description: |
 *       **Auto-computed fields (do not send):**
 *       - `item_id` — auto-generated as `ITEM-{timestamp}`
 *       - `item_no` — auto-set from `part_no` if not provided
 *       - `material` — auto-set from `rm_grade` if not provided (Copper/Aluminum/Stainless Steel)
 *
 *       **Feasibility check dependency:**
 *       `rm_grade` here must match a `Grade` in RawMaterial Master for the feasibility check to return `pass` on material check.
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ItemCreate'
 *           examples:
 *             copper_busbar:
 *               summary: Copper busbar finished good
 *               value:
 *                 part_no: "BR-001"
 *                 part_description: "Copper Busbar 100x10mm Nickel Plated"
 *                 rm_grade: "C11000"
 *                 density: 8.96
 *                 unit: "Nos"
 *                 hsn_code: "7407"
 *                 item_type: "Finished Good"
 *                 drawing_no: "DRG-2024-001"
 *                 revision_no: "A"
 *                 procurement_type: "Manufacture"
 *                 reorder_level: 100
 *                 lead_time_days: 7
 *             aluminium_profile:
 *               summary: Aluminium profile raw material
 *               value:
 *                 part_no: "AL-PROF-6063"
 *                 part_description: "Aluminium Profile AA6063 T5"
 *                 rm_grade: "AA6063 T5"
 *                 density: 2.70
 *                 unit: "Kg"
 *                 hsn_code: "7604"
 *                 item_type: "Raw Material"
 *                 procurement_type: "Purchase"
 *             stamping_part:
 *               summary: Progressive die stamping part
 *               value:
 *                 part_no: "STM-TERM-001"
 *                 part_description: "Terminal Bracket IS2062 E250"
 *                 rm_grade: "IS2062 E250"
 *                 density: 7.85
 *                 unit: "Nos"
 *                 hsn_code: "7326"
 *                 item_type: "Finished Good"
 *                 strip_size: 3660
 *                 pitch: 42
 *                 no_of_cavity: 2
 *                 rm_rejection_percent: 4
 *     responses:
 *       201:
 *         description: Item created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/Item' }
 *                 message: { type: string, example: "Item created successfully" }
 *       400:
 *         description: Validation error or duplicate part_no
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/responses/DuplicateItem'
 */
router.post('/', createItem);

/**
 * @swagger
 * /api/items/{id}:
 *   put:
 *     summary: Update item — partial update, all fields optional
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ItemUpdate'
 *           example:
 *             rm_grade: "C11000"
 *             density: 8.96
 *             reorder_level: 200
 *             lead_time_days: 10
 *     responses:
 *       200:
 *         description: Item updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/Item' }
 *                 message: { type: string, example: "Item updated successfully" }
 *       404:
 *         $ref: '#/components/responses/ItemNotFound'
 */
router.put('/:id', updateItem);

/**
 * @swagger
 * /api/items/{id}:
 *   delete:
 *     summary: Soft-delete item — sets is_active=false, never hard deleted
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Item deactivated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Item deactivated successfully" }
 *       404:
 *         $ref: '#/components/responses/ItemNotFound'
 */
router.delete('/:id', deleteItem);

module.exports = router;