// controllers/bgvController.js
const BackgroundVerification = require('../models/BackgroundVerification');
const mongoose = require('mongoose');

// @desc    Initiate background verification
// @route   POST /api/bgv/initiate
// @access  Private (HR, SuperAdmin/CEO)
const initiateBGV = async (req, res) => {
  try {
    const { candidateId, offerId, vendor = 'authbridge' } = req.body;

    // Validate required fields
    if (!candidateId || !offerId) {
      return res.status(400).json({
        success: false,
        message: 'Candidate ID and Offer ID are required'
      });
    }

    // Validate if candidate exists
    const Candidate = mongoose.model('Candidate');
    const candidate = await Candidate.findById(candidateId);
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found'
      });
    }

    // Check if BGV already exists for this candidate/offer
    const existingBGV = await BackgroundVerification.findOne({
      candidateId,
      offerId,
      status: { $nin: ['completed', 'failed'] }
    });

    if (existingBGV) {
      return res.status(400).json({
        success: false,
        message: 'Active background verification already exists for this candidate/offer'
      });
    }

    // Create new BGV record
    const bgvData = {
      candidateId,
      offerId,
      vendor,
      status: 'pending',
      initiatedBy: req.user._id, // Assuming user is attached by auth middleware
      checks: [
        { type: 'identity', status: 'pending' },
        { type: 'address', status: 'pending' },
        { type: 'education', status: 'pending' },
        { type: 'employment', status: 'pending' },
        { type: 'criminal', status: 'pending' }
      ]
    };

    const bgv = new BackgroundVerification(bgvData);
    await bgv.save();

    // Populate for response
    const populatedBGV = await BackgroundVerification.findById(bgv._id)
      .populate('candidateId', 'firstName lastName email phone')
      .populate('offerId', 'offerId status')
      .populate('initiatedBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Background verification initiated successfully',
      data: populatedBGV
    });

  } catch (error) {
    console.error('Initiate BGV error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Approve or reject background verification
// @route   PUT /api/bgv/:id/decision
// @access  Private (HR, SuperAdmin/CEO)
const decideBGV = async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, remarks } = req.body; // decision: 'approve' or 'reject'
    
    // Validate decision
    if (!decision || !['approve', 'reject'].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid decision: approve or reject'
      });
    }
    
    // Validate MongoDB ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid BGV ID format'
      });
    }
    
    // Find the BGV
    const bgv = await BackgroundVerification.findById(id);
    
    if (!bgv) {
      return res.status(404).json({
        success: false,
        message: 'Background verification not found'
      });
    }
    
    // Check if BGV is already completed or disposed
    if (bgv.status === 'completed' || bgv.status === 'disputed') {
      return res.status(400).json({
        success: false,
        message: `BGV is already ${bgv.status} and cannot be ${decision}d`
      });
    }
    
    // Update based on decision
    if (decision === 'approve') {
      bgv.status = 'completed';
      bgv.completedAt = new Date();
      bgv.remarks = remarks || 'Background verification approved';
      
      // Optionally mark all pending checks as cleared
      bgv.checks = bgv.checks.map(check => {
        if (check.status === 'pending' || check.status === 'in_progress') {
          return {
            ...check,
            status: 'cleared',
            completedAt: new Date()
          };
        }
        return check;
      });
      
    } else if (decision === 'reject') {
      bgv.status = 'failed';
      bgv.completedAt = new Date();
      bgv.remarks = remarks || 'Background verification rejected';
      
      // Optionally mark all pending checks as failed
      bgv.checks = bgv.checks.map(check => {
        if (check.status === 'pending' || check.status === 'in_progress') {
          return {
            ...check,
            status: 'failed',
            completedAt: new Date()
          };
        }
        return check;
      });
    }
    
    await bgv.save();
    
    // Populate for response
    const updatedBGV = await BackgroundVerification.findById(id)
      .populate('candidateId', 'firstName lastName email')
      .populate('offerId', 'offerId status')
      .populate('initiatedBy', 'name email');
    
    res.status(200).json({
      success: true,
      message: `Background verification ${decision}d successfully`,
      data: {
        _id: updatedBGV._id, // MongoDB ID
        bgvId: updatedBGV.bgvId,
        status: updatedBGV.status,
        completedAt: updatedBGV.completedAt,
        remarks: updatedBGV.remarks,
        candidate: updatedBGV.candidateId,
        checks: updatedBGV.checks
      }
    });
    
  } catch (error) {
    console.error('BGV decision error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Get all background verifications
// @route   GET /api/bgv
// @access  Private (HR, SuperAdmin/CEO)
const getAllBGV = async (req, res) => {
  try {
    // Extract query parameters for filtering
    const { status, vendor, candidateId, page = 1, limit = 10 } = req.query;
    
    // Build filter object
    const filter = {};
    if (status) filter.status = status;
    if (vendor) filter.vendor = vendor;
    if (candidateId) filter.candidateId = candidateId;
    
    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Fetch BGVs with populated references
    const bgvs = await BackgroundVerification.find(filter)
      .populate('candidateId', 'firstName lastName email phone') // Populate candidate fields
      .populate('offerId', 'offerId status') // Populate offer fields
      .populate('initiatedBy', 'name email') // Populate user who initiated
      .sort({ createdAt: -1 }) // Most recent first
      .skip(skip)
      .limit(limitNum);
    
    // Get total count for pagination
    const total = await BackgroundVerification.countDocuments(filter);
    
    // Format response to ensure proper MongoDB IDs are exposed
    const formattedBgvs = bgvs.map(bgv => ({
      _id: bgv._id, // This is the MongoDB ID you asked for
      bgvId: bgv.bgvId,
      candidate: bgv.candidateId,
      offer: bgv.offerId,
      vendor: bgv.vendor,
      status: bgv.status,
      checks: bgv.checks,
      documents: bgv.documents,
      reportUrl: bgv.reportUrl,
      reportGeneratedAt: bgv.reportGeneratedAt,
      initiatedBy: bgv.initiatedBy,
      completedAt: bgv.completedAt,
      remarks: bgv.remarks,
      createdAt: bgv.createdAt,
      updatedAt: bgv.updatedAt
    }));
    
    res.status(200).json({
      success: true,
      count: formattedBgvs.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      data: formattedBgvs
    });
  } catch (error) {
    console.error('Get all BGV error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Get BGV status
// @route   GET /api/bgv/:id
// @access  Private (HR, SuperAdmin/CEO)
const getBGVStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid BGV ID format'
      });
    }

    res.json({
      success: true,
      data: {
        status: 'pending',
        checks: []
      }
    });
  } catch (error) {
    console.error('Get BGV status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Get BGV report
// @route   GET /api/bgv/:id/report
// @access  Private (HR, SuperAdmin/CEO)
const getBGVReport = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid BGV ID format'
      });
    }

    // Find the BGV record in database
    const bgv = await BackgroundVerification.findById(id)
      .populate('candidateId', 'firstName lastName email')
      .populate('offerId', 'offerId');

    if (!bgv) {
      return res.status(404).json({
        success: false,
        message: 'Background verification not found'
      });
    }

    // Check if report exists
    if (!bgv.reportUrl) {
      return res.status(404).json({
        success: false,
        message: 'Report not available for this background verification'
      });
    }

    // Return the report URL
    res.json({
      success: true,
      data: {
        reportUrl: bgv.reportUrl,
        generatedAt: bgv.reportGeneratedAt,
        bgvId: bgv.bgvId,
        candidate: bgv.candidateId,
        status: bgv.status
      }
    });
  } catch (error) {
    console.error('Get BGV report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Handle webhook from BGV vendor
// @route   POST /api/bgv/webhook
// @access  Public
const handleWebhook = async (req, res) => {
  try {
    const payload = req.body;
    console.log('Received BGV webhook:', payload);

    res.status(200).json({
      success: true,
      message: 'Webhook received'
    });
  } catch (error) {
    console.error('Webhook handling error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};



module.exports = {
  initiateBGV,
  getBGVStatus,
  getBGVReport,
  handleWebhook,
  decideBGV,
  getAllBGV
};