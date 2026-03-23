// controllers/purchaseRequisitionController.js
const PurchaseRequisition = require('../../models/Procurement/PurchaseRequisition');
const Item = require('../../models/CRM/Item');

// ======================================================
// CREATE PURCHASE REQUISITION
// POST /api/purchase-requisitions
// ======================================================
exports.createPurchaseRequisition = async (req, res) => {
  try {
    const {
      pr_type,
      source,
      mrp_run_id,
      department,
      required_by,
      items
    } = req.body;

    console.log('Creating PR with data:', req.body); // Debug log

    // ===== VALIDATIONS =====

    // 1. Validate required_by is a future date
    const requiredDate = new Date(required_by);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (requiredDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Required by date must be a future date',
        error: 'INVALID_REQUIRED_DATE'
      });
    }

    // 2. Validate items array
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one item is required',
        error: 'ITEMS_REQUIRED'
      });
    }

    // 3. Validate each item and fetch item details
    const validatedItems = [];
    for (const item of items) {
      // Check if item exists in database
      const itemDetails = await Item.findById(item.item_id);
      if (!itemDetails) {
        return res.status(400).json({
          success: false,
          message: `Item with ID ${item.item_id} not found`,
          error: 'ITEM_NOT_FOUND'
        });
      }

      // Validate quantity
      if (!item.required_qty || item.required_qty < 1) {
        return res.status(400).json({
          success: false,
          message: `Invalid quantity for item ${itemDetails.part_no}`,
          error: 'INVALID_QUANTITY'
        });
      }

      validatedItems.push({
        item_id: item.item_id,
        part_no: itemDetails.part_no,
        description: itemDetails.part_description,
        required_qty: item.required_qty,
        unit: itemDetails.unit,
        estimated_price: item.estimated_price || 0,
        required_date: requiredDate,
        remarks: item.remarks || '',
        status: 'Pending',
        po_ids: []
      });
    }

    // 4. Create PR
    const prData = {
      pr_type,
      source: source || 'Manual',
      department,
      items: validatedItems,
      requested_by: req.user._id,
      required_by: requiredDate,
      status: 'Submitted',
      po_ids: [],
      created_by: req.user._id,
      updated_by: req.user._id
    };

    // Only add mrp_run_id if provided and not empty
    if (mrp_run_id && mrp_run_id !== 'null' && mrp_run_id !== '') {
      prData.mrp_run_id = mrp_run_id; // Now stored as string
    }

    console.log('PR Data to save:', prData); // Debug log

    const pr = new PurchaseRequisition(prData);
    await pr.save();

    // 5. Populate references for response
    await pr.populate([
      { path: 'requested_by', select: 'Username Email' },
      { path: 'items.item_id', select: 'part_no part_description hsn_code unit' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Purchase requisition created successfully',
      data: {
        _id: pr._id,
        pr_number: pr.pr_number,
        pr_date: pr.pr_date,
        pr_type: pr.pr_type,
        source: pr.source,
        mrp_run_id: pr.mrp_run_id,
        department: pr.department,
        status: pr.status,
        required_by: pr.required_by,
        items: pr.items.map(item => ({
          item_id: item.item_id._id,
          part_no: item.part_no,
          description: item.description,
          required_qty: item.required_qty,
          unit: item.unit,
          estimated_price: item.estimated_price,
          required_date: item.required_date,
          remarks: item.remarks,
          status: item.status
        })),
        requested_by: {
          _id: pr.requested_by._id,
          username: pr.requested_by.Username,
          email: pr.requested_by.Email
        },
        po_ids: pr.po_ids,
        created_at: pr.createdAt
      }
    });

  } catch (error) {
    console.error('Create PR error details:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = {};
      for (let field in error.errors) {
        errors[field] = error.errors[field].message;
      }
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: 'VALIDATION_ERROR',
        details: errors
      });
    }
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate PR number generated. Please try again.',
        error: 'DUPLICATE_PR_NUMBER'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create purchase requisition',
      error: error.message
    });
  }
};

// ======================================================
// APPROVE PURCHASE REQUISITION
// PUT /api/purchase-requisitions/:id/approve
// ======================================================
exports.approvePurchaseRequisition = async (req, res) => {
  try {
    const { id } = req.params;
    const { approval_notes } = req.body;

    // Find PR
    const pr = await PurchaseRequisition.findById(id);
    if (!pr) {
      return res.status(404).json({
        success: false,
        message: 'Purchase requisition not found',
        error: 'PR_NOT_FOUND'
      });
    }

    // Check if PR is in correct state for approval
    if (pr.status !== 'Submitted') {
      return res.status(400).json({
        success: false,
        message: `Cannot approve PR with status: ${pr.status}. PR must be in 'Submitted' state`,
        error: 'INVALID_PR_STATUS'
      });
    }

    // Check if required_by date is still valid
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const requiredDate = new Date(pr.required_by);
    
    if (requiredDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Cannot approve PR as required_by date has passed. Please create a new PR.',
        error: 'REQUIRED_DATE_PASSED'
      });
    }

    // Update PR status to Approved
    pr.status = 'Approved';
    pr.approved_by = req.user._id;
    pr.approved_at = new Date();
    pr.updated_by = req.user._id;
    
    // Add approval notes if provided
    if (approval_notes) {
      pr.remarks = approval_notes;
    }

    await pr.save();

    // Populate references for response
    await pr.populate([
      { path: 'requested_by', select: 'Username Email' },
      { path: 'approved_by', select: 'Username Email' },
      { path: 'items.item_id', select: 'part_no part_description' }
    ]);

    res.status(200).json({
      success: true,
      message: 'Purchase requisition approved successfully',
      data: {
        _id: pr._id,
        pr_number: pr.pr_number,
        status: pr.status,
        approved_by: {
          _id: pr.approved_by._id,
          username: pr.approved_by.Username,
          email: pr.approved_by.Email
        },
        approved_at: pr.approved_at,
        required_by: pr.required_by,
        items: pr.items.map(item => ({
          part_no: item.part_no,
          description: item.description,
          required_qty: item.required_qty,
          unit: item.unit
        }))
      }
    });

  } catch (error) {
    console.error('Approve PR error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve purchase requisition',
      error: error.message
    });
  }
};

// ======================================================
// REJECT PURCHASE REQUISITION
// PUT /api/purchase-requisitions/:id/reject
// ======================================================
exports.rejectPurchaseRequisition = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    // Validate rejection reason
    if (!rejection_reason || rejection_reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required',
        error: 'REJECTION_REASON_REQUIRED'
      });
    }

    // Find PR
    const pr = await PurchaseRequisition.findById(id);
    if (!pr) {
      return res.status(404).json({
        success: false,
        message: 'Purchase requisition not found',
        error: 'PR_NOT_FOUND'
      });
    }

    // Check if PR is in correct state for rejection
    if (pr.status !== 'Submitted') {
      return res.status(400).json({
        success: false,
        message: `Cannot reject PR with status: ${pr.status}. PR must be in 'Submitted' state`,
        error: 'INVALID_PR_STATUS'
      });
    }

    // Update PR status to Rejected
    pr.status = 'Rejected';
    pr.rejection_reason = rejection_reason;
    pr.approved_by = req.user._id; // Person who rejected (using same field for audit)
    pr.approved_at = new Date();
    pr.updated_by = req.user._id;

    await pr.save();

    res.status(200).json({
      success: true,
      message: 'Purchase requisition rejected successfully',
      data: {
        _id: pr._id,
        pr_number: pr.pr_number,
        status: pr.status,
        rejection_reason: pr.rejection_reason,
        rejected_by: req.user.Username,
        rejected_at: pr.approved_at
      }
    });

  } catch (error) {
    console.error('Reject PR error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject purchase requisition',
      error: error.message
    });
  }
};

// ======================================================
// GET PURCHASE REQUISITION BY ID
// GET /api/purchase-requisitions/:id
// ======================================================
exports.getPurchaseRequisitionById = async (req, res) => {
  try {
    const { id } = req.params;

    const pr = await PurchaseRequisition.findById(id)
      .populate('requested_by', 'Username Email')
      .populate('approved_by', 'Username Email')
      .populate('items.item_id', 'part_no part_description hsn_code unit')
      .populate('mrp_run_id')
      .populate('wo_id')
      .populate('po_ids');

    if (!pr) {
      return res.status(404).json({
        success: false,
        message: 'Purchase requisition not found',
        error: 'PR_NOT_FOUND'
      });
    }

    res.status(200).json({
      success: true,
      data: pr
    });

  } catch (error) {
    console.error('Get PR by id error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch purchase requisition',
      error: error.message
    });
  }
};

// ======================================================
// GET ALL PURCHASE REQUISITIONS
// GET /api/purchase-requisitions
// ======================================================
exports.getAllPurchaseRequisitions = async (req, res) => {
  try {
    const {
      status,
      pr_type,
      department,
      from_date,
      to_date,
      search,
      page = 1,
      limit = 20,
      sort_by = 'createdAt',
      sort_order = 'desc'
    } = req.query;

    // Build filter
    let filter = {};

    if (status) filter.status = status;
    if (pr_type) filter.pr_type = pr_type;
    if (department) filter.department = department;

    // Date range filter
    if (from_date || to_date) {
      filter.createdAt = {};
      if (from_date) filter.createdAt.$gte = new Date(from_date);
      if (to_date) filter.createdAt.$lte = new Date(to_date);
    }

    // Search in PR number
    if (search) {
      filter.pr_number = { $regex: search, $options: 'i' };
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Sorting
    const sort = {};
    sort[sort_by] = sort_order === 'asc' ? 1 : -1;

    const prs = await PurchaseRequisition.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('requested_by', 'Username Email')
      .populate('approved_by', 'Username Email');

    const total = await PurchaseRequisition.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: prs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get all PRs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch purchase requisitions',
      error: error.message
    });
  }
};

// ======================================================
// UPDATE PURCHASE REQUISITION
// PUT /api/purchase-requisitions/:id
// ======================================================
exports.updatePurchaseRequisition = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      pr_type,
      source,
      mrp_run_id,
      wo_id,
      department,
      items,
      required_by,
      status,
      rejection_reason
    } = req.body;

    // Find existing PR
    const pr = await PurchaseRequisition.findById(id);
    if (!pr) {
      return res.status(404).json({
        success: false,
        message: 'Purchase requisition not found',
        error: 'PR_NOT_FOUND'
      });
    }

    // Check if PR can be updated (only Draft or Submitted status)
    if (pr.status !== 'Draft' && pr.status !== 'Submitted') {
      return res.status(400).json({
        success: false,
        message: `Cannot update PR with status: ${pr.status}. Only Draft or Submitted PRs can be updated`,
        error: 'INVALID_PR_STATUS'
      });
    }

    // ===== VALIDATIONS =====

    // 1. Validate required_by is a future date (if provided)
    if (required_by) {
      const requiredDate = new Date(required_by);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (requiredDate < today) {
        return res.status(400).json({
          success: false,
          message: 'Required by date must be a future date',
          error: 'INVALID_REQUIRED_DATE'
        });
      }
      pr.required_by = requiredDate;
    }

    // 2. Validate and update items (if provided)
    if (items) {
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one item is required',
          error: 'ITEMS_REQUIRED'
        });
      }

      const validatedItems = [];
      for (const item of items) {
        // Check if item exists in database
        const itemDetails = await Item.findById(item.item_id);
        if (!itemDetails) {
          return res.status(400).json({
            success: false,
            message: `Item with ID ${item.item_id} not found`,
            error: 'ITEM_NOT_FOUND'
          });
        }

        // Validate quantity
        if (!item.required_qty || item.required_qty < 1) {
          return res.status(400).json({
            success: false,
            message: `Invalid quantity for item ${itemDetails.part_no}`,
            error: 'INVALID_QUANTITY'
          });
        }

        // Validate unit matches item's unit
        if (item.unit && item.unit !== itemDetails.unit) {
          return res.status(400).json({
            success: false,
            message: `Unit mismatch for item ${itemDetails.part_no}. Item uses ${itemDetails.unit}`,
            error: 'UNIT_MISMATCH'
          });
        }

        // Check if updating existing item or adding new one
        const existingItemIndex = pr.items.findIndex(
          i => i.item_id.toString() === item.item_id.toString()
        );

        const itemData = {
          item_id: item.item_id,
          part_no: itemDetails.part_no,
          description: itemDetails.part_description,
          required_qty: item.required_qty,
          unit: itemDetails.unit,
          estimated_price: item.estimated_price || 0,
          required_date: required_by ? new Date(required_by) : pr.required_by,
          remarks: item.remarks || '',
          status: item.status || 'Pending'
        };

        if (existingItemIndex >= 0) {
          // Update existing item
          validatedItems.push({
            ...itemData,
            _id: pr.items[existingItemIndex]._id // Preserve original _id
          });
        } else {
          // Add new item
          validatedItems.push(itemData);
        }
      }

      pr.items = validatedItems;
    }

    // 3. Update simple fields (if provided)
    if (pr_type) pr.pr_type = pr_type;
    if (source) pr.source = source;
    if (mrp_run_id) pr.mrp_run_id = mrp_run_id;
    if (wo_id) pr.wo_id = wo_id;
    if (department) pr.department = department;
    
    // 4. Handle status update carefully
    if (status) {
      const allowedStatuses = ['Draft', 'Submitted', 'Rejected'];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot manually set status to ${status}. Use approve/reject endpoints for status changes`,
          error: 'INVALID_STATUS_UPDATE'
        });
      }
      pr.status = status;
    }

    // 5. Handle rejection reason
    if (rejection_reason !== undefined) {
      pr.rejection_reason = rejection_reason;
    }

    // Update audit field
    pr.updated_by = req.user._id;

    await pr.save();

    // Populate references for response
    await pr.populate([
      { path: 'requested_by', select: 'Username Email' },
      { path: 'updated_by', select: 'Username Email' },
      { path: 'items.item_id', select: 'part_no part_description hsn_code unit' },
      { path: 'mrp_run_id' },
      { path: 'wo_id' }
    ]);

    res.status(200).json({
      success: true,
      message: 'Purchase requisition updated successfully',
      data: {
        _id: pr._id,
        pr_number: pr.pr_number,
        pr_date: pr.pr_date,
        pr_type: pr.pr_type,
        source: pr.source,
        department: pr.department,
        status: pr.status,
        required_by: pr.required_by,
        mrp_run_id: pr.mrp_run_id,
        wo_id: pr.wo_id,
        items: pr.items.map(item => ({
          _id: item._id,
          item_id: item.item_id._id,
          part_no: item.part_no,
          description: item.description,
          required_qty: item.required_qty,
          unit: item.unit,
          estimated_price: item.estimated_price,
          required_date: item.required_date,
          remarks: item.remarks,
          status: item.status,
          po_ids: item.po_ids
        })),
        requested_by: pr.requested_by ? {
          _id: pr.requested_by._id,
          username: pr.requested_by.Username,
          email: pr.requested_by.Email
        } : null,
        updated_by: {
          _id: pr.updated_by._id,
          username: pr.updated_by.Username,
          email: pr.updated_by.Email
        },
        rejection_reason: pr.rejection_reason,
        created_at: pr.createdAt,
        updated_at: pr.updatedAt
      }
    });

  } catch (error) {
    console.error('Update PR error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update purchase requisition',
      error: error.message
    });
  }
};

// ======================================================
// GET AGING REQUISITIONS
// GET /api/purchase-requisitions/aging
// ======================================================
exports.getAgingRequisitions = async (req, res) => {
  try {
    const { days = 3 } = req.query; // Default SLA is 3 days
    const slaDays = parseInt(days);

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - slaDays);

    // Find all PRs that are still in Submitted status and older than SLA
    const agingPRs = await PurchaseRequisition.find({
      status: 'Submitted',
      createdAt: { $lte: cutoffDate }
    })
      .populate('requested_by', 'Username Email')
      .populate('items.item_id', 'part_no part_description')
      .sort({ createdAt: 1 }); // Oldest first

    // Calculate aging details
    const now = new Date();
    const enrichedPRs = agingPRs.map(pr => {
      const createdDate = new Date(pr.createdAt);
      const agingDays = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
      
      // Calculate total estimated value
      const totalValue = pr.items.reduce((sum, item) => 
        sum + (item.estimated_price * item.required_qty), 0);

      return {
        _id: pr._id,
        pr_number: pr.pr_number,
        pr_date: pr.pr_date,
        created_at: pr.createdAt,
        aging_days: agingDays,
        requested_by: pr.requested_by ? pr.requested_by.Username : 'Unknown',
        department: pr.department,
        total_value: totalValue,
        items_count: pr.items.length,
        required_by: pr.required_by,
        status: pr.status,
        is_critical: agingDays > slaDays * 2, // Double SLA is critical
        days_exceeded: agingDays - slaDays
      };
    });

    // Separate into categories
    const criticalPRs = enrichedPRs.filter(pr => pr.is_critical);
    const warningPRs = enrichedPRs.filter(pr => !pr.is_critical && pr.aging_days > slaDays);
    
    // Summary statistics
    const summary = {
      total_pending_approval: await PurchaseRequisition.countDocuments({ status: 'Submitted' }),
      aging_count: enrichedPRs.length,
      critical_count: criticalPRs.length,
      warning_count: warningPRs.length,
      average_aging_days: enrichedPRs.length > 0 
        ? Math.round(enrichedPRs.reduce((sum, pr) => sum + pr.aging_days, 0) / enrichedPRs.length)
        : 0,
      oldest_pr: enrichedPRs.length > 0 ? enrichedPRs[0].pr_number : null,
      oldest_aging_days: enrichedPRs.length > 0 ? enrichedPRs[0].aging_days : 0
    };

    // Group by department for department-wise aging
    const departmentWise = {};
    enrichedPRs.forEach(pr => {
      if (!departmentWise[pr.department]) {
        departmentWise[pr.department] = {
          count: 0,
          total_value: 0,
          aging_days_sum: 0
        };
      }
      departmentWise[pr.department].count++;
      departmentWise[pr.department].total_value += pr.total_value;
      departmentWise[pr.department].aging_days_sum += pr.aging_days;
    });

    // Calculate averages per department
    Object.keys(departmentWise).forEach(dept => {
      departmentWise[dept].average_aging = Math.round(
        departmentWise[dept].aging_days_sum / departmentWise[dept].count
      );
      delete departmentWise[dept].aging_days_sum;
    });

    res.status(200).json({
      success: true,
      data: {
        sla_days: slaDays,
        cutoff_date: cutoffDate,
        aging_prs: enrichedPRs,
        critical_prs: criticalPRs,
        warning_prs: warningPRs,
        department_wise: departmentWise,
        summary
      }
    });

  } catch (error) {
    console.error('Get aging requisitions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch aging requisitions',
      error: error.message
    });
  }
};

// ======================================================
// GET PENDING RFQ WITH VENDOR SUGGESTIONS
// GET /api/purchase-requisitions/pending-rfq-with-vendors
// ======================================================
exports.getPendingRFQRequisitions = async (req, res) => {
  try {
    const pendingPRs = await PurchaseRequisition.find({
      status: 'Approved',
      po_ids: { $size: 0 }
    })
      .populate('requested_by', 'Username Email')
      .populate('items.item_id', 'part_no part_description unit hsn_code')
      .sort({ required_by: 1 });

    const Vendor = require('../../models/CRM/Vendor');
    
    const enrichedPRs = await Promise.all(pendingPRs.map(async (pr) => {
      // Get all item IDs from this PR
      const itemIds = pr.items.map(item => item.item_id._id);
      
      // Find top 5 AVL-approved vendors for these items
      const eligibleVendors = await Vendor.find({
        avl_approved: true,
        blacklisted: false,
        avl_items: { $in: itemIds }
      })
        .select('vendor_name vendor_code quality_rating delivery_rating price_rating overall_rating payment_terms credit_days')
        .sort({ overall_rating: -1 })
        .limit(5);

      const today = new Date();
      const requiredDate = new Date(pr.required_by);
      const daysToRequired = Math.ceil((requiredDate - today) / (1000 * 60 * 60 * 24));

      return {
        _id: pr._id,
        pr_number: pr.pr_number,
        pr_date: pr.pr_date,
        required_by: pr.required_by,
        department: pr.department,
        requested_by: pr.requested_by ? pr.requested_by.Username : null,
        items: pr.items.map(item => ({
          item_id: item.item_id._id,
          part_no: item.item_id.part_no,
          description: item.item_id.part_description,
          required_qty: item.required_qty,
          unit: item.unit,
          estimated_price: item.estimated_price,
          hsn_code: item.item_id.hsn_code
        })),
        suggested_vendors: eligibleVendors.map(v => ({
          _id: v._id,
          vendor_name: v.vendor_name,
          vendor_code: v.vendor_code,
          ratings: {
            quality: v.quality_rating,
            delivery: v.delivery_rating,
            price: v.price_rating,
            overall: v.overall_rating
          },
          payment_terms: v.payment_terms,
          credit_days: v.credit_days
        })),
        vendor_count: eligibleVendors.length,
        days_to_required: daysToRequired,
        priority: daysToRequired <= 7 ? 'High' : daysToRequired <= 15 ? 'Medium' : 'Low',
        total_estimated_value: pr.items.reduce((sum, item) => 
          sum + (item.estimated_price * item.required_qty), 0)
      };
    }));

    // Filter PRs with at least 3 vendors
    const actionablePRs = enrichedPRs.filter(pr => pr.vendor_count >= 3);

    res.status(200).json({
      success: true,
      data: actionablePRs,
      meta: {
        total_pending: pendingPRs.length,
        actionable_count: actionablePRs.length,
        insufficient_vendors_count: enrichedPRs.length - actionablePRs.length
      }
    });

  } catch (error) {
    console.error('Get pending RFQ with vendors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending RFQ with vendors',
      error: error.message
    });
  }
};