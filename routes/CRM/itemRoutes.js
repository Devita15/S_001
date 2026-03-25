const express = require('express');
const router  = express.Router();
const {
  getItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  getItemsDropdown,
  bulkCreateItems,
  getItemByPartNo,
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
 *     DrawingRevision:
 *       type: object
 *       properties:
 *         revision_no:        { type: string, example: "A" }
 *         file_path:          { type: string, example: "/uploads/drawings/DRG-001.pdf" }
 *         approved_by:        { type: string, description: "User ID" }
 *         approved_at:        { type: string, format: date-time }
 *         change_description: { type: string }
 *         is_latest:          { type: boolean }
 *
 *     Item:
 *       type: object
 *       properties:
 *         _id:                       { type: string }
 *         item_id:                   { type: string, example: "ITEM-1710000000000" }
 *         part_no:                   { type: string, example: "BR-001" }
 *         part_name:                 { type: string, example: "Copper Busbar 100x10mm" }
 *         part_description:          { type: string, example: "Copper Busbar 100x10mm Nickel Plated" }
 *         drawing_no:                { type: string, example: "DRG-2024-001" }
 *         revision_no:               { type: string, example: "A" }
 *         drawing_file_path:         { type: string, example: "/uploads/drawings/DRG-001.pdf" }
 *         drawing_history:           { type: array, items: { $ref: '#/components/schemas/DrawingRevision' } }
 *         item_category:
 *           type: string
 *           enum: [Raw Material, Semi-Finished, Finished Good, Consumable, Tool, Bought-Out, Subcontract]
 *           example: "Finished Good"
 *         item_type:
 *           type: string
 *           enum: [Busbar, Stamping, Gasket, Tooling, Copper Strip, Aluminium Profile, Rubber Sheet, Cork, Other]
 *           example: "Busbar"
 *         rm_grade:                  { type: string, example: "C11000" }
 *         density:                   { type: number, example: 8.96, description: "g/cm³" }
 *         rm_source:                 { type: string, example: "Hindalco" }
 *         rm_type:
 *           type: string
 *           enum: [Strip, Profile, Sheet, Wire, Tube, Compound, Bar, Rod, Coil, ""]
 *           example: "Strip"
 *         rm_spec:                   { type: string, example: "IS 191" }
 *         material:                  { type: string, example: "Copper" }
 *         item_no:                   { type: string, example: "CB71945" }
 *         thickness:                 { type: number, example: 10, description: "mm" }
 *         width:                     { type: number, example: 100, description: "mm" }
 *         strip_size:                { type: number, example: 3660, description: "mm" }
 *         pitch:                     { type: number, example: 42, description: "mm" }
 *         no_of_cavity:              { type: number, example: 1 }
 *         gross_weight_kg:           { type: number, example: 0.896 }
 *         net_weight_kg:             { type: number, example: 0.85 }
 *         rm_rejection_percent:      { type: number, example: 2.0 }
 *         scrap_realisation_percent: { type: number, example: 85 }
 *         unit:
 *           type: string
 *           enum: [Nos, Kg, Meter, Set, Piece, Sheet, Roll]
 *           example: "Nos"
 *         hsn_code:                  { type: string, example: "7407" }
 *         gst_percentage:
 *           type: number
 *           enum: [0, 5, 12, 18, 28]
 *           example: 18
 *         reorder_level:             { type: number, example: 100 }
 *         reorder_qty:               { type: number, example: 500 }
 *         safety_stock:              { type: number, example: 50 }
 *         min_stock:                 { type: number, example: 50 }
 *         max_stock:                 { type: number, example: 2000 }
 *         lead_time_days:            { type: number, example: 7 }
 *         shelf_life_days:           { type: number, example: 365 }
 *         procurement_type:
 *           type: string
 *           enum: [Manufacture, Purchase, Subcontract, Free Issue]
 *           example: "Manufacture"
 *         part_no_locked:            { type: boolean, example: false }
 *         is_active:                 { type: boolean, example: true }
 *         created_by:
 *           type: object
 *           properties:
 *             _id:      { type: string }
 *             username: { type: string }
 *             email:    { type: string }
 *         updated_by:
 *           type: object
 *           properties:
 *             _id:      { type: string }
 *             username: { type: string }
 *             email:    { type: string }
 *         createdAt:                 { type: string, format: date-time }
 *         updatedAt:                 { type: string, format: date-time }
 *
 *     ItemCreate:
 *       type: object
 *       required: [part_no, part_name, part_description, item_category, unit, hsn_code]
 *       properties:
 *         part_no:
 *           type: string
 *           example: "BR-001"
 *           description: "Auto-uppercased. Must be unique across the system."
 *         part_name:
 *           type: string
 *           example: "Copper Busbar 100x10mm"
 *           description: "Display name for the part"
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
 *         drawing_file_path:
 *           type: string
 *           example: "/uploads/drawings/DRG-001.pdf"
 *         item_category:
 *           type: string
 *           required: true
 *           enum: [Raw Material, Semi-Finished, Finished Good, Consumable, Tool, Bought-Out, Subcontract]
 *           example: "Finished Good"
 *         item_type:
 *           type: string
 *           enum: [Busbar, Stamping, Gasket, Tooling, Copper Strip, Aluminium Profile, Rubber Sheet, Cork, Other]
 *           default: "Other"
 *         rm_grade:
 *           type: string
 *           example: "C11000"
 *         density:
 *           type: number
 *           example: 8.96
 *           description: "g/cm³. Copper=8.96, Aluminium=2.70, Steel=7.85, Rubber=1.20"
 *         rm_source:
 *           type: string
 *           example: "Hindalco"
 *         rm_type:
 *           type: string
 *           enum: [Strip, Profile, Sheet, Wire, Tube, Compound, Bar, Rod, Coil]
 *           example: "Strip"
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
 *         thickness:
 *           type: number
 *           example: 10
 *           description: "mm"
 *         width:
 *           type: number
 *           example: 100
 *           description: "mm"
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
 *         net_weight_kg:
 *           type: number
 *           example: 0.85
 *           description: "Net weight in kg"
 *         rm_rejection_percent:
 *           type: number
 *           example: 2.0
 *           default: 2.0
 *         scrap_realisation_percent:
 *           type: number
 *           example: 85
 *           default: 85
 *         unit:
 *           type: string
 *           required: true
 *           enum: [Nos, Kg, Meter, Set, Piece, Sheet, Roll]
 *           example: "Nos"
 *         hsn_code:
 *           type: string
 *           required: true
 *           example: "7407"
 *         gst_percentage:
 *           type: number
 *           enum: [0, 5, 12, 18, 28]
 *           default: 18
 *         reorder_level:
 *           type: number
 *           example: 100
 *           default: 0
 *         reorder_qty:
 *           type: number
 *           example: 500
 *           default: 0
 *         safety_stock:
 *           type: number
 *           example: 50
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
 *         shelf_life_days:
 *           type: number
 *           example: 365
 *           default: 0
 *         procurement_type:
 *           type: string
 *           enum: [Manufacture, Purchase, Subcontract, Free Issue]
 *           default: "Manufacture"
 *
 *     ItemUpdate:
 *       type: object
 *       minProperties: 1
 *       description: All fields optional — at least one required.
 *       properties:
 *         part_name:                 { type: string }
 *         part_description:          { type: string }
 *         drawing_no:                { type: string }
 *         revision_no:               { type: string }
 *         drawing_file_path:         { type: string }
 *         item_category:             { type: string, enum: [Raw Material, Semi-Finished, Finished Good, Consumable, Tool, Bought-Out, Subcontract] }
 *         item_type:                 { type: string, enum: [Busbar, Stamping, Gasket, Tooling, Copper Strip, Aluminium Profile, Rubber Sheet, Cork, Other] }
 *         rm_grade:                  { type: string }
 *         density:                   { type: number }
 *         rm_source:                 { type: string }
 *         rm_type:                   { type: string, enum: [Strip, Profile, Sheet, Wire, Tube, Compound, Bar, Rod, Coil] }
 *         rm_spec:                   { type: string }
 *         material:                  { type: string }
 *         item_no:                   { type: string }
 *         thickness:                 { type: number }
 *         width:                     { type: number }
 *         strip_size:                { type: number }
 *         pitch:                     { type: number }
 *         no_of_cavity:              { type: number }
 *         net_weight_kg:             { type: number }
 *         rm_rejection_percent:      { type: number }
 *         scrap_realisation_percent: { type: number }
 *         unit:                      { type: string, enum: [Nos, Kg, Meter, Set, Piece, Sheet, Roll] }
 *         hsn_code:                  { type: string }
 *         gst_percentage:            { type: number, enum: [0, 5, 12, 18, 28] }
 *         reorder_level:             { type: number }
 *         reorder_qty:               { type: number }
 *         safety_stock:              { type: number }
 *         min_stock:                 { type: number }
 *         max_stock:                 { type: number }
 *         lead_time_days:            { type: number }
 *         shelf_life_days:           { type: number }
 *         procurement_type:          { type: string, enum: [Manufacture, Purchase, Subcontract, Free Issue] }
 *         is_active:                 { type: boolean }
 *
 *     ItemDropdown:
 *       type: object
 *       properties:
 *         _id:              { type: string }
 *         item_id:          { type: string }
 *         part_no:          { type: string }
 *         part_name:        { type: string }
 *         part_description: { type: string }
 *         item_no:          { type: string }
 *         material:         { type: string }
 *         rm_grade:         { type: string }
 *         density:          { type: number }
 *         unit:             { type: string }
 *         hsn_code:         { type: string }
 *         gst_percentage:   { type: number }
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
// GET endpoints (must be before /:id)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/items/dropdown:
 *   get:
 *     summary: Get active items for dropdown selection
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: item_category, schema: { type: string }, description: "Filter by item category" }
 *       - { in: query, name: search, schema: { type: string }, description: "Search by part_no, part_name, or part_description" }
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

/**
 * @swagger
 * /api/items/part/{part_no}:
 *   get:
 *     summary: Get item by part number
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: part_no, required: true, schema: { type: string } }
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
router.get('/part/:part_no', getItemByPartNo);

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
 *       - { in: query, name: item_category, schema: { type: string }, description: "Filter by item category" }
 *       - { in: query, name: item_type, schema: { type: string }, description: "Filter by item type" }
 *       - { in: query, name: procurement_type, schema: { type: string }, description: "Filter by procurement type" }
 *       - { in: query, name: search, schema: { type: string }, description: "Searches: part_no, part_name, part_description, drawing_no, rm_grade, item_no, material, rm_source, rm_type, rm_spec, hsn_code" }
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
 *       - `gross_weight_kg` — auto-computed from thickness × width × density
 *
 *       **Required fields:**
 *       - `part_no`, `part_name`, `part_description`, `item_category`, `unit`, `hsn_code`
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
 *                 part_name: "Copper Busbar 100x10mm"
 *                 part_description: "Copper Busbar 100x10mm Nickel Plated"
 *                 item_category: "Finished Good"
 *                 item_type: "Busbar"
 *                 rm_grade: "C11000"
 *                 density: 8.96
 *                 thickness: 10
 *                 width: 100
 *                 unit: "Nos"
 *                 hsn_code: "7407"
 *                 gst_percentage: 18
 *                 procurement_type: "Manufacture"
 *                 reorder_level: 100
 *                 lead_time_days: 7
 *             aluminium_profile:
 *               summary: Aluminium profile raw material
 *               value:
 *                 part_no: "AL-PROF-6063"
 *                 part_name: "Aluminium Profile 6063 T5"
 *                 part_description: "Aluminium Profile AA6063 T5"
 *                 item_category: "Raw Material"
 *                 item_type: "Aluminium Profile"
 *                 rm_grade: "AA6063 T5"
 *                 density: 2.70
 *                 unit: "Kg"
 *                 hsn_code: "7604"
 *                 procurement_type: "Purchase"
 *             stamping_part:
 *               summary: Progressive die stamping part
 *               value:
 *                 part_no: "STM-TERM-001"
 *                 part_name: "Terminal Bracket"
 *                 part_description: "Terminal Bracket IS2062 E250"
 *                 item_category: "Finished Good"
 *                 item_type: "Stamping"
 *                 rm_grade: "IS2062 E250"
 *                 density: 7.85
 *                 strip_size: 3660
 *                 pitch: 42
 *                 no_of_cavity: 2
 *                 unit: "Nos"
 *                 hsn_code: "7326"
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
 * /api/items/bulk:
 *   post:
 *     summary: Bulk create multiple items
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ItemCreate'
 *     responses:
 *       201:
 *         description: Items created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     created: { type: array }
 *                     errors: { type: array }
 *                     total_processed: { type: number }
 *                     total_created: { type: number }
 *                     total_errors: { type: number }
 *       400:
 *         description: Invalid input
 */
router.post('/bulk', bulkCreateItems);

/**
 * @swagger
 * /api/items/{id}:
 *   put:
 *     summary: Update item — partial update, all fields optional
 *     description: |
 *       **Note:** Once a Work Order is created for an item, `part_no` cannot be changed (locked by `part_no_locked` flag).
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
 *             part_name: "Copper Busbar 100x10mm (Updated)"
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
 *       400:
 *         description: Validation error or locked part_no
 *       404:
 *         $ref: '#/components/responses/ItemNotFound'
 */
router.put('/:id', updateItem);

/**
 * @swagger
 * /api/items/{id}:
 *   delete:
 *     summary: Soft-delete item — sets is_active=false, never hard deleted
 *     description: |
 *       **Note:** Items with active Work Orders (`part_no_locked=true`) cannot be deactivated.
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
 *       400:
 *         description: Cannot deactivate item with active Work Orders
 *       404:
 *         $ref: '#/components/responses/ItemNotFound'
 */
router.delete('/:id', deleteItem);

module.exports = router;