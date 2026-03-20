const Vehicle = require('../models/vehicleInwardModel');
const Branch = require('../models/Branch');
const AppError = require('../utils/appError');
const logger = require('../config/logger');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Color = require('../models/Color');
const { stringify } = require('csv-stringify');
const Model = require('../models/ModelModel');
const _ = require('lodash');
const excel = require('excel4node');
const ExcelJS = require('exceljs');
const { generateVehicleQRCode } = require('../utils/qrGenerator');
const VehicleWaitingList = require('../models/vehicleWaitingListModel');
const vehicleFreezeService = require('../services/vehicleFreezeService')
const { 
  checkAndAssignFromWaitingList,
} = require('../utils/vehicleStatusHelper');
const populateOptions = [
  {
    path: 'unloadLocation',
    model: 'Branch',
    select: 'name address city state pincode phone email gst_number is_active'
  },
  {
    path: 'subdealerLocation',
    model: 'Subdealer',
    select: 'name location'
  },
  {
    path: 'addedBy',
    model: 'User',
    select: 'name email'
  }
];

//exports.createVehicle = async (req, res, next) => {
//   try {
//     const {
//       chassisNumber,
//       unloadLocation,
//       model: modelId,
//       color: colorInput, // expecting { id, name }
//       batteryNumber,
//       keyNumber,
//       motorNumber,
//       chargerNumber,
//       engineNumber,
//       hasDamage = false,
//       damages = []
//     } = req.body;

//     // Validate IDs
//     if (!mongoose.Types.ObjectId.isValid(unloadLocation)) {
//       return next(new AppError('Invalid branch ID format', 400));
//     }

//     if (!mongoose.Types.ObjectId.isValid(modelId)) {
//       return next(new AppError('Invalid model ID format', 400));
//     }

//     if (!mongoose.Types.ObjectId.isValid(colorInput?.id)) {
//       return next(new AppError('Invalid color ID format', 400));
//     }

//     // Fetch referenced model
//     const model = await Model.findById(modelId).select('model_name type');
//     if (!model) return next(new AppError('Model not found', 404));

//     // Fetch color to confirm and get its name
//     const colorDoc = await Color.findById(colorInput.id).select('name');
//     if (!colorDoc) return next(new AppError('Color not found', 404));

//     // Check chassis duplication
//     const existing = await Vehicle.findOne({ chassisNumber: chassisNumber.toUpperCase() });
//     if (existing) {
//       const branch = await Branch.findById(existing.unloadLocation).select('name');
//       return next(new AppError(
//         `Duplicate Entry! Chassis number already exists in ${branch?.name || 'unknown branch'}`,
//         409
//       ));
//     }

//     // Validate damages
//     if (hasDamage && damages.length > 0) {
//       for (let damage of damages) {
//         if (
//           typeof damage.description !== 'string' ||
//           damage.description.trim().length === 0 ||
//           !Array.isArray(damage.images) ||
//           damage.images.length === 0
//         ) {
//           return next(new AppError('Each damage must include a description and at least one image', 400));
//         }
//       }
//     }

//     // Create payload with proper color structure
//     const vehiclePayload = {
//       model: modelId,
//       modelName: model.model_name,
//       unloadLocation,
//       type: model.type,
//       colors: [colorInput.id],
//       color: {  // This will store both ID and name
//         id: colorInput.id,
//         name: colorDoc.name
//       },
//       chassisNumber: chassisNumber.toUpperCase(),
//       batteryNumber: batteryNumber?.toUpperCase(),
//       keyNumber: keyNumber?.toUpperCase(),
//       motorNumber: motorNumber?.toUpperCase(),
//       chargerNumber: chargerNumber?.toUpperCase(),
//       engineNumber: engineNumber?.toUpperCase(),
//       hasDamage,
//       damages,
//       addedBy: req.user.id,
//       status: 'not_approved' // Default status
//     };

//     const newVehicle = await Vehicle.create(vehiclePayload);

//     // Format response
//     const response = {
//       ...newVehicle.toObject(),
//       color: {
//         id: colorInput.id,
//         name: colorDoc.name
//       }
//     };

//     // Remove `colors` array from response to avoid duplication
//     delete response.colors;

//     res.status(201).json({
//       status: 'success',
//       data: { vehicle: response }
//     });

//   } catch (err) {
//     console.error('Vehicle creation error:', err);
//     next(new AppError(err.message || 'Internal server error', 500));
//   }
// };


///////{*********************** Harshali Changes *******************}
/**
 * @route   GET /api/vehicles/chassis/:chassisNumber/details
 * @desc    Get complete vehicle details by chassis number including booking, transfer history, and stock movements
 * @access  Private
 */
/**
 * @route   GET /api/vehicles/chassis/:chassisNumber/details
 * @desc    Get specific vehicle details by chassis number
 * @access  Private
 */
exports.getVehicleDetailsByChassisNumber = async (req, res, next) => {
  try {
    const { chassisNumber } = req.params;

    if (!chassisNumber) {
      return next(new AppError('Chassis number is required', 400));
    }

    console.log(`[GET-VEHICLE-DETAILS] Fetching details for chassis: ${chassisNumber}`);

    // 1. Find the vehicle by chassis number with specific population
    const vehicle = await Vehicle.findOne({ 
      chassisNumber: chassisNumber.toUpperCase() 
    })
    .populate([
      {
        path: 'model',
        select: 'model_name type',
        model: 'Model'
      },
      {
        path: 'color.id',
        select: 'name',
        model: 'Color'
      },
      {
        path: 'unloadLocation',
        select: 'name address city state',
        model: 'Branch'
      },
      {
        path: 'allocatedBooking',
        select: 'bookingNumber',
        model: 'Booking'
      },
      {
        path: 'booking',
        select: 'bookingNumber',
        model: 'Booking'
      }
    ])
    .select('chassisNumber keyNumber engineNumber batteryNumber motorNumber chargerNumber model color unloadLocation subdealerLocation locationType status allocatedBooking booking customerName customerPhone customerAadhaar');

    if (!vehicle) {
      return next(new AppError(`No vehicle found with chassis number: ${chassisNumber}`, 404));
    }

    console.log(`[GET-VEHICLE-DETAILS] Found vehicle: ${vehicle._id}`);

    // 2. Get booking information
    let bookingNumber = null;
    
    // Check multiple sources for booking number
    if (vehicle.allocatedBooking && vehicle.allocatedBooking.bookingNumber) {
      bookingNumber = vehicle.allocatedBooking.bookingNumber;
    } else if (vehicle.booking && vehicle.booking.bookingNumber) {
      bookingNumber = vehicle.booking.bookingNumber;
    }

    // 3. Get current location information
    let currentLocation = null;
    
    if (vehicle.locationType === 'branch' && vehicle.unloadLocation) {
      const branch = vehicle.unloadLocation;
      currentLocation = {
        type: 'branch',
        locationId: branch._id.toString(),
        locationName: branch.name || '',
        address: `${branch.address || ''}, ${branch.city || ''}, ${branch.state || ''}`.trim(),
        branch: null // As specified in response
      };
    } else if (vehicle.locationType === 'subdealer' && vehicle.subdealerLocation) {
      // If subdealer location, you might need to populate it first
      // For now, we'll handle basic case
      const subdealer = vehicle.subdealerLocation;
      currentLocation = {
        type: 'subdealer',
        locationId: subdealer._id ? subdealer._id.toString() : subdealer.toString(),
        locationName: 'Subdealer Location',
        address: '',
        branch: null
      };
    }

    // 4. Get model details
    let modelDetails = null;
    if (vehicle.model) {
      modelDetails = {
        id: vehicle.model._id.toString(),
        name: vehicle.model.model_name || '',
        type: vehicle.model.type || vehicle.type || 'UNKNOWN'
      };
    }

    // 5. Get color details
    let colorDetails = null;
    if (vehicle.color && vehicle.color.id) {
      // Handle different color data structures
      if (typeof vehicle.color.id === 'object') {
        // Color is populated
        colorDetails = {
          id: vehicle.color.id._id.toString(),
          name: vehicle.color.id.name || ''
        };
      } else if (vehicle.color.id && vehicle.color.name) {
        // Color has id and name separately
        colorDetails = {
          id: vehicle.color.id.toString(),
          name: vehicle.color.name || ''
        };
      }
    }

    // 6. Prepare the response exactly as specified
    const response = {
      chassisNumber: vehicle.chassisNumber || '',
      keyNumber: vehicle.keyNumber || '',
      engineNumber: vehicle.engineNumber || '',
      batteryNumber: vehicle.batteryNumber || '',
      model: modelDetails ? {
        id: modelDetails.id,
        name: modelDetails.name,
        type: modelDetails.type
      } : null,
      color: colorDetails ? {
        id: colorDetails.id,
        name: colorDetails.name
      } : null,
      currentLocation: currentLocation,
      status: {
        current: vehicle.status || '',
        description: getStatusDescription(vehicle.status)
      },
      bookingInfo: bookingNumber ? {
        bookingNumber: bookingNumber
      } : null
    };

    // Remove null values for cleaner response
    Object.keys(response).forEach(key => {
      if (response[key] === null || response[key] === undefined) {
        delete response[key];
      }
    });

    console.log(`[GET-VEHICLE-DETAILS] Successfully fetched details for ${chassisNumber}`);

    res.status(200).json({
      status: 'success',
      data: response
    });

  } catch (err) {
    console.error(`[GET-VEHICLE-DETAILS] Error: ${err.message}`);
    console.error(err.stack);
    
    logger.error(`Error fetching vehicle details by chassis number: ${err.message}`, {
      error: err.stack,
      chassisNumber: req.params.chassisNumber,
      userId: req.user?.id
    });
    
    next(new AppError('Failed to fetch vehicle details', 500));
  }
};
// Helper function to get status description
function getStatusDescription(status) {
  const statusMap = {
    'not_approved': 'Pending Approval',
    'in_stock': 'Available for Sale (Open for Sale)',
    'open_for_sale': 'Available for Sale',
    'booked': 'Booked by Customer',
    'blocked': 'Temporarily Blocked',
    'stock_transfer': 'In Stock Transfer',
    'in_transit': 'In Transit',
    'sold': 'Sold',
    'service': 'In Service',
    'damaged': 'Damaged',
    'hold': 'On Hold',
    'FROZEN': 'Frozen/Unavailable'
  };
  
  return statusMap[status] || status || 'Unknown';
}
// Helper function to get status description
function getStatusDescription(status) {
  const statusMap = {
    'not_approved': 'Pending Approval',
    'in_stock': 'Available for Sale (Open for Sale)',
    'open_for_sale': 'Available for Sale',
    'booked': 'Booked by Customer',
    'blocked': 'Temporarily Blocked',
    'stock_transfer': 'In Stock Transfer',
    'in_transit': 'In Transit',
    'sold': 'Sold',
    'service': 'In Service',
    'damaged': 'Damaged',
    'hold': 'On Hold',
    'FROZEN': 'Frozen/Unavailable'
  };
  
  return statusMap[status] || status;
}
exports.createVehicle = async (req, res, next) => {
  try {
    const {
      chassisNumber,
      unloadLocation,
      model: modelId,
      color: colorInput,
      batteryNumber,
      keyNumber,
      motorNumber,
      chargerNumber,
      engineNumber,
      hasDamage = false,
      damages = []
    } = req.body;

    console.log('Received request body:', req.body); // Debug log

    // Basic validation
    if (!chassisNumber) return next(new AppError('Chassis number is required', 400));
    if (!unloadLocation) return next(new AppError('Unload location is required', 400));
    if (!modelId) return next(new AppError('Model is required', 400));
    if (!colorInput?.id) return next(new AppError('Color is required', 400));

    // Fetch referenced model - GET THE TYPE FROM MODEL
    const model = await Model.findById(modelId).select('model_name type');
    if (!model) return next(new AppError('Model not found', 404));

    // Determine vehicle type from model
    let vehicleType = 'ICE'; // Default to ICE
    if (model.type) {
      // Convert model type to EV/ICE
      if (model.type.toUpperCase().includes('EV') || model.type.toUpperCase().includes('ELECTRIC')) {
        vehicleType = 'EV';
      } else {
        vehicleType = 'ICE';
      }
    }

    // Fetch color to confirm and get its name
    const colorDoc = await Color.findById(colorInput.id).select('name');
    if (!colorDoc) return next(new AppError('Color not found', 404));

    // Check chassis duplication
    const existing = await Vehicle.findOne({ chassisNumber: chassisNumber.toUpperCase() });
    if (existing) {
      const branch = await Branch.findById(existing.unloadLocation).select('name');
      return next(new AppError(
        `Duplicate Entry! Chassis number already exists in ${branch?.name || 'unknown branch'}`,
        409
      ));
    }

    // Validate damages
    if (hasDamage && damages.length > 0) {
      for (let damage of damages) {
        if (
          typeof damage.description !== 'string' ||
          damage.description.trim().length === 0 ||
          !Array.isArray(damage.images) ||
          damage.images.length === 0
        ) {
          return next(new AppError('Each damage must include a description and at least one image', 400));
        }
      }
    }

    // Prepare vehicle payload - GET TYPE FROM MODEL
    const vehiclePayload = {
      model: modelId,
      modelName: model.model_name,
      unloadLocation,
      type: vehicleType, // Get from model, not from request
      colors: [colorInput.id],
      color: { 
        id: colorInput.id,
        name: colorDoc.name
      },
      chassisNumber: chassisNumber.toUpperCase(),
      batteryNumber: batteryNumber?.toUpperCase(),
      keyNumber: keyNumber?.toUpperCase(),
      motorNumber: motorNumber?.toUpperCase(),
      chargerNumber: chargerNumber?.toUpperCase(),
      engineNumber: engineNumber?.toUpperCase(),
      hasDamage,
      damages,
      addedBy: req.user.id,
      status: 'not_approved',
    };

    // Clean up empty strings - IMPORTANT: Don't delete required fields
    // Only delete optional fields that are empty
    const optionalFields = ['batteryNumber', 'keyNumber', 'motorNumber', 'chargerNumber', 'engineNumber'];
    optionalFields.forEach(field => {
      if (vehiclePayload[field] === '' || vehiclePayload[field] === null || vehiclePayload[field] === undefined) {
        delete vehiclePayload[field];
      }
    });

    console.log('Vehicle payload being saved:', JSON.stringify(vehiclePayload, null, 2)); // Debug log

    // Create vehicle - NO validateBeforeSave option needed
    const newVehicle = await Vehicle.create(vehiclePayload);

    const qrCodePath = await generateVehicleQRCode(newVehicle);
   
    newVehicle.qrCode = qrCodePath;
    await newVehicle.save();

    // Format response
    const response = {
      ...newVehicle.toObject(),
      color: {
        id: colorInput.id,
        name: colorDoc.name
      }
    };

    // Remove `colors` array from response to avoid duplication
    delete response.colors;

    res.status(201).json({
      status: 'success',
      data: { 
        vehicle: response, 
        qrCodeUrl: `${req.protocol}://${req.get('host')}${qrCodePath}` 
      }
    });

  } catch (err) {
    console.error('Vehicle creation error details:', err);
    
    // Handle specific error cases
    if (err.name === 'ValidationError') {
      // Extract validation messages
      const messages = Object.values(err.errors).map(val => val.message);
      console.log('Validation errors:', messages);
      return next(new AppError(`Validation failed: ${messages.join(', ')}`, 400));
    }
    
    if (err.code === 11000) {
      if (err.keyValue?.chassisNumber) {
        return next(new AppError(`Chassis number ${err.keyValue.chassisNumber} already exists`, 409));
      }
      if (err.keyValue?.qrCode) {
        return next(new AppError('QR Code conflict, please try again', 409));
      }
    }
    
    next(new AppError(err.message || 'Internal server error', 500));
  }
};
// exports.approveVehicles = async (req, res, next) => {
//   try {
//     const { vehicleIds } = req.body;

//     if (!vehicleIds || !Array.isArray(vehicleIds) || vehicleIds.length === 0) {
//       return next(new AppError('Please provide an array of vehicle IDs to approve', 400));
//     }

//     // Validate all IDs
//     const invalidIds = vehicleIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
//     if (invalidIds.length > 0) {
//       return next(new AppError(`Invalid vehicle IDs: ${invalidIds.join(', ')}`, 400));
//     }

//     // Update all vehicles to in_stock status
//     const result = await Vehicle.updateMany(
//       { 
//         _id: { $in: vehicleIds },
//         status: 'not_approved' // Only approve vehicles that are not already approved
//       },
//       { 
//         $set: { 
//           status: 'in_stock',
//           lastUpdatedBy: req.user.id 
//         } 
//       }
//     );

//     if (result.modifiedCount === 0) {
//       return next(new AppError('No vehicles were approved (either already approved or not found)', 404));
//     }

//     res.status(200).json({
//       status: 'success',
//       data: {
//         approvedCount: result.modifiedCount,
//         message: `${result.modifiedCount} vehicle(s) approved successfully`
//       }
//     });

//   } catch (err) {
//     logger.error(`Error approving vehicles: ${err.message}`);
//     next(new AppError('Server Error', 500));
//   }
// };


////{*********************************** HARSHALI CHANGES **********************}

exports.approveVehicles = async (req, res, next) => {
  try {
    const { vehicleIds } = req.body;

    if (!vehicleIds || !Array.isArray(vehicleIds) || vehicleIds.length === 0) {
      return next(new AppError('Please provide an array of vehicle IDs to approve', 400));
    }
    
    const invalidIds = vehicleIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return next(new AppError(`Invalid vehicle IDs: ${invalidIds.join(', ')}`, 400));
    }

    const vehiclesToApprove = await Vehicle.find({
      _id: { $in: vehicleIds },
      status: 'not_approved'
    });

    if (vehiclesToApprove.length === 0) {
      return next(new AppError('No vehicles were found for approval (either already approved or not found)', 404));
    }

    const updatePromises = vehicleIds.map(async (vehicleId) => {
      try {
        const vehicle = await Vehicle.findById(vehicleId);
        if (!vehicle || vehicle.status !== 'not_approved') {
          return null;
        }

        // Store old status
        const oldStatus = vehicle.status;
        
        // Approve vehicle
        vehicle.status = 'in_stock';
        vehicle.lastUpdatedBy = req.user.id;
        await vehicle.save();

        console.log(`[APPROVE-VEHICLE] Vehicle ${vehicle.chassisNumber} approved: ${oldStatus} -> in_stock`);

        // ===== CHECK WAITING LIST FOR THIS VEHICLE =====
        console.log(`[APPROVE-VEHICLE] Checking waiting list for vehicle: ${vehicle.chassisNumber}`);
        
        // Use the imported function
        const waitingListResult = await checkAndAssignFromWaitingList(vehicle, req.user.id);
        
        let autoAllocated = false;
        let waitingListInfo = null;
        let qrCodePath = null;

        // If vehicle was auto-allocated from waiting list
        if (waitingListResult.success) {
          console.log(`[APPROVE-VEHICLE] Auto-allocated to: ${waitingListResult.waitingEntry.customerName}`);
          autoAllocated = true;
          
          waitingListInfo = {
            waitingListEntryId: waitingListResult.waitingEntry?._id,
            customerName: waitingListResult.waitingEntry.customerName,
            bookingId: waitingListResult.waitingEntry.bookingId,
            allocationStatus: waitingListResult.status,
            allocationDate: new Date()
          };

          // Generate QR code for the auto-allocated vehicle
          try {
            qrCodePath = await generateVehicleQRCode(vehicle);
            vehicle.qrCode = qrCodePath;
            await vehicle.save();
            console.log(`[APPROVE-VEHICLE] QR code generated for auto-allocated vehicle`);
          } catch (qrError) {
            logger.error(`QR error for ${vehicle._id}: ${qrError.message}`);
          }
          
          // Create audit log for auto-allocation (with valid enum value)
          try {
            await mongoose.model('AuditLog').create({
              action: 'VEHICLE_ALLOCATED', // Changed to valid enum value
              entity: 'Vehicle',
              entityId: vehicle._id,
              user: req.user.id,
              ip: req.ip,
              status: 'SUCCESS',
              metadata: {
                vehicleChassis: vehicle.chassisNumber,
                oldStatus: oldStatus,
                newStatus: vehicle.status,
                waitingListEntryId: waitingListResult.waitingEntry._id,
                customerName: waitingListResult.waitingEntry.customerName,
                bookingId: waitingListResult.waitingEntry.bookingId,
                allocationType: 'AUTO_FROM_WAITING_LIST'
              }
            });
          } catch (auditError) {
            console.error(`[APPROVE-VEHICLE] Audit log creation failed:`, auditError.message);
          }
        } else {
          // Vehicle not auto-allocated, just generate QR code
          console.log(`[APPROVE-VEHICLE] No waiting list match for ${vehicle.chassisNumber}`);
          
          try {
            qrCodePath = await generateVehicleQRCode(vehicle);
            vehicle.qrCode = qrCodePath;
            await vehicle.save();
            console.log(`[APPROVE-VEHICLE] QR code generated for approved vehicle`);
          } catch (qrError) {
            logger.error(`QR error for ${vehicle._id}: ${qrError.message}`);
          }
          
          // Create audit log for approval only
          try {
            await mongoose.model('AuditLog').create({
              action: 'VEHICLE_CREATED', // Changed to valid enum value
              entity: 'Vehicle',
              entityId: vehicle._id,
              user: req.user.id,
              ip: req.ip,
              status: 'SUCCESS',
              metadata: {
                vehicleChassis: vehicle.chassisNumber,
                oldStatus: oldStatus,
                newStatus: vehicle.status,
                approvedBy: req.user.id
              }
            });
          } catch (auditError) {
            console.error(`[APPROVE-VEHICLE] Audit log creation failed:`, auditError.message);
          }
        }

        // Update FIFO rank and eligibility
        try {
          await vehicle.updateFifoRankAndEligibility();
          console.log(`[APPROVE-VEHICLE] FIFO rank updated for ${vehicle.chassisNumber}: ${vehicle.fifoRank}`);
        } catch (fifoError) {
          console.warn(`[APPROVE-VEHICLE] FIFO update failed: ${fifoError.message}`);
        }

        return {
          vehicleId: vehicle._id,
          chassisNumber: vehicle.chassisNumber,
          modelName: vehicle.modelName,
          color: vehicle.color.name,
          location: vehicle.unloadLocation,
          oldStatus: oldStatus,
          newStatus: vehicle.status,
          autoAllocated: autoAllocated,
          waitingListInfo: waitingListInfo,
          qrCodeGenerated: !!qrCodePath,
          qrCodePath: qrCodePath,
          fifoRank: vehicle.fifoRank,
          requiresGmApproval: vehicle.requiresGmApproval,
          success: true
        };

      } catch (error) {
        console.error(`[APPROVE-VEHICLE] Error approving vehicle ${vehicleId}:`, error.message);
        console.error(error.stack);
        
        // Create error audit log with valid enum value
        try {
          await mongoose.model('AuditLog').create({
            action: 'VEHICLE_UPDATE', // Changed to valid enum value
            entity: 'Vehicle',
            entityId: vehicleId,
            user: req.user.id,
            ip: req.ip,
            status: 'FAILED',
            error: error.message,
            metadata: {
              vehicleId: vehicleId,
              approvedBy: req.user.id
            }
          });
        } catch (auditError) {
          console.error(`[APPROVE-VEHICLE] Error audit log creation failed:`, auditError.message);
        }
        
        return {
          vehicleId,
          error: error.message,
          success: false
        };
      }
    });

    const results = await Promise.all(updatePromises);
    
    // Filter out null results and separate successful/failed
    const successfulApprovals = results.filter(r => r && r.success);
    const failedApprovals = results.filter(r => r && !r.success);
    const skippedVehicles = results.filter(r => r === null);
    
    // Count auto-allocations
    const autoAllocatedVehicles = successfulApprovals.filter(r => r.autoAllocated);
    
    // Get vehicle details for response
    const approvedVehiclesDetails = await Vehicle.find({
      _id: { $in: successfulApprovals.map(r => r.vehicleId) }
    })
    .populate('unloadLocation', 'name')
    .populate('model', 'model_name')
    .populate('color.id', 'name')
    .select('chassisNumber modelName color status unloadLocation qrCode fifoRank');

    // Update response with full vehicle details
    const enhancedResults = successfulApprovals.map(result => {
      const vehicleDetail = approvedVehiclesDetails.find(v => v._id.toString() === result.vehicleId.toString());
      return {
        ...result,
        vehicleDetails: vehicleDetail ? {
          chassisNumber: vehicleDetail.chassisNumber,
          model: vehicleDetail.model?.model_name || vehicleDetail.modelName,
          color: vehicleDetail.color?.name || 'Unknown',
          location: vehicleDetail.unloadLocation?.name || 'Unknown',
          status: vehicleDetail.status,
          qrCodeUrl: vehicleDetail.qrCode ? 
            `${req.protocol}://${req.get('host')}${vehicleDetail.qrCode}` : null,
          fifoRank: vehicleDetail.fifoRank,
          requiresGmApproval: vehicleDetail.requiresGmApproval
        } : null
      };
    });

    console.log(`[APPROVE-VEHICLE] Approval summary:`, {
      totalRequested: vehicleIds.length,
      successful: successfulApprovals.length,
      failed: failedApprovals.length,
      skipped: skippedVehicles.length,
      autoAllocated: autoAllocatedVehicles.length,
      remainingInStock: successfulApprovals.length - autoAllocatedVehicles.length
    });

    res.status(200).json({
      status: 'success',
      data: {
        approvalSummary: {
          totalRequested: vehicleIds.length,
          successfullyApproved: successfulApprovals.length,
          failedApprovals: failedApprovals.length,
          skippedVehicles: skippedVehicles.length,
          autoAllocatedToWaitingList: autoAllocatedVehicles.length,
          remainingInStock: successfulApprovals.length - autoAllocatedVehicles.length
        },
        approvedVehicles: enhancedResults,
        failedApprovals: failedApprovals.map(f => ({
          vehicleId: f.vehicleId,
          error: f.error
        })),
        autoAllocatedVehicles: autoAllocatedVehicles.map(a => ({
          vehicleId: a.vehicleId,
          chassisNumber: a.chassisNumber,
          customerName: a.waitingListInfo?.customerName,
          bookingId: a.waitingListInfo?.bookingId,
          allocationStatus: a.waitingListInfo?.allocationStatus
        })),
        message: `${successfulApprovals.length} vehicle(s) approved successfully. ${autoAllocatedVehicles.length} vehicle(s) auto-allocated to waiting customers.`
      }
    });

  } catch (err) {
    console.error(`[APPROVE-VEHICLE] System error:`, err.message);
    console.error(err.stack);
    
    logger.error(`Error approving vehicles: ${err.message}`, {
      error: err.stack,
      userId: req.user.id,
      vehicleIds: req.body.vehicleIds
    });
    
    // Create system error audit log with valid enum value
    try {
      await mongoose.model('AuditLog').create({
        action: 'SYSTEM_ERROR', // Changed to valid enum value
        entity: 'System',
        entityId: null,
        user: req.user.id,
        ip: req.ip,
        status: 'FAILED',
        error: err.message,
        metadata: {
          vehicleIds: req.body.vehicleIds,
          totalVehicles: req.body.vehicleIds?.length || 0,
          approvedBy: req.user.id
        }
      });
    } catch (auditError) {
      console.error(`[APPROVE-VEHICLE] System error audit log creation failed:`, auditError.message);
    }
    
    next(new AppError('Server Error while approving vehicles', 500));
  }
};

exports.getVehicleCounts = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).populate('branch');
    
    if (await user.isSuperAdmin()) {
      const branches = await Branch.find({ is_active: true });
      
      const branchCounts = await Promise.all(
        branches.map(async (branch) => {
          const counts = await Vehicle.aggregate([
            { $match: { unloadLocation: branch._id } },
            { $group: { 
              _id: '$status', 
              count: { $sum: 1 } 
            }},
            { $project: { 
              status: '$_id', 
              count: 1, 
              _id: 0 
            }}
          ]);
          
          const statusCounts = counts.map(item => ({
            status: item.status,
            count: item.count
          }));
          
          const total = statusCounts.reduce((sum, item) => sum + item.count, 0);
          
          return {
            branchId: branch._id,
            branchName: branch.name,
            branchCity: branch.city,
            statusCounts,
            total
          };
        })
      );
      
      return res.status(200).json({
        status: 'success',
        data: {
          counts: branchCounts
        }
      });
    }
    
    if (!user.branch) {
      return next(new AppError('User is not assigned to any branch', 400));
    }
    
    const counts = await Vehicle.aggregate([
      { $match: { unloadLocation: user.branch._id } },
      { $group: { 
        _id: '$status', 
        count: { $sum: 1 } 
      }},
      { $project: { 
        status: '$_id', 
        count: 1, 
        _id: 0 
      }}
    ]);
    
    const statusCounts = counts.map(item => ({
      status: item.status,
      count: item.count
    }));
    
    const total = statusCounts.reduce((sum, item) => sum + item.count, 0);
    
    res.status(200).json({
      status: 'success',
      data: {
        branchId: user.branch._id,
        branchName: user.branch.name,
        branchCity: user.branch.city,
        statusCounts,
        total
      }
    });
    
  } catch (err) {
    logger.error(`Error getting vehicle counts: ${err.message}`);
    next(new AppError('Server Error', 500));
  }
};

// @route   GET /api/v1/vehicles/my-subdealer
// @desc    Get vehicles assigned to the logged-in subdealer's location
// @access  Private (Subdealer users only)
exports.getMySubdealerVehicles = async (req, res, next) => {
  try {
    // Get the logged-in user's subdealer ID
    const userSubdealerId = req.user.subdealer;
    
    if (!userSubdealerId) {
      return next(new AppError('User is not associated with any subdealer', 400));
    }

    const { type, status, model, color, hasDamage } = req.query;
    
    // Build base query for subdealer's vehicles
    let query = Vehicle.find({
      locationType: 'subdealer',
      subdealerLocation: userSubdealerId
    });
    
    // Apply filters
    if (type && ['EV', 'ICE'].includes(type.toUpperCase())) {
      query = query.where('type').equals(type.toUpperCase());
    }
    
    if (status) {
      query = query.where('status').equals(status.toLowerCase());
    }
    
    if (model) {
      query = query.where('model').equals(model);
    }
    
    if (color) {
      query = query.where('color').equals(color);
    }
    
    if (hasDamage === 'true') {
      query = query.where('hasDamage').equals(true);
    } else if (hasDamage === 'false') {
      query = query.where('hasDamage').equals(false);
    }
    
    // Populate options
    const populateOptions = [
      { path: 'model', select: 'model_name type' },
      { path: 'subdealerLocation', select: 'name location' },
      { path: 'color.id', select: 'name hex_code' },
      { path: 'addedBy', select: 'name email' }
    ];
    
    query = query.populate(populateOptions);
    
    // Execute query
    const vehicles = await query;
    
    // Transform response
    const transformedVehicles = vehicles.map(vehicle => {
      const vehicleObj = vehicle.toObject();
      
      // Ensure modelName is included
      if (!vehicleObj.modelName && vehicle.model) {
        vehicleObj.modelName = vehicle.model.model_name || 'Unknown Model';
      }
      
      // Add subdealer details
      if (!vehicleObj.subdealerLocation && vehicle.subdealerLocation) {
        vehicleObj.subdealerLocation = {
          _id: vehicle.subdealerLocation._id,
          name: vehicle.subdealerLocation.name,
          location: vehicle.subdealerLocation.location
        };
      }
      
      // Add addedBy details
      if (!vehicleObj.addedBy && vehicle.addedBy) {
        vehicleObj.addedBy = {
          _id: vehicle.addedBy._id,
          name: vehicle.addedBy.name || 'Unknown User'
        };
      }
      
      return vehicleObj;
    });
    
    res.status(200).json({
      status: 'success',
      results: transformedVehicles.length,
      data: {
        vehicles: transformedVehicles
      }
    });
  } catch (err) {
    logger.error(`Error getting subdealer vehicles: ${err.message}`);
    next(new AppError('Server Error', 500));
  }
};

exports.getAllVehicles = async (req, res, next) => {
    try {
      console.time('[VEHICLE-GET-ALL] Total Time');
      
      console.log('[VEHICLE-GET-ALL] Starting with user:', {
        id: req.user?._id,
        roles: req.user?.roles,
        branch: req.user?.branch,
        branchAccess: req.user?.branchAccess,
        subdealer: req.user?.subdealer
      });
  
      // ========== PAGINATION PARAMETERS ==========
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
      const skip = (page - 1) * limit;
      
      // Sort configuration
      const sortField = req.query.sortBy || 'createdAt';
      const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
      const sort = { [sortField]: sortOrder, _id: 1 };
      
      console.log('[VEHICLE-GET-ALL] Pagination params:', { page, limit, skip, sort });
  
      // ========== BUILD FILTER ==========
      const filter = {};
      
      // Handle search parameter - USING REGEX INSTEAD OF TEXT SEARCH
      if (req.query.search && req.query.search.trim() !== '') {
        const searchTerm = req.query.search.trim();
        
        // Use $or with regex for multiple fields - NO TEXT INDEX NEEDED
        filter.$or = [
          { chassisNumber: { $regex: searchTerm, $options: 'i' } },
          { engineNumber: { $regex: searchTerm, $options: 'i' } },
          { registrationNumber: { $regex: searchTerm, $options: 'i' } },
          { vehicleId: { $regex: searchTerm, $options: 'i' } },
          { modelName: { $regex: searchTerm, $options: 'i' } }
        ];
        
        // If search term looks like an ObjectId (24 hex chars), also search by _id
        if (searchTerm.match(/^[0-9a-fA-F]{24}$/)) {
          filter.$or.push({ _id: searchTerm });
        }
      }
      
      // Add other filters
      if (req.query.status) {
        filter.status = req.query.status;
      }
      
      if (req.query.model) {
        filter.model = req.query.model;
      }
      
      if (req.query.locationType) {
        filter.locationType = req.query.locationType;
        
        if (req.query.locationType === 'branch' && req.query.unloadLocation) {
          filter.unloadLocation = req.query.unloadLocation;
        }
        
        if (req.query.locationType === 'subdealer' && req.query.subdealerLocation) {
          filter.subdealerLocation = req.query.subdealerLocation;
        }
      }
      
      console.log('[VEHICLE-GET-ALL] Final filter:', JSON.stringify(filter, null, 2));
  
      // ========== OPTIMIZED COUNT QUERY ==========
      const countOptions = {};
      
      if (filter.status && !filter.$and && !filter.$or) {
        countOptions.hint = { status: 1 };
      } else if (filter.model) {
        countOptions.hint = { model: 1 };
      }
      
      const totalCount = await Vehicle.countDocuments(filter, countOptions);
      console.log(`[VEHICLE-GET-ALL] Total vehicles matching filter: ${totalCount}`);
      
      if (totalCount === 0) {
        return res.status(200).json({
          status: 'success',
          message: 'No vehicles found',
          data: {
            vehicles: [],
            pagination: {
              page,
              limit,
              totalCount: 0,
              totalPages: 0,
              hasNextPage: false,
              hasPrevPage: false
            },
            userAccess: req.user ? {
              id: req.user._id,
              branch: req.user.branch,
              branchAccess: req.user.branchAccess,
              roles: req.user.roles
            } : null
          }
        });
      }
  
      // ========== OPTIMIZED VEHICLE QUERY ==========
      let query = Vehicle.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();
      
      if (filter.status && !filter.$and && !filter.$or) {
        query = query.hint({ status: 1, [sortField]: sortOrder });
      } else if (filter.model) {
        query = query.hint({ model: 1, [sortField]: sortOrder });
      } else if (filter.locationType) {
        if (filter.locationType === 'branch' && filter.unloadLocation) {
          query = query.hint({ locationType: 1, unloadLocation: 1, [sortField]: sortOrder });
        } else if (filter.locationType === 'subdealer' && filter.subdealerLocation) {
          query = query.hint({ locationType: 1, subdealerLocation: 1, [sortField]: sortOrder });
        }
      }
      
      let vehicles = await query;
      console.log(`[VEHICLE-GET-ALL] Fetched ${vehicles.length} vehicles`);
  
      // ========== BATCH POPULATE ==========
      if (vehicles.length > 0) {
        const modelIds = [...new Set(vehicles.map(v => v.model).filter(Boolean))];
        const branchIds = [...new Set(vehicles.map(v => v.unloadLocation).filter(Boolean))];
        const subdealerIds = [...new Set(vehicles.map(v => v.subdealerLocation).filter(Boolean))];
        const colorIds = [...new Set(vehicles.map(v => v.color?.id).filter(Boolean))];
        const bookingIds = [...new Set(vehicles.map(v => v.allocatedBooking).filter(Boolean))];
        
        const [models, branches, subdealers, colors, bookings] = await Promise.all([
          modelIds.length ? mongoose.model('Model').find({ _id: { $in: modelIds } }).select('model_name').lean() : [],
          branchIds.length ? mongoose.model('Branch').find({ _id: { $in: branchIds } }).select('name city state').lean() : [],
          subdealerIds.length ? mongoose.model('Subdealer').find({ _id: { $in: subdealerIds } }).select('name branch').lean() : [],
          colorIds.length ? mongoose.model('Color').find({ _id: { $in: colorIds } }).select('name hex_code').lean() : [],
          bookingIds.length ? mongoose.model('Booking').find({ _id: { $in: bookingIds } }).select('bookingNumber customerDetails.name').lean() : []
        ]);
        
        const modelMap = Object.fromEntries(models.map(m => [m._id.toString(), m]));
        const branchMap = Object.fromEntries(branches.map(b => [b._id.toString(), b]));
        const subdealerMap = Object.fromEntries(subdealers.map(s => [s._id.toString(), s]));
        const colorMap = Object.fromEntries(colors.map(c => [c._id.toString(), c]));
        const bookingMap = Object.fromEntries(bookings.map(b => [b._id.toString(), b]));
        
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        
        vehicles = vehicles.map(vehicle => {
          const model = modelMap[vehicle.model?.toString()];
          const branch = branchMap[vehicle.unloadLocation?.toString()];
          const subdealer = subdealerMap[vehicle.subdealerLocation?.toString()];
          const color = colorMap[vehicle.color?.id?.toString()];
          const booking = bookingMap[vehicle.allocatedBooking?.toString()];
          
          const inwardDate = vehicle.inwardDate || vehicle.createdAt;
          const ageInDays = inwardDate ? 
            Math.floor((Date.now() - new Date(inwardDate)) / (1000 * 60 * 60 * 24)) : 0;
          
          let statusDescription = vehicle.status;
          switch(vehicle.status) {
            case 'IN_WAREHOUSE':
              statusDescription = 'In Warehouse';
              break;
            case 'ALLOCATED':
              statusDescription = 'Allocated to Booking';
              break;
            case 'DISPATCHED':
              statusDescription = 'Dispatched';
              break;
            case 'DELIVERED':
              statusDescription = 'Delivered';
              break;
            default:
              statusDescription = vehicle.status;
          }
          
          return {
            ...vehicle,
            modelName: model?.model_name || vehicle.modelName || 'Unknown Model',
            model: model || vehicle.model,
            unloadLocation: branch || vehicle.unloadLocation,
            subdealerLocation: subdealer || vehicle.subdealerLocation,
            color: color ? { id: color._id, name: color.name, hex_code: color.hex_code } : vehicle.color,
            allocatedBooking: booking || vehicle.allocatedBooking,
            ageInDays,
            isUnder10Days: ageInDays <= 10,
            qrCodeUrl: vehicle.qrCode ? `${baseUrl}${vehicle.qrCode}` : null,
            statusDescription
          };
        });
      }
  
      // ========== RESPONSE ==========
      const totalPages = Math.ceil(totalCount / limit);
      
      const response = {
        status: 'success',
        message: 'Vehicles retrieved successfully',
        data: {
          vehicles,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
          },
          userAccess: req.user ? {
            id: req.user._id,
            branch: req.user.branch,
            branchAccess: req.user.branchAccess,
            roles: req.user.roles
          } : null
        }
      };
      
      console.timeEnd('[VEHICLE-GET-ALL] Total Time');
      res.status(200).json(response);
      
    } catch (err) {
      console.error('[VEHICLE-GET-ALL] Error:', err.message);
      console.error('[VEHICLE-GET-ALL] Stack:', err.stack);
      
      if (err.name === 'CastError') {
        return next(new AppError('Invalid ID format in query parameters', 400));
      }
      
      next(new AppError('Server Error while fetching vehicles', 500));
    }
  };
  
  // ========== OPTIMIZED FILTER BUILDER ==========
  async function buildOptimizedFilter(req) {
    const filter = {};
    const { query, user } = req;
    
    // Basic filters
    if (query.type && ['EV', 'ICE'].includes(query.type.toUpperCase())) {
      filter.type = query.type.toUpperCase();
    }
    
    // Status filter (single or multiple)
    if (query.statuses) {
      const statuses = query.statuses.split(',').map(s => s.toLowerCase().trim());
      const validStatuses = statuses.filter(s => 
        ['not_approved', 'open_for_sale', 'booked', 'blocked', 'stock_transfer', 
         'in_stock', 'in_transit', 'sold', 'service', 'damaged', 'hold', 'FROZEN'].includes(s)
      );
      if (validStatuses.length > 0) {
        filter.status = { $in: validStatuses };
      }
    } else if (query.status) {
      const statusLower = query.status.toLowerCase();
      if (['not_approved', 'open_for_sale', 'booked', 'blocked', 'stock_transfer', 
           'in_stock', 'in_transit', 'sold', 'service', 'damaged', 'hold', 'FROZEN'].includes(statusLower)) {
        filter.status = statusLower;
      }
    }
    
    // ID-based filters
    if (query.model && mongoose.Types.ObjectId.isValid(query.model)) {
      filter.model = mongoose.Types.ObjectId(query.model);
    }
    
    if (query.color && mongoose.Types.ObjectId.isValid(query.color)) {
      filter['color.id'] = mongoose.Types.ObjectId(query.color);
    }
    
    // Location filter
    if (query.location && mongoose.Types.ObjectId.isValid(query.location)) {
      filter.$or = [
        { locationType: 'branch', unloadLocation: mongoose.Types.ObjectId(query.location) },
        { locationType: 'subdealer', subdealerLocation: mongoose.Types.ObjectId(query.location) }
      ];
    }
    
    // Boolean filters
    if (query.hasDamage === 'true') filter.hasDamage = true;
    if (query.hasDamage === 'false') filter.hasDamage = false;
    
    // Date range filter
    if (query.dateFrom || query.dateTo) {
      filter.createdAt = {};
      if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
      if (query.dateTo) filter.createdAt.$lte = new Date(query.dateTo);
    }
    
    // Search filter - use $regex for partial matching (more flexible than text search)
    if (query.search && query.search.trim()) {
      const searchTerm = query.search.trim();
      const searchRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      
      const searchConditions = [
        { chassisNumber: searchRegex },
        { vinNumber: searchRegex },
        { customerName: searchRegex },
        { motorNumber: searchRegex },
        { engineNumber: searchRegex },
        { batteryNumber: searchRegex },
        { keyNumber: searchRegex },
        { chargerNumber: searchRegex }
      ];
      
      if (filter.$or) {
        filter.$and = [{ $or: searchConditions }, { $or: filter.$or }];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }
    
    // ========== BRANCH ACCESS FILTER ==========
    const branchFilter = await buildBranchFilter(user);
    if (Object.keys(branchFilter).length > 0) {
      if (Object.keys(filter).length === 0) {
        return branchFilter;
      } else if (filter.$and) {
        filter.$and.push(branchFilter);
      } else if (filter.$or) {
        filter.$and = [branchFilter, { $or: filter.$or }];
        delete filter.$or;
      } else {
        return { $and: [filter, branchFilter] };
      }
    }
    
    return filter;
  }
  
  // ========== BRANCH FILTER BUILDER ==========
  async function buildBranchFilter(user) {
    if (!user) return {};
    
    const branchAccess = user.branchAccess || 'OWN';
    
    if (branchAccess === 'ALL') {
      console.log('[BRANCH-FILTER] User has ALL access - no filter applied');
      return {};
    }
    
    const filter = {};
    const userBranch = user.branch;
    const userSubdealer = user.subdealer;
    const accessibleBranches = user.accessibleBranches || [];
    
    console.log('[BRANCH-FILTER] Building branch filter:', {
      branchAccess,
      userBranchId: userBranch,
      userSubdealerId: userSubdealer,
      accessibleBranchesCount: accessibleBranches.length
    });
    
    if (branchAccess === 'OWN') {
      if (userBranch) {
        // Get subdealer IDs for this branch
        const subdealerIds = await mongoose.model('Subdealer')
          .find({ branch: userBranch })
          .distinct('_id')
          .lean();
        
        filter.$or = [
          { locationType: 'branch', unloadLocation: userBranch },
          { locationType: 'subdealer', subdealerLocation: { $in: subdealerIds } }
        ];
      } else if (userSubdealer) {
        filter.locationType = 'subdealer';
        filter.subdealerLocation = userSubdealer;
      }
    } 
    else if (branchAccess === 'ASSIGNED') {
      const branchConditions = [];
      
      // Assigned branches
      if (accessibleBranches.length > 0) {
        const branchIds = accessibleBranches.map(b => b._id || b);
        branchConditions.push({
          locationType: 'branch',
          unloadLocation: { $in: branchIds }
        });
      }
      
      // User's own branch
      if (userBranch) {
        branchConditions.push({
          locationType: 'branch',
          unloadLocation: userBranch
        });
      }
      
      // User's subdealer
      if (userSubdealer) {
        branchConditions.push({
          locationType: 'subdealer',
          subdealerLocation: userSubdealer
        });
      }
      
      if (branchConditions.length > 0) {
        filter.$or = branchConditions;
      }
    }
    
    return filter;
  }
  
  // ========== GET USER ACCESS INFO ==========
  async function getUserAccessInfo(user) {
    if (!user) return null;
    
    let userBranchInfo = null;
    if (user.branch) {
      if (user.branchDetails) {
        userBranchInfo = {
          _id: user.branch,
          name: user.branchDetails.name || 'Unknown Branch',
          city: user.branchDetails.city
        };
      } else {
        const branch = await mongoose.model('Branch')
          .findById(user.branch)
          .select('name city')
          .lean();
        if (branch) {
          userBranchInfo = {
            _id: user.branch,
            name: branch.name,
            city: branch.city
          };
        }
      }
    }
    
    return {
      branchAccess: user.branchAccess || 'OWN',
      userBranch: userBranchInfo,
      userSubdealer: user.subdealer ? {
        _id: user.subdealer,
        name: user.subdealerDetails?.name || 'Unknown Subdealer'
      } : null,
      accessibleBranchesCount: user.accessibleBranches?.length || 0,
      userRoles: Array.isArray(user.roles) 
        ? user.roles.map(r => r.name || r) 
        : []
    };
  }
  
  // ========== HELPER FUNCTIONS ==========
  function getSortField(sortBy) {
    const sortMap = {
      'createdAt': 'createdAt',
      'updatedAt': 'updatedAt',
      'chassisNumber': 'chassisNumber',
      'status': 'status',
      'age': 'inwardDate',
      'inwardDate': 'inwardDate'
    };
    return sortMap[sortBy] || 'createdAt';
  }
  
  function getStatusDescription(status) {
    const descriptions = {
      'not_approved': 'Pending Approval',
      'open_for_sale': 'Available for Sale',
      'booked': 'Booked',
      'blocked': 'Blocked',
      'stock_transfer': 'Stock Transfer',
      'in_stock': 'In Stock',
      'in_transit': 'In Transit',
      'sold': 'Sold',
      'service': 'In Service',
      'damaged': 'Damaged',
      'hold': 'On Hold',
      'FROZEN': 'Frozen'
    };
    return descriptions[status] || status;
  }


  
  // ========== OPTIMIZATION 4: SEPARATE FUNCTION FOR PAGINATED VEHICLES ==========
  async function getPaginatedVehicles(req) {
    console.time('[VEHICLE-GET-ALL] Query Time');
    
    // Pagination parameters with defaults
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20)); // Max 100 items
    const skip = (page - 1) * limit;
    
    // Sort configuration - index-friendly
    const sortField = getSortField(req.query.sortBy);
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    
    // Build optimized filter
    const filter = await buildOptimizedFilter(req);
    
    console.log('[VEHICLE-GET-ALL] Optimized filter:', JSON.stringify(filter));
    
    // OPTIMIZATION 5: USE AGGREGATION PIPELINE FOR BETTER PERFORMANCE
    const pipeline = [
      { $match: filter },
      
      // OPTIMIZATION 6: EARLY PROJECTION TO REDUCE DATA SIZE
      {
        $project: {
          chassisNumber: 1,
          vinNumber: 1,
          model: 1,
          'color.id': 1,
          status: 1,
          type: 1,
          locationType: 1,
          unloadLocation: 1,
          subdealerLocation: 1,
          createdAt: 1,
          updatedAt: 1,
          inwardDate: 1,
          hasDamage: 1,
          qrCode: 1,
          customerName: 1,
          // Add computed fields
          ageInDays: {
            $floor: {
              $divide: [
                { $subtract: [new Date(), { $ifNull: ['$inwardDate', '$createdAt'] }] },
                1000 * 60 * 60 * 24
              ]
            }
          }
        }
      },
      
      // OPTIMIZATION 7: EFFICIENT SORTING (USES INDEX)
      { $sort: { [sortField]: sortOrder, _id: 1 } },
      
      // OPTIMIZATION 8: FAST PAGINATION
      { $skip: skip },
      { $limit: limit },
      
      // OPTIMIZATION 9: OPTIMIZED LOOKUPS - ONLY FETCH NEEDED FIELDS
      {
        $lookup: {
          from: 'models',
          localField: 'model',
          foreignField: '_id',
          as: 'model',
          pipeline: [
            { $project: { model_name: 1, type: 1 } }
          ]
        }
      },
      {
        $lookup: {
          from: 'branches',
          localField: 'unloadLocation',
          foreignField: '_id',
          as: 'unloadLocation',
          pipeline: [
            { $project: { name: 1, city: 1, state: 1 } }
          ]
        }
      },
      {
        $lookup: {
          from: 'subdealers',
          localField: 'subdealerLocation',
          foreignField: '_id',
          as: 'subdealerLocation',
          pipeline: [
            { $project: { name: 1, branch: 1 } }
          ]
        }
      },
      {
        $lookup: {
          from: 'colors',
          localField: 'color.id',
          foreignField: '_id',
          as: 'colorInfo',
          pipeline: [
            { $project: { name: 1, hex_code: 1 } }
          ]
        }
      },
      {
        $lookup: {
          from: 'bookings',
          localField: 'allocatedBooking',
          foreignField: '_id',
          as: 'allocatedBooking',
          pipeline: [
            { $project: { bookingNumber: 1, 'customerDetails.name': 1 } }
          ]
        }
      },
      
      // OPTIMIZATION 10: TRANSFORM DATA STRUCTURE EFFICIENTLY
      {
        $addFields: {
          modelName: { $arrayElemAt: ['$model.model_name', 0] },
          'unloadLocation': { $arrayElemAt: ['$unloadLocation', 0] },
          'subdealerLocation': { $arrayElemAt: ['$subdealerLocation', 0] },
          'color.id': { $arrayElemAt: ['$colorInfo', 0] },
          'allocatedBooking': { $arrayElemAt: ['$allocatedBooking', 0] },
          isUnder10Days: { $lte: ['$ageInDays', 10] }
        }
      },
      
      // OPTIMIZATION 11: FINAL PROJECTION FOR RESPONSE
      {
        $project: {
          chassisNumber: 1,
          vinNumber: 1,
          modelName: 1,
          'color.id.name': 1,
          'color.id.hex_code': 1,
          status: 1,
          type: 1,
          locationType: 1,
          'unloadLocation.name': 1,
          'unloadLocation.city': 1,
          'subdealerLocation.name': 1,
          createdAt: 1,
          inwardDate: 1,
          ageInDays: 1,
          isUnder10Days: 1,
          hasDamage: 1,
          qrCode: 1,
          customerName: 1,
          'allocatedBooking.bookingNumber': 1,
          'allocatedBooking.customerDetails.name': 1
        }
      }
    ];
    
    // OPTIMIZATION 12: PARALLEL COUNT AND DATA QUERIES
    const [vehicles, totalCount] = await Promise.all([
      Vehicle.aggregate(pipeline).allowDiskUse(true).hint({ [sortField]: sortOrder, _id: 1 }),
      Vehicle.countDocuments(filter)
    ]);
    
    console.timeEnd('[VEHICLE-GET-ALL] Query Time');
    console.log(`[VEHICLE-GET-ALL] Fetched ${vehicles.length}/${totalCount} vehicles in ${skip}-${skip+limit} range`);
    
    // OPTIMIZATION 13: TRANSFORM QR CODE URL WITHOUT LOOP (USING MAP)
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    vehicles.forEach(v => {
      if (v.qrCode) {
        v.qrCodeUrl = `${baseUrl}${v.qrCode}`;
      }
      v.statusDescription = getStatusDescription(v.status);
    });
    
    return {
      vehicles,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      hasNextPage: page < Math.ceil(totalCount / limit),
      hasPrevPage: page > 1
    };
  }
  
  // ========== OPTIMIZATION 14: EFFICIENT FILTER BUILDING ==========
  async function buildOptimizedFilter(req) {
    const filter = {};
    const { query, user } = req;
    
    // OPTIMIZATION 15: USE $in FOR MULTIPLE VALUES
    if (query.statuses) {
      const statuses = query.statuses.split(',').map(s => s.toLowerCase());
      filter.status = { $in: statuses };
    } else if (query.status) {
      filter.status = query.status.toLowerCase();
    }
    
    if (query.type) {
      filter.type = query.type.toUpperCase();
    }
    
    // OPTIMIZATION 16: USE OBJECTID CONVERSION ONCE
    if (query.model && mongoose.Types.ObjectId.isValid(query.model)) {
      filter.model = mongoose.Types.ObjectId(query.model);
    }
    
    if (query.color && mongoose.Types.ObjectId.isValid(query.color)) {
      filter['color.id'] = mongoose.Types.ObjectId(query.color);
    }
    
    // OPTIMIZATION 17: BOOLEAN FILTERS
    if (query.hasDamage === 'true') filter.hasDamage = true;
    if (query.hasDamage === 'false') filter.hasDamage = false;
    
    // OPTIMIZATION 18: DATE RANGE WITH INDEX HINT
    if (query.dateFrom || query.dateTo) {
      filter.createdAt = {};
      if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
      if (query.dateTo) filter.createdAt.$lte = new Date(query.dateTo);
    }
    
    // OPTIMIZATION 19: SEARCH WITH TEXT INDEX
    if (query.search && query.search.trim()) {
      // Use text index if available for faster search
      filter.$text = { $search: query.search.trim() };
    }
    
    // OPTIMIZATION 20: BRANCH ACCESS FILTER (CACHED)
    const branchFilter = await buildBranchFilter(user);
    if (Object.keys(branchFilter).length > 0) {
      return { $and: [filter, branchFilter] };
    }
    
    return filter;
  }
  
  // ========== OPTIMIZATION 21: BRANCH FILTER WITH CACHING ==========
  async function buildBranchFilter(user) {
    const branchAccess = user?.branchAccess || 'OWN';
    
    if (branchAccess === 'ALL') return {};
    
    const filter = {};
    const userBranch = user?.branch;
    const userSubdealer = user?.subdealer;
    
    if (branchAccess === 'OWN') {
      if (userBranch) {
        // OPTIMIZATION: Get subdealer IDs efficiently
        const subdealerIds = await mongoose.model('Subdealer')
          .find({ branch: userBranch })
          .distinct('_id')
          .lean();
        
        filter.$or = [
          { locationType: 'branch', unloadLocation: userBranch },
          { locationType: 'subdealer', subdealerLocation: { $in: subdealerIds } }
        ];
      } else if (userSubdealer) {
        filter.locationType = 'subdealer';
        filter.subdealerLocation = userSubdealer;
      }
    } else if (branchAccess === 'ASSIGNED') {
      const accessibleBranches = user?.accessibleBranches || [];
      const branchIds = accessibleBranches.map(b => b._id || b);
      
      if (branchIds.length > 0 || userBranch) {
        filter.$or = [
          { locationType: 'branch', unloadLocation: { $in: [...branchIds, ...(userBranch ? [userBranch] : [])] } }
        ];
      }
      
      if (userSubdealer) {
        filter.$or = filter.$or || [];
        filter.$or.push({ locationType: 'subdealer', subdealerLocation: userSubdealer });
      }
    }
    
    return filter;
  }
  
  // ========== OPTIMIZATION 22: HELPER FUNCTIONS ==========
  function getSortField(sortBy) {
    const sortMap = {
      'createdAt': 'createdAt',
      'updatedAt': 'updatedAt',
      'chassisNumber': 'chassisNumber',
      'status': 'status',
      'age': 'inwardDate'
    };
    return sortMap[sortBy] || 'createdAt';
  }
  
  async function getUserBranchInfo(user) {
    if (!user?.branch) return null;
    
    if (user.branchDetails) {
      return {
        _id: user.branch,
        name: user.branchDetails.name || 'Unknown Branch',
        city: user.branchDetails.city
      };
    }
    
    const branch = await mongoose.model('Branch')
      .findById(user.branch)
      .select('name city')
      .lean();
      
    return branch;
  }
  
  async function getUserSubdealerIds(user) {
    if (!user?.branch) return [];
    
    return mongoose.model('Subdealer')
      .find({ branch: user.branch })
      .distinct('_id')
      .lean();
  }
  
  // ========== OPTIMIZATION 23: CREATE INDEXES (RUN ONCE) ==========
  /*
  db.vehicles.createIndex({ status: 1, createdAt: -1 });
  db.vehicles.createIndex({ locationType: 1, unloadLocation: 1 });
  db.vehicles.createIndex({ locationType: 1, subdealerLocation: 1 });
  db.vehicles.createIndex({ chassisNumber: "text", vinNumber: "text", customerName: "text" });
  db.vehicles.createIndex({ createdAt: -1 });
  db.vehicles.createIndex({ model: 1 });
  db.vehicles.createIndex({ "color.id": 1 });
  */
exports.getVehicleById = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.vehicleId)) {
      return next(new AppError('Invalid vehicle ID format', 400));
    }
    
    const vehicle = await Vehicle.findById(req.params.vehicleId)
      .populate(populateOptions);
    
    if (!vehicle) {
      return next(new AppError('No vehicle found with that ID', 404));
    }

    const vehicleObj = vehicle.toObject();
    
    if (!vehicleObj.unloadLocation) {
      vehicleObj.unloadLocation = {
        _id: vehicle.unloadLocation,
        name: 'Unknown Location'
      };
    }
    
    if (!vehicleObj.addedBy) {
      vehicleObj.addedBy = {
        _id: vehicle.addedBy,
        name: 'Unknown User'
      };
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        vehicle: vehicleObj
      }
    });
  } catch (err) {
    logger.error(`Error getting vehicle by ID: ${err.message}`);
    next(new AppError('Server Error', 500));
  }
};

exports.getVehicleByQrCode = async (req, res, next) => {
  try {
    const { qrCode } = req.params;
    
    const vehicle = await Vehicle.findOne({ qrCode })
      .populate(populateOptions);
    
    if (!vehicle) {
      return next(new AppError('No vehicle found with that QR code', 404));
    }

    const vehicleObj = vehicle.toObject();
    
    if (!vehicleObj.unloadLocation) {
      vehicleObj.unloadLocation = {
        _id: vehicle.unloadLocation,
        name: 'Unknown Location'
      };
    }
    
    if (!vehicleObj.addedBy) {
      vehicleObj.addedBy = {
        _id: vehicle.addedBy,
        name: 'Unknown User'
      };
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        vehicle: vehicleObj
      }
    });
  } catch (err) {
    logger.error(`Error getting vehicle by QR code: ${err.message}`);
    next(new AppError('Server Error', 500));
  }
};

exports.updateVehicleStatus = async (req, res, next) => {
  try {
    const { vehicleId } = req.params;
    const { status } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
      return next(new AppError('Invalid vehicle ID format', 400));
    }
    
    if (!status || !['not_approved', 'in_stock', 'in_transit', 'sold', 'service', 'damaged'].includes(status)) {
      return next(new AppError('Valid status is required', 400));
    }
    
    const updatedVehicle = await Vehicle.findByIdAndUpdate(
      vehicleId,
      { status },
      { new: true, runValidators: true }
    ).populate(populateOptions);
    
    if (!updatedVehicle) {
      return next(new AppError('No vehicle found with that ID', 404));
    }

    const vehicleObj = updatedVehicle.toObject();
    
    if (!vehicleObj.unloadLocation) {
      vehicleObj.unloadLocation = {
        _id: updatedVehicle.unloadLocation,
        name: 'Unknown Location'
      };
    }
    
    if (!vehicleObj.addedBy) {
      vehicleObj.addedBy = {
        _id: updatedVehicle.addedBy,
        name: 'Unknown User'
      };
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        vehicle: vehicleObj
      }
    });
  } catch (err) {
    logger.error(`Error updating vehicle status: ${err.message}`);
    next(new AppError('Server Error', 500));
  }
};

exports.addDamage = async (req, res, next) => {
  try {
    const { vehicleId } = req.params;
    const { description, images } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
      return next(new AppError('Invalid vehicle ID format', 400));
    }
    
    if (!description || !images || images.length === 0) {
      return next(new AppError('Damage description and at least one image are required', 400));
    }
    
    const updatedVehicle = await Vehicle.findByIdAndUpdate(
      vehicleId,
      { 
        $push: { damages: { description, images } },
        $set: { hasDamage: true, status: 'damaged' }
      },
      { new: true, runValidators: true }
    ).populate(populateOptions);
    
    if (!updatedVehicle) {
      return next(new AppError('No vehicle found with that ID', 404));
    }

    const vehicleObj = updatedVehicle.toObject();
    
    if (!vehicleObj.unloadLocation) {
      vehicleObj.unloadLocation = {
        _id: updatedVehicle.unloadLocation,
        name: 'Unknown Location'
      };
    }
    
    if (!vehicleObj.addedBy) {
      vehicleObj.addedBy = {
        _id: updatedVehicle.addedBy,
        name: 'Unknown User'
      };
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        vehicle: vehicleObj
      }
    });
  } catch (err) {
    logger.error(`Error adding damage to vehicle: ${err.message}`);
    next(new AppError('Server Error', 500));
  }
};

exports.generateQrCode = async (req, res, next) => {
  try {
    const { vehicleId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
      return next(new AppError('Invalid vehicle ID format', 400));
    }
    
    const vehicle = await Vehicle.findById(vehicleId)
      .populate(populateOptions);
    
    if (!vehicle) {
      return next(new AppError('No vehicle found with that ID', 404));
    }

    const vehicleObj = vehicle.toObject();
    
    if (!vehicleObj.unloadLocation) {
      vehicleObj.unloadLocation = {
        _id: vehicle.unloadLocation,
        name: 'Unknown Location'
      };
    }
    
    if (!vehicleObj.addedBy) {
      vehicleObj.addedBy = {
        _id: vehicle.addedBy,
        name: 'Unknown User'
      };
    }
    
    const qrCodeData = {
      model: vehicleObj.model,
      chassisNumber: vehicle.chassisNumber,
      color: vehicleObj.color,
      location: vehicleObj.unloadLocation.name,
      status: vehicle.status,
      qrCode: vehicle.qrCode
    };
    
    const qrCodeUrl = await QRCode.toDataURL(JSON.stringify(qrCodeData));
    
    const updatedVehicle = await Vehicle.findByIdAndUpdate(
      vehicleId,
      { qrCodeImage: qrCodeUrl },
      { new: true }
    ).populate(populateOptions);
    
    res.status(200).json({
      status: 'success',
      data: {
        vehicle: updatedVehicle,
        qrCodeUrl
      }
    });
  } catch (err) {
    logger.error(`Error generating QR code: ${err.message}`);
    next(new AppError('Server Error', 500));
  }
};
exports.getVehiclesBySubdealer = async (req, res, next) => {
  try {
    const { subdealerId } = req.params;

    console.log('🚗 GET /subdealer/:subdealerId called');
    console.log('[VEHICLE-SUBDEALER-DEBUG] Subdealer ID:', subdealerId);

    if (!mongoose.Types.ObjectId.isValid(subdealerId)) {
      return next(new AppError('Invalid subdealer ID format', 400));
    }

    // Find vehicles where:
    // 1. locationType is 'subdealer' AND
    // 2. subdealerLocation matches the subdealerId
    const vehicles = await Vehicle.find({ 
      locationType: 'subdealer',
      subdealerLocation: subdealerId
    }).populate(populateOptions);

    console.log('[VEHICLE-SUBDEALER-DEBUG] Found vehicles:', vehicles.length);

    const transformedVehicles = vehicles.map(vehicle => {
      const vehicleObj = vehicle.toObject();
      
      if (!vehicleObj.unloadLocation) {
        vehicleObj.unloadLocation = {
          _id: vehicle.unloadLocation,
          name: 'Unknown Location'
        };
      }
      
      if (!vehicleObj.addedBy) {
        vehicleObj.addedBy = {
          _id: vehicle.addedBy,
          name: 'Unknown User'
        };
      }
      
      return vehicleObj;
    });

    res.status(200).json({
      status: 'success',
      results: transformedVehicles.length,
      data: {
        vehicles: transformedVehicles
      }
    });
  } catch (err) {
    console.error('[VEHICLE-SUBDEALER-DEBUG] Error:', err);
    logger.error(`Error getting vehicles by subdealer: ${err.message}`);
    next(new AppError('Server Error', 500));
  }
};
exports.getVehiclesByBranch = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { locationType } = req.query;

    console.log('[VEHICLE-BRANCH-DEBUG] Branch ID:', branchId);
    console.log('[VEHICLE-BRANCH-DEBUG] Location Type:', locationType);

    if (!mongoose.Types.ObjectId.isValid(branchId)) {
      return next(new AppError('Invalid branch ID format', 400));
    }

    let query = {};

    if (locationType === 'subdealer') {
      // For subdealer vehicles, we need to find vehicles where:
      // Option 1: unloadLocation is the branchId AND locationType is 'subdealer'?
      // OR Option 2: subdealerLocation field exists and matches branchId?
      
      // Based on your vehicle data, I can see two possible approaches:
      
      // APPROACH 1: If subdealers are linked to this branch through a field
      // First find all subdealers under this branch (if you have a Branch model with parent-child)
      const Branch = mongoose.model('Branch');
      const subdealers = await Branch.find({ 
        // Try to find how subdealers are linked to main branch
        // This depends on your Branch schema - check if there's a parentBranch or mainBranch field
        $or: [
          { parentBranch: branchId },
          { mainBranch: branchId },
          { branchType: 'subdealer' }
        ]
      }).select('_id');
      
      const subdealerIds = subdealers.map(s => s._id);
      
      // Find vehicles that are either at the main branch OR at any subdealer
      query = {
        $or: [
          { unloadLocation: branchId },  // Vehicles at main branch
          { unloadLocation: { $in: subdealerIds } },  // Vehicles at subdealers
          { subdealerLocation: { $in: subdealerIds } }  // Alternative field
        ]
      };
      
      console.log('[VEHICLE-BRANCH-DEBUG] Found subdealers:', subdealerIds.length);
    } else {
      // Just vehicles at this specific branch
      query.unloadLocation = branchId;
    }

    const vehicles = await Vehicle.find(query)
      .populate(populateOptions);

    console.log('[VEHICLE-BRANCH-DEBUG] Found vehicles:', vehicles.length);

    const transformedVehicles = vehicles.map(vehicle => {
      const vehicleObj = vehicle.toObject();
      
      if (!vehicleObj.unloadLocation) {
        vehicleObj.unloadLocation = {
          _id: vehicle.unloadLocation,
          name: 'Unknown Location'
        };
      }
      
      if (!vehicleObj.addedBy) {
        vehicleObj.addedBy = {
          _id: vehicle.addedBy,
          name: 'Unknown User'
        };
      }
      
      return vehicleObj;
    });

    res.status(200).json({
      status: 'success',
      results: transformedVehicles.length,
      data: {
        vehicles: transformedVehicles
      }
    });
  } catch (err) {
    console.error('[VEHICLE-BRANCH-DEBUG] Error:', err);
    logger.error(`Error getting vehicles by branch: ${err.message}`);
    next(new AppError('Server Error', 500));
  }
};

exports.getVehicleByChassisNumber = async (req, res, next) => {
  try {
    const { chassisNumber } = req.params;

    if (!chassisNumber) {
      return next(new AppError('Chassis number is required', 400));
    }

    const vehicle = await Vehicle.findOne({ chassisNumber: chassisNumber.toUpperCase() })
      .populate(populateOptions);

    if (!vehicle) {
      return next(new AppError('No vehicle found with that chassis number', 404));
    }

    const vehicleObj = vehicle.toObject();
    
    if (!vehicleObj.unloadLocation) {
      vehicleObj.unloadLocation = {
        _id: vehicle.unloadLocation,
        name: 'Unknown Location'
      };
    }
    
    if (!vehicleObj.addedBy) {
      vehicleObj.addedBy = {
        _id: vehicle.addedBy,
        name: 'Unknown User'
      };
    }

    res.status(200).json({
      status: 'success',
      data: {
        vehicle: vehicleObj
      }
    });
  } catch (err) {
    logger.error(`Error getting vehicle by chassis number: ${err.message}`);
    next(new AppError('Server Error', 500));
  }
};

exports.getModelDetails = async (req, res, next) => {
  try {
    const { model } = req.params;
    
    if (!model) {
      return next(new AppError('Model name is required', 400));
    }

    // Get all vehicles of this model
    const vehicles = await Vehicle.find({ model })
      .select('chassisNumber color')
      .sort({ chassisNumber: 1 });

    if (vehicles.length === 0) {
      return res.status(200).json({
        status: 'success',
        results: 0,
        data: {
          model,
          chassisNumbers: [],
          color: []
        }
      });
    }

    // Extract unique chassis numbers
    const chassisNumbers = [...new Set(vehicles.map(v => v.chassisNumber))];

    // Extract unique colors
    const colorMap = new Map();
    vehicles.forEach(vehicle => {
      if (vehicle.color && vehicle.color.id && vehicle.color.name) {
        colorMap.set(vehicle.color.id.toString(), {
          id: vehicle.color.id,
          name: vehicle.color.name
        });
      }
    });
    const colors = Array.from(colorMap.values());

    res.status(200).json({
      status: 'success',
      results: chassisNumbers.length,
      data: {
        model,
        chassisNumbers,
        colors
      }
    });
  } catch (err) {
    logger.error(`Error getting model details: ${err.message}`);
    next(new AppError('Server Error', 500));
  }
};
/**
 * @route  GET /api/exports/vehicles-csv
 * @query  type=EV|ICE&branch_id=<ObjectId>
 * @desc   Stream a CSV export of vehicles for a given branch and vehicle type.
 */
exports.exportCSVTemplate = async (req, res, next) => {
  try {
    let { type, branch_id } = req.query;

    // ---- Validate inputs ----------------------------------------------------
    if (!branch_id || !mongoose.Types.ObjectId.isValid(branch_id)) {
      return next(new AppError("Invalid branch ID", 400));
    }

    if (!type) {
      return next(new AppError("Query param 'type' is required (EV or ICE)", 400));
    }

    type = String(type).trim().toUpperCase();
    const ALLOWED_TYPES = new Set(["EV", "ICE"]);
    if (!ALLOWED_TYPES.has(type)) {
      return next(new AppError("Invalid type. Allowed: EV or ICE", 400));
    }

    // ---- Fetch branch -------------------------------------------------------
    const branch = await Branch.findById(branch_id).lean();
    if (!branch) return next(new AppError("Branch not found", 404));

    // ---- Fetch vehicles for branch & type ----------------------------------
    const vehicles = await Vehicle.find({
      type,
      unloadLocation: branch._id
    })
      .populate('model', 'model_name') // Populate the model to get the name
      .select(
        "model modelName color batteryNumber keyNumber chassisNumber engineNumber motorNumber chargerNumber"
      )
      .sort({ model: 1, chassisNumber: 1 })
      .lean();

    // ---- Find duplicate chassis numbers (scoped to this branch & type) -----
    const dupes = await Vehicle.aggregate([
      {
        $match: {
          type,
          unloadLocation: new mongoose.Types.ObjectId(branch._id)
        }
      },
      {
        $group: {
          _id: "$chassisNumber",
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // ---- Build CSV rows -----------------------------------------------------
    const csvData = [];

    // Meta section
    csvData.push(["BRANCH:", branch.name || ""]);
    csvData.push(["ADDRESS:", branch.address || ""]);
    csvData.push(["VEHICLE TYPE:", type]);
    csvData.push(["EXPORT DATE:", new Date().toLocaleString("en-IN")]);

    if (dupes.length > 0) {
      csvData.push([]);
      csvData.push([
        "WARNING:",
        `${dupes.length} DUPLICATE CHASSIS NUMBERS IN THIS BRANCH (${type})`
      ]);
    }

    csvData.push([]);

    // Headers (as requested)
    const headers =
      type === "EV"
        ? [
            "Vehicle Model",
            "Color",
            "Battery No",
            "Key No",
            "Chassis No",
            "Engine No",
            "Motor No",
            "Charger No"
          ]
        : ["Vehicle Model", "Color", "Battery No", "Key No", "Chassis No", "Engine No"];

    csvData.push(headers);

    // Data rows
    for (const v of vehicles) {
      const color =
        (v.color && typeof v.color === "object" && v.color.name) ||
        (typeof v.color === "string" ? v.color : null) ||
        "N/A";

      // Use model.model_name if populated, otherwise fall back to modelName
      const modelName = v.model?.model_name || v.modelName || "N/A";

      if (type === "EV") {
        csvData.push([
          modelName,
          color,
          v.batteryNumber || "",
          v.keyNumber || "",
          v.chassisNumber || "",
          v.engineNumber || "",
          v.motorNumber || "",
          v.chargerNumber || ""
        ]);
      } else {
        csvData.push([
          modelName,
          color,
          v.batteryNumber || "",
          v.keyNumber || "",
          v.chassisNumber || "",
          v.engineNumber || ""
        ]);
      }
    }

    // If no vehicles, still provide just the headers so it's a "template"
    if (vehicles.length === 0) {
      csvData.push(
        ...(type === "EV"
          ? [["", "", "", "", "", "", "", ""]]
          : [["", "", "", "", "", ""]])
      );
    }

    // ---- Stream CSV to response --------------------------------------------
    const safeBranchName = (branch.name || "branch").replace(/[^\w\-]+/g, "_");
    const filename = `${safeBranchName}_${type}_${Date.now()}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

    const stringifier = stringify({ header: false });
    stringifier.on("error", (err) => {
      // If streaming fails, hand off to error middleware
      next(new AppError(`CSV stream error: ${err.message}`, 500));
    });

    stringifier.pipe(res);
    for (const row of csvData) {
      stringifier.write(row);
    }
    stringifier.end();
  } catch (err) {
    next(new AppError(err?.message || "Export failed", 500));
  }
};

exports.exportCSVTemplaterow = async (req, res, next) => {
  try {
    let { type, branch_id } = req.query;

    // ---- Validate inputs ----------------------------------------------------
    if (!branch_id || !mongoose.Types.ObjectId.isValid(branch_id)) {
      return next(new AppError("Invalid branch ID", 400));
    }

    if (!type) {
      return next(new AppError("Query param 'type' is required (EV or ICE)", 400));
    }

    type = String(type).trim().toUpperCase();
    const ALLOWED_TYPES = new Set(["EV", "ICE"]);
    if (!ALLOWED_TYPES.has(type)) {
      return next(new AppError("Invalid type. Allowed: EV or ICE", 400));
    }

    // ---- Fetch branch -------------------------------------------------------
    const branch = await Branch.findById(branch_id).lean();
    if (!branch) return next(new AppError("Branch not found", 404));

    // ---- Build CSV rows (template only, no data) ----------------------------
    const csvData = [];

    // Meta section
    csvData.push(["BRANCH:", branch.name || ""]);
    csvData.push(["ADDRESS:", branch.address || ""]);
    csvData.push(["VEHICLE TYPE:", type]);
    csvData.push(["EXPORT DATE:", new Date().toLocaleString("en-IN")]);
    csvData.push(["NOTE:", "This is a template file. Fill in the data below."]);
    csvData.push([]);

    // Headers (as requested)
    const headers =
      type === "EV"
        ? [
            "Vehicle Model",
            "Color",
            "Battery No",
            "Key No",
            "Chassis No",
            "Engine No",
            "Motor No",
            "Charger No"
          ]
        : ["Vehicle Model", "Color", "Battery No", "Key No", "Chassis No", "Engine No"];

    csvData.push(headers);

    // Add empty rows for data entry (5 empty rows as example)
    for (let i = 0; i < 5; i++) {
      csvData.push(
        type === "EV"
          ? ["", "", "", "", "", "", "", ""]
          : ["", "", "", "", "", ""]
      );
    }

    // ---- Stream CSV to response --------------------------------------------
    const safeBranchName = (branch.name || "branch").replace(/[^\w\-]+/g, "_");
    const filename = `${safeBranchName}_${type}_TEMPLATE_${Date.now()}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

    const stringifier = stringify({ header: false });
    stringifier.on("error", (err) => {
      // If streaming fails, hand off to error middleware
      next(new AppError(`CSV stream error: ${err.message}`, 500));
    });

    stringifier.pipe(res);
    for (const row of csvData) {
      stringifier.write(row);
    }
    stringifier.end();
  } catch (err) {
    next(new AppError(err?.message || "Export failed", 500));
  }
};
// Define the importCSV function as an async function that handles CSV imports
exports.importCSV = async (req, res, next) => {
  try {
    // 1. Check if file was uploaded
    if (!req.file) {
      return next(new AppError('Please upload a CSV file', 400));
    }

    // 2. Extract query parameters
    const { type, branch_id } = req.query;

    // 3. Validate type parameter
    if (!type || !['EV', 'ICE'].includes(type.toUpperCase())) {
      return next(new AppError('Type is required and must be EV or ICE', 400));
    }

    // 4. Validate branch_id parameter
    if (!branch_id || !mongoose.Types.ObjectId.isValid(branch_id)) {
      return next(new AppError('Valid branch ID is required', 400));
    }

    // 5. Check if branch exists
    const branchExists = await Branch.exists({ _id: branch_id });
    if (!branchExists) return next(new AppError('Branch not found', 404));

    // 6. Convert CSV buffer to string and clean it
    const csvString = req.file.buffer.toString('utf8').trim();
    const rows = csvString.split('\n').filter(row => row.trim() !== '');

    // 7. Find the header row
    let headerRowIndex = -1;
    const headerRow = rows.find((row, index) => {
      const normalizedRow = row.toLowerCase();
      if (normalizedRow.includes('chassis no') || normalizedRow.includes('chassisnumber')) {
        headerRowIndex = index;
        return true;
      }
      return false;
    });

    // 8. Validate header row exists
    if (!headerRow) {
      return next(new AppError('CSV must contain a valid header row with "Chassis No" or "chassisNumber"', 400));
    }

    // 9. Extract data rows (skip meta rows)
    const dataRows = rows.slice(headerRowIndex + 1).filter(row => {
      return row.trim() !== '' && 
             !row.startsWith('BRANCH:') && 
             !row.startsWith('ADDRESS:') && 
             !row.startsWith('VEHICLE TYPE:') && 
             !row.startsWith('EXPORT DATE:') &&
             !row.startsWith('WARNING:');
    });

    // 10. Validate there are data rows
    if (dataRows.length === 0) {
      return next(new AppError('CSV must contain data rows after the header', 400));
    }

    // 11. Define header mapping for CSV columns
    const headerMapping = {
      'vehicle model': 'model',
      'model': 'model',
      'color': 'color',
      'battery no': 'batteryNumber',
      'batterynumber': 'batteryNumber',
      'key no': 'keyNumber',
      'keynumber': 'keyNumber',
      'chassis no': 'chassisNumber',
      'chassisnumber': 'chassisNumber',
      'engine no': 'engineNumber',
      'enginenumber': 'engineNumber',
      'motor no': 'motorNumber',
      'motornumber': 'motorNumber',
      'charger no': 'chargerNumber',
      'chargernumber': 'chargerNumber'
    };

    // 12. Process headers
    const headers = headerRow.split(',')
      .map(h => h.trim().toLowerCase().replace(/"/g, ''))
      .filter(h => h !== '')
      .map(h => headerMapping[h] || h);

    // 13. Initialize counters and error collection
    const errors = [];
    let importedCount = 0;
    let updatedCount = 0;

    // 14. Process each data row
    for (const row of dataRows) {
      try {
        const vehicleData = {};
        // 15. Split row into cells and clean them
        const cells = row.split(',')
          .map(cell => cell.trim().replace(/^"|"$/g, ''))
          .filter(cell => cell !== '');

        // 16. Validate column count matches headers
        if (cells.length < headers.length) {
          errors.push(`Row ${rows.indexOf(row) + 1}: Not enough columns`);
          continue;
        }

        // 17. Map cells to vehicle data based on headers
        headers.forEach((header, index) => {
          const value = cells[index];
          if (value && value !== '') {
            switch (header) {
              case 'model':
                vehicleData.modelName = value;
                break;
              case 'color':
                vehicleData.colorName = value;
                break;
              case 'batteryNumber':
                vehicleData.batteryNumber = value.toUpperCase();
                break;
              case 'keyNumber':
                vehicleData.keyNumber = value.toUpperCase();
                break;
              case 'chassisNumber':
                vehicleData.chassisNumber = value.toUpperCase();
                break;
              case 'motorNumber':
                vehicleData.motorNumber = value.toUpperCase();
                break;
              case 'chargerNumber':
                vehicleData.chargerNumber = value.toUpperCase();
                break;
              case 'engineNumber':
                vehicleData.engineNumber = value.toUpperCase();
                break;
            }
          }
        });

        // 18. Validate required fields
        if (!vehicleData.modelName || !vehicleData.chassisNumber) {
          errors.push(`Row ${rows.indexOf(row) + 1}: Missing required fields (model, chassisNumber)`);
          continue;
        }

        if (!vehicleData.colorName) {
          errors.push(`Row ${rows.indexOf(row) + 1}: Color is required`);
          continue;
        }

        // 19. Handle model - try to find in Model collection
        const model = await Model.findOne({ 
          model_name: { $regex: new RegExp(`^${vehicleData.modelName}$`, 'i') } 
        });
        
        // 20. If model exists, use its ID and proper name
        if (model) {
          vehicleData.model = model._id;
          vehicleData.modelName = model.model_name;
        } else {
          // 21. If model doesn't exist, just use the name from CSV
          vehicleData.modelName = vehicleData.modelName;
          // Leave model reference undefined
        }

        // 22. Handle color - find or create
        let color = await Color.findOne({ 
          name: { $regex: new RegExp(`^${vehicleData.colorName}$`, 'i') } 
        });
        
        if (!color) {
          color = await Color.create({
            name: vehicleData.colorName,
            status: 'active',
            addedBy: req.user.id
          });
        }
        vehicleData.colors = [color._id];
        vehicleData.color = {
          id: color._id,
          name: color.name
        };
        delete vehicleData.colorName;

        // 23. Validate type-specific fields
        const normalizedType = type.toUpperCase();
        if (normalizedType === 'EV') {
          if (!vehicleData.motorNumber) {
            errors.push(`Row ${rows.indexOf(row) + 1}: Missing required field for EV (motorNumber)`);
            continue;
          }
          if (!vehicleData.chargerNumber) {
            errors.push(`Row ${rows.indexOf(row) + 1}: Missing required field for EV (chargerNumber)`);
            continue;
          }
        }

        if (normalizedType === 'ICE' && !vehicleData.engineNumber) {
          errors.push(`Row ${rows.indexOf(row) + 1}: Missing required field for ICE (engineNumber)`);
          continue;
        }

        // 24. Set common vehicle data
        vehicleData.type = normalizedType;
        vehicleData.unloadLocation = branch_id;
        vehicleData.addedBy = req.user.id;
        vehicleData.status = 'not_approved';

        // 25. Check if vehicle already exists
        const existingVehicle = await Vehicle.findOne({ chassisNumber: vehicleData.chassisNumber });

        if (existingVehicle) {
          // 26. Update existing vehicle
          const update = {
            ...vehicleData,
            lastUpdatedBy: req.user.id
          };
          await Vehicle.findByIdAndUpdate(existingVehicle._id, update);
          updatedCount++;
        } else {
          // 27. Create new vehicle
          await Vehicle.create(vehicleData);
          importedCount++;
        }

      } catch (rowError) {
        // 28. Catch and record any row processing errors
        errors.push(`Row ${rows.indexOf(row) + 1}: ${rowError.message}`);
      }
    }

    // 29. Return import results
    res.status(200).json({
      status: 'success',
      message: 'CSV import completed',
      imported: importedCount,
      updated: updatedCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (err) {
    // 30. Handle any unexpected errors
    logger.error(`Error importing CSV: ${err.message}`);
    next(new AppError('Error processing CSV file', 500));
  }
};

exports.getChassisNumbersByModel = async (req, res, next) => {
  try {
    const { model } = req.params;
    
    if (!model) {
      return next(new AppError('Model name is required', 400));
    }

    const vehicles = await Vehicle.find({ model })
      .select('chassisNumber model')
      .sort({ chassisNumber: 1 });

    const chassisNumbers = vehicles.map(vehicle => ({
      chassisNumber: vehicle.chassisNumber,
      model: vehicle.model
    }));

    res.status(200).json({
      status: 'success',
      results: chassisNumbers.length,
      data: {
        chassisNumbers
      }
    });
  } catch (err) {
    logger.error(`Error getting chassis numbers by model: ${err.message}`);
    next(new AppError('Server Error', 500));
  }
};

exports.getVehiclesByStatus = async (req, res, next) => {
  try {
    const { status } = req.params;
    const { page = 1, limit = 1000 } = req.query;

    // Validate status
    const validStatuses = ['not_approved', 'in_stock', 'in_transit', 'sold', 'service', 'damaged'];
    if (!validStatuses.includes(status)) {
      return next(new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400));
    }

    // Convert page and limit to numbers
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);

    // Create query with pagination
    const query = Vehicle.find({ status })
      .populate(populateOptions)
      .sort({ createdAt: -1 }) // Newest first
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber);

    const vehicles = await query;

    // Get total count for pagination info
    const total = await Vehicle.countDocuments({ status });

    // Transform vehicles to include branch and user details
    const transformedVehicles = vehicles.map(vehicle => {
      const vehicleObj = vehicle.toObject();
      
      if (!vehicleObj.unloadLocation) {
        vehicleObj.unloadLocation = {
          _id: vehicle.unloadLocation,
          name: 'Unknown Location'
        };
      }
      
      if (!vehicleObj.addedBy) {
        vehicleObj.addedBy = {
          _id: vehicle.addedBy,
          name: 'Unknown User'
        };
      }
      
      return vehicleObj;
    });

    res.status(200).json({
      status: 'success',
      results: transformedVehicles.length,
      total,
      currentPage: pageNumber,
      totalPages: Math.ceil(total / limitNumber),
      data: {
        vehicles: transformedVehicles
      }
    });
  } catch (err) {
    logger.error(`Error getting vehicles by status: ${err.message}`);
    next(new AppError('Server Error', 500));
  }
};
// Replace the exportCSVTemplate function with this Excel export function
exports.exportExcelWithSheets = async (req, res, next) => {
  try {
    let { type, branch_id } = req.query;

    // ---- Validate inputs ----------------------------------------------------
    if (!branch_id || !mongoose.Types.ObjectId.isValid(branch_id)) {
      return next(new AppError("Invalid branch ID", 400));
    }

    if (!type) {
      return next(new AppError("Query param 'type' is required (EV or ICE)", 400));
    }

    type = String(type).trim().toUpperCase();
    const ALLOWED_TYPES = new Set(["EV", "ICE"]);
    if (!ALLOWED_TYPES.has(type)) {
      return next(new AppError("Invalid type. Allowed: EV or ICE", 400));
    }

    // ---- Fetch branch -------------------------------------------------------
    const branch = await Branch.findById(branch_id).lean();
    if (!branch) return next(new AppError("Branch not found", 404));

    // ---- Get all models and colors from master data -------------------------
    const allModels = await Model.find({ status: 'active' })
      .populate('colors', 'name')
      .select('model_name colors')
      .lean();
    
    // Create a map of model names to their available colors
    const modelColorMap = new Map();
    allModels.forEach(model => {
      const colorNames = model.colors.map(color => color.name);
      modelColorMap.set(model.model_name, colorNames);
    });

    // ---- Fetch vehicles for branch & type ----------------------------------
    const vehicles = await Vehicle.find({
      type,
      unloadLocation: branch._id
    })
      .populate('model', 'model_name')
      .select(
        "model modelName color batteryNumber keyNumber chassisNumber engineNumber motorNumber chargerNumber"
      )
      .sort({ model: 1, chassisNumber: 1 })
      .lean();

    // ---- Find duplicate chassis numbers (scoped to this branch & type) -----
    const dupes = await Vehicle.aggregate([
      {
        $match: {
          type,
          unloadLocation: new mongoose.Types.ObjectId(branch._id)
        }
      },
      {
        $group: {
          _id: "$chassisNumber",
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // ---- Create Excel workbook ---------------------------------------------
    const workbook = new excel.Workbook();
    
    // Create styles
    const headerStyle = workbook.createStyle({
      font: { bold: true, color: '#FFFFFF' },
      fill: { type: 'pattern', patternType: 'solid', fgColor: '#4472C4' },
      alignment: { horizontal: 'center' }
    });
    
    const titleStyle = workbook.createStyle({
      font: { bold: true, size: 14 }
    });
    
    const noteStyle = workbook.createStyle({
      font: { italic: true }
    });
    
    const warningStyle = workbook.createStyle({
      font: { bold: true, color: '#FF0000' }
    });

    // ---- Sheet 1: Template -------------------------------------------------
    const templateSheet = workbook.addWorksheet('Template');
    
    // Add metadata
    templateSheet.cell(1, 1).string('BRANCH:').style(titleStyle);
    templateSheet.cell(1, 2).string(branch.name || '');
    
    templateSheet.cell(2, 1).string('VEHICLE TYPE:').style(titleStyle);
    templateSheet.cell(2, 2).string(type);
    
    templateSheet.cell(3, 1).string('NOTE:').style(titleStyle);
    templateSheet.cell(3, 2).string('Fill your data in this sheet for import').style(noteStyle);
    
    // Add warning if duplicates exist
    if (dupes.length > 0) {
      templateSheet.cell(5, 1).string('WARNING:').style(warningStyle);
      templateSheet.cell(5, 2).string(`${dupes.length} DUPLICATE CHASSIS NUMBERS IN THIS BRANCH (${type})`).style(warningStyle);
    }
    
    // Add headers
    const headers = type === "EV"
      ? ["Vehicle Model", "Color", "Battery No", "Key No", "Chassis No", "Engine No", "Motor No", "Charger No"]
      : ["Vehicle Model", "Color", "Battery No", "Key No", "Chassis No", "Engine No"];
    
    let row = 7;
    headers.forEach((header, index) => {
      templateSheet.cell(row, index + 1).string(header).style(headerStyle);
    });
    
    // Add empty rows for data entry (10 empty rows)
    for (let i = 1; i <= 10; i++) {
      headers.forEach((_, index) => {
        templateSheet.cell(row + i, index + 1).string('');
      });
    }

    // ---- Sheet 2: Master Data Reference ------------------------------------
    const masterSheet = workbook.addWorksheet('Master Data Reference');

    // Add metadata
    masterSheet.cell(1, 1).string('MASTER DATA REFERENCE').style(titleStyle);
    masterSheet.cell(2, 1).string('Valid Model and Color Combinations').style(titleStyle);

    // Add headers
    masterSheet.cell(4, 1).string('Model').style(headerStyle);
    masterSheet.cell(4, 2).string('Color').style(headerStyle);

    // Add model and color data as individual rows
    let masterRow = 5;
    for (const [modelName, colors] of modelColorMap.entries()) {
      if (colors && colors.length > 0) {
        for (const color of colors) {
          masterSheet.cell(masterRow, 1).string(modelName);
          masterSheet.cell(masterRow, 2).string(color);
          masterRow++;
        }
      } else {
        // If no colors available for this model
        masterSheet.cell(masterRow, 1).string(modelName);
        masterSheet.cell(masterRow, 2).string('No colors available');
        masterRow++;
      }
    }

    // ---- Send Excel file ---------------------------------------------------
    const safeBranchName = (branch.name || "branch").replace(/[^\w\-]+/g, "_");
    const filename = `${safeBranchName}_${type}_${Date.now()}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    workbook.write(filename, res);

  } catch (err) {
    next(new AppError(err?.message || "Export failed", 500));
  }
};
// Update the importCSV function to handle Excel files
exports.importExcel = async (req, res, next) => {
  try {
    // 1. Check if file was uploaded
    if (!req.file) {
      return next(new AppError('Please upload an Excel file', 400));
    }

    // 2. Extract query parameters
    const { type, branch_id } = req.query;

    // 3. Validate type parameter
    if (!type || !['EV', 'ICE'].includes(type.toUpperCase())) {
      return next(new AppError('Type is required and must be EV or ICE', 400));
    }

    // 4. Validate branch_id parameter
    if (!branch_id || !mongoose.Types.ObjectId.isValid(branch_id)) {
      return next(new AppError('Valid branch ID is required', 400));
    }

    // 5. Check if branch exists
    const branchExists = await Branch.exists({ _id: branch_id });
    if (!branchExists) return next(new AppError('Branch not found', 404));

    // 6. Check file type
    if (!req.file.originalname.endsWith('.xlsx') && !req.file.originalname.endsWith('.xls')) {
      return next(new AppError('Only Excel files (.xlsx, .xls) are allowed', 400));
    }

    // 7. Parse Excel file using exceljs
    const workbook = new ExcelJS.Workbook();
    
    try {
      // Load the Excel file from buffer
      await workbook.xlsx.load(req.file.buffer);
      logger.info('Excel file loaded successfully');
    } catch (excelError) {
      logger.error(`Excel parsing error: ${excelError.message}`);
      logger.error(`File details: ${req.file.originalname}, size: ${req.file.size} bytes`);
      return next(new AppError('Invalid Excel file format. Please ensure you\'re uploading a valid Excel file.', 400));
    }
    
    // 8. Try to get the Template sheet or first sheet
    let templateSheet = workbook.getWorksheet('Template');
    if (!templateSheet) {
      // Fallback to first sheet if Template sheet doesn't exist
      templateSheet = workbook.worksheets[0];
      if (!templateSheet) {
        return next(new AppError('No worksheets found in Excel file', 400));
      }
      logger.info('Using first sheet as Template sheet was not found');
    }

    // 9. Find the header row by searching for column headers
    let headerRowIndex = -1;
    let headers = [];
    
    // Define possible header variations
    const possibleHeaders = [
      'vehicle model', 'model', 'color', 'battery no', 'batterynumber',
      'key no', 'keynumber', 'chassis no', 'chassisnumber', 
      'engine no', 'enginenumber', 'motor no', 'motornumber',
      'charger no', 'chargernumber'
    ];

    // Search for header row
    for (let rowNumber = 1; rowNumber <= templateSheet.rowCount; rowNumber++) {
      const row = templateSheet.getRow(rowNumber);
      let headerCount = 0;
      const currentHeaders = [];
      
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (cell.value && typeof cell.value === 'string') {
          const cellValue = cell.value.toString().trim().toLowerCase();
          currentHeaders.push(cellValue);
          
          if (possibleHeaders.includes(cellValue)) {
            headerCount++;
          }
        }
      });
      
      // If we found at least 3 matching headers, consider this the header row
      if (headerCount >= 3) {
        headerRowIndex = rowNumber;
        headers = currentHeaders;
        logger.info(`Found header row at index ${headerRowIndex} with headers: ${headers.join(', ')}`);
        break;
      }
    }

    if (headerRowIndex === -1 || headers.length === 0) {
      return next(new AppError('Could not identify header row in Excel file. Please ensure your file has proper column headers.', 400));
    }

    // 10. Map Excel headers to our field names
    const headerMapping = {
      'vehicle model': 'model',
      'model': 'model',
      'color': 'color',
      'battery no': 'batteryNumber',
      'batterynumber': 'batteryNumber',
      'key no': 'keyNumber',
      'keynumber': 'keyNumber',
      'chassis no': 'chassisNumber',
      'chassisnumber': 'chassisNumber',
      'engine no': 'engineNumber',
      'enginenumber': 'engineNumber',
      'motor no': 'motorNumber',
      'motornumber': 'motorNumber',
      'charger no': 'chargerNumber',
      'chargernumber': 'chargerNumber'
    };

    const mappedHeaders = headers.map(h => headerMapping[h] || h);

    // 11. Extract data rows from Template sheet
    const dataRows = [];
    for (let i = headerRowIndex + 1; i <= templateSheet.rowCount; i++) {
      const row = templateSheet.getRow(i);
      const rowData = {};
      let isEmpty = true;
      
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = mappedHeaders[colNumber - 1];
        if (header && cell.value !== null && cell.value !== undefined && cell.value !== '') {
          rowData[header] = cell.value.toString().trim();
          isEmpty = false;
        }
      });
      
      if (!isEmpty) {
        dataRows.push(rowData);
      }
    }

    // 12. Validate there are data rows
    if (dataRows.length === 0) {
      return next(new AppError('No data found in Excel file. Please ensure you have entered data in the Template sheet.', 400));
    }

    logger.info(`Found ${dataRows.length} data rows to process`);

    // 13. Process each data row - REMOVED I/O/Q VALIDATION
    const errors = [];
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let modelColorValidationCount = 0;
    
    // Cache for model-color validation to avoid repeated DB queries
    const modelColorValidationCache = new Map();

    // Helper function to escape regex special characters
    const escapeRegex = (string) => {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    // Function to validate model exists and has the color mapped
    // Fix the validateModelAndColor function in importExcel:
   // Fix the validateModelAndColor function in importExcel:
const validateModelAndColor = async (modelName, colorName) => {
  const cacheKey = `${modelName.toLowerCase()}_${colorName.toLowerCase()}`;
  
  if (modelColorValidationCache.has(cacheKey)) {
    return modelColorValidationCache.get(cacheKey);
  }

  try {
    console.log(`[VALIDATION] Validating model: "${modelName}", color: "${colorName}"`);
    
    // STEP 1: Find the model by name (case-insensitive)
    const escapedModelName = escapeRegex(modelName.trim());
    const model = await Model.findOne({ 
      model_name: { $regex: new RegExp(`^${escapedModelName}$`, 'i') },
      status: 'active'
    }).populate({
      path: 'colors',
      select: 'name _id',
      match: { status: 'active' }
    });

    if (!model) {
      console.log(`[VALIDATION] Model "${modelName}" not found`);
      const result = {
        isValid: false,
        modelFound: false,
        model: null,
        color: null,
        message: `Model "${modelName}" not found in master data`
      };
      modelColorValidationCache.set(cacheKey, result);
      return result;
    }

    console.log(`[VALIDATION] Found model: ${model.model_name}`);
    
    // STEP 2: Find the color by name (case-insensitive)
    const escapedColorName = escapeRegex(colorName.trim());
    const color = await Color.findOne({ 
      name: { $regex: new RegExp(`^${escapedColorName}$`, 'i') },
      status: 'active'
    }).populate({
      path: 'models',
      select: 'model_name _id',
      match: { status: 'active' }
    });

    if (!color) {
      console.log(`[VALIDATION] Color "${colorName}" not found`);
      const result = {
        isValid: false,
        modelFound: true,
        model: model,
        color: null,
        message: `Color "${colorName}" not found in master data`
      };
      modelColorValidationCache.set(cacheKey, result);
      return result;
    }

    console.log(`[VALIDATION] Found color: ${color.name}`);
    
    // ========== CRITICAL FIX: Compare by MODEL NAME ==========
    
    // 1. Check if color has this model in its models array (by model name)
    let colorHasModel = false;
    if (color.models && Array.isArray(color.models)) {
      // Convert both model names to lowercase for comparison
      const modelNameLower = model.model_name.toLowerCase().trim();
      
      colorHasModel = color.models.some(colorModel => {
        const colorModelName = (colorModel.model_name || '').toLowerCase().trim();
        return colorModelName === modelNameLower;
      });
      
      console.log(`[VALIDATION] Color "${color.name}" has ${color.models.length} models mapped:`);
      color.models.forEach((m, i) => {
        console.log(`  [${i}] ${m.model_name} (matches "${model.model_name}"? ${m.model_name.toLowerCase() === modelNameLower})`);
      });
    }

    // 2. Check if model has this color in its colors array
    let modelHasColor = false;
    if (model.colors && Array.isArray(model.colors)) {
      const colorNameLower = color.name.toLowerCase().trim();
      
      modelHasColor = model.colors.some(modelColor => {
        const modelColorName = (modelColor.name || '').toLowerCase().trim();
        return modelColorName === colorNameLower;
      });
      
      console.log(`[VALIDATION] Model "${model.model_name}" has ${model.colors.length} colors mapped:`);
      model.colors.forEach((c, i) => {
        console.log(`  [${i}] ${c.name} (matches "${color.name}"? ${c.name.toLowerCase() === colorNameLower})`);
      });
    }

    console.log(`[VALIDATION] Color has model (by name): ${colorHasModel}`);
    console.log(`[VALIDATION] Model has color (by name): ${modelHasColor}`);

    // If EITHER direction has the mapping, consider it valid
    const isValidMapping = colorHasModel || modelHasColor;

    if (!isValidMapping) {
      console.log(`[VALIDATION] Model "${model.model_name}" and color "${color.name}" are not mapped in either direction`);
      
      const result = {
        isValid: false,
        modelFound: true,
        colorFound: true,
        model: model,
        color: color,
        message: `Model "${model.model_name}" does not have color "${color.name}" mapped to it`
      };
      modelColorValidationCache.set(cacheKey, result);
      return result;
    }

    // Valid combination
    console.log(`[VALIDATION] ✓ Valid combination: ${model.model_name} with ${color.name}`);
    const result = {
      isValid: true,
      model: model,
      color: color,
      message: `Model "${model.model_name}" and color "${color.name}" are valid`
    };
    modelColorValidationCache.set(cacheKey, result);
    return result;

  } catch (error) {
    console.error(`[VALIDATION] Error validating model and color: ${error.message}`);
    console.error(error.stack);
    const result = {
      isValid: false,
      model: null,
      color: null,
      message: `Validation error: ${error.message}`
    };
    modelColorValidationCache.set(cacheKey, result);
    return result;
  }
};
    for (const [index, rowData] of dataRows.entries()) {
      try {
        const vehicleData = {};
        
        // Map row data to vehicle data
        Object.keys(rowData).forEach(key => {
          const value = rowData[key];
          if (value && value !== '') {
            switch (key) {
              case 'model':
                vehicleData.modelName = value;
                break;
              case 'color':
                vehicleData.colorName = value;
                break;
              case 'batteryNumber':
                vehicleData.batteryNumber = value.toUpperCase();
                break;
              case 'keyNumber':
                vehicleData.keyNumber = value.toUpperCase();
                break;
              case 'chassisNumber':
                // REMOVED I/O/Q RESTRICTION - Allowing all characters
                vehicleData.chassisNumber = value.toUpperCase();
                break;
              case 'motorNumber':
                vehicleData.motorNumber = value.toUpperCase();
                break;
              case 'chargerNumber':
                vehicleData.chargerNumber = value.toUpperCase();
                break;
              case 'engineNumber':
                vehicleData.engineNumber = value.toUpperCase();
                break;
            }
          }
        });

        // Validate required fields - SKIP ROW if missing chassisNumber
        if (!vehicleData.chassisNumber) {
          errors.push(`Row ${index + 1}: Skipped - Missing required field (chassisNumber)`);
          skippedCount++;
          continue;
        }

        // REMOVED: I/O/Q validation for chassis number
        // OLD CODE THAT RESTRICTED I, O, Q:
        // if (/[IOQ]/i.test(vehicleData.chassisNumber)) {
        //   errors.push(`Row ${index + 1}: Skipped - Chassis number cannot contain I, O, or Q`);
        //   skippedCount++;
        //   continue;
        // }

        // Validate required fields - SKIP ROW if missing model
        if (!vehicleData.modelName) {
          errors.push(`Row ${index + 1}: Skipped - Missing required field (model)`);
          skippedCount++;
          continue;
        }

        // Validate required fields - SKIP ROW if missing color
        if (!vehicleData.colorName) {
          errors.push(`Row ${index + 1}: Skipped - Color is required`);
          skippedCount++;
          continue;
        }

        // ========== CRITICAL VALIDATION: Check if model exists and has color mapped ==========
        const validationResult = await validateModelAndColor(
          vehicleData.modelName, 
          vehicleData.colorName
        );
        modelColorValidationCount++;

        if (!validationResult.isValid) {
          errors.push(`Row ${index + 1}: Skipped - ${validationResult.message}`);
          skippedCount++;
          continue;
        }

        // Model and color are valid, use the model and color from validation
        const model = validationResult.model;
        const color = validationResult.color;
        
        // Set model reference
        vehicleData.model = model._id;
        vehicleData.modelName = model.model_name;
        
        // Determine vehicle type from model
        let vehicleType = 'ICE'; // Default to ICE
        if (model.type) {
          if (model.type.toUpperCase().includes('EV') || model.type.toUpperCase().includes('ELECTRIC')) {
            vehicleType = 'EV';
          } else {
            vehicleType = 'ICE';
          }
        }
        
        // Set color reference
        vehicleData.colors = [color._id];
        vehicleData.color = {
          id: color._id,
          name: color.name
        };
        delete vehicleData.colorName;

        // Validate type-specific required fields - SKIP ROW if missing
        const normalizedType = type.toUpperCase();
        if (normalizedType === 'EV') {
          if (!vehicleData.motorNumber) {
            errors.push(`Row ${index + 1}: Skipped - Missing required field for EV (motorNumber)`);
            skippedCount++;
            continue;
          }
        }

        if (normalizedType === 'ICE' && !vehicleData.engineNumber) {
          errors.push(`Row ${index + 1}: Skipped - Missing required field for ICE (engineNumber)`);
          skippedCount++;
          continue;
        }

        // Set common vehicle data
        vehicleData.type = vehicleType; // Use type from model validation, not from query
        vehicleData.unloadLocation = branch_id;
        vehicleData.addedBy = req.user.id;
        vehicleData.status = 'not_approved';

        // Check if vehicle already exists
        const existingVehicle = await Vehicle.findOne({ chassisNumber: vehicleData.chassisNumber });
        if (existingVehicle) {
          // Update existing vehicle
          const update = {
            ...vehicleData,
            lastUpdatedBy: req.user.id
          };
          await Vehicle.findByIdAndUpdate(existingVehicle._id, update);
          updatedCount++;
          logger.info(`Updated vehicle with chassis: ${vehicleData.chassisNumber}`);
        } else {
          // Create new vehicle
          const newVehicle = await Vehicle.create(vehicleData);
          
          // Generate QR code
          try {
            const qrCodePath = await generateVehicleQRCode(newVehicle);
            newVehicle.qrCode = qrCodePath;
            await newVehicle.save();
          } catch (qrError) {
            logger.error(`Failed to generate QR for ${vehicleData.chassisNumber}: ${qrError.message}`);
          }
          
          importedCount++;
          logger.info(`Imported new vehicle with chassis: ${vehicleData.chassisNumber}`);
        }
      } catch (rowError) {
        logger.error(`Error processing row ${index + 1}: ${rowError.message}`);
        errors.push(`Row ${index + 1}: ${rowError.message}`);
      }
    }

    // 14. Return import results
    res.status(200).json({
      status: 'success',
      message: 'Excel import completed',
      data: {
        imported: importedCount,
        updated: updatedCount,
        skipped: skippedCount,
        totalProcessed: dataRows.length,
        modelColorValidations: modelColorValidationCount,
        cacheSize: modelColorValidationCache.size,
        errors: errors.length > 0 ? errors : undefined
      }
    });

  } catch (err) {
    logger.error(`Error importing Excel: ${err.message}`);
    logger.error(err.stack);
    next(new AppError('Error processing Excel file. Please ensure the file is a valid Excel format.', 500));
  }
};
// controllers/vehicleInwardController.js  (only the updateVehicle export)

// controllers/vehicleInwardController.js

exports.updateVehicle = async (req, res, next) => {
  try {
    const { vehicleId } = req.params;

    // 1) Validate path id + load existing
    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
      return next(new AppError('Invalid vehicle ID format', 400));
    }
    const existing = await Vehicle.findById(vehicleId);
    if (!existing) return next(new AppError('No vehicle found with that ID', 404));

    // 2) Never allow these from the client
    const BLOCKED = ['qrCode', 'qrCodeImage', 'addedBy', 'createdAt', 'updatedAt', '_id'];
    for (const f of BLOCKED) if (f in req.body) delete req.body[f];

    // 3) Gather inputs (all optional)
    const {
      model,              // string: ModelObjectId OR plain model name
      type,               // 'EV' | 'ICE'
      unloadLocation,     // Branch ObjectId
      color,              // { id: ColorId }
      batteryNumber,
      keyNumber,
      motorNumber,
      chargerNumber,
      engineNumber,
      hasDamage,
      chassisNumber       // << ALLOWED now
    } = req.body;

    const $set = { lastUpdatedBy: req.user.id };
    const $unset = {};

    // ---- MODEL (accept id or name) ----
    if (typeof model !== 'undefined') {
      if (typeof model === 'string' && mongoose.Types.ObjectId.isValid(model)) {
        const modelDoc = await Model.findById(model).select('model_name type');
        if (!modelDoc) return next(new AppError('Model not found', 404));
        $set.model = modelDoc._id;
        $set.modelName = modelDoc.model_name;
        if (typeof type === 'undefined' && modelDoc.type) $set.type = modelDoc.type;
      } else if (typeof model === 'string') {
        const trimmed = model.trim();
        if (!trimmed) return next(new AppError('Model name cannot be empty', 400));
        const byName = await Model.findOne({
          model_name: { $regex: new RegExp(`^${trimmed}$`, 'i') }
        }).select('model_name type');
        if (byName) {
          $set.model = byName._id;
          $set.modelName = byName.model_name;
          if (typeof type === 'undefined' && byName.type) $set.type = byName.type;
        } else {
          $set.modelName = trimmed; // free-text model
          $unset.model = '';
        }
      } else {
        return next(new AppError('Invalid model format. Send a modelId string or a model name string.', 400));
      }
    }

    // ---- TYPE ----
    if (typeof type !== 'undefined') {
      const T = String(type).toUpperCase();
      if (!['EV', 'ICE'].includes(T)) {
        return next(new AppError('Invalid type. Allowed: EV or ICE', 400));
      }
      $set.type = T;
    }

    // ---- BRANCH ----
    if (typeof unloadLocation !== 'undefined') {
      if (!mongoose.Types.ObjectId.isValid(unloadLocation)) {
        return next(new AppError('Invalid branch ID format', 400));
      }
      const branchExists = await Branch.exists({ _id: unloadLocation });
      if (!branchExists) return next(new AppError('Branch not found', 404));
      $set.unloadLocation = unloadLocation;
    }

    // ---- COLOR ----
    if (typeof color !== 'undefined') {
      if (!color || !color.id || !mongoose.Types.ObjectId.isValid(color.id)) {
        return next(new AppError('Valid color with ID is required', 400));
      }
      const colorDoc = await Color.findById(color.id).select('name');
      if (!colorDoc) return next(new AppError('Color not found', 404));
      $set.color = { id: color.id, name: colorDoc.name };
      $set.colors = [color.id];
    }

    // ---- SERIALS (uppercase) ----
    if (typeof batteryNumber !== 'undefined') $set.batteryNumber = batteryNumber?.toUpperCase();
    if (typeof keyNumber !== 'undefined')     $set.keyNumber     = keyNumber?.toUpperCase();
    if (typeof motorNumber !== 'undefined')   $set.motorNumber   = motorNumber?.toUpperCase();
    if (typeof chargerNumber !== 'undefined') $set.chargerNumber = chargerNumber?.toUpperCase();
    if (typeof engineNumber !== 'undefined')  $set.engineNumber  = engineNumber?.toUpperCase();

    // ---- CHASSIS NUMBER (NOW UPDATABLE) ----
    if (typeof chassisNumber !== 'undefined') {
      const newChassis = String(chassisNumber).trim().toUpperCase();
      if (!newChassis) return next(new AppError('Chassis number cannot be empty', 400));

      if (newChassis !== existing.chassisNumber) {
        // prevent duplicates (case-insensitive effect via uppercase)
        const dup = await Vehicle.findOne({ chassisNumber: newChassis });
        if (dup) {
          return next(
            new AppError(`Vehicle with chassis number "${newChassis}" already exists`, 409)
          );
        }
        $set.chassisNumber = newChassis;

        // IMPORTANT: we do NOT change qrCode/qrCodeImage automatically to avoid
        // breaking printed labels. If you want to regenerate, call your /generate-qr endpoint.
      }
    }

    // ---- DAMAGE FLAG ----
    if (typeof hasDamage !== 'undefined') {
      $set.hasDamage = hasDamage;
      if (hasDamage === false && Array.isArray(existing.damages) && existing.damages.length === 0) {
        $set.status = 'in_stock';
      }
    }

    // 4) No-op protection
    const hasSet = Object.keys($set).length > 1 || ('status' in $set);
    const hasUnset = Object.keys($unset).length > 0;
    if (!hasSet && !hasUnset) {
      const fresh = await Vehicle.findById(vehicleId).populate(populateOptions);
      const v = fresh.toObject();
      if (!v.unloadLocation) v.unloadLocation = { _id: fresh.unloadLocation, name: 'Unknown Location' };
      if (!v.addedBy)        v.addedBy        = { _id: fresh.addedBy,        name: 'Unknown User' };
      return res.status(200).json({ status: 'success', data: { vehicle: v } });
    }

    const updateOps = {};
    if (hasSet)   updateOps.$set = $set;
    if (hasUnset) updateOps.$unset = $unset;

    // 5) Apply (validators off to allow partial updates under strict:'throw')
    const updated = await Vehicle.findByIdAndUpdate(
      vehicleId,
      updateOps,
      { new: true, runValidators: false }
    ).populate(populateOptions);

    if (!updated) return next(new AppError('No vehicle found with that ID', 404));

    // 6) Normalize response
    const vehicleObj = updated.toObject();
    if (!vehicleObj.unloadLocation) vehicleObj.unloadLocation = { _id: updated.unloadLocation, name: 'Unknown Location' };
    if (!vehicleObj.addedBy)        vehicleObj.addedBy        = { _id: updated.addedBy,        name: 'Unknown User' };

    return res.status(200).json({
      status: 'success',
      data: { vehicle: vehicleObj }
    });

  } catch (err) {
    logger.error(`Error updating vehicle: ${err.message}`);
    if (err && (err.code === 11000 || err.code === 11001)) {
      // In case of race to duplicate chassis
      return next(new AppError('Duplicate value for unique field', 409));
    }
    if (err && err.name === 'ValidationError') {
      return next(new AppError(err.message, 400));
    }
    next(new AppError('Server Error', 500));
  }
};


// exports.getChassisNumbersByModelAndColor = async (req, res, next) => {
//   try {
//     const { modelId, colorId } = req.params;

//     // Validate ObjectIDs
//     if (!mongoose.Types.ObjectId.isValid(modelId)) {
//       return next(new AppError('Invalid model ID format', 400));
//     }
//     if (!mongoose.Types.ObjectId.isValid(colorId)) {
//       return next(new AppError('Invalid color ID format', 400));
//     }

//     // Ensure model and color exist
//     const model = await Model.findById(modelId).select('model_name');
//     const color = await Color.findById(colorId).select('name');

//     if (!model) {
//       return next(new AppError('No model found with that ID', 404));
//     }
//     if (!color) {
//       return next(new AppError('No color found with that ID', 404));
//     }

//     // Fetch vehicles with status either in_stock or in_transit - SORT BY CREATEDAT FOR FIFO
//     const vehicles = await Vehicle.find({
//       model: modelId,
//       colors: colorId,
//       status: { $in: ['in_stock', 'in_transit'] }
//     })
//       .select('chassisNumber model colors status createdAt')
//       .sort({ createdAt: 1 }) // Changed from chassisNumber:1 to createdAt:1 for FIFO
//       .populate('model', 'model_name')
//       .populate('colors', 'name');

//     // Extract chassis numbers with age
//     const chassisNumbersWithAge = vehicles.map(vehicle => {
//       const createdAt = vehicle.createdAt;
//       const now = new Date();
//       const ageInMs = now - createdAt;
//       const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));
//       const ageInHours = Math.floor((ageInMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
//       const ageInMinutes = Math.floor((ageInMs % (1000 * 60 * 60)) / (1000 * 60));
//       const ageInSeconds = Math.floor((ageInMs % (1000 * 60)) / 1000);
//       const ageInMonths = Math.floor(ageInDays / 30);
//       const ageInYears = Math.floor(ageInDays / 365);
      
//       let ageDisplay = '';
//       if (ageInYears > 0) {
//         const remainingDays = ageInDays % 365;
//         const remainingHours = ageInHours % 24;
//         ageDisplay = `${ageInYears} year${ageInYears > 1 ? 's' : ''}${remainingDays > 0 ? ` ${remainingDays} day${remainingDays > 1 ? 's' : ''}` : ''}${remainingHours > 0 ? ` ${remainingHours} hr${remainingHours > 1 ? 's' : ''}` : ''}`;
//       } else if (ageInMonths > 0) {
//         const remainingDays = ageInDays % 30;
//         const remainingHours = ageInHours % 24;
//         ageDisplay = `${ageInMonths} month${ageInMonths > 1 ? 's' : ''}${remainingDays > 0 ? ` ${remainingDays} day${remainingDays > 1 ? 's' : ''}` : ''}${remainingHours > 0 ? ` ${remainingHours} hr${remainingHours > 1 ? 's' : ''}` : ''}`;
//       } else if (ageInDays > 0) {
//         const remainingMinutes = ageInMinutes % 60;
//         ageDisplay = `${ageInDays} day${ageInDays > 1 ? 's' : ''}${ageInHours > 0 ? ` ${ageInHours} hr${ageInHours > 1 ? 's' : ''}` : ''}${remainingMinutes > 0 ? ` ${remainingMinutes} min${remainingMinutes > 1 ? 's' : ''}` : ''}`;
//       } else if (ageInHours > 0) {
//         const remainingSeconds = ageInSeconds % 60;
//         ageDisplay = `${ageInHours} hr${ageInHours > 1 ? 's' : ''}${ageInMinutes > 0 ? ` ${ageInMinutes} min${ageInMinutes > 1 ? 's' : ''}` : ''}${remainingSeconds > 0 ? ` ${remainingSeconds} sec${remainingSeconds > 1 ? 's' : ''}` : ''}`;
//       } else if (ageInMinutes > 0) {
//         ageDisplay = `${ageInMinutes} min${ageInMinutes > 1 ? 's' : ''}${ageInSeconds > 0 ? ` ${ageInSeconds} sec${ageInSeconds > 1 ? 's' : ''}` : ''}`;
//       } else {
//         ageDisplay = `${ageInSeconds} sec${ageInSeconds > 1 ? 's' : ''}`;
//       }

//       return {
//         chassisNumber: vehicle.chassisNumber,
//         age: ageDisplay,
//         ageInDays: ageInDays,
//         addedDate: createdAt.toISOString().split('T')[0] // YYYY-MM-DD format
//       };
//     });

//     res.status(200).json({
//       status: 'success',
//       results: chassisNumbersWithAge.length,
//       data: {
//         modelId,
//         modelName: model.model_name,
//         colorId,
//         colorName: color.name,
//         chassisNumbers: chassisNumbersWithAge
//       }
//     });
//   } catch (err) {
//     logger.error(`Error fetching chassis numbers: ${err.message}`);
//     next(new AppError('Server Error', 500));
//   }
// };



///////////{ ******************* Added by Harshali********************}

exports.getChassisNumbersByModelAndColor = async (req, res, next) => {
  try {
    const { modelId, colorId } = req.params;

    // Validate ObjectIDs
    if (!mongoose.Types.ObjectId.isValid(modelId)) {
      return next(new AppError('Invalid model ID format', 400));
    }
    if (!mongoose.Types.ObjectId.isValid(colorId)) {
      return next(new AppError('Invalid color ID format', 400));
    }

    // Ensure model and color exist
    const model = await Model.findById(modelId).select('model_name type');
    const color = await Color.findById(colorId).select('name');

    if (!model) {
      return next(new AppError('No model found with that ID', 404));
    }
    if (!color) {
      return next(new AppError('No color found with that ID', 404));
    }
    
    // Subdealer filter
    const { branchId, subdealerId } = req.query;

    let locationFilter = {};

    if (branchId && mongoose.Types.ObjectId.isValid(branchId)) {
      locationFilter = {
        locationType: 'branch',
        unloadLocation: branchId
      };
    }

    if (subdealerId && mongoose.Types.ObjectId.isValid(subdealerId)) {
      locationFilter = {
        locationType: 'subdealer',
        subdealerLocation: subdealerId
      };
    }

    // Build the base query for vehicle fetching
    let vehicleQuery = {
      'color.id': colorId,
      status: { $in: ['in_stock', 'in_transit', 'booked', 'blocked'] },
      ...locationFilter
    };

    // CRITICAL LOGIC: Handle CSD model differently
    if (model.type === 'CSD') {
      console.log(`[INFO] Model "${model.model_name}" is CSD type, fetching ICE vehicles by name matching`);
      
      const csdModelName = model.model_name;
      
      // Find ICE models with similar names
      const iceModels = await Model.find({
        type: 'ICE',
        model_name: { 
          $regex: csdModelName.replace(/[^a-zA-Z0-9\s]/g, ''),
          $options: 'i'
        }
      }).select('_id model_name');
      
      console.log(`[INFO] Found ${iceModels.length} ICE models matching CSD name "${csdModelName}":`, 
        iceModels.map(m => m.model_name));
      
      if (iceModels.length > 0) {
        vehicleQuery.model = { $in: iceModels.map(m => m._id) };
        vehicleQuery.type = 'ICE';
      } else {
        console.log(`[WARNING] No exact ICE model match found for CSD: "${csdModelName}"`);
        
        // Try alternative matching
        const simplifiedName = csdModelName
          .replace(/OBD\s*IIB?/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        console.log(`[INFO] Trying simplified name: "${simplifiedName}"`);
        
        const alternativeIceModels = await Model.find({
          type: 'ICE',
          $or: [
            { model_name: { $regex: simplifiedName, $options: 'i' } },
            { model_name: { $regex: csdModelName.replace(/[^a-zA-Z0-9]/g, ''), $options: 'i' } }
          ]
        }).select('_id model_name');
        
        if (alternativeIceModels.length > 0) {
          vehicleQuery.model = { $in: alternativeIceModels.map(m => m._id) };
          vehicleQuery.type = 'ICE';
          console.log(`[INFO] Found ${alternativeIceModels.length} alternative ICE models`);
        } else {
          console.log(`[ERROR] No ICE models found for CSD: "${csdModelName}"`);
          vehicleQuery.model = null;
        }
      }
    } else {
      vehicleQuery.model = modelId;
    }

    // Fetch vehicles WITHOUT populating location initially - ADDED engineNumber to select
    const vehicles = await Vehicle.find(vehicleQuery)
      .select('chassisNumber model modelName color status type createdAt customerName allocatedBooking ageInDays qrCode locationType unloadLocation subdealerLocation engineNumber')
      .sort({ createdAt: 1 })
      .populate('model', 'model_name type')
      .populate('color.id', 'name');

    // Extract chassis numbers with age, booking info, vehicle type and location - ADDED engineNumber to return
    const chassisNumbersWithDetails = await Promise.all(vehicles.map(async (vehicle) => {
      const createdAt = vehicle.createdAt;
      const now = new Date();
      const ageInMs = now - createdAt;
      const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));
      const ageInHours = Math.floor((ageInMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const ageInMinutes = Math.floor((ageInMs % (1000 * 60 * 60)) / (1000 * 60));
      const ageInSeconds = Math.floor((ageInMs % (1000 * 60)) / 1000);
      
      let ageDisplay = '';
      if (ageInDays > 0) {
        ageDisplay = `${ageInDays} day${ageInDays > 1 ? 's' : ''}`;
        if (ageInHours > 0) {
          ageDisplay += ` ${ageInHours} hr${ageInHours > 1 ? 's' : ''}`;
        }
        if (ageInMinutes > 0) {
          ageDisplay += ` ${ageInMinutes} min${ageInMinutes > 1 ? 's' : ''}`;
        }
      } else if (ageInHours > 0) {
        ageDisplay = `${ageInHours} hr${ageInHours > 1 ? 's' : ''}`;
        if (ageInMinutes > 0) {
          ageDisplay += ` ${ageInMinutes} min${ageInMinutes > 1 ? 's' : ''}`;
        }
      } else if (ageInMinutes > 0) {
        ageDisplay = `${ageInMinutes} min${ageInMinutes > 1 ? 's' : ''}`;
      } else {
        ageDisplay = `${ageInSeconds} sec${ageInSeconds > 1 ? 's' : ''}`;
      }

      // Initialize booking info
      let bookingInfo = null;
      let customerName = vehicle.customerName || null;
      let allocatedBookingId = vehicle.allocatedBooking;

      // Get vehicle type
      const vehicleType = vehicle.type || (vehicle.model?.type) || 'UNKNOWN';
      
      // Get actual vehicle model name
      const actualModelName = vehicle.model?.model_name || vehicle.modelName || 'Unknown Model';
      
      // ========== CRITICAL FIX: Handle Location Information ==========
      let locationInfo = null;
      
      if (vehicle.locationType === 'branch' && vehicle.unloadLocation) {
        try {
          // Fetch branch details directly
          const branch = await mongoose.model('Branch').findById(vehicle.unloadLocation)
            .select('name address city state')
            .lean();
          
          if (branch) {
            locationInfo = {
              type: 'branch',
              id: vehicle.unloadLocation,
              name: branch.name || 'Unknown Branch',
              branch: null, // This is a branch itself, no parent branch
              fullAddress: `${branch.address || ''}, ${branch.city || ''}, ${branch.state || ''}`.trim() || ', ,'
            };
          } else {
            // Branch not found
            locationInfo = {
              type: 'branch',
              id: vehicle.unloadLocation,
              name: 'Unknown Branch',
              branch: null,
              fullAddress: ', ,'
            };
          }
        } catch (error) {
          console.warn(`Error fetching branch ${vehicle.unloadLocation}:`, error.message);
          locationInfo = {
            type: 'branch',
            id: vehicle.unloadLocation,
            name: 'Unknown Branch',
            branch: null,
            fullAddress: ', ,'
          };
        }
      } else if (vehicle.locationType === 'subdealer' && vehicle.subdealerLocation) {
        try {
          // CRITICAL FIX: Use 'Subdealer' (lowercase 'd') to match vehicle schema
          // Try to get the Subdealer model - check both capitalizations
          let SubdealerModel;
          if (mongoose.models.Subdealer) {
            SubdealerModel = mongoose.models.Subdealer;
          } else if (mongoose.models.SubDealer) {
            SubdealerModel = mongoose.models.SubDealer;
          } else {
            // Try to require it
            SubdealerModel = mongoose.model('Subdealer');
          }
          
          // Fetch subdealer details directly
          const subdealer = await SubdealerModel.findById(vehicle.subdealerLocation)
            .select('name address city state location branch')
            .populate('branch', 'name city state')
            .lean();
          
          if (subdealer) {
            let branchInfo = null;
            if (subdealer.branch) {
              branchInfo = {
                name: subdealer.branch.name,
                city: subdealer.branch.city,
                state: subdealer.branch.state
              };
            }
            
            locationInfo = {
              type: 'subdealer',
              id: vehicle.subdealerLocation,
              name: subdealer.name || 'Unknown Subdealer',
              branch: branchInfo,
              fullAddress: `${subdealer.address || ''}, ${subdealer.city || ''}, ${subdealer.state || ''}`.trim() || ', ,'
            };
          } else {
            // Subdealer not found - check if subdealer exists in database
            console.warn(`Subdealer with ID ${vehicle.subdealerLocation} not found in database`);
            
            // Try to get just the name from the database
            try {
              const subdealerName = await SubdealerModel.findById(vehicle.subdealerLocation)
                .select('name')
                .lean();
              
              locationInfo = {
                type: 'subdealer',
                id: vehicle.subdealerLocation,
                name: subdealerName?.name || 'Unknown Subdealer',
                branch: null,
                fullAddress: ', ,'
              };
            } catch (nameError) {
              locationInfo = {
                type: 'subdealer',
                id: vehicle.subdealerLocation,
                name: 'Unknown Subdealer',
                branch: null,
                fullAddress: ', ,'
              };
            }
          }
        } catch (error) {
          console.warn(`Error fetching subdealer ${vehicle.subdealerLocation}:`, error.message);
          
          // Check what's actually in the database
          console.log('DEBUG - Checking available models:', Object.keys(mongoose.models));
          
          locationInfo = {
            type: 'subdealer',
            id: vehicle.subdealerLocation,
            name: 'Unknown Subdealer',
            branch: null,
            fullAddress: ', ,'
          };
        }
      } else {
        // No location specified
        locationInfo = {
          type: 'unknown',
          id: null,
          name: 'Unknown Location',
          branch: null,
          fullAddress: ', ,'
        };
      }
      
      // Check multiple sources for booking ID
      let bookingIdToFetch = allocatedBookingId;
      
      if (!bookingIdToFetch && ['booked', 'blocked', 'sold'].includes(vehicle.status)) {
        try {
          const bookingByVehicleRef = await Booking.findOne({ 
            vehicleRef: vehicle._id 
          }).select('_id').lean();
          
          if (bookingByVehicleRef) {
            bookingIdToFetch = bookingByVehicleRef._id;
          }
        } catch (error) {
          console.warn(`Error finding booking by vehicleRef:`, error.message);
        }
      }

      // If we have a booking ID, fetch booking details
      if (bookingIdToFetch) {
        try {
          const booking = await Booking.findById(bookingIdToFetch)
            .select('bookingNumber customerDetails.name customerDetails.salutation')
            .lean();
          
          if (booking) {
            bookingInfo = {
              bookingId: booking._id,
              bookingNumber: booking.bookingNumber,
              customerName: booking.customerDetails?.name || customerName,
              customerSalutation: booking.customerDetails?.salutation || null
            };
            
            if (booking.customerDetails?.name && !customerName) {
              customerName = booking.customerDetails.name;
            }
          }
        } catch (bookingError) {
          console.error(`Error fetching booking ${bookingIdToFetch}:`, bookingError.message);
        }
      }

      // Get QR code URL
      const qrCodeUrl = vehicle.qrCode ? 
        `${req.protocol}://${req.get('host')}${vehicle.qrCode}` : 
        null;

      // Determine if vehicle is eligible for CSD models
      const isEligibleForCsd = (model.type === 'CSD' && vehicleType === 'ICE') || model.type !== 'CSD';

      return {
        vehicleId: vehicle._id,
        chassisNumber: vehicle.chassisNumber,
        engineNumber: vehicle.engineNumber, // ADDED engine number here
        status: vehicle.status,
        type: vehicleType,
        actualModelName: actualModelName,
        age: ageDisplay,
        ageInDays: ageInDays,
        addedDate: createdAt.toISOString().split('T')[0],
        customerName: customerName,
        allocatedBooking: allocatedBookingId,
        bookingInfo: bookingInfo,
        qrCode: vehicle.qrCode,
        qrCodeUrl: qrCodeUrl,
        isBookedOrBlocked: ['booked', 'blocked', 'sold'].includes(vehicle.status),
        
        // Location information (now properly fetched)
        locationType: vehicle.locationType,
        location: locationInfo,
        
        // Add CSD-specific eligibility
        isCsdModel: model.type === 'CSD',
        isCsdCompatible: isEligibleForCsd,
        requestedCsdModel: model.model_name,
        
        // Add eligibility info
        isEligibleForBooking: (vehicle.status === 'in_stock' || vehicle.status === 'in_transit') && isEligibleForCsd,
        eligibilityMessage: !isEligibleForCsd ? 'Not compatible with CSD model' :
                            vehicle.status === 'in_stock' ? 'Available for booking' : 
                            vehicle.status === 'in_transit' ? 'In transit - Will be available soon' :
                            vehicle.status === 'booked' ? `Booked by ${customerName || 'customer'}` :
                            vehicle.status === 'blocked' ? `Blocked by ${customerName || 'customer'}` : 'Not available'
      };
    }));

    // Filter based on status if requested
    const { statusFilter, typeFilter, locationTypeFilter } = req.query;
    let filteredChassisNumbers = chassisNumbersWithDetails;
    
    if (statusFilter && ['in_stock', 'in_transit', 'booked', 'blocked'].includes(statusFilter)) {
      filteredChassisNumbers = filteredChassisNumbers.filter(v => v.status === statusFilter);
    }
    
    if (typeFilter && ['EV', 'ICE'].includes(typeFilter.toUpperCase())) {
      filteredChassisNumbers = filteredChassisNumbers.filter(v => v.type === typeFilter.toUpperCase());
    }
    
    if (locationTypeFilter && ['branch', 'subdealer'].includes(locationTypeFilter.toLowerCase())) {
      filteredChassisNumbers = filteredChassisNumbers.filter(v => v.locationType === locationTypeFilter.toLowerCase());
    }

    // Count vehicles by type
    const typeCounts = chassisNumbersWithDetails.reduce((acc, vehicle) => {
      const type = vehicle.type || 'UNKNOWN';
      if (!acc[type]) acc[type] = 0;
      acc[type]++;
      return acc;
    }, {});

    // Count vehicles by location type
    const locationTypeCounts = chassisNumbersWithDetails.reduce((acc, vehicle) => {
      const locationType = vehicle.locationType || 'unknown';
      if (!acc[locationType]) acc[locationType] = 0;
      acc[locationType]++;
      return acc;
    }, {});

    // Count vehicles by specific location
    const locationCounts = chassisNumbersWithDetails.reduce((acc, vehicle) => {
      if (vehicle.location) {
        const locationName = vehicle.location.name || 'Unknown Location';
        if (!acc[locationName]) {
          acc[locationName] = {
            count: 0,
            type: vehicle.locationType,
            locationDetails: vehicle.location
          };
        }
        acc[locationName].count++;
      }
      return acc;
    }, {});

    // Add CSD-specific statistics
    const csdStats = model.type === 'CSD' ? {
      csdModel: true,
      requestedCsdModel: model.model_name,
      compatibleVehicles: chassisNumbersWithDetails.filter(v => v.isCsdCompatible).length,
      incompatibleVehicles: chassisNumbersWithDetails.filter(v => !v.isCsdCompatible).length
    } : {
      csdModel: false
    };

    res.status(200).json({
      status: 'success',
      results: filteredChassisNumbers.length,
      data: {
        modelId,
        modelName: model.model_name,
        modelType: model.type,
        colorId,
        colorName: color.name,
        csdModel: model.type === 'CSD',
        requestedCsdModel: model.type === 'CSD' ? model.model_name : null,
        chassisNumbers: filteredChassisNumbers,
        counts: {
          total: chassisNumbersWithDetails.length,
          in_stock: chassisNumbersWithDetails.filter(v => v.status === 'in_stock').length,
          in_transit: chassisNumbersWithDetails.filter(v => v.status === 'in_transit').length,
          booked: chassisNumbersWithDetails.filter(v => v.status === 'booked').length,
          blocked: chassisNumbersWithDetails.filter(v => v.status === 'blocked').length,
          byType: typeCounts,
          byLocationType: locationTypeCounts,
          byLocation: locationCounts,
          ...csdStats
        },
        locationSummary: {
          totalLocations: Object.keys(locationCounts).length,
          branchLocations: chassisNumbersWithDetails.filter(v => v.locationType === 'branch').length,
          subdealerLocations: chassisNumbersWithDetails.filter(v => v.locationType === 'subdealer').length
        },
        compatibilityInfo: model.type === 'CSD' ? {
          message: `CSD model "${model.model_name}" matches with ICE vehicles`,
          compatibleVehicleTypes: ['ICE'],
          incompatibleVehicleTypes: ['EV']
        } : {
          message: 'Compatible with all vehicle types',
          compatibleVehicleTypes: ['EV', 'ICE']
        }
      }
    });
  } catch (err) {
    logger.error(`Error fetching chassis numbers: ${err.message}`);
    next(new AppError('Server Error', 500));
  }
};
exports.deleteVehicle = async (req, res, next) => {
  try {
    const { vehicleId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
      return next(new AppError('Invalid vehicle ID format', 400));
    }

    // Check if vehicle exists
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return next(new AppError('No vehicle found with that ID', 404));
    }

    // Prevent deletion of vehicles that are not in not_approved or in_stock status
    if (!['not_approved', 'in_transit','in_stock','blocked','booked','FROZEN'].includes(vehicle.status)) {
      return next(new AppError(
        `Cannot delete vehicle with status "${vehicle.status}". Only vehicles with "not_approved" or "in_stock" status can be deleted.`,
        400
      ));
    }

    await Vehicle.findByIdAndDelete(vehicleId);

    res.status(204).json({
      status: 'success',
      data: null
    });

  } catch (err) {
    logger.error(`Error deleting vehicle: ${err.message}`);
    next(new AppError('Server Error', 500));
  }
};


///////{*****************************}


exports.unblockAndAssignVehicle = async (req, res, next) => {
  try {
    const { vehicleId } = req.params;
    const {
      assignReplacement = true,
      reason = 'Vehicle unblocked by system'
    } = req.body;

    // REMOVED: userId from destructuring since we don't need it

    /* ----------------------------------------------------
     * 1. Validate vehicleId
     * -------------------------------------------------- */
    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vehicle ID'
      });
    }

    /* ----------------------------------------------------
     * 2. Fetch vehicle
     * -------------------------------------------------- */
    const vehicle = await Vehicle.findById(vehicleId)
      .populate('model', 'model_name')
      .populate('color.id', 'name')
      .populate('unloadLocation', 'name')
      .populate('subdealerLocation', 'name')
      .populate('booking', 'bookingNumber status customerName')
      .populate('allocatedBooking', 'bookingNumber status customerName');

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    /* ----------------------------------------------------
     * 3. Check if vehicle can be unblocked
     * -------------------------------------------------- */
    const allowedStatuses = ['blocked', 'booked'];
    
    if (!allowedStatuses.includes(vehicle.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot unblock vehicle. Current status: ${vehicle.status}.`,
        allowedStatuses
      });
    }

    /* ----------------------------------------------------
     * 4. Save current info before modifying
     * -------------------------------------------------- */
    const previousStatus = vehicle.status;
    const previousCustomerName = vehicle.customerName;
    const previousBookingId = vehicle.allocatedBooking || vehicle.booking;

    /* ----------------------------------------------------
     * 5. For BOOKED vehicles - auto-cancel booking
     * -------------------------------------------------- */
    let bookingCancelled = false;
    
    if (vehicle.status === 'booked' && vehicle.booking) {
      // Automatically cancel booking
      vehicle.booking.status = 'cancelled';
      vehicle.booking.cancellationReason = reason;
      vehicle.booking.cancelledAt = new Date();
      vehicle.booking.cancelledBy = req.user.id;
      await vehicle.booking.save();
      bookingCancelled = true;
    }

    /* ----------------------------------------------------
     * 6. FREEZE VEHICLE (24 HOURS) - MAIN ACTION
     * -------------------------------------------------- */
    // Store original values
    const originalStatus = vehicle.status;
    
    // Update vehicle status to FROZEN - THIS IS CRITICAL
    vehicle.status = 'FROZEN';
    
    // Set freeze info
    vehicle.freezeInfo = {
      isFrozen: true,
      frozenAt: new Date(),
      frozenUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      frozenBy: req.user.id,
      frozenReason: reason,
      originalStatus: originalStatus
    };

    /* 🔥 CLEAR ALL ALLOCATION DATA */
    vehicle.customerName = null;
    vehicle.allocatedBooking = null;
    vehicle.booking = null;
    vehicle.bookingReceivedAmount = 0;
    vehicle.requiredMinAmount = 0;
    vehicle.minAmountPercentage = 0;
    vehicle.lastUpdatedBy = req.user.id;
    vehicle.lastUpdatedAt = new Date();

    /* ----------------------------------------------------
     * 7. Add to unblock history
     * -------------------------------------------------- */
    if (!vehicle.unblockHistory) {
      vehicle.unblockHistory = [];
    }
    
    const historyEntry = {
      unblockedAt: new Date(),
      unblockedBy: req.user.id,
      reason: `${reason} | Previous status: ${previousStatus}`,
      customerNameAtUnblock: previousCustomerName,
      allocatedBookingAtUnblock: previousBookingId?._id || previousBookingId
    };
    
    vehicle.unblockHistory.push(historyEntry);

    // Save the vehicle
    await vehicle.save();
    console.log('✅ Vehicle frozen with status:', vehicle.status);

    /* ----------------------------------------------------
     * 8. Try replacement allocation
     * -------------------------------------------------- */
    let replacementVehicle = null;
    let assignmentResult = null;

    // Only assign replacement if there was a customer
    if (assignReplacement && previousCustomerName) {
      const replacementQuery = {
        model: vehicle.model,
        'color.id': vehicle.color.id,
        locationType: vehicle.locationType,
        status: 'in_stock',
        'freezeInfo.isFrozen': { $ne: true },
        _id: { $ne: vehicle._id },
        $or: [
          { customerName: { $exists: false } },
          { customerName: null },
          { customerName: '' }
        ]
      };

      // Add location filter
      if (vehicle.locationType === 'branch') {
        replacementQuery.unloadLocation = vehicle.unloadLocation;
      } else {
        replacementQuery.subdealerLocation = vehicle.subdealerLocation;
      }

      // Find available vehicle
      replacementVehicle = await Vehicle.findOne(replacementQuery)
        .sort({ inwardDate: 1 })
        .exec();

      /* ------------------------------------------------
       * 8A. Replacement FOUND
       * ---------------------------------------------- */
      if (replacementVehicle) {
        const bookingId = previousBookingId?._id || previousBookingId;
        
        if (bookingId) {
          const booking = await Booking.findById(bookingId);
          
          if (booking) {
            // Determine new status
            const newStatus = previousStatus === 'booked' ? 'booked' : 'blocked';
            
            // Allocate replacement
            replacementVehicle.status = newStatus;
            replacementVehicle.customerName = previousCustomerName;
            replacementVehicle.allocatedBooking = bookingId;
            
            if (newStatus === 'booked') {
              replacementVehicle.booking = bookingId;
              // Restore booking
              booking.status = 'confirmed';
              booking.vehicleRef = replacementVehicle._id;
              booking.chassisNumber = replacementVehicle.chassisNumber;
              booking.cancellationReason = undefined;
              booking.cancelledAt = undefined;
              booking.cancelledBy = undefined;
            }
            
            replacementVehicle.lastUpdatedBy = req.user.id;
            replacementVehicle.lastUpdatedAt = new Date();

            // Add to allocation history
            if (!replacementVehicle.allocationHistory) {
              replacementVehicle.allocationHistory = [];
            }
            
            replacementVehicle.allocationHistory.push({
              bookingId: bookingId,
              allocatedAt: new Date(),
              allocatedBy: req.user.id,
              status: 'ALLOCATED',
              note: `Replacement for ${previousStatus} vehicle ${vehicle.chassisNumber}`
            });

            await replacementVehicle.save();
            await booking.save();

            // Update the history entry with replacement vehicle
            if (vehicle.unblockHistory.length > 0) {
              const lastEntry = vehicle.unblockHistory[vehicle.unblockHistory.length - 1];
              lastEntry.replacedWithVehicle = replacementVehicle._id;
              await vehicle.save();
            }

            assignmentResult = {
              type: 'REPLACEMENT_ASSIGNED',
              message: 'Replacement vehicle assigned successfully',
              status: newStatus,
              vehicle: {
                _id: replacementVehicle._id,
                chassisNumber: replacementVehicle.chassisNumber,
                status: replacementVehicle.status
              }
            };
          }
        }
      }

      /* ------------------------------------------------
       * 8B. NO replacement → waiting list (SIMPLIFIED)
       * ---------------------------------------------- */
      if (!replacementVehicle) {
        try {
          // Get names
          const modelName = vehicle.model?.model_name || 'Unknown';
          const colorName = vehicle.color.id?.name || 'Unknown';

          let locationName = 'Unknown';
          let locationId = null;

          if (vehicle.locationType === 'branch') {
            locationName = vehicle.unloadLocation?.name || 'Unknown';
            locationId = vehicle.unloadLocation;
          } else {
            locationName = vehicle.subdealerLocation?.name || 'Unknown';
            locationId = vehicle.subdealerLocation;
          }

          // SIMPLIFIED: Create waiting list without userId if not required
          const waitingListData = {
            customerName: previousCustomerName,
            model: vehicle.model?._id,
            modelName: modelName,
            color: vehicle.color.id?._id,
            colorName: colorName,
            location: locationId,
            locationName,
            locationType: vehicle.locationType,
            bookingId: previousBookingId?._id || previousBookingId,
            priority: 'HIGH',
            reason: `Waiting for replacement after vehicle ${vehicle.chassisNumber} was unblocked`,
            createdBy: req.user.id,
            createdAt: new Date()
          };

          console.log('Creating waiting list with data:', waitingListData);

          // Create waiting list entry
          const waitingListEntry = await VehicleWaitingList.create(waitingListData);

          assignmentResult = {
            type: 'WAITING_LIST',
            message: 'Customer added to waiting list for replacement vehicle',
            waitingListId: waitingListEntry._id
          };
        } catch (waitingListError) {
          console.error('Error creating waiting list:', waitingListError);
          
          // If error is about userId, try without it
          if (waitingListError.message.includes('userId')) {
            try {
              // Try creating without userId
              const waitingListEntry = await VehicleWaitingList.create({
                customerName: previousCustomerName,
                model: vehicle.model?._id,
                modelName: vehicle.model?.model_name || 'Unknown',
                color: vehicle.color.id?._id,
                colorName: vehicle.color.id?.name || 'Unknown',
                location: vehicle.locationType === 'branch' ? vehicle.unloadLocation : vehicle.subdealerLocation,
                locationType: vehicle.locationType,
                bookingId: previousBookingId?._id || previousBookingId,
                priority: 'HIGH',
                reason: `Waiting for replacement after unblock`,
                createdBy: req.user.id
              });
              
              assignmentResult = {
                type: 'WAITING_LIST',
                message: 'Customer added to waiting list',
                waitingListId: waitingListEntry._id
              };
            } catch (retryError) {
              console.error('Retry also failed:', retryError);
              assignmentResult = {
                type: 'WAITING_LIST_ERROR',
                message: 'Could not add to waiting list'
              };
            }
          } else {
            assignmentResult = {
              type: 'WAITING_LIST_ERROR',
              message: 'Could not add to waiting list'
            };
          }
        }
      }
    }

    /* ----------------------------------------------------
     * 9. Regenerate QR Code
     * -------------------------------------------------- */
    try {
      const { generateVehicleQRCode } = require('../utils/qrGenerator');
      vehicle.qrCode = await generateVehicleQRCode(vehicle);
      await vehicle.save();
    } catch (qrError) {
      console.warn('QR code regeneration skipped:', qrError.message);
    }

    /* ----------------------------------------------------
     * 10. Response
     * -------------------------------------------------- */
    return res.status(200).json({
      success: true,
      message: `Vehicle unblocked successfully${bookingCancelled ? ' (Booking cancelled)' : ''}`,
      data: {
        frozenVehicle: {
          _id: vehicle._id,
          chassisNumber: vehicle.chassisNumber,
          status: vehicle.status, // Should be 'FROZEN'
          previousStatus: previousStatus,
          freezeUntil: vehicle.freezeInfo.frozenUntil
        },
        bookingCancelled: bookingCancelled,
        assignmentResult
      }
    });

  } catch (err) {
    console.error('Unblock error:', {
      message: err.message,
      name: err.name,
      stack: err.stack
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to unblock vehicle',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
};
    
exports.getEligibleCustomersForFrozenVehicle = async (req, res, next) => {
  try {
    const { vehicleId } = req.params;
    
    // Validate vehicle ID
    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
      return next(new AppError('Invalid vehicle ID format', 400));
    }

    console.log(`[ELIGIBLE-CUSTOMERS] Looking for frozen vehicle with ID: ${vehicleId}`);
    
    // Find the frozen vehicle with all details
    const vehicle = await Vehicle.findById(vehicleId)
      .populate('model', 'model_name')
      .populate('color.id', 'name')
      .populate('unloadLocation', 'name')
      .populate('subdealerLocation', 'name');

    if (!vehicle) {
      console.log(`[ELIGIBLE-CUSTOMERS] Vehicle not found with ID: ${vehicleId}`);
      return next(new AppError('Vehicle not found', 404));
    }

    // Check if vehicle is frozen
    if (!vehicle.freezeInfo || !vehicle.freezeInfo.isFrozen) {
      console.log(`[ELIGIBLE-CUSTOMERS] Vehicle ${vehicle.chassisNumber} is not frozen. Status: ${vehicle.status}`);
      return next(new AppError(`Vehicle is not frozen. Current status: ${vehicle.status}`, 400));
    }

    // Get exact vehicle criteria for matching
    const vehicleModel = vehicle.model._id;
    const vehicleColor = vehicle.color.id;
    const vehicleLocationType = vehicle.locationType;
    const vehicleLocationId = vehicleLocationType === 'branch' 
      ? vehicle.unloadLocation._id 
      : vehicle.subdealerLocation._id;

    console.log(`[ELIGIBLE-CUSTOMERS] Found frozen vehicle: ${vehicle.chassisNumber}`);
    console.log(`[ELIGIBLE-CUSTOMERS] Exact match criteria:`, {
      vehicleId: vehicle._id,
      chassisNumber: vehicle.chassisNumber,
      model: {
        id: vehicleModel,
        name: vehicle.model?.model_name
      },
      color: {
        id: vehicleColor,
        name: vehicle.color?.name
      },
      locationType: vehicleLocationType,
      locationId: vehicleLocationId,
      locationName: vehicleLocationType === 'branch' 
        ? vehicle.unloadLocation?.name 
        : vehicle.subdealerLocation?.name
    });

    // Helper function to calculate priority score
    const calculatePriorityScore = (waitingEntry, paymentInfo) => {
      let score = 0;
      
      // Base score from waiting list priority
      const priorityBonus = {
        'HIGH': 100,
        'MEDIUM': 70,
        'LOW': 40
      };
      score += priorityBonus[waitingEntry.priority] || 0;
      
      // Bonus for older requests (FIFO consideration)
      const daysOld = (Date.now() - new Date(waitingEntry.requestedAt).getTime()) / (1000 * 60 * 60 * 24);
      score += Math.min(daysOld * 5, 50); // Max 50 points for age
      
      // Bonus for payment status
      const paymentStatus = paymentInfo.paymentStatus || 'BELOW_MIN';
      const paymentStatusBonus = {
        'FULLY_PAID': 80,
        'MEETS_MIN': 60,
        'BELOW_MIN': 0
      };
      score += paymentStatusBonus[paymentStatus] || 0;
      
      // Bonus for meetsMinimum
      if (paymentInfo.meetsMinimum) {
        score += 30;
      }
      
      // Bonus for higher received amount
      const receivedAmount = paymentInfo.receivedAmount || 0;
      if (receivedAmount >= 50000) score += 40;
      if (receivedAmount >= 100000) score += 60;
      if (receivedAmount >= 200000) score += 80;
      
      return Math.round(score);
    };

    // 1. Get ALL waiting list entries for exact match
    const waitingListQuery = {
      model: vehicleModel,
      color: vehicleColor,
      location: vehicleLocationId,
      locationType: vehicleLocationType,
      status: 'PENDING'
    };

    console.log(`[ELIGIBLE-CUSTOMERS] Waiting list query:`, JSON.stringify(waitingListQuery, null, 2));

    // First, get waiting list entries
    const allWaitingListEntries = await VehicleWaitingList.find(waitingListQuery)
      .populate('model', 'model_name')
      .populate('color', 'name')
      .populate({
        path: 'bookingId',
        select: 'bookingNumber vehicleRef payment status customerDetails',
        populate: [
          { path: 'vehicleRef', select: 'chassisNumber' }
        ]
      })
      .sort({ priority: -1, requestedAt: 1 });

    console.log(`[ELIGIBLE-CUSTOMERS] Found ${allWaitingListEntries.length} waiting list entries with exact model, color, and location match`);

    // 2. Process waiting list entries
    const eligibleWaitingListCustomers = [];
    const processedBookings = new Set(); // Track processed bookings to avoid duplicates

    for (const waitingEntry of allWaitingListEntries) {
      try {
        console.log(`[ELIGIBLE-CUSTOMERS] Processing waiting list entry:`, {
          id: waitingEntry._id,
          customerName: waitingEntry.customerName,
          bookingId: waitingEntry.bookingId?._id,
          bookingNumber: waitingEntry.bookingNumber,
          hasBooking: !!waitingEntry.bookingId,
          paymentInfo: waitingEntry.paymentInfo
        });

        // Skip if this booking was already processed (avoid duplicates)
        if (waitingEntry.bookingId && processedBookings.has(waitingEntry.bookingId._id.toString())) {
          console.log(`[ELIGIBLE-CUSTOMERS] Skipping duplicate booking ${waitingEntry.bookingNumber}`);
          continue;
        }

        // Mark this booking as processed
        if (waitingEntry.bookingId) {
          processedBookings.add(waitingEntry.bookingId._id.toString());
        }

        // Get payment info
        const paymentInfo = waitingEntry.paymentInfo || {};
        const receivedAmount = paymentInfo.receivedAmount || 0;
        const requiredMinAmount = paymentInfo.requiredMinAmount || 0;
        const minPercentage = paymentInfo.minPercentage || 10;
        const paymentStatus = paymentInfo.paymentStatus || 'BELOW_MIN';
        const meetsMinimum = paymentInfo.meetsMinimum || false;

        console.log(`[ELIGIBLE-CUSTOMERS] Payment info:`, {
          receivedAmount,
          requiredMinAmount,
          minPercentage,
          paymentStatus,
          meetsMinimum
        });

        // Check eligibility - SIMPLIFIED: If meetsMinimum is true OR paymentStatus is MEETS_MIN/FULLY_PAID
        let isEligible = false;
        let eligibilityReason = '';

        if (meetsMinimum || paymentStatus === 'MEETS_MIN' || paymentStatus === 'FULLY_PAID') {
          isEligible = true;
          eligibilityReason = `Payment status: ${paymentStatus}, meetsMinimum: ${meetsMinimum}`;
        } else if (requiredMinAmount > 0) {
          // Check if meets percentage requirement
          const receivedPercentage = (receivedAmount / requiredMinAmount) * 100;
          if (receivedPercentage >= minPercentage) {
            isEligible = true;
            eligibilityReason = `Payment meets ${minPercentage}% minimum (${receivedPercentage.toFixed(2)}% paid)`;
          } else {
            eligibilityReason = `Payment below ${minPercentage}% minimum (${receivedPercentage.toFixed(2)}% paid)`;
          }
        } else if (receivedAmount > 0) {
          // If no requiredMinAmount but has payment, consider eligible
          isEligible = true;
          eligibilityReason = `Payment received: ₹${receivedAmount}`;
        } else {
          eligibilityReason = 'No payment received';
        }

        console.log(`[ELIGIBLE-CUSTOMERS] Eligibility check:`, {
          customerName: waitingEntry.customerName,
          isEligible,
          eligibilityReason
        });

        if (isEligible) {
          // Get booking details if exists
          let bookingDetails = null;
          let hasVehicleAllocated = false;
          
          if (waitingEntry.bookingId) {
            const booking = waitingEntry.bookingId;
            hasVehicleAllocated = !!booking.vehicleRef;
            
            bookingDetails = {
              bookingId: booking._id,
              bookingNumber: booking.bookingNumber,
              paymentType: booking.payment?.type,
              financerName: booking.payment?.financer?.name,
              status: booking.status,
              customerName: booking.customerDetails?.name,
              vehicleAllocated: hasVehicleAllocated,
              vehicleChassis: booking.vehicleRef?.chassisNumber
            };
          }

          // Skip if booking already has vehicle allocated
          if (hasVehicleAllocated) {
            console.log(`[ELIGIBLE-CUSTOMERS] Skipping ${waitingEntry.customerName} - Booking already has vehicle ${bookingDetails?.vehicleChassis}`);
            continue;
          }

          const waitingCustomerDetails = {
            waitingListId: waitingEntry._id,
            customerName: waitingEntry.customerName,
            modelName: waitingEntry.modelName,
            colorName: waitingEntry.colorName,
            locationName: waitingEntry.locationName,
            locationType: waitingEntry.locationType,
            paymentType: bookingDetails?.paymentType || 'WAITING_LIST',
            receivedAmount: receivedAmount,
            requiredMinAmount: requiredMinAmount,
            minPercentage: minPercentage,
            paymentStatus: paymentStatus,
            meetsMinimum: meetsMinimum,
            priority: waitingEntry.priority,
            requestedAt: waitingEntry.requestedAt,
            reason: waitingEntry.reason,
            eligibilityReason: eligibilityReason,
            isEligible: isEligible,
            source: bookingDetails ? 'WAITING_LIST_WITH_BOOKING' : 'WAITING_LIST_DIRECT',
            hasBooking: !!waitingEntry.bookingId,
            bookingDetails: bookingDetails,
            priorityScore: calculatePriorityScore(waitingEntry, paymentInfo)
          };

          eligibleWaitingListCustomers.push(waitingCustomerDetails);
          console.log(`[ELIGIBLE-CUSTOMERS]   Added eligible customer ${waitingEntry.customerName}: ${eligibilityReason}`);
        } else {
          console.log(`[ELIGIBLE-CUSTOMERS] ❌ ${waitingEntry.customerName} is NOT eligible: ${eligibilityReason}`);
        }
      } catch (error) {
        console.error(`[ELIGIBLE-CUSTOMERS] Error processing waiting list entry ${waitingEntry._id}:`, error.message);
        console.error(error.stack);
        continue;
      }
    }

    console.log(`[ELIGIBLE-CUSTOMERS] Total eligible customers: ${eligibleWaitingListCustomers.length}`);

    // 3. Sort by priority score (highest first)
    eligibleWaitingListCustomers.sort((a, b) => b.priorityScore - a.priorityScore);

    // 4. Prepare response
    res.status(200).json({
      status: 'success',
      data: {
        matchingCriteria: {
          model: {
            id: vehicleModel,
            name: vehicle.model?.model_name
          },
          color: {
            id: vehicleColor,
            name: vehicle.color?.name
          },
          location: {
            type: vehicleLocationType,
            id: vehicleLocationId,
            name: vehicleLocationType === 'branch' 
              ? vehicle.unloadLocation?.name 
              : vehicle.subdealerLocation?.name
          },
          vehicle: {
            id: vehicle._id,
            chassisNumber: vehicle.chassisNumber,
            status: vehicle.status,
            freezeInfo: vehicle.freezeInfo
          }
        },
        eligibleCustomers: eligibleWaitingListCustomers,
        summary: {
          totalEligibleCustomers: eligibleWaitingListCustomers.length,
          totalWaitingListEntries: allWaitingListEntries.length,
          withBooking: eligibleWaitingListCustomers.filter(c => c.hasBooking).length,
          withoutBooking: eligibleWaitingListCustomers.filter(c => !c.hasBooking).length,
          priorityBreakdown: {
            HIGH: eligibleWaitingListCustomers.filter(c => c.priority === 'HIGH').length,
            MEDIUM: eligibleWaitingListCustomers.filter(c => c.priority === 'MEDIUM').length,
            LOW: eligibleWaitingListCustomers.filter(c => c.priority === 'LOW').length
          },
          paymentStatusBreakdown: {
            FULLY_PAID: eligibleWaitingListCustomers.filter(c => c.paymentStatus === 'FULLY_PAID').length,
            MEETS_MIN: eligibleWaitingListCustomers.filter(c => c.paymentStatus === 'MEETS_MIN').length,
            BELOW_MIN: eligibleWaitingListCustomers.filter(c => c.paymentStatus === 'BELOW_MIN').length
          }
        },
        debug: {
          waitingListQuery: waitingListQuery,
          vehicleDetails: {
            chassisNumber: vehicle.chassisNumber,
            model: vehicle.model?.model_name,
            color: vehicle.color?.name,
            location: vehicleLocationType === 'branch' 
              ? vehicle.unloadLocation?.name 
              : vehicle.subdealerLocation?.name
          }
        }
      }
    });

  } catch (err) {
    console.error(`[ELIGIBLE-CUSTOMERS] System error:`, err.message);
    console.error(err.stack);
    
    logger.error(`Error getting eligible customers: ${err.message}`, {
      error: err.stack,
      vehicleId: req.params.vehicleId,
      userId: req.user?.id
    });
    
    next(new AppError('Server Error while finding eligible customers', 500));
  }
};



exports.allocateFrozenVehicleToCustomer = async (req, res, next) => {
  try {
    const { vehicleId } = req.params;
    const { waitingListId, bookingId, customerName, allocationNotes } = req.body;

    console.log('[ALLOCATE-FROZEN] Starting allocation:', {
      vehicleId,
      waitingListId,
      bookingId,
      customerName,
      allocationNotes
    });

    // 1. Validate inputs
    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
      return next(new AppError('Invalid vehicle ID format', 400));
    }

    if (!waitingListId || !mongoose.Types.ObjectId.isValid(waitingListId)) {
      return next(new AppError('Valid waiting list ID is required', 400));
    }

    // 2. Find the frozen vehicle
    const vehicle = await Vehicle.findById(vehicleId)
      .populate('model', 'model_name')
      .populate('color.id', 'name')
      .populate('unloadLocation', 'name')
      .populate('subdealerLocation', 'name');

    if (!vehicle) {
      return next(new AppError('Vehicle not found', 404));
    }

    console.log('[ALLOCATE-FROZEN] Found vehicle:', {
      chassisNumber: vehicle.chassisNumber,
      status: vehicle.status,
      model: vehicle.model?.model_name,
      color: vehicle.color,
      freezeInfo: vehicle.freezeInfo
    });

    // 3. Check if vehicle is frozen
    if (!vehicle.freezeInfo || !vehicle.freezeInfo.isFrozen) {
      return next(new AppError(`Vehicle is not frozen. Current status: ${vehicle.status}`, 400));
    }

    // 4. Check if vehicle is still within freeze period
    if (vehicle.freezeInfo.frozenUntil && new Date() > vehicle.freezeInfo.frozenUntil) {
      return next(new AppError('Vehicle freeze period has expired', 400));
    }

    // 5. Find the waiting list entry
    const waitingListEntry = await VehicleWaitingList.findById(waitingListId)
      .populate('model', 'model_name')
      .populate('color', 'name');

    if (!waitingListEntry) {
      return next(new AppError('Waiting list entry not found', 404));
    }

    console.log('[ALLOCATE-FROZEN] Found waiting list entry:', {
      customerName: waitingListEntry.customerName,
      model: waitingListEntry.model?.model_name,
      color: waitingListEntry.color,
      location: waitingListEntry.locationName
    });

    // 6. Verify matching criteria - FIXED COLOR COMPARISON
    const vehicleModelId = vehicle.model._id.toString();
    const waitingModelId = waitingListEntry.model._id.toString();

    // Extract vehicle color ID - handle different data structures
    let vehicleColorId;
    if (vehicle.color) {
      // Case 1: color is an object with id property
      if (vehicle.color.id) {
        if (typeof vehicle.color.id === 'object') {
          // Case 1a: color.id is an object { id: "xxx", name: "color" }
          vehicleColorId = vehicle.color.id.id ? vehicle.color.id.id.toString() : vehicle.color.id._id.toString();
        } else {
          // Case 1b: color.id is a string
          vehicleColorId = vehicle.color.id.toString();
        }
      } else if (vehicle.color._id) {
        // Case 2: color is populated document
        vehicleColorId = vehicle.color._id.toString();
      } else {
        // Case 3: color is just an ID string
        vehicleColorId = vehicle.color.toString();
      }
    } else {
      return next(new AppError('Vehicle color information is missing', 400));
    }

    // Extract waiting list color ID
    let waitingColorId;
    if (waitingListEntry.color) {
      if (typeof waitingListEntry.color === 'object') {
        // Case 1: color is populated document
        waitingColorId = waitingListEntry.color._id ? waitingListEntry.color._id.toString() : waitingListEntry.color.toString();
      } else {
        // Case 2: color is just an ID string
        waitingColorId = waitingListEntry.color.toString();
      }
    } else {
      return next(new AppError('Waiting list color information is missing', 400));
    }

    console.log('[ALLOCATE-FROZEN] Color comparison:', {
      vehicleColorId,
      waitingColorId,
      vehicleColor: vehicle.color,
      waitingListColor: waitingListEntry.color,
      areEqual: vehicleColorId === waitingColorId
    });

    // Model comparison
    if (vehicleModelId !== waitingModelId) {
      return next(new AppError('Vehicle model does not match waiting list entry', 400));
    }

    // Color comparison
    if (vehicleColorId !== waitingColorId) {
      return next(new AppError('Vehicle color does not match waiting list entry', 400));
    }

    // 7. Verify location match
    let locationMatch = false;
    
    if (vehicle.locationType === 'branch' && waitingListEntry.locationType === 'branch') {
      const vehicleLocationId = vehicle.unloadLocation._id.toString();
      const waitingLocationId = waitingListEntry.location.toString();
      locationMatch = vehicleLocationId === waitingLocationId;
      console.log('[ALLOCATE-FROZEN] Branch location match:', {
        vehicleLocationId,
        waitingLocationId,
        locationMatch
      });
    } else if (vehicle.locationType === 'subdealer' && waitingListEntry.locationType === 'subdealer') {
      const vehicleLocationId = vehicle.subdealerLocation._id.toString();
      const waitingLocationId = waitingListEntry.location.toString();
      locationMatch = vehicleLocationId === waitingLocationId;
      console.log('[ALLOCATE-FROZEN] Subdealer location match:', {
        vehicleLocationId,
        waitingLocationId,
        locationMatch
      });
    }

    if (!locationMatch) {
      return next(new AppError('Vehicle location does not match waiting list entry', 400));
    }

    // 8. Get booking details if provided
    let bookingDetails = null;
    if (bookingId) {
      bookingDetails = await Booking.findById(bookingId)
        .select('bookingNumber customerDetails payment status vehicleRef');
      
      if (!bookingDetails) {
        return next(new AppError('Booking not found', 404));
      }

      // Check if booking already has a vehicle allocated
      if (bookingDetails.vehicleRef) {
        const existingAllocatedVehicle = await Vehicle.findById(bookingDetails.vehicleRef);
        if (existingAllocatedVehicle && ['booked', 'blocked'].includes(existingAllocatedVehicle.status)) {
          return next(new AppError(
            `Booking ${bookingDetails.bookingNumber} already has vehicle ${existingAllocatedVehicle.chassisNumber} allocated`,
            400
          ));
        }
      }
    }

    // 9. Check GM approval requirements if vehicle is over 10 days
    let requiresGmApproval = false;
    let gmApprovalStatus = 'NOT_REQUIRED';
    
    if (vehicle.ageInDays > 10) {
      requiresGmApproval = true;
      gmApprovalStatus = 'PENDING';
    }

    // 10. Store current state for audit
    const previousStatus = vehicle.status;
    const previousCustomerName = vehicle.customerName;
    const previousAllocatedBooking = vehicle.allocatedBooking;

    // 11. Update vehicle status and allocation
    vehicle.status = 'booked';
    vehicle.customerName = customerName || waitingListEntry.customerName;
    vehicle.allocatedBooking = bookingId || waitingListEntry.bookingId;
    vehicle.lastUpdatedBy = req.user.id;
    
    // Store customer info in vehicle
    if (bookingDetails?.customerDetails) {
      vehicle.customerPhone = bookingDetails.customerDetails.mobile;
      vehicle.customerAadhaar = bookingDetails.customerDetails.aadhaarNumber;
    }

    // Set freeze info to inactive
    vehicle.freezeInfo.isFrozen = false;
    vehicle.freezeInfo.autoUnfrozenAt = new Date();

    // Add to allocation history
    vehicle.allocationHistory.push({
      bookingId: bookingId || waitingListEntry.bookingId,
      bookingNumber: bookingDetails?.bookingNumber || waitingListEntry.bookingNumber,
      allocatedAt: new Date(),
      allocatedBy: req.user.id,
      status: 'ALLOCATED',
      gmApprovalRequired: requiresGmApproval,
      gmApprovalStatus: gmApprovalStatus,
      note: allocationNotes || `Allocated from waiting list (frozen vehicle) - Waiting list ID: ${waitingListEntry._id}`,
      source: 'MANUAL_ALLOCATION_FROZEN',
      previousStatus: previousStatus,
      previousCustomerName: previousCustomerName
    });

    // Update waiting list entry
    waitingListEntry.status = 'ASSIGNED';
    waitingListEntry.assignedVehicle = vehicle._id;
    waitingListEntry.assignedAt = new Date();
    waitingListEntry.assignedBy = req.user.id;
    waitingListEntry.lastUpdatedBy = req.user.id;

    // 12. If booking exists, update booking with vehicle reference
    if (bookingDetails) {
      bookingDetails.vehicleRef = vehicle._id;
      bookingDetails.chassisNumber = vehicle.chassisNumber;
      bookingDetails.lastUpdatedBy = req.user.id;
      await bookingDetails.save();
      console.log('[ALLOCATE-FROZEN] Updated booking with vehicle reference');
    }

    // 13. Save all changes
    await Promise.all([
      vehicle.save(),
      waitingListEntry.save()
    ]);

    console.log('[ALLOCATE-FROZEN] Vehicle and waiting list updated successfully');

    // 14. Generate QR code for the allocated vehicle
    let qrCodePath = null;
    let qrCodeUrl = null;
    try {
      // Ensure vehicle has latest data before generating QR
      const freshVehicle = await Vehicle.findById(vehicleId)
        .populate('model', 'model_name')
        .populate('color.id', 'name')
        .populate('unloadLocation', 'name')
        .populate('subdealerLocation', 'name');
      
      const { generateVehicleQRCode } = require('../utils/qrGenerator');
      qrCodePath = await generateVehicleQRCode(freshVehicle);
      
      // Update vehicle with new QR code
      vehicle.qrCode = qrCodePath;
      await vehicle.save();
      
      qrCodeUrl = `${req.protocol}://${req.get('host')}${qrCodePath}`;
      console.log('[ALLOCATE-FROZEN] QR code generated:', qrCodeUrl);
    } catch (qrError) {
      console.warn('[ALLOCATE-FROZEN] QR code generation failed:', qrError.message);
    }

    // 15. Create audit log
    try {
      await mongoose.model('AuditLog').create({
        action: 'VEHICLE_ALLOCATED',
        entity: 'Vehicle',
        entityId: vehicle._id,
        user: req.user.id,
        ip: req.ip,
        status: 'SUCCESS',
        metadata: {
          vehicleChassis: vehicle.chassisNumber,
          oldStatus: previousStatus,
          newStatus: vehicle.status,
          oldCustomerName: previousCustomerName,
          newCustomerName: vehicle.customerName,
          oldAllocatedBooking: previousAllocatedBooking,
          newAllocatedBooking: vehicle.allocatedBooking,
          waitingListEntryId: waitingListEntry._id,
          bookingId: bookingDetails?._id,
          allocationType: 'MANUAL_FROZEN_VEHICLE',
          allocationNotes: allocationNotes,
          qrCodeGenerated: !!qrCodePath,
          qrCodePath: qrCodePath
        }
      });
      console.log('[ALLOCATE-FROZEN] Audit log created');
    } catch (auditError) {
      console.warn('[ALLOCATE-FROZEN] Audit log creation failed:', auditError.message);
    }

    // 16. Prepare response
    const responseData = {
      vehicle: {
        _id: vehicle._id,
        chassisNumber: vehicle.chassisNumber,
        status: vehicle.status,
        model: vehicle.model?.model_name || vehicle.modelName,
        color: {
          id: vehicleColorId,
          name: vehicle.color?.name || 'Unknown'
        },
        location: vehicle.locationType === 'branch' 
          ? vehicle.unloadLocation?.name 
          : vehicle.subdealerLocation?.name,
        locationType: vehicle.locationType,
        customerName: vehicle.customerName,
        customerPhone: vehicle.customerPhone,
        customerAadhaar: vehicle.customerAadhaar,
        allocatedBooking: vehicle.allocatedBooking,
        ageInDays: vehicle.ageInDays,
        requiresGmApproval: requiresGmApproval,
        gmApprovalStatus: gmApprovalStatus,
        qrCode: vehicle.qrCode,
        qrCodeUrl: qrCodeUrl,
        freezeInfo: {
          wasFrozen: true,
          frozenAt: vehicle.freezeInfo.frozenAt,
          frozenUntil: vehicle.freezeInfo.frozenUntil,
          autoUnfrozenAt: vehicle.freezeInfo.autoUnfrozenAt
        }
      },
      waitingListEntry: {
        _id: waitingListEntry._id,
        customerName: waitingListEntry.customerName,
        model: waitingListEntry.modelName,
        color: waitingListEntry.colorName,
        status: waitingListEntry.status,
        assignedAt: waitingListEntry.assignedAt,
        assignedVehicle: waitingListEntry.assignedVehicle
      },
      booking: bookingDetails ? {
        bookingId: bookingDetails._id,
        bookingNumber: bookingDetails.bookingNumber,
        customerName: bookingDetails.customerDetails?.name,
        vehicleAssigned: true,
        chassisNumber: bookingDetails.chassisNumber
      } : null,
      allocationSummary: {
        frozenVehicleAllocated: true,
        previousStatus: previousStatus,
        newStatus: vehicle.status,
        gmApprovalRequired: requiresGmApproval,
        allocationDate: new Date(),
        allocatedBy: req.user.id,
        notes: allocationNotes,
        qrCodeGenerated: !!qrCodePath
      }
    };

    console.log('[ALLOCATE-FROZEN] Allocation successful');

    res.status(200).json({
      status: 'success',
      message: `Frozen vehicle ${vehicle.chassisNumber} allocated to ${vehicle.customerName} successfully`,
      data: responseData
    });

  } catch (err) {
    console.error('[ALLOCATE-FROZEN] Error:', err.message);
    console.error('[ALLOCATE-FROZEN] Stack trace:', err.stack);
    
    logger.error(`Error allocating frozen vehicle: ${err.message}`, {
      error: err.stack,
      vehicleId: req.params.vehicleId,
      userId: req.user?.id
    });
    
    // Create error audit log
    try {
      await mongoose.model('AuditLog').create({
        action: 'VEHICLE_ALLOCATION_FAILED',
        entity: 'Vehicle',
        entityId: req.params.vehicleId,
        user: req.user?.id,
        ip: req.ip,
        status: 'FAILED',
        error: err.message,
        metadata: {
          vehicleId: req.params.vehicleId,
          waitingListId: req.body.waitingListId,
          bookingId: req.body.bookingId,
          allocationNotes: req.body.allocationNotes
        }
      });
    } catch (auditError) {
      console.warn('[ALLOCATE-FROZEN] Error audit log creation failed:', auditError.message);
    }
    
    next(new AppError('Failed to allocate frozen vehicle to customer', 500));
  }
};