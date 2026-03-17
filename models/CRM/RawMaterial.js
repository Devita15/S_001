const mongoose = require('mongoose');

const rawMaterialSchema = new mongoose.Schema({
  MaterialName: {
    type: String,
    required: [true, 'Material name is required'],
    trim: true
  },
  Grade: {
    type: String,
    required: [true, 'Grade is required'],
    trim: true
  },
  RatePerKG: {
    type: Number,
    required: [true, 'Rate per KG is required'],
    min: 0
  },
  ScrapPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 0
  },
  // ✅ ADDED: Scrap rate in Rs/kg
  scrap_rate_per_kg: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  TransportLossPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 0
  },
  // ✅ ADDED: Profile conversion rate
  profile_conversion_rate: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  // ✅ ADDED: Transport rate
  transport_rate_per_kg: {
    type: Number,
    default: 0,
    min: 0
  },
  EffectiveRate: {
    type: Number,
    min: 0
  },
  DateEffective: {
    type: Date,
    required: true,
    default: Date.now
  },
  IsActive: {
    type: Boolean,
    default: true
  },
  CreatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  UpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Calculate all rates before saving
rawMaterialSchema.pre('save', function(next) {
  // Calculate scrap rate from percentage if not provided
  if (this.scrap_rate_per_kg === 0 && this.ScrapPercentage > 0) {
    this.scrap_rate_per_kg = (this.RatePerKG * this.ScrapPercentage) / 100;
  }
  
  // Calculate transport rate from percentage
  if (this.transport_rate_per_kg === 0 && this.TransportLossPercentage > 0) {
    this.transport_rate_per_kg = (this.RatePerKG * this.TransportLossPercentage) / 100;
  }
  
  // Calculate effective rate including all components
  const totalPercentage = (this.ScrapPercentage + this.TransportLossPercentage) / 100;
  this.EffectiveRate = this.RatePerKG * (1 + totalPercentage);
  
  next();
});

// Indexes
rawMaterialSchema.index({ MaterialName: 1, Grade: 1 }, { unique: true });
rawMaterialSchema.index({ IsActive: 1 });

module.exports = mongoose.model('RawMaterial', rawMaterialSchema);