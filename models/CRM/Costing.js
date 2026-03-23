const mongoose = require('mongoose');

const costingLineProcessSchema = new mongoose.Schema({
  line_process_id: {
    type: String,
    required: true,
    unique: true
  },
  process_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Process',
    required: true
  },
  vendor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  rate_entered: {  // ✅ User enters this during quotation
    type: Number,
    required: true,
    min: 0
  },
  calculated_amount: {
    type: Number,
    required: true,
    min: 0
  }
});

const costingLineSchema = new mongoose.Schema({
  costing_line_id: {
    type: String,
    required: true,
    unique: true
  },
  item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  thickness: { type: Number, required: true, min: 0 },
  width: { type: Number, required: true, min: 0 },
  length: { type: Number, required: true, min: 0 },
  section: { type: Number, default: 0 },
  
  // Calculated weight
  gross_weight: { type: Number, min: 0 },
  net_weight: { type: Number, min: 0 },
  
  // Raw Material - FROM MASTER (auto-filled)
  rm_vendor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  rm_rate_from_master: {  // ✅ From RawMaterial master
    type: Number,
    required: true,
    min: 0
  },
  profile_conversion_rate: {  // ✅ From RawMaterial master
    type: Number,
    default: 0,
    min: 0
  },
  total_rm_rate: { type: Number, min: 0 },
  gross_rm_cost: { type: Number, min: 0 },
  
  // Scrap - FROM MASTER (auto-filled)
  scrap_kgs: { type: Number, min: 0 },
  scrap_rate_from_master: {  // ✅ From RawMaterial master
    type: Number,
    required: true,
    min: 0
  },
  scrap_cost: { type: Number, min: 0 },
  
  // Process Total (sum of user-entered process rates)
  process_total: { type: Number, default: 0, min: 0 },
  
  // Subtotal and margins
  subtotal_cost: { type: Number, min: 0 },
  margin_percent: {  // ✅ From Company master (can override)
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  margin_amount: { type: Number, min: 0 },
  final_part_cost: { type: Number, min: 0 },
  
  // Quantity and total
  quantity: { type: Number, required: true, min: 1 },
  line_total: { type: Number, min: 0 },
  
  // Processes (user-entered rates)
  processes: [costingLineProcessSchema]
});

const costingSchema = new mongoose.Schema({
  costing_id: { type: String, required: true, unique: true },
  costing_no: { type: String, required: true, unique: true },
  costing_date: { type: Date, default: Date.now, required: true },
  template_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
  
  // Totals
  subtotal: { type: Number, min: 0, default: 0 },
  gst_percent: {  // ✅ From Tax master (based on HSN)
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  gst_amount: { type: Number, min: 0, default: 0 },
  grand_total: { type: Number, min: 0, default: 0 },
  
  status: { type: String, enum: ['Draft', 'Approved'], default: 'Draft' },
  revision_no: { type: String, default: '0' },
  lines: [costingLineSchema],
  is_active: { type: Boolean, default: true },
  
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Generate costing number before saving
costingSchema.pre('save', async function(next) {
  if (!this.costing_no) {
    const year = new Date().getFullYear();
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const count = await this.constructor.countDocuments() + 1;
    this.costing_no = `CST-${year}${month}-${count.toString().padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Costing', costingSchema);