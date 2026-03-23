
const mongoose = require('mongoose');

const bankDetailsSchema = new mongoose.Schema({
  accountNumber: {
    type: String,
    trim: true
  },
  accountHolderName: {
    type: String,
    trim: true
  },
  bankName: {
    type: String,
    trim: true
  },
  branch: {
    type: String,
    trim: true
  },
  ifscCode: {
    type: String,
    trim: true,
    uppercase: true,
    match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Please enter a valid IFSC code']
  },
  accountType: {
    type: String,
    enum: ['Savings', 'Current', 'Salary'],
    default: 'Savings'
  }
}, { _id: false });

const emergencyContactSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true
  },
  relationship: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  }
}, { _id: false });

const pieceRateDetailSchema = new mongoose.Schema({
  productType: {
    type: String,
    required: true,
    trim: true
  },
  operation: {
    type: String,
    required: true,
    trim: true
  },
  ratePerUnit: {
    type: Number,
    required: true,
    min: 0
  },
  uom: {
    type: String,
    required: true,
    enum: ['piece', 'dozen', 'kg', 'meter', 'hour'],
    default: 'piece'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { _id: true });

const employeeSchema = new mongoose.Schema({
  EmployeeID: {
    type: String,
    required: [true, 'Employee ID is required'],
    unique: true,
    trim: true
  },
  FirstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: 50
  },
  LastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: 50
  },
  Gender: {
    type: String,
    required: [true, 'Gender is required'],
    enum: ['M', 'F', 'O'],
    uppercase: true
  },
  DateOfBirth: {
    type: Date,
    required: [true, 'Date of birth is required']
  },
  Email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  Phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    maxlength: 15
  },
  Address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true
  },
  DepartmentID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: [true, 'Department is required']
  },
  DesignationID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Designation',
    required: [true, 'Designation is required']
  },
  SupervisorID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    validate: {
      validator: async function(value) {
        if (!value) return true;
        const supervisor = await mongoose.model('Employee').findById(value);
        return supervisor && supervisor.EmploymentStatus === 'active';
      },
      message: 'Supervisor must be an active employee'
    }
  },
  DateOfJoining: {
    type: Date,
    required: [true, 'Date of joining is required']
  },
  EmploymentStatus: {
    type: String,
    required: true,
    enum: ['active', 'resigned', 'terminated', 'retired'],
    default: 'active'
  },
  EmploymentType: {
    type: String,
    required: true,
    enum: ['Monthly', 'Weekly', 'Daily', 'Hourly', 'PieceRate'],
    default: 'Monthly'
  },
  PayStructureType: {
    type: String,
    enum: ['Fixed', 'Variable', 'Commission', 'PieceRate'],
    default: 'Fixed'
  },
  
  // Salary Components
  BasicSalary: {
    type: Number,
    min: 0,
    default: 0
  },
  HRA: {
    type: Number,
    min: 0,
    default: 0
  },
  ConveyanceAllowance: {
    type: Number,
    min: 0,
    default: 0
  },
  MedicalAllowance: {
    type: Number,
    min: 0,
    default: 0
  },
  SpecialAllowance: {
    type: Number,
    min: 0,
    default: 0
  },
  HourlyRate: {
    type: Number,
    min: 0,
    default: 0
  },
  OvertimeRateMultiplier: {
    type: Number,
    min: 1,
    max: 3,
    default: 1.5
  },

  // Work Details
  SkillLevel: {
    type: String,
    enum: ['Unskilled', 'Semi-Skilled', 'Skilled', 'Highly Skilled'],
    default: 'Semi-Skilled'
  },
  WorkStation: {
    type: String,
    trim: true
  },
  LineNumber: {
    type: String,
    trim: true
  },

  // Identification Documents
  PAN: {
    type: String,
    trim: true,
    uppercase: true,
    match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Please enter a valid PAN number']
  },
  AadharNumber: {
    type: String,
    trim: true,
    match: [/^\d{12}$/, 'Aadhar number must be 12 digits']
  },
  PFNumber: {
    type: String,
    trim: true
  },
  UAN: {
    type: String,
    trim: true
  },
  ESINumber: {
    type: String,
    trim: true
  },

  // Nested Schemas
  BankDetails: {
    type: bankDetailsSchema,
    default: () => ({})
  },
  EmergencyContact: {
    type: emergencyContactSchema,
    default: () => ({})
  },
  // REMOVED: PieceRateDetails field - now managed in master data

  // Audit fields
  CreatedAt: {
    type: Date,
    default: Date.now
  },
  UpdatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'CreatedAt', updatedAt: 'UpdatedAt' }
});

// REMOVED the pre-save middleware for PieceRateDetails validation
// Pre-save middleware to update UpdatedAt
employeeSchema.pre('save', function(next) {
  this.UpdatedAt = Date.now();
  next();
});

// Pre-save middleware to validate supervisor exists and is active
employeeSchema.pre('save', async function(next) {
  if (this.SupervisorID && this.isModified('SupervisorID')) {
    const supervisor = await mongoose.model('Employee').findById(this.SupervisorID);
    if (!supervisor) {
      next(new Error('Supervisor not found'));
    }
    if (supervisor && supervisor.EmploymentStatus !== 'active') {
      next(new Error('Supervisor must be an active employee'));
    }
    if (supervisor && supervisor._id.toString() === this._id.toString()) {
      next(new Error('Employee cannot be their own supervisor'));
    }
  }
  next();
});

// REMOVED the piece rate validation middleware

// Pre-remove middleware to check for dependencies
employeeSchema.pre('remove', async function(next) {
  const User = mongoose.model('User');
  const Attendance = mongoose.model('Attendance');
  const Leave = mongoose.model('Leave');
  const Salary = mongoose.model('Salary');

  const userExists = await User.exists({ EmployeeID: this._id });
  const attendanceExists = await Attendance.exists({ EmployeeID: this._id });
  const leaveExists = await Leave.exists({ EmployeeID: this._id });
  const salaryExists = await Salary.exists({ EmployeeID: this._id });

  if (userExists || attendanceExists || leaveExists || salaryExists) {
    next(new Error('Cannot delete employee with existing records. Archive instead.'));
  }
  next();
});

module.exports = mongoose.model('Employee', employeeSchema);