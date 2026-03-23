'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// taxController.js
//
// ROUTES:
//   GET    /api/taxes              → getTaxes          (paginated list)
//   GET    /api/taxes/valid-rates  → getValidRates     (dropdown helper)
//   GET    /api/taxes/:id          → getTax            (single)
//   GET    /api/taxes/hsn/:hsnCode → getTaxByHSN       (lookup by HSN)
//   POST   /api/taxes              → createTax
//   PUT    /api/taxes/:id          → updateTax
//   DELETE /api/taxes/:id          → deleteTax         (soft delete only)
//
// ACCESS: All routes should be Protected (require auth middleware) in production.
//         They are marked Public below only because your existing code had them
//         as Public — add auth middleware at the router level as needed.
//
// KEY RULES:
//   - GSTType (IGST vs CGST/SGST) is a TRANSACTION-level concept, not stored here.
//     The tax master stores all three rate variants always.
//   - CGST/SGST/IGST are derived automatically. Never accept them from the request body.
//   - Soft delete only. Tax records are referenced in quotations.
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const Tax      = require('../../models/CRM/Tax');

// Valid Indian GST rates — also defined in model, kept here for response messages
const VALID_GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 7.5, 12, 18, 28];

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — validate MongoDB ObjectId format
// ─────────────────────────────────────────────────────────────────────────────
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL TAXES
// GET /api/taxes
// Query: page, limit, hsnCode (partial search), isActive, gstPercentage
// ─────────────────────────────────────────────────────────────────────────────
const getTaxes = async (req, res) => {
  try {
    const {
      page          = 1,
      limit         = 10,
      hsnCode,
      isActive,
      gstPercentage,  // filter by exact rate e.g. ?gstPercentage=18
    } = req.query;

    const query = {};

    // Default: only active records unless caller explicitly requests inactive
    if (isActive !== undefined) {
      query.IsActive = isActive === 'true';
    } else {
      query.IsActive = true;
    }

    if (hsnCode) {
      // Partial match — useful for type-ahead search in frontend
      query.HSNCode = new RegExp(hsnCode.trim(), 'i');
    }

    if (gstPercentage !== undefined) {
      query.GSTPercentage = Number(gstPercentage);
    }

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // cap at 100
    const skip     = (pageNum - 1) * limitNum;

    const [taxes, total] = await Promise.all([
      Tax.find(query)
        .sort({ HSNCode: 1 })
        .skip(skip)
        .limit(limitNum)
        .select('-__v'),
      Tax.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data:    taxes,
      pagination: {
        currentPage:  pageNum,
        totalPages:   Math.ceil(total / limitNum),
        totalItems:   total,
        itemsPerPage: limitNum,
      },
    });

  } catch (error) {
    console.error('getTaxes error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET VALID GST RATES  (dropdown helper for frontend)
// GET /api/taxes/valid-rates
// Returns the list of valid Indian GST rates for dropdown menus
// ─────────────────────────────────────────────────────────────────────────────
const getValidRates = async (req, res) => {
  return res.json({
    success: true,
    data:    VALID_GST_RATES.map((rate) => ({
      rate,
      label:        `${rate}% GST (CGST ${rate / 2}% + SGST ${rate / 2}%)`,
      cgst:         rate / 2,
      sgst:         rate / 2,
      igst:         rate,
    })),
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET SINGLE TAX BY ID
// GET /api/taxes/:id
// ─────────────────────────────────────────────────────────────────────────────
const getTax = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid tax ID format' });
    }

    const tax = await Tax.findById(req.params.id).select('-__v');

    if (!tax) {
      return res.status(404).json({ success: false, message: 'Tax not found' });
    }

    return res.json({ success: true, data: tax });

  } catch (error) {
    console.error('getTax error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET TAX BY HSN CODE  (used by quotation creation to resolve GST rate)
// GET /api/taxes/hsn/:hsnCode
// ─────────────────────────────────────────────────────────────────────────────
const getTaxByHSN = async (req, res) => {
  try {
    const hsnCode = req.params.hsnCode?.trim().toUpperCase();

    if (!hsnCode) {
      return res.status(400).json({ success: false, message: 'HSN code is required' });
    }

    const tax = await Tax.findOne({ HSNCode: hsnCode, IsActive: true }).select('-__v');

    if (!tax) {
      return res.status(404).json({
        success: false,
        message: `No active tax record found for HSN code ${hsnCode}`,
      });
    }

    return res.json({ success: true, data: tax });

  } catch (error) {
    console.error('getTaxByHSN error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE TAX
// POST /api/taxes
// Body: { HSNCode, GSTPercentage, Description? }
//
// NOTE: Do NOT send CGSTPercentage / SGSTPercentage / IGSTPercentage in the body.
//       They are auto-calculated from GSTPercentage in the pre-save hook.
// ─────────────────────────────────────────────────────────────────────────────
const createTax = async (req, res) => {
  try {
    const { HSNCode, GSTPercentage, Description } = req.body;

    // ── Input validation ──────────────────────────────────────────────────
    if (!HSNCode || HSNCode.toString().trim() === '') {
      return res.status(400).json({ success: false, message: 'HSN code is required' });
    }

    if (GSTPercentage === undefined || GSTPercentage === null || GSTPercentage === '') {
      return res.status(400).json({ success: false, message: 'GST percentage is required' });
    }

    const gstNum = Number(GSTPercentage);
    if (isNaN(gstNum) || !VALID_GST_RATES.includes(gstNum)) {
      return res.status(400).json({
        success: false,
        message: `Invalid GST rate "${GSTPercentage}". Valid rates are: ${VALID_GST_RATES.join(', ')}%`,
      });
    }

    // ── Create (pre-save hook auto-calculates CGST/SGST/IGST) ────────────
    const tax = await Tax.create({
      HSNCode:       HSNCode.toString().trim().toUpperCase(),
      GSTPercentage: gstNum,
      Description:   Description?.trim() || '',
      // IMPORTANT: Do NOT set CGSTPercentage / SGSTPercentage / IGSTPercentage here.
      // The pre-save hook on the model derives them from GSTPercentage.
      CreatedBy:     req.user?._id || null,
      UpdatedBy:     req.user?._id || null,
    });

    return res.status(201).json({
      success: true,
      data:    tax,
      message: `Tax created: ${tax.HSNCode} @ ${tax.GSTPercentage}% GST (CGST ${tax.CGSTPercentage}% + SGST ${tax.SGSTPercentage}%, IGST ${tax.IGSTPercentage}%)`,
    });

  } catch (error) {
    console.error('createTax error:', error);

    if (error.code === 11000) {
      const hsn = req.body.HSNCode?.toString().trim().toUpperCase();
      return res.status(409).json({
        success: false,
        message: `Tax record for HSN code "${hsn}" already exists. Use PUT to update it.`,
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }

    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE TAX
// PUT /api/taxes/:id
// Body: { GSTPercentage?, Description?, IsActive? }
//
// RULES:
//   - HSNCode is immutable after creation (it's a master reference key).
//     If HSNCode needs to change, soft-delete and create a new record.
//   - Updating GSTPercentage auto-recalculates CGST/SGST/IGST via pre-save.
//   - CGSTPercentage / SGSTPercentage / IGSTPercentage are stripped from body
//     even if sent — they are always derived, never manually set.
// ─────────────────────────────────────────────────────────────────────────────
const updateTax = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid tax ID format' });
    }

    // ── Validate GSTPercentage if provided ────────────────────────────────
    if (req.body.GSTPercentage !== undefined) {
      const gstNum = Number(req.body.GSTPercentage);
      if (isNaN(gstNum) || !VALID_GST_RATES.includes(gstNum)) {
        return res.status(400).json({
          success: false,
          message: `Invalid GST rate "${req.body.GSTPercentage}". Valid rates are: ${VALID_GST_RATES.join(', ')}%`,
        });
      }
    }

    // ── Build safe update payload ─────────────────────────────────────────
    // Strip fields that must not be updated directly
    const {
      HSNCode,            // immutable — ignore
      CGSTPercentage,     // derived  — ignore
      SGSTPercentage,     // derived  — ignore
      IGSTPercentage,     // derived  — ignore
      CreatedBy,          // audit    — ignore
      CreatedAt,          // audit    — ignore
      DeletedBy,          // managed by deleteTax only
      DeletedAt,          // managed by deleteTax only
      ...safeBody
    } = req.body;

    if (Object.keys(safeBody).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No updatable fields provided. You can update: GSTPercentage, Description, IsActive',
      });
    }

    // Add audit field
    safeBody.UpdatedBy = req.user?._id || null;

    // ── Find and update via findById + save so pre-save hook runs ─────────
    // NOTE: findByIdAndUpdate bypasses pre-save hooks.
    //       We must use findById → modify → save to trigger auto-recalculation.
    const tax = await Tax.findById(req.params.id);

    if (!tax) {
      return res.status(404).json({ success: false, message: 'Tax not found' });
    }

    if (safeBody.GSTPercentage !== undefined) tax.GSTPercentage = Number(safeBody.GSTPercentage);
    if (safeBody.Description   !== undefined) tax.Description   = safeBody.Description.trim();
    if (safeBody.IsActive      !== undefined) tax.IsActive      = Boolean(safeBody.IsActive);
    if (safeBody.UpdatedBy)                   tax.UpdatedBy     = safeBody.UpdatedBy;

    // pre-save hook fires here → auto-recalculates CGST/SGST/IGST
    await tax.save();

    return res.json({
      success: true,
      data:    tax,
      message: `Tax updated: ${tax.HSNCode} @ ${tax.GSTPercentage}% GST (CGST ${tax.CGSTPercentage}% + SGST ${tax.SGSTPercentage}%, IGST ${tax.IGSTPercentage}%)`,
    });

  } catch (error) {
    console.error('updateTax error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }

    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE TAX — SOFT DELETE ONLY
// DELETE /api/taxes/:id
//
// WHY SOFT DELETE:
//   Tax records are referenced by HSN code in every quotation ever created.
//   Hard-deleting would break historical audit trails and GST filings.
//   Soft delete (IsActive = false) preserves the record while hiding it
//   from active lookups.
//
// SAFETY CHECK:
//   Blocks deletion if HSN code is actively used in any Item master record.
//   Already-created quotations are unaffected since they snapshot the rate.
// ─────────────────────────────────────────────────────────────────────────────
const deleteTax = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid tax ID format' });
    }

    const tax = await Tax.findByIdAndDelete(req.params.id);

    if (!tax) {
      return res.status(404).json({ success: false, message: 'Tax not found' });
    }

    return res.json({
      success: true,
      message: `Tax for HSN code "${tax.HSNCode}" has been permanently deleted.`,
    });

  } catch (error) {
    console.error('deleteTax error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  getTaxes,
  getValidRates,
  getTax,
  getTaxByHSN,
  createTax,
  updateTax,
  deleteTax,
};