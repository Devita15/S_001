const PieceRateMaster = require('../../models/HR/PieceRateMaster');
const mongoose = require('mongoose');

class PieceRateMasterController {
  
 /**
 * Create a new piece rate entry
 * POST /api/piece-rate-master
 */
async createPieceRate(req, res) {
  try {
    const {
      productType,
      operation,
      ratePerUnit,
      uom,
      skillLevel,
      departmentId,
      effectiveFrom,
      effectiveTo,
      isActive
    } = req.body;

    // Validate required fields
    const requiredFields = ['productType', 'operation', 'ratePerUnit', 'effectiveFrom'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Validate ratePerUnit is positive
    if (ratePerUnit < 0) {
      return res.status(400).json({
        success: false,
        message: 'Rate per unit must be a positive number'
      });
    }

    // Get today's date at midnight for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Validate effectiveFrom date
    const fromDate = new Date(effectiveFrom);
    if (isNaN(fromDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid effectiveFrom date'
      });
    }

    // Set time to midnight for accurate date comparison
    fromDate.setHours(0, 0, 0, 0);

    // Check if effectiveFrom is in the past
    if (fromDate < today) {
      return res.status(400).json({
        success: false,
        message: 'effectiveFrom date cannot be in the past'
      });
    }

    // Validate effectiveTo if provided
    if (effectiveTo) {
      const toDate = new Date(effectiveTo);
      if (isNaN(toDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid effectiveTo date'
        });
      }

      // Set time to midnight for accurate date comparison
      toDate.setHours(0, 0, 0, 0);

      // Check if effectiveTo is in the past
      if (toDate < today) {
        return res.status(400).json({
          success: false,
          message: 'effectiveTo date cannot be in the past'
        });
      }

      // Check if effectiveTo is before effectiveFrom
      if (toDate < fromDate) {
        return res.status(400).json({
          success: false,
          message: 'effectiveTo date cannot be before effectiveFrom date'
        });
      }

      // Optional: Check if effectiveTo is at least 1 day after effectiveFrom
      const oneDayAfterFrom = new Date(fromDate);
      oneDayAfterFrom.setDate(oneDayAfterFrom.getDate() + 1);
      
      if (toDate < oneDayAfterFrom && toDate.getTime() !== fromDate.getTime()) {
        return res.status(400).json({
          success: false,
          message: 'effectiveTo date must be at least 1 day after effectiveFrom date'
        });
      }
    }

    // Check for duplicate active rate
    const existingRate = await PieceRateMaster.findOne({
      productType: productType.trim(),
      operation: operation.trim(),
      $or: [
        { effectiveTo: { $gte: fromDate } },
        { effectiveTo: null }
      ],
      isActive: true
    });

    if (existingRate) {
      return res.status(400).json({
        success: false,
        message: 'An active rate already exists for this product and operation during this period'
      });
    }

    // Create piece rate record
    const pieceRateData = {
      productType: productType.trim(),
      operation: operation.trim(),
      ratePerUnit: parseFloat(ratePerUnit),
      uom: uom || 'piece',
      skillLevel,
      departmentId: departmentId || null,
      effectiveFrom: fromDate,
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user._id
    };

    const pieceRate = new PieceRateMaster(pieceRateData);
    await pieceRate.save();

    // Populate references
    const populatedRate = await PieceRateMaster.findById(pieceRate._id)
      .populate('departmentId', 'DepartmentName')
      .populate('createdBy', 'FirstName LastName Email');

    res.status(201).json({
      success: true,
      message: 'Piece rate created successfully',
      data: populatedRate
    });

  } catch (error) {
    console.error('Create piece rate error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: messages
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate entry: A rate with this product, operation and effective date already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
}

  /**
   * Get all piece rates with filters
   * GET /api/piece-rate-master
   */
  async getAllPieceRates(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        productType,
        operation,
        departmentId,
        skillLevel,
        isActive,
        effectiveDate,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const query = {};

      // Apply filters
      if (productType) {
        query.productType = { $regex: productType, $options: 'i' };
      }

      if (operation) {
        query.operation = { $regex: operation, $options: 'i' };
      }

      if (departmentId && mongoose.Types.ObjectId.isValid(departmentId)) {
        query.departmentId = departmentId;
      }

      if (skillLevel) {
        query.skillLevel = skillLevel;
      }

      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }

      // Filter by effective date
      if (effectiveDate) {
        const date = new Date(effectiveDate);
        query.$or = [
          { effectiveFrom: { $lte: date }, effectiveTo: { $gte: date } },
          { effectiveFrom: { $lte: date }, effectiveTo: null }
        ];
      }

      // Search across multiple fields
      if (search) {
        query.$or = [
          { productType: { $regex: search, $options: 'i' } },
          { operation: { $regex: search, $options: 'i' } }
        ];
      }

      const pageNumber = parseInt(page);
      const pageSize = parseInt(limit);
      const skip = (pageNumber - 1) * pageSize;

      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const [pieceRates, totalCount] = await Promise.all([
        PieceRateMaster.find(query)
          .populate('departmentId', 'DepartmentName')
          .populate('createdBy', 'FirstName LastName Email')
          .populate('updatedBy', 'FirstName LastName Email')
          .sort(sort)
          .skip(skip)
          .limit(pageSize)
          .lean(),
        PieceRateMaster.countDocuments(query)
      ]);

      res.status(200).json({
        success: true,
        count: pieceRates.length,
        total: totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        currentPage: pageNumber,
        data: pieceRates
      });

    } catch (error) {
      console.error('Get all piece rates error:', error);
      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }

  /**
   * Get piece rate by ID
   * GET /api/piece-rate-master/:id
   */
  async getPieceRateById(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid piece rate ID format'
        });
      }

      const pieceRate = await PieceRateMaster.findById(id)
        .populate('departmentId', 'DepartmentName')
        .populate('createdBy', 'FirstName LastName Email')
        .populate('updatedBy', 'FirstName LastName Email');

      if (!pieceRate) {
        return res.status(404).json({
          success: false,
          message: 'Piece rate not found'
        });
      }

      res.status(200).json({
        success: true,
        data: pieceRate
      });

    } catch (error) {
      console.error('Get piece rate by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }

  /**
   * Update piece rate
   * PUT /api/piece-rate-master/:id
   */
  async updatePieceRate(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid piece rate ID format'
        });
      }

      const pieceRate = await PieceRateMaster.findById(id);

      if (!pieceRate) {
        return res.status(404).json({
          success: false,
          message: 'Piece rate not found'
        });
      }

      // Validate ratePerUnit if provided
      if (updateData.ratePerUnit !== undefined) {
        if (updateData.ratePerUnit < 0) {
          return res.status(400).json({
            success: false,
            message: 'Rate per unit must be a positive number'
          });
        }
        updateData.ratePerUnit = parseFloat(updateData.ratePerUnit);
      }

      // Validate dates if provided
      if (updateData.effectiveFrom) {
        const fromDate = new Date(updateData.effectiveFrom);
        if (isNaN(fromDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid effectiveFrom date'
          });
        }
        updateData.effectiveFrom = fromDate;
      }

      if (updateData.effectiveTo) {
        const toDate = new Date(updateData.effectiveTo);
        if (isNaN(toDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid effectiveTo date'
          });
        }
        updateData.effectiveTo = toDate;

        // Check date logic
        const fromDate = updateData.effectiveFrom || pieceRate.effectiveFrom;
        if (updateData.effectiveTo < fromDate) {
          return res.status(400).json({
            success: false,
            message: 'effectiveTo date cannot be before effectiveFrom date'
          });
        }
      }

      // Check for duplicate if product/operation changed
      if (updateData.productType || updateData.operation || updateData.effectiveFrom) {
        const productType = updateData.productType || pieceRate.productType;
        const operation = updateData.operation || pieceRate.operation;
        const effectiveFrom = updateData.effectiveFrom || pieceRate.effectiveFrom;

        const existingRate = await PieceRateMaster.findOne({
          _id: { $ne: id },
          productType: productType.trim(),
          operation: operation.trim(),
          $or: [
            { effectiveTo: { $gte: effectiveFrom } },
            { effectiveTo: null }
          ],
          isActive: true
        });

        if (existingRate) {
          return res.status(400).json({
            success: false,
            message: 'Another active rate already exists for this product and operation during this period'
          });
        }
      }

      // Update fields
      const allowedFields = [
        'productType', 'operation', 'ratePerUnit', 'uom',
        'skillLevel', 'departmentId', 'effectiveFrom', 'effectiveTo', 'isActive'
      ];

      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          if (field === 'productType' || field === 'operation') {
            pieceRate[field] = updateData[field].trim();
          } else {
            pieceRate[field] = updateData[field];
          }
        }
      });

      pieceRate.updatedBy = req.user._id;
      await pieceRate.save();

      const updatedRate = await PieceRateMaster.findById(id)
        .populate('departmentId', 'DepartmentName')
        .populate('createdBy', 'FirstName LastName Email')
        .populate('updatedBy', 'FirstName LastName Email');

      res.status(200).json({
        success: true,
        message: 'Piece rate updated successfully',
        data: updatedRate
      });

    } catch (error) {
      console.error('Update piece rate error:', error);

      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).json({
          success: false,
          message: 'Validation Error',
          errors: messages
        });
      }

      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Duplicate entry: A rate with this product, operation and effective date already exists'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }

  /**
   * Delete piece rate (soft delete by setting isActive to false)
   * DELETE /api/piece-rate-master/:id
   */
  async deletePieceRate(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid piece rate ID format'
        });
      }

      const pieceRate = await PieceRateMaster.findById(id);

      if (!pieceRate) {
        return res.status(404).json({
          success: false,
          message: 'Piece rate not found'
        });
      }

      // Check if this rate is being used in production records
      const Production = require('../../models/HR/Production');
      const isUsed = await Production.exists({
        rateMasterId: id,
        Status: { $in: ['Approved', 'Verified'] }
      });

      if (isUsed) {
        // If used, just deactivate instead of deleting
        pieceRate.isActive = false;
        pieceRate.updatedBy = req.user._id;
        await pieceRate.save();

        return res.status(200).json({
          success: true,
          message: 'Piece rate deactivated as it is being used in production records'
        });
      }

      // If not used, hard delete
      await pieceRate.deleteOne();

      res.status(200).json({
        success: true,
        message: 'Piece rate deleted successfully'
      });

    } catch (error) {
      console.error('Delete piece rate error:', error);
      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }

  /**
   * Get active piece rates (for dropdowns)
   * GET /api/piece-rate-master/active
   */
  async getActiveRates(req, res) {
    try {
      const { departmentId, effectiveDate = new Date() } = req.query;

      const query = {
        isActive: true,
        $or: [
          { effectiveTo: { $gte: new Date(effectiveDate) } },
          { effectiveTo: null }
        ],
        effectiveFrom: { $lte: new Date(effectiveDate) }
      };

      if (departmentId && mongoose.Types.ObjectId.isValid(departmentId)) {
        query.departmentId = departmentId;
      }

      const rates = await PieceRateMaster.find(query)
        .populate('departmentId', 'DepartmentName')
        .select('productType operation ratePerUnit uom skillLevel departmentId')
        .sort({ productType: 1, operation: 1 });

      // Group by product type for easier frontend use
      const groupedRates = rates.reduce((acc, rate) => {
        if (!acc[rate.productType]) {
          acc[rate.productType] = [];
        }
        acc[rate.productType].push({
          id: rate._id,
          operation: rate.operation,
          ratePerUnit: rate.ratePerUnit,
          uom: rate.uom,
          skillLevel: rate.skillLevel,
          departmentId: rate.departmentId?._id,
          departmentName: rate.departmentId?.DepartmentName
        });
        return acc;
      }, {});

      res.status(200).json({
        success: true,
        count: rates.length,
        data: {
          list: rates,
          grouped: groupedRates
        }
      });

    } catch (error) {
      console.error('Get active rates error:', error);
      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }

}

module.exports = new PieceRateMasterController();