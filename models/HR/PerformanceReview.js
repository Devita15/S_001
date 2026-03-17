const mongoose = require('mongoose');

const performanceReviewSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true
  },

  reviewYear: {
    type: Number,
    required: true
  },

  reviewPeriod: {
    from: { type: Date, required: true },
    to: { type: Date, required: true }
  },

  // Manager ratings (1-5 scale)
  managerRatings: {
    jobKnowledge: { type: Number, min: 1, max: 5, default: 3 },
    qualityOfWork: { type: Number, min: 1, max: 5, default: 3 },
    productivity: { type: Number, min: 1, max: 5, default: 3 },
    teamwork: { type: Number, min: 1, max: 5, default: 3 },
    communication: { type: Number, min: 1, max: 5, default: 3 },
    initiative: { type: Number, min: 1, max: 5, default: 3 },
    problemSolving: { type: Number, min: 1, max: 5, default: 3 },
    discipline: { type: Number, min: 1, max: 5, default: 3 },
    overall: { type: Number, min: 1, max: 5, default: 3 }
  },

  // Production metrics (from actual data)
  productionMetrics: {
    totalUnits: { type: Number, default: 0 },
    targetUnits: { type: Number, default: 0 },
    achievementPercentage: { type: Number, default: 0 },
    
    goodUnits: { type: Number, default: 0 },
    rejectedUnits: { type: Number, default: 0 },
    qualityPercentage: { type: Number, default: 0 },
    
    efficiencyPercentage: { type: Number, default: 0 },
    overtimeHours: { type: Number, default: 0 }
  },

  // Attendance metrics (from actual data)
  attendanceMetrics: {
    workingDays: { type: Number, default: 0 },
    presentDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    leaveDays: { type: Number, default: 0 },
    lateDays: { type: Number, default: 0 },
    attendancePercentage: { type: Number, default: 0 }
  },

  // Skill metrics
  skillMetrics: {
    currentSkillLevel: { 
      type: String,
      enum: ['Unskilled', 'Semi-Skilled', 'Skilled', 'Highly Skilled']
    },
    previousSkillLevel: String,
    skillUpgraded: { type: Boolean, default: false },
    certifications: [String],
    trainingHours: { type: Number, default: 0 }
  },

  // Safety metrics
  safetyMetrics: {
    accidentsInvolved: { type: Number, default: 0 },
    safetyTrainingCompleted: { type: Boolean, default: false },
    safetyScore: { type: Number, default: 100 },
    warningsIssued: { type: Number, default: 0 }
  },

  // Calculated scores
  calculatedScores: {
    managerScore: { type: Number, default: 0 },      // Out of 30
    productionScore: { type: Number, default: 0 },   // Out of 25
    attendanceScore: { type: Number, default: 0 },   // Out of 20
    skillScore: { type: Number, default: 0 },        // Out of 15
    safetyScore: { type: Number, default: 0 },       // Out of 10
    totalScore: { type: Number, default: 0 },        // Out of 100
    rating: { 
      type: String,
      enum: ['Excellent', 'Good', 'Average', 'Below Average', 'Poor']
    }
  },

  // Review details
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reviewDate: {
    type: Date,
    default: Date.now
  },

  // Comments
  strengths: String,
  areasForImprovement: String,
  achievements: String,
  goals: String,
  managerRemarks: String,

  // Status
  status: {
    type: String,
    enum: ['DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'COMPLETED'],
    default: 'DRAFT'
  },

  // Employee acknowledgement
  acknowledgedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  acknowledgedAt: Date,
  employeeComments: String,

  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
performanceReviewSchema.index({ employeeId: 1, reviewYear: 1 }, { unique: true });
performanceReviewSchema.index({ reviewYear: 1, status: 1 });

// Method to calculate scores
performanceReviewSchema.methods.calculateScores = function() {
  // Manager score (max 30)
  const managerAvg = (
    this.managerRatings.jobKnowledge +
    this.managerRatings.qualityOfWork +
    this.managerRatings.productivity +
    this.managerRatings.teamwork +
    this.managerRatings.initiative +
    this.managerRatings.problemSolving
  ) / 6;
  const managerScore = (managerAvg / 5) * 30;

  // Production score (max 25)
  let productionScore = 0;
  if (this.productionMetrics.achievementPercentage >= 100) {
    productionScore = 25;
  } else if (this.productionMetrics.achievementPercentage >= 90) {
    productionScore = 20;
  } else if (this.productionMetrics.achievementPercentage >= 80) {
    productionScore = 15;
  } else if (this.productionMetrics.achievementPercentage >= 70) {
    productionScore = 10;
  } else {
    productionScore = 5;
  }

  // Add quality bonus
  if (this.productionMetrics.qualityPercentage >= 98) {
    productionScore += 5;
  } else if (this.productionMetrics.qualityPercentage >= 95) {
    productionScore += 3;
  }

  // Cap at 25
  productionScore = Math.min(productionScore, 25);

  // Attendance score (max 20)
  const attendancePct = this.attendanceMetrics.attendancePercentage || 0;
  let attendanceScore = 0;
  if (attendancePct >= 98) attendanceScore = 20;
  else if (attendancePct >= 95) attendanceScore = 18;
  else if (attendancePct >= 90) attendanceScore = 15;
  else if (attendancePct >= 85) attendanceScore = 12;
  else if (attendancePct >= 80) attendanceScore = 8;
  else attendanceScore = 4;

  // Skill score (max 15)
  let skillScore = 0;
  const skillLevels = {
    'Unskilled': 1,
    'Semi-Skilled': 2,
    'Skilled': 3,
    'Highly Skilled': 4
  };
  
  const currentSkillValue = skillLevels[this.skillMetrics.currentSkillLevel] || 1;
  const previousSkillValue = skillLevels[this.skillMetrics.previousSkillLevel] || 1;
  
  // Base skill score
  skillScore = (currentSkillValue / 4) * 10;
  
  // Skill upgrade bonus
  if (this.skillMetrics.skillUpgraded) {
    skillScore += 5;
  }
  
  // Training hours bonus
  if (this.skillMetrics.trainingHours >= 40) {
    skillScore += 2;
  } else if (this.skillMetrics.trainingHours >= 20) {
    skillScore += 1;
  }
  
  skillScore = Math.min(skillScore, 15);

  // Safety score (max 10)
  let safetyScore = 10;
  if (this.safetyMetrics.accidentsInvolved > 0) {
    safetyScore -= (this.safetyMetrics.accidentsInvolved * 3);
  }
  if (this.safetyMetrics.warningsIssued > 0) {
    safetyScore -= this.safetyMetrics.warningsIssued;
  }
  safetyScore = Math.max(safetyScore, 0);

  // Total score
  const totalScore = managerScore + productionScore + attendanceScore + skillScore + safetyScore;

  // Rating
  let rating = 'Poor';
  if (totalScore >= 90) rating = 'Excellent';
  else if (totalScore >= 75) rating = 'Good';
  else if (totalScore >= 60) rating = 'Average';
  else if (totalScore >= 40) rating = 'Below Average';
  else rating = 'Poor';

  this.calculatedScores = {
    managerScore: Math.round(managerScore * 10) / 10,
    productionScore: Math.round(productionScore * 10) / 10,
    attendanceScore: Math.round(attendanceScore * 10) / 10,
    skillScore: Math.round(skillScore * 10) / 10,
    safetyScore: Math.round(safetyScore * 10) / 10,
    totalScore: Math.round(totalScore * 10) / 10,
    rating
  };

  return this.calculatedScores;
};

// Pre-save middleware
performanceReviewSchema.pre('save', function(next) {
  this.calculateScores();
  next();
});

module.exports = mongoose.model('PerformanceReview', performanceReviewSchema);