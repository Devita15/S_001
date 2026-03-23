const ProcessMaster = require('../../models/BOM/ProcessMaster');
const mongoose = require('mongoose');

// Helper to generate process ID
async function generateProcessId() {
  const lastProcess = await ProcessMaster.findOne({}, { process_id: 1 }).sort({ process_id: -1 });
  let sequence = 1;
  if (lastProcess) {
    const lastSeq = parseInt(lastProcess.process_id.split('-').pop());
    sequence = lastSeq + 1;
  }
  return `PRC-${String(sequence).padStart(6, '0')}`;
}

// @desc    Create new process
// @route   POST /api/process-master
// @access  Admin, Manager
exports.createProcess = async (req, res) => {
  try {
    const {
      process_name,
      process_category,
      rate_type,
      standard_rate,
      machine_type_required,
      skill_required,
      default_setup_time_min,
      default_run_time_min,
      default_scrap_pct,
      description,
      is_subcontract_allowed
    } = req.body;

    if (!process_name || !process_category || !rate_type || !standard_rate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: process_name, process_category, rate_type, standard_rate'
      });
    }

    const existingProcess = await ProcessMaster.findOne({ process_name });
    if (existingProcess) {
      return res.status(400).json({
        success: false,
        message: `Process name ${process_name} already exists`
      });
    }

    const process_id = await generateProcessId();

    const process = await ProcessMaster.create({
      process_id,
      process_name,
      process_category,
      rate_type,
      standard_rate,
      machine_type_required: machine_type_required || 'None',
      skill_required,
      default_setup_time_min: default_setup_time_min || 0,
      default_run_time_min: default_run_time_min || 0,
      default_scrap_pct: default_scrap_pct || 0,
      description,
      is_subcontract_allowed: is_subcontract_allowed || false,
      created_by: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Process created successfully',
      data: process
    });

  } catch (error) {
    console.error('Create process error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Process with this name already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all processes
// @route   GET /api/process-master
// @access  All roles
exports.getProcesses = async (req, res) => {
  try {
    const {
      process_category,
      rate_type,
      is_active,
      page = 1,
      limit = 20,
      sort = 'process_name'
    } = req.query;

    const filter = {};
    if (process_category) filter.process_category = process_category;
    if (rate_type) filter.rate_type = rate_type;
    if (is_active !== undefined) filter.is_active = is_active === 'true';

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const processes = await ProcessMaster.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ProcessMaster.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: processes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get processes error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get process by ID
// @route   GET /api/process-master/:id
// @access  All roles
exports.getProcessById = async (req, res) => {
  try {
    const process = await ProcessMaster.findById(req.params.id);

    if (!process) {
      return res.status(404).json({
        success: false,
        message: 'Process not found'
      });
    }

    res.status(200).json({
      success: true,
      data: process
    });

  } catch (error) {
    console.error('Get process by ID error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update process
// @route   PUT /api/process-master/:id
// @access  Manager
exports.updateProcess = async (req, res) => {
  try {
    const process = await ProcessMaster.findById(req.params.id);

    if (!process) {
      return res.status(404).json({
        success: false,
        message: 'Process not found'
      });
    }

    const {
      process_name,
      process_category,
      rate_type,
      standard_rate,
      machine_type_required,
      skill_required,
      default_setup_time_min,
      default_run_time_min,
      default_scrap_pct,
      description,
      is_subcontract_allowed,
      is_active
    } = req.body;

    if (process_name && process_name !== process.process_name) {
      const existingProcess = await ProcessMaster.findOne({ process_name });
      if (existingProcess) {
        return res.status(400).json({
          success: false,
          message: `Process name ${process_name} already exists`
        });
      }
    }

    if (process_name) process.process_name = process_name;
    if (process_category) process.process_category = process_category;
    if (rate_type) process.rate_type = rate_type;
    if (standard_rate !== undefined) process.standard_rate = standard_rate;
    if (machine_type_required) process.machine_type_required = machine_type_required;
    if (skill_required) process.skill_required = skill_required;
    if (default_setup_time_min !== undefined) process.default_setup_time_min = default_setup_time_min;
    if (default_run_time_min !== undefined) process.default_run_time_min = default_run_time_min;
    if (default_scrap_pct !== undefined) process.default_scrap_pct = default_scrap_pct;
    if (description) process.description = description;
    if (is_subcontract_allowed !== undefined) process.is_subcontract_allowed = is_subcontract_allowed;
    if (is_active !== undefined) process.is_active = is_active;

    process.updated_by = req.user._id;
    await process.save();

    res.status(200).json({
      success: true,
      message: 'Process updated successfully',
      data: process
    });

  } catch (error) {
    console.error('Update process error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};