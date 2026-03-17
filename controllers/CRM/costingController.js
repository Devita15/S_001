const Costing = require('../../models/CRM/Costing');
const Item = require('../../models/CRM/Item');
const Vendor = require('../../models/CRM/Vendor');
const Process = require('../../models/CRM/Process');
const RawMaterial = require('../../models/CRM/RawMaterial');
const Tax = require('../../models/CRM/Tax');  // Note: Tax appears to be in CRM, not HR
const Company = require('../../models/user\'s & setting\'s/Company');
const Template = require('../../models/CRM/Template');
// @desc    Get all costings
// @route   GET /api/costings
// @access  Private
const getCostings = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status,
      start_date,
      end_date,
      search
    } = req.query;
    
    const query = { is_active: true };
    
    if (status) query.status = status;
    
    if (start_date || end_date) {
      query.costing_date = {};
      if (start_date) query.costing_date.$gte = new Date(start_date);
      if (end_date) query.costing_date.$lte = new Date(end_date);
    }
    
    if (search) {
      query.$or = [
        { costing_no: new RegExp(search, 'i') }
      ];
    }
    
    const costings = await Costing.find(query)
      .populate('template_id', 'template_name')
      .populate('created_by', 'username email')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ createdAt: -1 });
    
    const total = await Costing.countDocuments(query);
    
    // Get statistics
    const stats = await Costing.aggregate([
      { $match: { is_active: true } },
      {
        $group: {
          _id: null,
          total_costings: { $sum: 1 },
          total_amount: { $sum: '$grand_total' },
          avg_amount: { $avg: '$grand_total' },
          draft_count: {
            $sum: { $cond: [{ $eq: ['$status', 'Draft'] }, 1, 0] }
          },
          approved_count: {
            $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] }
          }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: costings,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      },
      statistics: stats[0] || {
        total_costings: 0,
        total_amount: 0,
        avg_amount: 0,
        draft_count: 0,
        approved_count: 0
      }
    });
  } catch (error) {
    console.error('Get costings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single costing
// @route   GET /api/costings/:id
// @access  Private
const getCosting = async (req, res) => {
  try {
    const costing = await Costing.findById(req.params.id)
      .populate('template_id', 'template_name')
      .populate('created_by', 'username email')
      .populate('updated_by', 'username email');
    
    if (!costing) {
      return res.status(404).json({
        success: false,
        message: 'Costing not found'
      });
    }
    
    // Populate nested references
    await costing.populate({
      path: 'lines.item_id',
      select: 'part_no part_description density unit hsn_code'
    });
    
    await costing.populate({
      path: 'lines.rm_vendor_id',
      select: 'vendor_name vendor_code'
    });
    
    await costing.populate({
      path: 'lines.processes.process_id',
      select: 'process_name category rate_type'
    });
    
    await costing.populate({
      path: 'lines.processes.vendor_id',
      select: 'vendor_name'
    });
    
    res.json({
      success: true,
      data: costing
    });
  } catch (error) {
    console.error('Get costing error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Costing not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Update costing status
// @route   PUT /api/costings/:id/status
// @access  Private
const updateCostingStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const userId = req.user._id;
    
    if (!['Draft', 'Approved'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be Draft or Approved'
      });
    }
    
    const costing = await Costing.findById(req.params.id);
    
    if (!costing) {
      return res.status(404).json({
        success: false,
        message: 'Costing not found'
      });
    }
    
    costing.status = status;
    costing.updated_by = userId;
    await costing.save();
    
    res.json({
      success: true,
      data: costing,
      message: `Costing ${status} successfully`
    });
    
  } catch (error) {
    console.error('Update costing status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete costing (soft delete)
// @route   DELETE /api/costings/:id
// @access  Private
const deleteCosting = async (req, res) => {
  try {
    const costing = await Costing.findById(req.params.id);
    
    if (!costing) {
      return res.status(404).json({
        success: false,
        message: 'Costing not found'
      });
    }
    
    if (costing.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        message: 'Only draft costings can be deleted'
      });
    }
    
    costing.is_active = false;
    costing.updated_by = req.user._id;
    await costing.save();
    
    res.json({
      success: true,
      message: 'Costing deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete costing error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Costing not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get form data with auto-filled values from masters
// @route   GET /api/costings/form-data
// @access  Private
const getCostingFormData = async (req, res) => {
  try {
    const { item_id } = req.query;
    
    const formData = {
      margin: {},
      gst: {},
      raw_material: {}
    };
    
    // Get company default margin
    const company = await Company.findOne({ is_active: true });
    if (company) {
      formData.margin = {
        default_percent: company.default_margin_percent || 15,
        source: 'Company Master'
      };
    }
    
    // If item selected, get RM details and GST
    if (item_id) {
      const item = await Item.findById(item_id);
      if (item) {
        // Get raw material from master
        const rawMaterial = await RawMaterial.findOne({ 
          rm_grade: item.rm_grade,
          is_active: true 
        }).populate('default_vendor_id');
        
        if (rawMaterial) {
          formData.raw_material = {
            rm_grade: rawMaterial.rm_grade,
            rate_per_kg: rawMaterial.rate_per_kg,
            scrap_rate_per_kg: rawMaterial.scrap_rate_per_kg,
            profile_conversion_rate: rawMaterial.profile_conversion_rate || 0,
            transport_percent: rawMaterial.transport_percent,
            effective_rate: rawMaterial.effective_rate,
            default_vendor: rawMaterial.default_vendor_id,
            source: 'Raw Material Master'
          };
        }
        
        // Get GST from HSN code
        const tax = await Tax.findOne({ 
          hsn_code: item.hsn_code,
          is_active: true 
        });
        
        if (tax) {
          formData.gst = {
            hsn_code: tax.hsn_code,
            gst_percent: tax.gst_percent,
            source: 'Tax Master'
          };
        }
      }
    }
    
    res.json({
      success: true,
      data: formData
    });
    
  } catch (error) {
    console.error('Get costing form data error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Calculate line (process rates entered by user)
// @route   POST /api/costings/calculate-line
// @access  Private
const calculateLine = async (req, res) => {
  try {
    const { 
      item_id,
      thickness,
      width,
      length,
      quantity,
      rm_vendor_id,
      margin_percent: userMarginPercent,
      processes = []  // User entered process rates
    } = req.body;
    
    // 1. Get item for density
    const item = await Item.findById(item_id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }
    
    // 2. Get raw material from master (auto-filled)
    const rawMaterial = await RawMaterial.findOne({ 
      rm_grade: item.rm_grade,
      is_active: true 
    });
    
    if (!rawMaterial) {
      return res.status(404).json({
        success: false,
        message: 'Raw material not found for this grade'
      });
    }
    
    // 3. Get GST from tax master (auto-filled)
    const tax = await Tax.findOne({ hsn_code: item.hsn_code, is_active: true });
    const gstPercent = tax ? tax.gst_percent : 18;
    
    // 4. Get company default margin (auto-filled)
    const company = await Company.findOne({ is_active: true });
    const defaultMargin = company ? company.default_margin_percent : 15;
    const marginPercent = userMarginPercent || defaultMargin;
    
    // 5. Calculate weight
    const grossWeight = (thickness * width * length * item.density) / 1000000;
    
    // 6. Calculate RM cost (from master)
    const totalRmRate = rawMaterial.rate_per_kg + (rawMaterial.profile_conversion_rate || 0);
    const grossRmCost = grossWeight * totalRmRate;
    
    // 7. Calculate scrap (from master scrap rate)
    let scrapKgs = 0;
    let scrapCost = 0;
    if (req.body.net_weight) {
      scrapKgs = grossWeight - req.body.net_weight;
      scrapCost = scrapKgs * rawMaterial.scrap_rate_per_kg;
    }
    
    // 8. Calculate process costs (USER ENTERED RATES)
    let processTotal = 0;
    const processCalculations = [];
    
    for (const proc of processes) {
      const process = await Process.findById(proc.process_id);
      if (!process) continue;
      
      let calculatedAmount = 0;
      if (process.rate_type === 'Per Kg') {
        calculatedAmount = proc.rate_entered * grossWeight;
      } else if (process.rate_type === 'Per Nos') {
        calculatedAmount = proc.rate_entered;
      } else if (process.rate_type === 'Per Hour') {
        calculatedAmount = proc.rate_entered * (proc.hours || 1);
      } else { // Fixed
        calculatedAmount = proc.rate_entered;
      }
      
      processTotal += calculatedAmount;
      
      processCalculations.push({
        process_id: process._id,
        process_name: process.process_name,
        vendor_id: proc.vendor_id,
        rate_entered: proc.rate_entered,
        rate_type: process.rate_type,
        calculated_amount: calculatedAmount
      });
    }
    
    // 9. Calculate totals
    const subtotal = grossRmCost + processTotal - scrapCost;
    const marginAmount = subtotal * (marginPercent / 100);
    const finalPartCost = subtotal + marginAmount;
    const lineTotal = finalPartCost * quantity;
    
    res.json({
      success: true,
      data: {
        // From masters (auto-filled)
        raw_material: {
          rm_grade: rawMaterial.rm_grade,
          rate_per_kg: rawMaterial.rate_per_kg,
          scrap_rate_per_kg: rawMaterial.scrap_rate_per_kg,
          profile_conversion_rate: rawMaterial.profile_conversion_rate || 0,
          total_rm_rate: totalRmRate,
          source: 'Raw Material Master'
        },
        margin: {
          default_percent: defaultMargin,
          used_percent: marginPercent,
          source: 'Company Master'
        },
        gst: {
          hsn_code: item.hsn_code,
          gst_percent: gstPercent,
          source: 'Tax Master'
        },
        
        // Calculations
        gross_weight: parseFloat(grossWeight.toFixed(4)),
        scrap_kgs: parseFloat(scrapKgs.toFixed(4)),
        scrap_cost: parseFloat(scrapCost.toFixed(2)),
        gross_rm_cost: parseFloat(grossRmCost.toFixed(2)),
        
        // User entered processes
        process_total: parseFloat(processTotal.toFixed(2)),
        process_details: processCalculations,
        
        // Totals
        subtotal: parseFloat(subtotal.toFixed(2)),
        margin_amount: parseFloat(marginAmount.toFixed(2)),
        final_part_cost: parseFloat(finalPartCost.toFixed(2)),
        line_total: parseFloat(lineTotal.toFixed(2))
      }
    });
    
  } catch (error) {
    console.error('Calculate line error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create new costing
// @route   POST /api/costings
// @access  Private
const createCosting = async (req, res) => {
  try {
    const userId = req.user._id;
    const { template_id, lines } = req.body;
    
    if (!lines || lines.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one line item is required'
      });
    }
    
    const processedLines = [];
    let costingSubtotal = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Get item
      const item = await Item.findById(line.item_id);
      if (!item) {
        return res.status(404).json({
          success: false,
          message: `Item not found at line ${i + 1}`
        });
      }
      
      // Get raw material from master
      const rawMaterial = await RawMaterial.findOne({ 
        rm_grade: item.rm_grade,
        is_active: true 
      });
      
      if (!rawMaterial) {
        return res.status(404).json({
          success: false,
          message: `Raw material not found for ${item.rm_grade} at line ${i + 1}`
        });
      }
      
      // Get company default margin
      const company = await Company.findOne({ is_active: true });
      const defaultMargin = company ? company.default_margin_percent : 15;
      
      // Calculate weight
      const grossWeight = (line.thickness * line.width * line.length * item.density) / 1000000;
      
      // Calculate RM cost (from master)
      const totalRmRate = rawMaterial.rate_per_kg + (rawMaterial.profile_conversion_rate || 0);
      const grossRmCost = grossWeight * totalRmRate;
      
      // Calculate scrap (from master)
      const scrapKgs = line.net_weight ? grossWeight - line.net_weight : 0;
      const scrapCost = scrapKgs * rawMaterial.scrap_rate_per_kg;
      
      // Calculate process costs (USER ENTERED RATES)
      let processTotal = 0;
      const processedProcesses = [];
      
      if (line.processes && line.processes.length > 0) {
        for (const proc of line.processes) {
          const process = await Process.findById(proc.process_id);
          if (!process) {
            return res.status(404).json({
              success: false,
              message: `Process not found at line ${i + 1}`
            });
          }
          
          let calculatedAmount = 0;
          if (process.rate_type === 'Per Kg') {
            calculatedAmount = proc.rate_entered * grossWeight;
          } else if (process.rate_type === 'Per Nos') {
            calculatedAmount = proc.rate_entered;
          } else if (process.rate_type === 'Per Hour') {
            calculatedAmount = proc.rate_entered * (proc.hours || 1);
          } else { // Fixed
            calculatedAmount = proc.rate_entered;
          }
          
          processTotal += calculatedAmount;
          
          processedProcesses.push({
            line_process_id: `LP-${Date.now()}-${i}-${processedProcesses.length}`,
            process_id: proc.process_id,
            vendor_id: proc.vendor_id,
            rate_entered: proc.rate_entered,
            calculated_amount: calculatedAmount
          });
        }
      }
      
      // Calculate line totals
      const marginPercent = line.margin_percent || defaultMargin;
      const lineSubtotal = grossRmCost + processTotal - scrapCost;
      const marginAmount = lineSubtotal * (marginPercent / 100);
      const finalPartCost = lineSubtotal + marginAmount;
      const lineTotal = finalPartCost * line.quantity;
      
      costingSubtotal += lineTotal;
      
      processedLines.push({
        costing_line_id: `CL-${Date.now()}-${i}`,
        item_id: line.item_id,
        thickness: line.thickness,
        width: line.width,
        length: line.length,
        section: line.section || 0,
        gross_weight: grossWeight,
        net_weight: line.net_weight || 0,
        rm_vendor_id: line.rm_vendor_id || rawMaterial.default_vendor_id,
        rm_rate_from_master: rawMaterial.rate_per_kg,
        profile_conversion_rate: rawMaterial.profile_conversion_rate || 0,
        total_rm_rate: totalRmRate,
        gross_rm_cost: grossRmCost,
        scrap_kgs: scrapKgs,
        scrap_rate_from_master: rawMaterial.scrap_rate_per_kg,
        scrap_cost: scrapCost,
        process_total: processTotal,
        subtotal_cost: lineSubtotal,
        margin_percent: marginPercent,
        margin_amount: marginAmount,
        final_part_cost: finalPartCost,
        quantity: line.quantity,
        line_total: lineTotal,
        processes: processedProcesses
      });
    }
    
    // Get GST from first item's HSN
    const firstItem = await Item.findById(lines[0].item_id);
    const tax = await Tax.findOne({ hsn_code: firstItem.hsn_code, is_active: true });
    const gstPercent = tax ? tax.gst_percent : 18;
    const gstAmount = costingSubtotal * (gstPercent / 100);
    const grandTotal = costingSubtotal + gstAmount;
    
    // Create costing
    const costing = await Costing.create({
      costing_id: `CST-${Date.now()}`,
      costing_no: `CST-${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      costing_date: new Date(),
      template_id: template_id || null,
      subtotal: costingSubtotal,
      gst_percent: gstPercent,
      gst_amount: gstAmount,
      grand_total: grandTotal,
      lines: processedLines,
      status: 'Draft',
      created_by: userId,
      updated_by: userId
    });
    
    // Populate for response
    await costing.populate('template_id', 'template_name');
    await costing.populate('created_by', 'username email');
    
    res.status(201).json({
      success: true,
      data: costing,
      message: 'Costing created successfully'
    });
    
  } catch (error) {
    console.error('Create costing error:', error);
    
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

module.exports = {
  getCostings,
  getCosting,
  createCosting,
  updateCostingStatus,
  deleteCosting,
  calculateLine,
  getCostingFormData
};