class CTCCalculatorService {
  
  // Calculate CTC components based on rules
  calculateCTC(params) {
    const {
      basic, // Monthly basic salary
      hraPercent = 50, // HRA as % of basic
      conveyanceAllowance = 1600, // Monthly
      medicalAllowance = 1250, // Monthly
      specialAllowance = 0,
      bonusPercent = 8.33, // Annual bonus as % of basic
      employerPfPercent = 12, // Employer PF contribution % of basic
      employerEsiPercent = 3.25, // Employer ESI contribution % of gross (if applicable)
      gratuityPercent = 4.81, // Gratuity as % of basic
      otherAllowances = 0,
      isEsiApplicable = true,
      pfWageLimit = 15000, // PF wage limit
      gratuityApplicable = true
    } = params;

    // Monthly calculations
    const monthlyBasic = basic;
    const monthlyHRA = (monthlyBasic * hraPercent) / 100;
    const monthlyConveyance = conveyanceAllowance;
    const monthlyMedical = medicalAllowance;
    const monthlySpecial = specialAllowance;
    const monthlyOther = otherAllowances;

    // Monthly gross
    const monthlyGross = 
      monthlyBasic +
      monthlyHRA +
      monthlyConveyance +
      monthlyMedical +
      monthlySpecial +
      monthlyOther;

    // Annual calculations
    const annualBasic = monthlyBasic * 12;
    const annualHRA = monthlyHRA * 12;
    const annualConveyance = monthlyConveyance * 12;
    const annualMedical = monthlyMedical * 12;
    const annualSpecial = monthlySpecial * 12;
    const annualOther = monthlyOther * 12;
    const annualGross = monthlyGross * 12;

    // PF calculation (on basic up to wage limit)
    const pfBasic = Math.min(monthlyBasic, pfWageLimit);
    const monthlyEmployerPf = (pfBasic * employerPfPercent) / 100;
    const annualEmployerPf = monthlyEmployerPf * 12;

    // ESI calculation (on gross if applicable)
    let monthlyEmployerEsi = 0;
    if (isEsiApplicable && monthlyGross <= 21000) {
      monthlyEmployerEsi = (monthlyGross * employerEsiPercent) / 100;
    }
    const annualEmployerEsi = monthlyEmployerEsi * 12;

    // Bonus calculation (annual)
    const annualBonus = (annualBasic * bonusPercent) / 100;

    // Gratuity calculation (annual)
    let annualGratuity = 0;
    if (gratuityApplicable) {
      annualGratuity = (annualBasic * gratuityPercent) / 100;
    }

    // Total CTC
    const totalCTC = 
      annualGross +
      annualBonus +
      annualEmployerPf +
      annualEmployerEsi +
      annualGratuity;

    return {
      monthly: {
        basic: monthlyBasic,
        hra: monthlyHRA,
        conveyance: monthlyConveyance,
        medical: monthlyMedical,
        special: monthlySpecial,
        other: monthlyOther,
        gross: monthlyGross,
        employerPf: monthlyEmployerPf,
        employerEsi: monthlyEmployerEsi
      },
      annual: {
        basic: annualBasic,
        hra: annualHRA,
        conveyance: annualConveyance,
        medical: annualMedical,
        special: annualSpecial,
        other: annualOther,
        gross: annualGross,
        bonus: annualBonus,
        employerPf: annualEmployerPf,
        employerEsi: annualEmployerEsi,
        gratuity: annualGratuity,
        totalCTC
      },
      percentages: {
        hra: hraPercent,
        bonus: bonusPercent,
        employerPf: employerPfPercent,
        employerEsi: employerEsiPercent,
        gratuity: gratuityPercent
      }
    };
  }

  // Calculate in-hand salary (after deductions)
  calculateInHand(ctc, deductions = {}) {
    const {
      employeePfPercent = 12,
      employeeEsiPercent = 0.75,
      professionalTax = 200, // Monthly PT
      incomeTax = 0
    } = deductions;

    const monthlyGross = ctc.monthly.gross;
    
    // Employee PF contribution
    const pfBasic = Math.min(ctc.monthly.basic, 15000);
    const employeePf = (pfBasic * employeePfPercent) / 100;
    
    // Employee ESI contribution (if applicable)
    let employeeEsi = 0;
    if (ctc.monthly.gross <= 21000) {
      employeeEsi = (ctc.monthly.gross * employeeEsiPercent) / 100;
    }

    // Monthly deductions
    const totalDeductions = 
      employeePf +
      employeeEsi +
      professionalTax +
      (incomeTax / 12);

    const monthlyInHand = monthlyGross - totalDeductions;

    return {
      monthly: {
        gross: monthlyGross,
        deductions: {
          employeePf,
          employeeEsi,
          professionalTax,
          incomeTax: incomeTax / 12,
          total: totalDeductions
        },
        inHand: monthlyInHand
      },
      annual: {
        gross: ctc.annual.gross,
        deductions: totalDeductions * 12,
        inHand: monthlyInHand * 12
      }
    };
  }

  // Validate CTC components
  validateCTC(ctcComponents) {
    const errors = [];
    
    if (!ctcComponents.basic || ctcComponents.basic < 0) {
      errors.push('Basic salary must be a positive number');
    }
    
    
    if (ctcComponents.hraPercent && (ctcComponents.hraPercent < 0 || ctcComponents.hraPercent > 100)) {
      errors.push('HRA percentage must be between 0 and 100');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = new CTCCalculatorService();