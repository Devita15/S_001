// models/Procurement/RFQ.js
const mongoose = require('mongoose');

const rfqItemSchema = new mongoose.Schema({
  item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  part_no: {
    type: String,
    required: true,
    uppercase: true
  },
  description: {
    type: String,
    required: true
  },
  required_qty: {
    type: Number,
    required: true,
    min: 1
  },
  unit: {
    type: String,
    required: true
  },
  technical_specs: {
    type: String
  }
}, { _id: true });

const vendorResponseItemSchema = new mongoose.Schema({
  item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  quoted_rate: {
    type: Number,
    required: true,
    min: 0
  },
  delivery_days: {
    type: Number,
    required: true,
    min: 0
  },
  moq: {
    type: Number,
    min: 0,
    default: 0
  },
  payment_terms: {
    type: String
  },
  remarks: {
    type: String
  }
}, { _id: true });

const vendorResponseSchema = new mongoose.Schema({
  vendor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  vendor_name: {
    type: String,
    required: true
  },
  sent_at: {
    type: Date
  },
  responded_at: {
    type: Date
  },
  response_items: [vendorResponseItemSchema],
  overall_remarks: {
    type: String
  },
  is_complete: {
    type: Boolean,
    default: false
  }
}, { _id: true });

const rfqSchema = new mongoose.Schema({
  rfq_number: {
    type: String,
    unique: true,
    sparse: true,  // ← Allows null values while maintaining uniqueness
    index: true
    // removed required: true
  },
  rfq_date: {
    type: Date,
    required: true,
    default: Date.now
  },
  pr_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseRequisition'
  },
  valid_till: {
    type: Date,
    required: true
  },
  
  // Items being quoted
  items: [rfqItemSchema],
  
  // Vendors invited
  vendors: [vendorResponseSchema],
  
  // Comparison matrix (auto-computed)
  comparison_matrix: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Recommendation
  recommended_vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor'
  },
  recommendation_notes: {
    type: String
  },
  recommended_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  recommended_at: {
    type: Date
  },
  
  // Status
  status: {
    type: String,
    enum: ['Draft', 'Sent', 'Partially Responded', 'Fully Responded', 'Compared', 'Closed'],
    default: 'Draft'
  },
  
  // Audit
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
  timestamps: true
});

// Generate RFQ number before saving (only if not already set)
rfqSchema.pre('save', async function(next) {
  // Only generate if rfq_number doesn't exist
  if (!this.rfq_number) {
    try {
      const year = new Date().getFullYear();
      const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
      
      // Find the latest RFQ to get the correct sequence
      const lastRFQ = await this.constructor.findOne({}, {}, { sort: { createdAt: -1 } });
      let sequence = 1;
      
      if (lastRFQ && lastRFQ.rfq_number) {
        const parts = lastRFQ.rfq_number.split('-');
        const lastNumber = parseInt(parts[parts.length - 1]);
        if (!isNaN(lastNumber)) {
          sequence = lastNumber + 1;
        }
      }
      
      this.rfq_number = `RFQ-${year}${month}-${sequence.toString().padStart(4, '0')}`;
    } catch (err) {
      console.error('Error generating RFQ number:', err);
      // Fallback with timestamp
      this.rfq_number = `RFQ-${Date.now()}`;
    }
  }
  next();
});

// Method to build comparison matrix
rfqSchema.methods.buildComparisonMatrix = function() {
  const matrix = {};
  
  // For each item
  this.items.forEach(item => {
    const itemKey = item.item_id.toString();
    matrix[itemKey] = {
      part_no: item.part_no,
      description: item.description,
      quotes: []
    };
    
    // Collect quotes from all vendors
    this.vendors.forEach(vendor => {
      if (vendor.responded_at) {
        const responseItem = vendor.response_items.find(
          ri => ri.item_id.toString() === item.item_id.toString()
        );
        
        if (responseItem) {
          matrix[itemKey].quotes.push({
            vendor_id: vendor.vendor_id,
            vendor_name: vendor.vendor_name,
            quoted_rate: responseItem.quoted_rate,
            delivery_days: responseItem.delivery_days,
            payment_terms: responseItem.payment_terms
          });
        }
      }
    });
    
    // Sort by price to find L1, L2, L3
    matrix[itemKey].quotes.sort((a, b) => a.quoted_rate - b.quoted_rate);
  });
  
  this.comparison_matrix = matrix;
};

// Indexes
rfqSchema.index({ rfq_number: 1 });
rfqSchema.index({ status: 1, valid_till: 1 });
rfqSchema.index({ 'vendors.vendor_id': 1 });
rfqSchema.index({ pr_id: 1 });
rfqSchema.index({ createdAt: -1 });

module.exports = mongoose.model('RFQ', rfqSchema);