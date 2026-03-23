// const Vendor = require('../../models/CRM/Vendor');

// // @desc    Get all vendors
// // @route   GET /api/vendors
// // @access  Private
// const getVendors = async (req, res) => {
//   try {
//     const { 
//       page = 1, 
//       limit = 10, 
//       is_active, 
//       vendor_type,
//       search,
//       state_code 
//     } = req.query;
    
//     const query = {};
//     if (is_active !== undefined) query.is_active = is_active === 'true';
//     if (vendor_type) query.vendor_type = vendor_type;
//     if (state_code) query.state_code = state_code;
    
//     if (search) {
//       query.$or = [
//         { vendor_name: new RegExp(search, 'i') },
//         { vendor_code: new RegExp(search, 'i') },
//         { gstin: new RegExp(search, 'i') },
//         { email: new RegExp(search, 'i') }
//       ];
//     }
    
//     const vendors = await Vendor.find(query)
//       .populate('created_by', 'username email')
//       .populate('updated_by', 'username email')
//       .limit(parseInt(limit))
//       .skip((parseInt(page) - 1) * parseInt(limit))
//       .sort({ vendor_name: 1 });
    
//     const total = await Vendor.countDocuments(query);
    
//     res.json({
//       success: true,
//       data: vendors,
//       pagination: {
//         currentPage: parseInt(page),
//         totalPages: Math.ceil(total / limit),
//         totalItems: total,
//         itemsPerPage: parseInt(limit)
//       }
//     });
//   } catch (error) {
//     console.error('Get vendors error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// };

// // @desc    Get single vendor
// // @route   GET /api/vendors/:id
// // @access  Private
// const getVendor = async (req, res) => {
//   try {
//     const vendor = await Vendor.findById(req.params.id)
//       .populate('created_by', 'username email')
//       .populate('updated_by', 'username email');
    
//     if (!vendor) {
//       return res.status(404).json({
//         success: false,
//         message: 'Vendor not found'
//       });
//     }
    
//     res.json({
//       success: true,
//       data: vendor
//     });
//   } catch (error) {
//     console.error('Get vendor error:', error);
//     if (error.kind === 'ObjectId') {
//       return res.status(404).json({
//         success: false,
//         message: 'Vendor not found'
//       });
//     }
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// };

// // @desc    Create vendor
// // @route   POST /api/vendors
// // @access  Private
// const createVendor = async (req, res) => {
//   try {
//     const vendorCode = req.body.vendor_code || `VEN-${Date.now().toString().slice(-6)}`;
    
//     const vendorData = {
//       ...req.body,
//       vendor_id: `VEN-${Date.now()}`,
//       vendor_code: vendorCode,
//       created_by: req.user._id,
//       updated_by: req.user._id
//     };
    
//     const vendor = await Vendor.create(vendorData);
    
//     const populatedVendor = await Vendor.findById(vendor._id)
//       .populate('created_by', 'username email');
    
//     res.status(201).json({
//       success: true,
//       data: populatedVendor,
//       message: 'Vendor created successfully'
//     });
//   } catch (error) {
//     console.error('Create vendor error:', error);
    
//     if (error.code === 11000) {
//       const field = Object.keys(error.keyPattern)[0];
//       return res.status(400).json({
//         success: false,
//         message: `${field} already exists`
//       });
//     }
    
//     if (error.name === 'ValidationError') {
//       const messages = Object.values(error.errors).map(val => val.message);
//       return res.status(400).json({
//         success: false,
//         message: messages.join(', ')
//       });
//     }
    
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// };

// // @desc    Update vendor
// // @route   PUT /api/vendors/:id
// // @access  Private
// const updateVendor = async (req, res) => {
//   try {
//     const vendor = await Vendor.findByIdAndUpdate(
//       req.params.id,
//       {
//         ...req.body,
//         updated_by: req.user._id
//       },
//       { new: true, runValidators: true }
//     ).populate('created_by', 'username email')
//      .populate('updated_by', 'username email');
    
//     if (!vendor) {
//       return res.status(404).json({
//         success: false,
//         message: 'Vendor not found'
//       });
//     }
    
//     res.json({
//       success: true,
//       data: vendor,
//       message: 'Vendor updated successfully'
//     });
//   } catch (error) {
//     console.error('Update vendor error:', error);
    
//     if (error.code === 11000) {
//       const field = Object.keys(error.keyPattern)[0];
//       return res.status(400).json({
//         success: false,
//         message: `${field} already exists`
//       });
//     }
    
//     if (error.name === 'ValidationError') {
//       const messages = Object.values(error.errors).map(val => val.message);
//       return res.status(400).json({
//         success: false,
//         message: messages.join(', ')
//       });
//     }
    
//     if (error.kind === 'ObjectId') {
//       return res.status(404).json({
//         success: false,
//         message: 'Vendor not found'
//       });
//     }
    
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// };

// // @desc    Delete vendor (soft delete)
// // @route   DELETE /api/vendors/:id
// // @access  Private
// const deleteVendor = async (req, res) => {
//   try {
//     const vendor = await Vendor.findById(req.params.id);
    
//     if (!vendor) {
//       return res.status(404).json({
//         success: false,
//         message: 'Vendor not found'
//       });
//     }
    
//     vendor.is_active = false;
//     vendor.updated_by = req.user._id;
//     await vendor.save();
    
//     res.json({
//       success: true,
//       message: 'Vendor deactivated successfully'
//     });
//   } catch (error) {
//     console.error('Delete vendor error:', error);
//     if (error.kind === 'ObjectId') {
//       return res.status(404).json({
//         success: false,
//         message: 'Vendor not found'
//       });
//     }
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// };

// // @desc    Get vendors for dropdown
// // @route   GET /api/vendors/dropdown
// // @access  Private
// const getVendorsDropdown = async (req, res) => {
//   try {
//     const { vendor_type } = req.query;
    
//     const query = { is_active: true };
//     if (vendor_type) {
//       query.vendor_type = { $in: [vendor_type, 'Both'] };
//     }
    
//     const vendors = await Vendor.find(query)
//       .select('vendor_id vendor_code vendor_name vendor_type gstin state state_code')
//       .sort({ vendor_name: 1 });
    
//     res.json({
//       success: true,
//       data: vendors
//     });
//   } catch (error) {
//     console.error('Get vendors dropdown error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// };

// module.exports = {
//   getVendors,
//   getVendor,
//   createVendor,
//   updateVendor,
//   deleteVendor,
//   getVendorsDropdown
// };


// controllers/vendorController.js
const Vendor = require('../../models/CRM/Vendor');
const GRN = require('../../models/Procurement/GRN');
const PurchaseOrder = require('../../models/Procurement/PurchaseOrder');
const RFQ = require('../../models/Procurement/RFQ');
const VendorPerformance = require('../../models/Procurement/VendorPerformance');

// ======================================================
// CREATE VENDOR
// POST /api/vendors
// ======================================================
exports.createVendor = async (req, res) => {
  try {
    const {
      vendor_code,
      vendor_name,
      vendor_type,
      supply_category,
      address,
      gstin,
      pan,
      state,
      state_code,
      msme_number,
      msme_category,
      contact_person,
      phone,
      alternate_phone,
      email,
      website,
      payment_terms,
      credit_days,
      currency,
      bank_details
    } = req.body;

    // Check if vendor_code already exists
    const existingVendor = await Vendor.findOne({ vendor_code });
    if (existingVendor) {
      return res.status(409).json({
        success: false,
        message: 'Vendor code already exists',
        error: 'DUPLICATE_VENDOR_CODE'
      });
    }

    // Check if GSTIN already exists (if provided)
    if (gstin) {
      const existingGSTIN = await Vendor.findOne({ gstin });
      if (existingGSTIN) {
        return res.status(409).json({
          success: false,
          message: 'Vendor with this GSTIN already exists',
          error: 'DUPLICATE_GSTIN'
        });
      }
    }

    // Generate vendor_id atomically using counter
    const Counter = require('../../models/CRM/Counter'); // Adjust path as needed
    
    const year = new Date().getFullYear();
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    
    // Atomic increment operation
    const counter = await Counter.findOneAndUpdate(
      { name: 'vendor_id' },
      { $inc: { sequence_value: 1 } },
      { new: true, upsert: true }
    );
    
    const vendor_id = `VND-${year}${month}-${counter.sequence_value.toString().padStart(4, '0')}`;

    // Create new vendor
    const vendor = new Vendor({
      vendor_id,
      vendor_code,
      vendor_name,
      vendor_type,
      supply_category: supply_category || [],
      address,
      gstin,
      pan,
      state,
      state_code,
      msme_number,
      msme_category,
      contact_person,
      phone,
      alternate_phone,
      email,
      website,
      payment_terms: payment_terms || 'Net 30',
      credit_days: credit_days || 30,
      currency: currency || 'INR',
      bank_details: bank_details || {},
      avl_approved: false,
      is_active: true,
      created_by: req.user._id,
      updated_by: req.user._id
    });

    await vendor.save();

    res.status(201).json({
      success: true,
      message: 'Vendor created successfully',
      data: vendor
    });

  } catch (error) {
    // Handle duplicate key error specifically
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Vendor ID already exists. Please try again.',
        error: 'DUPLICATE_VENDOR_ID'
      });
    }
    
    console.error('Create vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create vendor',
      error: error.message
    });
  }
};

// controllers/CRM/vendorController.js

// ======================================================
// GET ALL VENDORS (with filters)
// GET /api/vendors
// ======================================================
exports.getAllVendors = async (req, res) => {
  try {
    const {
      type,
      avl_approved,
      blacklisted,
      supply_category,
      min_rating,
      max_rating,
      search,
      page = 1,
      limit = 20,
      sort_by,
      sort_order
    } = req.query;

    // Build filter object
    let filter = {};

    if (type) filter.vendor_type = type;
    if (avl_approved !== undefined) filter.avl_approved = avl_approved === 'true';
    if (blacklisted !== undefined) filter.blacklisted = blacklisted === 'true';
    if (supply_category) filter.supply_category = { $in: [supply_category] };
    
    // Rating filters
    if (min_rating || max_rating) {
      filter.overall_rating = {};
      if (min_rating) filter.overall_rating.$gte = parseFloat(min_rating);
      if (max_rating) filter.overall_rating.$lte = parseFloat(max_rating);
    }

    // Search by name, code, GSTIN
    if (search) {
      filter.$or = [
        { vendor_name: { $regex: search, $options: 'i' } },
        { vendor_code: { $regex: search, $options: 'i' } },
        { gstin: { $regex: search, $options: 'i' } },
        { contact_person: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Sorting - Default to createdAt desc if no sort_by specified
    const sort = {};
    
    if (sort_by) {
      // Client wants to sort by specific field
      const allowedSortFields = [
        'vendor_name', 
        'vendor_code', 
        'vendor_type', 
        'overall_rating', 
        'createdAt', 
        'updatedAt'
      ];
      const actualSortField = allowedSortFields.includes(sort_by) ? sort_by : 'createdAt';
      sort[actualSortField] = sort_order === 'asc' ? 1 : -1;
    } else {
      // ✅ DEFAULT: Sort by createdAt in descending order (newest first)
      sort.createdAt = -1;
    }

    // Execute query
    const vendors = await Vendor.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('avl_approved_by', 'Username Email')
      .populate('blacklisted_by', 'Username Email');

    const total = await Vendor.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: vendors,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendors',
      error: error.message
    });
  }
};

// ======================================================
// GET SINGLE VENDOR BY ID
// GET /api/vendors/:id
// ======================================================
exports.getVendorById = async (req, res) => {
  try {
    const { id } = req.params;

    const vendor = await Vendor.findById(id)
      .populate('avl_approved_by', 'Username Email')
      .populate('blacklisted_by', 'Username Email');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found',
        error: 'VENDOR_NOT_FOUND'
      });
    }

    res.status(200).json({
      success: true,
      data: vendor
    });

  } catch (error) {
    console.error('Get vendor by id error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor',
      error: error.message
    });
  }
};

// ======================================================
// UPDATE VENDOR
// PUT /api/vendors/:id
// ======================================================
exports.updateVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.vendor_id;
    delete updates.vendor_code; // Don't allow code change
    delete updates.avl_approved; // Use dedicated AVL endpoint
    delete updates.blacklisted; // Use dedicated blacklist endpoint
    delete updates.quality_rating;
    delete updates.delivery_rating;
    delete updates.price_rating;
    delete updates.overall_rating;
    delete updates.created_by;
    delete updates.createdAt;
    delete updates.updatedAt;

    // Check if GSTIN is being updated and is unique
    if (updates.gstin) {
      const existingVendor = await Vendor.findOne({
        gstin: updates.gstin,
        _id: { $ne: id }
      });
      if (existingVendor) {
        return res.status(409).json({
          success: false,
          message: 'Vendor with this GSTIN already exists',
          error: 'DUPLICATE_GSTIN'
        });
      }
    }

    updates.updated_by = req.user._id;

    const vendor = await Vendor.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).populate('avl_approved_by', 'Username Email')
     .populate('blacklisted_by', 'Username Email');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found',
        error: 'VENDOR_NOT_FOUND'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Vendor updated successfully',
      data: vendor
    });

  } catch (error) {
    console.error('Update vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update vendor',
      error: error.message
    });
  }
};

// ======================================================
// AVL APPROVE VENDOR
// PUT /api/vendors/:id/avl-approve
// ======================================================
exports.avlApproveVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const { avl_items } = req.body;

    // Validate avl_items
    if (!avl_items || !Array.isArray(avl_items) || avl_items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one item must be specified for AVL approval',
        error: 'AVL_ITEMS_REQUIRED'
      });
    }

    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found',
        error: 'VENDOR_NOT_FOUND'
      });
    }

    // Check if vendor is blacklisted
    if (vendor.blacklisted) {
      return res.status(400).json({
        success: false,
        message: 'Cannot approve blacklisted vendor',
        error: 'VENDOR_BLACKLISTED'
      });
    }

    // Calculate review date (today + 365 days)
    const reviewDate = new Date();
    reviewDate.setFullYear(reviewDate.getFullYear() + 1);

    // Update vendor
    vendor.avl_approved = true;
    vendor.avl_items = avl_items;
    vendor.avl_approved_by = req.user._id;
    vendor.avl_approved_at = new Date();
    vendor.avl_review_date = reviewDate;
    vendor.updated_by = req.user._id;

    await vendor.save();

    res.status(200).json({
      success: true,
      message: 'Vendor approved for AVL successfully',
      data: {
        vendor_id: vendor.vendor_id,
        vendor_name: vendor.vendor_name,
        avl_approved: vendor.avl_approved,
        avl_items: vendor.avl_items,
        avl_approved_by: req.user.Username,
        avl_approved_at: vendor.avl_approved_at,
        avl_review_date: vendor.avl_review_date
      }
    });

  } catch (error) {
    console.error('AVL approve error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve vendor for AVL',
      error: error.message
    });
  }
};

// ======================================================
// BLACKLIST VENDOR
// PUT /api/vendors/:id/blacklist
// ======================================================
exports.blacklistVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const { blacklist_reason } = req.body;

    // Validate reason
    if (!blacklist_reason || blacklist_reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Blacklist reason is required',
        error: 'BLACKLIST_REASON_REQUIRED'
      });
    }

    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found',
        error: 'VENDOR_NOT_FOUND'
      });
    }

    // Update vendor
    vendor.blacklisted = true;
    vendor.blacklist_reason = blacklist_reason;
    vendor.blacklisted_by = req.user._id;
    vendor.blacklisted_at = new Date();
    vendor.avl_approved = false; // Auto-revoke AVL
    vendor.updated_by = req.user._id;

    await vendor.save();

    res.status(200).json({
      success: true,
      message: 'Vendor blacklisted successfully',
      data: {
        vendor_id: vendor.vendor_id,
        vendor_name: vendor.vendor_name,
        blacklisted: vendor.blacklisted,
        blacklist_reason: vendor.blacklist_reason,
        blacklisted_by: req.user.Username,
        blacklisted_at: vendor.blacklisted_at,
        avl_approved: vendor.avl_approved
      }
    });

  } catch (error) {
    console.error('Blacklist vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to blacklist vendor',
      error: error.message
    });
  }
};

// // ======================================================
// // GET VENDOR SCORECARD
// // GET /api/vendors/:id/scorecard
// // ======================================================
// exports.getVendorScorecard = async (req, res) => {
//   try {
//     const { id } = req.params;

//     // 1. Get vendor details
//     const vendor = await Vendor.findById(id);
//     if (!vendor) {
//       return res.status(404).json({
//         success: false,
//         message: 'Vendor not found',
//         error: 'VENDOR_NOT_FOUND'
//       });
//     }

//     // 2. Get performance history (last 6 months)
//     const sixMonthsAgo = new Date();
//     sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

//     const performanceHistory = await VendorPerformance.find({
//       vendor_id: vendor._id,
//       period_type: 'Monthly',
//       created_at: { $gte: sixMonthsAgo }
//     }).sort({ period: -1 }).limit(6);

//     // 3. Get current month's data
//     const now = new Date();
//     const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
//     const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

//     // 4. Fetch all data in parallel
//     const [grns, pos, rfqs] = await Promise.all([
//       GRN.find({
//         vendor_id: vendor._id,
//         grn_date: { $gte: startOfMonth, $lte: endOfMonth },
//         status: { $in: ['Accepted', 'Stock Updated'] }
//       }),
//       PurchaseOrder.find({
//         vendor_id: vendor._id,
//         po_date: { $gte: startOfMonth, $lte: endOfMonth }
//       }),
//       RFQ.find({
//         'vendors.vendor_id': vendor._id,
//         rfq_date: { $gte: startOfMonth, $lte: endOfMonth },
//         status: 'Closed'
//       })
//     ]);

//     // 5. Calculate Quality Rating
//     let totalReceived = 0;
//     let totalAccepted = 0;
    
//     grns.forEach(grn => {
//       if (grn.items && grn.items.length) {
//         grn.items.forEach(item => {
//           totalReceived += Number(item.received_qty) || 0;
//           totalAccepted += Number(item.accepted_qty) || 0;
//         });
//       }
//     });

//     const qualityRating = totalReceived > 0 
//       ? Number(((totalAccepted / totalReceived) * 5).toFixed(2)) 
//       : 0;

//     // 6. Calculate Delivery Rating
//     let onTimeCount = 0;
//     let totalPOs = pos.length;

//     pos.forEach(po => {
//       // Check if delivered on or before due date
//       const deliveredOnTime = po.delivery_date && 
//         po.status === 'Fully Received' && 
//         new Date(po.delivery_date) <= new Date(po.expected_delivery_date || po.delivery_date);
      
//       if (deliveredOnTime) onTimeCount++;
//     });

//     const deliveryRating = totalPOs > 0 
//       ? Number(((onTimeCount / totalPOs) * 5).toFixed(2)) 
//       : 0;

//     // 7. Calculate Price Rating (L1 frequency)
//     let l1Count = 0;
//     let totalRFQs = 0;

//     rfqs.forEach(rfq => {
//       if (rfq.recommended_vendor && 
//           rfq.recommended_vendor.toString() === vendor._id.toString()) {
//         l1Count++;
//       }
//       totalRFQs++;
//     });

//     const priceRating = totalRFQs > 0 
//       ? Number(((l1Count / totalRFQs) * 5).toFixed(2)) 
//       : 0;

//     // 8. Calculate Overall Rating (Weighted Average)
//     const overallRating = Number((
//       qualityRating * 0.5 +
//       deliveryRating * 0.3 +
//       priceRating * 0.2
//     ).toFixed(2));

//     // 9. Prepare response
//     const response = {
//       success: true,
//       data: {
//         vendor: {
//           _id: vendor._id,
//           vendor_id: vendor.vendor_id,
//           vendor_name: vendor.vendor_name,
//           vendor_code: vendor.vendor_code,
//           vendor_type: vendor.vendor_type,
//           avl_approved: vendor.avl_approved,
//           blacklisted: vendor.blacklisted,
//           avl_review_date: vendor.avl_review_date
//         },
//         current_month: {
//           period: now.toLocaleString('default', { month: 'short' }) + '-' + now.getFullYear(),
//           quality: {
//             rating: qualityRating,
//             total_received: totalReceived,
//             total_accepted: totalAccepted,
//             rejection_percent: totalReceived > 0 
//               ? Number(((totalReceived - totalAccepted) / totalReceived * 100).toFixed(2)) 
//               : 0,
//             grn_count: grns.length
//           },
//           delivery: {
//             rating: deliveryRating,
//             total_pos: totalPOs,
//             on_time_pos: onTimeCount,
//             on_time_percent: totalPOs > 0 
//               ? Number(((onTimeCount / totalPOs) * 100).toFixed(2)) 
//               : 0
//           },
//           price: {
//             rating: priceRating,
//             total_rfqs: totalRFQs,
//             l1_count: l1Count,
//             l1_percent: totalRFQs > 0 
//               ? Number(((l1Count / totalRFQs) * 100).toFixed(2)) 
//               : 0
//           },
//           overall_rating: overallRating
//         },
//         history: performanceHistory.map(p => ({
//           period: p.period,
//           quality_rating: p.quality_rating || 0,
//           delivery_rating: p.delivery_rating || 0,
//           price_rating: p.price_rating || 0,
//           overall_rating: p.overall_rating || 0,
//           rejection_percent: p.rejection_percent || 0,
//           on_time_percent: p.on_time_delivery_percent || 0,
//           l1_percent: p.l1_percent || 0
//         }))
//       }
//     };

//     res.status(200).json(response);

//   } catch (error) {
//     console.error('Get scorecard error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch vendor scorecard',
//       error: error.message
//     });
//   }
// };

// // ======================================================
// // COMPARE VENDORS
// // GET /api/vendors/compare?ids=v1,v2,v3
// // ======================================================
// exports.compareVendors = async (req, res) => {
//   try {
//     const { ids } = req.query;

//     // 1. Validate input
//     if (!ids) {
//       return res.status(400).json({
//         success: false,
//         message: 'Vendor IDs are required for comparison',
//         error: 'VENDOR_IDS_REQUIRED'
//       });
//     }

//     const vendorIds = ids.split(',').map(id => id.trim()).filter(id => id);

//     if (vendorIds.length < 2) {
//       return res.status(400).json({
//         success: false,
//         message: 'At least 2 vendors required for comparison',
//         error: 'MIN_TWO_VENDORS_REQUIRED'
//       });
//     }

//     if (vendorIds.length > 5) {
//       return res.status(400).json({
//         success: false,
//         message: 'Maximum 5 vendors can be compared at once',
//         error: 'MAX_VENDORS_EXCEEDED'
//       });
//     }

//     // 2. Fetch all vendors
//     const vendors = await Vendor.find({
//       _id: { $in: vendorIds },
//       is_active: true
//     }).select('vendor_id vendor_code vendor_name vendor_type avl_approved blacklisted msme_category payment_terms credit_days quality_rating delivery_rating price_rating overall_rating');

//     if (vendors.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: 'No vendors found',
//         error: 'VENDORS_NOT_FOUND'
//       });
//     }

//     // 3. Get current month's date range
//     const now = new Date();
//     const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
//     const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

//     // 4. Build comparison array
//     const comparison = await Promise.all(vendors.map(async (vendor) => {
//       // Get current month's performance data
//       const [grns, pos, rfqs] = await Promise.all([
//         GRN.find({
//           vendor_id: vendor._id,
//           grn_date: { $gte: startOfMonth, $lte: endOfMonth },
//           status: 'Accepted'
//         }),
//         PurchaseOrder.find({
//           vendor_id: vendor._id,
//           po_date: { $gte: startOfMonth, $lte: endOfMonth }
//         }),
//         RFQ.find({
//           'vendors.vendor_id': vendor._id,
//           rfq_date: { $gte: startOfMonth, $lte: endOfMonth },
//           status: 'Closed'
//         })
//       ]);

//       // Calculate current month metrics
//       let totalReceived = 0, totalAccepted = 0;
//       grns.forEach(grn => {
//         grn.items?.forEach(item => {
//           totalReceived += item.received_qty || 0;
//           totalAccepted += item.accepted_qty || 0;
//         });
//       });

//       const onTimePOs = pos.filter(po => 
//         po.delivery_date && po.status === 'Fully Received'
//       ).length;

//       let l1Count = 0;
//       rfqs.forEach(rfq => {
//         if (rfq.recommended_vendor?.toString() === vendor._id.toString()) {
//           l1Count++;
//         }
//       });

//       // Get latest performance record
//       const latestPerf = await VendorPerformance.findOne({
//         vendor_id: vendor._id
//       }).sort({ period: -1 });

//       return {
//         vendor: {
//           _id: vendor._id,
//           vendor_id: vendor.vendor_id,
//           vendor_code: vendor.vendor_code,
//           vendor_name: vendor.vendor_name,
//           vendor_type: vendor.vendor_type,
//           avl_approved: vendor.avl_approved,
//           blacklisted: vendor.blacklisted,
//           msme_category: vendor.msme_category,
//           payment_terms: vendor.payment_terms,
//           credit_days: vendor.credit_days
//         },
//         current_month: {
//           quality: {
//             rating: totalReceived > 0 ? Number(((totalAccepted / totalReceived) * 5).toFixed(2)) : 0,
//             rejection_percent: totalReceived > 0 ? Number(((totalReceived - totalAccepted) / totalReceived * 100).toFixed(2)) : 0
//           },
//           delivery: {
//             rating: pos.length > 0 ? Number(((onTimePOs / pos.length) * 5).toFixed(2)) : 0,
//             on_time_percent: pos.length > 0 ? Number(((onTimePOs / pos.length) * 100).toFixed(2)) : 0
//           },
//           price: {
//             rating: rfqs.length > 0 ? Number(((l1Count / rfqs.length) * 5).toFixed(2)) : 0,
//             l1_percent: rfqs.length > 0 ? Number(((l1Count / rfqs.length) * 100).toFixed(2)) : 0
//           }
//         },
//         cumulative_ratings: {
//           quality: vendor.quality_rating || 0,
//           delivery: vendor.delivery_rating || 0,
//           price: vendor.price_rating || 0,
//           overall: vendor.overall_rating || 0
//         },
//         latest_performance: latestPerf ? {
//           period: latestPerf.period,
//           rejection_percent: latestPerf.rejection_percent || 0,
//           on_time_percent: latestPerf.on_time_delivery_percent || 0,
//           l1_percent: latestPerf.l1_percent || 0
//         } : null
//       };
//     }));

//     // 5. Sort by overall rating (highest first)
//     comparison.sort((a, b) => 
//       (b.cumulative_ratings.overall || 0) - (a.cumulative_ratings.overall || 0)
//     );

//     res.status(200).json({
//       success: true,
//       data: comparison,
//       meta: {
//         total_vendors: comparison.length,
//         comparison_date: new Date()
//       }
//     });

//   } catch (error) {
//     console.error('Compare vendors error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to compare vendors',
//       error: error.message
//     });
//   }
// };

// ======================================================
// GET VENDOR TRANSACTION HISTORY
// GET /api/vendors/:id/history
// ======================================================
exports.getVendorHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { from_date, to_date, type, page = 1, limit = 20 } = req.query;

    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found',
        error: 'VENDOR_NOT_FOUND'
      });
    }

    // Date filter
    const dateFilter = {};
    if (from_date || to_date) {
      dateFilter.createdAt = {};
      if (from_date) dateFilter.createdAt.$gte = new Date(from_date);
      if (to_date) dateFilter.createdAt.$lte = new Date(to_date);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let history = [];

    // Get POs
    if (!type || type === 'po') {
      const pos = await PurchaseOrder.find({
        vendor_id: vendor._id,
        ...dateFilter
      })
        .sort({ po_date: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      history.push(...pos.map(po => ({
        type: 'PO',
        document_no: po.po_number,
        date: po.po_date,
        amount: po.grand_total,
        status: po.status,
        details: {
          items: po.items.length,
          delivery_date: po.delivery_date
        }
      })));
    }

    // Get GRNs
    if (!type || type === 'grn') {
      const grns = await GRN.find({
        vendor_id: vendor._id,
        ...dateFilter
      })
        .sort({ grn_date: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      history.push(...grns.map(grn => ({
        type: 'GRN',
        document_no: grn.grn_number,
        date: grn.grn_date,
        amount: null,
        status: grn.status,
        details: {
          items: grn.items.length,
          qc_status: grn.qc_status,
          accepted_qty: grn.total_accepted_qty
        }
      })));
    }

    // Get Purchase Invoices
    if (!type || type === 'invoice') {
      const PurchaseInvoice = require('../../models/Procurement/PurchaseInvoice');
      const invoices = await PurchaseInvoice.find({
        vendor_id: vendor._id,
        ...dateFilter
      })
        .sort({ invoice_date: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      history.push(...invoices.map(inv => ({
        type: 'Purchase Invoice',
        document_no: inv.purchase_invoice_number,
        date: inv.invoice_date,
        amount: inv.grand_total,
        status: inv.status,
        details: {
          payment_status: inv.payment_status,
          due_date: inv.due_date
        }
      })));
    }

    // Get Vendor Payments
    if (!type || type === 'payment') {
      const VendorPayment = require('../../models/Procurement/VendorPayment');
      const payments = await VendorPayment.find({
        vendor_id: vendor._id,
        ...dateFilter
      })
        .sort({ payment_date: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      history.push(...payments.map(pmt => ({
        type: 'Payment',
        document_no: pmt.vendor_payment_number,
        date: pmt.payment_date,
        amount: pmt.amount,
        status: pmt.status,
        details: {
          mode: pmt.payment_mode,
          reference: pmt.reference_no,
          net_paid: pmt.net_paid
        }
      })));
    }

    // Sort by date descending
    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Paginate combined results
    const start = (parseInt(page) - 1) * parseInt(limit);
    const paginatedHistory = history.slice(start, start + parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        vendor: {
          vendor_id: vendor.vendor_id,
          vendor_name: vendor.vendor_name
        },
        history: paginatedHistory,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: history.length,
          pages: Math.ceil(history.length / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get vendor history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor history',
      error: error.message
    });
  }
};

// ======================================================
// HARD DELETE VENDOR
// DELETE /api/vendors/:id
// ======================================================
exports.deleteVendor = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if vendor exists
    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found',
        error: 'VENDOR_NOT_FOUND'
      });
    }

    // HARD DELETE - Permanently remove from database
    await Vendor.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Vendor permanently deleted successfully'
    });

  } catch (error) {
    console.error('Delete vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete vendor',
      error: error.message
    });
  }
};