'use strict';
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// QUOTATION ITEM SUB-SCHEMA
//
// ⚠️  Every field that the Excel generator reads MUST be listed here.
//     Mongoose silently strips any field NOT in the schema during save/toObject.
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

  // ── Dimensions (from DimensionWeight master) ──────────────────────────────
  Thickness: { type: Number, default: 0 },
  Width:     { type: Number, default: 0 },
  Length:    { type: Number, default: 0 },

  // ── Raw material (from RawMaterial master) ────────────────────────────────
  density:                 { type: Number, default: 8.96 },  // g/cm³
  rm_rate:                 { type: Number, default: 0 },     // RatePerKG Rs/kg
  profile_conversion_rate: { type: Number, default: 0 },     // Rs/kg
  total_rm_rate:           { type: Number, default: 0 },     // rm_rate + profile_conversion_rate
  scrap_rate_per_kg:       { type: Number, default: 0 },     // Rs/kg
  transport_rate_per_kg:   { type: Number, default: 0 },     // Rs/kg — RawMaterial.transport_rate_per_kg

  // ── Item-level percentages (from Item master) ─────────────────────────────
  // Stored as plain percent numbers e.g. 2 means 2%, 85 means 85%
  // Excel generator divides by 100 when using them
  rm_rejection_percent:      { type: Number, default: 2  },  // Item.rm_rejection_percent
  scrap_realisation_percent: { type: Number, default: 85 },  // Item.scrap_realisation_percent

  // ── GST (from Tax master by HSNCode) ─────────────────────────────────────
  // Stored as plain percent e.g. 18 means 18%
  gst_percentage: { type: Number, default: 18 },  // Tax.GSTPercentage

  // ── Weight calculations ───────────────────────────────────────────────────
  gross_weight_kg: { type: Number, default: 0 },  // T×W×L×density/1e6
  net_weight_kg:   { type: Number, default: 0 },  // DimensionWeight.WeightInKG
  scrap_kgs:       { type: Number, default: 0 },  // gross - net

  // ── Cost calculations ─────────────────────────────────────────────────────
  gross_rm_cost: { type: Number, default: 0 },
  scrap_cost:    { type: Number, default: 0 },
  net_rm_cost:   { type: Number, default: 0 },

  // ── Legacy aliases ────────────────────────────────────────────────────────
  Weight:  { type: Number, default: 0 },   // = gross_weight_kg
  RMCost:  { type: Number, default: 0 },   // = gross_rm_cost

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

  // ── Company (auto from Company master) ────────────────────────────────────
  CompanyID:        { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  CompanyName:      { type: String, required: true },
  CompanyGSTIN:     { type: String, required: true },
  CompanyState:     { type: String, required: true },
  CompanyStateCode: { type: Number, required: true },

  // ── Vendor ────────────────────────────────────────────────────────────────
  VendorID:            { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  VendorName:          { type: String, required: true },
  VendorGSTIN:         { type: String, default: '' },
  VendorState:         { type: String, required: true },
  VendorStateCode:     { type: Number, required: true },
  VendorAddress:       { type: String, default: '' },
  VendorCity:          { type: String, default: '' },
  VendorPincode:       { type: String, default: '' },
  VendorContactPerson: { type: String, default: '' },
  VendorPhone:         { type: String, default: '' },
  VendorEmail:         { type: String, default: '' },
  VendorPAN:           { type: String, default: '' },
  VendorType:          { type: String, enum: ['Existing','New'], default: 'Existing' },

  // ── GST type (auto from state code comparison) ────────────────────────────
  GSTType: { type: String, enum: ['CGST/SGST','IGST'], default: 'CGST/SGST' },

  // ── Items ─────────────────────────────────────────────────────────────────
  Items: [quotationItemSchema],

  // ── Quotation totals ──────────────────────────────────────────────────────
  SubTotal:      { type: Number, default: 0 },
  GSTPercentage: { type: Number, default: 0 },
  GSTAmount:     { type: Number, default: 0 },
  GrandTotal:    { type: Number, default: 0 },
  AmountInWords: { type: String, default: '' },

  // ── LANDED COST SETTINGS (user provides at quotation creation time) ────────
  //
  //  These go into the request body when creating a quotation.
  //  The Excel generator reads them from quotationData directly.
  //  All have sensible defaults so they are optional in the request.
  //
  //  What comes from MASTERS (stored per item above, not here):
  //    item.rm_rejection_percent      ← Item.rm_rejection_percent       (C17)
  //    item.scrap_realisation_percent ← Item.scrap_realisation_percent  (C22)
  //    item.transport_rate_per_kg     ← RawMaterial.transport_rate_per_kg (C30)
  //    item.gst_percentage            ← Tax.GSTPercentage by HSNCode    (C26)
  //
  //  What user sends (stored here at quotation level):
  icc_credit_on_input_days: { type: Number, default: -30  },  // D48
  icc_wip_fg_days:          { type: Number, default:  30  },  // D49
  icc_credit_given_days:    { type: Number, default:  45  },  // D50
  icc_cost_of_capital:      { type: Number, default:  0.10 }, // B52  (0.10 = 10%)
  ohp_percent_on_matl:      { type: Number, default:  0.10 }, // B55  (0.10 = 10%)
  ohp_on_labour_pct:        { type: Number, default:  0.15 }, // C63  (0.15 = 15%)
  inspection_cost:          { type: Number, default:  0.2  }, // D64
  tool_maintenance_cost:    { type: Number, default:  0.2  }, // D65
  packing_cost_per_nos:     { type: Number, default:  5    }, // C66
  plating_cost_per_kg:      { type: Number, default:  70   }, // C68

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


// ── Auto-generate QuotationNo + recalculate totals ────────────────────────────
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
  this.GSTType    = this.VendorStateCode !== this.CompanyStateCode ? 'IGST' : 'CGST/SGST';
  next();
});

// ── Auto-set ValidTill (+30 days from QuotationDate) ─────────────────────────
quotationSchema.pre('save', function (next) {
  if (!this.ValidTill) {
    const d = new Date(this.QuotationDate);
    d.setDate(d.getDate() + 30);
    this.ValidTill = d;
  }
  next();
});

// ── Amount in words ────────────────────────────────────────────────────────────
quotationSchema.methods.getAmountInWords = function () {
  const rupees = Math.floor(this.GrandTotal);
  const paise  = Math.round((this.GrandTotal - rupees) * 100);
  const ones   = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
                  'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tensArr= ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const scale  = ['','Thousand','Lakh','Crore'];
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