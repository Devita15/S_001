const mongoose = require('mongoose');

const performanceSchema = new mongoose.Schema({
  EmployeeID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  ReviewPeriodStart: {
    type: Date,
    required: true
  },
  ReviewPeriodEnd: {
    type: Date,
    required: true
  },
  KPIs: [{
    name: String,
    target: Number,
    achieved: Number,
    weightage: Number
  }],
  OverallScore: {
    type: Number,
    min: 0,
    max: 100
  },
  Feedback: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  Rating: {
    type: String,
    enum: ['Excellent', 'Good', 'Average', 'Below Average', 'Poor'],
    default: 'Average'
  },
  ReviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  CreatedAt: {
    type: Date,
    default: Date.now
  },
  UpdatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'CreatedAt', updatedAt: 'UpdatedAt' }
});

// Pre-save middleware to calculate OverallScore and update UpdatedAt
performanceSchema.pre('save', function(next) {
  this.UpdatedAt = Date.now();
  
  // Calculate OverallScore if KPIs exist
  if (this.KPIs && this.KPIs.length > 0) {
    let totalWeightedScore = 0;
    let totalWeightage = 0;
    
    this.KPIs.forEach(kpi => {
      if (kpi.target > 0) {
        const achievementPercentage = (kpi.achieved / kpi.target) * 100;
        totalWeightedScore += achievementPercentage * (kpi.weightage / 100);
        totalWeightage += kpi.weightage;
      }
    });
    
    if (totalWeightage > 0) {
      this.OverallScore = (totalWeightedScore / totalWeightage) * 100;
    }
  }
  
  next();
});

module.exports = mongoose.model('Performance', performanceSchema);