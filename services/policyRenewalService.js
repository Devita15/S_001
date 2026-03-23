const MediclaimPolicy = require('../models/HR/MediclaimPolicy');
const MediclaimEnrollment = require('../models/HR/MediclaimEnrollment');
const Employee = require('../models/HR/Employee');
const emailService = require('./emailService');

/**
 * Auto-renew expiring policies
 * This function will be called by cron job
 */
exports.autoRenewPolicies = async () => {
  console.log('🔄 Checking for policies to renew -', new Date().toISOString());
  
  try {
    const today = new Date();
    const renewalWindowStart = new Date(today);
    const renewalWindowEnd = new Date(today);
    
    // Look for policies expiring in next 7 days (adjust as needed)
    renewalWindowEnd.setDate(today.getDate() + 7);
    
    // Find active policies expiring within the window
    const expiringPolicies = await MediclaimPolicy.find({
      validityEnd: {
        $gte: today,
        $lte: renewalWindowEnd
      },
      status: 'active'
    });
    
    if (expiringPolicies.length === 0) {
      console.log('📭 No policies expiring in the next 7 days');
      return { renewed: 0, skipped: 0, errors: 0 };
    }
    
    console.log(`📋 Found ${expiringPolicies.length} policies to process for renewal`);
    
    let renewedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const renewalResults = [];
    
    for (const oldPolicy of expiringPolicies) {
      try {
        // Check if already renewed
        if (oldPolicy.renewedFrom) {
          console.log(`⏭️ Policy ${oldPolicy.policyName} already has renewal: ${oldPolicy.renewedFrom}`);
          skippedCount++;
          continue;
        }
        
        // Get active enrollments for this policy
        const enrollments = await MediclaimEnrollment.find({
          policyId: oldPolicy._id,
          status: 'active'
        }).populate('employeeId');
        
        // Calculate new premium based on current employee count
        const activeEmployees = await Employee.countDocuments({ EmploymentStatus: 'active' });
        const enrolledCount = enrollments.length;
        
        // Determine new premium amount (you can customize this logic)
        let newPremiumPerEmployee = oldPolicy.premiumDetails.amountPerEmployee;
        
        // Apply any premium increase (e.g., 10% increase)
        // You can make this configurable
        const PREMIUM_INCREASE_PERCENTAGE = 10;
        newPremiumPerEmployee = newPremiumPerEmployee * (1 + PREMIUM_INCREASE_PERCENTAGE / 100);
        
        // Calculate new validity dates
        const newValidityStart = new Date(oldPolicy.validityEnd);
        newValidityStart.setDate(newValidityStart.getDate() + 1); // Start day after expiry
        
        const newValidityEnd = new Date(newValidityStart);
        newValidityEnd.setFullYear(newValidityEnd.getFullYear() + 1); // +1 year
        
        // Generate new policy ID
        const year = newValidityStart.getFullYear();
        const lastPolicy = await MediclaimPolicy.findOne({
          policyId: new RegExp(`^POL-${year}-`)
        }).sort({ policyId: -1 });
        
        let nextNumber = 1;
        if (lastPolicy) {
          const lastNumber = parseInt(lastPolicy.policyId.split('-')[2]);
          nextNumber = lastNumber + 1;
        }
        
        const newPolicyId = `POL-${year}-${nextNumber.toString().padStart(3, '0')}`;
        
        // Create new policy
        const newPolicy = new MediclaimPolicy({
          policyId: newPolicyId,
          policyName: `${oldPolicy.policyName} (Renewal ${year})`,
          insurer: oldPolicy.insurer,
          policyNumber: `${oldPolicy.policyNumber}-R${year}`, // Modified policy number
          coverageAmount: oldPolicy.coverageAmount,
          coverageType: oldPolicy.coverageType,
          familyCoverage: oldPolicy.familyCoverage,
          validityStart: newValidityStart,
          validityEnd: newValidityEnd,
          premiumDetails: {
            amountPerEmployee: newPremiumPerEmployee,
            totalPremium: enrolledCount * newPremiumPerEmployee,
            paymentFrequency: oldPolicy.premiumDetails.paymentFrequency,
            paymentStatus: 'pending', // New policy payment pending
            paymentMode: oldPolicy.premiumDetails.paymentMode
          },
          networkHospitals: oldPolicy.networkHospitals,
          waitingPeriods: oldPolicy.waitingPeriods,
          exclusions: oldPolicy.exclusions,
          policyDocuments: oldPolicy.policyDocuments,
          createdBy: 'SYSTEM_RENEWAL',
          status: 'active'
        });
        
        await newPolicy.save();
        
        // Update old policy
        oldPolicy.status = 'expired';
        oldPolicy.renewedFrom = newPolicy.policyId;
        oldPolicy.renewalAlertDate = new Date();
        await oldPolicy.save();
        
        // Create new enrollments for existing employees
        for (const enrollment of enrollments) {
          const newEnrollment = new MediclaimEnrollment({
            employeeId: enrollment.employeeId._id,
            policyId: newPolicy._id,
            enrollmentDate: new Date(),
            coverageType: enrollment.coverageType,
            familyMembers: enrollment.familyMembers,
            status: 'active',
            createdBy: 'SYSTEM_RENEWAL'
          });
          await newEnrollment.save();
        }
        
        console.log(`✅ Renewed policy: ${oldPolicy.policyName} → ${newPolicy.policyId}`);
        console.log(`   Enrollments carried forward: ${enrolledCount}`);
        
        // Send notification emails
        await sendRenewalNotifications(oldPolicy, newPolicy, enrollments);
        
        renewalResults.push({
          oldPolicyId: oldPolicy._id,
          newPolicyId: newPolicy._id,
          enrollmentsCarried: enrolledCount
        });
        
        renewedCount++;
        
      } catch (policyError) {
        console.error(`❌ Error renewing policy ${oldPolicy.policyName}:`, policyError.message);
        errorCount++;
      }
    }
    
    console.log(`📊 Renewal Summary: ${renewedCount} renewed, ${skippedCount} skipped, ${errorCount} errors`);
    
    return {
      renewed: renewedCount,
      skipped: skippedCount,
      errors: errorCount,
      details: renewalResults
    };
    
  } catch (error) {
    console.error('❌ Error in auto-renewal process:', error);
    throw error;
  }
};

/**
 * Send renewal notifications
 */
async function sendRenewalNotifications(oldPolicy, newPolicy, enrollments) {
  try {
    // Notify HR/Admin
    const adminEmails = ['hr@company.com', 'finance@company.com']; // Configure this
    
    for (const email of adminEmails) {
      await emailService.sendEmail({
        to: email,
        subject: `Policy Renewed: ${oldPolicy.policyName}`,
        html: `
          <h2>Policy Renewal Completed</h2>
          <p><strong>Old Policy:</strong> ${oldPolicy.policyName} (${oldPolicy.policyNumber})</p>
          <p><strong>New Policy:</strong> ${newPolicy.policyName} (${newPolicy.policyNumber})</p>
          <p><strong>Validity:</strong> ${newPolicy.validityStart.toLocaleDateString()} - ${newPolicy.validityEnd.toLocaleDateString()}</p>
          <p><strong>Enrollments Carried Forward:</strong> ${enrollments.length}</p>
          <p><strong>Total Premium:</strong> ₹${newPolicy.premiumDetails.totalPremium}</p>
          <p><strong>Payment Status:</strong> ${newPolicy.premiumDetails.paymentStatus}</p>
          <hr>
          <p>Please ensure payment is processed to keep the policy active.</p>
        `
      });
    }
    
    console.log(`📧 Renewal notifications sent for ${oldPolicy.policyName}`);
  } catch (emailError) {
    console.error('Error sending renewal emails:', emailError);
  }
}

/**
 * Send renewal reminders for policies expiring soon
 */
exports.sendRenewalReminders = async () => {
  try {
    const today = new Date();
    const thirtyDaysLater = new Date(today);
    thirtyDaysLater.setDate(today.getDate() + 30);
    
    const expiringPolicies = await MediclaimPolicy.find({
      validityEnd: {
        $gte: today,
        $lte: thirtyDaysLater
      },
      status: 'active',
      renewalAlertSent: false
    });
    
    for (const policy of expiringPolicies) {
      const daysLeft = Math.ceil((policy.validityEnd - today) / (1000 * 60 * 60 * 24));
      
      // Send reminder email
      await emailService.sendEmail({
        to: 'hr@company.com', // Configure this
        subject: `⚠️ Policy Renewal Reminder: ${policy.policyName}`,
        html: `
          <h2>Policy Renewal Reminder</h2>
          <p><strong>Policy:</strong> ${policy.policyName}</p>
          <p><strong>Expires in:</strong> ${daysLeft} days</p>
          <p><strong>Expiry Date:</strong> ${policy.validityEnd.toLocaleDateString()}</p>
          <p><strong>Enrolled Employees:</strong> ${await MediclaimEnrollment.countDocuments({ policyId: policy._id, status: 'active' })}</p>
          <hr>
          <p>Please initiate renewal process to avoid coverage gap.</p>
        `
      });
      
      policy.renewalAlertSent = true;
      policy.renewalAlertDate = new Date();
      await policy.save();
    }
  } catch (error) {
    console.error('Error sending renewal reminders:', error);
  }
};