const OfferApprovalFlow = require('../models/HR/OfferApprovalFlow');
const User = require("../models/user's & setting's/User");
const notificationService = require('./notificationService');

class WorkflowService {
  
  // Initialize approval workflow
  async initApprovalFlow(offer, initiatedBy) {
    try {
      // Determine workflow type based on CTC
      let workflowType = 'standard';
      if (offer.ctcDetails.totalCtc > 2000000) {
        workflowType = 'executive';
      } else if (offer.ctcDetails.totalCtc > 1000000) {
        workflowType = 'high_value';
      }

      // Define approval steps
      const steps = [];
      
      // Step 1: Hiring Manager
      steps.push({
        stepNumber: 1,
        approverRole: 'Hiring Manager',
        status: 'pending'
      });

      // Step 2: Finance Head (for high value offers)
      if (workflowType !== 'standard') {
        steps.push({
          stepNumber: 2,
          approverRole: 'Finance Head',
          status: 'pending'
        });
      }

      // Step 3: CEO (for executive level)
      if (workflowType === 'executive') {
        steps.push({
          stepNumber: steps.length + 1,
          approverRole: 'CEO',
          status: 'pending'
        });
      }

      // Create approval flow
      const approvalFlow = await OfferApprovalFlow.create({
        offerId: offer._id,
        workflowType,
        steps,
        currentStep: 1,
        status: 'in_progress',
        initiatedBy: initiatedBy._id,
        initiatedByName: initiatedBy.Username || 'HR',
        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days expiry
      });

      // Notify first approver
      await this.notifyNextApprover(approvalFlow);

      return approvalFlow;
    } catch (error) {
      console.error('Init approval flow error:', error);
      throw error;
    }
  }

  // Process approval step
  async processApproval(approvalFlowId, approverId, action, data = {}) {
    try {
      const approvalFlow = await OfferApprovalFlow.findById(approvalFlowId)
        .populate('offerId');

      if (!approvalFlow) {
        throw new Error('Approval flow not found');
      }

      const currentStep = approvalFlow.steps[approvalFlow.currentStep - 1];

      // Update current step
      currentStep.status = action;
      currentStep.actionDate = new Date();
      currentStep.approverId = approverId;
      currentStep.approverName = data.approverName;
      currentStep.comments = data.comments;
      currentStep.signature = data.signature;

      if (action === 'approved') {
        // Move to next step or complete
        if (approvalFlow.currentStep < approvalFlow.steps.length) {
          approvalFlow.currentStep += 1;
          await this.notifyNextApprover(approvalFlow);
        } else {
          approvalFlow.status = 'completed';
          approvalFlow.completedAt = new Date();
          
          // Update offer status
          const Offer = require('../models/HR/Offer');
          await Offer.findByIdAndUpdate(approvalFlow.offerId._id, {
            status: 'approved'
          });
        }
      } else if (action === 'rejected') {
        approvalFlow.status = 'rejected';
        approvalFlow.completedAt = new Date();
        
        // Update offer status
        const Offer = require('../models/HR/Offer');
        await Offer.findByIdAndUpdate(approvalFlow.offerId._id, {
          status: 'rejected'
        });
      }

      await approvalFlow.save();

      return approvalFlow;
    } catch (error) {
      console.error('Process approval error:', error);
      throw error;
    }
  }

  // Notify next approver
  async notifyNextApprover(approvalFlow) {
    try {
      const currentStep = approvalFlow.steps[approvalFlow.currentStep - 1];
      
      // Find users with this role
      const users = await User.find()
        .populate({
          path: 'RoleID',
          match: { RoleName: currentStep.approverRole }
        });

      for (const user of users) {
        if (user.RoleID) {
          await notificationService.createNotification({
            userId: user._id,
            type: 'approval_request',
            title: 'Offer Approval Required',
            message: `An offer requires your approval. Please review and take action.`,
            data: {
              offerId: approvalFlow.offerId,
              approvalFlowId: approvalFlow._id,
              link: `/offers/${approvalFlow.offerId}/approval`
            }
          });

          // Update notifiedAt
          currentStep.notifiedAt = new Date();
          await approvalFlow.save();
        }
      }
    } catch (error) {
      console.error('Notify next approver error:', error);
    }
  }

  // Check for expired approvals
  async checkExpiredApprovals() {
    try {
      const expiredFlows = await OfferApprovalFlow.find({
        status: 'in_progress',
        expiryDate: { $lt: new Date() }
      });

      for (const flow of expiredFlows) {
        flow.status = 'rejected';
        await flow.save();

        // Update offer
        const Offer = require('../models/HR/Offer');
        await Offer.findByIdAndUpdate(flow.offerId, {
          status: 'expired'
        });
      }
    } catch (error) {
      console.error('Check expired approvals error:', error);
    }
  }
}

module.exports = new WorkflowService();