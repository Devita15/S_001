const DimensionWeight = require('../../models/CRM/DimensionWeight');
const Item = require('../../models/CRM/Item');

// @desc    Get all dimension weights
// @route   GET /api/dimension-weights
// @access  Private
const getDimensionWeights = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      partNo, 
      sortBy = 'CreatedAt', 
      sortOrder = 'desc',
      minWeight,
      maxWeight
    } = req.query;
    
    const query = {};
    
    // Filter by part number
    if (partNo) {
      query.PartNo = partNo.toUpperCase();
    }
    
    // Filter by weight range
    if (minWeight || maxWeight) {
      query.WeightInKG = {};
      if (minWeight) query.WeightInKG.$gte = parseFloat(minWeight);
      if (maxWeight) query.WeightInKG.$lte = parseFloat(maxWeight);
    }
    
    // Sort configuration
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const dimensionWeights = await DimensionWeight.find(query)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort(sort);
    
    // Manually populate item data
    const populatedDimensionWeights = await Promise.all(
      dimensionWeights.map(async (dw) => {
        const item = await Item.findOne({ PartNo: dw.PartNo })
          .populate('MaterialID', 'MaterialCode MaterialName Description Density Unit')
          .populate('CreatedBy', 'Username Email')
          .populate('UpdatedBy', 'Username Email')
          .select('PartNo PartName Description DrawingNo RevisionNo Unit HSNCode IsActive');
        
        return {
          ...dw.toObject(),
          Item: item || null,
          VolumeMM3: dw.VolumeMM3,
          WeightFormatted: dw.WeightFormatted,
          DimensionsFormatted: dw.DimensionsFormatted
        };
      })
    );
    
    const total = await DimensionWeight.countDocuments(query);
    
    // Calculate statistics
    const stats = await DimensionWeight.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalWeight: { $sum: '$WeightInKG' },
          avgWeight: { $avg: '$WeightInKG' },
          minWeight: { $min: '$WeightInKG' },
          maxWeight: { $max: '$WeightInKG' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json({ 
      success: true, 
      data: populatedDimensionWeights,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      },
      statistics: stats[0] || {
        totalWeight: 0,
        avgWeight: 0,
        minWeight: 0,
        maxWeight: 0,
        count: 0
      }
    });
  } catch (error) {
    console.error('Get dimension weights error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Get single dimension weight
// @route   GET /api/dimension-weights/:id
// @access  Private
const getDimensionWeight = async (req, res) => {
  try {
    const dimensionWeight = await DimensionWeight.findById(req.params.id);
    
    if (!dimensionWeight) {
      return res.status(404).json({ 
        success: false, 
        message: 'Dimension weight not found' 
      });
    }
    
    // Manually populate item data
    const item = await Item.findOne({ PartNo: dimensionWeight.PartNo })
      .populate('MaterialID', 'MaterialCode MaterialName Description Density Unit Standard Grade Color')
      .populate('CreatedBy', 'Username Email EmployeeID')
      .populate('UpdatedBy', 'Username Email EmployeeID')
      .select('PartNo PartName Description DrawingNo RevisionNo Unit HSNCode IsActive');
    
    // Get material density from item if available
    let materialDensity = 8.96; // Default copper density
    if (item && item.MaterialID && item.MaterialID.Density) {
      materialDensity = item.MaterialID.Density;
    }
    
    const populatedDimensionWeight = {
      ...dimensionWeight.toObject(),
      Item: item || null,
      MaterialDensity: materialDensity,
      VolumeMM3: dimensionWeight.VolumeMM3,
      WeightFormatted: dimensionWeight.WeightFormatted,
      DimensionsFormatted: dimensionWeight.DimensionsFormatted,
      FormulaDetails: {
        VolumeCalculation: `${dimensionWeight.Thickness} × ${dimensionWeight.Width} × ${dimensionWeight.Length} = ${dimensionWeight.VolumeMM3?.toFixed(2)} mm³`,
        WeightCalculation: `(${dimensionWeight.VolumeMM3?.toFixed(2)} × ${dimensionWeight.Density}) / 1,000,000 = ${dimensionWeight.WeightInKG?.toFixed(3)} Kg`
      }
    };
    
    res.json({ 
      success: true, 
      data: populatedDimensionWeight 
    });
  } catch (error) {
    console.error('Get dimension weight error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Dimension weight not found' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Create dimension weight
// @route   POST /api/dimension-weights
// @access  Private
const createDimensionWeight = async (req, res) => {
  try {
    const { PartNo, Thickness, Width, Length, Density } = req.body;
    const userId = req.user.id;

    // Normalize PartNo to uppercase
    const actualPartNo = PartNo.toUpperCase().trim();
    
    console.log('🔍 Checking if item exists in Item Master:', actualPartNo);

    // ✅ FIXED: Check in Item collection, NOT DimensionWeight
    const item = await Item.findOne({ 
      part_no: actualPartNo,  // Field name is 'part_no' in your schema
      is_active: true         // Field name is 'is_active' (lowercase)
    });

    if (!item) {
      console.log('❌ Item not found:', actualPartNo);
      return res.status(404).json({ 
        success: false, 
        message: `Item ${actualPartNo} not found or inactive in Item Master` 
      });
    }

    console.log('✅ Item found:', item.part_description);
    console.log('📏 Item density from master:', item.density);

    // Check if dimension already exists
    const existingDimension = await DimensionWeight.findOne({ PartNo: actualPartNo });
    if (existingDimension) {
      return res.status(400).json({ 
        success: false, 
        message: 'Dimension weight already exists for this part. Use PUT to update.' 
      });
    }

    // Use provided density OR get from item master
    const finalDensity = Density || item.density || 8.96;

    // Create - will auto-calculate VolumeMM3 and WeightInKG in pre-save hook
    const dimensionWeight = await DimensionWeight.create({
      PartNo: actualPartNo,
      Thickness,
      Width,
      Length,
      Density: finalDensity,
      CreatedBy: userId,
      UpdatedBy: userId
    });

    console.log('✅ Dimension created with calculated values:', {
      Volume: dimensionWeight.VolumeMM3 + ' mm³',
      Weight: dimensionWeight.WeightInKG + ' kg'
    });

    // Return with item details
    const response = {
      ...dimensionWeight.toObject(),
      ItemDetails: {
        part_no: item.part_no,
        part_description: item.part_description,
        drawing_no: item.drawing_no,
        revision_no: item.revision_no,
        unit: item.unit,
        hsn_code: item.hsn_code
      },
      FormulaDetails: {
        VolumeCalculation: `${Thickness} × ${Width} × ${Length} = ${dimensionWeight.VolumeMM3} mm³`,
        WeightCalculation: `(${dimensionWeight.VolumeMM3} × ${finalDensity}) / 1,000,000 = ${dimensionWeight.WeightInKG} Kg`
      }
    };

    res.status(201).json({ 
      success: true, 
      data: response,
      message: 'Dimension weight created successfully with calculated values' 
    });

  } catch (error) {
    console.error('Create dimension weight error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ 
        success: false, 
        message: messages.join(', ') 
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Dimension weight already exists for this part number'
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error: ' + error.message 
    });
  }
};

// @desc    Update dimension weight
// @route   PUT /api/dimension-weights/:id
// @access  Private
const updateDimensionWeight = async (req, res) => {
  try {
    const userId = req.user.id;
    const { Thickness, Width, Length, Density } = req.body;
    
    // First get the existing document
    const existing = await DimensionWeight.findById(req.params.id);
    
    if (!existing) {
      return res.status(404).json({ 
        success: false, 
        message: 'Dimension weight not found' 
      });
    }

    // Prepare update data
    const updateData = {
      ...req.body,
      UpdatedBy: userId,
      UpdatedAt: Date.now()
    };

    // Find and update - will trigger pre-findOneAndUpdate hook
    const dimensionWeight = await DimensionWeight.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    // Get item details
    const item = await Item.findOne({ 
      part_no: dimensionWeight.PartNo,
      is_active: true 
    });

    const response = {
      ...dimensionWeight.toObject(),
      ItemDetails: item ? {
        part_no: item.part_no,
        part_description: item.part_description,
        drawing_no: item.drawing_no,
        revision_no: item.revision_no,
        unit: item.unit,
        hsn_code: item.hsn_code
      } : null,
      FormulaDetails: {
        VolumeCalculation: `${dimensionWeight.Thickness} × ${dimensionWeight.Width} × ${dimensionWeight.Length} = ${dimensionWeight.VolumeMM3} mm³`,
        WeightCalculation: `(${dimensionWeight.VolumeMM3} × ${dimensionWeight.Density}) / 1,000,000 = ${dimensionWeight.WeightInKG} Kg`
      }
    };

    res.json({ 
      success: true, 
      data: response,
      message: 'Dimension weight updated successfully with recalculated values' 
    });

  } catch (error) {
    console.error('Update dimension weight error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Calculate weight from dimensions
// @route   POST /api/dimension-weights/calculate
// @access  Private
const calculateWeight = async (req, res) => {
  try {
    const { Thickness, Width, Length, Density = 8.96 } = req.body;
    
    // Validate inputs
    if (!Thickness || !Width || !Length) {
      return res.status(400).json({
        success: false,
        message: 'Thickness, Width, and Length are required'
      });
    }
    
    // Calculate Volume (mm³) = T × W × L
    const volume = Thickness * Width * Length;
    
    // Calculate Weight (Kg) = (Volume × Density) / 1,000,000
    const weight = (volume * Density) / 1000000;
    
    res.json({
      success: true,
      data: {
        Thickness: parseFloat(Thickness),
        Width: parseFloat(Width),
        Length: parseFloat(Length),
        Density: parseFloat(Density),
        VolumeMM3: parseFloat(volume.toFixed(3)),
        WeightInKG: parseFloat(weight.toFixed(3)),
        FormulaDetails: {
          VolumeCalculation: `${Thickness} × ${Width} × ${Length} = ${volume.toFixed(2)} mm³`,
          WeightCalculation: `(${volume.toFixed(2)} × ${Density}) / 1,000,000 = ${weight.toFixed(3)} Kg`
        }
      }
    });
  } catch (error) {
    console.error('Calculate weight error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete dimension weight (HARD DELETE)
// @route   DELETE /api/dimension-weights/:id
// @access  Private
const deleteDimensionWeight = async (req, res) => {
  try {
    const dimensionWeight = await DimensionWeight.findById(req.params.id);
    
    if (!dimensionWeight) {
      return res.status(404).json({ 
        success: false, 
        message: 'Dimension weight not found' 
      });
    }
    
    // HARD DELETE
    await DimensionWeight.findByIdAndDelete(req.params.id);
    
    res.json({ 
      success: true, 
      message: 'Dimension weight deleted successfully' 
    });
  } catch (error) {
    console.error('Delete dimension weight error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Dimension weight not found' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

module.exports = {
  getDimensionWeights,
  getDimensionWeight,
  createDimensionWeight,
  updateDimensionWeight,
  deleteDimensionWeight,
  calculateWeight
};