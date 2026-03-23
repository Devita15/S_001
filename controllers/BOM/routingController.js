const Routing = require('../../models/BOM/Routing');
const Machine = require('../../models/BOM/Machine');
const ProcessMaster = require('../../models/BOM/ProcessMaster');
const Item = require('../../models/CRM/Item');
const mongoose = require('mongoose');

// Helper to generate routing ID
async function generateRoutingId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `RTG-${year}${month}`;
  
  const lastRouting = await Routing.findOne(
    { routing_id: new RegExp(`^${prefix}`) },
    { routing_id: 1 }
  ).sort({ routing_id: -1 });
  
  let sequence = 1;
  if (lastRouting) {
    const lastSeq = parseInt(lastRouting.routing_id.split('-').pop());
    sequence = lastSeq + 1;
  }
  
  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}

// @desc    Create new routing
// @route   POST /api/routings
// @access  Manager, Production
exports.createRouting = async (req, res) => {
  try {
    const {
      routing_name,
      routing_type,
      applicable_items,
      operations,
      version = '1.0'
    } = req.body;

    if (!routing_name || !routing_type || !operations) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: routing_name, routing_type, operations'
      });
    }

    const sequences = operations.map(op => op.op_sequence);
    if (new Set(sequences).size !== sequences.length) {
      return res.status(400).json({
        success: false,
        message: 'Operation sequences must be unique'
      });
    }

    const sortedSequences = [...sequences].sort((a, b) => a - b);
    if (JSON.stringify(sequences) !== JSON.stringify(sortedSequences)) {
      return res.status(400).json({
        success: false,
        message: 'Operations must be in ascending sequence order'
      });
    }

    for (const op of operations) {
      const process = await ProcessMaster.findById(op.operation_id);
      if (!process) {
        return res.status(404).json({
          success: false,
          message: `Process not found for operation: ${op.operation_name}`
        });
      }

      if (op.machine_id) {
        const machine = await Machine.findById(op.machine_id);
        if (!machine) {
          return res.status(404).json({
            success: false,
            message: `Machine not found: ${op.machine_id}`
          });
        }
      }
    }

    if (applicable_items && applicable_items.length > 0) {
      const items = await Item.find({ _id: { $in: applicable_items } });
      if (items.length !== applicable_items.length) {
        return res.status(404).json({
          success: false,
          message: 'Some applicable items not found'
        });
      }
    }

    const routing_id = await generateRoutingId();

    const routing = await Routing.create({
      routing_id,
      routing_name,
      routing_type,
      applicable_items: applicable_items || [],
      operations,
      version,
      created_by: req.user._id,
      total_cycle_time_min: operations.reduce((sum, op) => sum + op.planned_run_min, 0)
    });

    const populatedRouting = await Routing.findById(routing._id)
      .populate('operations.operation_id', 'process_name rate_type standard_rate')
      .populate('operations.machine_id', 'machine_name machine_code')
      .populate('applicable_items', 'part_no part_description')
      .populate('created_by', 'name email');

    res.status(201).json({
      success: true,
      message: 'Routing created successfully',
      data: populatedRouting
    });

  } catch (error) {
    console.error('Create routing error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all routings
// @route   GET /api/routings
// @access  All roles
exports.getRoutings = async (req, res) => {
  try {
    const {
      routing_type,
      is_active,
      applicable_item,
      page = 1,
      limit = 20,
      sort = '-created_at'
    } = req.query;

    const filter = {};
    if (routing_type) filter.routing_type = routing_type;
    if (is_active !== undefined) filter.is_active = is_active === 'true';
    if (applicable_item) filter.applicable_items = applicable_item;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const routings = await Routing.find(filter)
      .populate('operations.operation_id', 'process_name rate_type')
      .populate('operations.machine_id', 'machine_name machine_code')
      .populate('applicable_items', 'part_no part_description')
      .populate('created_by', 'name email')
      .populate('approved_by', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Routing.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: routings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get routings error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get routing by ID
// @route   GET /api/routings/:id
// @access  All roles
exports.getRoutingById = async (req, res) => {
  try {
    const routing = await Routing.findById(req.params.id)
      .populate('operations.operation_id', 'process_name rate_type standard_rate description')
      .populate('operations.machine_id', 'machine_name machine_code work_centre capacity_value')
      .populate('operations.subcontract_vendor', 'vendor_name vendor_code gstin')
      .populate('applicable_items', 'part_no part_description item_category')
      .populate('created_by', 'name email')
      .populate('approved_by', 'name email')
      .populate('updated_by', 'name email');

    if (!routing) {
      return res.status(404).json({
        success: false,
        message: 'Routing not found'
      });
    }

    res.status(200).json({
      success: true,
      data: routing
    });

  } catch (error) {
    console.error('Get routing by ID error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update routing (creates new version)
// @route   PUT /api/routings/:id
// @access  Manager
exports.updateRouting = async (req, res) => {
  try {
    const routing = await Routing.findById(req.params.id);

    if (!routing) {
      return res.status(404).json({
        success: false,
        message: 'Routing not found'
      });
    }

    const oldVersion = routing.version;
    const newVersion = `${oldVersion.split('.')[0]}.${parseInt(oldVersion.split('.')[1]) + 1}`;

    const {
      routing_name,
      routing_type,
      applicable_items,
      operations,
      is_active
    } = req.body;

    if (operations) {
      const sequences = operations.map(op => op.op_sequence);
      if (new Set(sequences).size !== sequences.length) {
        return res.status(400).json({
          success: false,
          message: 'Operation sequences must be unique'
        });
      }
    }

    const newRouting = await Routing.create({
      routing_id: routing.routing_id,
      routing_name: routing_name || routing.routing_name,
      routing_type: routing_type || routing.routing_type,
      applicable_items: applicable_items || routing.applicable_items,
      operations: operations || routing.operations,
      version: newVersion,
      created_by: req.user._id,
      total_cycle_time_min: (operations || routing.operations).reduce((sum, op) => sum + op.planned_run_min, 0),
      is_active: is_active !== undefined ? is_active : routing.is_active
    });

    // Deactivate old version
    routing.is_active = false;
    await routing.save();

    const populatedRouting = await Routing.findById(newRouting._id)
      .populate('operations.operation_id', 'process_name rate_type')
      .populate('operations.machine_id', 'machine_name machine_code');

    res.status(200).json({
      success: true,
      message: 'Routing updated successfully (new version created)',
      data: {
        old_version: oldVersion,
        new_version: newVersion,
        routing: populatedRouting
      }
    });

  } catch (error) {
    console.error('Update routing error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Approve routing
// @route   POST /api/routings/:id/approve
// @access  Manager
exports.approveRouting = async (req, res) => {
  try {
    const routing = await Routing.findById(req.params.id);

    if (!routing) {
      return res.status(404).json({
        success: false,
        message: 'Routing not found'
      });
    }

    routing.approved_by = req.user._id;
    routing.approved_at = new Date();
    await routing.save();

    res.status(200).json({
      success: true,
      message: 'Routing approved successfully',
      data: {
        routing_id: routing.routing_id,
        approved_by: req.user._id,
        approved_at: routing.approved_at
      }
    });

  } catch (error) {
    console.error('Approve routing error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};