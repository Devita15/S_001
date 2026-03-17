// seeders/incrementPolicySeeder.js
const IncrementPolicy = require('../models/IncrementPolicy');

const seedDefaultPolicy = async () => {
  try {
    const existing = await IncrementPolicy.findOne({ year: 2025 });
    
    if (!existing) {
      const policy = new IncrementPolicy({
        year: 2025,
        name: 'Annual Increment 2025',
        status: 'ACTIVE',
        rules: [
          { minScore: 4.5, maxScore: 5, incrementPercent: 15, category: 'Excellent', description: 'Outstanding performance' },
          { minScore: 4.0, maxScore: 4.49, incrementPercent: 12, category: 'Good', description: 'Good performance' },
          { minScore: 3.5, maxScore: 3.99, incrementPercent: 8, category: 'Average', description: 'Average performance' },
          { minScore: 3.0, maxScore: 3.49, incrementPercent: 5, category: 'Below Average', description: 'Needs improvement' },
          { minScore: 0, maxScore: 2.99, incrementPercent: 0, category: 'Poor', description: 'No increment' }
        ],
        categoryWeights: new Map([
          ['Performance', 30],
          ['Discipline', 20],
          ['Attendance Behavior', 15],
          ['Teamwork', 10],
          ['Quality of Work', 15],
          ['Initiative', 5],
          ['Communication', 5]
        ]),
        maxIncrementPercent: 20,
        minIncrementPercent: 0,
        penaltyRules: {
          negativeFeedbackThreshold: 3,
          penaltyPercent: 0.5,
          escalatedCasePenalty: 1
        },
        applyOn: 'BASIC',
        proRataForPartialYear: true,
        probationExclude: true,
        promotionOverride: {
          enabled: true,
          minIncrementPercent: 20
        },
        effectiveFrom: new Date('2025-04-01'),
        createdBy: null // Will be set by system
      });
      
      await policy.save();
      console.log('✅ Default increment policy seeded for 2025');
    } else {
      console.log('📌 Increment policy already exists for 2025');
    }
  } catch (error) {
    console.error('❌ Error seeding increment policy:', error);
  }
};

module.exports = seedDefaultPolicy;