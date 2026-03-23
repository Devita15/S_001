const Machine = require('../../models/BOM/Machine');
const mongoose = require('mongoose');

// Helper to generate machine ID
async function generateMachineId() {
  const lastMachine = await Machine.findOne({}, { machine_id: 1 }).sort({ machine_id: -1 });
  let sequence = 1;
  if (lastMachine) {
    const lastSeq = parseInt(lastMachine.machine_id.split('-').pop());
    sequence = lastSeq + 1;
  }
  return `MCH-${String(sequence).padStart(6, '0')}`;
}

// @desc    Create new machine
// @route   POST /api/machines
// @access  Admin, Manager
exports.createMachine = async (req, res) => {
  try {
    const {
      machine_name,
      machine_code,
      machine_type,
      capacity_value,
      capacity_unit,
      work_centre,
      shifts_per_day,
      hours_per_shift,
      oee_target_percent,
      make,
      model,
      serial_number,
      installation_date,
      location,
      operating_cost_per_hour
    } = req.body;

    if (!machine_name || !machine_code || !machine_type || !work_centre) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: machine_name, machine_code, machine_type, work_centre'
      });
    }

    const existingMachine = await Machine.findOne({ machine_code });
    if (existingMachine) {
      return res.status(400).json({
        success: false,
        message: `Machine code ${machine_code} already exists`
      });
    }

    const machine_id = await generateMachineId();

    const machine = await Machine.create({
      machine_id,
      machine_name,
      machine_code,
      machine_type,
      capacity_value: capacity_value || 0,
      capacity_unit: capacity_unit || 'None',
      work_centre,
      shifts_per_day: shifts_per_day || 2,
      hours_per_shift: hours_per_shift || 8,
      oee_target_percent: oee_target_percent || 75,
      make,
      model,
      serial_number,
      installation_date,
      location,
      operating_cost_per_hour: operating_cost_per_hour || 0,
      created_by: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Machine created successfully',
      data: machine
    });

  } catch (error) {
    console.error('Create machine error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Machine with this code already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all machines
// @route   GET /api/machines
// @access  All roles
exports.getMachines = async (req, res) => {
  try {
    const {
      machine_type,
      work_centre,
      status,
      is_active,
      page = 1,
      limit = 20,
      sort = 'machine_code'
    } = req.query;

    const filter = {};
    if (machine_type) filter.machine_type = machine_type;
    if (work_centre) filter.work_centre = work_centre;
    if (status) filter.status = status;
    if (is_active !== undefined) filter.is_active = is_active === 'true';

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const machines = await Machine.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Machine.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: machines,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get machines error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get machine by ID
// @route   GET /api/machines/:id
// @access  All roles
exports.getMachineById = async (req, res) => {
  try {
    const machine = await Machine.findById(req.params.id);

    if (!machine) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found'
      });
    }

    res.status(200).json({
      success: true,
      data: machine
    });

  } catch (error) {
    console.error('Get machine by ID error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update machine
// @route   PUT /api/machines/:id
// @access  Manager
exports.updateMachine = async (req, res) => {
  try {
    const machine = await Machine.findById(req.params.id);

    if (!machine) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found'
      });
    }

    const {
      machine_name,
      machine_code,
      machine_type,
      capacity_value,
      capacity_unit,
      work_centre,
      shifts_per_day,
      hours_per_shift,
      oee_target_percent,
      status,
      make,
      model,
      serial_number,
      installation_date,
      location,
      operating_cost_per_hour,
      is_active
    } = req.body;

    if (machine_code && machine_code !== machine.machine_code) {
      const existingMachine = await Machine.findOne({ machine_code });
      if (existingMachine) {
        return res.status(400).json({
          success: false,
          message: `Machine code ${machine_code} already exists`
        });
      }
    }

    if (machine_name) machine.machine_name = machine_name;
    if (machine_code) machine.machine_code = machine_code;
    if (machine_type) machine.machine_type = machine_type;
    if (capacity_value !== undefined) machine.capacity_value = capacity_value;
    if (capacity_unit) machine.capacity_unit = capacity_unit;
    if (work_centre) machine.work_centre = work_centre;
    if (shifts_per_day) machine.shifts_per_day = shifts_per_day;
    if (hours_per_shift) machine.hours_per_shift = hours_per_shift;
    if (oee_target_percent) machine.oee_target_percent = oee_target_percent;
    if (status) machine.status = status;
    if (make) machine.make = make;
    if (model) machine.model = model;
    if (serial_number) machine.serial_number = serial_number;
    if (installation_date) machine.installation_date = installation_date;
    if (location) machine.location = location;
    if (operating_cost_per_hour !== undefined) machine.operating_cost_per_hour = operating_cost_per_hour;
    if (is_active !== undefined) machine.is_active = is_active;

    machine.updated_by = req.user._id;
    await machine.save();

    res.status(200).json({
      success: true,
      message: 'Machine updated successfully',
      data: machine
    });

  } catch (error) {
    console.error('Update machine error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update machine status
// @route   PUT /api/machines/:id/status
// @access  Manager
exports.updateMachineStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const machine = await Machine.findById(id);

    if (!machine) {
      return res.status(404).json({
        success: false,
        message: 'Machine not found'
      });
    }

    const oldStatus = machine.status;
    machine.status = status;
    machine.updated_by = req.user._id;

    if (status === 'Breakdown') {
      machine.last_maintenance_date = new Date();
    }

    await machine.save();

    // TODO: If status changed to Breakdown, trigger schedule conflict detection (Phase 05)
    if (status === 'Breakdown') {
      console.log(`Machine ${machine.machine_code} is now in Breakdown status`);
    }

    res.status(200).json({
      success: true,
      message: `Machine status changed from ${oldStatus} to ${status}`,
      data: machine
    });

  } catch (error) {
    console.error('Update machine status error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get machine capacity report
// @route   GET /api/machines/capacity-report
// @access  Manager
exports.getCapacityReport = async (req, res) => {
  try {
    const machines = await Machine.find({ is_active: true, status: 'Active' });

    const report = machines.map(machine => ({
      machine_id: machine.machine_id,
      machine_name: machine.machine_name,
      machine_code: machine.machine_code,
      work_centre: machine.work_centre,
      available_hours_per_day: machine.available_hours_per_day,
      shifts_per_day: machine.shifts_per_day,
      hours_per_shift: machine.hours_per_shift,
      status: machine.status,
      scheduled_hours_today: 0,
      utilization_percent: 0,
      oee_today: 0,
      note: 'Load data will be available after production scheduling is implemented (Phase 05)'
    }));

    res.status(200).json({
      success: true,
      data: report
    });

  } catch (error) {
    console.error('Get capacity report error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};