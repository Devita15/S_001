// controllers/Procurement/grnController.js
const GRN = require('../../models/Procurement/GRN');
const PurchaseOrder = require('../../models/Procurement/PurchaseOrder');
const StockTransaction = require('../../models/Inventory/StockTransaction');
const InspectionRecord = require('../../models/Quality/InspectionRecord');
const NCR = require('../../models/Quality/NCR');

// ======================================================
// CREATE GRN
// POST /api/grns
// ======================================================
exports.createGRN = async (req, res) => {
  try {
    const {
      po_id,
      vehicle_no,
      lr_number,
      lr_date,
      transporter_name,
      vendor_invoice_no,
      vendor_invoice_date,
      receiving_store,
      items,
      remarks
    } = req.body;

    // 1. Validate PO exists
    const po = await PurchaseOrder.findById(po_id)
      .populate('vendor_id')
      .populate('items.item_id');

    if (!po) {
      return res.status(404).json({
        success: false,
        message: 'Purchase Order not found',
        error: 'PO_NOT_FOUND'
      });
    }

    // 2. Check PO status
    if (!['Acknowledged', 'Sent', 'Partially Received', 'Fully Received'].includes(po.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot create GRN for PO with status: ${po.status}. PO must be Acknowledged or Sent`,
        error: 'INVALID_PO_STATUS'
      });
    }

    // 3. Check if PO is already fully received
    const allItemsFullyReceived = po.items.every(item => item.pending_qty === 0);
    if (allItemsFullyReceived && po.status === 'Fully Received') {
      return res.status(400).json({
        success: false,
        message: 'PO is already fully received. Cannot create more GRNs',
        error: 'PO_FULLY_RECEIVED'
      });
    }

    // 4. Validate items and received quantities
    const grnItems = [];
    for (const receivedItem of items) {
      const poItem = po.items.find(
        item => item._id.toString() === receivedItem.po_item_id
      );

      if (!poItem) {
        return res.status(400).json({
          success: false,
          message: `PO item not found for ID: ${receivedItem.po_item_id}`,
          error: 'PO_ITEM_NOT_FOUND'
        });
      }

      if (receivedItem.received_qty > poItem.ordered_qty) {
        return res.status(400).json({
          success: false,
          message: `Received quantity ${receivedItem.received_qty} exceeds ordered quantity ${poItem.ordered_qty} for item ${poItem.part_no}`,
          error: 'EXCESS_QUANTITY'
        });
      }

      if (receivedItem.received_qty > poItem.pending_qty) {
        return res.status(400).json({
          success: false,
          message: `Received quantity ${receivedItem.received_qty} exceeds pending quantity ${poItem.pending_qty} for item ${poItem.part_no}`,
          error: 'EXCESS_PENDING_QUANTITY'
        });
      }

      grnItems.push({
        po_item_id: receivedItem.po_item_id,
        item_id: poItem.item_id._id,
        part_no: poItem.part_no,
        description: poItem.description,
        received_qty: receivedItem.received_qty,
        accepted_qty: 0,
        rejected_qty: 0,
        unit: poItem.unit,
        batch_no: receivedItem.batch_no || '',
        heat_no: receivedItem.heat_no || '',
        mill_cert_path: receivedItem.mill_cert_path || '',
        expiry_date: receivedItem.expiry_date || null,
        storage_location: receivedItem.storage_location || '',
        item_status: 'Pending'
      });
    }

    // 5. Create GRN
    const grn = new GRN({
      grn_date: new Date(),
      po_id: po._id,
      po_number: po.po_number,
      vendor_id: po.vendor_id._id,
      vendor_name: po.vendor_name,
      vendor_invoice_no: vendor_invoice_no || '',
      vendor_invoice_date: vendor_invoice_date || null,
      vehicle_no: vehicle_no || '',
      lr_number: lr_number || '',
      lr_date: lr_date || null,
      transporter_name: transporter_name || '',
      receiving_store: receiving_store,
      received_by: req.user._id,
      receipt_time: new Date(),
      items: grnItems,
      qc_required: true,
      qc_status: 'Pending',
      status: 'Created',
      remarks: remarks || '',
      created_by: req.user._id,
      updated_by: req.user._id
    });

    await grn.save();

    // 6. Update PO received quantities
    for (const receivedItem of items) {
      const poItem = po.items.find(
        item => item._id.toString() === receivedItem.po_item_id
      );
      
      if (poItem) {
        poItem.received_qty += receivedItem.received_qty;
        poItem.pending_qty = poItem.ordered_qty - poItem.received_qty;
        
        if (poItem.pending_qty === 0) {
          poItem.item_status = 'Fully Received';
        } else if (poItem.received_qty > 0) {
          poItem.item_status = 'Partially Received';
        }
      }
    }

    const anyItemReceived = po.items.some(item => item.received_qty > 0);
    const allItemsFullyReceivedNow = po.items.every(item => item.pending_qty === 0);

    if (allItemsFullyReceivedNow) {
      po.status = 'Fully Received';
    } else if (anyItemReceived) {
      po.status = 'Partially Received';
    }

    await po.save();

    // 7. Create Inspection Record
    const inspectionItems = grn.items.map(item => ({
      item_id: item.item_id,
      part_no: item.part_no,
      description: item.description,
      received_qty: item.received_qty,
      sample_qty: Math.ceil(item.received_qty * 0.1),
      status: 'Pending'
    }));

    const inspectionRecord = new InspectionRecord({
      grn_id: grn._id,
      po_id: po._id,
      vendor_id: po.vendor_id._id,
      items: inspectionItems,
      inspection_type: 'Incoming',
      status: 'Pending',
      created_by: req.user._id
    });

    await inspectionRecord.save();
    
    grn.qc_id = inspectionRecord._id;
    await grn.save();

    res.status(201).json({
      success: true,
      message: 'GRN created successfully',
      data: {
        _id: grn._id,
        grn_number: grn.grn_number,
        po_number: grn.po_number,
        status: grn.status,
        qc_status: grn.qc_status,
        total_received_qty: grn.total_received_qty,
        inspection_record_id: inspectionRecord._id,
        next_step: 'QC inspection required'
      }
    });

  } catch (error) {
    console.error('Create GRN error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create GRN',
      error: error.message
    });
  }
};

// ======================================================
// RECORD QC RESULTS
// PUT /api/grns/:id/qc-result
// ======================================================
exports.recordQCResult = async (req, res) => {
  try {
    const { id } = req.params;
    const { items, qc_remarks } = req.body;

    const grn = await GRN.findById(id)
      .populate('po_id')
      .populate('vendor_id');

    if (!grn) {
      return res.status(404).json({
        success: false,
        message: 'GRN not found',
        error: 'GRN_NOT_FOUND'
      });
    }

    if (grn.qc_status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `QC already completed with status: ${grn.qc_status}`,
        error: 'QC_ALREADY_COMPLETED'
      });
    }

    const inspectionRecord = await InspectionRecord.findById(grn.qc_id);
    if (!inspectionRecord) {
      return res.status(404).json({
        success: false,
        message: 'Inspection record not found',
        error: 'INSPECTION_NOT_FOUND'
      });
    }

    let totalAccepted = 0;
    let totalRejected = 0;
    const stockTransactions = [];
    let ncrCreated = false;
    let ncr = null;

    for (const qcItem of items) {
      const grnItem = grn.items.find(
        item => item._id.toString() === qcItem.item_id
      );

      if (!grnItem) {
        return res.status(400).json({
          success: false,
          message: `Item not found in GRN: ${qcItem.item_id}`,
          error: 'ITEM_NOT_FOUND'
        });
      }

      if (qcItem.accepted_qty + qcItem.rejected_qty > grnItem.received_qty) {
        return res.status(400).json({
          success: false,
          message: `Accepted + Rejected quantity exceeds received quantity for item ${grnItem.part_no}`,
          error: 'INVALID_QUANTITY'
        });
      }

      grnItem.accepted_qty = qcItem.accepted_qty;
      grnItem.rejected_qty = qcItem.rejected_qty;
      grnItem.rejection_reason = qcItem.rejection_reason || '';
      
      totalAccepted += qcItem.accepted_qty;
      totalRejected += qcItem.rejected_qty;

      if (qcItem.rejected_qty === grnItem.received_qty) {
        grnItem.item_status = 'Rejected';
      } else if (qcItem.accepted_qty === grnItem.received_qty) {
        grnItem.item_status = 'Accepted';
      } else if (qcItem.accepted_qty > 0) {
        grnItem.item_status = 'Partially Accepted';
      }

      const inspItem = inspectionRecord.items.find(
        i => i.item_id.toString() === grnItem.item_id.toString()
      );
      if (inspItem) {
        inspItem.accepted_qty = qcItem.accepted_qty;
        inspItem.rejected_qty = qcItem.rejected_qty;
        inspItem.status = qcItem.accepted_qty === grnItem.received_qty ? 'Passed' : 
                         qcItem.rejected_qty === grnItem.received_qty ? 'Failed' : 'Partially Passed';
      }

      // Create Stock Transaction for accepted items
      if (qcItem.accepted_qty > 0) {
        const poItem = grn.po_id.items.find(i => i.part_no === grnItem.part_no);
        
        const stockTransaction = new StockTransaction({
          transaction_type: 'GRN Receipt',
          transaction_date: new Date(),
          grn_id: grn._id,
          po_id: grn.po_id._id,
          item_id: grnItem.item_id,
          part_no: grnItem.part_no,
          quantity: qcItem.accepted_qty,
          unit: grnItem.unit,
          batch_no: grnItem.batch_no,
          heat_no: grnItem.heat_no,
          to_location: {
            bin_code: grnItem.storage_location
          },
          reference_doc: grn.grn_number,
          unit_cost: poItem?.unit_price || 0,
          total_cost: qcItem.accepted_qty * (poItem?.unit_price || 0),
          created_by: req.user._id,
          posted_by: req.user._id,
          posted_at: new Date()
        });
        
        await stockTransaction.save();
        stockTransactions.push(stockTransaction);
        grn.stock_transaction_ids.push(stockTransaction._id);
      }

      // Create NCR for rejected items
      if (qcItem.rejected_qty > 0) {
        ncr = new NCR({
          ncr_date: new Date(),
          grn_id: grn._id,
          po_id: grn.po_id._id,
          vendor_id: grn.vendor_id._id,
          item_id: grnItem.item_id,
          part_no: grnItem.part_no,
          rejected_qty: qcItem.rejected_qty,
          unit: grnItem.unit,
          ncr_type: 'Incoming Material',
          severity: qcItem.rejected_qty > grnItem.received_qty * 0.2 ? 'Critical' : 'Major',
          defect_description: qcItem.rejection_reason || 'Quality issues detected during inspection',
          disposition: 'Return to Vendor',
          disposition_notes: 'Rejected items to be returned for replacement or credit',
          created_by: req.user._id
        });
        
        await ncr.save();
        grn.ncr_id = ncr._id;
        ncrCreated = true;
      }
    }

    grn.total_accepted_qty = totalAccepted;
    grn.total_rejected_qty = totalRejected;
    
    if (totalRejected === grn.total_received_qty) {
      grn.qc_status = 'Failed';
      grn.status = 'Rejected';
      inspectionRecord.status = 'Failed';
    } else if (totalAccepted === grn.total_received_qty) {
      grn.qc_status = 'Passed';
      grn.status = 'Accepted';
      inspectionRecord.status = 'Passed';
    } else {
      grn.qc_status = 'Partially Passed';
      grn.status = 'Partially Accepted';
      inspectionRecord.status = 'Partially Passed';
    }
    
    grn.qc_completed_at = new Date();
    grn.qc_completed_by = req.user._id;
    grn.updated_by = req.user._id;
    grn.remarks = qc_remarks || grn.remarks;

    await grn.save();

    inspectionRecord.completed_at = new Date();
    inspectionRecord.completed_by = req.user._id;
    inspectionRecord.remarks = qc_remarks;
    await inspectionRecord.save();

    res.status(200).json({
      success: true,
      message: 'QC results recorded successfully',
      data: {
        grn_number: grn.grn_number,
        status: grn.status,
        qc_status: grn.qc_status,
        summary: {
          total_received: grn.total_received_qty,
          total_accepted: grn.total_accepted_qty,
          total_rejected: grn.total_rejected_qty,
          acceptance_rate: grn.total_received_qty > 0 
            ? ((grn.total_accepted_qty / grn.total_received_qty) * 100).toFixed(2) + '%' 
            : '0%',
          stock_updated: stockTransactions.length > 0,
          ncr_created: ncrCreated
        },
        stock_transactions: stockTransactions.map(t => ({
          id: t._id,
          transaction_number: t.transaction_number,
          quantity: t.quantity,
          total_cost: t.total_cost
        })),
        ncr: ncr ? {
          id: ncr._id,
          ncr_number: ncr.ncr_number,
          rejected_qty: ncr.rejected_qty
        } : null,
        inspection_record: {
          id: inspectionRecord._id,
          inspection_number: inspectionRecord.inspection_number,
          status: inspectionRecord.status
        }
      }
    });

  } catch (error) {
    console.error('Record QC result error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record QC results',
      error: error.message
    });
  }
};

// ======================================================
// GET ALL GRNs
// GET /api/grns
// ======================================================
exports.getAllGRNs = async (req, res) => {
  try {
    const {
      status,
      qc_status,
      po_id,
      vendor_id,
      from_date,
      to_date,
      page = 1,
      limit = 20,
      sort_by = 'createdAt',
      sort_order = 'desc'
    } = req.query;

    let filter = {};

    if (status) filter.status = status;
    if (qc_status) filter.qc_status = qc_status;
    if (po_id) filter.po_id = po_id;
    if (vendor_id) filter.vendor_id = vendor_id;

    if (from_date || to_date) {
      filter.grn_date = {};
      if (from_date) filter.grn_date.$gte = new Date(from_date);
      if (to_date) filter.grn_date.$lte = new Date(to_date);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sort_by] = sort_order === 'asc' ? 1 : -1;

    const grns = await GRN.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('po_id', 'po_number')
      .populate('vendor_id', 'vendor_name vendor_code')
      .populate('received_by', 'Username Email')
      .populate('created_by', 'Username Email');

    const total = await GRN.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: grns,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get all GRNs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch GRNs',
      error: error.message
    });
  }
};

// ======================================================
// GET GRN BY ID
// GET /api/grns/:id
// ======================================================
exports.getGRNById = async (req, res) => {
  try {
    const { id } = req.params;

    const grn = await GRN.findById(id)
      .populate('po_id')
      .populate('vendor_id')
      .populate('received_by', 'Username Email')
      .populate('qc_completed_by', 'Username Email')
      .populate('created_by', 'Username Email')
      .populate('updated_by', 'Username Email')
      .populate('items.item_id')
      .populate('stock_transaction_ids')
      .populate('ncr_id');

    if (!grn) {
      return res.status(404).json({
        success: false,
        message: 'GRN not found',
        error: 'GRN_NOT_FOUND'
      });
    }

    res.status(200).json({
      success: true,
      data: grn
    });

  } catch (error) {
    console.error('Get GRN by id error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch GRN',
      error: error.message
    });
  }
};