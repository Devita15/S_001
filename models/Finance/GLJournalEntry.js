// models/Finance/GLJournalEntry.js
const mongoose = require('mongoose');

const journalEntryLineSchema = new mongoose.Schema({
  account_code: {
    type: String,
    required: true,
    trim: true
  },
  account_name: {
    type: String,
    required: true
  },
  account_type: {
    type: String,
    enum: ['Asset', 'Liability', 'Income', 'Expense', 'Equity'],
    required: true
  },
  debit: {
    type: Number,
    default: 0,
    min: 0
  },
  credit: {
    type: Number,
    default: 0,
    min: 0
  },
  cost_center: {
    type: String,
    default: null
  },
  project_code: {
    type: String,
    default: null
  },
  description: {
    type: String
  }
}, { _id: true });

const glJournalEntrySchema = new mongoose.Schema({
  // ==== JOURNAL IDENTITY ============
  journal_number: {
    type: String,
    required: true,
    unique: true
  },
  journal_date: {
    type: Date,
    required: true,
    default: Date.now
  },
  financial_year: {
    type: String
  },
  period: {
    type: String, // e.g., 'Mar-2026'
    required: true
  },
  
  // ==== ENTRY TYPE ============
  entry_type: {
    type: String,
    enum: [
      'Vendor Payment',
      'Purchase Invoice',
      'Sales Invoice',
      'Bank Receipt',
      'Bank Payment',
      'Journal Voucher',
      'Contra Entry',
      'Purchase Return',
      'Sales Return',
      'Credit Note',
      'Debit Note',
      'Depreciation',
      'Salary',
      'Tax Payment',
      'ITC Claim'
    ],
    required: true
  },
  
  // ==== REFERENCE DOCUMENTS ============
  reference_doc_type: {
    type: String,
    enum: [
      'PurchaseInvoice',
      'VendorPayment',
      'SalesInvoice',
      'PurchaseOrder',
      'GRN',
      'NCR',
      'BankStatement'
    ]
  },
  reference_doc_id: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'reference_doc_type'
  },
  reference_doc_number: {
    type: String
  },
  
  // ==== JOURNAL LINES ============
  entries: [journalEntryLineSchema],
  
  // ==== TOTALS ============
  total_debit: {
    type: Number,
    default: 0,
    min: 0
  },
  total_credit: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // ==== DESCRIPTION ============
  narration: {
    type: String,
    required: true
  },
  notes: {
    type: String
  },
  
  // ==== APPROVAL ============
  status: {
    type: String,
    enum: ['Draft', 'Approved', 'Posted', 'Cancelled', 'Reversed'],
    default: 'Draft'
  },
  approved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approved_at: {
    type: Date
  },
  posted_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  posted_at: {
    type: Date
  },
  
  // ==== REVERSAL (if needed) ============
  reversal_of: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GLJournalEntry'
  },
  is_reversal: {
    type: Boolean,
    default: false
  },
  reversal_reason: {
    type: String
  },
  
  // ==== AUDIT ============
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Generate journal number before saving
glJournalEntrySchema.pre('save', async function(next) {
  if (!this.journal_number) {
    const year = new Date().getFullYear();
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const count = await this.constructor.countDocuments() + 1;
    this.journal_number = `GL-${year}${month}-${count.toString().padStart(4, '0')}`;
  }
  
  // Set period (e.g., 'Mar-2026')
  const date = this.journal_date || new Date();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  this.period = `${monthNames[date.getMonth()]}-${date.getFullYear()}`;
  
  // Set financial year (India: Apr-Mar)
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (month >= 4) {
    this.financial_year = `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    this.financial_year = `${year - 1}-${year.toString().slice(-2)}`;
  }
  
  // Calculate totals
  let totalDebit = 0;
  let totalCredit = 0;
  
  this.entries.forEach(entry => {
    totalDebit += entry.debit || 0;
    totalCredit += entry.credit || 0;
  });
  
  this.total_debit = totalDebit;
  this.total_credit = totalCredit;
  
  next();
});

// Indexes
glJournalEntrySchema.index({ journal_number: 1 });
glJournalEntrySchema.index({ journal_date: -1 });
glJournalEntrySchema.index({ financial_year: 1, period: 1 });
glJournalEntrySchema.index({ entry_type: 1 });
glJournalEntrySchema.index({ reference_doc_type: 1, reference_doc_id: 1 });
glJournalEntrySchema.index({ status: 1 });

module.exports = mongoose.model('GLJournalEntry', glJournalEntrySchema);