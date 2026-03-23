// controllers/Quality/ncrController.js
const NCR = require('../../models/Quality/NCR');
const GRN = require('../../models/Procurement/GRN');
const PurchaseOrder = require('../../models/Procurement/PurchaseOrder');
const Vendor = require('../../models/CRM/Vendor');

// ======================================================
// GET NCR BY GRN ID
// GET /api/ncr/grn/:grnId
// ======================================================
exports.getNCRByGRNId = async (req, res) => {
  try {
    const { grnId } = req.params;

    const ncr = await NCR.findOne({ grn_id: grnId })
      .populate('grn_id', 'grn_number grn_date')
      .populate('po_id', 'po_number')
      .populate('vendor_id', 'vendor_name vendor_code email phone')
      .populate('item_id', 'part_no part_description')
      .populate('created_by', 'Username Email')
      .populate('closed_by', 'Username Email')
      .populate('disposition_approved_by', 'Username Email');

    if (!ncr) {
      return res.status(404).json({
        success: false,
        message: 'NCR not found for this GRN',
        error: 'NCR_NOT_FOUND'
      });
    }

    res.status(200).json({
      success: true,
      data: ncr
    });

  } catch (error) {
    console.error('Get NCR by GRN error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch NCR',
      error: error.message
    });
  }
};

// ======================================================
// GET NCR BY ID
// GET /api/ncr/:id
// ======================================================
exports.getNCRById = async (req, res) => {
  try {
    const { id } = req.params;

    const ncr = await NCR.findById(id)
      .populate('grn_id', 'grn_number grn_date receiving_store')
      .populate('po_id', 'po_number po_date')
      .populate('vendor_id', 'vendor_name vendor_code email phone address')
      .populate('item_id', 'part_no part_description hsn_code unit')
      .populate('created_by', 'Username Email')
      .populate('updated_by', 'Username Email')
      .populate('closed_by', 'Username Email')
      .populate('disposition_approved_by', 'Username Email')
      .populate('immediate_actions.assigned_to', 'Username Email')
      .populate('corrective_actions.assigned_to', 'Username Email')
      .populate('preventive_actions.assigned_to', 'Username Email');

    if (!ncr) {
      return res.status(404).json({
        success: false,
        message: 'NCR not found',
        error: 'NCR_NOT_FOUND'
      });
    }

    res.status(200).json({
      success: true,
      data: ncr
    });

  } catch (error) {
    console.error('Get NCR by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch NCR',
      error: error.message
    });
  }
};

// ======================================================
// GET ALL NCRs (with filters)
// GET /api/ncr
// ======================================================
exports.getAllNCRs = async (req, res) => {
  try {
    const {
      status,
      severity,
      ncr_type,
      vendor_id,
      po_id,
      grn_id,
      from_date,
      to_date,
      page = 1,
      limit = 20,
      sort_by = 'createdAt',
      sort_order = 'desc'
    } = req.query;

    let filter = {};

    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (ncr_type) filter.ncr_type = ncr_type;
    if (vendor_id) filter.vendor_id = vendor_id;
    if (po_id) filter.po_id = po_id;
    if (grn_id) filter.grn_id = grn_id;

    if (from_date || to_date) {
      filter.ncr_date = {};
      if (from_date) filter.ncr_date.$gte = new Date(from_date);
      if (to_date) filter.ncr_date.$lte = new Date(to_date);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sort_by] = sort_order === 'asc' ? 1 : -1;

    const ncrs = await NCR.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('vendor_id', 'vendor_name vendor_code')
      .populate('po_id', 'po_number')
      .populate('grn_id', 'grn_number')
      .populate('item_id', 'part_no part_description')
      .populate('created_by', 'Username Email');

    const total = await NCR.countDocuments(filter);

    // Add statistics
    const stats = await NCR.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total_rejected_qty: { $sum: '$rejected_qty' },
          total_estimated_loss: { $sum: '$estimated_loss' },
          total_actual_loss: { $sum: '$actual_loss' },
          total_recovered: { $sum: '$recovery_amount' },
          open_count: { $sum: { $cond: [{ $eq: ['$status', 'Open'] }, 1, 0] } },
          closed_count: { $sum: { $cond: [{ $eq: ['$status', 'Closed'] }, 1, 0] } }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: ncrs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      statistics: stats[0] || {
        total_rejected_qty: 0,
        total_estimated_loss: 0,
        total_actual_loss: 0,
        total_recovered: 0,
        open_count: 0,
        closed_count: 0
      }
    });

  } catch (error) {
    console.error('Get all NCRs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch NCRs',
      error: error.message
    });
  }
};

// ======================================================
// GET NCRs BY VENDOR
// GET /api/ncr/vendor/:vendorId
// ======================================================
exports.getNCRsByVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { status, from_date, to_date, page = 1, limit = 20 } = req.query;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found',
        error: 'VENDOR_NOT_FOUND'
      });
    }

    let filter = { vendor_id: vendorId };
    if (status) filter.status = status;
    if (from_date || to_date) {
      filter.ncr_date = {};
      if (from_date) filter.ncr_date.$gte = new Date(from_date);
      if (to_date) filter.ncr_date.$lte = new Date(to_date);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const ncrs = await NCR.find(filter)
      .sort({ ncr_date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('po_id', 'po_number')
      .populate('grn_id', 'grn_number')
      .populate('item_id', 'part_no part_description');

    const total = await NCR.countDocuments(filter);

    // Vendor performance stats
    const vendorStats = await NCR.aggregate([
      { $match: { vendor_id: mongoose.Types.ObjectId(vendorId) } },
      {
        $group: {
          _id: null,
          total_ncrs: { $sum: 1 },
          total_rejected_qty: { $sum: '$rejected_qty' },
          open_ncrs: { $sum: { $cond: [{ $eq: ['$status', 'Open'] }, 1, 0] } },
          closed_ncrs: { $sum: { $cond: [{ $eq: ['$status', 'Closed'] }, 1, 0] } },
          avg_resolution_days: { $avg: { $subtract: ['$closed_at', '$ncr_date'] } }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        vendor: {
          _id: vendor._id,
          vendor_name: vendor.vendor_name,
          vendor_code: vendor.vendor_code
        },
        statistics: vendorStats[0] || {
          total_ncrs: 0,
          total_rejected_qty: 0,
          open_ncrs: 0,
          closed_ncrs: 0,
          avg_resolution_days: 0
        },
        ncrs: ncrs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get NCRs by vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch NCRs by vendor',
      error: error.message
    });
  }
};

// ======================================================
// CLOSE NCR
// PUT /api/ncr/:id/close
// ======================================================
exports.closeNCR = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      resolution,
      actual_loss,
      recovery_amount,
      closure_remarks
    } = req.body;

    const ncr = await NCR.findById(id);

    if (!ncr) {
      return res.status(404).json({
        success: false,
        message: 'NCR not found',
        error: 'NCR_NOT_FOUND'
      });
    }

    if (ncr.status === 'Closed') {
      return res.status(400).json({
        success: false,
        message: 'NCR is already closed',
        error: 'ALREADY_CLOSED'
      });
    }

    ncr.status = 'Closed';
    ncr.closed_at = new Date();
    ncr.closed_by = req.user._id;
    ncr.closure_remarks = closure_remarks || resolution;
    
    if (actual_loss) ncr.actual_loss = actual_loss;
    if (recovery_amount) ncr.recovery_amount = recovery_amount;

    await ncr.save();

    res.status(200).json({
      success: true,
      message: 'NCR closed successfully',
      data: {
        ncr_number: ncr.ncr_number,
        status: ncr.status,
        closed_at: ncr.closed_at,
        closed_by: req.user.Username,
        actual_loss: ncr.actual_loss,
        recovery_amount: ncr.recovery_amount
      }
    });

  } catch (error) {
    console.error('Close NCR error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to close NCR',
      error: error.message
    });
  }
};

// ======================================================
// UPDATE NCR DISPOSITION
// PUT /api/ncr/:id/disposition
// ======================================================
exports.updateDisposition = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      disposition,
      disposition_notes,
      estimated_loss
    } = req.body;

    const ncr = await NCR.findById(id);

    if (!ncr) {
      return res.status(404).json({
        success: false,
        message: 'NCR not found',
        error: 'NCR_NOT_FOUND'
      });
    }

    if (ncr.status === 'Closed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update closed NCR',
        error: 'NCR_CLOSED'
      });
    }

    if (disposition) ncr.disposition = disposition;
    if (disposition_notes) ncr.disposition_notes = disposition_notes;
    if (estimated_loss) ncr.estimated_loss = estimated_loss;

    ncr.updated_by = req.user._id;
    await ncr.save();

    res.status(200).json({
      success: true,
      message: 'NCR disposition updated successfully',
      data: {
        ncr_number: ncr.ncr_number,
        disposition: ncr.disposition,
        disposition_notes: ncr.disposition_notes,
        estimated_loss: ncr.estimated_loss
      }
    });

  } catch (error) {
    console.error('Update disposition error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update disposition',
      error: error.message
    });
  }
};

// controllers/Quality/ncrController.js - ADD THESE MISSING FUNCTIONS

// ======================================================
// GET NCRs BY PO ID
// GET /api/ncr/po/:poId
// ======================================================
exports.getNCRsByPO = async (req, res) => {
  try {
    const { poId } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    // Verify PO exists
    const po = await PurchaseOrder.findById(poId);
    if (!po) {
      return res.status(404).json({
        success: false,
        message: 'Purchase Order not found',
        error: 'PO_NOT_FOUND'
      });
    }

    let filter = { po_id: poId };
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const ncrs = await NCR.find(filter)
      .sort({ ncr_date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('grn_id', 'grn_number grn_date')
      .populate('vendor_id', 'vendor_name vendor_code')
      .populate('item_id', 'part_no part_description')
      .populate('created_by', 'Username Email');

    const total = await NCR.countDocuments(filter);

    // PO statistics
    const poStats = await NCR.aggregate([
      { $match: { po_id: mongoose.Types.ObjectId(poId) } },
      {
        $group: {
          _id: null,
          total_ncrs: { $sum: 1 },
          total_rejected_qty: { $sum: '$rejected_qty' },
          total_estimated_loss: { $sum: '$estimated_loss' },
          open_ncrs: { $sum: { $cond: [{ $eq: ['$status', 'Open'] }, 1, 0] } },
          closed_ncrs: { $sum: { $cond: [{ $eq: ['$status', 'Closed'] }, 1, 0] } }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        po: {
          _id: po._id,
          po_number: po.po_number,
          po_date: po.po_date
        },
        statistics: poStats[0] || {
          total_ncrs: 0,
          total_rejected_qty: 0,
          total_estimated_loss: 0,
          open_ncrs: 0,
          closed_ncrs: 0
        },
        ncrs: ncrs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get NCRs by PO error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch NCRs by PO',
      error: error.message
    });
  }
};

// ======================================================
// UPDATE NCR STATUS
// PUT /api/ncr/:id/status
// ======================================================
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required',
        error: 'STATUS_REQUIRED'
      });
    }

    const validStatuses = ['Open', 'Under Investigation', 'Action Pending', 'Closed', 'Rejected', 'Escalated'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        error: 'INVALID_STATUS'
      });
    }

    const ncr = await NCR.findById(id);

    if (!ncr) {
      return res.status(404).json({
        success: false,
        message: 'NCR not found',
        error: 'NCR_NOT_FOUND'
      });
    }

    if (ncr.status === 'Closed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update closed NCR',
        error: 'NCR_CLOSED'
      });
    }

    const oldStatus = ncr.status;
    ncr.status = status;
    ncr.updated_by = req.user._id;
    
    // Add status change remark if provided
    if (remarks) {
      ncr.closure_remarks = remarks;
    }

    await ncr.save();

    res.status(200).json({
      success: true,
      message: `NCR status updated from ${oldStatus} to ${status}`,
      data: {
        ncr_number: ncr.ncr_number,
        old_status: oldStatus,
        new_status: ncr.status,
        updated_by: req.user.Username,
        updated_at: ncr.updatedAt,
        remarks: remarks || null
      }
    });

  } catch (error) {
    console.error('Update NCR status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update NCR status',
      error: error.message
    });
  }
};

// ======================================================
// ADD ACTION TO NCR
// POST /api/ncr/:id/actions
// ======================================================
exports.addAction = async (req, res) => {
  try {
    const { id } = req.params;
    const { action_type, description, assigned_to, due_date } = req.body;

    // Validate required fields
    if (!action_type || !description) {
      return res.status(400).json({
        success: false,
        message: 'action_type and description are required',
        error: 'ACTION_REQUIRED'
      });
    }

    const validActionTypes = ['Corrective Action', 'Preventive Action', 'Immediate Action'];
    if (!validActionTypes.includes(action_type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid action_type. Must be one of: ${validActionTypes.join(', ')}`,
        error: 'INVALID_ACTION_TYPE'
      });
    }

    const ncr = await NCR.findById(id);

    if (!ncr) {
      return res.status(404).json({
        success: false,
        message: 'NCR not found',
        error: 'NCR_NOT_FOUND'
      });
    }

    if (ncr.status === 'Closed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot add actions to closed NCR',
        error: 'NCR_CLOSED'
      });
    }

    // Create action object
    const action = {
      action_type,
      description,
      assigned_to: assigned_to || null,
      due_date: due_date ? new Date(due_date) : null,
      status: 'Pending',
      created_at: new Date()
    };

    // Add to appropriate action array based on type
    switch (action_type) {
      case 'Corrective Action':
        ncr.corrective_actions.push(action);
        break;
      case 'Preventive Action':
        ncr.preventive_actions.push(action);
        break;
      case 'Immediate Action':
        ncr.immediate_actions.push(action);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid action type',
          error: 'INVALID_ACTION_TYPE'
        });
    }

    ncr.updated_by = req.user._id;
    await ncr.save();

    // Populate the newly added action
    const populatedNCR = await NCR.findById(id)
      .populate('immediate_actions.assigned_to', 'Username Email')
      .populate('corrective_actions.assigned_to', 'Username Email')
      .populate('preventive_actions.assigned_to', 'Username Email');

    // Find the added action to return
    let addedAction = null;
    const actionArrays = {
      'Corrective Action': populatedNCR.corrective_actions,
      'Preventive Action': populatedNCR.preventive_actions,
      'Immediate Action': populatedNCR.immediate_actions
    };
    
    const actionArray = actionArrays[action_type];
    addedAction = actionArray[actionArray.length - 1];

    res.status(200).json({
      success: true,
      message: `${action_type} added successfully`,
      data: {
        ncr_number: ncr.ncr_number,
        action: {
          id: addedAction._id,
          action_type: addedAction.action_type,
          description: addedAction.description,
          assigned_to: addedAction.assigned_to,
          due_date: addedAction.due_date,
          status: addedAction.status
        }
      }
    });

  } catch (error) {
    console.error('Add action error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add action',
      error: error.message
    });
  }
};

// ======================================================
// UPDATE ACTION STATUS (Optional - can be added)
// PUT /api/ncr/:id/actions/:actionId
// ======================================================
exports.updateActionStatus = async (req, res) => {
  try {
    const { id, actionId } = req.params;
    const { status, remarks } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required',
        error: 'STATUS_REQUIRED'
      });
    }

    const validStatuses = ['Pending', 'In Progress', 'Completed', 'Overdue'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        error: 'INVALID_STATUS'
      });
    }

    const ncr = await NCR.findById(id);

    if (!ncr) {
      return res.status(404).json({
        success: false,
        message: 'NCR not found',
        error: 'NCR_NOT_FOUND'
      });
    }

    // Find action in all arrays
    let actionFound = false;
    let actionArray = null;
    let actionIndex = -1;
    let actionType = null;

    const checkArray = (arr, type) => {
      const index = arr.findIndex(a => a._id.toString() === actionId);
      if (index !== -1) {
        actionFound = true;
        actionArray = arr;
        actionIndex = index;
        actionType = type;
      }
    };

    checkArray(ncr.immediate_actions, 'Immediate Action');
    if (!actionFound) checkArray(ncr.corrective_actions, 'Corrective Action');
    if (!actionFound) checkArray(ncr.preventive_actions, 'Preventive Action');

    if (!actionFound) {
      return res.status(404).json({
        success: false,
        message: 'Action not found',
        error: 'ACTION_NOT_FOUND'
      });
    }

    // Update action status
    const action = actionArray[actionIndex];
    const oldStatus = action.status;
    action.status = status;
    
    if (status === 'Completed') {
      action.completed_at = new Date();
      action.completed_by = req.user._id;
    }
    
    if (remarks) {
      action.remarks = remarks;
    }

    ncr.updated_by = req.user._id;
    await ncr.save();

    res.status(200).json({
      success: true,
      message: `Action status updated from ${oldStatus} to ${status}`,
      data: {
        ncr_number: ncr.ncr_number,
        action_type: actionType,
        action_id: action._id,
        old_status: oldStatus,
        new_status: action.status,
        completed_at: action.completed_at,
        updated_by: req.user.Username
      }
    });

  } catch (error) {
    console.error('Update action status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update action status',
      error: error.message
    });
  }
};

// ======================================================
// NCR DASHBOARD STATISTICS
// GET /api/ncr/dashboard/stats
// ======================================================
exports.getNCRDashboardStats = async (req, res) => {
  try {
    const { from_date, to_date, vendor_id } = req.query;

    let filter = {};
    if (from_date || to_date) {
      filter.ncr_date = {};
      if (from_date) filter.ncr_date.$gte = new Date(from_date);
      if (to_date) filter.ncr_date.$lte = new Date(to_date);
    }
    if (vendor_id) filter.vendor_id = vendor_id;

    // Overall stats
    const overallStats = await NCR.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total_ncrs: { $sum: 1 },
          total_rejected_qty: { $sum: '$rejected_qty' },
          total_estimated_loss: { $sum: '$estimated_loss' },
          total_actual_loss: { $sum: '$actual_loss' },
          total_recovered: { $sum: '$recovery_amount' },
          open_ncrs: { $sum: { $cond: [{ $eq: ['$status', 'Open'] }, 1, 0] } },
          closed_ncrs: { $sum: { $cond: [{ $eq: ['$status', 'Closed'] }, 1, 0] } }
        }
      }
    ]);

    // NCRs by severity
    const severityStats = await NCR.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$severity',
          count: { $sum: 1 },
          rejected_qty: { $sum: '$rejected_qty' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // NCRs by type
    const typeStats = await NCR.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$ncr_type',
          count: { $sum: 1 },
          rejected_qty: { $sum: '$rejected_qty' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Top vendors by NCR count
    const topVendors = await NCR.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$vendor_id',
          count: { $sum: 1 },
          rejected_qty: { $sum: '$rejected_qty' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'vendors',
          localField: '_id',
          foreignField: '_id',
          as: 'vendor'
        }
      },
      { $unwind: { path: '$vendor', preserveNullAndEmptyArrays: true } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        overall: overallStats[0] || {
          total_ncrs: 0,
          total_rejected_qty: 0,
          total_estimated_loss: 0,
          total_actual_loss: 0,
          total_recovered: 0,
          open_ncrs: 0,
          closed_ncrs: 0
        },
        by_severity: severityStats,
        by_type: typeStats,
        top_vendors: topVendors.map(v => ({
          vendor_id: v._id,
          vendor_name: v.vendor?.vendor_name || 'Unknown',
          ncr_count: v.count,
          rejected_qty: v.rejected_qty
        }))
      }
    });

  } catch (error) {
    console.error('Get NCR dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch NCR statistics',
      error: error.message
    });
  }
};