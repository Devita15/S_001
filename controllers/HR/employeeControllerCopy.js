const Employee = require('../../models/HR/Employee');
const Department = require('../../models/HR/Department');
const Designation = require('../../models/HR/Designation');

// @desc    Get all employees
// @route   GET /api/employees
// @access  Public
const getEmployees = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      department,
      designation,
      status,
      search
    } = req.query;

    const query = {};

    // Filter by department
    if (department) {
      const dept = await Department.findOne({ 
        DepartmentName: new RegExp(department, 'i') 
      });
      if (dept) query.DepartmentID = dept._id;
    }

    // Filter by designation
    if (designation) {
      const desg = await Designation.findOne({ 
        DesignationName: new RegExp(designation, 'i') 
      });
      if (desg) query.DesignationID = desg._id;
    }

    // Filter by status
    if (status) {
      query.EmploymentStatus = status;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { EmployeeID: new RegExp(search, 'i') },
        { FirstName: new RegExp(search, 'i') },
        { LastName: new RegExp(search, 'i') },
        { Email: new RegExp(search, 'i') }
      ];
    }

    // Execute query with pagination
    const employees = await Employee.find(query)
      .populate('DepartmentID', 'DepartmentName Description')
      .populate('DesignationID', 'DesignationName Level Description')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ CreatedAt: -1 });

    // Get total count
    const total = await Employee.countDocuments(query);

    res.json({
      success: true,
      data: employees,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: Number(limit)
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Get single employee
// @route   GET /api/employees/:id
// @access  Public
const getEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id)
      .populate('DepartmentID', 'DepartmentName Description')
      .populate('DesignationID', 'DesignationName Level Description');

    if (!employee) {
      return res.status(404).json({ 
        success: false, 
        message: 'Employee not found' 
      });
    }

    res.json({
      success: true,
      data: employee
    });

  } catch (error) {
    console.error(error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Employee not found' 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Create employee
// @route   POST /api/employees
// @access  Public
const createEmployee = async (req, res) => {
  try {
    // Generate employee ID
    const lastEmployee = await Employee.findOne().sort({ CreatedAt: -1 });
    let employeeNumber = 1;
    
    if (lastEmployee && lastEmployee.EmployeeID) {
      const lastNum = parseInt(lastEmployee.EmployeeID.replace('EMP', ''));
      if (!isNaN(lastNum)) {
        employeeNumber = lastNum + 1;
      }
    }
    
    const employeeID = `EMP${employeeNumber.toString().padStart(5, '0')}`;

    // Create employee
    const employee = await Employee.create({
      ...req.body,
      EmployeeID: employeeID
    });

    // Populate references
    await employee.populate('DepartmentID DesignationID');

    res.status(201).json({
      success: true,
      data: employee,
      message: 'Employee created successfully'
    });

  } catch (error) {
    console.error(error);
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Duplicate field value entered' 
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ 
        success: false, 
        message: messages.join(', ') 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Public
const updateEmployee = async (req, res) => {
  try {
    let employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({ 
        success: false, 
        message: 'Employee not found' 
      });
    }

    // Update employee
    employee = await Employee.findByIdAndUpdate(
      req.params.id,
      { ...req.body, UpdatedAt: Date.now() },
      { new: true, runValidators: true }
    ).populate('DepartmentID DesignationID');

    res.json({
      success: true,
      data: employee,
      message: 'Employee updated successfully'
    });

  } catch (error) {
    console.error(error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Employee not found' 
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Duplicate field value entered' 
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ 
        success: false, 
        message: messages.join(', ') 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Delete employee (HARD DELETE)
// @route   DELETE /api/employees/:id
// @access  Public
const deleteEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({ 
        success: false, 
        message: 'Employee not found' 
      });
    }

    // Check if employee has a user account
    const User = require('../../models/User');
    const userExists = await User.findOne({ EmployeeID: employee._id });
    if (userExists) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete employee with active user account. Delete user account first.' 
      });
    }

    // Check if employee has related records
    const Attendance = require('../../models/HR/Attendance');
    const Leave = require('../../models/HR/Leave');
    const Salary = require('../../models/HR/Salary');
    const Performance = require('../../models/HR/Performance');
    
    const attendanceCount = await Attendance.countDocuments({ EmployeeID: employee._id });
    const leaveCount = await Leave.countDocuments({ EmployeeID: employee._id });
    const salaryCount = await Salary.countDocuments({ EmployeeID: employee._id });
    const performanceCount = await Performance.countDocuments({ EmployeeID: employee._id });
    
    if (attendanceCount > 0 || leaveCount > 0 || salaryCount > 0 || performanceCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete employee. Employee has related records: 
        Attendance(${attendanceCount}), Leaves(${leaveCount}), 
        Salary(${salaryCount}), Performance(${performanceCount})` 
      });
    }

    // HARD DELETE - permanently remove from database
    await Employee.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Employee deleted successfully'
    });

  } catch (error) {
    console.error(error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Employee not found' 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Get employee statistics
// @route   GET /api/employees/stats
// @access  Public
const getEmployeeStats = async (req, res) => {
  try {
    const totalEmployees = await Employee.countDocuments();
    const activeEmployees = await Employee.countDocuments({ EmploymentStatus: 'active' });
    const resignedEmployees = await Employee.countDocuments({ EmploymentStatus: 'resigned' });
    const terminatedEmployees = await Employee.countDocuments({ EmploymentStatus: 'terminated' });
    const retiredEmployees = await Employee.countDocuments({ EmploymentStatus: 'retired' });

    // Department wise count
    const departmentStats = await Employee.aggregate([
      {
        $group: {
          _id: '$DepartmentID',
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'departments',
          localField: '_id',
          foreignField: '_id',
          as: 'department'
        }
      },
      {
        $unwind: '$department'
      },
      {
        $project: {
          departmentName: '$department.DepartmentName',
          count: 1
        }
      }
    ]);

    // Gender wise count
    const genderStats = await Employee.aggregate([
      {
        $group: {
          _id: '$Gender',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        totalEmployees,
        activeEmployees,
        resignedEmployees,
        terminatedEmployees,
        retiredEmployees,
        departmentStats,
        genderStats
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

module.exports = {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeStats
};