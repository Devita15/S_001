const EmployeeBehavior = require('../models/HR/EmployeeBehavior');
const IncrementPolicy = require('../models/HR/IncrementPolicy');
const mongoose = require('mongoose');

class BehaviorScoreService {
  
  /**
   * Calculate behavior score for an employee for a given year
   */
  async calculateYearlyScore(employeeId, year, policyId = null) {
    try {
      // Define date range
      const startDate = new Date(year, 0, 1); // Jan 1
      const endDate = new Date(year, 11, 31, 23, 59, 59); // Dec 31
      
      // Fetch policy (either provided or active for that year)
      let policy = policyId ? 
        await IncrementPolicy.findById(policyId) :
        await IncrementPolicy.findOne({ year, status: 'ACTIVE' });
      
      if (!policy) {
        throw new Error(`No active increment policy found for year ${year}`);
      }
      
      // Fetch all behavior records for the employee in that year
      const behaviors = await EmployeeBehavior.find({
        employeeId: employeeId,
        createdAt: { $gte: startDate, $lte: endDate },
        isDeleted: { $ne: true }
      });
      
      if (behaviors.length === 0) {
        return {
          score: 3.0, // Default middle score
          category: 'Average',
          summary: {
            totalFeedbacks: 0,
            positiveCount: 0,
            negativeCount: 0,
            neutralCount: 0,
            escalatedCount: 0,
            categoryAverages: {}
          }
        };
      }
      
      // Group by category
      const categoryGroups = {};
      behaviors.forEach(b => {
        if (!categoryGroups[b.category]) {
          categoryGroups[b.category] = [];
        }
        categoryGroups[b.category].push(b.rating);
      });
      
      // Calculate category averages
      const categoryAverages = {};
      Object.keys(categoryGroups).forEach(category => {
        const sum = categoryGroups[category].reduce((a, b) => a + b, 0);
        categoryAverages[category] = sum / categoryGroups[category].length;
      });
      
      // Apply weights from policy
      let weightedScore = 0;
      let totalWeight = 0;
      
      const weights = policy.categoryWeights || new Map();
      
      Object.keys(categoryAverages).forEach(category => {
        const weight = weights.get(category) || 10; // Default 10% if not defined
        weightedScore += categoryAverages[category] * (weight / 100);
        totalWeight += weight;
      });
      
      // If some categories have no data, distribute remaining weight to available categories
      if (totalWeight < 100) {
        const remainingWeight = 100 - totalWeight;
        const availableCategories = Object.keys(categoryAverages);
        
        if (availableCategories.length > 0) {
          const additionalWeightPerCategory = remainingWeight / availableCategories.length;
          Object.keys(categoryAverages).forEach(category => {
            weightedScore += categoryAverages[category] * (additionalWeightPerCategory / 100);
          });
        }
      }
      
      let finalScore = weightedScore;
      
      // Apply penalties
      const negativeCount = behaviors.filter(b => b.type === 'Negative').length;
      const escalatedCount = behaviors.filter(b => b.status === 'Escalated').length;
      
      if (negativeCount >= (policy.penaltyRules?.negativeFeedbackThreshold || 3)) {
        finalScore -= (policy.penaltyRules?.penaltyPercent || 0.5);
      }
      
      finalScore -= (escalatedCount * (policy.penaltyRules?.escalatedCasePenalty || 0.2));
      
      // Clamp score between 0 and 5
      finalScore = Math.max(0, Math.min(5, finalScore));
      
      // Determine category
      let category = 'Average';
      for (const rule of policy.rules) {
        if (finalScore >= rule.minScore && finalScore <= rule.maxScore) {
          category = rule.category;
          break;
        }
      }
      
      return {
        score: Number(finalScore.toFixed(2)),
        category,
        summary: {
          totalFeedbacks: behaviors.length,
          positiveCount: behaviors.filter(b => b.type === 'Positive').length,
          negativeCount,
          neutralCount: behaviors.filter(b => b.type === 'Neutral').length,
          escalatedCount,
          categoryAverages
        }
      };
      
    } catch (error) {
      console.error('Behavior score calculation error:', error);
      throw error;
    }
  }
  
  /**
   * Calculate scores for multiple employees (batch)
   */
  async calculateBatchScores(employeeIds, year, policyId = null) {
    const results = [];
    
    for (const employeeId of employeeIds) {
      try {
        const score = await this.calculateYearlyScore(employeeId, year, policyId);
        results.push({
          employeeId,
          ...score
        });
      } catch (error) {
        results.push({
          employeeId,
          error: error.message
        });
      }
    }
    
    return results;
  }
}

module.exports = new BehaviorScoreService();