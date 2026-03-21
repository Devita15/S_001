// models/user's & setting's/Role.js
const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    RoleName: {
      type:      String,
      required:  [true, 'Role name is required'],
      unique:    true,
      trim:      true
    },
    Description: {
      type:      String,
      trim:      true,
      maxlength: 500
    },

    // SuperAdmin flag — users with this role automatically receive ALL permissions.
    // No permission list is stored or checked; the flag alone is the gate.
    isSuperAdmin: {
      type:    Boolean,
      default: false
    },

    // ── What the role can access ─────────────────────────────────────────────
    // These three maps are the source-of-truth for what was configured.
    // They are stored so the admin UI can read them back and show the toggle state.
    //
    // moduleAccess  →  { "COMPANY_MASTER": true, "DASHBOARD": true, ... }
    // pageAccess    →  { "COMPANY_MASTER": { "Organization / Company": ["VIEW","CREATE"] } }
    //
    // NOTE: this project has no tab-level access (frontend doesn't use tabs),
    // so we keep it simple — only module + page + action granularity.
    moduleAccess: {
      type:    Map,
      of:      Boolean,
      default: {}
    },
    pageAccess: {
      type:    Map,
      of:      Map,   // module → { page → [actions] }
      default: {}
    },

    // Resolved Permission document IDs — rebuilt whenever access maps are saved.
    // This is what gets used at runtime for fast permission lookups.
    permissions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref:  'Permission'
      }
    ],

    IsActive: {
      type:    Boolean,
      default: true
    },
    CreatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'User'
    },
    UpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'User'
    }
  },
  {
    timestamps: { createdAt: 'CreatedAt', updatedAt: 'UpdatedAt' }
  }
);

roleSchema.index({ RoleName: 1 });
roleSchema.index({ IsActive: 1 });

module.exports = mongoose.model('Role', roleSchema);