const Subdealer = require('../models/Subdealer');
const AppError = require('../utils/appError');
const logger = require('../config/logger');
// Add these imports at the top
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const SubdealerOnAccountRef = require('../models/SubdealerOnAccountRef');
const User = require('../models/User');


exports.createSubdealer = async (req, res, next) => {
  try {
    const { 
      name, 
      branch, 
      latLong, 
      rateOfInterest, 
      creditPeriodDays, 
      type, 
      discount,
      headers // NEW: Add headers to destructuring
    } = req.body;
    
    if (!name) return next(new AppError('Subdealer name is required', 400));
    if (!branch) return next(new AppError('Branch is required', 400));
    if (!latLong || !latLong.coordinates || !latLong.address) {
      return next(new AppError('LatLong with coordinates and address is required', 400));
    }
    if (!rateOfInterest) return next(new AppError('Rate of interest is required', 400));
    if (creditPeriodDays === undefined || creditPeriodDays === null) {
      return next(new AppError('Credit period days is required', 400));
    }
    if (!type) return next(new AppError('Type is required', 400));

    // Validate coordinates
    if (!Array.isArray(latLong.coordinates) || latLong.coordinates.length !== 2) {
      return next(new AppError('Coordinates must be an array of [longitude, latitude]', 400));
    }

    const [longitude, latitude] = latLong.coordinates;
    if (typeof longitude !== 'number' || typeof latitude !== 'number') {
      return next(new AppError('Coordinates must be numbers', 400));
    }
    if (longitude < -180 || longitude > 180) {
      return next(new AppError('Longitude must be between -180 and 180', 400));
    }
    if (latitude < -90 || latitude > 90) {
      return next(new AppError('Latitude must be between -90 and 90', 400));
    }

    // Validate credit period days
    if (!Number.isInteger(creditPeriodDays) || creditPeriodDays < 0) {
      return next(new AppError('Credit period days must be a non-negative integer', 400));
    }

    // Validate branch ID
    if (!mongoose.Types.ObjectId.isValid(branch)) {
      return next(new AppError('Invalid branch ID format', 400));
    }

      // Validate headers if provided (basic type check only)
      if (headers !== undefined && !Array.isArray(headers)) {
        return next(new AppError('Headers must be an array', 400));
      }
    // Create new subdealer with latLong structure
    const subdealer = await Subdealer.create({
      name,
      branch,
      latLong: {
        type: 'Point',
        coordinates: [longitude, latitude],
        address: latLong.address.trim()
      },
      rateOfInterest,
      creditPeriodDays,
      type,
      discount: discount || 0,
      headers: headers || [], // NEW: Add headers array
      createdBy: req.user.id
    });

    const populatedSubdealer = await Subdealer.findById(subdealer._id)
      .populate('createdByDetails', 'name email')
      .populate('branchDetails', 'name city state')
      .populate('headerDetails', 'category_key type header_key priority is_mandatory is_discount'); // NEW: Populate headers

    res.status(201).json({
      status: 'success',
      data: {
        subdealer: populatedSubdealer
      }
    });
  } catch (err) {
    logger.error(`Error creating subdealer: ${err.message}`);
    next(err);
  }
};


// Get all subdealers (with optional filtering)
// controllers/subdealerController.js

exports.getAllSubdealers = async (req, res, next) => {
  try {
    // =========================================================================
    // STEP 1: INITIAL DEBUG LOGGING
    // =========================================================================
    console.log('\n🟢 ========== GET ALL SUBDEALERS START ==========');
    console.log('📌 Timestamp:', new Date().toISOString());
    console.log('📌 Request URL:', req.originalUrl);
    console.log('📌 Request Method:', req.method);
    console.log('📌 Request Query:', JSON.stringify(req.query, null, 2));
    
    // =========================================================================
    // STEP 2: SET CURRENT USER FOR PLUGIN (optional now)
    // =========================================================================
    global.currentUser = req.user;
    
    // =========================================================================
    // STEP 3: EXTRACT USER INFORMATION
    // =========================================================================
    console.log('\n👤 ===== USER INFORMATION =====');
    console.log('📌 User ID:', req.user._id);
    console.log('📌 User Name:', req.user.name);
    console.log('📌 User Email:', req.user.email);
    console.log('📌 User Branch:', req.user.branch ? req.user.branch.toString() : 'null');
    console.log('📌 User BranchAccess:', req.user.branchAccess || 'OWN');
    
    // =========================================================================
    // STEP 4: CHECK USER ROLES (handle both populated and unpopulated)
    // =========================================================================
    console.log('\n👥 ===== USER ROLES =====');
    const userRoles = req.user.roles || [];
    console.log('📌 Raw roles array:', JSON.stringify(userRoles, null, 2));
    
    // Extract role names safely
    const roleNames = userRoles.map(role => {
      if (!role) return null;
      
      // Case 1: Role is populated object with name property
      if (typeof role === 'object' && role.name) {
        console.log(`   ✅ Populated role: { id: ${role._id}, name: ${role.name} }`);
        return role.name;
      }
      // Case 2: Role is just an ID (not populated)
      else if (typeof role === 'object' && role._id) {
        console.log(`   ⚠️ Unpopulated role ID: ${role._id}`);
        return null; // Can't get name from ID alone
      }
      // Case 3: Role is string ID
      else if (typeof role === 'string') {
        console.log(`   ⚠️ String role ID: ${role}`);
        return null; // Can't get name from string ID
      }
      return null;
    }).filter(Boolean); // Remove null values
    
    console.log('📌 Extracted role names (from populated roles):', roleNames);
    
    // =========================================================================
    // STEP 5: DETERMINE IF USER IS ADBDM
    // =========================================================================
    const isADBDM = roleNames.some(name => name && name.toUpperCase() === 'ADBDM');
    console.log('🔥 Is ADBDM User:', isADBDM ? 'YES ✓' : 'NO ✗');
    
    // =========================================================================
    // STEP 6: CHECK ASSIGNED SUBDEALERS
    // =========================================================================
    console.log('\n📋 ===== ASSIGNED SUBDEALERS =====');
    
    // Get assignedSubdealers (handle both populated and unpopulated)
    let assignedSubdealers = [];
    
    if (req.user.assignedSubdealers && Array.isArray(req.user.assignedSubdealers)) {
      assignedSubdealers = req.user.assignedSubdealers;
    }
    
    console.log('📌 assignedSubdealers type:', Array.isArray(assignedSubdealers) ? 'Array' : typeof assignedSubdealers);
    console.log('📌 assignedSubdealers length:', assignedSubdealers.length);
    
    // Process each assigned subdealer to get IDs
    const processedSubdealerIds = [];
    
    if (assignedSubdealers.length > 0) {
      console.log('📌 Processing assigned subdealers:');
      
      assignedSubdealers.forEach((item, index) => {
        let id = null;
        
        // Case 1: Item is populated subdealer object with _id
        if (item && typeof item === 'object' && item._id) {
          id = item._id.toString();
          console.log(`   ${index + 1}. Populated subdealer: { _id: ${id}, name: ${item.name || 'N/A'} }`);
        }
        // Case 2: Item is ObjectId or string
        else if (item && item.toString) {
          id = item.toString();
          console.log(`   ${index + 1}. Subdealer ID: ${id}`);
        }
        // Case 3: Item is something else
        else {
          console.log(`   ${index + 1}. Invalid subdealer:`, item);
        }
        
        if (id) {
          processedSubdealerIds.push(id);
        }
      });
      
      console.log('📌 All processed subdealer IDs:', processedSubdealerIds);
    } else {
      console.log('⚠️ WARNING: assignedSubdealers is EMPTY!');
      console.log('   This could be because:');
      console.log('   - User was created without assignedSubdealers');
      console.log('   - assignedSubdealers not populated in auth middleware');
      console.log('   - Database field is missing');
    }
    
    // =========================================================================
    // STEP 7: BUILD THE FILTER
    // =========================================================================
    console.log('\n🔧 ===== BUILDING FILTER =====');
    const filter = {};
    console.log('📌 Initial filter:', JSON.stringify(filter));
    
    // =========================================================================
    // STEP 8: APPLY ADBDM FILTER (ONLY assigned subdealers, NO branch filter)
    // =========================================================================
    if (isADBDM) {
      console.log('\n🔥🔥🔥 ADBDM USER DETECTED - APPLYING ASSIGNED-ONLY FILTER 🔥🔥🔥');
      console.log('   ⚠️ Branch filter will be IGNORED for ADBDM users');
      
      if (processedSubdealerIds.length > 0) {
        // Apply filter for ONLY assigned subdealers (by _id)
        filter._id = { $in: processedSubdealerIds };
        
        console.log('✅ ADBDM filter applied:');
        console.log('   filter._id = { $in:', processedSubdealerIds, '}');
        console.log('   Expected to return exactly', processedSubdealerIds.length, 'subdealers');
        
        // Check if specific ID is in the list (for debugging)
        const targetId = '6996a7ee7c04c21369c7ff87';
        if (processedSubdealerIds.includes(targetId)) {
          console.log(`   ✅ Target ID ${targetId} IS in the filter list`);
        } else {
          console.log(`   ❌ Target ID ${targetId} is NOT in the filter list - check database!`);
        }
      } else {
        // No assigned subdealers - return empty result
        console.log('⚠️ ADBDM has NO assigned subdealers - returning empty result');
        filter._id = { $in: [] };
      }
    } else {
      console.log('\n📌 NON-ADBDM USER - using standard filtering');
    }
    
    // =========================================================================
    // STEP 9: APPLY QUERY PARAMETERS (type, status, search)
    // =========================================================================
    console.log('\n🔍 ===== QUERY PARAMETERS =====');
    console.log('📌 req.query.type:', req.query.type);
    console.log('📌 req.query.status:', req.query.status);
    console.log('📌 req.query.search:', req.query.search);
    console.log('📌 req.query.branch:', req.query.branch);
    
    // Add type filter if provided
    if (req.query.type) {
      const upperType = req.query.type.toUpperCase();
      if (['B2B', 'B2C'].includes(upperType)) {
        filter.type = upperType;
        console.log('✅ Added type filter:', filter.type);
      } else {
        console.log('⚠️ Invalid type value:', req.query.type);
      }
    }
    
    // Add status filter if provided
    if (req.query.status) {
      const lowerStatus = req.query.status.toLowerCase();
      if (['active', 'inactive'].includes(lowerStatus)) {
        filter.status = lowerStatus;
        console.log('✅ Added status filter:', filter.status);
      } else {
        console.log('⚠️ Invalid status value:', req.query.status);
      }
    }
    
    // Add search filter if provided
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { 'latLong.address': { $regex: req.query.search, $options: 'i' } }
      ];
      console.log('✅ Added search filter');
    }
    
    // =========================================================================
    // STEP 10: APPLY BRANCH FILTER (ONLY for NON-ADBDM users)
    // =========================================================================
    if (!isADBDM && req.query.branch) {
      console.log('\n📌 Processing branch filter for NON-ADBDM user');
      
      if (mongoose.Types.ObjectId.isValid(req.query.branch)) {
        filter.branch = req.query.branch;
        console.log('✅ Added branch filter:', filter.branch);
      } else {
        console.log('❌ Invalid branch ID format:', req.query.branch);
        delete global.currentUser;
        return next(new AppError('Invalid branch ID format', 400));
      }
    } else if (isADBDM && req.query.branch) {
      console.log('\n⚠️ Branch filter IGNORED for ADBDM user (using assigned subdealers only)');
    }
    
    // =========================================================================
    // STEP 11: FINAL FILTER SUMMARY
    // =========================================================================
    console.log('\n🎯 ===== FINAL FILTER =====');
    console.log('📌 Complete filter object:', JSON.stringify(filter, null, 2));
    
    if (filter._id && filter._id.$in) {
      console.log('📌 Filter type: By _id (assigned subdealers only)');
      console.log('📌 Expected subdealers:', filter._id.$in);
      console.log('📌 Expected count:', filter._id.$in.length);
    } else if (filter.branch) {
      console.log('📌 Filter type: By branch');
      console.log('📌 Expected branch:', filter.branch);
    } else {
      console.log('📌 Filter type: No specific filter');
    }
    
    // =========================================================================
    // STEP 12: EXECUTE QUERY
    // =========================================================================
    console.log('\n⚡ ===== EXECUTING QUERY =====');
    console.log('📌 Model: Subdealer.find()');
    console.log('📌 With filter:', JSON.stringify(filter, null, 2));
    
    const subdealers = await Subdealer.find(filter)
      .populate('createdByDetails', 'name email')
      .populate('branchDetails', 'name city state')
      .populate('headerDetails', 'category_key type header_key priority is_mandatory is_discount')
      .sort({ _id: -1 });

    console.log(`✅ Query executed successfully`);
    console.log(`📌 Found ${subdealers.length} subdealers`);
    
    // =========================================================================
    // STEP 13: LOG RESULTS
    // =========================================================================
    if (subdealers.length > 0) {
      console.log('\n📋 ===== RESULTS =====');
      
      // Create a Set of expected IDs for comparison
      const expectedIds = new Set(processedSubdealerIds);
      const foundIds = [];
      
      subdealers.forEach((subdealer, index) => {
        const id = subdealer._id.toString();
        foundIds.push(id);
        
        console.log(`\n   ${index + 1}. ID: ${id}`);
        console.log(`      Name: ${subdealer.name}`);
        console.log(`      Branch: ${subdealer.branch}`);
        console.log(`      Type: ${subdealer.type}`);
        console.log(`      Status: ${subdealer.status}`);
        console.log(`      In expected list: ${expectedIds.has(id) ? '✅' : '❌'}`);
      });
      
      // Check for missing IDs
      if (isADBDM && processedSubdealerIds.length > 0) {
        const missingIds = processedSubdealerIds.filter(id => !foundIds.includes(id));
        if (missingIds.length > 0) {
          console.log('\n⚠️ MISSING EXPECTED SUBDEALERS:');
          missingIds.forEach(id => {
            console.log(`   ❌ ${id} - Not found in results`);
          });
        }
      }
    } else {
      console.log('📌 No subdealers found');
      
      if (isADBDM && processedSubdealerIds.length > 0) {
        console.log('\n⚠️ No subdealers found but expected:', processedSubdealerIds);
        console.log('   This means the assigned subdealers do not exist in database');
      }
    }
    
    // =========================================================================
    // STEP 14: CLEANUP AND RESPONSE
    // =========================================================================
    delete global.currentUser;
    console.log('\n🧹 Cleaned up global.currentUser');
    console.log('\n🟢 ========== GET ALL SUBDEALERS END ==========\n');

    res.status(200).json({
      status: 'success',
      results: subdealers.length,
      data: {
        subdealers
      }
    });
    
  } catch (err) {
    // =========================================================================
    // STEP 15: ERROR HANDLING
    // =========================================================================
    delete global.currentUser;
    
    console.error('\n🔴 ========== ERROR IN GET ALL SUBDEALERS ==========');
    console.error('❌ Error name:', err.name);
    console.error('❌ Error message:', err.message);
    console.error('❌ Error stack:', err.stack);
    console.error('🔴 ========== ERROR END ==========\n');
    
    // Log to your logger
    if (typeof logger !== 'undefined' && logger.error) {
      logger.error(`Error getting subdealers: ${err.message}`);
    }
    
    next(err);
  }
};


// Get single subdealer by ID
exports.getSubdealerById = async (req, res, next) => {
  try {
    const subdealer = await Subdealer.findById(req.params.id)
      .populate('createdByDetails', 'name email')
      .populate('branchDetails', 'name city state phone email gst_number')
      .populate('headerDetails', 'category_key type header_key priority is_mandatory is_discount'); // NEW: Populate headers

    if (!subdealer) {
      return next(new AppError('No subdealer found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        subdealer
      }
    });
  } catch (err) {
    logger.error(`Error getting subdealer: ${err.message}`);
    next(err);
  }
};



// Update a subdealer
exports.updateSubdealer = async (req, res, next) => {
  try {
    const { 
      name, 
      branch, 
      latLong, 
      rateOfInterest, 
      creditPeriodDays, 
      type, 
      discount, 
      status,
      headers
    } = req.body;

    // Validate branch ID if provided
    if (branch && !mongoose.Types.ObjectId.isValid(branch)) {
      return next(new AppError('Invalid branch ID format', 400));
    }

    // Validate credit period days if provided
    if (creditPeriodDays !== undefined && creditPeriodDays !== null) {
      if (!Number.isInteger(creditPeriodDays) || creditPeriodDays < 0) {
        return next(new AppError('Credit period days must be a non-negative integer', 400));
      }
    }

    // Validate coordinates if provided (ONLY when latLong is provided)
    if (latLong) {
      // Check if latLong is an object
      if (typeof latLong !== 'object') {
        return next(new AppError('latLong must be an object', 400));
      }
      
      // Only validate coordinates if they are provided
      if (latLong.coordinates !== undefined) {
        if (!Array.isArray(latLong.coordinates) || latLong.coordinates.length !== 2) {
          return next(new AppError('Coordinates must be an array of [longitude, latitude]', 400));
        }

        const [longitude, latitude] = latLong.coordinates;
        if (typeof longitude !== 'number' || typeof latitude !== 'number') {
          return next(new AppError('Coordinates must be numbers', 400));
        }
        if (longitude < -180 || longitude > 180) {
          return next(new AppError('Longitude must be between -180 and 180', 400));
        }
        if (latitude < -90 || latitude > 90) {
          return next(new AppError('Latitude must be between -90 and 90', 400));
        }
      }
      
      // Only validate address if provided
      if (latLong.address !== undefined && typeof latLong.address !== 'string') {
        return next(new AppError('Address must be a string', 400));
      }
    }

    // Validate headers if provided (basic type check only)
    if (headers !== undefined && !Array.isArray(headers)) {
      return next(new AppError('Headers must be an array', 400));
    }

    // Prepare update object
    const updateData = {
      name,
      rateOfInterest,
      creditPeriodDays,
      type,
      discount,
      status
    };

    // Update branch if provided
    if (branch) {
      updateData.branch = branch;
    }

    // Update latLong if provided (allows partial updates)
    if (latLong) {
      const updatedLatLong = {};
      
      // Only include fields that were provided
      if (latLong.coordinates !== undefined) {
        updatedLatLong.type = 'Point';
        updatedLatLong.coordinates = latLong.coordinates;
      }
      if (latLong.address !== undefined) {
        updatedLatLong.address = latLong.address.trim();
      }
      
      // If we have fields to update, set them
      if (Object.keys(updatedLatLong).length > 0) {
        // Get the existing subdealer to merge with current latLong
        const existingSubdealer = await Subdealer.findById(req.params.id).select('latLong');
        if (existingSubdealer && existingSubdealer.latLong) {
          updateData.latLong = {
            ...existingSubdealer.latLong.toObject(),
            ...updatedLatLong
          };
        } else {
          updateData.latLong = updatedLatLong;
        }
      }
    }

    // Update headers if provided
    if (headers !== undefined) {
      updateData.headers = headers;
    }

    const updatedSubdealer = await Subdealer.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    )
    .populate('createdByDetails', 'name email')
    .populate('branchDetails', 'name city state')
    .populate('headerDetails', 'category_key type header_key priority is_mandatory is_discount');

    if (!updatedSubdealer) {
      return next(new AppError('No subdealer found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        subdealer: updatedSubdealer
      }
    });
  } catch (err) {
    logger.error(`Error updating subdealer: ${err.message}`);
    next(err);
  }
};
// Update subdealer status only
exports.updateSubdealerStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!status || !['active', 'inactive'].includes(status.toLowerCase())) {
      return next(new AppError('Status must be either "active" or "inactive"', 400));
    }

    const updatedSubdealer = await Subdealer.findByIdAndUpdate(
      req.params.id,
      { status: status.toLowerCase() },
      {
        new: true,
        runValidators: true
      }
    )
    .populate('branchDetails', 'name city');

    if (!updatedSubdealer) {
      return next(new AppError('No subdealer found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        subdealer: updatedSubdealer
      }
    });
  } catch (err) {
    logger.error(`Error updating subdealer status: ${err.message}`);
    next(err);
  }
};

// Get subdealers near a location (geospatial query)
exports.getSubdealersNearLocation = async (req, res, next) => {
  try {
    const { longitude, latitude, maxDistance = 10000, branch } = req.query;

    // Validate coordinates
    if (!longitude || !latitude) {
      return next(new AppError('Longitude and latitude are required', 400));
    }

    const lng = parseFloat(longitude);
    const lat = parseFloat(latitude);
    const distance = parseFloat(maxDistance);

    if (isNaN(lng) || lng < -180 || lng > 180) {
      return next(new AppError('Valid longitude between -180 and 180 is required', 400));
    }
    if (isNaN(lat) || lat < -90 || lat > 90) {
      return next(new AppError('Valid latitude between -90 and 90 is required', 400));
    }
    if (isNaN(distance) || distance <= 0) {
      return next(new AppError('Valid maxDistance greater than 0 is required', 400));
    }

    // Build query
    const query = {
      'latLong.coordinates': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          $maxDistance: distance // in meters
        }
      }
    };

    // Add branch filter if provided
    if (branch) {
      if (mongoose.Types.ObjectId.isValid(branch)) {
        query.branch = branch;
      } else {
        return next(new AppError('Invalid branch ID format', 400));
      }
    }

    const subdealers = await Subdealer.find(query)
      .populate('createdByDetails', 'name email')
      .populate('branchDetails', 'name city state')
      .limit(50); // Limit results for performance

    // Calculate distance for each result (optional)
    const subdealersWithDistance = subdealers.map(subdealer => {
      const subdealerCoords = subdealer.latLong.coordinates;
      // Simple distance calculation (approximate)
      const distanceInKm = calculateDistance(lat, lng, subdealerCoords[1], subdealerCoords[0]);
      
      return {
        ...subdealer.toObject(),
        distance: {
          km: distanceInKm,
          meters: Math.round(distanceInKm * 1000)
        }
      };
    });

    res.status(200).json({
      status: 'success',
      results: subdealersWithDistance.length,
      data: {
        subdealers: subdealersWithDistance,
        query: {
          center: { longitude: lng, latitude: lat },
          maxDistance: `${distance} meters`
        }
      }
    });
  } catch (err) {
    logger.error(`Error getting subdealers near location: ${err.message}`);
    next(err);
  }
};


// Delete a subdealer
exports.deleteSubdealer = async (req, res, next) => {
  try {
    const subdealer = await Subdealer.findByIdAndDelete(req.params.id);

    if (!subdealer) {
      return next(new AppError('No subdealer found with that ID', 404));
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (err) {
    logger.error(`Error deleting subdealer: ${err.message}`);
    next(err);
  }
};

// Add this method to get subdealers by branch
exports.getSubdealersByBranch = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { status, type, search } = req.query;

    // Validate branch ID
    if (!mongoose.Types.ObjectId.isValid(branchId)) {
      return next(new AppError('Invalid branch ID format', 400));
    }

    // Build filter
    const filter = { branch: branchId };
    
    if (status && ['active', 'inactive'].includes(status.toLowerCase())) {
      filter.status = status.toLowerCase();
    }
    
    if (type && ['B2B', 'B2C'].includes(type.toUpperCase())) {
      filter.type = type.toUpperCase();
    }

    // Add search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'latLong.address': { $regex: search, $options: 'i' } }
      ];
    }

    const subdealers = await Subdealer.find(filter)
      .populate('createdByDetails', 'name email')
      .populate('branchDetails', 'name city state')
      .populate('headerDetails', 'category_key type header_key priority is_mandatory is_discount') // NEW: Populate headers
      .sort({ name: 1 });

    res.status(200).json({
      status: 'success',
      results: subdealers.length,
      data: {
        subdealers
      }
    });
  } catch (err) {
    logger.error(`Error getting subdealers by branch: ${err.message}`);
    next(err);
  }
};
// In subdealerController.js - Update the getSubdealerFinancialSummary method
// In subdealerController.js - Update the getSubdealerFinancialSummary method
exports.getSubdealerFinancialSummary = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new AppError('Invalid subdealer ID', 400));
    }

    // Check if subdealer exists
    const subdealer = await Subdealer.findById(id)
      .populate('createdByDetails', 'name email')
      .populate('branchDetails', 'name city state');
    
    if (!subdealer) {
      return next(new AppError('Subdealer not found', 404));
    }

    // Build date filter
    const dateFilter = {};
    if (from || to) {
      dateFilter.createdAt = {};
      if (from) dateFilter.createdAt.$gte = new Date(from);
      if (to) dateFilter.createdAt.$lte = new Date(to + 'T23:59:59.999Z');
    }

    // 1. Get booking statistics
    const bookingMatch = {
      subdealer: new mongoose.Types.ObjectId(id),
      bookingType: 'SUBDEALER',
      ...dateFilter
    };

    const bookingStats = await Booking.aggregate([
      { $match: bookingMatch },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          totalBookingAmount: { $sum: '$discountedAmount' },
          totalReceivedAmount: { $sum: '$receivedAmount' },
          totalBalanceAmount: { $sum: '$balanceAmount' },
          totalDiscountedAmount: { $sum: '$discountedAmount' }
        }
      }
    ]);

    const bookingSummary = bookingStats[0] || {
      totalBookings: 0,
      totalBookingAmount: 0,
      totalReceivedAmount: 0,
      totalBalanceAmount: 0,
      totalDiscountedAmount: 0
    };

    // 2. Get on-account summary - FIXED: Only approved receipts
    const onAccountMatch = {
      subdealer: new mongoose.Types.ObjectId(id),
      approvalStatus: 'Approved',
      ...dateFilter
    };

    const onAccountStats = await SubdealerOnAccountRef.aggregate([
      { $match: onAccountMatch },
      {
        $group: {
          _id: null,
          totalReceipts: { $sum: 1 },
          totalReceiptAmount: { $sum: '$amount' },
          totalAllocated: { $sum: '$allocatedTotal' },
          totalBalance: { $sum: { $subtract: ['$amount', '$allocatedTotal'] } }
        }
      }
    ]);

    const onAccountSummary = onAccountStats[0] || {
      totalReceipts: 0,
      totalReceiptAmount: 0,
      totalAllocated: 0,
      totalBalance: 0
    };

    // 3. Calculate financial overview
    const totalOutstanding = bookingSummary.totalBalanceAmount;
    const availableCredit = onAccountSummary.totalBalance;
    const netPosition = availableCredit - totalOutstanding;

    const financialOverview = {
      totalOutstanding,
      availableCredit,
      netPosition,
      status: netPosition >= 0 ? 'POSITIVE' : 'NEGATIVE'
    };

    // 4. Get ALL bookings (not just recent) with payment type
    const allTransactions = await Booking.find({
      subdealer: id,
      bookingType: 'SUBDEALER',
      ...dateFilter
    })
      .select('bookingNumber customerDetails.name discountedAmount receivedAmount balanceAmount status createdAt payment')
      .sort({ createdAt: -1 }) // Sort by newest first
      .lean();

    // Format transactions to include payment type
    const formattedTransactions = allTransactions.map(transaction => ({
      _id: transaction._id,
      bookingNumber: transaction.bookingNumber,
      customerName: transaction.customerDetails?.name || 'N/A',
      totalAmount: transaction.discountedAmount,
      receivedAmount: transaction.receivedAmount,
      balanceAmount: transaction.balanceAmount,
      status: transaction.status,
      createdAt: transaction.createdAt,
      paymentType: transaction.payment?.type || 'N/A', // Add payment type
      paymentMode: transaction.payment?.type === 'FINANCE' ? 'FINANCE' : 'CASH' // For consistency
    }));

    // 5. Get detailed recent on-account receipts with allocation details
    const recentReceipts = await SubdealerOnAccountRef.find({
      subdealer: id,
      ...dateFilter
    })
      .populate({
        path: 'allocations.booking',
        select: 'bookingNumber customerDetails.name totalAmount'
      })
      .populate({
        path: 'allocations.allocatedBy',
        select: 'name'
      })
      .select('refNumber paymentMode amount allocatedTotal status receivedDate remark allocations')
      .sort({ receivedDate: -1 })
      .limit(10)
      .lean();

    // Format the receipts to include detailed allocation information
    const formattedReceipts = recentReceipts.map(receipt => {
      const formattedAllocations = receipt.allocations.map(allocation => ({
        bookingNumber: allocation.booking?.bookingNumber || 'N/A',
        customerName: allocation.booking?.customerDetails?.name || 'N/A',
        allocatedAmount: allocation.amount,
        allocatedAt: allocation.allocatedAt,
        allocatedBy: allocation.allocatedBy?.name || 'N/A',
        remark: allocation.remark || ''
      }));

      return {
        _id: receipt._id,
        refNumber: receipt.refNumber,
        paymentMode: receipt.paymentMode,
        amount: receipt.amount,
        allocatedTotal: receipt.allocatedTotal,
        remainingBalance: receipt.amount - receipt.allocatedTotal,
        status: receipt.status,
        receivedDate: receipt.receivedDate,
        remark: receipt.remark || '',
        allocations: formattedAllocations,
        allocationCount: receipt.allocations.length
      };
    });

    res.status(200).json({
      status: 'success',
      data: {
        subdealer,
        bookingSummary: {
          totalBookings: bookingSummary.totalBookings,
          totalBookingAmount: bookingSummary.totalBookingAmount,
          totalReceivedAmount: bookingSummary.totalReceivedAmount,
          totalBalanceAmount: bookingSummary.totalBalanceAmount,
          totalDiscountedAmount: bookingSummary.totalDiscountedAmount,
          averageBookingValue: bookingSummary.totalBookings > 0 
            ? bookingSummary.totalBookingAmount / bookingSummary.totalBookings 
            : 0
        },
        onAccountSummary: {
          totalReceipts: onAccountSummary.totalReceipts,
          totalReceiptAmount: onAccountSummary.totalReceiptAmount,
          totalAllocated: onAccountSummary.totalAllocated,
          totalBalance: onAccountSummary.totalBalance,
          utilizationRate: onAccountSummary.totalReceiptAmount > 0 
            ? (onAccountSummary.totalAllocated / onAccountSummary.totalReceiptAmount) * 100 
            : 0
        },
        financialOverview,
        recentTransactions: formattedTransactions, // Now shows ALL bookings with payment type
        recentReceipts: formattedReceipts,
        period: {
          from: from || 'All time',
          to: to || 'Present'
        }
      }
    });

  } catch (err) {
    logger.error(`Error getting subdealer financial summary: ${err.message}`);
    next(err);
  }
};
// Add this method to subdealerController.js
exports.getAllSubdealersWithFinancialSummary = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search, type, status, branch } = req.query;

    const pageNum = Number.parseInt(page, 10) || 1;
    const limitNum = Number.parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    // Build filter for subdealers
    const filter = {};
    if (search) filter.name = { $regex: search, $options: 'i' };
    if (type && ['B2B', 'B2C'].includes(String(type).toUpperCase())) {
      filter.type = String(type).toUpperCase();
    }
    if (status && ['active', 'inactive'].includes(String(status).toLowerCase())) {
      filter.status = String(status).toLowerCase();
    }
    // Add branch filter
    if (branch) {
      if (mongoose.Types.ObjectId.isValid(branch)) {
        filter.branch = branch;
      } else {
        return next(new AppError('Invalid branch ID format', 400));
      }
    }

    const total = await Subdealer.countDocuments(filter);

    const subdealers = await Subdealer.find(filter)
      .populate('createdByDetails', 'name email')
      .populate('branchDetails', 'name city state')
      .populate('headerDetails', 'category_key type header_key priority is_mandatory is_discount') // NEW: Populate headers
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limitNum);

    // Nothing to aggregate? Return early
    if (subdealers.length === 0) {
      return res.status(200).json({
        status: 'success',
        data: {
          subdealers: [],
          pagination: {
            total,
            pages: Math.ceil(total / limitNum),
            page: pageNum,
            limit: limitNum,
            hasNext: pageNum < Math.ceil(total / limitNum),
            hasPrev: pageNum > 1
          }
        }
      });
    }

    const subdealerIds = subdealers.map((s) => s._id);

    // -------- Booking aggregates (by subdealer) --------
    const bookingAgg = await Booking.aggregate([
      {
        $match: {
          subdealer: { $in: subdealerIds },
          bookingType: 'SUBDEALER'
        }
      },
      {
        $group: {
          _id: '$subdealer',
          totalBookings: { $sum: 1 },
          totalBookingAmount: { $sum: { $ifNull: ['$discountedAmount', 0] } },
          totalReceivedAmount: { $sum: { $ifNull: ['$receivedAmount', 0] } },
          totalBalanceAmount: { $sum: { $ifNull: ['$balanceAmount', 0] } }
        }
      }
    ]);

    const bookingBySubdealer = new Map(
      bookingAgg.map((row) => [
        String(row._id),
        {
          totalBookings: row.totalBookings || 0,
          totalBookingAmount: row.totalBookingAmount || 0,
          totalReceivedAmount: row.totalReceivedAmount || 0,
          totalBalanceAmount: row.totalBalanceAmount || 0
        }
      ])
    );

    // -------- On-Account aggregates (by subdealer) --------
    const onAccountAgg = await SubdealerOnAccountRef.aggregate([
      {
        $match: {
          subdealer: { $in: subdealerIds },
          $or: [
            { approvalStatus: 'Approved' },
            { paymentMode: 'Cash' }
          ]
        }
      },
      {
        $group: {
          _id: '$subdealer',
          totalReceipts: { $sum: 1 },
          totalReceiptAmount: { $sum: { $ifNull: ['$amount', 0] } },
          totalAllocated: { $sum: { $ifNull: ['$allocatedTotal', 0] } }
        }
      },
      {
        $addFields: {
          totalBalance: { $subtract: ['$totalReceiptAmount', '$totalAllocated'] }
        }
      }
    ]);

    const onAccountBySubdealer = new Map(
      onAccountAgg.map((row) => [
        String(row._id),
        {
          totalReceipts: row.totalReceipts || 0,
          totalReceiptAmount: row.totalReceiptAmount || 0,
          totalAllocated: row.totalAllocated || 0,
          totalBalance: row.totalBalance || 0
        }
      ])
    );

    // -------- Stitch results --------
    const subdealersWithFinancials = subdealers.map((s) => {
      const key = String(s._id);
      const bookingSummary =
        bookingBySubdealer.get(key) || {
          totalBookings: 0,
          totalBookingAmount: 0,
          totalReceivedAmount: 0,
          totalBalanceAmount: 0
        };

      const onAccountSummary =
        onAccountBySubdealer.get(key) || {
          totalReceipts: 0,
          totalReceiptAmount: 0,
          totalAllocated: 0,
          totalBalance: 0
        };

      const totalOutstanding = bookingSummary.totalBalanceAmount;
      const availableCredit = onAccountSummary.totalBalance;
      const netPosition = availableCredit - totalOutstanding;

      return {
        ...s.toObject(),
        financials: {
          bookingSummary,
          onAccountSummary,
          financialOverview: {
            totalOutstanding,
            availableCredit,
            netPosition,
            status: netPosition >= 0 ? 'POSITIVE' : 'NEGATIVE'
          }
        }
      };
    });

    res.status(200).json({
      status: 'success',
      data: {
        subdealers: subdealersWithFinancials,
        pagination: {
          total,
          pages: Math.ceil(total / limitNum),
          page: pageNum,
          limit: limitNum,
          hasNext: pageNum < Math.ceil(total / limitNum),
          hasPrev: pageNum > 1
        }
      }
    });
  } catch (err) {
    logger.error(`Error getting all subdealers with financial summary: ${err.message}`);
    next(err);
  }
};


// Get headers for a specific subdealer
exports.getSubdealerHeaders = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { type, is_mandatory, is_discount, category_key } = req.query;

    // Validate subdealer ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new AppError('Invalid subdealer ID format', 400));
    }

    // Find the subdealer and populate headers
    const subdealer = await Subdealer.findById(id)
      .populate({
        path: 'headerDetails',
        match: {}, // Start with no filter, we'll apply filters conditionally
        select: 'category_key type header_key priority is_mandatory is_discount display_name description validation_rules'
      });

    if (!subdealer) {
      return next(new AppError('Subdealer not found', 404));
    }

    // Get the headers array
    let headers = subdealer.headerDetails || [];

    // Apply filters if provided
    if (type) {
      headers = headers.filter(header => header.type === type);
    }

    if (is_mandatory !== undefined) {
      const mandatory = is_mandatory === 'true';
      headers = headers.filter(header => header.is_mandatory === mandatory);
    }

    if (is_discount !== undefined) {
      const discount = is_discount === 'true';
      headers = headers.filter(header => header.is_discount === discount);
    }

    if (category_key) {
      headers = headers.filter(header => header.category_key === category_key);
    }

    res.status(200).json({
      status: 'success',
      data: {
        subdealer: {
          id: subdealer._id,
          name: subdealer.name
        },
        headers: headers,
        total: headers.length
      }
    });

  } catch (err) {
    logger.error(`Error getting subdealer headers: ${err.message}`);
    next(err);
  }
};