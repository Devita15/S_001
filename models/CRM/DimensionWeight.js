const mongoose = require('mongoose');
const dimensionWeightSchema = new mongoose.Schema({
  PartNo: {
    type: String,
    required: [true, 'Part number is required'],
    ref: 'Item',
    uppercase: true,
    trim: true,
    unique: true
  },
  Thickness: {
    type: Number,
    required: [true, 'Thickness is required'],
    min: [0.1, 'Thickness must be at least 0.1 mm'],
    max: [1000, 'Thickness cannot exceed 1000 mm']
  },
  Width: {
    type: Number,
    required: [true, 'Width is required'],
    min: [0.1, 'Width must be at least 0.1 mm'],
    max: [5000, 'Width cannot exceed 5000 mm']
  },
  Length: {
    type: Number,
    required: [true, 'Length is required'],
    min: [0.1, 'Length must be at least 0.1 mm'],
    max: [10000, 'Length cannot exceed 10000 mm']
  },
  Density: {
    type: Number,
    required: [true, 'Density is required'],
    min: [0.1, 'Density must be at least 0.1'],
    max: [30, 'Density cannot exceed 30 g/cm³']
  },
  // STORED calculated fields - NOT required because they're calculated
  VolumeMM3: {
    type: Number,
    min: 0
    // REMOVED required: true
  },
  WeightInKG: {
    type: Number,
    min: 0
    // REMOVED required: true
  },
  CreatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  UpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});
// Calculate and store Volume and Weight BEFORE saving
dimensionWeightSchema.pre('save', function(next) {
  console.log(' Pre-save hook running...');
  console.log('   Input:', {
    Thickness: this.Thickness,
    Width: this.Width,
    Length: this.Length,
    Density: this.Density
  });
  // Calculate Volume (mm³) = T × W × L
  this.VolumeMM3 = this.Thickness * this.Width * this.Length;
  
  // Calculate Weight (kg) = (Volume × Density) / 1,000,000
  this.WeightInKG = (this.VolumeMM3 * this.Density) / 1000000;
  
  // Round to 3 decimal places for consistency
  this.WeightInKG = Math.round(this.WeightInKG * 1000) / 1000;
  
  console.log('✅ Calculated and stored:', {
    Volume: this.VolumeMM3 + ' mm³',
    Weight: this.WeightInKG + ' kg'
  });
  
  next();
});

// Calculate and store on update too
dimensionWeightSchema.pre('findOneAndUpdate', async function(next) {
  const update = this.getUpdate();
  const doc = await this.model.findOne(this.getQuery());
  
  if (!doc) return next();
  
  const thickness = update.Thickness !== undefined ? update.Thickness : doc.Thickness;
  const width = update.Width !== undefined ? update.Width : doc.Width;
  const length = update.Length !== undefined ? update.Length : doc.Length;
  const density = update.Density !== undefined ? update.Density : doc.Density;
  
  const volume = thickness * width * length;
  const weight = (volume * density) / 1000000;
  
  update.VolumeMM3 = volume;
  update.WeightInKG = Math.round(weight * 1000) / 1000;
  
  console.log('✅ Recalculated on update:', {
    Volume: volume + ' mm³',
    Weight: update.WeightInKG + ' kg'
  });
  
  next();
});
// Virtual for formatted dimensions
dimensionWeightSchema.virtual('DimensionsFormatted').get(function() {
  return `T: ${this.Thickness}mm × W: ${this.Width}mm × L: ${this.Length}mm`;
});
// Virtual for formatted weight
dimensionWeightSchema.virtual('WeightFormatted').get(function() {
  return `${this.WeightInKG?.toFixed(3)} Kg`;
});
// Indexes for faster queries
dimensionWeightSchema.index({ PartNo: 1 }, { unique: true });
dimensionWeightSchema.index({ WeightInKG: 1 });
dimensionWeightSchema.index({ CreatedAt: -1 });
module.exports = mongoose.model('DimensionWeight', dimensionWeightSchema);