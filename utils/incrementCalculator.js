/**
 * Utility functions for increment calculations
 */

class IncrementCalculator {
  
  /**
   * Calculate new salary based on increment percentage
   */
  static calculateNewSalary(currentSalary, incrementPercentage) {
    const multiplier = 1 + (incrementPercentage / 100);
    
    const newSalary = {
      basic: Math.round(currentSalary.basic * multiplier),
      hra: Math.round(currentSalary.hra * multiplier),
      conveyance: Math.round(currentSalary.conveyance * multiplier),
      medical: Math.round(currentSalary.medical * multiplier),
      special: Math.round(currentSalary.special * multiplier)
    };

    newSalary.total = newSalary.basic + newSalary.hra + 
                     newSalary.conveyance + newSalary.medical + 
                     newSalary.special;

    return newSalary;
  }

  /**
   * Calculate increment amount
   */
  static calculateIncrementAmount(currentSalary, newSalary) {
    return {
      monthly: newSalary.total - currentSalary.total,
      annual: (newSalary.total - currentSalary.total) * 12
    };
  }

  /**
   * Calculate pro-rata increment for mid-year
   */
  static calculateProRataIncrement(currentSalary, incrementPercentage, monthsRemaining) {
    const fullYearIncrement = this.calculateNewSalary(currentSalary, incrementPercentage);
    const monthlyIncrement = (fullYearIncrement.total - currentSalary.total) / 12;
    
    const proRataAmount = monthlyIncrement * monthsRemaining;
    const proRataPercentage = (proRataAmount / currentSalary.total) * 100;

    return {
      fullYearIncrement,
      proRataAmount: Math.round(proRataAmount),
      proRataPercentage: Math.round(proRataPercentage * 10) / 10,
      monthlyIncrement: Math.round(monthlyIncrement)
    };
  }

  /**
   * Calculate department budget impact
   */
  static calculateBudgetImpact(increments, departmentBudget) {
    const totalIncrementCost = increments.reduce((sum, inc) => {
      return sum + (inc.newSalary.total - inc.previousSalary.total);
    }, 0);

    const budgetUtilization = (totalIncrementCost / departmentBudget) * 100;

    return {
      totalIncrementCost,
      budgetUtilization: Math.round(budgetUtilization * 10) / 10,
      withinBudget: budgetUtilization <= 100
    };
  }

  /**
   * Calculate performance score from metrics
   */
  static calculatePerformanceScore(metrics) {
    const weights = {
      managerRating: 0.30,
      productivity: 0.25,
      quality: 0.20,
      attendance: 0.15,
      skill: 0.10
    };

    let score = 0;

    // Manager rating (1-5 scale)
    if (metrics.managerRating) {
      score += (metrics.managerRating / 5) * 100 * weights.managerRating;
    }

    // Productivity (% of target)
    if (metrics.productivity) {
      const productivityScore = Math.min(metrics.productivity, 120); // Cap at 120%
      score += (productivityScore / 100) * 100 * weights.productivity;
    }

    // Quality (% good units)
    if (metrics.quality) {
      score += (metrics.quality / 100) * 100 * weights.quality;
    }

    // Attendance (% present)
    if (metrics.attendance) {
      score += (metrics.attendance / 100) * 100 * weights.attendance;
    }

    // Skill (1-4 scale: Unskilled=1, Semi-Skilled=2, Skilled=3, Highly Skilled=4)
    if (metrics.skillLevel) {
      const skillValues = { 'Unskilled': 1, 'Semi-Skilled': 2, 'Skilled': 3, 'Highly Skilled': 4 };
      const skillValue = skillValues[metrics.skillLevel] || 2;
      score += (skillValue / 4) * 100 * weights.skill;
    }

    return Math.round(score * 10) / 10;
  }

  /**
   * Get rating from score
   */
  static getRatingFromScore(score) {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 60) return 'Average';
    if (score >= 40) return 'Below Average';
    return 'Poor';
  }

  /**
   * Calculate compound increment over years
   */
  static calculateCompoundGrowth(currentSalary, increments) {
    let salary = currentSalary;
    const history = [];

    for (const inc of increments) {
      const newSalary = salary * (1 + inc.percentage / 100);
      history.push({
        year: inc.year,
        oldSalary: Math.round(salary),
        newSalary: Math.round(newSalary),
        percentage: inc.percentage,
        amount: Math.round(newSalary - salary)
      });
      salary = newSalary;
    }

    return {
      finalSalary: Math.round(salary),
      totalGrowth: Math.round(((salary - currentSalary) / currentSalary) * 100 * 10) / 10,
      history
    };
  }

  /**
   * Calculate increment distribution for reporting
   */
  static calculateDistribution(increments) {
    const brackets = {
      '0-3%': 0,
      '3-6%': 0,
      '6-9%': 0,
      '9-12%': 0,
      '12-15%': 0,
      '15%+': 0
    };

    increments.forEach(inc => {
      const pct = inc.incrementPercentage.overall;
      if (pct < 3) brackets['0-3%']++;
      else if (pct < 6) brackets['3-6%']++;
      else if (pct < 9) brackets['6-9%']++;
      else if (pct < 12) brackets['9-12%']++;
      else if (pct < 15) brackets['12-15%']++;
      else brackets['15%+']++;
    });

    const total = increments.length;
    const distribution = {};

    Object.keys(brackets).forEach(key => {
      distribution[key] = {
        count: brackets[key],
        percentage: total > 0 ? Math.round((brackets[key] / total) * 100 * 10) / 10 : 0
      };
    });

    return distribution;
  }
}

module.exports = IncrementCalculator;