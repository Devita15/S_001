const Bom = require('../../models/BOM/Bom');
const BomRevision = require('../../models/BOM/BomRevision');
const Item = require('../../models/CRM/Item');
const User = require("../../models/user's & setting's/User");
const mongoose = require('mongoose');
const { generateBomId } = require('../../utils/BOM/bomHelpers');
const { validateComponents } = require('../../services/BOM/bomValidationService');
const { explodeBOM } = require('../../services/BOM/bomExplosionService');

// @desc    Create new BOM
// @route   POST /api/boms
// @access  Admin, Manager
exports.createBOM = async (req, res) => {
  try {
    const {
      parent_item_id,
      bom_version,
      bom_type,
      batch_size,
      yield_percent,
      setup_time_min,
      cycle_time_min,
      components,
      effective_from,
      effective_to,
      status = 'Draft'
    } = req.body;

    if (!parent_item_id || !bom_version || !bom_type || !batch_size || !components) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: parent_item_id, bom_version, bom_type, batch_size, components'
      });
    }

    const parentItem = await Item.findById(parent_item_id);
    if (!parentItem) {
      return res.status(404).json({
        success: false,
        message: 'Parent item not found'
      });
    }

    const existingBOM = await Bom.findOne({
      parent_item_id,
      bom_version
    });

    if (existingBOM) {
      return res.status(400).json({
        success: false,
        message: `BOM version ${bom_version} already exists for this item`
      });
    }

    const componentIds = components.map(c => c.component_item_id);
    const componentItems = await Item.find({
      _id: { $in: componentIds }
    });

    if (componentItems.length !== componentIds.length) {
      const foundIds = componentItems.map(i => i._id.toString());
      const missingIds = componentIds.filter(id => !foundIds.includes(id.toString()));
      
      return res.status(400).json({
        success: false,
        message: 'Some component items not found',
        missing_ids: missingIds
      });
    }

    const validationResult = await validateComponents(components, componentItems);
    if (!validationResult.valid) {
      return res.status(400).json({
        success: false,
        message: validationResult.message,
        errors: validationResult.errors
      });
    }

    const bom_id = await generateBomId();

    const bom = await Bom.create({
      bom_id,
      parent_item_id,
      parent_part_no: parentItem.part_no,
      bom_version,
      bom_type,
      batch_size,
      yield_percent: yield_percent || 100,
      setup_time_min: setup_time_min || 0,
      cycle_time_min: cycle_time_min || 0,
      components: components.map(c => ({
        ...c,
        level: c.level || 1,
        scrap_percent: c.scrap_percent || 0,
        is_phantom: c.is_phantom || false,
        is_subcontract: c.is_subcontract || false
      })),
      effective_from: effective_from || new Date(),
      effective_to,
      status,
      created_by: req.user._id,
      current_revision: 0
    });

    const revisionData = {
      revision_id: `REV-${bom_id}-000`,
      bom_id: bom._id,
      revision_no: 0,
      snapshot_data: {
        bom_id: bom.bom_id,
        parent_item: {
          _id: parentItem._id,
          part_no: parentItem.part_no,
          part_description: parentItem.part_description
        },
        bom_version: bom.bom_version,
        bom_type: bom.bom_type,
        batch_size: bom.batch_size,
        components: bom.components
      },
      change_description: 'Initial BOM creation',
      created_by: req.user._id,
      is_current: true
    };

    await BomRevision.create(revisionData);

    const populatedBom = await Bom.findById(bom._id)
      .populate('parent_item_id', 'part_no part_description drawing_no revision_no')
      .populate('components.component_item_id', 'part_no part_description unit rm_grade')
      .populate('components.subcontract_vendor', 'name vendor_code')
      .populate('created_by', 'name email')
      .populate('approved_by', 'name email');

    res.status(201).json({
      success: true,
      message: 'BOM created successfully',
      data: populatedBom
    });

  } catch (error) {
    console.error('Create BOM error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'BOM with this version already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all BOMs with filters
// @route   GET /api/boms
// @access  All roles
exports.getBOMs = async (req, res) => {
  try {
    const {
      parent_item,
      bom_type,
      is_default,
      status,
      bom_version,
      page = 1,
      limit = 20,
      sort = '-created_at'
    } = req.query;

    const filter = { is_active: true };
    
    if (parent_item) filter.parent_item_id = parent_item;
    if (bom_type) filter.bom_type = bom_type;
    if (is_default !== undefined) filter.is_default = is_default === 'true';
    if (status) filter.status = status;
    if (bom_version) filter.bom_version = new RegExp(bom_version, 'i');

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const boms = await Bom.find(filter)
      .populate('parent_item_id', 'part_no part_description drawing_no')
      .populate('components.component_item_id', 'part_no part_description unit')
      .populate('components.subcontract_vendor', 'name vendor_code')
      .populate('created_by', 'name email')
      .populate('approved_by', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Bom.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: boms,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get BOMs error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single BOM by ID
// @route   GET /api/boms/:id
// @access  All roles
exports.getBOMById = async (req, res) => {
  try {
    const bom = await Bom.findById(req.params.id)
      .populate('parent_item_id', 'part_no part_description drawing_no revision_no rm_grade density unit hsn_code')
      .populate({
        path: 'components.component_item_id',
        select: 'part_no part_description unit rm_grade density'
      })
      .populate('components.subcontract_vendor', 'name vendor_code gstin')
      .populate('created_by', 'name email')
      .populate('approved_by', 'name email')
      .populate('updated_by', 'name email');

    if (!bom) {
      return res.status(404).json({
        success: false,
        message: 'BOM not found'
      });
    }

    const revisionCount = await BomRevision.countDocuments({ bom_id: bom._id });

    res.status(200).json({
      success: true,
      data: {
        ...bom.toObject(),
        revision_count: revisionCount
      }
    });

  } catch (error) {
    console.error('Get BOM by ID error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update BOM
// @route   PUT /api/boms/:id
// @access  Manager, Production
exports.updateBOM = async (req, res) => {
  try {
    const {
      bom_version,
      bom_type,
      batch_size,
      yield_percent,
      setup_time_min,
      cycle_time_min,
      components,
      effective_from,
      effective_to,
      status
    } = req.body;

    const bom = await Bom.findById(req.params.id)
      .populate('parent_item_id');

    if (!bom) {
      return res.status(404).json({
        success: false,
        message: 'BOM not found'
      });
    }

    if (bom.status === 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update cancelled BOM'
      });
    }

    if (components) {
      const componentIds = components.map(c => c.component_item_id);
      const componentItems = await Item.find({
        _id: { $in: componentIds }
      });

      if (componentItems.length !== componentIds.length) {
        return res.status(400).json({
          success: false,
          message: 'Some component items not found'
        });
      }

      const validationResult = await validateComponents(components, componentItems);
      if (!validationResult.valid) {
        return res.status(400).json({
          success: false,
          message: validationResult.message,
          errors: validationResult.errors
        });
      }
    }

    if (bom_version && bom_version !== bom.bom_version) {
      const existingBOM = await Bom.findOne({
        parent_item_id: bom.parent_item_id,
        bom_version
      });

      if (existingBOM) {
        return res.status(400).json({
          success: false,
          message: `BOM version ${bom_version} already exists for this item`
        });
      }
    }

    const changes = [];
    if (bom_version && bom_version !== bom.bom_version) changes.push('version');
    if (components) changes.push('components');
    if (batch_size && batch_size !== bom.batch_size) changes.push('batch_size');
    if (bom_type && bom_type !== bom.bom_type) changes.push('type');

    if (bom_version) bom.bom_version = bom_version;
    if (bom_type) bom.bom_type = bom_type;
    if (batch_size) bom.batch_size = batch_size;
    if (yield_percent !== undefined) bom.yield_percent = yield_percent;
    if (setup_time_min !== undefined) bom.setup_time_min = setup_time_min;
    if (cycle_time_min !== undefined) bom.cycle_time_min = cycle_time_min;
    if (components) bom.components = components.map(c => ({
      ...c,
      level: c.level || 1,
      scrap_percent: c.scrap_percent || 0
    }));
    if (effective_from) bom.effective_from = effective_from;
    if (effective_to) bom.effective_to = effective_to;
    if (status) bom.status = status;
    
    bom.updated_by = req.user._id;

    await bom.save();

    if (components || bom_version) {
      const newRevisionNo = (bom.current_revision || 0) + 1;

      const revisionData = {
        revision_id: `REV-${bom.bom_id}-${String(newRevisionNo).padStart(3, '0')}`,
        bom_id: bom._id,
        revision_no: newRevisionNo,
        snapshot_data: {
          bom_id: bom.bom_id,
          parent_item: {
            _id: bom.parent_item_id._id,
            part_no: bom.parent_item_id.part_no,
            part_description: bom.parent_item_id.part_description
          },
          bom_version: bom.bom_version,
          bom_type: bom.bom_type,
          batch_size: bom.batch_size,
          components: bom.components
        },
        change_description: `Updated: ${changes.join(', ')}`,
        created_by: req.user._id,
        previous_revision_no: bom.current_revision,
        is_current: true
      };

      await BomRevision.create(revisionData);

      await BomRevision.updateMany(
        { bom_id: bom._id, revision_no: bom.current_revision },
        { $set: { is_current: false } }
      );

      bom.current_revision = newRevisionNo;
      await bom.save();
    }

    const updatedBom = await Bom.findById(bom._id)
      .populate('parent_item_id', 'part_no part_description')
      .populate('components.component_item_id', 'part_no part_description unit')
      .populate('components.subcontract_vendor', 'name vendor_code')
      .populate('updated_by', 'name email');

    res.status(200).json({
      success: true,
      message: 'BOM updated successfully',
      data: updatedBom
    });

  } catch (error) {
    console.error('Update BOM error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Set BOM as default
// @route   POST /api/boms/:id/set-default
// @access  Manager
exports.setDefaultBOM = async (req, res) => {
  try {
    const bom = await Bom.findById(req.params.id)
      .populate('parent_item_id');

    if (!bom) {
      return res.status(404).json({
        success: false,
        message: 'BOM not found'
      });
    }

    if (!bom.approved_by) {
      return res.status(400).json({
        success: false,
        message: 'BOM must be approved before setting as default'
      });
    }

    if (bom.status !== 'Active') {
      return res.status(400).json({
        success: false,
        message: 'Only Active BOMs can be set as default'
      });
    }

    await Bom.updateMany(
      { 
        parent_item_id: bom.parent_item_id,
        _id: { $ne: bom._id }
      },
      { $set: { is_default: false } }
    );

    bom.is_default = true;
    await bom.save();

    res.status(200).json({
      success: true,
      message: 'BOM set as default successfully',
      data: {
        bom_id: bom.bom_id,
        parent_part_no: bom.parent_part_no,
        bom_version: bom.bom_version,
        is_default: true
      }
    });

  } catch (error) {
    console.error('Set default BOM error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get BOM explosion (multi-level)
// @route   GET /api/boms/:id/explosion
// @access  All roles
exports.explodeBOM = async (req, res) => {
  try {
    const { quantity = 1, effective_date = new Date() } = req.query;

    const bom = await Bom.findById(req.params.id)
      .populate('parent_item_id')
      .populate({
        path: 'components.component_item_id',
        select: 'part_no part_description item_type is_phantom'
      });

    if (!bom) {
      return res.status(404).json({
        success: false,
        message: 'BOM not found'
      });
    }

    const explosionResult = await explodeBOM(bom, parseFloat(quantity), effective_date);

    res.status(200).json({
      success: true,
      data: {
        bom_id: bom.bom_id,
        parent_item: {
          part_no: bom.parent_part_no,
          description: bom.parent_item_id.part_description
        },
        requested_quantity: parseFloat(quantity),
        total_components: explosionResult.summary.total_unique_components,
        total_quantity_by_unit: explosionResult.summary.total_quantity_by_unit,
        explosion: explosionResult.components,
        summary: explosionResult.summary
      }
    });

  } catch (error) {
    console.error('BOM explosion error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Where used (find all BOMs where item is a component)
// @route   GET /api/boms/where-used/:componentId
// @access  All roles
exports.whereUsed = async (req, res) => {
  try {
    const { componentId } = req.params;

    const component = await Item.findById(componentId);
    if (!component) {
      return res.status(404).json({
        success: false,
        message: 'Component item not found'
      });
    }

    const boms = await Bom.find({
      'components.component_item_id': componentId,
      is_active: true
    })
      .populate('parent_item_id', 'part_no part_description')
      .populate('created_by', 'name email')
      .select('bom_id parent_part_no bom_version is_default status effective_from effective_to');

    res.status(200).json({
      success: true,
      data: {
        component: {
          _id: component._id,
          part_no: component.part_no,
          part_description: component.part_description
        },
        used_in_boms: boms.map(bom => ({
          bom_id: bom.bom_id,
          parent_part_no: bom.parent_part_no,
          parent_description: bom.parent_item_id?.part_description,
          bom_version: bom.bom_version,
          is_default: bom.is_default,
          status: bom.status,
          effective_from: bom.effective_from,
          effective_to: bom.effective_to
        }))
      }
    });

  } catch (error) {
    console.error('Where used error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Validate BOM
// @route   GET /api/boms/:id/validate
// @access  All roles
exports.validateBOM = async (req, res) => {
  try {
    const bom = await Bom.findById(req.params.id)
      .populate('parent_item_id')
      .populate({
        path: 'components.component_item_id',
        select: 'part_no part_description is_active'
      });

    if (!bom) {
      return res.status(404).json({
        success: false,
        message: 'BOM not found'
      });
    }

    const issues = [];

    if (!bom.parent_item_id.is_active) {
      issues.push({
        type: 'error',
        message: `Parent item ${bom.parent_part_no} is inactive`
      });
    }

    for (const comp of bom.components) {
      if (!comp.component_item_id) {
        issues.push({
          type: 'error',
          message: `Component at level ${comp.level} has invalid item reference`
        });
      } else if (!comp.component_item_id.is_active) {
        issues.push({
          type: 'warning',
          message: `Component ${comp.component_part_no} is inactive`
        });
      }

      if (comp.component_item_id && 
          comp.component_item_id._id.toString() === bom.parent_item_id._id.toString()) {
        issues.push({
          type: 'error',
          message: `Circular reference: Component ${comp.component_part_no} is same as parent item`
        });
      }

      if (comp.quantity_per <= 0) {
        issues.push({
          type: 'error',
          message: `Component ${comp.component_part_no} has invalid quantity: ${comp.quantity_per}`
        });
      }

      if (comp.scrap_percent < 0 || comp.scrap_percent > 100) {
        issues.push({
          type: 'error',
          message: `Component ${comp.component_part_no} has invalid scrap percent: ${comp.scrap_percent}`
        });
      }
    }

    const seen = new Map();
    for (const comp of bom.components) {
      const key = `${comp.level}-${comp.component_part_no}`;
      if (seen.has(key)) {
        issues.push({
          type: 'warning',
          message: `Duplicate component ${comp.component_part_no} at level ${comp.level}`
        });
      }
      seen.set(key, true);
    }

    res.status(200).json({
      success: true,
      data: {
        bom_id: bom.bom_id,
        parent_part_no: bom.parent_part_no,
        is_valid: issues.filter(i => i.type === 'error').length === 0,
        issues,
        summary: {
          error_count: issues.filter(i => i.type === 'error').length,
          warning_count: issues.filter(i => i.type === 'warning').length,
          info_count: issues.filter(i => i.type === 'info').length
        }
      }
    });

  } catch (error) {
    console.error('Validate BOM error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Copy BOM to new version
// @route   POST /api/boms/:id/copy
// @access  Manager, Production
exports.copyBOM = async (req, res) => {
  try {
    const { new_version, change_description } = req.body;

    if (!new_version) {
      return res.status(400).json({
        success: false,
        message: 'New version number is required'
      });
    }

    const sourceBom = await Bom.findById(req.params.id)
      .populate('parent_item_id');

    if (!sourceBom) {
      return res.status(404).json({
        success: false,
        message: 'Source BOM not found'
      });
    }

    const existingBom = await Bom.findOne({
      parent_item_id: sourceBom.parent_item_id,
      bom_version: new_version
    });

    if (existingBom) {
      return res.status(400).json({
        success: false,
        message: `BOM version ${new_version} already exists for this item`
      });
    }

    const bom_id = await generateBomId();

    const newBom = await Bom.create({
      bom_id,
      parent_item_id: sourceBom.parent_item_id,
      parent_part_no: sourceBom.parent_part_no,
      bom_version: new_version,
      bom_type: sourceBom.bom_type,
      batch_size: sourceBom.batch_size,
      yield_percent: sourceBom.yield_percent,
      setup_time_min: sourceBom.setup_time_min,
      cycle_time_min: sourceBom.cycle_time_min,
      components: sourceBom.components.map(c => c.toObject()),
      effective_from: new Date(),
      effective_to: null,
      status: 'Draft',
      created_by: req.user._id,
      current_revision: 0
    });

    const revisionData = {
      revision_id: `REV-${bom_id}-000`,
      bom_id: newBom._id,
      revision_no: 0,
      snapshot_data: {
        bom_id: newBom.bom_id,
        parent_item: {
          _id: sourceBom.parent_item_id._id,
          part_no: sourceBom.parent_item_id.part_no,
          part_description: sourceBom.parent_item_id.part_description
        },
        bom_version: newBom.bom_version,
        bom_type: newBom.bom_type,
        batch_size: newBom.batch_size,
        components: newBom.components
      },
      change_description: change_description || `Copied from ${sourceBom.bom_id} v${sourceBom.bom_version}`,
      created_by: req.user._id,
      is_current: true
    };

    await BomRevision.create(revisionData);

    const populatedBom = await Bom.findById(newBom._id)
      .populate('parent_item_id', 'part_no part_description')
      .populate('components.component_item_id', 'part_no part_description');

    res.status(201).json({
      success: true,
      message: 'BOM copied successfully',
      data: populatedBom
    });

  } catch (error) {
    console.error('Copy BOM error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Approve BOM
// @route   POST /api/boms/:id/approve
// @access  Manager, QA Head
exports.approveBOM = async (req, res) => {
  try {
    const bom = await Bom.findById(req.params.id);

    if (!bom) {
      return res.status(404).json({
        success: false,
        message: 'BOM not found'
      });
    }

    if (bom.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        message: `Cannot approve BOM in ${bom.status} status`
      });
    }

    bom.status = 'Active';
    bom.approved_by = req.user._id;
    bom.approved_at = new Date();
    await bom.save();

    res.status(200).json({
      success: true,
      message: 'BOM approved successfully',
      data: {
        bom_id: bom.bom_id,
        status: bom.status,
        approved_by: req.user._id,
        approved_at: bom.approved_at
      }
    });

  } catch (error) {
    console.error('Approve BOM error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};