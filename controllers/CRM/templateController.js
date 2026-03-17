const Template = require('../../models/CRM/Template');
const TemplateProcessMapping = require('../../models/CRM/TemplateProcessMapping');
const Process = require('../../models/CRM/Process');

// @desc    Get all templates
// @route   GET /api/templates
// @access  Private
const getTemplates = async (req, res) => {
  try {
    const { page = 1, limit = 10, is_active } = req.query;
    
    const query = {};
    if (is_active !== undefined) query.is_active = is_active === 'true';
    
    const templates = await Template.find(query)
      .populate('created_by', 'username email')
      .populate('updated_by', 'username email')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ template_name: 1 });
    
    const total = await Template.countDocuments(query);
    
    res.json({
      success: true,
      data: templates,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single template with mappings
// @route   GET /api/templates/:id
// @access  Private
const getTemplate = async (req, res) => {
  try {
    const template = await Template.findById(req.params.id)
      .populate('created_by', 'username email')
      .populate('updated_by', 'username email');
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }
    
    // Get process mappings
    const mappings = await TemplateProcessMapping.find({ template_id: template._id })
      .populate('process_id', 'process_name category rate_type')
      .sort({ column_order: 1 });
    
    res.json({
      success: true,
      data: {
        ...template.toObject(),
        process_mappings: mappings
      }
    });
  } catch (error) {
    console.error('Get template error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create template
// @route   POST /api/templates
// @access  Private
const createTemplate = async (req, res) => {
  try {
    const { process_mappings = [], ...templateData } = req.body;
    
    // Create template
    const template = await Template.create({
      ...templateData,
      template_id: `TMP-${Date.now()}`,
      created_by: req.user._id,
      updated_by: req.user._id
    });
    
    // Create process mappings
    if (process_mappings.length > 0) {
      const mappings = process_mappings.map((map, index) => ({
        mapping_id: `MAP-${Date.now()}-${index}`,
        template_id: template._id,
        process_id: map.process_id,
        excel_column_name: map.excel_column_name,
        column_order: map.column_order,
        is_visible: map.is_visible !== false,
        created_by: req.user._id,
        updated_by: req.user._id
      }));
      
      await TemplateProcessMapping.insertMany(mappings);
    }
    
    // Get complete template with mappings
    const completeTemplate = await Template.findById(template._id)
      .populate('created_by', 'username email');
    
    const mappings = await TemplateProcessMapping.find({ template_id: template._id })
      .populate('process_id', 'process_name category rate_type');
    
    res.status(201).json({
      success: true,
      data: {
        ...completeTemplate.toObject(),
        process_mappings: mappings
      },
      message: 'Template created successfully'
    });
  } catch (error) {
    console.error('Create template error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Template with this name already exists'
      });
    }
    
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

// @desc    Update template
// @route   PUT /api/templates/:id
// @access  Private
const updateTemplate = async (req, res) => {
  try {
    const { process_mappings, ...templateData } = req.body;
    
    // Update template
    const template = await Template.findByIdAndUpdate(
      req.params.id,
      {
        ...templateData,
        updated_by: req.user._id
      },
      { new: true, runValidators: true }
    ).populate('created_by', 'username email')
     .populate('updated_by', 'username email');
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }
    
    // Update process mappings if provided
    if (process_mappings) {
      // Delete old mappings
      await TemplateProcessMapping.deleteMany({ template_id: template._id });
      
      // Create new mappings
      const mappings = process_mappings.map((map, index) => ({
        mapping_id: `MAP-${Date.now()}-${index}`,
        template_id: template._id,
        process_id: map.process_id,
        excel_column_name: map.excel_column_name,
        column_order: map.column_order,
        is_visible: map.is_visible !== false,
        created_by: req.user._id,
        updated_by: req.user._id
      }));
      
      await TemplateProcessMapping.insertMany(mappings);
    }
    
    // Get updated mappings
    const mappings = await TemplateProcessMapping.find({ template_id: template._id })
      .populate('process_id', 'process_name category rate_type');
    
    res.json({
      success: true,
      data: {
        ...template.toObject(),
        process_mappings: mappings
      },
      message: 'Template updated successfully'
    });
  } catch (error) {
    console.error('Update template error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Template with this name already exists'
      });
    }
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete template (soft delete)
// @route   DELETE /api/templates/:id
// @access  Private
const deleteTemplate = async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }
    
    template.is_active = false;
    template.updated_by = req.user._id;
    await template.save();
    
    res.json({
      success: true,
      message: 'Template deactivated successfully'
    });
  } catch (error) {
    console.error('Delete template error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get templates for dropdown
// @route   GET /api/templates/dropdown
// @access  Private
const getTemplatesDropdown = async (req, res) => {
  try {
    const templates = await Template.find({ is_active: true })
      .select('template_id template_name')
      .sort({ template_name: 1 });
    
    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Get templates dropdown error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplatesDropdown
};