// controllers/HR/shiftController.js
const Shift = require('../../models/HR/Shift');
const EmployeeShift = require('../../models/HR/EmployeeShift');

class shiftController {
  
  // Create new shift
  async createShift(req, res) {
    try {
      const shiftData = req.body;
      
      // Check if shift code already exists
      const existingShift = await Shift.findOne({ 
        $or: [
          { Code: shiftData.Code },
          { ShiftName: shiftData.ShiftName }
        ]
      });
      
      if (existingShift) {
        return res.status(400).json({
          success: false,
          message: 'Shift code or name already exists'
        });
      }
      
      const shift = new Shift(shiftData);
      await shift.save();
      
      return res.status(201).json({
        success: true,
        message: 'Shift created successfully',
        data: shift
      });
      
    } catch (error) {
      console.error('Error in createShift:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
  
  // Get all shifts
  async getAllShifts(req, res) {
    try {
      const { isActive } = req.query;
      
      let query = {};
      if (isActive !== undefined) {
        query.IsActive = isActive === 'true';
      }
      
      const shifts = await Shift.find(query).sort({ CreatedAt: -1 });
      
      return res.json({
        success: true,
        count: shifts.length,
        data: shifts
      });
      
    } catch (error) {
      console.error('Error in getAllShifts:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
  
  // Get shift by ID
  async getShiftById(req, res) {
    try {
      const { id } = req.params;
      
      const shift = await Shift.findById(id);
      
      if (!shift) {
        return res.status(404).json({
          success: false,
          message: 'Shift not found'
        });
      }
      
      return res.json({
        success: true,
        data: shift
      });
      
    } catch (error) {
      console.error('Error in getShiftById:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
  
  // Update shift
  async updateShift(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      const shift = await Shift.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true, runValidators: true }
      );
      
      if (!shift) {
        return res.status(404).json({
          success: false,
          message: 'Shift not found'
        });
      }
      
      return res.json({
        success: true,
        message: 'Shift updated successfully',
        data: shift
      });
      
    } catch (error) {
      console.error('Error in updateShift:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
  
  // Delete shift
  async deleteShift(req, res) {
    try {
      const { id } = req.params;
      
      // Check if shift is assigned to any employee
      const assignedEmployees = await EmployeeShift.findOne({ 
        ShiftID: id, 
        IsCurrent: true 
      });
      
      if (assignedEmployees) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete shift that is currently assigned to employees'
        });
      }
      
      const shift = await Shift.findByIdAndDelete(id);
      
      if (!shift) {
        return res.status(404).json({
          success: false,
          message: 'Shift not found'
        });
      }
      
      return res.json({
        success: true,
        message: 'Shift deleted successfully'
      });
      
    } catch (error) {
      console.error('Error in deleteShift:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
  
  // Assign shift to employee
async assignShift(req, res) {
  try {
    const { employeeId, shiftId, effectiveFrom, effectiveTo } = req.body;
    
    if (!employeeId || !shiftId) {
      return res.status(400).json({
        success: false,
        message: 'employeeId and shiftId are required'
      });
    }
    
    // Check if shift exists
    const shift = await Shift.findById(shiftId);
    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }
    
    // ==================== DATE VALIDATIONS ====================
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Validate effectiveFrom
    let parsedEffectiveFrom = new Date();
    if (effectiveFrom) {
      parsedEffectiveFrom = new Date(effectiveFrom);
      
      // Check if date is valid
      if (isNaN(parsedEffectiveFrom.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid effectiveFrom date format'
        });
      }
      
      // Set to midnight for comparison
      parsedEffectiveFrom.setHours(0, 0, 0, 0);
      
      // Check if effectiveFrom is in the past
      if (parsedEffectiveFrom < today) {
        return res.status(400).json({
          success: false,
          message: 'effectiveFrom date cannot be in the past'
        });
      }
    } else {
      parsedEffectiveFrom = today;
    }
    
    // Validate effectiveTo if provided
    let parsedEffectiveTo = null;
    if (effectiveTo) {
      parsedEffectiveTo = new Date(effectiveTo);
      
      // Check if date is valid
      if (isNaN(parsedEffectiveTo.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid effectiveTo date format'
        });
      }
      
      // Set to midnight for comparison
      parsedEffectiveTo.setHours(0, 0, 0, 0);
      
      // Check if effectiveTo is before effectiveFrom
      if (parsedEffectiveTo <= parsedEffectiveFrom) {
        return res.status(400).json({
          success: false,
          message: 'effectiveTo date must be after effectiveFrom date'
        });
      }
      
      // Check if effectiveTo is in the past
      if (parsedEffectiveTo < today) {
        return res.status(400).json({
          success: false,
          message: 'effectiveTo date cannot be in the past'
        });
      }
      
    }
    // ==================== END DATE VALIDATIONS ====================
    
    // Check for overlapping shift assignments
    const overlappingShift = await EmployeeShift.findOne({
      EmployeeID: employeeId,
      IsCurrent: true,
      $or: [
        {
          EffectiveFrom: { $lte: parsedEffectiveTo || new Date(9999, 11, 31) },
          $or: [
            { EffectiveTo: { $gte: parsedEffectiveFrom } },
            { EffectiveTo: null }
          ]
        }
      ]
    });
    
    if (overlappingShift) {
      return res.status(400).json({
        success: false,
        message: 'Employee already has an active shift assignment for this period'
      });
    }
    
    // Set previous shift assignments as not current
    await EmployeeShift.updateMany(
      { EmployeeID: employeeId, IsCurrent: true },
      { 
        $set: { 
          IsCurrent: false, 
          EffectiveTo: parsedEffectiveFrom,
          UpdatedAt: new Date()
        } 
      }
    );
    
    // Create new shift assignment
    const employeeShift = new EmployeeShift({
      EmployeeID: employeeId,
      ShiftID: shiftId,
      EffectiveFrom: parsedEffectiveFrom,
      EffectiveTo: parsedEffectiveTo,
      IsCurrent: true,
      CreatedBy: req.user?._id,
      CreatedAt: new Date()
    });
    
    await employeeShift.save();
    
    // Populate shift details for response
    await employeeShift.populate('ShiftID');
    
    return res.status(201).json({
      success: true,
      message: 'Shift assigned successfully',
      data: employeeShift,
      assignmentInfo: {
        effectiveFrom: parsedEffectiveFrom.toLocaleDateString(),
        effectiveTo: parsedEffectiveTo ? parsedEffectiveTo.toLocaleDateString() : 'Indefinite',
        duration: parsedEffectiveTo ? 
          Math.ceil((parsedEffectiveTo - parsedEffectiveFrom) / (1000 * 60 * 60 * 24)) + ' days' : 
          'Ongoing'
      }
    });
    
  } catch (error) {
    console.error('Error in assignShift:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}
  // Get employee's current shift
  async getEmployeeShift(req, res) {
    try {
      const { employeeId } = req.params;
      const { date = new Date() } = req.query;
      
      const queryDate = new Date(date);
      
      const employeeShift = await EmployeeShift.findOne({
        EmployeeID: employeeId,
        EffectiveFrom: { $lte: queryDate },
        $or: [
          { EffectiveTo: { $gte: queryDate } },
          { EffectiveTo: null }
        ],
        IsCurrent: true
      }).populate('ShiftID');
      
      if (!employeeShift) {
        return res.status(404).json({
          success: false,
          message: 'No shift assigned for employee'
        });
      }
      
      return res.json({
        success: true,
        data: employeeShift
      });
      
    } catch (error) {
      console.error('Error in getEmployeeShift:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
}

module.exports = new shiftController();