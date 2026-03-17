'use strict';

const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// TAX SCHEMA
//
// Stores HSN-code-level GST rates for India's GST regime.
//
// KEY DESIGN DECISIONS:
//   1. All three rate variants (CGST, SGST, IGST) are always stored.
//      Which one applies depends on the TRANSACTION (inter-state vs intra-state),
//      NOT on the tax master. The quotation controller picks the right one
//      by comparing VendorStateCode vs CompanyStateCode at runtime.
//
//   2. CGST = SGST = GSTPercentage / 2   (intra-state, split equally)
//      IGST  = GSTPercentage             (inter-state, full rate)
//      These are auto-calculated in pre('save') — never set them manually.
//
//   3. Soft delete only (IsActive = false). Tax records are referenced in
//      quotations — hard deleting them would break audit trails.
//
//   4. HSNCode is stored uppercase + trimmed to prevent duplicate collisions
//      like "8544" vs " 8544".
//
// VALID GST RATES (India): 0, 0.1, 0.25, 1, 1.5, 3, 5, 7.5, 12, 18, 28
// ─────────────────────────────────────────────────────────────────────────────

const VALID_GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 7.5, 12, 18, 28];

const taxSchema = new mongoose.Schema(
  {
    // ── Core Fields ──────────────────────────────────────────────────────────
    HSNCode: {
      type:     String,
      required: [true, 'HSN code is required'],
      unique:   true,
      trim:     true,
      uppercase: true,
      index:    true,
    },

    // Total GST % — source of truth. CGST/SGST/IGST are derived from this.
    GSTPercentage: {
      type:     Number,
      required: [true, 'GST percentage is required'],
      min:      [0,   'GST percentage cannot be negative'],
      max:      [100, 'GST percentage cannot exceed 100'],
      validate: {
        validator: (v) => VALID_GST_RATES.includes(v),
        message:   (props) =>
          `${props.value}% is not a valid GST rate. Valid rates: ${VALID_GST_RATES.join(', ')}`,
      },
    },

    // ── Derived Rate Fields (auto-calculated in pre-save, never set manually) ─
    // Intra-state: CGST + SGST each = GSTPercentage / 2
    CGSTPercentage: {
      type:    Number,
      min:     0,
      max:     50,
      default: 0,
    },
    SGSTPercentage: {
      type:    Number,
      min:     0,
      max:     50,
      default: 0,
    },
    // Inter-state: IGST = GSTPercentage (full rate)
    IGSTPercentage: {
      type:    Number,
      min:     0,
      max:     100,
      default: 0,
    },

    // ── Meta ─────────────────────────────────────────────────────────────────
    Description: {
      type:    String,
      trim:    true,
      default: '',
    },
    IsActive: {
      type:    Boolean,
      default: true,
      index:   true,
    },

    // ── Audit ─────────────────────────────────────────────────────────────────
    CreatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'User',
    },
    UpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'User',
    },
    // Soft-delete audit
    DeletedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },
    DeletedAt: {
      type:    Date,
      default: null,
    },
  },
  {
    // Let Mongoose manage CreatedAt / UpdatedAt — don't define them manually
    timestamps: { createdAt: 'CreatedAt', updatedAt: 'UpdatedAt' },
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PRE-SAVE HOOK — always auto-derive CGST / SGST / IGST from GSTPercentage
// This runs on both create AND save(), so the derived fields are always correct.
// ─────────────────────────────────────────────────────────────────────────────
taxSchema.pre('save', function (next) {
  this.CGSTPercentage = this.GSTPercentage / 2;
  this.SGSTPercentage = this.GSTPercentage / 2;
  this.IGSTPercentage = this.GSTPercentage;
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// INSTANCE METHOD — given a subtotal and transaction type, returns tax amounts
// Usage in quotation controller:
//   const taxAmounts = taxRecord.calculateTax(subTotal, 'IGST');
//   → { igst: 900, cgst: 0, sgst: 0, total: 900 }
// ─────────────────────────────────────────────────────────────────────────────
taxSchema.methods.calculateTax = function (subTotal, gstType = 'CGST/SGST') {
  if (gstType === 'IGST') {
    const igst = parseFloat(((subTotal * this.IGSTPercentage) / 100).toFixed(2));
    return { igst, cgst: 0, sgst: 0, total: igst };
  }
  const cgst = parseFloat(((subTotal * this.CGSTPercentage) / 100).toFixed(2));
  const sgst = parseFloat(((subTotal * this.SGSTPercentage) / 100).toFixed(2));
  return { igst: 0, cgst, sgst, total: cgst + sgst };
};

// ─────────────────────────────────────────────────────────────────────────────
// STATIC METHOD — bulk lookup by HSN codes (used in quotation creation
// to resolve tax for multiple items in one DB call instead of N calls)
// Usage: const taxMap = await Tax.getMapByHSNCodes(['8544', '7408']);
// ─────────────────────────────────────────────────────────────────────────────
taxSchema.statics.getMapByHSNCodes = async function (hsnCodes) {
  const taxes = await this.find({
    HSNCode:  { $in: hsnCodes.map((c) => c.toUpperCase()) },
    IsActive: true,
  });
  // Returns { '8544': taxDoc, '7408': taxDoc, ... }
  return Object.fromEntries(taxes.map((t) => [t.HSNCode, t]));
};

module.exports = mongoose.model('Tax', taxSchema);