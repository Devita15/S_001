const mongoose = require('mongoose');

const incrementPolicySchema = new mongoose.Schema({
  year: {
    type: Number,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    default: function() {
      return `Annual Increment ${this.year}`;
    }
  },
  status: {
    type: String,
    enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
    default: 'DRAFT'
  },
  // Behavior score to increment mapping
  rules: [{
    minScore: {
      type: Number,
      required: true,
      min: 0,
      max: 5
    },
    maxScore: {
      type: Number,
      required: true,
      min: 0,
      max: 5
    },
    incrementPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    category: {
      type: String,
      enum: ['Excellent', 'Good', 'Average', 'Below Average', 'Poor'],
      required: true
    },
    description: String
  }],
  // Category weights for behavior scoring
  categoryWeights: {
    type: Map,
    of: Number,
    default: () => new Map([
      ['Performance', 30],
      ['Discipline', 20],
      ['Attendance Behavior', 15],
      ['Teamwork', 10],
      ['Quality of Work', 15],
      ['Initiative', 5],
      ['Communication', 5]
    ])
  },
  // Global caps
  maxIncrementPercent: {
    type: Number,
    required: true,
    default: 20,
    min: 0,
    max: 100
  },
  minIncrementPercent: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    max: 100
  },
  // Penalty rules
  penaltyRules: {
    negativeFeedbackThreshold: {
      type: Number,
      default: 3, // If 3+ negative feedback, apply penalty
    },
    penaltyPercent: {
      type: Number,
      default: 0.5, // Reduce score by 0.5
    },
    escalatedCasePenalty: {
      type: Number,
      default: 1, // Reduce score by 1 for escalated cases
    }
  },
  // Application rules
  applyOn: {
    type: String,
    enum: ['BASIC', 'GROSS'],
    default: 'BASIC'
  },
  proRataForPartialYear: {
    type: Boolean,
    default: true
  },
  probationExclude: {
    type: Boolean,
    default: true
  },
  // Budget control
  budgetControl: {
    enabled: {
      type: Boolean,
      default: false
    },
    totalBudget: Number,
    departmentCaps: [{
      departmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department'
      },
      capPercent: Number
    }]
  },
  // Promotion override
  promotionOverride: {
    enabled: {
      type: Boolean,
      default: true
    },
    minIncrementPercent: {
      type: Number,
      default: 20
    }
  },
  // Effective date
  effectiveFrom: {
    type: Date,
    required: true
  },
  effectiveTo: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Validate rules don't overlap
incrementPolicySchema.pre('save', function(next) {
  const rules = this.rules;
  
  // Sort by minScore
  rules.sort((a, b) => a.minScore - b.minScore);
  
  // Check for gaps/overlaps
  for (let i = 0; i < rules.length - 1; i++) {
    if (rules[i].maxScore >= rules[i + 1].minScore) {
      return next(new Error('Increment rules cannot overlap'));
    }
  }
  
  next();
});

module.exports = mongoose.model('IncrementPolicy', incrementPolicySchema);