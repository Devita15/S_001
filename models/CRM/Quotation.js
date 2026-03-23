'use strict';
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// QUOTATION ITEM SUB-SCHEMA
// ─────────────────────────────────────────────────────────────────────────────
const quotationItemSchema = new mongoose.Schema({

  // ── Identity ──────────────────────────────────────────────────────────────
  PartNo:      { type: String, required: [true, 'Part number is required'] },
  PartName:    { type: String, required: [true, 'Part name is required']   },
  Description: { type: String, default: '' },
  HSNCode:     { type: String, required: [true, 'HSN code is required']    },
  Unit:        { type: String, enum: ['Nos','Kg','Meter','Set','Piece'], default: 'Nos' },
  Quantity:    { type: Number, required: [true, 'Quantity is required'], min: [1, 'Min qty is 1'] },

  // ── Item master fields ────────────────────────────────────────────────────
  drawing_no:   { type: String, default: '' },
  revision_no:  { type: String, default: '0' },
  rm_grade:     { type: String, default: '' },
  rm_source:    { type: String, default: '' },
  rm_type:      { type: String, default: '' },
  pitch:        { type: Number, default: 0 },
  no_of_cavity: { type: Number, default: 1 },

  // ── Dimensions ───────────────────────────────────────────────────────────
  Thickness: { type: Number, default: 0 },
  Width:     { type: Number, default: 0 },
  Length:    { type: Number, default: 0 },

  // ── Raw material ──────────────────────────────────────────────────────────
  density:                 { type: Number, default: 8.96 },
  rm_rate:                 { type: Number, default: 0 },
  profile_conversion_rate: { type: Number, default: 0 },
  total_rm_rate:           { type: Number, default: 0 },
  scrap_rate_per_kg:       { type: Number, default: 0 },
  transport_rate_per_kg:   { type: Number, default: 0 },

  // ── Item-level percentages ────────────────────────────────────────────────
  rm_rejection_percent:      { type: Number, default: 2  },
  scrap_realisation_percent: { type: Number, default: 85 },

  // ── GST ───────────────────────────────────────────────────────────────────
  gst_percentage: { type: Number, default: 18 },

  // ── Weight ────────────────────────────────────────────────────────────────
  gross_weight_kg: { type: Number, default: 0 },
  net_weight_kg:   { type: Number, default: 0 },
  scrap_kgs:       { type: Number, default: 0 },

  // ── Cost ──────────────────────────────────────────────────────────────────
  gross_rm_cost: { type: Number, default: 0 },
  scrap_cost:    { type: Number, default: 0 },
  net_rm_cost:   { type: Number, default: 0 },

  // ── Legacy aliases ────────────────────────────────────────────────────────
  Weight:  { type: Number, default: 0 },
  RMCost:  { type: Number, default: 0 },

  // ── Process total ─────────────────────────────────────────────────────────
  ProcessCost: { type: Number, default: 0 },

  // ── Overhead & margin ─────────────────────────────────────────────────────
  OverheadPercent: { type: Number, min: 0, max: 100, default: 0 },
  OverheadAmount:  { type: Number, default: 0 },
  MarginPercent:   { type: Number, min: 0, max: 100, default: 0 },
  MarginAmount:    { type: Number, default: 0 },

  // ── Totals ────────────────────────────────────────────────────────────────
  SubCost:   { type: Number, default: 0 },
  FinalRate: { type: Number, required: [true, 'Final rate is required'], min: 0 },
  Amount:    { type: Number, default: 0 },

  // ── Process refs ──────────────────────────────────────────────────────────
  processes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'QuotationItemProcess' }],
});

quotationItemSchema.pre('save', function (next) {
  this.SubCost        = (this.net_rm_cost || 0) + (this.ProcessCost || 0);
  this.OverheadAmount = (this.SubCost * (this.OverheadPercent || 0)) / 100;
  this.MarginAmount   = (this.SubCost * (this.MarginPercent   || 0)) / 100;
  this.FinalRate      = this.SubCost + this.OverheadAmount + this.MarginAmount;
  this.Amount         = Math.round(this.Quantity * this.FinalRate * 100) / 100;
  next();
});


// ─────────────────────────────────────────────────────────────────────────────
// QUOTATION SCHEMA
// ─────────────────────────────────────────────────────────────────────────────
const quotationSchema = new mongoose.Schema({

  // ── Auto-generated ────────────────────────────────────────────────────────
  QuotationNo:   { type: String, unique: true, index: true },
  QuotationDate: { type: Date, default: Date.now, required: true },
  ValidTill:     { type: Date, required: true },

  // ── Template ──────────────────────────────────────────────────────────────
  TemplateID:   { type: mongoose.Schema.Types.ObjectId, ref: 'Template', default: null },
  TemplateName: { type: String, default: null },

  // ── Company ───────────────────────────────────────────────────────────────
  CompanyID:        { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  CompanyName:      { type: String, required: true },
  CompanyGSTIN:     { type: String, required: true },
  CompanyState:     { type: String, required: true },
  CompanyStateCode: { type: Number, required: true },

  // ── Customer ──────────────────────────────────────────────────────────────
  CustomerID:            { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  CustomerName:          { type: String, required: true },
  CustomerGSTIN:         { type: String, default: '' },
  CustomerState:         { type: String, required: true },
  CustomerStateCode:     { type: Number, required: true },
  CustomerAddress:       { type: String, default: '' },
  CustomerCity:          { type: String, default: '' },
  CustomerPincode:       { type: String, default: '' },
  CustomerContactPerson: { type: String, default: '' },
  CustomerPhone:         { type: String, default: '' },
  CustomerEmail:         { type: String, default: '' },
  CustomerPAN:           { type: String, default: '' },
  CustomerType:          { type: String, enum: ['Existing', 'New'], default: 'Existing' },

  // ── GST type (IGST vs CGST/SGST based on state comparison) ───────────────
  GSTType: { type: String, enum: ['CGST/SGST', 'IGST'], default: 'CGST/SGST' },

  // ── Items ─────────────────────────────────────────────────────────────────
  Items: [quotationItemSchema],

  // ── Totals ────────────────────────────────────────────────────────────────
  SubTotal:      { type: Number, default: 0 },
  GSTPercentage: { type: Number, default: 0 },
  GSTAmount:     { type: Number, default: 0 },
  GrandTotal:    { type: Number, default: 0 },
  AmountInWords: { type: String, default: '' },

  // ── Landed Cost / ICC Settings ────────────────────────────────────────────
  icc_credit_on_input_days: { type: Number, default: -30   },
  icc_wip_fg_days:          { type: Number, default:  30   },
  icc_credit_given_days:    { type: Number, default:  45   },
  icc_cost_of_capital:      { type: Number, default:  0.10 },
  ohp_percent_on_matl:      { type: Number, default:  0.10 },
  ohp_on_labour_pct:        { type: Number, default:  0.15 },
  inspection_cost:          { type: Number, default:  0.2  },
  tool_maintenance_cost:    { type: Number, default:  0.2  },
  packing_cost_per_nos:     { type: Number, default:  5    },
  plating_cost_per_kg:      { type: Number, default:  70   },

  // ── Terms & Conditions ────────────────────────────────────────────────────
  TermsConditions: [{ Title: String, Description: String, Sequence: Number }],

  // ── Remarks ───────────────────────────────────────────────────────────────
  InternalRemarks: { type: String, default: '' },
  CustomerRemarks: { type: String, default: '' },

  // ── Status ────────────────────────────────────────────────────────────────
  Status:   { type: String, enum: ['Draft','Sent','Approved','Rejected','Cancelled'], default: 'Draft' },
  IsActive: { type: Boolean, default: true },

  // ── Audit ─────────────────────────────────────────────────────────────────
  CreatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  UpdatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  SentAt:     { type: Date },
  ApprovedAt: { type: Date },
  PDFPath:    { type: String, default: '' },

}, { timestamps: true });


// ── Auto-generate QuotationNo + recalculate totals ───────────────────────────
quotationSchema.pre('save', function (next) {
  if (!this.QuotationNo) {
    const y = new Date().getFullYear();
    const m = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const r = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    this.QuotationNo = `QT-${y}${m}-${r}`;
  }
  this.SubTotal   = Math.round(this.Items.reduce((t, i) => t + (i.Amount || 0), 0) * 100) / 100;
  this.GSTAmount  = Math.round((this.SubTotal * this.GSTPercentage) / 100 * 100) / 100;
  this.GrandTotal = Math.round((this.SubTotal + this.GSTAmount) * 100) / 100;
  this.GSTType    = this.CustomerStateCode !== this.CompanyStateCode ? 'IGST' : 'CGST/SGST';
  next();
});

// ── Auto-set ValidTill (+30 days) if not provided ────────────────────────────
quotationSchema.pre('save', function (next) {
  if (!this.ValidTill) {
    const d = new Date(this.QuotationDate);
    d.setDate(d.getDate() + 30);
    this.ValidTill = d;
  }
  next();
});

// ── Amount in words ───────────────────────────────────────────────────────────
quotationSchema.methods.getAmountInWords = function () {
  const rupees = Math.floor(this.GrandTotal);
  const paise  = Math.round((this.GrandTotal - rupees) * 100);
  const ones   = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
                  'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tensArr = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const scale   = ['','Thousand','Lakh','Crore'];
  const cvt = n => {
    let r = '';
    if (n >= 100) { r += ones[Math.floor(n / 100)] + ' Hundred '; n %= 100; }
    if (n >= 20)  { r += tensArr[Math.floor(n / 10)] + ' '; n %= 10; }
    if (n > 0)    { r += ones[n] + ' '; }
    return r.trim();
  };
  const toWords = n => {
    if (n === 0) return 'Zero';
    let res = ''; let gi = 0;
    while (n > 0) {
      let g;
      if (gi === 0) { g = n % 1000; n = Math.floor(n / 1000); }
      else          { g = n % 100;  n = Math.floor(n / 100);  }
      if (g > 0) { let w = cvt(g); if (scale[gi]) w += ' ' + scale[gi]; res = w + ' ' + res; }
      gi++;
    }
    return res.trim();
  };
  let result = (toWords(rupees) || 'Zero') + ' Rupee' + (rupees === 1 ? '' : 's');
  if (paise > 0) result += ' and ' + toWords(paise) + ' Paise';
  return (result + ' Only').replace(/\s+/g, ' ').trim();
};

quotationSchema.pre('save', function (next) {
  this.AmountInWords = this.GrandTotal > 0 ? this.getAmountInWords() : 'Zero Rupees Only';
  next();
});

module.exports = mongoose.model('Quotation', quotationSchema);