// models/user's & setting's/Permission.js
const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema(
  {
    // Matches frontend MODULES constant  e.g. "COMPANY_MASTER", "EMPLOYEE_MASTER"
    module: {
      type:     String,
      required: true,
      trim:     true,
      uppercase: true   // always stored uppercase, matches frontend logic
    },

    // Matches frontend PAGES constant  e.g. "Organization / Company", "Employee Registry"
    page: {
      type:     String,
      required: true,
      trim:     true
      // No uppercase — frontend does exact string match on page names
    },

    // Matches frontend ACTIONS  e.g. "VIEW", "CREATE", "APPROVE", "EXPORT"
    // No enum — actions are free-form so new ones (IMPORT, PRINT …) never need a schema change
    action: {
      type:     String,
      required: true,
      trim:     true,
      uppercase: true
    },

    // Auto-generated readable label  e.g. "COMPANY_MASTER.Organization / Company.VIEW"
    name: {
      type: String
    },

    is_active: {
      type:    Boolean,
      default: true
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'User'
    }
  },
  { timestamps: true }
);

// ── Auto-build name before save ──────────────────────────────────────────────
permissionSchema.pre('save', function (next) {
  this.name = `${this.module}.${this.page}.${this.action}`;
  next();
});

// ── Unique index: one document per module+page+action combo ─────────────────
permissionSchema.index(
  { module: 1, page: 1, action: 1 },
  { unique: true, name: 'unique_module_page_action' }
);

permissionSchema.index({ module: 1 });
permissionSchema.index({ is_active: 1 });

// ── Static: find or create (safe for concurrent calls) ──────────────────────
permissionSchema.statics.findOrCreate = async function (module, page, action, createdBy = null) {
  const filter = {
    module: module.toUpperCase(),
    page,
    action: action.toUpperCase()
  };

  // findOneAndUpdate with upsert is atomic — avoids race-condition duplicates
  const doc = await this.findOneAndUpdate(
    filter,
    { $setOnInsert: { ...filter, is_active: true, createdBy } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc;
};

module.exports = mongoose.model('Permission', permissionSchema);