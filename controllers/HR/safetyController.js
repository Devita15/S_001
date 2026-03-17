// controllers/safetyController.js
const PPEMaster = require('../../models/HR/PPEMaster');
const PPEIssuance = require('../../models/HR/PPEIssuance');
const SafetyTraining = require('../../models/HR/SafetyTraining');
const EmployeeTrainingRecord = require('../../models/HR/EmployeeTrainingRecord');
const Accident = require('../../models/HR/Accident');
const MedicalRecord = require('../../models/HR/MedicalRecord');
const PPEInventory = require('../../models/HR/PPEInventory');
const Employee = require('../../models/HR/Employee');

// PPE Controllers
exports.createPPE = async (req, res) => {
  try {
    const ppe = await PPEMaster.create(req.body);
    res.status(201).json({
      success: true,
      data: ppe
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

exports.issuePPE = async (req, res) => {
  try {
    const { employee, ppe, condition, issuedBy } = req.body;
    
    // Get PPE validity
    const ppeMaster = await PPEMaster.findById(ppe);
    if (!ppeMaster) {
      return res.status(404).json({
        success: false,
        error: 'PPE not found'
      });
    }
    
    // Calculate expiry date
    const issueDate = new Date();
    const expiryDate = new Date(issueDate);
    expiryDate.setDate(expiryDate.getDate() + ppeMaster.validityDays);
    
    // Create issuance record
    const issuance = await PPEIssuance.create({
      employee,
      ppe,
      issueDate,
      expiryDate,
      condition,
      issuedBy,
      status: 'Active'
    });
    
    // Update inventory if exists
    await PPEInventory.findOneAndUpdate(
      { ppe },
      { 
        $inc: { 
          quantityIssued: 1,
          quantityAvailable: -1
        }
      }
    );
    
    res.status(201).json({
      success: true,
      data: issuance
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

exports.getAllPPE = async (req, res) => {
  try {
    const ppeItems = await PPEMaster.find();
    res.status(200).json({
      success: true,
      count: ppeItems.length,
      data: ppeItems
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

exports.getPPEById = async (req, res) => {
  try {
    const ppe = await PPEMaster.findById(req.params.id);
    if (!ppe) {
      return res.status(404).json({
        success: false,
        error: 'PPE not found'
      });
    }
    res.status(200).json({
      success: true,
      data: ppe
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

exports.updatePPE = async (req, res) => {
  try {
    const ppe = await PPEMaster.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!ppe) {
      return res.status(404).json({
        success: false,
        error: 'PPE not found'
      });
    }
    res.status(200).json({
      success: true,
      data: ppe
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

exports.deletePPE = async (req, res) => {
  try {
    const ppe = await PPEMaster.findByIdAndDelete(req.params.id);

    if (!ppe) {
      return res.status(404).json({
        success: false,
        message: 'PPE not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'PPE deleted successfully',
      data: {
        id: ppe._id,
        name: ppe.name
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


exports.getEmployeePPE = async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    const ppeIssuances = await PPEIssuance.find({ employee: employeeId })
      .populate('ppe', 'name category')
      .populate('issuedBy', 'FirstName LastName')
      .sort('-issueDate');
    
    res.status(200).json({
      success: true,
      count: ppeIssuances.length,
      data: ppeIssuances
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Training Controllers
exports.createTraining = async (req, res) => {
  try {
    const training = await SafetyTraining.create(req.body);
    res.status(201).json({
      success: true,
      data: training
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};


// Update safety training
exports.updateTraining = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid training ID format'
      });
    }

    const trainingData = {
      ...req.body,
      UpdatedAt: Date.now()
    };

    const training = await SafetyTraining.findByIdAndUpdate(
      id,
      trainingData,
      {
        new: true,
        runValidators: true
      }
    );

    if (!training) {
      return res.status(404).json({
        success: false,
        error: 'Safety training not found'
      });
    }

    res.status(200).json({
      success: true,
      data: training
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Delete safety training
exports.deleteTraining = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid training ID format'
      });
    }

    const training = await SafetyTraining.findByIdAndDelete(id);

    if (!training) {
      return res.status(404).json({
        success: false,
        error: 'Safety training not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Safety training deleted successfully',
      data: {}
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

exports.assignTraining = async (req, res) => {
  try {
    const { employee, training, trainer } = req.body;
    
    // Get training validity
    const trainingProgram = await SafetyTraining.findById(training);
    if (!trainingProgram) {
      return res.status(404).json({
        success: false,
        error: 'Training not found'
      });
    }
    
    // Calculate expiry date
    const trainingDate = new Date();
    const expiryDate = new Date(trainingDate);
    expiryDate.setMonth(expiryDate.getMonth() + trainingProgram.validityMonths);
    
    // Create training record
    const trainingRecord = await EmployeeTrainingRecord.create({
      employee,
      training,
      trainingDate,
      expiryDate,
      trainer,
      status: 'Completed'
    });
    
    res.status(201).json({
      success: true,
      data: trainingRecord
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

exports.getEmployeeTraining = async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    const trainingRecords = await EmployeeTrainingRecord.find({ employee: employeeId })
      .populate('training', 'title category durationHours')
      .sort('-trainingDate');
    
    res.status(200).json({
      success: true,
      count: trainingRecords.length,
      data: trainingRecords
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

exports.createAccident = async (req, res) => {
  try {
    const { date } = req.body;
    
    // Parse the date properly
    let accidentDate;
    
    if (typeof date === 'string') {
      // If it's just a date string like "2026-03-05"
      if (date.length === 10 && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Create date in UTC to avoid timezone issues
        const [year, month, day] = date.split('-').map(Number);
        accidentDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      } else {
        // If it includes time, parse it as is
        accidentDate = new Date(date);
      }
    } else {
      accidentDate = new Date(date);
    }
    
    // Get current date in UTC
    const currentDate = new Date();
    const currentUTC = new Date(Date.UTC(
      currentDate.getUTCFullYear(),
      currentDate.getUTCMonth(),
      currentDate.getUTCDate(),
      0, 0, 0, 0
    ));
    
    // Compare dates only (without time)
    const accidentDateOnly = new Date(Date.UTC(
      accidentDate.getUTCFullYear(),
      accidentDate.getUTCMonth(),
      accidentDate.getUTCDate(),
      0, 0, 0, 0
    ));
    
    if (accidentDateOnly > currentUTC) {
      return res.status(400).json({
        success: false,
        error: 'Accident date cannot be in the future',
        message: 'Accident date cannot be in the future'
      });
    }
    
    // Create the accident record
    const accident = await Accident.create(req.body);
    
    // Update employee's accident count (optional)
    await Employee.findByIdAndUpdate(
      accident.employee,
      { $inc: { 'safetyStats.accidentCount': 1 } },
      { upsert: true }
    );
    
    // Populate the references before sending response
    const populatedAccident = await Accident.findById(accident._id)
      .populate('employee', 'FirstName LastName EmployeeID')
      .populate('reportedBy', 'FirstName LastName')
      .populate('investigationBy', 'FirstName LastName')
      .populate('department', 'DepartmentName');
    
    res.status(201).json({
      success: true,
      data: populatedAccident
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      message: error.message
    });
  }
};


exports.getEmployeeAccidents = async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    const accidents = await Accident.find({ employee: employeeId })
      .populate('employee', 'FirstName LastName DepartmentID')
      .populate('reportedBy', 'FirstName LastName')
      .sort('-createdAt');
    
    res.status(200).json({
      success: true,
      count: accidents.length,
      data: accidents
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

exports.updateInvestigation = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Get the existing accident record
    const existingAccident = await Accident.findById(id);
    
    if (!existingAccident) {
      return res.status(404).json({
        success: false,
        error: 'Accident not found',
        message: 'Accident not found'
      });
    }
    
    // Validate investigation date if being updated
    if (updateData.investigationDate) {
      const investigationDate = new Date(updateData.investigationDate);
      const accidentDate = new Date(existingAccident.date);
      
      if (investigationDate < accidentDate) {
        return res.status(400).json({
          success: false,
          error: 'Investigation date cannot be earlier than accident date',
          message: 'Investigation date cannot be earlier than accident date'
        });
      }
    }
    
    const accident = await Accident.findByIdAndUpdate(
      id,
      { 
        ...updateData,
        UpdatedAt: Date.now()
      },
      { new: true, runValidators: true }
    );
    
    res.status(200).json({
      success: true,
      data: accident
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      message: error.message
    });
  }
};

// Create medical record
exports.createMedicalRecord = async (req, res) => {
  try {
    const medicalData = {
      ...req.body,
      reportFile: req.file
        ? `uploads/medical/${req.file.filename}`
        : undefined
    };

    // Handle restrictions field - check if it exists and parse if it's a string
    if (medicalData.restrictions) {
      if (typeof medicalData.restrictions === 'string') {
        try {
          // Try to parse as JSON first
          medicalData.restrictions = JSON.parse(medicalData.restrictions);
        } catch (e) {
          // If not valid JSON, check if it's a single value
          const trimmedValue = medicalData.restrictions.trim();
          // Check if it's a valid enum value
          const validEnums = ['No Heavy Lifting', 'No Standing > 4hrs', 'No Night Shift', 'No Machine Operation', 'Limited Mobility', 'Other'];
          if (validEnums.includes(trimmedValue)) {
            // Single value - wrap in array
            medicalData.restrictions = [trimmedValue];
          } else {
            // If it's not a valid enum value, split by comma if multiple values
            medicalData.restrictions = medicalData.restrictions.split(',').map(item => item.trim());
          }
        }
      }
    }

    // Handle any other array fields if needed
    // For example, if you add other array fields in the future

    const medicalRecord = await MedicalRecord.create(medicalData);

    res.status(201).json({
      success: true,
      data: medicalRecord
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Update medical record
exports.updateMedicalRecord = async (req, res) => {
  try {
    const { id } = req.params;
    
    const medicalData = {
      ...req.body,
      UpdatedAt: Date.now()
    };

    // Handle restrictions field - check if it exists and parse if it's a string
    if (medicalData.restrictions) {
      if (typeof medicalData.restrictions === 'string') {
        try {
          // Try to parse as JSON first
          medicalData.restrictions = JSON.parse(medicalData.restrictions);
        } catch (e) {
          // If not valid JSON, check if it's a single value
          const trimmedValue = medicalData.restrictions.trim();
          // Check if it's a valid enum value
          const validEnums = ['No Heavy Lifting', 'No Standing > 4hrs', 'No Night Shift', 'No Machine Operation', 'Limited Mobility', 'Other'];
          if (validEnums.includes(trimmedValue)) {
            // Single value - wrap in array
            medicalData.restrictions = [trimmedValue];
          } else {
            // If it's not a valid enum value, split by comma if multiple values
            medicalData.restrictions = medicalData.restrictions.split(',').map(item => item.trim());
          }
        }
      }
    }

    // If new file is uploaded, update the reportFile
    if (req.file) {
      // Get the old record to delete the old file
      const oldRecord = await MedicalRecord.findById(id);
      if (oldRecord && oldRecord.reportFile) {
        const oldFilePath = path.join(__dirname, '../', oldRecord.reportFile);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      }
      medicalData.reportFile = `uploads/medical/${req.file.filename}`;
    }

    const medicalRecord = await MedicalRecord.findByIdAndUpdate(
      id,
      medicalData,
      {
        new: true,
        runValidators: true
      }
    );

    if (!medicalRecord) {
      return res.status(404).json({
        success: false,
        error: 'Medical record not found'
      });
    }

    res.status(200).json({
      success: true,
      data: medicalRecord
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Delete medical record
exports.deleteMedicalRecord = async (req, res) => {
  try {
    const { id } = req.params;

    const medicalRecord = await MedicalRecord.findById(id);
    
    if (!medicalRecord) {
      return res.status(404).json({
        success: false,
        error: 'Medical record not found'
      });
    }

    // Delete associated file if exists
    if (medicalRecord.reportFile) {
      const filePath = path.join(__dirname, '../', medicalRecord.reportFile);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await MedicalRecord.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Medical record deleted successfully',
      data: {}
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};


exports.getEmployeeMedicalRecords = async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    const medicalRecords = await MedicalRecord.find({ employee: employeeId })
      .populate('employee', 'FirstName LastName EmployeeID')
      .sort('-checkupDate');
    
    res.status(200).json({
      success: true,
      count: medicalRecords.length,
      data: medicalRecords
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Dashboard and Reports
exports.getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    // Get counts
    const activePPE = await PPEIssuance.countDocuments({ 
      status: 'Active',
      expiryDate: { $gt: today }
    });
    
    const expiringPPE = await PPEIssuance.countDocuments({
      status: 'Active',
      expiryDate: { 
        $gt: today,
        $lt: new Date(today.setDate(today.getDate() + 30))
      }
    });
    
    const recentAccidents = await Accident.countDocuments({
      date: { $gte: thirtyDaysAgo }
    });
    
    const pendingInvestigations = await Accident.countDocuments({
      investigationStatus: { $in: ['Open', 'Under Investigation'] }
    });
    
    const upcomingCheckups = await MedicalRecord.countDocuments({
      nextCheckupDate: { $gte: today }
    });
    
    const activeTrainings = await EmployeeTrainingRecord.countDocuments({
      status: 'Completed',
      expiryDate: { $gt: today }
    });
    
    res.status(200).json({
      success: true,
      data: {
        activePPE,
        expiringPPE,
        recentAccidents,
        pendingInvestigations,
        upcomingCheckups,
        activeTrainings
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

exports.getAccidentStats = async (req, res) => {
  try {
    const { startDate, endDate, department } = req.query;
    
    const matchStage = {};
    
    if (startDate && endDate) {
      matchStage.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (department) {
      matchStage.department = department;
    }
    
    const stats = await Accident.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            severity: '$severity',
            injuryType: '$injuryType'
          },
          count: { $sum: 1 },
          avgLostDays: { $avg: '$lostDays' },
          totalCost: { $sum: '$costIncurred' }
        }
      },
      {
        $group: {
          _id: '$_id.severity',
          injuries: {
            $push: {
              type: '$_id.injuryType',
              count: '$count'
            }
          },
          totalAccidents: { $sum: '$count' },
          avgLostDays: { $avg: '$avgLostDays' },
          totalCost: { $sum: '$totalCost' }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Utility Functions
exports.getExpiringPPE = async (req, res) => {
  try {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const expiringPPE = await PPEIssuance.find({
      status: 'Active',
      expiryDate: {
        $lte: thirtyDaysFromNow,
        $gte: new Date()
      }
    })
    .populate('employee', 'FirstName LastName EmployeeID')
    .populate('ppe', 'name category')
    .sort('expiryDate');
    
    res.status(200).json({
      success: true,
      count: expiringPPE.length,
      data: expiringPPE
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

exports.getExpiringTraining = async (req, res) => {
  try {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const expiringTraining = await EmployeeTrainingRecord.find({
      status: 'Completed',
      expiryDate: {
        $lte: thirtyDaysFromNow,
        $gte: new Date()
      }
    })
    .populate('employee', 'FirstName LastName EmployeeID')
    .populate('training', 'title category')
    .sort('expiryDate');
    
    res.status(200).json({
      success: true,
      count: expiringTraining.length,
      data: expiringTraining
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

exports.getUpcomingCheckups = async (req, res) => {
  try {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const upcomingCheckups = await MedicalRecord.find({
      nextCheckupDate: {
        $lte: thirtyDaysFromNow,
        $gte: new Date()
      }
    })
    .populate('employee', 'FirstName LastName EmployeeID')
    .sort('nextCheckupDate');
    
    res.status(200).json({
      success: true,
      count: upcomingCheckups.length,
      data: upcomingCheckups
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

exports.getAllIssuances = async (req, res) => {
  try {
    const issuances = await PPEIssuance.find()
      .populate('employee', 'FirstName LastName EmployeeID')
      .populate('ppe', 'name category')
      .populate('issuedBy', 'FirstName LastName');
    res.status(200).json({
      success: true,
      count: issuances.length,
      data: issuances
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

exports.returnPPE = async (req, res) => {
  try {
    const { returnCondition, remarks } = req.body;
    
    const issuance = await PPEIssuance.findByIdAndUpdate(
      req.params.id,
      {
        status: 'Returned',
        returnCondition,
        remarks,
        returnDate: new Date()
      },
      { new: true }
    );
    
    if (!issuance) {
      return res.status(404).json({
        success: false,
        error: 'PPE issuance not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: issuance
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

exports.getAllAccidents = async (req, res) => {
  try {
    const accidents = await Accident.find()
      .populate('employee', 'FirstName LastName EmployeeID')
      .populate('reportedBy', 'FirstName LastName') // Fields from User model
      .sort('-CreatedAt');
    
    res.status(200).json({
      success: true,
      count: accidents.length,
      data: accidents
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

exports.getAllMedicalRecords = async (req, res) => {
  try {
    const medicalRecords = await MedicalRecord.find()
      .populate('employee', 'FirstName LastName EmployeeID')
      .sort('-checkupDate');
    
    res.status(200).json({
      success: true,
      count: medicalRecords.length,
      data: medicalRecords
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};


exports.getAllTraining = async (req, res) => {
  try {
    const { category, isMandatory, department } = req.query;
    
    // Build filter object
    const filter = {};
    
    if (category) {
      filter.category = category;
    }
    
    if (isMandatory !== undefined) {
      filter.isMandatory = isMandatory === 'true';
    }
    
    if (department) {
      filter.department = department;
    }
    
    // Get all training programs with optional filtering
    const trainingPrograms = await SafetyTraining.find(filter)
      .populate('department', 'DepartmentName')
      .sort({ title: 1 });
    
    // Get statistics
    const totalTrainings = await SafetyTraining.countDocuments(filter);
    const mandatoryTrainings = await SafetyTraining.countDocuments({ ...filter, isMandatory: true });
    const byCategory = await SafetyTraining.aggregate([
      { $match: filter },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    res.status(200).json({
      success: true,
      count: trainingPrograms.length,
      data: trainingPrograms,
      stats: {
        total: totalTrainings,
        mandatory: mandatoryTrainings,
        byCategory: byCategory
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};