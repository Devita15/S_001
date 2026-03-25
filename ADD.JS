const Booking = require('../models/Booking');
const mongoose = require('mongoose');
const Quotation = require('../models/QuotationModel');
const ExcelJS = require('exceljs');
const moment = require('moment');
const Ledger = require('../models/Ledger');
const Receipt = require('../models/Receipt');
const StockTransfer = require('../models/stockTransferModel');
const Vehicle = require('../models/vehicleInwardModel');
const Branch = require('../models/Branch');
const Subdealer = require('../models/Subdealer');
const AppError = require('../utils/appError');
const logger = require('../config/logger');
const path = require('path');
const User = require('../models/User')
const DummyInvoice = require('../models/DummyInvoice')
const Header = require('../models/HeaderModel')
const Insurance = require('../models/insuranceModel');

/**
 * Generate branch sales report with proper allocation date filtering
 * Shows only bookings with status = 'ALLOCATED' filtered by allocation date from vehicle history
 */

const rtoHeaderKeys = [
  'RTO CHARGES',
  'RTO TAX & REGISTRATION CHARGES',
  'RTO Redg.CHARGES WITH SMART CARD',
  'RTO CHARGES BH/CRTM',
  'RTO Redg.CHARGES WITH SMART CARD',
  'RTO'
];
exports.generateBranchSalesReport = async (req, res) => {
    try {
      const { 
        branchId, 
        startDate, 
        endDate, 
        status, 
        bookingType,
        customerType,
        modelType,
        bookingSource,
        sourceType = 'BRANCH',
        subdealerId,
        format = 'excel' 
      } = req.query;
  
      // Validate required dates
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'Start date and end date are required'
        });
      }
  
      // Parse dates
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
  
      // Validate date range
      if (start > end) {
        return res.status(400).json({
          success: false,
          message: 'Start date cannot be greater than end date'
        });
      }
  
      // Get user info from auth middleware
      const userId = req.user.id;
      
      // Fetch user with all necessary data
      const user = await User.findById(userId)
        .select('-otp -otpExpires -emailOtp -emailOtpExpires -password')
        .populate({
          path: 'roles',
          select: 'name isSuperAdmin permissionsCount'
        })
        .populate('branch')
        .populate({
          path: 'accessibleBranches',
          model: 'Branch',
          select: '_id name address city state pincode phone email is_active logo1'
        })
        .populate({
          path: 'assignedSubdealers',
          model: 'Subdealer',
          select: '_id name firmName type status branch'
        })
        .lean();
  
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
  
      console.log(`User: ${user.name} (${user.email})`);
      console.log(`User's branch: ${user.branch?.name || 'None'}`);
      console.log(`Branch Access Type: ${user.branchAccess || 'OWN'}`);
      
      // Check user roles
      const userRoles = user.roles || [];
      const roleNames = userRoles.map(role => role.name);
      console.log('User roles:', roleNames);
      
      const isActualSuperAdmin = roleNames.includes("SUPERADMIN");
      const isSuperAdminFlag = userRoles.some(role => role.isSuperAdmin === true);
      const isADBDM = roleNames.includes("ADBDM");
      console.log('Is ADBDM user:', isADBDM);
      
      const branchAccess = user.branchAccess || 'OWN';
      
      let hasAllBranchesAccess = false;
      
      if (isActualSuperAdmin) {
        hasAllBranchesAccess = true;
        console.log('User is SUPERADMIN - has access to all branches');
      } else if (branchAccess === 'ALL') {
        hasAllBranchesAccess = true;
        console.log('User has ALL branch access permission');
      } else if (isSuperAdminFlag) {
        hasAllBranchesAccess = true;
        console.log('User is ADMIN/GM - has access to all branches');
      } else {
        console.log('User has restricted branch access');
      }
  
      // ========== GET AVAILABLE BRANCHES FOR DROPDOWN ==========
      let availableBranches = [];
      
      if (hasAllBranchesAccess) {
        availableBranches = await Branch.find({ is_active: true })
          .select('_id name address city')
          .sort({ name: 1 })
          .lean();
        console.log(`Fetched ${availableBranches.length} total branches for dropdown`);
      } else if (branchAccess === 'ASSIGNED' && user.accessibleBranches) {
        availableBranches = user.accessibleBranches.map(branch => ({
          _id: branch._id,
          name: branch.name,
          address: branch.address,
          city: branch.city
        })).sort((a, b) => a.name.localeCompare(b.name));
        console.log(`Using ${availableBranches.length} assigned branches for dropdown`);
      } else if (user.branch) {
        availableBranches = [{
          _id: user.branch._id,
          name: user.branch.name,
          address: user.branch.address,
          city: user.branch.city
        }];
        console.log('Using only own branch for dropdown');
      }
      
      if (availableBranches.length > 1) {
        availableBranches.unshift({
          _id: 'all',
          name: 'All Branches',
          address: '',
          city: ''
        });
        console.log('Added "All Branches" option to dropdown');
      }
  
      // ========== GET AVAILABLE SUBDEALERS FOR DROPDOWN ==========
      let availableSubdealers = [];
      
      if (isADBDM) {
        if (user.assignedSubdealers && user.assignedSubdealers.length > 0) {
          availableSubdealers = user.assignedSubdealers.map(subdealer => ({
            _id: subdealer._id,
            name: subdealer.firmName || subdealer.name,
            type: subdealer.type,
            status: subdealer.status
          })).sort((a, b) => a.name.localeCompare(b.name));
          console.log(`ADBDM user has ${availableSubdealers.length} assigned subdealers`);
        } else {
          console.log('ADBDM user has no assigned subdealers');
        }
      } else if (hasAllBranchesAccess) {
        const Subdealer = mongoose.model('Subdealer');
        const subdealers = await Subdealer.find({ status: 'active' })
          .select('_id name firmName type status')
          .sort({ name: 1 })
          .lean();
        
        availableSubdealers = subdealers.map(sub => ({
          _id: sub._id,
          name: sub.firmName || sub.name,
          type: sub.type,
          status: sub.status
        }));
        console.log(`Fetched ${availableSubdealers.length} total subdealers for dropdown`);
      } else if (user.branch) {
        const Subdealer = mongoose.model('Subdealer');
        const subdealers = await Subdealer.find({ 
          branch: user.branch._id,
          status: 'active'
        })
          .select('_id name firmName type status')
          .sort({ name: 1 })
          .lean();
        
        availableSubdealers = subdealers.map(sub => ({
          _id: sub._id,
          name: sub.firmName || sub.name,
          type: sub.type,
          status: sub.status
        }));
        console.log(`Fetched ${availableSubdealers.length} subdealers for branch ${user.branch.name}`);
      }
      
      if (availableSubdealers.length > 1) {
        availableSubdealers.unshift({
          _id: 'all',
          name: 'All Subdealers',
          type: '',
          status: ''
        });
        console.log('Added "All Subdealers" option to subdealer dropdown');
      }
  
      // ========== BUILD FILTER CONDITIONS ==========
      const bookingFilter = {
        status: 'ALLOCATED'
      };
  
      // Handle sourceType filter
      if (sourceType === 'SUBDEALER') {
        bookingFilter.bookingType = 'SUBDEALER';
        console.log('Filtering for SUBDEALER bookings only');
      } else if (sourceType === 'BRANCH') {
        bookingFilter.bookingType = 'BRANCH';
        console.log('Filtering for BRANCH bookings only');
      } else if (sourceType === 'BOTH') {
        console.log('Including BOTH branch and subdealer bookings');
      } else {
        bookingFilter.bookingType = 'BRANCH';
        console.log('Defaulting to BRANCH bookings only');
      }
  
      // Handle backward compatibility
      if (bookingSource && !sourceType) {
        if (bookingSource === 'BOTH') {
          delete bookingFilter.bookingType;
        } else if (bookingSource === 'BRANCH') {
          bookingFilter.bookingType = 'BRANCH';
        } else if (bookingSource === 'SUBDEALER') {
          bookingFilter.bookingType = 'SUBDEALER';
        }
      }
  
      // Handle payment type filter
      if (bookingType) {
        bookingFilter['payment.type'] = bookingType;
        console.log(`Applying payment type filter: ${bookingType}`);
      }
  
      // Apply branch filter (only for BRANCH or BOTH)
      if (sourceType !== 'SUBDEALER') {
        if (!hasAllBranchesAccess) {
          if (branchAccess === 'ASSIGNED' && user.accessibleBranches && user.accessibleBranches.length > 0) {
            const accessibleBranchIds = user.accessibleBranches.map(branch => branch._id);
            
            if (branchId && branchId !== 'all') {
              const requestedBranchId = new mongoose.Types.ObjectId(branchId);
              const hasAccess = accessibleBranchIds.some(bId => 
                bId.toString() === requestedBranchId.toString()
              );
              
              if (!hasAccess) {
                return res.status(403).json({
                  success: false,
                  message: 'You do not have access to this branch'
                });
              }
              bookingFilter.branch = requestedBranchId;
            } else if (branchId === 'all' || !branchId) {
              bookingFilter.branch = { $in: accessibleBranchIds };
            }
          } else {
            if (user.branch && user.branch._id) {
              bookingFilter.branch = user.branch._id;
            } else {
              return res.status(403).json({
                success: false,
                message: 'You do not have access to any branch'
              });
            }
          }
        } else {
          if (branchId && branchId !== 'all') {
            bookingFilter.branch = new mongoose.Types.ObjectId(branchId);
          }
        }
      }
  
      // Apply subdealer filter (only for SUBDEALER or BOTH)
      if (sourceType === 'SUBDEALER' || sourceType === 'BOTH') {
        if (isADBDM) {
          if (user.assignedSubdealers && user.assignedSubdealers.length > 0) {
            const assignedSubdealerIds = user.assignedSubdealers.map(sub => sub._id);
            
            if (subdealerId && subdealerId !== 'all') {
              if (!mongoose.Types.ObjectId.isValid(subdealerId)) {
                return res.status(400).json({
                  success: false,
                  message: 'Invalid subdealer ID format'
                });
              }
              
              const requestedSubdealerId = new mongoose.Types.ObjectId(subdealerId);
              const hasAccess = assignedSubdealerIds.some(sId => 
                sId.toString() === requestedSubdealerId.toString()
              );
              
              if (!hasAccess) {
                return res.status(403).json({
                  success: false,
                  message: 'You do not have access to this subdealer'
                });
              }
              bookingFilter.subdealer = requestedSubdealerId;
            } else if (subdealerId === 'all' || !subdealerId) {
              bookingFilter.subdealer = { $in: assignedSubdealerIds };
            }
          } else {
            console.log('ADBDM user has no assigned subdealers');
            const emptyResult = {
              success: true,
              count: 0,
              data: [],
              availableBranches: availableBranches,
              availableSubdealers: availableSubdealers,
              userAccessInfo: {
                hasAllBranchesAccess: hasAllBranchesAccess,
                branchAccess: branchAccess,
                isADBDM: isADBDM,
                accessibleBranchesCount: user.accessibleBranches?.length || 0,
                assignedSubdealersCount: user.assignedSubdealers?.length || 0,
                userBranch: user.branch ? {
                  _id: user.branch._id,
                  name: user.branch.name
                } : null
              },
              filters: {
                startDate: start,
                endDate: end,
                branchId: branchId,
                subdealerId: subdealerId,
                sourceType: sourceType,
                status: 'ALLOCATED',
                bookingType: bookingType,
                customerType: customerType,
                modelType: modelType
              }
            };
            
            if (format === 'excel') {
              const workbook = new ExcelJS.Workbook();
              const worksheet = workbook.addWorksheet('Sales Report');
              const headers = ['No Data Available'];
              worksheet.columns = [{ header: 'No Data Available', key: 'noData', width: 30 }];
              
              res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
              res.setHeader('Content-Disposition', `attachment; filename="empty_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx"`);
              await workbook.xlsx.write(res);
              res.end();
              return;
            } else {
              return res.status(200).json(emptyResult);
            }
          }
        } else if (hasAllBranchesAccess) {
          if (subdealerId && subdealerId !== 'all') {
            if (!mongoose.Types.ObjectId.isValid(subdealerId)) {
              return res.status(400).json({
                success: false,
                message: 'Invalid subdealer ID format'
              });
            }
            bookingFilter.subdealer = new mongoose.Types.ObjectId(subdealerId);
          }
        } else if (user.branch) {
          if (subdealerId && subdealerId !== 'all') {
            if (!mongoose.Types.ObjectId.isValid(subdealerId)) {
              return res.status(400).json({
                success: false,
                message: 'Invalid subdealer ID format'
              });
            }
            
            const Subdealer = mongoose.model('Subdealer');
            const subdealer = await Subdealer.findById(subdealerId);
            if (subdealer && subdealer.branch && subdealer.branch.toString() === user.branch._id.toString()) {
              bookingFilter.subdealer = new mongoose.Types.ObjectId(subdealerId);
            } else {
              return res.status(403).json({
                success: false,
                message: 'You do not have access to this subdealer'
              });
            }
          }
        }
      }
  
      // Apply customer type filter
      if (customerType) {
        bookingFilter.customerType = customerType;
        console.log(`Applying customerType filter: ${customerType}`);
      }
  
      console.log('Final Booking Filter:', JSON.stringify(bookingFilter, null, 2));
  
      // ========== FETCH BOOKINGS ==========
      let bookingsQuery = Booking.find(bookingFilter)
        .populate('model', 'model_name type')
        .populate('color', 'name')
        .populate('branch', 'name address city')
        .populate('subdealer', 'name firmName')
        .populate('salesExecutive', 'name email mobile')
        .populate('subdealerUser', 'name email mobile')
        .populate('createdBy', 'name email')
        .populate('verticleDetails', 'name')
        .populate({
          path: 'priceComponents.header',
          select: 'header_key category_key priority type',
          model: 'Header'
        })
        .populate({
          path: 'ledgerEntries',
          select: 'amount paymentMode type date approvalStatus isDebit',
          match: { approvalStatus: 'Approved' }
        })
        .populate('financeDisbursements', 'disbursementReference disbursementAmount receivedAmount status disbursementDate')
        .populate('exchangeDetails.broker', 'name mobile')
        .populate('payment.financer', 'name')
        .populate({
          path: 'accessories.accessory',
          select: 'name code category description',
          model: 'Accessory'
        })
        .populate({
          path: 'vehicle',
          select: 'chassisNumber engineNumber batteryNumber keyNumber motorNumber chargerNumber allocationHistory',
          model: 'Vehicle'
        });
  
      // Apply model type filter
      if (modelType && modelType !== 'all') {
        const models = await mongoose.model('Model').find({ 
          type: modelType.toUpperCase() 
        }).select('_id').lean();
        
        const modelIds = models.map(model => model._id);
        
        if (modelIds.length > 0) {
          bookingsQuery = bookingsQuery.where('model').in(modelIds);
          console.log(`Applying modelType filter: ${modelType} (${modelIds.length} models)`);
        } else {
          console.log(`No models found for type: ${modelType}`);
          const emptyResult = {
            success: true,
            count: 0,
            data: [],
            availableBranches: availableBranches,
            availableSubdealers: availableSubdealers,
            userAccessInfo: {
              hasAllBranchesAccess: hasAllBranchesAccess,
              branchAccess: branchAccess,
              isADBDM: isADBDM,
              accessibleBranchesCount: user.accessibleBranches?.length || 0,
              assignedSubdealersCount: user.assignedSubdealers?.length || 0,
              userBranch: user.branch ? {
                _id: user.branch._id,
                name: user.branch.name
              } : null
            },
            filters: {
              startDate: start,
              endDate: end,
              branchId: branchId,
              subdealerId: subdealerId,
              sourceType: sourceType,
              status: 'ALLOCATED',
              bookingType: bookingType,
              customerType: customerType,
              modelType: modelType
            }
          };
          
          if (format === 'excel') {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Sales Report');
            const headers = ['No Data Available'];
            worksheet.columns = [{ header: 'No Data Available', key: 'noData', width: 30 }];
            
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="empty_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx"`);
            await workbook.xlsx.write(res);
            res.end();
            return;
          } else {
            return res.status(200).json(emptyResult);
          }
        }
      }
  
      // Execute query
      let bookings = await bookingsQuery.lean();
      console.log(`Found ${bookings.length} bookings with ALLOCATED status before date filtering`);
      console.log(`Booking types in results: ${[...new Set(bookings.map(b => b.bookingType))].join(', ')}`);
  
      // Filter by allocation date
      const filteredBookings = [];
      
      for (const booking of bookings) {
        let allocationDate = null;
        let allocationStatus = null;
        
        if (booking.vehicle && booking.vehicle.allocationHistory && booking.vehicle.allocationHistory.length > 0) {
          const allocationEntries = booking.vehicle.allocationHistory.filter(
            history => history.bookingId && 
                      history.bookingId.toString() === booking._id.toString() &&
                      history.status === 'ALLOCATED'
          );
          
          if (allocationEntries.length > 0) {
            allocationEntries.sort((a, b) => new Date(b.allocatedAt) - new Date(a.allocatedAt));
            const latestAllocation = allocationEntries[0];
            allocationDate = latestAllocation.allocatedAt;
            allocationStatus = latestAllocation.status;
          }
        }
        
        if (allocationDate) {
          const allocDate = new Date(allocationDate);
          if (allocDate >= start && allocDate <= end) {
            booking.allocationDate = allocationDate;
            booking.allocationStatus = allocationStatus;
            filteredBookings.push(booking);
          }
        } else {
          console.log(`Booking ${booking.bookingNumber} has ALLOCATED status but no allocation history entry found`);
          const fallbackDate = booking.approvedAt || booking.updatedAt || booking.createdAt;
          if (fallbackDate) {
            const fallbackDateObj = new Date(fallbackDate);
            if (fallbackDateObj >= start && fallbackDateObj <= end) {
              booking.allocationDate = fallbackDate;
              booking.allocationStatus = 'ALLOCATED';
              filteredBookings.push(booking);
            }
          }
        }
      }
  
      console.log(`After allocation date filtering, ${filteredBookings.length} records with ALLOCATED status in date range`);
  
      if (filteredBookings.length === 0) {
        const emptyResult = {
          success: true,
          count: 0,
          data: [],
          availableBranches: availableBranches,
          availableSubdealers: availableSubdealers,
          userAccessInfo: {
            hasAllBranchesAccess: hasAllBranchesAccess,
            branchAccess: branchAccess,
            isADBDM: isADBDM,
            accessibleBranchesCount: user.accessibleBranches?.length || 0,
            assignedSubdealersCount: user.assignedSubdealers?.length || 0,
            userBranch: user.branch ? {
              _id: user.branch._id,
              name: user.branch.name
            } : null
          },
          filters: {
            startDate: start,
            endDate: end,
            branchId: branchId,
            subdealerId: subdealerId,
            sourceType: sourceType,
            status: 'ALLOCATED',
            bookingType: bookingType,
            customerType: customerType,
            modelType: modelType
          }
        };
        
        if (format === 'excel') {
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet('Sales Report');
          const headers = ['No Data Available'];
          worksheet.columns = [{ header: 'No Data Available', key: 'noData', width: 30 }];
          
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename="empty_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx"`);
          await workbook.xlsx.write(res);
          res.end();
          return;
        } else {
          return res.status(200).json(emptyResult);
        }
      }
  
      // ========== GET DYNAMIC PRICE HEADERS ==========
      let headerTypeFilter = {};
      if (modelType && modelType !== 'all') {
        headerTypeFilter.type = modelType.toUpperCase();
        console.log(`Filtering headers by model type: ${modelType}`);
      } else {
        console.log('No modelType filter or "all", fetching all headers (EV + ICE)');
      }
  
      const Header = mongoose.model('Header');
      const allPossibleHeaders = await Header.find(headerTypeFilter)
        .select('header_key priority type')
        .sort({ priority: 1 })
        .lean();
  
      console.log(`Found ${allPossibleHeaders.length} total possible headers in the system`);
  
      const headersToExcludeFromReport = [
        'ON ROAD PRICE',
        'ADD ON SERVICES TOTAL',
        'ACCESSORIES TOTAL'
      ];
  
      const headerMap = new Map();
      allPossibleHeaders.forEach(header => {
        if (header.header_key) {
          const shouldExclude = headersToExcludeFromReport.some(excludeHeader => 
            header.header_key.includes(excludeHeader) || excludeHeader.includes(header.header_key)
          );
          
          if (!shouldExclude) {
            headerMap.set(header.header_key, {
              header_key: header.header_key,
              priority: header.priority || 999,
              type: header.type,
              index: headerMap.size
            });
          }
        }
      });
  
      const priceHeaders = Array.from(headerMap.values())
        .sort((a, b) => a.priority - b.priority);
  
      console.log(`Using ${priceHeaders.length} price headers for report`);
  
      // Helper functions
      const isEVBooking = (booking) => {
        return booking.model && booking.model.type === 'EV';
      };
  
      const isICEBooking = (booking) => {
        return booking.model && booking.model.type === 'ICE';
      };
  
      const getRTOAmount = (booking) => {
        if (booking.rtoAmount && booking.rtoAmount > 0) {
          return booking.rtoAmount;
        }
        
        if (booking.priceComponents && booking.priceComponents.length > 0) {
          for (const pc of booking.priceComponents) {
            if (pc.header && pc.header.header_key) {
              const headerKey = pc.header.header_key;
              if (headerKey.includes('RTO')) {
                return pc.discountedValue !== undefined ? pc.discountedValue : (pc.originalValue || 0);
              }
            }
          }
        }
        
        return 0;
      };
  
      // ========== GENERATE EXCEL REPORT ==========
      if (format === 'excel') {
        const workbook = new ExcelJS.Workbook();
        
        let worksheetName = 'Sales Report';
        if (branchId && branchId !== 'all' && filteredBookings.length > 0) {
          const branch = filteredBookings[0]?.branch?.name;
          if (branch) {
            worksheetName = `${branch} Sales Report`;
          }
        } else if (hasAllBranchesAccess && (!branchId || branchId === 'all')) {
          worksheetName = 'All Branches Sales Report';
        }
        
        if (modelType && modelType !== 'all') {
          worksheetName = `${modelType} ${worksheetName}`;
        } else {
          worksheetName = `EV+ICE ${worksheetName}`;
        }
        
        const worksheet = workbook.addWorksheet(worksheetName.substring(0, 31), {
          properties: { defaultRowHeight: 20 },
          pageSetup: { paperSize: 9, orientation: 'landscape' }
        });
  
        const baseHeaders = [
          'Booking Number', 'Booking Date', 'Allocation Date', 'Branch/Subdealer Name', 
          'Sales Executive', 'Model', 'Verticle', 'Model Type', 'Color', 
          'Chassis Number', 'Engine Number', 'Customer Name', 'Mobile1', 'Mobile2',
          'Address', 'Pincode', 'Aadhar number', 'Pan no', 'Birthday',
          'Nominee Name', 'Nominee Relation', 'Nominee Age',
          'Booking Type (CASH/FINANCE)', 'Financier Name', 'Customer Type', 'GST Number',
          'Exchange', 'Exchange Vehicle Number', 'Exchange Chassis Number', 'Exchange Broker', 'Exchange Price',
          'Has Claim', 'Claim Price'
        ];
  
        const allHeaders = [...baseHeaders];
        priceHeaders.forEach(ph => {
          allHeaders.push(ph.header_key);
        });
        allHeaders.push('Total Amount', 'Total Discount Given', 'Final Deal Amount');
  
        const columns = allHeaders.map((header, index) => {
          let width = 15;
          if (header.includes('Name')) width = 20;
          else if (header.includes('Address')) width = 30;
          else if (header.includes('Number')) width = 18;
          else if (header === 'Has Claim') width = 12;
          else if (header === 'Claim Price') width = 15;
          
          return {
            header: header,
            key: `col_${index}`,
            width: width
          };
        });
  
        worksheet.columns = columns;
  
        const headerRow = worksheet.getRow(1);
        headerRow.height = 30;
        headerRow.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B5' } };
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
  
        filteredBookings.forEach((booking) => {
          const rowData = {};
          let colIndex = 0;
          
          rowData[`col_${colIndex++}`] = booking.bookingNumber || '';
          rowData[`col_${colIndex++}`] = booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : '';
          rowData[`col_${colIndex++}`] = booking.allocationDate ? moment(booking.allocationDate).format('DD/MM/YYYY') : '';
          
          let sourceName = '';
          if (booking.bookingType === 'BRANCH') {
            sourceName = booking.branch?.name || '';
          } else if (booking.bookingType === 'SUBDEALER') {
            sourceName = booking.subdealer?.firmName || booking.subdealer?.name || '';
          }
          rowData[`col_${colIndex++}`] = sourceName;
          
          rowData[`col_${colIndex++}`] = booking.salesExecutive?.name || '';
          rowData[`col_${colIndex++}`] = booking.model?.model_name || '';
          
          let verticleNames = '';
          if (booking.verticleDetails && booking.verticleDetails.length > 0) {
            verticleNames = booking.verticleDetails.map(v => v.name || '').filter(name => name !== '').join(', ');
          }
          rowData[`col_${colIndex++}`] = verticleNames;
          
          rowData[`col_${colIndex++}`] = booking.model?.type || '';
          rowData[`col_${colIndex++}`] = booking.color?.name || '';
          rowData[`col_${colIndex++}`] = booking.chassisNumber || (booking.vehicle?.chassisNumber || '');
          rowData[`col_${colIndex++}`] = booking.vehicle?.engineNumber || booking.engineNumber || '';
          rowData[`col_${colIndex++}`] = booking.customerDetails?.name || '';
          rowData[`col_${colIndex++}`] = booking.customerDetails?.mobile1 || '';
          rowData[`col_${colIndex++}`] = booking.customerDetails?.mobile2 || '';
          rowData[`col_${colIndex++}`] = booking.customerDetails?.address || '';
          rowData[`col_${colIndex++}`] = booking.customerDetails?.pincode || '';
          rowData[`col_${colIndex++}`] = booking.customerDetails?.aadharNumber || '';
          rowData[`col_${colIndex++}`] = booking.customerDetails?.panNo || '';
          rowData[`col_${colIndex++}`] = booking.customerDetails?.dob ? moment(booking.customerDetails.dob).format('DD/MM/YYYY') : '';
          rowData[`col_${colIndex++}`] = booking.customerDetails?.nomineeName || '';
          rowData[`col_${colIndex++}`] = booking.customerDetails?.nomineeRelation || '';
          rowData[`col_${colIndex++}`] = booking.customerDetails?.nomineeAge || '';
          rowData[`col_${colIndex++}`] = booking.payment?.type || '';
          
          let financierName = '';
          if (booking.payment?.type === 'FINANCE' && booking.payment?.financer) {
            financierName = booking.payment.financer.name || '';
          }
          rowData[`col_${colIndex++}`] = financierName;
          
          rowData[`col_${colIndex++}`] = booking.customerType || '';
          rowData[`col_${colIndex++}`] = (booking.customerType === 'B2B') ? (booking.gstin || '') : '';
          rowData[`col_${colIndex++}`] = booking.exchange ? 'YES' : 'NO';
          rowData[`col_${colIndex++}`] = booking.exchangeDetails?.vehicleNumber || '';
          rowData[`col_${colIndex++}`] = booking.exchangeDetails?.chassisNumber || '';
          rowData[`col_${colIndex++}`] = booking.exchangeDetails?.broker?.name || '';
          rowData[`col_${colIndex++}`] = booking.exchangeDetails?.price || 0;
          rowData[`col_${colIndex++}`] = (booking.claimDetails && booking.claimDetails.hasClaim) ? 'YES' : 'NO';
          rowData[`col_${colIndex++}`] = (booking.claimDetails && booking.claimDetails.priceClaim) || 0;
  
          const priceComponentMap = new Map();
          if (booking.priceComponents && booking.priceComponents.length > 0) {
            booking.priceComponents.forEach(pc => {
              if (pc.header && pc.header.header_key) {
                const headerKey = pc.header.header_key;
                const value = pc.discountedValue !== undefined ? pc.discountedValue : (pc.originalValue || 0);
                priceComponentMap.set(headerKey, value);
              }
            });
          }
  
          priceHeaders.forEach(ph => {
            rowData[`col_${colIndex++}`] = priceComponentMap.get(ph.header_key) || 0;
          });
  
          rowData[`col_${colIndex++}`] = booking.totalAmount || 0;
          const discountAmount = (booking.totalAmount || 0) - (booking.discountedAmount || 0);
          rowData[`col_${colIndex++}`] = discountAmount;
          rowData[`col_${colIndex++}`] = booking.discountedAmount || 0;
  
          worksheet.addRow(rowData);
        });
  
        for (let i = 1; i <= filteredBookings.length; i++) {
          const row = worksheet.getRow(i + 1);
          if (i % 2 === 0) {
            row.eachCell((cell) => {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF2F2F2' }
              };
            });
          }
        }
  
        if (worksheet.rowCount > 1) {
          const lastCol = worksheet.columnCount;
          let lastColLetter = '';
          let tempCol = lastCol;
          while (tempCol > 0) {
            const remainder = (tempCol - 1) % 26;
            lastColLetter = String.fromCharCode(65 + remainder) + lastColLetter;
            tempCol = Math.floor((tempCol - 1) / 26);
          }
          worksheet.autoFilter = {
            from: 'A1',
            to: `${lastColLetter}${worksheet.rowCount}`
          };
        }
  
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  
        const fileName = `sales_report_${modelType && modelType !== 'all' ? modelType + '_' : 'EV_ICE_'}${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        
        await workbook.xlsx.write(res);
        res.end();
  
      } else {
        // ========== RETURN JSON FORMAT ==========
        const formattedBookings = filteredBookings.map(booking => {
          const totalAmount = booking.totalAmount || 0;
          const discountedAmount = booking.discountedAmount || 0;
          const discountAmount = totalAmount - discountedAmount;
  
          const priceComponentsObj = {};
          let subsidyAmount = 0;
          
          if (booking.subsidyAmount && booking.subsidyAmount > 0) {
            subsidyAmount = booking.subsidyAmount;
          }
          
          if (booking.priceComponents && booking.priceComponents.length > 0) {
            booking.priceComponents.forEach(pc => {
              if (pc.header && pc.header.header_key) {
                const headerKey = pc.header.header_key;
                const value = pc.discountedValue !== undefined ? pc.discountedValue : (pc.originalValue || 0);
                
                const shouldExclude = headersToExcludeFromReport.some(excludeHeader => 
                  headerKey.includes(excludeHeader) || excludeHeader.includes(headerKey)
                );
                
                if (!shouldExclude) {
                  priceComponentsObj[headerKey] = value;
                }
              }
            });
          }
  
          const rtoAmount = getRTOAmount(booking);
          const isEV = isEVBooking(booking);
  
          let sourceName = '';
          if (booking.bookingType === 'BRANCH') {
            sourceName = booking.branch?.name || '';
          } else if (booking.bookingType === 'SUBDEALER') {
            sourceName = booking.subdealer?.firmName || booking.subdealer?.name || '';
          }
  
          let financierName = '';
          if (booking.payment?.type === 'FINANCE' && booking.payment?.financer) {
            financierName = booking.payment.financer.name || '';
          }
  
          return {
            bookingNumber: booking.bookingNumber,
            bookingDate: booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : '',
            allocationDate: booking.allocationDate ? moment(booking.allocationDate).format('DD/MM/YYYY') : '',
            sourceName: sourceName,
            sourceType: booking.bookingType,
            branchName: booking.branch?.name,
            branchId: booking.branch?._id,
            subdealerName: booking.subdealer?.firmName || booking.subdealer?.name,
            subdealerId: booking.subdealer?._id,
            salesExecutive: booking.salesExecutive?.name,
            model: booking.model?.model_name,
            modelType: booking.model?.type,
            color: booking.color?.name,
            chassisNumber: booking.chassisNumber,
            engineNumber: booking.vehicle?.engineNumber || booking.engineNumber || '',
            customerName: booking.customerDetails?.name,
            mobile1: booking.customerDetails?.mobile1,
            mobile2: booking.customerDetails?.mobile2,
            address: booking.customerDetails?.address,
            pincode: booking.customerDetails?.pincode || '',
            aadharNumber: booking.customerDetails?.aadharNumber,
            panNo: booking.customerDetails?.panNo,
            birthday: booking.customerDetails?.dob ? moment(booking.customerDetails.dob).format('DD/MM/YYYY') : '',
            nomineeName: booking.customerDetails?.nomineeName,
            nomineeRelation: booking.customerDetails?.nomineeRelation,
            nomineeAge: booking.customerDetails?.nomineeAge,
            bookingType: booking.payment?.type,
            financierName: financierName,
            customerType: booking.customerType,
            gstNumber: (booking.customerType === 'B2B') ? (booking.gstin || '') : '',
            exchange: booking.exchange ? 'YES' : 'NO',
            exchangeDetails: booking.exchangeDetails,
            rtoAmount: rtoAmount,
            claimDetails: booking.claimDetails,
            priceComponents: priceComponentsObj,
            subsidyAmount: isEV ? subsidyAmount : 0,
            totalAmount: totalAmount,
            totalDiscount: discountAmount,
            finalAmount: discountedAmount,
            isEV: isEV
          };
        });
  
        const overallTotals = formattedBookings.reduce((acc, booking) => {
          acc.totalAmount += booking.totalAmount || 0;
          acc.totalDiscount += booking.totalDiscount || 0;
          acc.finalAmount += booking.finalAmount || 0;
          acc.totalClaimAmount += (booking.claimDetails?.priceClaim || 0);
          acc.totalRTOCharges += (booking.rtoAmount || 0);
          acc.totalSubsidy += (booking.subsidyAmount || 0);
          return acc;
        }, { totalAmount: 0, totalDiscount: 0, finalAmount: 0, totalClaimAmount: 0, totalRTOCharges: 0, totalSubsidy: 0 });
  
        const bookingsWithClaim = filteredBookings.filter(b => b.claimDetails?.hasClaim).length;
        const evBookings = filteredBookings.filter(b => isEVBooking(b)).length;
        const iceBookings = filteredBookings.filter(b => isICEBooking(b)).length;
  
        res.status(200).json({
          success: true,
          count: formattedBookings.length,
          totals: overallTotals,
          data: formattedBookings,
          priceHeaders: priceHeaders.map(ph => ph.header_key),
          headerTypes: [...new Set(priceHeaders.map(h => h.type))],
          availableBranches: availableBranches,
          availableSubdealers: availableSubdealers,
          userAccessInfo: {
            hasAllBranchesAccess: hasAllBranchesAccess,
            branchAccess: branchAccess,
            isADBDM: isADBDM,
            accessibleBranchesCount: user.accessibleBranches?.length || 0,
            assignedSubdealersCount: user.assignedSubdealers?.length || 0,
            userBranch: user.branch ? {
              _id: user.branch._id,
              name: user.branch.name
            } : null
          },
          filters: {
            startDate: start,
            endDate: end,
            branchId: branchId,
            subdealerId: subdealerId,
            sourceType: sourceType,
            status: 'ALLOCATED',
            bookingType: bookingType,
            customerType: customerType,
            modelType: modelType
          },
          summary: {
            totalBookings: filteredBookings.length,
            evBookings: evBookings,
            iceBookings: iceBookings,
            branchBookings: filteredBookings.filter(b => b.bookingType === 'BRANCH').length,
            subdealerBookings: filteredBookings.filter(b => b.bookingType === 'SUBDEALER').length,
            totalClaimAmount: overallTotals.totalClaimAmount,
            totalRTOCharges: overallTotals.totalRTOCharges,
            totalSubsidy: overallTotals.totalSubsidy,
            bookingsWithClaim: bookingsWithClaim,
            modelTypesInReport: [...new Set(filteredBookings.map(b => b.model?.type).filter(Boolean))]
          }
        });
      }
  
    } catch (error) {
      console.error('Error generating sales report:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating sales report',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  };
// ============================================================
// FIXED: generateBranchSalesReport
// KEY CHANGES FOR EV SUBSIDY:
//   1. priceComponentMap for Ex-Showroom: add subsidyAmount to its value
//      so the column shows the GROSS price (before subsidy deduction)
//   2. LESS:- CENTER SUBSIDY(FAME-II) column: shows the raw subsidy amount
//   3. Total Discount Given: does NOT include subsidy
//      (subsidy is a govt benefit, not a dealer discount)
//   4. netAmountAfterSubsidy = discountedAmount (already correct — the
//      final amount the customer pays after subsidy has been applied)
// ============================================================


// ========== HELPER: Send empty report ==========
async function _sendEmptyReport(res, format, availableBranches, hasAllBranchesAccess, branchAccess, user, start, end, branchId, bookingFilter, customerType, modelType, bookingSource) {
  if (format === 'excel') {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');
    const headers = [
      'Booking Number', 'Booking Date', 'Allocation Date', 'Branch/Subdealer Name',
      'Sales Executive', 'Model', 'Verticle', 'Model Type', 'Color',
      'Chassis Number', 'Engine Number', 'Customer Name', 'Mobile1', 'Mobile2',
      'Address', 'Pincode', 'Aadhar number', 'Pan no', 'Birthday',
      'Nominee Name', 'Nominee Relation', 'Nominee Age',
      'Booking Type (CASH/FINANCE)', 'Financier Name', 'Customer Type', 'GST Number',
      'Exchange', 'Exchange Vehicle Number', 'Exchange Chassis Number', 'Exchange Broker', 'Exchange Price',
      'Has Claim', 'Claim Price', 'RTO CHARGES', 'Total Amount', 'Total Discount Given',
      'Final Deal Amount', 'Net Amount After Subsidy', 'Accessories'
    ];
    worksheet.columns = headers.map((header, index) => ({
      header,
      key: `col_${index}`,
      width: header.includes('Name') ? 20 : header.includes('Address') ? 30 : header.includes('Number') ? 18 : 15
    }));
    const fileName = `sales_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  } else {
    return res.status(200).json({
      success: true,
      count: 0,
      data: [],
      availableBranches,
      userAccessInfo: {
        hasAllBranchesAccess,
        branchAccess,
        accessibleBranchesCount: user.accessibleBranches?.length || 0,
        userBranch: user.branch ? { _id: user.branch._id, name: user.branch.name } : null
      },
      filters: {
        startDate: start,
        endDate: end,
        branchId,
        status: 'ALLOCATED',
        bookingType: bookingFilter.bookingType,
        customerType,
        modelType,
        bookingSource
      }
    });
  }
}
exports.generateSubdealerSalesReport = async (req, res) => {
  try {
    const { 
      subdealerId, 
      startDate, 
      endDate, 
      status, 
      bookingType,
      customerType,
      modelType,
      format = 'excel' 
    } = req.query;

    // Validate required dates
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Set end date to end of day
    end.setHours(23, 59, 59, 999);

    // Validate date range
    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'Start date cannot be greater than end date'
      });
    }

    // Get user info from auth middleware
    const userId = req.user.id;
    
    // Fetch user with all necessary data
    const user = await User.findById(userId)
      .select('-otp -otpExpires -emailOtp -emailOtpExpires -password')
      .populate({
        path: 'roles',
        select: 'name isSuperAdmin permissionsCount'
      })
      .populate('branch')
      .populate({
        path: 'accessibleBranches',
        model: 'Branch',
        select: '_id name address city state pincode phone email is_active'
      })
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`🏢 User's branch: ${user.branch?.name || 'None'}`);
    
    // Check user roles
    const userRoles = user.roles || [];
    
    // Check if user is SUPERADMIN
    const isActualSuperAdmin = userRoles.some(role => 
      role.name === "SUPERADMIN"
    ) || false;
    
    // Check if user has superadmin flag
    const isSuperAdminFlag = userRoles.some(role => 
      role.isSuperAdmin === true
    ) || false;
    
    // Determine subdealer access level
    let hasAllSubdealersAccess = false;
    
    if (isActualSuperAdmin) {
      hasAllSubdealersAccess = true;
      console.log('✅ User is SUPERADMIN - has access to all subdealers');
    } else if (isSuperAdminFlag) {
      hasAllSubdealersAccess = true;
      console.log('✅ User is ADMIN/GM - has access to all subdealers');
    } else {
      console.log('ℹ️ User has restricted subdealer access based on branch');
    }

    // ========== GET AVAILABLE SUBDEALERS FOR DROPDOWN ==========
    let availableSubdealers = [];
    
    if (hasAllSubdealersAccess) {
      // User can see all active subdealers
      availableSubdealers = await Subdealer.find({ status: 'active' })
        .select('_id name type branch latLong.address rateOfInterest creditPeriodDays discount')
        .populate('branch', 'name')
        .sort({ name: 1 })
        .lean();
      
      // Format the response
      availableSubdealers = availableSubdealers.map(sub => ({
        _id: sub._id,
        name: sub.name,
        type: sub.type,
        branchName: sub.branch?.name || '',
        address: sub.latLong?.address || '',
        rateOfInterest: sub.rateOfInterest,
        creditPeriodDays: sub.creditPeriodDays,
        discount: sub.discount
      }));
      
      console.log(`✅ Fetched ${availableSubdealers.length} total subdealers for dropdown`);
    } else {
      // Get subdealers based on user's branch access
      let branchIds = [];
      
      // Add user's own branch
      if (user.branch && user.branch._id) {
        branchIds.push(user.branch._id);
      }
      
      // Add accessible branches
      if (user.accessibleBranches && user.accessibleBranches.length > 0) {
        branchIds = [...branchIds, ...user.accessibleBranches.map(b => b._id)];
      }
      
      // Remove duplicates
      branchIds = [...new Set(branchIds.map(id => id.toString()))].map(id => 
        typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
      );
      
      if (branchIds.length > 0) {
        // Get subdealers under these branches
        availableSubdealers = await Subdealer.find({ 
          branch: { $in: branchIds },
          status: 'active'
        })
        .select('_id name type branch latLong.address rateOfInterest creditPeriodDays discount')
        .populate('branch', 'name')
        .sort({ name: 1 })
        .lean();
        
        // Format the response
        availableSubdealers = availableSubdealers.map(sub => ({
          _id: sub._id,
          name: sub.name,
          type: sub.type,
          branchName: sub.branch?.name || '',
          address: sub.latLong?.address || '',
          rateOfInterest: sub.rateOfInterest,
          creditPeriodDays: sub.creditPeriodDays,
          discount: sub.discount
        }));
        
        console.log(`✅ Found ${availableSubdealers.length} subdealers under accessible branches`);
      }
    }
    
    // If no subdealers found, return empty result
    if (availableSubdealers.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to any subdealers'
      });
    }
    
    // Add "All" option for users with multiple subdealer access
    if (availableSubdealers.length > 1) {
      availableSubdealers.unshift({
        _id: 'all',
        name: 'All Subdealers',
        type: '',
        branchName: '',
        address: '',
        rateOfInterest: null,
        creditPeriodDays: null,
        discount: null
      });
      console.log('✅ Added "All Subdealers" option to dropdown');
    }

    // ========== BUILD FILTER CONDITIONS ==========
    
    // Build booking filter for ALLOCATED status
    const bookingFilter = {
      status: 'ALLOCATED',
      bookingType: 'SUBDEALER' // Explicitly filter for subdealer bookings
    };

    // Apply subdealer filter - REMOVED THE ACCESS CHECK
    if (subdealerId && subdealerId !== 'all') {
      // Simply set the filter without checking access
      bookingFilter.subdealer = new mongoose.Types.ObjectId(subdealerId);
      console.log(`📋 Filtering by subdealer ID: ${subdealerId}`);
    } else if (subdealerId === 'all' || !subdealerId) {
      // If 'all' selected or no filter, show all subdealers
      // No need to restrict to accessible ones
      console.log('📋 Showing all subdealers (no restriction)');
    }

    // Apply additional filters
    if (bookingType) bookingFilter.bookingType = bookingType;
    if (customerType) bookingFilter.customerType = customerType;

    console.log('Subdealer Booking Filter:', JSON.stringify(bookingFilter, null, 2));

    // ========== FETCH BOOKINGS WITH ALLOCATED STATUS ==========
    // Get all bookings with ALLOCATED status and populate all required fields
    let bookingsQuery = Booking.find(bookingFilter)
      .populate('model', 'model_name type')
      .populate('color', 'name')
      .populate({
        path: 'subdealer',
        select: 'name type branch rateOfInterest creditPeriodDays discount',
        populate: {
          path: 'branch',
          select: 'name'
        }
      })
      .populate('subdealerUser', 'name email mobile')
      .populate('createdBy', 'name email')
      .populate('verticleDetails', 'name')
      .populate({
        path: 'priceComponents.header',
        select: 'header_key category_key priority'
      })
      .populate({
        path: 'ledgerEntries',
        select: 'amount paymentMode type date approvalStatus isDebit',
        match: { approvalStatus: 'Approved' }
      })
      .populate('financeDisbursements', 'disbursementReference disbursementAmount receivedAmount status disbursementDate')
      .populate('payment.financer', 'name')
      .populate({
        path: 'vehicle',
        select: 'chassisNumber engineNumber batteryNumber keyNumber motorNumber chargerNumber allocationHistory',
        model: 'Vehicle'
      });

    // Apply model type filter if provided (EV/ICE)
    if (modelType) {
      const models = await mongoose.model('Model').find({ 
        type: modelType.toUpperCase() 
      }).select('_id').lean();
      
      const modelIds = models.map(model => model._id);
      
      if (modelIds.length > 0) {
        bookingsQuery = bookingsQuery.where('model').in(modelIds);
        console.log(`📋 Applying modelType filter: ${modelType} (${modelIds.length} models)`);
      } else {
        // No models of this type found, return empty result
        console.log(`⚠️ No models found for type: ${modelType}`);
        if (format === 'excel') {
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet('Subdealer Sales Report');
          const headers = getSubdealerSalesHeaders([]);
          worksheet.columns = headers.map((header, index) => ({
            header: header,
            key: `col_${index}`,
            width: getSubdealerColumnWidth(header)
          }));
          
          const fileName = `subdealer_sales_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
          
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
          
          await workbook.xlsx.write(res);
          res.end();
          return;
        } else {
          return res.status(200).json({
            success: true,
            count: 0,
            data: [],
            availableSubdealers: availableSubdealers,
            userAccessInfo: {
              hasAllSubdealersAccess: hasAllSubdealersAccess,
              userBranch: user.branch ? {
                _id: user.branch._id,
                name: user.branch.name
              } : null,
              accessibleBranchesCount: user.accessibleBranches?.length || 0
            },
            filters: {
              startDate: start,
              endDate: end,
              subdealerId: subdealerId,
              status: 'ALLOCATED',
              bookingType: bookingType,
              customerType: customerType,
              modelType: modelType
            }
          });
        }
      }
    }

    // Execute the query to get all ALLOCATED bookings
    let bookings = await bookingsQuery.lean();

    console.log(`📊 Found ${bookings.length} subdealer bookings with ALLOCATED status before date filtering`);

    // ========== FILTER BY ALLOCATION DATE USING VEHICLE ALLOCATION HISTORY ==========
    const filteredBookings = [];
    
    for (const booking of bookings) {
      let allocationDate = null;
      let allocationStatus = null;
      
      // Check vehicle allocation history
      if (booking.vehicle && booking.vehicle.allocationHistory && booking.vehicle.allocationHistory.length > 0) {
        // Find allocation entries for this booking with ALLOCATED status
        const allocationEntries = booking.vehicle.allocationHistory.filter(
          history => history.bookingId && 
                    history.bookingId.toString() === booking._id.toString() &&
                    history.status === 'ALLOCATED'
        );
        
        if (allocationEntries.length > 0) {
          // Sort by date (most recent first)
          allocationEntries.sort((a, b) => new Date(b.allocatedAt) - new Date(a.allocatedAt));
          const latestAllocation = allocationEntries[0];
          
          allocationDate = latestAllocation.allocatedAt;
          allocationStatus = latestAllocation.status;
        }
      }
      
      // If allocation date found, check if it's within the requested date range
      if (allocationDate) {
        const allocDate = new Date(allocationDate);
        
        // Check if within range
        const isAfterStart = allocDate >= start;
        const isBeforeEnd = allocDate <= end;
        
        if (isAfterStart && isBeforeEnd) {
          // Add allocation info to booking
          booking.allocationDate = allocationDate;
          booking.allocationStatus = allocationStatus;
          filteredBookings.push(booking);
        }
      } else {
        // Fallback for bookings with no allocation history
        console.log(`⚠️ Booking ${booking.bookingNumber} has ALLOCATED status but no allocation history entry found`);
        
        // Use approvedAt or updatedAt as fallback
        const fallbackDate = booking.approvedAt || booking.updatedAt || booking.createdAt;
        if (fallbackDate) {
          const fallbackDateObj = new Date(fallbackDate);
          const isAfterStart = fallbackDateObj >= start;
          const isBeforeEnd = fallbackDateObj <= end;
          
          if (isAfterStart && isBeforeEnd) {
            booking.allocationDate = fallbackDate;
            booking.allocationStatus = 'ALLOCATED';
            filteredBookings.push(booking);
          }
        }
      }
    }

    console.log(`📊 After allocation date filtering, ${filteredBookings.length} subdealer records with ALLOCATED status in date range`);

    if (filteredBookings.length === 0) {
      if (format === 'excel') {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Subdealer Sales Report');
        const headers = getSubdealerSalesHeaders([]);
        worksheet.columns = headers.map((header, index) => ({
          header: header,
          key: `col_${index}`,
          width: getSubdealerColumnWidth(header)
        }));
        
        const fileName = `subdealer_sales_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        
        await workbook.xlsx.write(res);
        res.end();
        return;
      } else {
        return res.status(200).json({
          success: true,
          count: 0,
          data: [],
          availableSubdealers: availableSubdealers,
          userAccessInfo: {
            hasAllSubdealersAccess: hasAllSubdealersAccess,
            userBranch: user.branch ? {
              _id: user.branch._id,
              name: user.branch.name
            } : null,
            accessibleBranchesCount: user.accessibleBranches?.length || 0
          },
          filters: {
            startDate: start,
            endDate: end,
            subdealerId: subdealerId,
            status: 'ALLOCATED',
            bookingType: bookingType,
            customerType: customerType,
            modelType: modelType
          }
        });
      }
    }

    // ========== GET DYNAMIC PRICE HEADERS ==========
    // Extract all unique price headers from the filtered bookings
    const headerMap = new Map();
    
    filteredBookings.forEach(booking => {
      if (booking.priceComponents && booking.priceComponents.length > 0) {
        const sortedComponents = [...booking.priceComponents].sort((a, b) => {
          const priorityA = a.header?.priority || 999;
          const priorityB = b.header?.priority || 999;
          return priorityA - priorityB;
        });

        sortedComponents.forEach(pc => {
          if (pc.header && pc.header.header_key && !headerMap.has(pc.header.header_key)) {
            headerMap.set(pc.header.header_key, {
              header_key: pc.header.header_key,
              priority: pc.header.priority || 999,
              index: headerMap.size
            });
          }
        });
      }
    });

    const priceHeaders = Array.from(headerMap.values())
      .sort((a, b) => a.priority - b.priority);

    console.log(`Found ${priceHeaders.length} dynamic price headers for subdealer bookings`);

    // ========== GENERATE EXCEL REPORT ==========
    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      
      // Create worksheet name based on subdealer selection
      let worksheetName = 'Subdealer Sales Report';
      if (subdealerId && subdealerId !== 'all' && filteredBookings.length > 0) {
        const subdealer = filteredBookings[0]?.subdealer?.name;
        if (subdealer) {
          worksheetName = `${subdealer} Sales Report`;
        }
      } else if (hasAllSubdealersAccess && (!subdealerId || subdealerId === 'all')) {
        worksheetName = 'All Subdealers Sales Report';
      }
      
      const worksheet = workbook.addWorksheet(worksheetName.substring(0, 31), { // Excel sheet name max 31 chars
        properties: { defaultRowHeight: 20 },
        pageSetup: { paperSize: 9, orientation: 'landscape' }
      });

      // Get complete headers list
      const headers = getSubdealerSalesHeaders(priceHeaders);

      // Set worksheet columns with proper widths
      const columns = headers.map((header, index) => ({
        header: header,
        key: `col_${index}`,
        width: getSubdealerColumnWidth(header),
        style: {
          alignment: { vertical: 'middle', horizontal: getSubdealerAlignment(header) },
          font: { size: 10 }
        }
      }));

      worksheet.columns = columns;

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.height = 30;
      headerRow.eachCell((cell) => {
        cell.font = { 
          bold: true, 
          color: { argb: 'FFFFFFFF' },
          size: 11,
          name: 'Arial'
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2E75B5' }
        };
        cell.alignment = { 
          vertical: 'middle', 
          horizontal: 'center',
          wrapText: true
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Add data rows for each booking
      filteredBookings.forEach((booking) => {
        const rowData = {};
        let colIndex = 0;
        
        // Booking Number
        rowData[`col_${colIndex++}`] = booking.bookingNumber || '';
        
        // Booking Date
        rowData[`col_${colIndex++}`] = booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : '';
        
        // Allocation Date
        rowData[`col_${colIndex++}`] = booking.allocationDate ? moment(booking.allocationDate).format('DD/MM/YYYY') : '';
        
        // Subdealer Name
        rowData[`col_${colIndex++}`] = booking.subdealer?.name || '';
        
        // Subdealer Type (B2B/B2C)
        rowData[`col_${colIndex++}`] = booking.subdealer?.type || '';
        
        // Subdealer User
        rowData[`col_${colIndex++}`] = booking.subdealerUser?.name || '';
        
        // Parent Branch
        rowData[`col_${colIndex++}`] = booking.subdealer?.branch?.name || '';
        
        // Model
        rowData[`col_${colIndex++}`] = booking.model?.model_name || '';
        
        // Verticle
        let verticleNames = '';
        if (booking.verticleDetails && booking.verticleDetails.length > 0) {
          verticleNames = booking.verticleDetails
            .map(v => v.name || '')
            .filter(name => name !== '')
            .join(', ');
        }
        rowData[`col_${colIndex++}`] = verticleNames;
        
        // Model Type (EV/ICE)
        rowData[`col_${colIndex++}`] = booking.model?.type || '';
        
        // Color
        rowData[`col_${colIndex++}`] = booking.color?.name || '';
        
        // Chassis Number
        rowData[`col_${colIndex++}`] = booking.chassisNumber || (booking.vehicle?.chassisNumber || '');
        
        // Engine Number
        rowData[`col_${colIndex++}`] = booking.vehicle?.engineNumber || booking.engineNumber || '';
        
        // Customer Name
        rowData[`col_${colIndex++}`] = booking.customerDetails?.name || '';
        
        // Mobile1
        rowData[`col_${colIndex++}`] = booking.customerDetails?.mobile1 || '';
        
        // Mobile2
        rowData[`col_${colIndex++}`] = booking.customerDetails?.mobile2 || '';
        
        // Address
        rowData[`col_${colIndex++}`] = booking.customerDetails?.address || '';
        
        // Pincode
        rowData[`col_${colIndex++}`] = booking.customerDetails?.pincode || '';
        
        // Aadhar number
        rowData[`col_${colIndex++}`] = booking.customerDetails?.aadharNumber || '';
        
        // Pan no
        rowData[`col_${colIndex++}`] = booking.customerDetails?.panNo || '';
        
        // Birthday
        rowData[`col_${colIndex++}`] = booking.customerDetails?.dob ? moment(booking.customerDetails.dob).format('DD/MM/YYYY') : '';
        
        // Nominee Name
        rowData[`col_${colIndex++}`] = booking.customerDetails?.nomineeName || '';
        
        // Nominee Relation
        rowData[`col_${colIndex++}`] = booking.customerDetails?.nomineeRelation || '';
        
        // Nominee Age
        rowData[`col_${colIndex++}`] = booking.customerDetails?.nomineeAge || '';
        
        // Booking Type (CASH/FINANCE)
        rowData[`col_${colIndex++}`] = booking.payment?.type || '';
        
        // Financier Name
        let financierName = '';
        if (booking.payment?.type === 'FINANCE' && booking.payment?.financer) {
          financierName = booking.payment.financer.name || '';
        }
        rowData[`col_${colIndex++}`] = financierName;
        
        // Customer Type
        rowData[`col_${colIndex++}`] = booking.customerType || '';
        
        // GST NUMBER COLUMN REMOVED - no longer included

        // Create price component map for dynamic headers
        const priceComponentMap = new Map();
        if (booking.priceComponents && booking.priceComponents.length > 0) {
          booking.priceComponents.forEach(pc => {
            if (pc.header && pc.header.header_key) {
              priceComponentMap.set(pc.header.header_key, pc.discountedValue || 0);
            }
          });
        }

        // Add dynamic price headers
        priceHeaders.forEach(ph => {
          rowData[`col_${colIndex++}`] = priceComponentMap.get(ph.header_key) || 0;
        });

        // Subdealer Specific Fields
        rowData[`col_${colIndex++}`] = booking.subdealer?.rateOfInterest || '';
        rowData[`col_${colIndex++}`] = booking.subdealer?.creditPeriodDays || '';
        rowData[`col_${colIndex++}`] = booking.subdealer?.discount || '';
        
        // Calculate totals
        const totalAmount = booking.totalAmount || 0;
        const discountedAmount = booking.discountedAmount || 0;
        const totalDiscountGiven = totalAmount - discountedAmount;
        
        // ACCESSORIES REMOVED - no longer collecting or displaying accessories
        
        // Total Amount
        rowData[`col_${colIndex++}`] = totalAmount;
        
        // Total Discount Given
        rowData[`col_${colIndex++}`] = totalDiscountGiven;
        
        // Final Deal Amount
        rowData[`col_${colIndex++}`] = discountedAmount;
        
        // ACCESSORIES COLUMN REMOVED - no longer added to rowData

        worksheet.addRow(rowData);
      });

      // Style data rows
      for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        row.height = 20;
        
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const header = headers[colNumber - 1];
          
          // Set alignment based on content type
          if (header.includes('Amount') || header.includes('Price') || 
              header.includes('Discount') || header.includes('Charges') ||
              header.includes('Rate') || header.includes('Period') ||
              header === 'Total Amount' || header === 'Final Deal Amount') {
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
            if (typeof cell.value === 'number' && cell.value !== 0) {
              cell.numFmt = '#,##0.00';
            }
          } else if (header === 'Booking Number' || header === 'Chassis Number' || 
                    header === 'Engine Number' || header === 'Aadhar number' || 
                    header === 'Pan no' || header === 'Mobile1' || header === 'Mobile2' ||
                    header === 'Pincode' || header === 'Nominee Age') {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else {
            cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          }
          
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      }

      // Auto-filter for all columns
      if (worksheet.rowCount > 1) {
        const lastColLetter = String.fromCharCode(64 + worksheet.columnCount);
        worksheet.autoFilter = {
          from: 'A1',
          to: `${lastColLetter}${worksheet.rowCount}`
        };
      }

      // Freeze header row
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];

      // Set response headers for file download
      const fileName = `subdealer_sales_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
      // Write workbook to response
      await workbook.xlsx.write(res);
      res.end();

    } else {
      // ========== RETURN JSON FORMAT ==========
      const formattedBookings = filteredBookings.map(booking => {
        const totalAmount = booking.totalAmount || 0;
        const discountedAmount = booking.discountedAmount || 0;
        const totalDiscountGiven = totalAmount - discountedAmount;

        // Price components
        const priceComponentsObj = {};
        if (booking.priceComponents && booking.priceComponents.length > 0) {
          booking.priceComponents.forEach(pc => {
            if (pc.header && pc.header.header_key) {
              priceComponentsObj[pc.header.header_key] = pc.discountedValue || 0;
            }
          });
        }

        // ACCESSORIES REMOVED - no longer collecting accessories

        // Financier
        let financierName = '';
        if (booking.payment?.type === 'FINANCE' && booking.payment?.financer) {
          financierName = booking.payment.financer.name || '';
        }

        // Verticle
        let verticleNames = [];
        if (booking.verticleDetails && booking.verticleDetails.length > 0) {
          verticleNames = booking.verticleDetails.map(v => v.name || '');
        }

        return {
          bookingNumber: booking.bookingNumber,
          bookingDate: booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : '',
          allocationDate: booking.allocationDate ? moment(booking.allocationDate).format('DD/MM/YYYY') : '',
          subdealerName: booking.subdealer?.name,
          subdealerId: booking.subdealer?._id,
          subdealerType: booking.subdealer?.type,
          subdealerUser: booking.subdealerUser?.name,
          parentBranch: booking.subdealer?.branch?.name,
          model: booking.model?.model_name,
          verticle: verticleNames.join(', '),
          modelType: booking.model?.type,
          color: booking.color?.name,
          chassisNumber: booking.chassisNumber,
          engineNumber: booking.vehicle?.engineNumber || booking.engineNumber || '',
          customerName: booking.customerDetails?.name,
          mobile1: booking.customerDetails?.mobile1,
          mobile2: booking.customerDetails?.mobile2,
          address: booking.customerDetails?.address,
          pincode: booking.customerDetails?.pincode || '',
          aadharNumber: booking.customerDetails?.aadharNumber,
          panNo: booking.customerDetails?.panNo,
          birthday: booking.customerDetails?.dob ? moment(booking.customerDetails.dob).format('DD/MM/YYYY') : '',
          nomineeName: booking.customerDetails?.nomineeName,
          nomineeRelation: booking.customerDetails?.nomineeRelation,
          nomineeAge: booking.customerDetails?.nomineeAge,
          bookingType: booking.payment?.type,
          financierName: financierName,
          customerType: booking.customerType,
          // GST NUMBER REMOVED from JSON response
          priceComponents: priceComponentsObj,
          subdealerDetails: {
            rateOfInterest: booking.subdealer?.rateOfInterest,
            creditPeriodDays: booking.subdealer?.creditPeriodDays,
            discount: booking.subdealer?.discount
          },
          totalAmount: totalAmount,
          totalDiscountGiven: totalDiscountGiven,
          finalAmount: discountedAmount
          // ACCESSORIES REMOVED from JSON response
        };
      });

      // Calculate overall totals
      const overallTotals = formattedBookings.reduce((acc, booking) => {
        acc.totalAmount += booking.totalAmount || 0;
        acc.totalDiscount += booking.totalDiscountGiven || 0;
        acc.finalAmount += booking.finalAmount || 0;
        return acc;
      }, { totalAmount: 0, totalDiscount: 0, finalAmount: 0 });

      res.status(200).json({
        success: true,
        count: formattedBookings.length,
        totals: overallTotals,
        data: formattedBookings,
        priceHeaders: priceHeaders.map(ph => ph.header_key),
        availableSubdealers: availableSubdealers,
        userAccessInfo: {
          hasAllSubdealersAccess: hasAllSubdealersAccess,
          userBranch: user.branch ? {
            _id: user.branch._id,
            name: user.branch.name
          } : null,
          accessibleBranchesCount: user.accessibleBranches?.length || 0
        },
        filters: {
          startDate: start,
          endDate: end,
          subdealerId: subdealerId,
          status: 'ALLOCATED',
          bookingType: bookingType,
          customerType: customerType,
          modelType: modelType
        }
      });
    }

  } catch (error) {
    console.error('Error generating subdealer sales report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating subdealer sales report',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ========== HELPER FUNCTIONS FOR SUBDEALER REPORT ==========

/**
 * Get headers for subdealer sales report (EXCLUDING exchange, GST, and accessories columns)
 */
function getSubdealerSalesHeaders(priceHeaders = []) {
  const baseHeaders = [
    'Booking Number',
    'Booking Date',
    'Allocation Date',
    'Subdealer Name',
    'Subdealer Type',
    'Subdealer User',
    'Parent Branch',
    'Model',
    'Verticle',
    'Model Type',
    'Color',
    'Chassis Number',
    'Engine Number',
    'Customer Name',
    'Mobile1',
    'Mobile2',
    'Address',
    'Pincode',
    'Aadhar number',
    'Pan no',
    'Birthday',
    'Nominee Name',
    'Nominee Relation',
    'Nominee Age',
    'Booking Type',
    'Financier Name',
    'Customer Type'
    // GST NUMBER REMOVED - 'GST Number' is gone
    // EXCHANGE COLUMNS REMOVED - 'Exchange Vehicle', 'Exchange Vehicle Number', 
    // 'Exchange Chassis Number', 'Exchange Broker', 'Exchange Price' are gone
  ];

  // Add dynamic price headers
  const dynamicHeaders = priceHeaders.map(ph => ph.header_key);

  // Add subdealer specific headers and totals (Accessories removed)
  const subdealerSpecificHeaders = [
    'Rate of Interest (%)',
    'Credit Period (Days)',
    'Subdealer Discount (%)',
    'Total Amount',
    'Total Discount Given',
    'Final Deal Amount'
    // ACCESSORIES REMOVED - 'Accessories' column is gone
  ];

  return [...baseHeaders, ...dynamicHeaders, ...subdealerSpecificHeaders];
}

/**
 * Get column width based on header content for subdealer report
 */
function getSubdealerColumnWidth(header) {
  const widthMap = {
    'Booking Number': 18,
    'Booking Date': 15,
    'Allocation Date': 15,
    'Subdealer Name': 25,
    'Subdealer Type': 15,
    'Subdealer User': 20,
    'Parent Branch': 20,
    'Model': 20,
    'Verticle': 20,
    'Model Type': 12,
    'Color': 15,
    'Chassis Number': 20,
    'Engine Number': 20,
    'Customer Name': 25,
    'Mobile1': 15,
    'Mobile2': 15,
    'Address': 30,
    'Pincode': 10,
    'Aadhar number': 16,
    'Pan no': 12,
    'Birthday': 12,
    'Nominee Name': 20,
    'Nominee Relation': 15,
    'Nominee Age': 12,
    'Booking Type': 12,
    'Financier Name': 20,
    'Customer Type': 12,
    // GST NUMBER REMOVED from widthMap
    'Rate of Interest (%)': 15,
    'Credit Period (Days)': 15,
    'Subdealer Discount (%)': 18,
    'Total Amount': 15,
    'Total Discount Given': 18,
    'Final Deal Amount': 15
    // ACCESSORIES REMOVED from widthMap
  };

  // Default width for dynamic headers
  if (widthMap[header]) {
    return widthMap[header];
  } else if (header.includes('CHARGES') || header.includes('PRICE') || header.includes('AMOUNT')) {
    return 15; // Financial headers
  } else {
    return 20; // Default for dynamic headers
  }
}

/**
 * Get alignment based on header content for subdealer report
 */
function getSubdealerAlignment(header) {
  const rightAlignedHeaders = [
    'Amount', 'Price', 'Discount', 'Charges', 'Rate', 'Period',
    'Total Amount', 'Final Deal Amount'
  ];
  
  const centerAlignedHeaders = [
    'Booking Number', 'Chassis Number', 'Engine Number', 'Aadhar number',
    'Pan no', 'Mobile1', 'Mobile2', 'Pincode', 'Nominee Age'
  ];

  if (rightAlignedHeaders.some(h => header.includes(h))) {
    return 'right';
  } else if (centerAlignedHeaders.includes(header)) {
    return 'center';
  } else {
    return 'left';
  }
}
/**
 * Get sales headers with dynamic price headers
 */
function getSalesHeaders(priceHeaders) {
  const baseHeaders = [
    'Booking Number',
    'Booking Date',
    'Allocation Date',
    'Branch Name',
    'Sales Executive',
    'Model',
    'Verticle',
    'Model Type',
    'Color',
    'Chassis Number',
    'Engine Number',
    'Customer Name',
    'Mobile1',
    'Mobile2',
    'Address',
    'Pincode',
    'Aadhar number',
    'Pan no',
    'Birthday',
    'Nominee Name',
    'Nominee Relation',
    'Nominee Age',
    'Booking Type',
    'Financier Name',
    'Customer Type',
    'GST Number',
    'Exchange Vehicle',
    'Exchange Vehicle Number',
    'Exchange Chassis Number',
    'Exchange Broker',
    'Exchange Price'
  ];

  // Add dynamic price headers
  const priceHeaderKeys = priceHeaders.map(ph => ph.header_key);
  
  // Add totals
  const totalHeaders = [
    'Total Amount',
    'Total Discount Given',
    'Final Deal Amount',
    'Accessories'
  ];

  return [...baseHeaders, ...priceHeaderKeys, ...totalHeaders];
}

/**
 * Get column width based on header
 */
function getColumnWidth(header) {
  const widths = {
    'Booking Number': 18,
    'Booking Date': 12,
    'Allocation Date': 12,
    'Branch Name': 25,
    'Sales Executive': 25,
    'Model': 20,
    'Verticle': 20,
    'Model Type': 12,
    'Color': 15,
    'Chassis Number': 20,
    'Engine Number': 20,
    'Customer Name': 25,
    'Mobile1': 15,
    'Mobile2': 15,
    'Address': 40,
    'Pincode': 12,
    'Aadhar number': 20,
    'Pan no': 20,
    'Birthday': 12,
    'Nominee Name': 25,
    'Nominee Relation': 20,
    'Nominee Age': 15,
    'Booking Type': 15,
    'Financier Name': 25,
    'Customer Type': 15,
    'GST Number': 25,
    'Exchange Vehicle': 15,
    'Exchange Vehicle Number': 20,
    'Exchange Chassis Number': 20,
    'Exchange Broker': 25,
    'Exchange Price': 15,
    'Total Amount': 15,
    'Total Discount Given': 18,
    'Final Deal Amount': 18,
    'Accessories': 40
  };
  
  // For dynamic price headers, return standard width
  return widths[header] || 18;
}

/**
 * Get alignment based on header
 */
function getAlignment(header) {
  if (header.includes('Amount') || header.includes('Price') || 
      header.includes('Discount') || header.includes('Charges') ||
      header === 'Total Amount' || header === 'Final Deal Amount' ||
      header === 'Exchange Price') {
    return 'right';
  }
  if (header === 'Booking Number' || header === 'Chassis Number' || 
      header === 'Engine Number' || header === 'Aadhar number' || 
      header === 'Pan no' || header === 'Mobile1' || header === 'Mobile2' ||
      header === 'Pincode' || header === 'Nominee Age') {
    return 'center';
  }
  return 'left';
}

/**
 * Get sales headers with dynamic price headers
 */


/**
 * Generate booking report with filtering options - MATCHING SALES REPORT COLUMNS
 * @route GET /api/v1/reports/bookings
 * @access Private
 */
exports.generateBookingReport = async (req, res) => {
  try {
    const { 
      branchId, 
      startDate, 
      endDate, 
      status, 
      bookingType,
      customerType,
      modelType, // ADDED: Model type filter (EV/ICE)
      format = 'excel' 
    } = req.query;

    // Build filter conditions
    const filter = {};

    // Get user info from auth middleware
    const userId = req.user.id;
    
    // Fetch user with all necessary data (same as getMe)
    const user = await User.findById(userId)
      .select('-otp -otpExpires -emailOtp -emailOtpExpires -password')
      .populate({
        path: 'roles',
        select: 'name isSuperAdmin permissionsCount'
      })
      .populate('branch')
      .populate({
        path: 'accessibleBranches',
        model: 'Branch',
        select: '_id name address city state pincode phone email is_active logo1'
      })
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`🏢 User's branch: ${user.branch?.name || 'None'}`);
    console.log(`🔑 Branch Access Type: ${user.branchAccess || 'OWN'}`);
    console.log(`🏢 Accessible Branches: ${user.accessibleBranches?.length || 0}`);
    
    // Check user roles and permissions from user object
    const userRoles = user.roles || [];
    
    // Check if user is SUPERADMIN
    const isActualSuperAdmin = userRoles.some(role => 
      role.name === "SUPERADMIN"
    ) || false;
    
    // Check if user has superadmin flag
    const isSuperAdminFlag = userRoles.some(role => 
      role.isSuperAdmin === true
    ) || false;
    
    // Get branch access from user
    const branchAccess = user.branchAccess || 'OWN';
    
    // Check if user has all branches access
    let hasAllBranchesAccess = false;
    
    if (isActualSuperAdmin) {
      hasAllBranchesAccess = true;
      console.log('✅ User is SUPERADMIN - has access to all branches');
    } else if (branchAccess === 'ALL') {
      hasAllBranchesAccess = true;
      console.log('✅ User has ALL branch access permission');
    } else if (isSuperAdminFlag) {
      hasAllBranchesAccess = true;
      console.log('✅ User is ADMIN/GM - has access to all branches');
    } else {
      console.log('ℹ️ User has restricted branch access');
    }

    // ========== GET AVAILABLE BRANCHES FOR DROPDOWN ==========
    let availableBranches = [];
    
    if (hasAllBranchesAccess) {
      // User can see all active branches
      availableBranches = await Branch.find({ is_active: true })
        .select('_id name address city')
        .sort({ name: 1 })
        .lean();
      console.log(`✅ Fetched ${availableBranches.length} total branches for dropdown`);
    } else if (branchAccess === 'ASSIGNED' && user.accessibleBranches) {
      // User can see only assigned branches
      availableBranches = user.accessibleBranches.map(branch => ({
        _id: branch._id,
        name: branch.name,
        address: branch.address,
        city: branch.city
      })).sort((a, b) => a.name.localeCompare(b.name));
      console.log(`✅ Using ${availableBranches.length} assigned branches for dropdown`);
    } else if (user.branch) {
      // User can see only their own branch
      availableBranches = [{
        _id: user.branch._id,
        name: user.branch.name,
        address: user.branch.address,
        city: user.branch.city
      }];
      console.log('✅ Using only own branch for dropdown');
    }
    
    // Add "All" option for users with multiple branch access
    if (availableBranches.length > 1) {
      availableBranches.unshift({
        _id: 'all',
        name: 'All Branches',
        address: '',
        city: ''
      });
      console.log('✅ Added "All Branches" option to dropdown');
    }

    // ========== APPLY BRANCH FILTER ==========
    if (!hasAllBranchesAccess) {
      if (branchAccess === 'ASSIGNED' && user.accessibleBranches && user.accessibleBranches.length > 0) {
        // User has access to specific assigned branches
        const accessibleBranchIds = user.accessibleBranches.map(branch => branch._id);
        console.log(`User has access to ${accessibleBranchIds.length} assigned branches`);
        
        // If branchId is provided in query, check if it's in accessible branches
        if (branchId) {
          if (branchId === 'all') {
            // User selected "All" - show all accessible branches
            filter.branch = { $in: accessibleBranchIds };
            console.log('✅ Showing all accessible branches');
          } else {
            const requestedBranchId = new mongoose.Types.ObjectId(branchId);
            const hasAccess = accessibleBranchIds.some(branchId => 
              branchId.toString() === requestedBranchId.toString()
            );
            
            if (!hasAccess) {
              return res.status(403).json({
                success: false,
                message: 'You do not have access to this branch'
              });
            }
            filter.branch = requestedBranchId;
            console.log(`✅ Filtering by branch: ${branchId}`);
          }
        } else {
          // If no branchId specified, show all accessible branches
          filter.branch = { $in: accessibleBranchIds };
          console.log('✅ Showing all accessible branches (no branch filter)');
        }
      } else {
        // User has only OWN branch access
        console.log('User has only OWN branch access');
        if (user.branch && user.branch._id) {
          filter.branch = user.branch._id;
          console.log(`✅ Filtering by own branch: ${user.branch._id}`);
        } else {
          return res.status(403).json({
            success: false,
            message: 'You do not have access to any branch'
          });
        }
      }
    } else {
      // User has all branches permission
      if (branchId) {
        if (branchId === 'all') {
          // Show all branches (no filter)
          console.log('✅ Showing ALL branches (SUPERADMIN/ADMIN with "All" selected)');
        } else {
          filter.branch = new mongoose.Types.ObjectId(branchId);
          console.log(`✅ Filtering by branch: ${branchId}`);
        }
      } else {
        // If no branchId specified, show all branches
        console.log('✅ Showing ALL branches (no branch filter)');
      }
    }

    // ========== OTHER FILTERS ==========
    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    // Additional filters
    if (status) filter.status = status;
    if (bookingType) filter.bookingType = bookingType;
    if (customerType) filter.customerType = customerType;

    // ========== IMPORTANT: EXCLUDE ALLOCATED BOOKINGS ==========
    // Filter out bookings with chassisAllocationStatus = 'ALLOCATED'
    filter.chassisAllocationStatus = { $ne: 'ALLOCATED' };
    console.log('✅ Excluding allocated bookings (chassisAllocationStatus != ALLOCATED)');

    console.log('Generated filter:', JSON.stringify(filter, null, 2));
    
    // ========== FETCH BOOKINGS ==========
    // First, get the booking query
    const bookingsQuery = Booking.find(filter)
      .populate('model', 'model_name type') // Added 'type' field
      .populate('color', 'name')
      .populate('branch', 'name address city')
      .populate('salesExecutive', 'name email mobile')
      .populate('createdBy', 'name email')
      .populate('verticleDetails', 'name')
      .populate({
        path: 'priceComponents.header',
        select: 'header_key category_key priority'
      })
      .populate({
        path: 'ledgerEntries',
        select: 'amount paymentMode type date approvalStatus isDebit',
        match: { approvalStatus: 'Approved' }
      })
      .populate('financeDisbursements', 'disbursementReference disbursementAmount receivedAmount status disbursementDate')
      .populate('exchangeDetails.broker', 'name mobile')
      .populate('payment.financer', 'name')
      .populate({
        path: 'accessories.accessory',
        select: 'name code category description',
        model: 'Accessory'
      })
      .populate({
        path: 'vehicle',
        select: 'chassisNumber engineNumber batteryNumber keyNumber motorNumber chargerNumber',
        model: 'Vehicle'
      })
      .sort({ createdAt: -1 });

    // ========== APPLY MODEL TYPE FILTER IF PROVIDED ==========
    if (modelType) {
      console.log(`Applying model type filter: ${modelType}`);
      
      // Get all model IDs of the specified type
      const models = await mongoose.model('Model').find({ 
        type: modelType.toUpperCase() // Assuming 'EV' or 'ICE'
      }).select('_id').lean();
      
      const modelIds = models.map(model => model._id);
      
      if (modelIds.length > 0) {
        // Add model filter to the query
        bookingsQuery.where('model').in(modelIds);
        console.log(`Filtering by ${modelIds.length} ${modelType} models`);
      } else {
        // No models of this type found, return empty result
        console.log(`No ${modelType} models found`);
        if (format === 'excel') {
          // For Excel format, return empty workbook
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet('Booking Report');
          
          // Set response headers
          const fileName = `booking_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
          
          res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          );
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${fileName}"`
          );
          
          await workbook.xlsx.write(res);
          res.end();
          return;
        } else {
          // For JSON format
          return res.status(200).json({
            success: true,
            count: 0,
            totals: { 
              totalAmount: 0, 
              totalDiscount: 0, 
              finalAmount: 0
            },
            data: [],
            availableBranches: availableBranches,
            userAccessInfo: {
              hasAllBranchesAccess: hasAllBranchesAccess,
              branchAccess: branchAccess,
              accessibleBranchesCount: user.accessibleBranches?.length || 0,
              userBranch: user.branch ? {
                _id: user.branch._id,
                name: user.branch.name
              } : null
            },
            filters: {
              chassisAllocated: false,
              dateRange: filter.createdAt ? {
                start: filter.createdAt.$gte ? filter.createdAt.$gte.toISOString() : undefined,
                end: filter.createdAt.$lte ? filter.createdAt.$lte.toISOString() : undefined
              } : undefined,
              branchId: branchId,
              status: status,
              bookingType: bookingType,
              customerType: customerType,
              modelType: modelType // ADDED: Include modelType in response
            }
          });
        }
      }
    }
    
    // Execute the query
    const bookings = await bookingsQuery.lean();

    console.log(`Found ${bookings.length} bookings (excluding allocated)`);

    if (bookings.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No bookings found for the specified criteria',
        // Still return available branches for dropdown
        availableBranches: availableBranches,
        userAccessInfo: {
          hasAllBranchesAccess: hasAllBranchesAccess,
          branchAccess: branchAccess,
          accessibleBranchesCount: user.accessibleBranches?.length || 0
        }
      });
    }

    // ========== GENERATE EXCEL REPORT ==========
    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      
      // Create worksheet name
      let worksheetName = 'Booking Report';
      if (filter.branch && typeof filter.branch === 'object' && !filter.branch.$in) {
        const branch = bookings[0]?.branch;
        if (branch?.name) {
          worksheetName = `${branch.name} Booking Report`;
        }
      } else if (hasAllBranchesAccess && !branchId) {
        worksheetName = 'All Branches Booking Report';
      }
      
      const worksheet = workbook.addWorksheet(worksheetName);

      // Define headers - UPDATED:
      // 1. REMOVED: 'Chassis Number', 'Engine Number', 'Exchange Broker Mobile'
      // 2. ADDED: 'Pincode' after Address
      const headers = [
        'Booking Number',
        'Booking Date', // Will show only date (no time)
        'Branch Name',
        'Sales Executive',
        'Model',
        'Model Type', // Model type column
        'Color',
        // REMOVED: 'Chassis Number', 'Engine Number'
        'Customer Name',
        'Mobile1',
        'Mobile2',
        'Address',
        'Pincode', // ADDED: Customer Pincode
        'Aadhar number',
        'Pan no',
        'Birthday',
        'Nominee Name',
        'Nominee Relation',
        'Nominee Age',
        'Booking Type',
        'Financier Name',
        'Customer Type',
        'GST Number',
        // Exchange Details Headers - REMOVED 'Exchange Broker Mobile'
        'Exchange Vehicle',
        'Exchange Vehicle Number',
        'Exchange Chassis Number',
        'Exchange Broker',
        'Exchange Price' // REMOVED: 'Exchange Broker Mobile'
      ];

      // Get price component headers
      const headerMap = new Map();
      
      bookings.forEach(booking => {
        if (booking.priceComponents && booking.priceComponents.length > 0) {
          const sortedComponents = [...booking.priceComponents].sort((a, b) => {
            const priorityA = a.header?.priority || 999;
            const priorityB = b.header?.priority || 999;
            return priorityA - priorityB;
          });

          sortedComponents.forEach(pc => {
            if (pc.header && pc.header.header_key && !headerMap.has(pc.header.header_key)) {
              headerMap.set(pc.header.header_key, {
                header_key: pc.header.header_key,
                priority: pc.header.priority || 999,
                index: headerMap.size
              });
            }
          });
        }
      });

      const priceHeaders = Array.from(headerMap.values())
        .sort((a, b) => a.priority - b.priority);

      priceHeaders.forEach(header => {
        headers.push(header.header_key);
      });

      // Add the discount and amount headers
      headers.push('Total Amount');
      headers.push('Total Discount Given');
      headers.push('Final Deal Amount');
      headers.push('Accessories'); // SHOWING NAMES, NOT AMOUNT

      // Set worksheet columns - UPDATED for removed/added columns
      const columns = headers.map((header, index) => {
        let width = 20;
        
        if (header === 'Booking Number') width = 18;
        else if (header === 'Booking Date') width = 12; // Reduced width for date only
        else if (header === 'Branch Name') width = 25;
        else if (header === 'Sales Executive') width = 25;
        else if (header === 'Customer Name') width = 25;
        else if (header === 'Address') width = 40;
        else if (header === 'Pincode') width = 12; // ADDED: Pincode column width
        else if (header === 'Aadhar number') width = 20;
        else if (header === 'Pan no') width = 20;
        else if (header === 'Model') width = 20;
        else if (header === 'Model Type') width = 12;
        else if (header === 'Color') width = 15;
        else if (header === 'Mobile1' || header === 'Mobile2') width = 15;
        else if (header === 'Birthday') width = 12;
        else if (header === 'Customer Type') width = 15;
        else if (header === 'Booking Type') width = 15;
        else if (header === 'Financier Name') width = 25;
        else if (header === 'GST Number') width = 25;
        else if (header === 'Nominee Name') width = 25;
        else if (header === 'Nominee Relation') width = 20;
        else if (header === 'Nominee Age') width = 15;
        // Exchange details columns
        else if (header === 'Exchange Vehicle') width = 20;
        else if (header === 'Exchange Vehicle Number') width = 25;
        else if (header === 'Exchange Chassis Number') width = 25;
        else if (header === 'Exchange Broker') width = 25;
        else if (header === 'Exchange Price') width = 15;
        // Amount columns
        else if (header.includes('Amount') || header.includes('Discount') || header.includes('Price')) {
          width = 18;
        } else if (priceHeaders.some(ph => ph.header_key === header)) {
          width = 15;
        } else if (header === 'Accessories') {
          width = 40; // Wider column for accessory names
        }

        return {
          header: header,
          key: `col_${index}`,
          width: width,
          style: header.includes('Amount') || header.includes('Discount') || header.includes('Price') ? 
                 { numFmt: '#,##0.00' } : {}
        };
      });

      worksheet.columns = columns;

      // Add data rows - UPDATED column indices
      bookings.forEach((booking) => {
        const rowData = {};
        
        // Basic booking information
        rowData['col_0'] = booking.bookingNumber || '';
        
        // Booking Date - SHOW ONLY DATE (no time)
        rowData['col_1'] = booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : '';
        
        rowData['col_2'] = booking.branch?.name || '';
        rowData['col_3'] = booking.salesExecutive?.name || '';
        rowData['col_4'] = booking.model?.model_name || '';
        rowData['col_5'] = booking.model?.type || ''; // Model type
        rowData['col_6'] = booking.color?.name || '';
        
        // REMOVED: Chassis Number and Engine Number columns
        
        // Customer details - UPDATED indices
        rowData['col_7'] = booking.customerDetails?.name || '';
        rowData['col_8'] = booking.customerDetails?.mobile1 || '';
        rowData['col_9'] = booking.customerDetails?.mobile2 || '';
        rowData['col_10'] = booking.customerDetails?.address || '';
        
        // NEW: Pincode
        rowData['col_11'] = booking.customerDetails?.pincode || '';
        
        rowData['col_12'] = booking.customerDetails?.aadharNumber || '';
        rowData['col_13'] = booking.customerDetails?.panNo || '';
        
        // Birthday - SHOW ONLY DATE (no time)
        rowData['col_14'] = booking.customerDetails?.dob ? 
          moment(booking.customerDetails.dob).format('DD/MM/YYYY') : '';
        
        // Nominee details
        rowData['col_15'] = booking.customerDetails?.nomineeName || '';
        rowData['col_16'] = booking.customerDetails?.nomineeRelation || '';
        rowData['col_17'] = booking.customerDetails?.nomineeAge || '';
        
        // Booking Type and Financier
        rowData['col_18'] = booking.payment?.type || '';
        
        let financierName = '';
        if (booking.payment?.type === 'FINANCE' && booking.payment?.financer) {
          financierName = booking.payment.financer.name || '';
        }
        rowData['col_19'] = financierName;
        
        rowData['col_20'] = booking.customerType || '';
        
        // GST Number (only for B2B customers)
        rowData['col_21'] = (booking.customerType === 'B2B') ? (booking.gstin || '') : '';

        // Exchange Details - REMOVED 'Exchange Broker Mobile'
        rowData['col_22'] = booking.exchange ? 'YES' : 'NO'; // Exchange Vehicle
        rowData['col_23'] = booking.exchangeDetails?.vehicleNumber || '';
        rowData['col_24'] = booking.exchangeDetails?.chassisNumber || '';
        rowData['col_25'] = booking.exchangeDetails?.broker?.name || '';
        // Note: 'Exchange Broker Mobile' column has been removed
        rowData['col_26'] = booking.exchangeDetails?.price || 0;

        // Create price component map
        const priceComponentMap = new Map();
        if (booking.priceComponents && booking.priceComponents.length > 0) {
          const sortedComponents = [...booking.priceComponents].sort((a, b) => {
            const priorityA = a.header?.priority || 999;
            const priorityB = b.header?.priority || 999;
            return priorityA - priorityB;
          });

          sortedComponents.forEach(pc => {
            if (pc.header && pc.header.header_key) {
              priceComponentMap.set(pc.header.header_key, pc.discountedValue || 0);
            }
          });
        }

        // Add price component values (UPDATED column index due to removed/added columns)
        priceHeaders.forEach((header, priceIndex) => {
          const columnIndex = 27 + priceIndex; // Updated from 29 to 27 (removed 2 columns, added 1 column)
          rowData[`col_${columnIndex}`] = priceComponentMap.get(header.header_key) || 0;
        });

        // Calculate discount amounts
        const totalAmount = booking.totalAmount || 0;
        const discountedAmount = booking.discountedAmount || 0;
        const totalDiscountGiven = totalAmount - discountedAmount;
        
        // Get accessories names (comma-separated) instead of amount
        let accessoriesNames = '';
        if (Array.isArray(booking.accessories) && booking.accessories.length > 0) {
          const accessoryNamesArray = booking.accessories
            .map(acc => {
              if (acc.accessory && acc.accessory.name) {
                return acc.accessory.name;
              }
              return '';
            })
            .filter(name => name !== '');
          
          accessoriesNames = accessoryNamesArray.join(', ');
        }
        
        // Add discount and amount columns (UPDATED index due to removed/added columns)
        const discountStartIndex = 27 + priceHeaders.length; // Updated from 29 to 27
        rowData[`col_${discountStartIndex}`] = totalAmount;
        rowData[`col_${discountStartIndex + 1}`] = totalDiscountGiven;
        rowData[`col_${discountStartIndex + 2}`] = discountedAmount;
        rowData[`col_${discountStartIndex + 3}`] = accessoriesNames; // Showing names instead of amount

        worksheet.addRow(rowData);
      });

      // Style the header row
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { 
          bold: true, 
          color: { argb: 'FFFFFFFF' },
          size: 11
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2E75B5' }
        };
        cell.alignment = { 
          vertical: 'middle', 
          horizontal: 'center',
          wrapText: true
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      });

      // Format all rows
      for (let i = 1; i <= bookings.length; i++) {
        const row = worksheet.getRow(i + 1);
        
        headers.forEach((header, colIndex) => {
          if (header.includes('Amount') || header.includes('Discount') || 
              header.includes('Exchange Price') ||
              priceHeaders.some(ph => ph.header_key === header)) {
            const cell = row.getCell(colIndex + 1);
            if (typeof cell.value === 'number') {
              cell.numFmt = '#,##0.00';
              cell.alignment = { horizontal: 'right' };
            }
          }
        });
      }

      // Auto-filter for all columns
      if (worksheet.rowCount > 1) {
        const lastColLetter = String.fromCharCode(64 + worksheet.columnCount);
        worksheet.autoFilter = {
          from: 'A1',
          to: `${lastColLetter}${worksheet.rowCount}`
        };
      }

      // Freeze header row
      worksheet.views = [
        { state: 'frozen', ySplit: 1 }
      ];

      // Set response headers for file download
      const fileName = `booking_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
      
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`
      );

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } else {
      // ========== RETURN JSON FORMAT WITH DROPDOWN DATA ==========
      const formattedBookings = bookings.map(booking => {
        const totalAmount = booking.totalAmount || 0;
        const discountedAmount = booking.discountedAmount || 0;
        const totalDiscountGiven = totalAmount - discountedAmount;

        // Organize price components
        const priceComponentsObj = {};
        if (booking.priceComponents && booking.priceComponents.length > 0) {
          const sortedComponents = [...booking.priceComponents].sort((a, b) => {
            const priorityA = a.header?.priority || 999;
            const priorityB = b.header?.priority || 999;
            return priorityA - priorityB;
          });

          sortedComponents.forEach(pc => {
            if (pc.header && pc.header.header_key) {
              priceComponentsObj[pc.header.header_key] = pc.discountedValue || 0;
            }
          });
        }

        // Get accessories names for JSON
        let accessoriesNames = [];
        if (Array.isArray(booking.accessories) && booking.accessories.length > 0) {
          accessoriesNames = booking.accessories
            .map(acc => acc.accessory?.name || '')
            .filter(name => name !== '');
        }

        // Get financier name
        let financierName = '';
        if (booking.payment?.type === 'FINANCE' && booking.payment?.financer) {
          financierName = booking.payment.financer.name || '';
        }

        // Exchange details - REMOVED 'brokerMobile'
        const exchangeDetails = booking.exchange ? {
          hasExchange: true,
          vehicleNumber: booking.exchangeDetails?.vehicleNumber || '',
          chassisNumber: booking.exchangeDetails?.chassisNumber || '',
          brokerName: booking.exchangeDetails?.broker?.name || '',
          price: booking.exchangeDetails?.price || 0
        } : {
          hasExchange: false,
          vehicleNumber: '',
          chassisNumber: '',
          brokerName: '',
          price: 0
        };

        return {
          bookingNumber: booking.bookingNumber,
          bookingDate: booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : '', // DATE ONLY (no time)
          branchName: booking.branch?.name,
          branchId: booking.branch?._id,
          salesExecutive: booking.salesExecutive?.name,
          model: booking.model?.model_name,
          modelType: booking.model?.type,
          color: booking.color?.name,
          // REMOVED: chassisNumber, engineNumber
          customerName: booking.customerDetails?.name,
          mobile1: booking.customerDetails?.mobile1,
          mobile2: booking.customerDetails?.mobile2,
          address: booking.customerDetails?.address,
          pincode: booking.customerDetails?.pincode || '', // ADDED: Customer pincode
          adharNumber: booking.customerDetails?.aadharNumber,
          panNo: booking.customerDetails?.panNo,
          birthday: booking.customerDetails?.dob ? moment(booking.customerDetails.dob).format('DD/MM/YYYY') : '', // DATE ONLY
          nomineeName: booking.customerDetails?.nomineeName,
          nomineeRelation: booking.customerDetails?.nomineeRelation,
          nomineeAge: booking.customerDetails?.nomineeAge,
          bookingType: booking.payment?.type,
          financierName: financierName,
          customerType: booking.customerType,
          gstNumber: (booking.customerType === 'B2B') ? (booking.gstin || '') : '',
          exchangeDetails: exchangeDetails, // Without brokerMobile
          priceComponents: priceComponentsObj,
          totalAmount: totalAmount,
          totalDiscountGiven: totalDiscountGiven,
          finalAmount: discountedAmount,
          accessories: accessoriesNames
        };
      });

      // Calculate overall totals
      const overallTotals = formattedBookings.reduce((acc, booking) => {
        acc.totalAmount += booking.totalAmount || 0;
        acc.totalDiscount += booking.totalDiscountGiven || 0;
        acc.finalAmount += booking.finalAmount || 0;
        return acc;
      }, { 
        totalAmount: 0, 
        totalDiscount: 0, 
        finalAmount: 0
      });

      res.status(200).json({
        success: true,
        count: bookings.length,
        totals: overallTotals,
        data: formattedBookings,
        // ========== DROPDOWN DATA FOR FRONTEND ==========
        availableBranches: availableBranches,
        userAccessInfo: {
          hasAllBranchesAccess: hasAllBranchesAccess,
          branchAccess: branchAccess,
          accessibleBranchesCount: user.accessibleBranches?.length || 0,
          userBranch: user.branch ? {
            _id: user.branch._id,
            name: user.branch.name
          } : null
        },
        filters: {
          chassisAllocated: false, // This report excludes allocated bookings
          dateRange: filter.createdAt ? {
            start: filter.createdAt.$gte ? filter.createdAt.$gte.toISOString() : undefined,
            end: filter.createdAt.$lte ? filter.createdAt.$lte.toISOString() : undefined
          } : undefined,
          branchId: branchId,
          status: status,
          bookingType: bookingType,
          customerType: customerType,
          modelType: modelType // ADDED: Include modelType in filters response
        }
      });
    }

  } catch (error) {
    console.error('Error generating booking report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating booking report',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
/**
 * Generate quotation report with filtering - SINGLE ROW WITH ALL MODEL PRICES
 * @route GET /api/v1/reports/quotations
 * @access Private
 */
exports.generateQuotationReport = async (req, res) => {
    try {
      const { 
        branchId, 
        startDate, 
        endDate, 
        status, 
        createdBy,
        customerId,
        format = 'excel' 
      } = req.query;
  
      // Build filter conditions
      const filter = {};
  
      // Branch filter through userDetails.branch
      if (branchId) {
        filter['userDetails.branch._id'] = new mongoose.Types.ObjectId(branchId);
      }
  
      // Customer filter
      if (customerId) {
        filter.customer_id = new mongoose.Types.ObjectId(customerId);
      }
  
      // Date range filter
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          filter.createdAt.$gte = start;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = end;
        }
      }
  
      // Additional filters
      if (status) filter.status = status;
      if (createdBy) filter.createdBy = new mongoose.Types.ObjectId(createdBy);
  
      console.log('Quotation filter:', JSON.stringify(filter, null, 2));
  
      // Fetch quotations
      const quotations = await Quotation.find(filter)
        .populate('customer_id', 'name mobile1 mobile2 address taluka district panNo aadharNumber occupation')
        .populate('createdBy', 'name full_name username email mobile branch')
        .populate('base_model_id', 'model_name series type')
        .populate({
          path: 'models.model_id',
          select: 'model_name series type fuel_type engine_cc color_options'
        })
        .sort({ createdAt: -1 })
        .lean();
  
      console.log(`Found ${quotations.length} quotations`);
  
      if (quotations.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No quotations found for the specified criteria',
          filter: filter
        });
      }
  
      // Generate Excel report
      if (format === 'excel') {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Quotation Report');
  
        // Helper function to get sales person name
        const getSalesPersonName = (quotation) => {
          if (quotation.userDetails?.full_name) {
            return quotation.userDetails.full_name;
          }
          if (quotation.createdBy?.name) {
            return quotation.createdBy.name;
          }
          if (quotation.userDetails?.username) {
            return quotation.userDetails.username;
          }
          if (quotation.createdBy?.full_name) {
            return quotation.createdBy.full_name;
          }
          return '';
        };
  
        // Define columns EXACTLY as requested
        const columns = [
          { header: 'S.No', key: 'sno', width: 8 },
          { header: 'Quotation No', key: 'quotationNumber', width: 25 },
          { header: 'Date', key: 'date', width: 15 },
          { header: 'Branch', key: 'branch', width: 25 },
          { header: 'Sales Person', key: 'salesPerson', width: 25 },
          { header: 'Customer Name', key: 'customerName', width: 25 },
          { header: 'Mobile 1', key: 'mobile1', width: 15 },
          { header: 'Mobile 2', key: 'mobile2', width: 15 },
          { header: 'Address', key: 'address', width: 40 },
          { header: 'Taluka', key: 'taluka', width: 15 },
          { header: 'District', key: 'district', width: 15 },
          { header: 'Finance Needed', key: 'financeNeeded', width: 15 },
          { header: 'Status sent on WhatsApp', key: 'status', width: 15 },
          { header: 'Expected Delivery Date', key: 'expectedDelivery', width: 20 },
          { header: 'Selected Model 1 Name', key: 'selectedModel1Name', width: 30 },
          { header: 'Selected Model 2 Name', key: 'selectedModel2Name', width: 30 },
          { header: 'Base Model Name', key: 'baseModelName', width: 30 }
        ];
  
        worksheet.columns = columns;
  
        // Add data rows - ONE ROW PER QUOTATION
        quotations.forEach((quotation, index) => {
          // Get base model name
          let baseModelName = '';
          
          // First try: check base_model_name field
          if (quotation.base_model_name) {
            baseModelName = quotation.base_model_name;
          }
          // Second try: check populated base_model_id
          else if (quotation.base_model_id?.model_name) {
            baseModelName = quotation.base_model_id.model_name;
          }
          // Third try: find base model from models array
          else {
            const baseModel = quotation.models?.find(model => model.is_base_model);
            baseModelName = baseModel?.model_name || '';
          }
  
          // Get selected model names
          let selectedModel1Name = '';
          let selectedModel2Name = '';
          
          if (quotation.models && quotation.models.length > 0) {
            // Get first model
            if (quotation.models[0]) {
              selectedModel1Name = quotation.models[0].model_name || '';
            }
            // Get second model if exists
            if (quotation.models[1]) {
              selectedModel2Name = quotation.models[1].model_name || '';
            }
          }
  
          // Get sales person name using helper function
          const salesPersonName = getSalesPersonName(quotation);
          
          // Format the row data EXACTLY as requested
          const rowData = {
            sno: index + 1,
            quotationNumber: quotation.quotation_number || '',
            date: quotation.date ? moment(quotation.date).format('DD/MM/YYYY') : '',
            branch: quotation.userDetails?.branch?.name || '',
            salesPerson: salesPersonName,
            customerName: quotation.customerDetails?.name || '',
            mobile1: quotation.customerDetails?.mobile1 || '',
            mobile2: quotation.customerDetails?.mobile2 || '',
            address: quotation.customerDetails?.address || '',
            taluka: quotation.customerDetails?.taluka || '',
            district: quotation.customerDetails?.district || '',
            financeNeeded: quotation.finance_needed ? 'Yes' : 'No',
            status: quotation.status ? quotation.status.toUpperCase() : '',
            expectedDelivery: quotation.expected_delivery_date ? 
              moment(quotation.expected_delivery_date).format('DD/MM/YYYY') : '',
            selectedModel1Name: selectedModel1Name,
            selectedModel2Name: selectedModel2Name,
            baseModelName: baseModelName
          };
  
          worksheet.addRow(rowData);
        });
  
        // Style header row
        worksheet.getRow(1).eachCell((cell) => {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F81BD' }
          };
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
  
        // Style data rows
        for (let i = 2; i <= worksheet.rowCount; i++) {
          const row = worksheet.getRow(i);
          row.eachCell((cell) => {
            cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
          });
        }
  
        // Auto-fit columns
        worksheet.columns.forEach(column => {
          const maxWidth = 40;
          column.width = column.width ? Math.min(column.width, maxWidth) : 15;
        });
  
        // Add auto-filter
        if (worksheet.rowCount > 1) {
          worksheet.autoFilter = {
            from: 'A1',
            to: `Q${worksheet.rowCount}`
          };
        }
  
        // Freeze header row
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  
        // Set response headers
        const fileName = `quotation_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
        
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${fileName}"`
        );
  
        await workbook.xlsx.write(res);
        res.end();
  
      } else {
        // Return JSON format
        const formattedQuotations = quotations.map(quotation => {
          // Helper function for JSON too
          const getSalesPersonName = (q) => {
            if (q.userDetails?.full_name) return q.userDetails.full_name;
            if (q.createdBy?.name) return q.createdBy.name;
            if (q.userDetails?.username) return q.userDetails.username;
            if (q.createdBy?.full_name) return q.createdBy.full_name;
            return '';
          };
  
          // Get base model name
          let baseModelName = '';
          if (quotation.base_model_name) {
            baseModelName = quotation.base_model_name;
          } else if (quotation.base_model_id?.model_name) {
            baseModelName = quotation.base_model_id.model_name;
          } else {
            const baseModel = quotation.models?.find(model => model.is_base_model);
            baseModelName = baseModel?.model_name || '';
          }
  
          // Get selected model names
          let selectedModel1Name = '';
          let selectedModel2Name = '';
          
          if (quotation.models && quotation.models.length > 0) {
            if (quotation.models[0]) {
              selectedModel1Name = quotation.models[0].model_name || '';
            }
            if (quotation.models[1]) {
              selectedModel2Name = quotation.models[1].model_name || '';
            }
          }
  
          return {
            sno: index + 1,
            quotation_number: quotation.quotation_number,
            date: quotation.date,
            expected_delivery_date: quotation.expected_delivery_date,
            branch: quotation.userDetails?.branch?.name,
            sales_person: getSalesPersonName(quotation),
            customer_details: {
              name: quotation.customerDetails?.name,
              mobile1: quotation.customerDetails?.mobile1,
              mobile2: quotation.customerDetails?.mobile2,
              address: quotation.customerDetails?.address,
              taluka: quotation.customerDetails?.taluka,
              district: quotation.customerDetails?.district
            },
            finance_needed: quotation.finance_needed,
            status: quotation.status,
            selected_model_1_name: selectedModel1Name,
            selected_model_2_name: selectedModel2Name,
            base_model_name: baseModelName
          };
        });
  
        res.status(200).json({
          success: true,
          count: quotations.length,
          data: formattedQuotations,
          metadata: {
            total_quotations: quotations.length,
            date_range: filter.createdAt ? {
              start: filter.createdAt.$gte ? filter.createdAt.$gte.toISOString() : undefined,
              end: filter.createdAt.$lte ? filter.createdAt.$lte.toISOString() : undefined
            } : undefined
          }
        });
      }
  
    } catch (error) {
      console.error('Error generating quotation report:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating quotation report',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  };
/**
 * Generate insurance pending report with dynamic headers
 * @route GET /api/v1/reports/insurance/pending
 * @access Private
 */
/**
 * Generate Insurance Pending Report - Shows bookings with AWAITING, PENDING, NOT_STARTED, and LATER insurance status
 * Clean professional format without colors or price columns
 * @route GET /api/v1/reports/insurance/pending
 * @access Private
 */
/**
 * Generate Insurance Pending Report - Shows bookings with AWAITING, PENDING, NOT_STARTED, and LATER insurance status
 * Clean professional format without colors or price columns
 * @route GET /api/v1/reports/insurance/pending
 * @access Private
 */
exports.generateInsurancePendingReport = async (req, res) => {
  try {
    const { 
      branchId, 
      startDate, 
      endDate, 
      bookingType,
      customerType,
      modelId,
      format = 'excel' 
    } = req.query;

    // ========== BRANCH ACCESS LOGIC ==========
    const userId = req.user.id;
    
    const user = await User.findById(userId)
      .select('-otp -otpExpires -emailOtp -emailOtpExpires -password')
      .populate({
        path: 'roles',
        select: 'name isSuperAdmin permissionsCount'
      })
      .populate('branch')
      .populate({
        path: 'accessibleBranches',
        model: 'Branch',
        select: '_id name'
      })
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userRoles = user.roles || [];
    const isActualSuperAdmin = userRoles.some(role => role.name === "SUPERADMIN") || false;
    const isSuperAdminFlag = userRoles.some(role => role.isSuperAdmin === true) || false;
    const branchAccess = user.branchAccess || 'OWN';
    
    let hasAllBranchesAccess = false;
    
    if (isActualSuperAdmin || branchAccess === 'ALL' || isSuperAdminFlag) {
      hasAllBranchesAccess = true;
    }

    // ========== GET AVAILABLE BRANCHES FOR DROPDOWN ==========
    let availableBranches = [];
    
    if (hasAllBranchesAccess) {
      availableBranches = await Branch.find({ is_active: true })
        .select('_id name')
        .sort({ name: 1 })
        .lean();
    } else if (branchAccess === 'ASSIGNED' && user.accessibleBranches?.length) {
      availableBranches = user.accessibleBranches.map(b => ({
        _id: b._id,
        name: b.name
      })).sort((a, b) => a.name.localeCompare(b.name));
    } else if (user.branch) {
      availableBranches = [{
        _id: user.branch._id,
        name: user.branch.name
      }];
    }

    // Add "All" option for users with multiple branch access
    if (availableBranches.length > 1) {
      availableBranches.unshift({
        _id: 'all',
        name: 'All Branches'
      });
    }

    // ========== BUILD BOOKING FILTER ==========
    // Show ALL pending insurance statuses including LATER
    const bookingFilter = {
      insuranceStatus: { $in: ['AWAITING', 'PENDING', 'NOT_STARTED', 'LATER'] }
    };

    // Branch filter with access control
    if (!hasAllBranchesAccess) {
      let allowedBranchIds = [];

      if (branchAccess === 'ASSIGNED' && user.accessibleBranches?.length) {
        allowedBranchIds = user.accessibleBranches.map(b => b._id);

        if (branchId && branchId !== 'all') {
          const requestedId = new mongoose.Types.ObjectId(branchId);
          const hasAccess = allowedBranchIds.some(id => id.toString() === requestedId.toString());
          if (!hasAccess) {
            return res.status(403).json({
              success: false,
              message: 'You do not have access to this branch'
            });
          }
          allowedBranchIds = [requestedId];
        }
      } else if (user.branch?._id) {
        allowedBranchIds = [user.branch._id];
        
        if (branchId && branchId !== 'all' && branchId !== user.branch._id.toString()) {
          return res.status(403).json({
            success: false,
            message: 'You do not have access to this branch'
          });
        }
      }

      if (allowedBranchIds.length > 0) {
        bookingFilter.branch = { $in: allowedBranchIds };
      }
    } else if (branchId && branchId !== 'all') {
      bookingFilter.branch = new mongoose.Types.ObjectId(branchId);
    }

    // Date range filter
    if (startDate || endDate) {
      bookingFilter.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        bookingFilter.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        bookingFilter.createdAt.$lte = end;
      }
    }

    // Additional filters
    if (bookingType) bookingFilter.bookingType = bookingType;
    if (customerType) bookingFilter.customerType = customerType;
    if (modelId) bookingFilter.model = new mongoose.Types.ObjectId(modelId);

    console.log('Insurance Pending Filter:', JSON.stringify(bookingFilter, null, 2));

    // ========== FETCH BOOKINGS WITH PENDING INSURANCE ==========
    const bookings = await Booking.find(bookingFilter)
      .populate({
        path: 'model',
        select: 'model_name type'
      })
      .populate({
        path: 'color',
        select: 'name'
      })
      .populate({
        path: 'branch',
        select: 'name'
      })
      .populate({
        path: 'salesExecutive',
        select: 'name'
      })
      .populate({
        path: 'createdBy',
        select: 'name'
      })
      .populate({
        path: 'vehicle',
        select: 'chassisNumber engineNumber'
      })
      .populate({
        path: 'payment.financer',
        select: 'name'
      })
      .sort({ createdAt: -1 })
      .lean();

    console.log(`Found ${bookings.length} bookings with pending insurance`);

    if (bookings.length === 0) {
      if (format === 'excel') {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Insurance Pending Report');
        
        const headers = getInsuranceHeaders();
        worksheet.columns = headers.map((header, index) => ({
          header: header,
          key: `col_${index}`,
          width: getInsuranceColumnWidth(header)
        }));
        
        const fileName = `insurance_pending_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        
        await workbook.xlsx.write(res);
        res.end();
        return;
      } else {
        return res.status(200).json({
          success: true,
          count: 0,
          data: [],
          availableBranches: availableBranches,
          userAccessInfo: {
            hasAllBranchesAccess: hasAllBranchesAccess,
            branchAccess: branchAccess,
            accessibleBranchesCount: user.accessibleBranches?.length || 0
          },
          filters: {
            branchId: branchId,
            insuranceStatus: ['AWAITING', 'PENDING', 'NOT_STARTED', 'LATER'],
            bookingType: bookingType,
            customerType: customerType,
            modelId: modelId,
            startDate: startDate,
            endDate: endDate
          }
        });
      }
    }

    // ========== GENERATE EXCEL REPORT ==========
    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      
      let worksheetName = 'Insurance Pending Report';
      if (branchId && branchId !== 'all' && bookings.length > 0) {
        worksheetName = `${bookings[0]?.branch?.name || ''} Insurance Pending`.trim();
      } else if (hasAllBranchesAccess && (!branchId || branchId === 'all')) {
        worksheetName = 'All Branches Insurance Pending';
      }
      
      const worksheet = workbook.addWorksheet(worksheetName.substring(0, 31), {
        properties: { defaultRowHeight: 20 },
        pageSetup: { paperSize: 9, orientation: 'landscape' }
      });

      // Get headers - NO PRICE COMPONENTS
      const headers = getInsuranceHeaders();

      // Set worksheet columns with proper widths
      worksheet.columns = headers.map((header, index) => ({
        header: header,
        key: `col_${index}`,
        width: getInsuranceColumnWidth(header)
      }));

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.height = 30;
      headerRow.eachCell((cell) => {
        cell.font = { 
          bold: true, 
          color: { argb: 'FFFFFFFF' },
          size: 11,
          name: 'Arial'
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2E75B5' }
        };
        cell.alignment = { 
          vertical: 'middle', 
          horizontal: 'center',
          wrapText: true
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Add data rows
      bookings.forEach((booking, index) => {
        // Format address
        const fullAddress = [
          booking.customerDetails?.address || '',
          booking.customerDetails?.taluka || '',
          booking.customerDetails?.district || '',
          booking.customerDetails?.pincode || ''
        ].filter(Boolean).join(', ');

        // Get financier name
        let financierName = '';
        if (booking.payment?.type === 'FINANCE' && booking.payment?.financer) {
          financierName = typeof booking.payment.financer === 'object' 
            ? booking.payment.financer.name || '' 
            : booking.payment.financer.toString();
        }

        // Prepare row data - WITH NOMINEE AGE FROM DATABASE
        const rowData = {
          col_0: index + 1,
          col_1: booking.bookingNumber || '',
          col_2: booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : '',
          col_3: booking.branch?.name || '',
          col_4: `${booking.customerDetails?.salutation || ''} ${booking.customerDetails?.name || ''}`.trim(),
          col_5: booking.customerDetails?.custId || '',
          col_6: fullAddress,
          col_7: booking.customerDetails?.mobile1 || '',
          col_8: booking.customerDetails?.mobile2 || '',
          col_9: booking.customerDetails?.panNo || '',
          col_10: booking.customerDetails?.aadharNumber || '',
          col_11: booking.customerDetails?.occupation || '',
          col_12: booking.customerDetails?.dob ? moment(booking.customerDetails.dob).format('DD/MM/YYYY') : '',
          col_13: booking.customerDetails?.nomineeAge || '', // ✅ NOMINEE AGE FROM DATABASE
          col_14: booking.customerDetails?.nomineeName || '',
          col_15: booking.customerDetails?.nomineeRelation || '',
          col_16: booking.model?.model_name || '',
          col_17: booking.model?.type || '',
          col_18: booking.color?.name || '',
          col_19: booking.chassisNumber || booking.vehicle?.chassisNumber || '',
          col_20: booking.vehicle?.engineNumber || booking.engineNumber || '',
          col_21: booking.insuranceStatus || '',
          col_22: booking.payment?.type || '',
          col_23: financierName,
          col_24: booking.hpa ? 'Yes' : 'No',
          col_25: booking.rtoStatus || '',
          col_26: booking.rtoAmount || 0,
          col_27: booking.kycStatus || '',
          col_28: booking.financeLetterStatus || '',
          col_29: booking.dealFormStatus || '',
          col_30: booking.deliveryChallanStatus || '',
          col_31: booking.salesExecutive?.name || '',
          col_32: booking.createdBy?.name || '',
          col_33: booking.totalAmount || 0,
          col_34: booking.receivedAmount || 0,
          col_35: booking.balanceAmount || 0,
          col_36: booking.status || ''
        };

        const row = worksheet.addRow(rowData);
        row.height = 20;

        // Style the row - NO COLORS
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const header = headers[colNumber - 1];
          
          // Set alignment based on content type
          if (header.includes('Amount') || header.includes('Total') || header.includes('Balance')) {
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
            if (typeof cell.value === 'number' && cell.value !== 0) {
              cell.numFmt = '#,##0.00';
            }
          } else if (header === 'Sr. No' || header === 'Age' || header === 'Pincode' || 
                    header.includes('Mobile') || header.includes('RTO Status')) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else {
            cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          }
          
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });

      // Auto-filter for all columns
      if (worksheet.rowCount > 1) {
        const lastColLetter = String.fromCharCode(64 + worksheet.columnCount);
        worksheet.autoFilter = {
          from: 'A1',
          to: `${lastColLetter}${worksheet.rowCount}`
        };
      }

      // Freeze header row
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];

      // --- SUMMARY SECTION ---
      const summaryStartRow = worksheet.rowCount + 3;
      
      // SUMMARY title
      worksheet.mergeCells(`A${summaryStartRow}:E${summaryStartRow}`);
      const summaryTitleCell = worksheet.getCell(`A${summaryStartRow}`);
      summaryTitleCell.value = 'INSURANCE PENDING SUMMARY';
      summaryTitleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
      summaryTitleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2E75B5' }
      };
      summaryTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      summaryTitleCell.border = {
        top: { style: 'medium' },
        left: { style: 'medium' },
        bottom: { style: 'medium' },
        right: { style: 'medium' }
      };

      // Calculate summary statistics
      const awaitingCount = bookings.filter(b => b.insuranceStatus === 'AWAITING').length;
      const pendingCount = bookings.filter(b => b.insuranceStatus === 'PENDING').length;
      const notStartedCount = bookings.filter(b => b.insuranceStatus === 'NOT_STARTED').length;
      const laterCount = bookings.filter(b => b.insuranceStatus === 'LATER').length;
      
      const totalBalance = bookings.reduce((sum, b) => sum + (b.balanceAmount || 0), 0);
      const totalReceived = bookings.reduce((sum, b) => sum + (b.receivedAmount || 0), 0);

      // Summary data
      const summaryData = [
        ['Total Bookings:', bookings.length],
        ['AWAITING:', awaitingCount],
        ['PENDING:', pendingCount],
        ['NOT_STARTED:', notStartedCount],
        ['LATER:', laterCount],
        ['Total Balance Amount:', `₹${totalBalance.toFixed(2)}`],
        ['Total Received Amount:', `₹${totalReceived.toFixed(2)}`]
      ];

      // Add summary data rows
      summaryData.forEach(([label, value], index) => {
        const rowNum = summaryStartRow + 2 + index;
        
        worksheet.getCell(`A${rowNum}`).value = label;
        worksheet.getCell(`A${rowNum}`).font = { bold: true };
        worksheet.getCell(`A${rowNum}`).alignment = { horizontal: 'right', vertical: 'middle' };
        worksheet.getCell(`A${rowNum}`).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        
        worksheet.getCell(`B${rowNum}`).value = value;
        worksheet.getCell(`B${rowNum}`).font = { bold: true };
        worksheet.getCell(`B${rowNum}`).alignment = { horizontal: 'left', vertical: 'middle' };
        worksheet.getCell(`B${rowNum}`).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Add footer
      const footerRow = summaryStartRow + summaryData.length + 4;
      worksheet.mergeCells(`A${footerRow}:E${footerRow}`);
      const footerCell = worksheet.getCell(`A${footerRow}`);
      footerCell.value = `Report generated on ${moment().format('DD MMM YYYY HH:mm:ss')} | Showing AWAITING, PENDING, NOT_STARTED, and LATER insurance status`;
      footerCell.font = { italic: true, size: 10, color: { argb: 'FF666666' } };
      footerCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Set response headers
      const fileName = `insurance_pending_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
      await workbook.xlsx.write(res);
      res.end();

    } else {
      // ========== RETURN JSON FORMAT ==========
      const formattedBookings = bookings.map((booking, index) => {
        // Get financier name
        let financierName = '';
        if (booking.payment?.type === 'FINANCE' && booking.payment?.financer) {
          financierName = typeof booking.payment.financer === 'object' 
            ? booking.payment.financer.name || '' 
            : booking.payment.financer.toString();
        }

        return {
          srNo: index + 1,
          bookingNumber: booking.bookingNumber,
          bookingDate: booking.createdAt,
          formattedBookingDate: booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : '',
          branchName: booking.branch?.name || '',
          customerInfo: {
            fullName: `${booking.customerDetails?.salutation || ''} ${booking.customerDetails?.name || ''}`.trim(),
            customerId: booking.customerDetails?.custId || '',
            address: booking.customerDetails?.address || '',
            taluka: booking.customerDetails?.taluka || '',
            district: booking.customerDetails?.district || '',
            pincode: booking.customerDetails?.pincode || '',
            mobile1: booking.customerDetails?.mobile1 || '',
            mobile2: booking.customerDetails?.mobile2 || '',
            panNo: booking.customerDetails?.panNo || '',
            aadharNumber: booking.customerDetails?.aadharNumber || '',
            occupation: booking.customerDetails?.occupation || '',
            dob: booking.customerDetails?.dob ? moment(booking.customerDetails.dob).format('DD/MM/YYYY') : '',
            nomineeAge: booking.customerDetails?.nomineeAge || '', // ✅ NOMINEE AGE FROM DATABASE
            nomineeName: booking.customerDetails?.nomineeName || '',
            nomineeRelation: booking.customerDetails?.nomineeRelation || ''
          },
          vehicleInfo: {
            model: booking.model?.model_name || '',
            modelType: booking.model?.type || '',
            color: booking.color?.name || '',
            chassisNumber: booking.chassisNumber || booking.vehicle?.chassisNumber || '',
            engineNumber: booking.vehicle?.engineNumber || booking.engineNumber || ''
          },
          insuranceStatus: booking.insuranceStatus,
          paymentInfo: {
            type: booking.payment?.type || '',
            financier: financierName,
            hpa: booking.hpa || false
          },
          statusInfo: {
            rtoStatus: booking.rtoStatus || '',
            rtoAmount: booking.rtoAmount || 0,
            kycStatus: booking.kycStatus || '',
            financeLetterStatus: booking.financeLetterStatus || '',
            dealFormStatus: booking.dealFormStatus || '',
            deliveryChallanStatus: booking.deliveryChallanStatus || '',
            bookingStatus: booking.status || ''
          },
          financialInfo: {
            totalAmount: booking.totalAmount || 0,
            receivedAmount: booking.receivedAmount || 0,
            balanceAmount: booking.balanceAmount || 0
          },
          salesInfo: {
            salesExecutive: booking.salesExecutive?.name || '',
            bookingType: booking.bookingType || '',
            customerType: booking.customerType || '',
            createdBy: booking.createdBy?.name || ''
          }
        };
      });

      // Calculate summary statistics
      const summary = {
        totalBookings: bookings.length,
        awaitingCount: bookings.filter(b => b.insuranceStatus === 'AWAITING').length,
        pendingCount: bookings.filter(b => b.insuranceStatus === 'PENDING').length,
        notStartedCount: bookings.filter(b => b.insuranceStatus === 'NOT_STARTED').length,
        laterCount: bookings.filter(b => b.insuranceStatus === 'LATER').length,
        totalBalanceAmount: bookings.reduce((sum, b) => sum + (b.balanceAmount || 0), 0),
        totalReceivedAmount: bookings.reduce((sum, b) => sum + (b.receivedAmount || 0), 0),
        branchWiseBreakdown: bookings.reduce((acc, booking) => {
          const branch = booking.branch?.name || 'Unknown';
          if (!acc[branch]) {
            acc[branch] = { 
              total: 0, 
              awaiting: 0, 
              pending: 0, 
              notStarted: 0, 
              later: 0 
            };
          }
          acc[branch].total++;
          if (booking.insuranceStatus === 'AWAITING') acc[branch].awaiting++;
          else if (booking.insuranceStatus === 'PENDING') acc[branch].pending++;
          else if (booking.insuranceStatus === 'NOT_STARTED') acc[branch].notStarted++;
          else if (booking.insuranceStatus === 'LATER') acc[branch].later++;
          return acc;
        }, {})
      };

      res.status(200).json({
        success: true,
        count: bookings.length,
        summary: summary,
        data: formattedBookings,
        availableBranches: availableBranches,
        userAccessInfo: {
          hasAllBranchesAccess: hasAllBranchesAccess,
          branchAccess: branchAccess,
          accessibleBranchesCount: user.accessibleBranches?.length || 0,
          userBranch: user.branch ? {
            _id: user.branch._id,
            name: user.branch.name
          } : null
        },
        filters: {
          branchId: branchId,
          insuranceStatus: ['AWAITING', 'PENDING', 'NOT_STARTED', 'LATER'],
          bookingType: bookingType,
          customerType: customerType,
          modelId: modelId,
          startDate: startDate,
          endDate: endDate
        },
        generatedAt: new Date()
      });
    }

  } catch (error) {
    console.error('Error generating insurance pending report:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating insurance pending report',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Helper function to get insurance report headers
 */
function getInsuranceHeaders() {
  return [
    'Sr. No',
    'Booking Number',
    'Booking Date',
    'Branch Name',
    'Customer Name',
    'Customer ID',
    'Address',
    'Mobile 1',
    'Mobile 2',
    'PAN',
    'Aadhar',
    'Occupation',
    'Date of Birth',
    'Nominee Age', // ✅ Changed from 'Age' to 'Nominee Age'
    'Nominee Name',
    'Nominee Relation',
    'Model',
    'Model Type',
    'Color',
    'Chassis Number',
    'Engine Number',
    'Insurance Status',
    'Payment Type',
    'Financier Name',
    'HPA',
    'RTO Status',
    'RTO Amount',
    'KYC Status',
    'Finance Letter Status',
    'Deal Form Status',
    'Delivery Challan Status',
    'Sales Executive',
    'Created By',
    'Total Amount',
    'Received Amount',
    'Balance Amount',
    'Booking Status'
  ];
}

/**
 * Helper function to get column width based on header
 */
function getInsuranceColumnWidth(header) {
  const widthMap = {
    'Sr. No': 8,
    'Booking Number': 18,
    'Booking Date': 12,
    'Branch Name': 20,
    'Customer Name': 25,
    'Customer ID': 15,
    'Address': 40,
    'Mobile 1': 15,
    'Mobile 2': 15,
    'PAN': 15,
    'Aadhar': 18,
    'Occupation': 15,
    'Date of Birth': 12,
    'Nominee Age': 12, // ✅ Updated width
    'Nominee Name': 20,
    'Nominee Relation': 15,
    'Model': 20,
    'Model Type': 12,
    'Color': 15,
    'Chassis Number': 20,
    'Engine Number': 18,
    'Insurance Status': 18,
    'Payment Type': 15,
    'Financier Name': 20,
    'HPA': 8,
    'RTO Status': 15,
    'RTO Amount': 15,
    'KYC Status': 15,
    'Finance Letter Status': 20,
    'Deal Form Status': 18,
    'Delivery Challan Status': 20,
    'Sales Executive': 20,
    'Created By': 20,
    'Total Amount': 15,
    'Received Amount': 15,
    'Balance Amount': 15,
    'Booking Status': 18
  };
  
  return widthMap[header] || 18;
}


/**
 * Helper function to add summary section to Excel
 */
const addSummarySection = (worksheet, receipts, totalColumns) => {
  const summaryStartRow = worksheet.rowCount + 3;
  
  // Summary Title
  const summaryTitleRow = summaryStartRow;
  const titleEndCol = Math.min(6, totalColumns);
  const titleEndColLetter = String.fromCharCode(64 + titleEndCol);
  worksheet.mergeCells(`A${summaryTitleRow}:${titleEndColLetter}${summaryTitleRow}`);
  const titleCell = worksheet.getCell(`A${summaryTitleRow}`);
  titleCell.value = 'RECEIPT SUMMARY';
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4F81BD' }
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.border = {
    top: { style: 'medium' },
    left: { style: 'medium' },
    bottom: { style: 'medium' },
    right: { style: 'medium' }
  };

  // Calculate totals
  const totalAmount = receipts.reduce((sum, r) => sum + (r.amount || 0), 0);
  const totalNetAmount = receipts.reduce((sum, r) => sum + (r.netAmount || 0), 0);
  const totalGcAmount = receipts.reduce((sum, r) => sum + (r.gcAmount || 0), 0);
  
  const summaryData = [
    ['Total Receipts:', receipts.length],
    ['Total Amount:', `₹${totalAmount.toFixed(2)}`],
    ['Total Net Amount:', `₹${totalNetAmount.toFixed(2)}`],
    ['Total GC Amount:', `₹${totalGcAmount.toFixed(2)}`],
    ['Average Receipt Amount:', `₹${(totalAmount / Math.max(receipts.length, 1)).toFixed(2)}`]
  ];

  summaryData.forEach(([label, value], index) => {
    const rowNum = summaryStartRow + 1 + index;
    
    // Label
    const labelCell = worksheet.getCell(`A${rowNum}`);
    labelCell.value = label;
    labelCell.font = { bold: true };
    labelCell.alignment = { horizontal: 'right', vertical: 'middle' };
    labelCell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
    
    // Value
    if (value) {
      worksheet.mergeCells(`B${rowNum}:${titleEndColLetter}${rowNum}`);
      const valueCell = worksheet.getCell(`B${rowNum}`);
      valueCell.value = value;
      valueCell.alignment = { horizontal: 'left', vertical: 'middle' };
      valueCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      
      // Style amount cells
      if (typeof value === 'string' && value.startsWith('₹')) {
        valueCell.font = { bold: true, color: { argb: 'FF107C10' } };
      }
    }
  });

  return summaryStartRow + summaryData.length + 2;
};

/**
 * Helper function to add payment mode breakdown
 */
const addPaymentModeBreakdown = (worksheet, receipts, startRow, totalColumns) => {
  // Breakdown Title
  const titleEndCol = Math.min(3, totalColumns);
  const titleEndColLetter = String.fromCharCode(64 + titleEndCol);
  worksheet.mergeCells(`A${startRow}:${titleEndColLetter}${startRow}`);
  const breakdownTitleCell = worksheet.getCell(`A${startRow}`);
  breakdownTitleCell.value = 'PAYMENT MODE BREAKDOWN';
  breakdownTitleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  breakdownTitleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2E75B5' }
  };
  breakdownTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  breakdownTitleCell.border = {
    top: { style: 'medium' },
    left: { style: 'medium' },
    bottom: { style: 'medium' },
    right: { style: 'medium' }
  };

  // Breakdown Headers
  const breakdownHeadersRow = startRow + 1;
  const breakdownHeaders = ['Payment Mode', 'Count', 'Total Amount'];
  breakdownHeaders.forEach((header, colIndex) => {
    const colLetter = String.fromCharCode(65 + colIndex);
    const cell = worksheet.getCell(`${colLetter}${breakdownHeadersRow}`);
    cell.value = header;
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF2F2F2' }
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  // Calculate payment mode breakdown
  const paymentModeBreakdown = receipts.reduce((acc, receipt) => {
    const mode = receipt.paymentMode || 'Unknown';
    if (!acc[mode]) {
      acc[mode] = { count: 0, amount: 0 };
    }
    acc[mode].count++;
    acc[mode].amount += receipt.amount || 0;
    return acc;
  }, {});

  // Add breakdown data
  Object.entries(paymentModeBreakdown).forEach(([mode, data], index) => {
    const rowNum = breakdownHeadersRow + 1 + index;
    
    // Mode
    const modeCell = worksheet.getCell(`A${rowNum}`);
    modeCell.value = mode;
    modeCell.alignment = { horizontal: 'left', vertical: 'middle' };
    
    // Count
    const countCell = worksheet.getCell(`B${rowNum}`);
    countCell.value = data.count;
    countCell.alignment = { horizontal: 'center', vertical: 'middle' };
    
    // Amount
    const amountCell = worksheet.getCell(`C${rowNum}`);
    amountCell.value = `₹${data.amount.toFixed(2)}`;
    amountCell.alignment = { horizontal: 'right', vertical: 'middle' };
    amountCell.font = { bold: true, color: { argb: 'FF107C10' } };
    
    // Row styling
    [modeCell, countCell, amountCell].forEach(cell => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      
      if (index % 2 === 0) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8F8F8' }
        };
      }
    });
  });

  return breakdownHeadersRow + Object.keys(paymentModeBreakdown).length + 2;
};
 
/**
 * Generate receipt report with filtering options - FIXED VERSION
 * Now filtering by receiptDate instead of approvedAt
 * Shows approval details correctly (without time)
 * ADDED: Refund column (Yes/No)
 * @route GET /api/v1/reports/receipts
 * @access Private
 */
exports.generateReceiptReport = async (req, res) => {
  try {
    // Extract query parameters
    const { 
      branchId, 
      startDate, 
      endDate, 
      paymentMode,
      cashOtherFilter, // NEW: 'cash' or 'other' filter
      status,
      createdBy,
      receivedBy,
      bookingNumber,
      customerId,
      bookingType,
      customerType,
      modelId,
      colorId,
      salesExecutiveId,
      format = 'excel',
      includeCancelled = 'false'
    } = req.query;

    // ========== BRANCH ACCESS LOGIC ==========
    const userId = req.user.id;
    
    const user = await User.findById(userId)
      .select('-otp -otpExpires -emailOtp -emailOtpExpires -password')
      .populate({
        path: 'roles',
        select: 'name isSuperAdmin permissionsCount'
      })
      .populate('branch')
      .populate({
        path: 'accessibleBranches',
        model: 'Branch',
        select: '_id name address city state pincode phone email is_active logo1'
      })
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`🏢 User's branch: ${user.branch?.name || 'None'}`);
    console.log(`🔑 Branch Access Type: ${user.branchAccess || 'OWN'}`);
    console.log(`🏢 Accessible Branches: ${user.accessibleBranches?.length || 0}`);
    
    const userRoles = user.roles || [];
    const isActualSuperAdmin = userRoles.some(role => role.name === "SUPERADMIN") || false;
    const isSuperAdminFlag = userRoles.some(role => role.isSuperAdmin === true) || false;
    const branchAccess = user.branchAccess || 'OWN';
    
    let hasAllBranchesAccess = false;
    
    if (isActualSuperAdmin) {
      hasAllBranchesAccess = true;
      console.log('✅ User is SUPERADMIN - has access to all branches');
    } else if (branchAccess === 'ALL') {
      hasAllBranchesAccess = true;
      console.log('✅ User has ALL branch access permission');
    } else if (isSuperAdminFlag) {
      hasAllBranchesAccess = true;
      console.log('✅ User is ADMIN/GM - has access to all branches');
    } else {
      console.log('ℹ️ User has restricted branch access');
    }

    // ========== GET AVAILABLE BRANCHES FOR DROPDOWN ==========
    let availableBranches = [];
    
    if (hasAllBranchesAccess) {
      availableBranches = await Branch.find({ is_active: true })
        .select('_id name address city')
        .sort({ name: 1 })
        .lean();
      console.log(`✅ Fetched ${availableBranches.length} total branches for dropdown`);
    } else if (branchAccess === 'ASSIGNED' && user.accessibleBranches) {
      availableBranches = user.accessibleBranches.map(branch => ({
        _id: branch._id,
        name: branch.name,
        address: branch.address,
        city: branch.city
      })).sort((a, b) => a.name.localeCompare(b.name));
      console.log(`✅ Using ${availableBranches.length} assigned branches for dropdown`);
    } else if (user.branch) {
      availableBranches = [{
        _id: user.branch._id,
        name: user.branch.name,
        address: user.branch.address,
        city: user.branch.city
      }];
      console.log('✅ Using only own branch for dropdown');
    }
    
    if (availableBranches.length > 1) {
      availableBranches.unshift({
        _id: 'all',
        name: 'All Branches',
        address: '',
        city: ''
      });
      console.log('✅ Added "All Branches" option to dropdown');
    }

    // ========== BUILD BOOKING FILTERS WITH BRANCH ACCESS ==========
    let hasBookingFilter = false;
    const bookingFilterConditions = [];

    if (!hasAllBranchesAccess) {
      if (branchAccess === 'ASSIGNED' && user.accessibleBranches && user.accessibleBranches.length > 0) {
        const accessibleBranchIds = user.accessibleBranches.map(branch => branch._id);
        console.log(`User has access to ${accessibleBranchIds.length} assigned branches`);
        
        if (branchId) {
          if (branchId === 'all') {
            bookingFilterConditions.push({ branch: { $in: accessibleBranchIds } });
            console.log('✅ Showing receipts from all accessible branches');
            hasBookingFilter = true;
          } else {
            const requestedBranchId = new mongoose.Types.ObjectId(branchId);
            const hasAccess = accessibleBranchIds.some(branchId => 
              branchId.toString() === requestedBranchId.toString()
            );
            
            if (!hasAccess) {
              return res.status(403).json({
                success: false,
                message: 'You do not have access to this branch'
              });
            }
            bookingFilterConditions.push({ branch: requestedBranchId });
            console.log(`✅ Filtering by branch: ${branchId}`);
            hasBookingFilter = true;
          }
        } else {
          bookingFilterConditions.push({ branch: { $in: accessibleBranchIds } });
          console.log('✅ Showing receipts from all accessible branches (no branch filter)');
          hasBookingFilter = true;
        }
      } else {
        console.log('User has only OWN branch access');
        if (user.branch && user.branch._id) {
          bookingFilterConditions.push({ branch: user.branch._id });
          console.log(`✅ Filtering by own branch: ${user.branch._id}`);
          hasBookingFilter = true;
        } else {
          return res.status(403).json({
            success: false,
            message: 'You do not have access to any branch'
          });
        }
      }
    } else {
      if (branchId) {
        if (branchId === 'all') {
          console.log('✅ Showing ALL branches (SUPERADMIN/ADMIN with "All" selected)');
        } else {
          bookingFilterConditions.push({ branch: new mongoose.Types.ObjectId(branchId) });
          console.log(`✅ Filtering by branch: ${branchId}`);
          hasBookingFilter = true;
        }
      } else {
        console.log('✅ Showing ALL branches (no branch filter)');
      }
    }

    if (bookingType) {
      bookingFilterConditions.push({ bookingType: bookingType });
      hasBookingFilter = true;
    }
    if (customerType) {
      bookingFilterConditions.push({ customerType: customerType });
      hasBookingFilter = true;
    }
    if (modelId) {
      bookingFilterConditions.push({ model: new mongoose.Types.ObjectId(modelId) });
      hasBookingFilter = true;
    }
    if (colorId) {
      bookingFilterConditions.push({ color: new mongoose.Types.ObjectId(colorId) });
      hasBookingFilter = true;
    }
    if (salesExecutiveId) {
      bookingFilterConditions.push({ salesExecutive: new mongoose.Types.ObjectId(salesExecutiveId) });
      hasBookingFilter = true;
    }

    console.log('Booking Filter Conditions:', bookingFilterConditions);

    // ========== BUILD RECEIPT MATCH CRITERIA ==========
    let receiptMatch = {};
    
    if (startDate || endDate) {
      receiptMatch.receiptDate = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        receiptMatch.receiptDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        receiptMatch.receiptDate.$lte = end;
      }
    }

    // MODIFIED: Handle payment mode filter with cash/other logic
    if (paymentMode && paymentMode !== 'all') {
      receiptMatch.paymentMode = paymentMode;
    } else if (cashOtherFilter) {
      // If cashOtherFilter is provided, don't set paymentMode in receiptMatch
      // We'll handle it after fetching receipts
      console.log(`Cash/Other filter applied: ${cashOtherFilter}`);
    }

    receiptMatch.status = includeCancelled === 'true' ? { $in: ['active', 'cancelled'] } : 'active';

    console.log('Receipt Match Criteria:', JSON.stringify(receiptMatch, null, 2));

    // ========== GET RECEIPTS FIRST (by receiptDate) ==========
    const receipts = await Receipt.find(receiptMatch)
      .populate({
        path: 'createdBy',
        select: 'name email'
      })
      .populate({
        path: 'receivedBy',
        select: 'name email'
      })
      .sort({ receiptDate: -1, createdAt: -1 })
      .lean();

    console.log(`Found ${receipts.length} receipts in date range`);

    if (receipts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No receipts found for the specified date range',
        availableBranches: availableBranches,
        userAccessInfo: {
          hasAllBranchesAccess: hasAllBranchesAccess,
          branchAccess: branchAccess,
          accessibleBranchesCount: user.accessibleBranches?.length || 0
        },
        filters: {
          receipt: receiptMatch
        }
      });
    }

    // ========== GET LEDGER IDs FROM RECEIPTS ==========
    const ledgerIds = receipts
      .map(r => r.ledger)
      .filter(Boolean);

    // ========== GET LEDGERS ==========
    let ledgerMap = {};
    if (ledgerIds.length > 0) {
      const ledgers = await Ledger.find({
        _id: { $in: ledgerIds }
      })
      .populate({
        path: 'subPaymentModeDetails',
        select: 'payment_mode name'
      })
      .populate({
        path: 'approvedBy',
        select: 'name email'
      })
      .populate({
        path: 'receivedByDetails',
        select: 'name email'
      })
      .lean();

      ledgers.forEach(ledger => {
        ledgerMap[ledger._id.toString()] = ledger;
      });
      
      console.log(`Fetched ${ledgers.length} ledger details`);
    }

    // ========== GET BOOKING IDs ==========
    const bookingIds = receipts
      .map(r => r.booking)
      .filter(Boolean)
      .map(id => new mongoose.Types.ObjectId(id));

    // ========== GET BOOKING DETAILS ==========
    let bookingMap = {};
    if (bookingIds.length > 0) {
      const bookings = await Booking.find({
        _id: { $in: bookingIds }
      })
      .populate({
        path: 'vehicle',
        select: 'chassisNumber engineNumber'
      })
      .populate({
        path: 'model',
        select: 'model_name type'  // Added 'type' field from Model schema
      })
      .populate({
        path: 'color',
        select: 'name'
      })
      .populate({
        path: 'branch',
        select: 'name address city'
      })
      .lean();

      bookings.forEach(booking => {
        bookingMap[booking._id.toString()] = booking;
      });
      
      console.log(`Fetched ${bookings.length} booking details`);
    }

    // ========== FILTER RECEIPTS BY BOOKING FILTERS ==========
    let enrichedReceipts = receipts;
    
    if (hasBookingFilter && bookingFilterConditions.length > 0 && bookingIds.length > 0) {
      const bookingQuery = { 
        $and: [
          ...bookingFilterConditions,
          { _id: { $in: bookingIds } }
        ]
      };
      
      const matchingBookings = await Booking.find(bookingQuery)
        .select('_id')
        .lean();
      
      const matchingBookingIds = matchingBookings.map(b => b._id.toString());
      
      enrichedReceipts = receipts.filter(receipt => {
        if (!receipt.booking) return false;
        return matchingBookingIds.includes(receipt.booking.toString());
      });
      
      console.log(`Filtered to ${enrichedReceipts.length} receipts with matching bookings`);
    }

    if (receivedBy) {
      enrichedReceipts = enrichedReceipts.filter(r => 
        r.receivedBy?._id?.toString() === receivedBy || 
        r.receivedBy?.toString() === receivedBy
      );
    }

    if (createdBy) {
      enrichedReceipts = enrichedReceipts.filter(r => 
        r.createdBy?._id?.toString() === createdBy || 
        r.createdBy?.toString() === createdBy
      );
    }

    if (bookingNumber) {
      enrichedReceipts = enrichedReceipts.filter(r => 
        r.bookingNumber?.toLowerCase().includes(bookingNumber.toLowerCase())
      );
    }

    if (customerId) {
      enrichedReceipts = enrichedReceipts.filter(r => 
        r.customer?.custId?.toLowerCase().includes(customerId.toLowerCase())
      );
    }

    // NEW: Apply cash/other filter
    if (cashOtherFilter) {
      if (cashOtherFilter.toLowerCase() === 'cash') {
        enrichedReceipts = enrichedReceipts.filter(r => 
          r.paymentMode?.toLowerCase() === 'cash'
        );
        console.log(`Filtered to ${enrichedReceipts.length} CASH receipts`);
      } else if (cashOtherFilter.toLowerCase() === 'other') {
        enrichedReceipts = enrichedReceipts.filter(r => 
          r.paymentMode?.toLowerCase() !== 'cash'
        );
        console.log(`Filtered to ${enrichedReceipts.length} OTHER (non-cash) receipts`);
      }
    }

    if (enrichedReceipts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No receipts found after applying filters',
        availableBranches: availableBranches,
        userAccessInfo: {
          hasAllBranchesAccess: hasAllBranchesAccess,
          branchAccess: branchAccess,
          accessibleBranchesCount: user.accessibleBranches?.length || 0
        },
        filters: {
          receipt: receiptMatch,
          booking: bookingFilterConditions,
          cashOtherFilter: cashOtherFilter || null
        }
      });
    }

    // ========== APPLY LEDGER STATUS FILTER ==========
    if (status && status !== 'all') {
      enrichedReceipts = enrichedReceipts.filter(receipt => {
        const ledger = receipt.ledger ? ledgerMap[receipt.ledger.toString()] : null;
        return ledger?.approvalStatus === status;
      });
      
      console.log(`Filtered to ${enrichedReceipts.length} receipts with ledger status: ${status}`);
    }

    // ========== MERGE RECEIPT, LEDGER AND BOOKING DATA ==========
    const finalReceipts = enrichedReceipts.map(receipt => {
      const ledger = receipt.ledger ? ledgerMap[receipt.ledger.toString()] : null;
      const booking = receipt.booking ? bookingMap[receipt.booking.toString()] : null;
      
      let chassisNumber = '';
      let engineNumber = '';
      let modelName = '';
      let modelType = '';  // NEW: For model type (EV, ICE, CSD)
      
      if (booking) {
        chassisNumber = booking.chassisNumber || '';
        engineNumber = booking.engineNumber || '';
        
        if ((!chassisNumber || !engineNumber) && booking.vehicle) {
          chassisNumber = chassisNumber || booking.vehicle.chassisNumber || '';
          engineNumber = engineNumber || booking.vehicle.engineNumber || '';
        }
        
        // Extract model name and type from booking
        if (booking.model) {
          if (typeof booking.model === 'object') {
            modelName = booking.model.model_name || '';
            modelType = booking.model.type || '';  // Get model type (EV, ICE, CSD)
          } else {
            modelName = booking.model.toString();
          }
        }
      }

      let customerName = receipt.customer?.name || '';
      if (!customerName && booking?.customerDetails) {
        customerName = booking.customerDetails.name || '';
      }
      
      let subPaymentMode = '';
      if (ledger?.subPaymentModeDetails) {
        if (Array.isArray(ledger.subPaymentModeDetails) && ledger.subPaymentModeDetails.length > 0) {
          subPaymentMode = ledger.subPaymentModeDetails[0].payment_mode || ledger.subPaymentModeDetails[0].name || '';
        } else if (ledger.subPaymentModeDetails && typeof ledger.subPaymentModeDetails === 'object') {
          subPaymentMode = ledger.subPaymentModeDetails.payment_mode || ledger.subPaymentModeDetails.name || '';
        }
      }
      
      if (!subPaymentMode && receipt.paymentDetails?.subPaymentMode) {
        subPaymentMode = receipt.paymentDetails.subPaymentMode.name || receipt.paymentDetails.subPaymentMode.code || '';
      }

      let approvedByName = '';
      let approvedAtFormatted = null;
      
      if (ledger?.approvedBy) {
        if (typeof ledger.approvedBy === 'object' && ledger.approvedBy.name) {
          approvedByName = ledger.approvedBy.name;
        } else if (typeof ledger.approvedBy === 'object' && ledger.approvedBy.email) {
          approvedByName = ledger.approvedBy.email;
        } else {
          approvedByName = ledger.approvedBy.toString();
        }
      }
      
      if (ledger?.approvedAt) {
        approvedAtFormatted = ledger.approvedAt;
      }
      
      // ========== DETERMINE IF THIS IS A REFUND ==========
      // Check multiple sources to identify refund:
      // 1. From receipt receiptType field
      // 2. From receipt paymentMode field
      // 3. From ledger type field
      // 4. From receipt paymentDetails refundDetails field
      const isRefund = (
        (receipt.receiptType === 'REFUND') ||
        (receipt.paymentMode === 'Refund') ||
        (ledger?.type === 'REFUND') ||
        (receipt.paymentDetails?.refundDetails?.reason)
      );
      
      return {
        ...receipt,
        ledger: ledger,
        bookingDetails: booking,
        receiptDate: receipt.receiptDate,
        chassisNumber: chassisNumber,
        engineNumber: engineNumber,
        branchName: booking?.branch?.name || '',
        branchId: booking?.branch?._id?.toString() || '',
        customerName: customerName,
        subPaymentMode: subPaymentMode,
        approvalStatus: ledger?.approvalStatus || 'N/A',
        approvedBy: approvedByName,
        approvedById: ledger?.approvedBy?._id || ledger?.approvedBy,
        approvedAt: approvedAtFormatted,
        receivedByName: receipt.receivedBy?.name || receipt.receivedBy?.toString() || '',
        receivedById: receipt.receivedBy?._id || receipt.receivedBy,
        createdByName: receipt.createdBy?.name || receipt.createdBy?.toString() || '',
        createdById: receipt.createdBy?._id || receipt.createdBy,
        receiptType: receipt.receiptType || 'PAYMENT',
        // Add model name and model type
        modelName: modelName,
        modelType: modelType,  // Model type (EV, ICE, CSD)
        // NEW: Add refund indicator
        isRefund: isRefund ? 'Yes' : 'No'  // Convert boolean to Yes/No for Excel
      };
    });

    // ========== GENERATE EXCEL REPORT ==========
    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      
      let worksheetName = 'Receipt Report';
      if (branchId && branchId !== 'all') {
        const branch = await Branch.findById(branchId).select('name').lean();
        if (branch?.name) {
          worksheetName = `${branch.name} Receipt Report`;
        }
      } else if (hasAllBranchesAccess && !branchId) {
        worksheetName = 'All Branches Receipt Report';
      }
      
      const worksheet = workbook.addWorksheet(worksheetName);

      const columns = [
        { header: 'S.No', key: 'sno', width: 8 },
        { header: 'Receipt Number', key: 'receiptNumber', width: 25 },
        { header: 'Receipt Date', key: 'receiptDate', width: 15 },
        { header: 'Ledger Status', key: 'ledgerStatus', width: 15 },
        { header: 'Approved By', key: 'approvedBy', width: 25 },
        { header: 'Approved Date', key: 'approvedDate', width: 15 },
        { header: 'Booking Number', key: 'bookingNumber', width: 20 },
        { header: 'Model Name', key: 'modelName', width: 25 },
        { header: 'Model Type', key: 'modelType', width: 15 },  // NEW COLUMN for model type
        { header: 'Branch Name', key: 'branchName', width: 25 },
        { header: 'Chassis Number', key: 'chassisNumber', width: 25 },
        { header: 'Engine Number', key: 'engineNumber', width: 25 },
        { header: 'Payment Mode', key: 'paymentMode', width: 15 },
        { header: 'Sub Payment Mode', key: 'subPaymentMode', width: 20 },
        { header: 'Net Amount (₹)', key: 'netAmount', width: 15, style: { numFmt: '#,##0.00' } },
        { header: 'Customer Name', key: 'customerName', width: 25 },
        { header: 'Transaction Reference', key: 'transactionReference', width: 25 },
        { header: 'Received By', key: 'receivedBy', width: 25 },
        { header: 'Created By', key: 'createdBy', width: 25 },
        { header: 'Notes', key: 'notes', width: 30 },
        { header: 'Refund', key: 'isRefund', width: 10 }  // NEW COLUMN for refund indicator
      ];

      worksheet.columns = columns;

      finalReceipts.forEach((receipt, index) => {
        const ledger = receipt.ledger || {};
        
        const rowData = {
          sno: index + 1,
          receiptNumber: receipt.receiptNumber || '',
          receiptDate: receipt.receiptDate ? moment(receipt.receiptDate).format('DD/MM/YYYY') : '',
          ledgerStatus: receipt.approvalStatus,
          approvedBy: receipt.approvedBy || '',
          approvedDate: receipt.approvedAt ? moment(receipt.approvedAt).format('DD/MM/YYYY') : '',
          bookingNumber: receipt.bookingNumber || receipt.bookingDetails?.bookingNumber || '',
          modelName: receipt.modelName || '',
          modelType: receipt.modelType || '',  // NEW FIELD
          branchName: receipt.branchName || '',
          chassisNumber: receipt.chassisNumber || '',
          engineNumber: receipt.engineNumber || '',
          paymentMode: receipt.paymentMode || ledger.paymentMode || '',
          subPaymentMode: receipt.subPaymentMode || '',
          netAmount: receipt.netAmount || receipt.amount || ledger.amount || 0,
          customerName: receipt.customerName || '',
          transactionReference: receipt.transactionReference || ledger.transactionReference || '',
          receivedBy: receipt.receivedByName || '',
          createdBy: receipt.createdByName || '',
          notes: receipt.notes || ledger.remark || '',
          isRefund: receipt.isRefund || 'No'  // NEW FIELD: Yes/No
        };

        worksheet.addRow(rowData);
      });

      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };
      });

      for (let i = 1; i <= finalReceipts.length; i++) {
        const row = worksheet.getRow(i + 1);
        if (i % 2 === 0) {
          row.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF2F2F2' }
            };
          });
        }
      }

      if (worksheet.rowCount > 1) {
        const lastCol = worksheet.columnCount;
        let lastColLetter = '';
        let tempCol = lastCol;
        while (tempCol > 0) {
          const remainder = (tempCol - 1) % 26;
          lastColLetter = String.fromCharCode(65 + remainder) + lastColLetter;
          tempCol = Math.floor((tempCol - 1) / 26);
        }
        worksheet.autoFilter = {
          from: 'A1',
          to: `${lastColLetter}${worksheet.rowCount}`
        };
      }

      worksheet.views = [{ state: 'frozen', ySplit: 1 }];

      const summaryStartRow = worksheet.rowCount + 3;
      
      worksheet.mergeCells(`A${summaryStartRow}:D${summaryStartRow}`);
      const titleCell = worksheet.getCell(`A${summaryStartRow}`);
      titleCell.value = 'RECEIPT REPORT SUMMARY';
      titleCell.font = { bold: true, size: 14 };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      titleCell.border = {
        top: { style: 'medium' },
        left: { style: 'medium' },
        bottom: { style: 'medium' },
        right: { style: 'medium' }
      };

      const totalNetAmount = finalReceipts.reduce((sum, r) => sum + (r.netAmount || r.amount || r.ledger?.amount || 0), 0);
      const uniqueBookings = [...new Set(finalReceipts.map(r => r.booking?.toString() || r.bookingDetails?._id?.toString()).filter(Boolean))];
      const uniqueBranches = [...new Set(finalReceipts.map(r => r.branchId).filter(Boolean))];
      
      const bankPayments = finalReceipts.filter(r => (r.paymentMode || r.ledger?.paymentMode) === 'Bank').length;
      const cashPayments = finalReceipts.filter(r => (r.paymentMode || r.ledger?.paymentMode) === 'Cash').length;
      
      // NEW: Calculate Other payments count (all non-cash, non-bank)
      const otherPayments = finalReceipts.filter(r => {
        const mode = r.paymentMode || r.ledger?.paymentMode;
        return mode && mode !== 'Cash' && mode !== 'Bank';
      }).length;
      
      const approvedCount = finalReceipts.filter(r => r.approvalStatus === 'Approved').length;
      const pendingCount = finalReceipts.filter(r => r.approvalStatus === 'Pending').length;
      const rejectedCount = finalReceipts.filter(r => r.approvalStatus === 'Rejected').length;
      
      const vehiclesWithChassis = finalReceipts.filter(r => r.chassisNumber).length;
      const vehiclesWithEngine = finalReceipts.filter(r => r.engineNumber).length;
      
      // Count by model type
      const evCount = finalReceipts.filter(r => r.modelType === 'EV').length;
      const iceCount = finalReceipts.filter(r => r.modelType === 'ICE').length;
      const csdCount = finalReceipts.filter(r => r.modelType === 'CSD').length;
      
      // NEW: Count refunds
      const refundCount = finalReceipts.filter(r => r.isRefund === 'Yes').length;
      
      const summaryData = [
        ['Total Receipts:', finalReceipts.length],
        ['Unique Bookings:', uniqueBookings.length],
        ['Unique Branches:', uniqueBranches.length],
        ['Vehicles with Chassis Number:', vehiclesWithChassis],
        ['Vehicles with Engine Number:', vehiclesWithEngine],
        ['EV Models:', evCount],
        ['ICE Models:', iceCount],
        ['CSD Models:', csdCount],
        ['Cash Payments:', cashPayments],
        ['Bank Payments:', bankPayments],
        ['Other Payments:', otherPayments],
        ['Refund Receipts:', refundCount],  // NEW: Refund count only
        ['Approved Receipts:', approvedCount],
        ['Pending Receipts:', pendingCount],
        ['Rejected Receipts:', rejectedCount],
        ['Total Net Amount:', `₹${totalNetAmount.toFixed(2)}`],
        ['Average Net Amount per Receipt:', `₹${(totalNetAmount / Math.max(finalReceipts.length, 1)).toFixed(2)}`]
      ];

      summaryData.forEach(([label, value], index) => {
        const rowNum = summaryStartRow + 1 + index;
        
        const labelCell = worksheet.getCell(`A${rowNum}`);
        labelCell.value = label;
        labelCell.font = { bold: true };
        labelCell.alignment = { horizontal: 'right', vertical: 'middle' };
        labelCell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        
        if (value) {
          worksheet.mergeCells(`B${rowNum}:D${rowNum}`);
          const valueCell = worksheet.getCell(`B${rowNum}`);
          valueCell.value = value;
          valueCell.alignment = { horizontal: 'left', vertical: 'middle' };
          valueCell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        }
      });

      const footerRow = summaryStartRow + summaryData.length + 2;
      worksheet.mergeCells(`A${footerRow}:D${footerRow}`);
      const footerCell = worksheet.getCell(`A${footerRow}`);
      footerCell.value = `Report generated on ${moment().format('DD MMM YYYY')} by ${user.name}`;
      footerCell.font = { italic: true, size: 10 };
      footerCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const fileName = `receipt_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
      
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`
      );

      await workbook.xlsx.write(res);
      return res.end();

    } else {
      // ========== RETURN JSON FORMAT ==========
      const formattedReceipts = finalReceipts.map(receipt => {
        const ledger = receipt.ledger || {};
        const booking = receipt.bookingDetails || {};
        
        return {
          receiptNumber: receipt.receiptNumber,
          receiptDate: receipt.receiptDate ? moment(receipt.receiptDate).format('YYYY-MM-DD') : null,
          receiptStatus: receipt.status,
          ledgerStatus: receipt.approvalStatus,
          approvedBy: receipt.approvedBy || null,
          approvedById: receipt.approvedById || null,
          approvedAt: receipt.approvedAt ? moment(receipt.approvedAt).format('YYYY-MM-DD') : null,
          receivedBy: receipt.receivedByName,
          receivedById: receipt.receivedById,
          createdBy: receipt.createdByName,
          createdById: receipt.createdById,
          bookingNumber: receipt.bookingNumber || booking.bookingNumber,
          modelName: receipt.modelName || '',
          modelType: receipt.modelType || '',  // NEW FIELD
          branchName: receipt.branchName,
          branchId: receipt.branchId,
          vehicle: {
            chassisNumber: receipt.chassisNumber,
            engineNumber: receipt.engineNumber
          },
          payment: {
            mode: receipt.paymentMode || ledger.paymentMode,
            subPaymentMode: receipt.subPaymentMode,
            netAmount: receipt.netAmount || receipt.amount || ledger.amount,
            transactionReference: receipt.transactionReference || ledger.transactionReference
          },
          customer: {
            name: receipt.customerName,
            custId: receipt.customer?.custId
          },
          bookingId: receipt.booking?.toString() || booking._id?.toString(),
          ledger: ledger._id ? {
            id: ledger._id,
            type: ledger.type,
            approvalStatus: ledger.approvalStatus,
            amount: ledger.amount
          } : null,
          notes: receipt.notes || ledger.remark,
          // NEW: Add refund indicator
          isRefund: receipt.isRefund === 'Yes'  // Convert back to boolean for JSON
        };
      });

      const uniqueBookings = [...new Set(finalReceipts.map(r => r.booking?.toString() || r.bookingDetails?._id?.toString()).filter(Boolean))];
      const uniqueBranches = [...new Set(finalReceipts.map(r => r.branchId).filter(Boolean))];
      const refundCount = finalReceipts.filter(r => r.isRefund === 'Yes').length;
      
      const summary = {
        totalReceipts: finalReceipts.length,
        uniqueBookings: uniqueBookings.length,
        uniqueBranches: uniqueBranches.length,
        vehiclesWithChassis: finalReceipts.filter(r => r.chassisNumber).length,
        vehiclesWithEngine: finalReceipts.filter(r => r.engineNumber).length,
        modelTypeBreakdown: {  // NEW: Model type breakdown
          ev: finalReceipts.filter(r => r.modelType === 'EV').length,
          ice: finalReceipts.filter(r => r.modelType === 'ICE').length,
          csd: finalReceipts.filter(r => r.modelType === 'CSD').length
        },
        // NEW: Add refund breakdown
        refundBreakdown: {
          refunds: refundCount
          // Non-refunds line removed as requested
        },
        totalNetAmount: finalReceipts.reduce((sum, r) => sum + (r.netAmount || r.amount || r.ledger?.amount || 0), 0),
        paymentModeBreakdown: {
          cash: finalReceipts.filter(r => (r.paymentMode || r.ledger?.paymentMode) === 'Cash').length,
          bank: finalReceipts.filter(r => (r.paymentMode || r.ledger?.paymentMode) === 'Bank').length,
          other: finalReceipts.filter(r => {
            const mode = r.paymentMode || r.ledger?.paymentMode;
            return mode && !['Cash', 'Bank'].includes(mode);
          }).length
        },
        approvalStatusBreakdown: {
          approved: finalReceipts.filter(r => r.approvalStatus === 'Approved').length,
          pending: finalReceipts.filter(r => r.approvalStatus === 'Pending').length,
          rejected: finalReceipts.filter(r => r.approvalStatus === 'Rejected').length
        }
      };

      res.status(200).json({
        success: true,
        count: formattedReceipts.length,
        summary: summary,
        data: formattedReceipts,
        availableBranches: availableBranches,
        userAccessInfo: {
          hasAllBranchesAccess: hasAllBranchesAccess,
          branchAccess: branchAccess,
          accessibleBranchesCount: user.accessibleBranches?.length || 0,
          userBranch: user.branch ? {
            _id: user.branch._id,
            name: user.branch.name
          } : null,
          userName: user.name,
          userEmail: user.email
        },
        filters: {
          dateRange: { 
            startDate: startDate || null, 
            endDate: endDate || null 
          },
          booking: bookingFilterConditions,
          selectedBranch: branchId || null,
          paymentMode: paymentMode || 'All',
          cashOtherFilter: cashOtherFilter || null,  // NEW: Show applied cash/other filter
          ledgerStatus: status || 'All'
        }
      });
    }

  } catch (error) {
    console.error('Error generating receipt report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating receipt report',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
/**
 * Generate Stock Report - Current Stock at Branches/Subdealers
 * @route GET /api/v1/reports/stock/current
 * @access Private
 */
exports.generateCurrentStockReport = async (req, res) => {
    try {
      const {
        branchId,
        subdealerId,
        locationType,
        modelId,
        colorId,
        vehicleType,
        modelType,
        status,
        format = 'excel',
        includeZeroStock = 'false',
        showAgeAnalysis = 'true'
      } = req.query;
  
      // Build filter conditions
      const filter = {};
  
      // ========== BRANCH ACCESS CONTROL ==========
      // Get user info from auth middleware
      const userId = req.user.id;
      
      // Fetch user with all necessary data
      const user = await User.findById(userId)
        .select('-otp -otpExpires -emailOtp -emailOtpExpires -password')
        .populate({
          path: 'roles',
          select: 'name isSuperAdmin permissionsCount'
        })
        .populate('branch')
        .populate({
          path: 'accessibleBranches',
          model: 'Branch',
          select: '_id name address city state pincode phone email is_active logo1'
        })
        .populate({
          path: 'assignedSubdealers', // Populate assigned subdealers
          model: 'Subdealer',
          select: '_id name firmName type status branch'
        })
        .lean();
  
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
  
      console.log(`👤 User: ${user.name} (${user.email})`);
      console.log(`🏢 User's branch: ${user.branch?.name || 'None'}`);
      console.log(`🔑 Branch Access Type: ${user.branchAccess || 'OWN'}`);
      console.log(`🏢 Accessible Branches: ${user.accessibleBranches?.length || 0}`);
      
      // Check user roles
      const userRoles = user.roles || [];
      
      // Extract role names
      const roleNames = userRoles.map(role => role.name);
      console.log('User roles:', roleNames);
      
      // Check if user is SUPERADMIN
      const isActualSuperAdmin = roleNames.includes("SUPERADMIN");
      
      // Check if user has superadmin flag
      const isSuperAdminFlag = userRoles.some(role => role.isSuperAdmin === true);
      
      // Check if user is ADBDM
      const isADBDM = roleNames.includes("ADBDM");
      console.log('Is ADBDM user:', isADBDM);
      
      // Get branch access from user
      const branchAccess = user.branchAccess || 'OWN';
      
      // Check if user has all branches access
      let hasAllBranchesAccess = false;
      
      if (isActualSuperAdmin) {
        hasAllBranchesAccess = true;
        console.log('✅ User is SUPERADMIN - has access to all branches');
      } else if (branchAccess === 'ALL') {
        hasAllBranchesAccess = true;
        console.log('✅ User has ALL branch access permission');
      } else if (isSuperAdminFlag) {
        hasAllBranchesAccess = true;
        console.log('✅ User is ADMIN/GM - has access to all branches');
      } else {
        console.log('ℹ️ User has restricted branch access');
      }
  
      // ========== GET AVAILABLE BRANCHES FOR DROPDOWN ==========
      let availableBranches = [];
      
      if (hasAllBranchesAccess) {
        // User can see all active branches
        availableBranches = await Branch.find({ is_active: true })
          .select('_id name address city')
          .sort({ name: 1 })
          .lean();
        console.log(`✅ Fetched ${availableBranches.length} total branches for dropdown`);
      } else if (branchAccess === 'ASSIGNED' && user.accessibleBranches) {
        // User can see only assigned branches
        availableBranches = user.accessibleBranches.map(branch => ({
          _id: branch._id,
          name: branch.name,
          address: branch.address,
          city: branch.city
        })).sort((a, b) => a.name.localeCompare(b.name));
        console.log(`✅ Using ${availableBranches.length} assigned branches for dropdown`);
      } else if (user.branch) {
        // User can see only their own branch
        availableBranches = [{
          _id: user.branch._id,
          name: user.branch.name,
          address: user.branch.address,
          city: user.branch.city
        }];
        console.log('✅ Using only own branch for dropdown');
      }
      
      // Add "All" option for users with multiple branch access
      if (availableBranches.length > 1) {
        availableBranches.unshift({
          _id: 'all',
          name: 'All Branches',
          address: '',
          city: ''
        });
        console.log('✅ Added "All Branches" option to dropdown');
      }
  
      // ========== GET AVAILABLE SUBDEALERS FOR DROPDOWN ==========
      let availableSubdealers = [];
      
      if (isADBDM) {
        // ADBDM users can only see their assigned subdealers
        if (user.assignedSubdealers && user.assignedSubdealers.length > 0) {
          availableSubdealers = user.assignedSubdealers.map(subdealer => ({
            _id: subdealer._id,
            name: subdealer.firmName || subdealer.name,
            type: subdealer.type,
            status: subdealer.status,
            branch: subdealer.branch
          })).sort((a, b) => a.name.localeCompare(b.name));
          console.log(`ADBDM user has ${availableSubdealers.length} assigned subdealers`);
        } else {
          console.log('ADBDM user has no assigned subdealers');
        }
      } else if (hasAllBranchesAccess) {
        // Superadmin/GM can see all active subdealers
        const subdealers = await Subdealer.find({ status: 'active' })
          .select('_id name firmName type status branch')
          .sort({ name: 1 })
          .lean();
        
        availableSubdealers = subdealers.map(sub => ({
          _id: sub._id,
          name: sub.firmName || sub.name,
          type: sub.type,
          status: sub.status,
          branch: sub.branch
        }));
        console.log(`Fetched ${availableSubdealers.length} total subdealers for dropdown`);
      } else if (user.branch) {
        // Regular users can see subdealers assigned to their branch
        const subdealers = await Subdealer.find({ 
          branch: user.branch._id,
          status: 'active'
        })
          .select('_id name firmName type status branch')
          .sort({ name: 1 })
          .lean();
        
        availableSubdealers = subdealers.map(sub => ({
          _id: sub._id,
          name: sub.firmName || sub.name,
          type: sub.type,
          status: sub.status,
          branch: sub.branch
        }));
        console.log(`Fetched ${availableSubdealers.length} subdealers for branch ${user.branch.name}`);
      }
      
      // Add "All" option for subdealers if multiple
      if (availableSubdealers.length > 1) {
        availableSubdealers.unshift({
          _id: 'all',
          name: 'All Subdealers',
          type: '',
          status: '',
          branch: null
        });
        console.log('Added "All Subdealers" option to subdealer dropdown');
      }
  
      // ========== APPLY BRANCH FILTER ==========
      // First apply branch filter for locationType = 'branch'
      if (locationType === 'branch' || !locationType) {
        if (!hasAllBranchesAccess) {
          if (branchAccess === 'ASSIGNED' && user.accessibleBranches && user.accessibleBranches.length > 0) {
            // User has access to specific assigned branches
            const accessibleBranchIds = user.accessibleBranches.map(branch => branch._id);
            console.log(`User has access to ${accessibleBranchIds.length} assigned branches`);
            
            // If branchId is provided in query, check if it's in accessible branches
            if (branchId) {
              if (branchId === 'all') {
                // User selected "All" - show all accessible branches
                filter.unloadLocation = { $in: accessibleBranchIds };
                console.log('✅ Showing vehicles from all accessible branches');
              } else {
                const requestedBranchId = new mongoose.Types.ObjectId(branchId);
                const hasAccess = accessibleBranchIds.some(branchId => 
                  branchId.toString() === requestedBranchId.toString()
                );
                
                if (!hasAccess) {
                  return res.status(403).json({
                    success: false,
                    message: 'You do not have access to this branch'
                  });
                }
                filter.unloadLocation = requestedBranchId;
                console.log(`✅ Filtering vehicles by branch: ${branchId}`);
              }
            } else {
              // If no branchId specified, show vehicles from all accessible branches
              filter.unloadLocation = { $in: accessibleBranchIds };
              console.log('✅ Showing vehicles from all accessible branches (no branch filter)');
            }
          } else {
            // User has only OWN branch access
            console.log('User has only OWN branch access');
            if (user.branch && user.branch._id) {
              filter.unloadLocation = user.branch._id;
              console.log(`✅ Filtering vehicles by own branch: ${user.branch._id}`);
            } else {
              return res.status(403).json({
                success: false,
                message: 'You do not have access to any branch'
              });
            }
          }
        } else {
          // User has all branches permission
          if (branchId) {
            if (branchId === 'all') {
              // Show vehicles from all branches (no filter)
              console.log('✅ Showing vehicles from ALL branches (SUPERADMIN/ADMIN with "All" selected)');
            } else {
              filter.unloadLocation = new mongoose.Types.ObjectId(branchId);
              console.log(`✅ Filtering vehicles by branch: ${branchId}`);
            }
          } else {
            // If no branchId specified, show vehicles from all branches
            console.log('✅ Showing vehicles from ALL branches (no branch filter)');
          }
        }
      }
  
      // ========== APPLY SUBDEALER FILTER ==========
      // Handle subdealer filtering
      if (locationType === 'subdealer') {
        console.log('Processing subdealer location filter...');
        
        if (isADBDM) {
          // ADBDM users can only see their assigned subdealers
          if (user.assignedSubdealers && user.assignedSubdealers.length > 0) {
            const assignedSubdealerIds = user.assignedSubdealers.map(sub => sub._id);
            
            if (subdealerId) {
              if (subdealerId === 'all') {
                // Show vehicles from all assigned subdealers
                filter.subdealerLocation = { $in: assignedSubdealerIds };
                filter.locationType = 'subdealer';
                console.log(`✅ ADBDM: Showing vehicles from all ${assignedSubdealerIds.length} assigned subdealers`);
              } else {
                const requestedSubdealerId = new mongoose.Types.ObjectId(subdealerId);
                const hasAccess = assignedSubdealerIds.some(sId => 
                  sId.toString() === requestedSubdealerId.toString()
                );
                
                if (!hasAccess) {
                  return res.status(403).json({
                    success: false,
                    message: 'You do not have access to this subdealer'
                  });
                }
                filter.subdealerLocation = requestedSubdealerId;
                filter.locationType = 'subdealer';
                console.log(`✅ ADBDM: Filtering vehicles by subdealer: ${subdealerId}`);
              }
            } else {
              // If no subdealerId specified, show vehicles from all assigned subdealers
              filter.subdealerLocation = { $in: assignedSubdealerIds };
              filter.locationType = 'subdealer';
              console.log(`✅ ADBDM: Showing vehicles from all assigned subdealers (no filter)`);
            }
          } else {
            // ADBDM with no assigned subdealers - return empty result
            console.log('⚠️ ADBDM user has no assigned subdealers');
            if (format === 'excel') {
              const workbook = new ExcelJS.Workbook();
              const worksheet = workbook.addWorksheet('Stock Report');
              
              const fileName = `stock_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
              
              res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
              res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
              
              await workbook.xlsx.write(res);
              res.end();
              return;
            } else {
              return res.status(200).json({
                success: true,
                count: 0,
                data: [],
                availableBranches: availableBranches,
                availableSubdealers: availableSubdealers,
                userAccessInfo: {
                  hasAllBranchesAccess: hasAllBranchesAccess,
                  branchAccess: branchAccess,
                  isADBDM: isADBDM,
                  accessibleBranchesCount: user.accessibleBranches?.length || 0,
                  assignedSubdealersCount: user.assignedSubdealers?.length || 0,
                  userBranch: user.branch ? {
                    _id: user.branch._id,
                    name: user.branch.name
                  } : null
                },
                filters: {
                  branchId: branchId,
                  subdealerId: subdealerId,
                  locationType: locationType,
                  modelId: modelId,
                  colorId: colorId,
                  vehicleType: vehicleType,
                  modelType: modelType,
                  status: status
                }
              });
            }
          }
        } else if (hasAllBranchesAccess) {
          // Superadmin/GM can see all subdealers
          if (subdealerId) {
            if (subdealerId === 'all') {
              // Show vehicles from all subdealers
              console.log('✅ Superadmin: Showing vehicles from ALL subdealers');
            } else {
              filter.subdealerLocation = new mongoose.Types.ObjectId(subdealerId);
              console.log(`✅ Filtering vehicles by subdealer: ${subdealerId}`);
            }
            filter.locationType = 'subdealer';
          }
        } else if (user.branch) {
          // Regular users can only see subdealers from their branch
          if (subdealerId && subdealerId !== 'all') {
            // Verify the subdealer belongs to user's branch
            const subdealer = await Subdealer.findById(subdealerId);
            if (subdealer && subdealer.branch.toString() === user.branch._id.toString()) {
              filter.subdealerLocation = new mongoose.Types.ObjectId(subdealerId);
              filter.locationType = 'subdealer';
              console.log(`✅ Filtering vehicles by subdealer from own branch: ${subdealerId}`);
            } else {
              return res.status(403).json({
                success: false,
                message: 'You do not have access to this subdealer'
              });
            }
          } else if (subdealerId === 'all') {
            // Show vehicles from all subdealers of the user's branch
            const branchSubdealers = await Subdealer.find({ 
              branch: user.branch._id,
              status: 'active'
            }).select('_id');
            
            const branchSubdealerIds = branchSubdealers.map(sub => sub._id);
            if (branchSubdealerIds.length > 0) {
              filter.subdealerLocation = { $in: branchSubdealerIds };
              filter.locationType = 'subdealer';
              console.log(`✅ Showing vehicles from all ${branchSubdealerIds.length} subdealers of branch`);
            } else {
              console.log('No subdealers found for this branch');
              if (format === 'excel') {
                const workbook = new ExcelJS.Workbook();
                const worksheet = workbook.addWorksheet('Stock Report');
                
                const fileName = `stock_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
                
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                
                await workbook.xlsx.write(res);
                res.end();
                return;
              } else {
                return res.status(200).json({
                  success: true,
                  count: 0,
                  data: [],
                  availableBranches: availableBranches,
                  availableSubdealers: availableSubdealers,
                  userAccessInfo: {
                    hasAllBranchesAccess: hasAllBranchesAccess,
                    branchAccess: branchAccess,
                    isADBDM: isADBDM,
                    accessibleBranchesCount: user.accessibleBranches?.length || 0,
                    assignedSubdealersCount: user.assignedSubdealers?.length || 0,
                    userBranch: user.branch ? {
                      _id: user.branch._id,
                      name: user.branch.name
                    } : null
                  },
                  filters: {
                    branchId: branchId,
                    subdealerId: subdealerId,
                    locationType: locationType,
                    modelId: modelId,
                    colorId: colorId,
                    vehicleType: vehicleType,
                    modelType: modelType,
                    status: status
                  }
                });
              }
            }
          }
        }
      }
  
      // ========== OTHER FILTERS ==========
      // Status filter - default to in_stock vehicles
      if (status) {
        filter.status = status;
      } else {
        filter.status = 'in_stock';
      }
  
      // Additional filters
      if (modelId) {
        filter.model = new mongoose.Types.ObjectId(modelId);
      }
      if (colorId) {
        filter['color.id'] = new mongoose.Types.ObjectId(colorId);
      }
      if (vehicleType) {
        filter.type = vehicleType.toUpperCase();
      }
  
      console.log('Stock Report Filter:', JSON.stringify(filter, null, 2));
  
      // ========== FETCH VEHICLES ==========
      // First, create the vehicle query
      let vehiclesQuery = Vehicle.find(filter)
        .populate('model', 'model_name manufacturer variant fuel_type type model_type')
        .populate('colors', 'name hex_code')
        .populate('color.id', 'name hex_code')
        .populate('unloadLocation', 'name address city state')
        .populate('subdealerLocation', 'name location rateOfInterest type branch')
        .populate('addedBy', 'name email')
        .populate('lastUpdatedBy', 'name email')
        .sort({ inwardDate: 1, chassisNumber: 1 });
  
      // ========== APPLY MODEL TYPE FILTER IF PROVIDED ==========
      let modelTypeFilterApplied = false;
      if (modelType) {
        console.log(`Applying model type filter: ${modelType}`);
        
        // Get all model IDs of the specified type
        const models = await mongoose.model('Model').find({ 
          $or: [
            { model_type: modelType.toUpperCase() },
            { type: modelType.toUpperCase() }
          ]
        }).select('_id').lean();
        
        const modelIds = models.map(model => model._id);
        console.log(`Found ${modelIds.length} models of type ${modelType}:`, modelIds);
        
        if (modelIds.length > 0) {
          // Add model filter to the query - IMPORTANT: Assign back to vehiclesQuery
          vehiclesQuery = vehiclesQuery.where('model').in(modelIds);
          modelTypeFilterApplied = true;
          console.log(`✅ Filtering by ${modelIds.length} ${modelType} models`);
        } else {
          // No models of this type found, return empty result
          console.log(`❌ No ${modelType} models found in Model collection`);
          if (format === 'excel') {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Stock Report');
            
            const fileName = `stock_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
            
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            
            await workbook.xlsx.write(res);
            res.end();
            return;
          } else {
            return res.status(200).json({
              success: true,
              count: 0,
              summary: {
                totalVehicles: 0,
                branchDistribution: {},
                locationTypeDistribution: {},
                modelDistribution: {},
                modelTypeDistribution: {},
                ageDistribution: {},
                averageAge: 0,
                gmApprovalRequired: 0,
                under10DaysCluster: 0
              },
              data: [],
              availableBranches: availableBranches,
              availableSubdealers: availableSubdealers,
              userAccessInfo: {
                hasAllBranchesAccess: hasAllBranchesAccess,
                branchAccess: branchAccess,
                isADBDM: isADBDM,
                accessibleBranchesCount: user.accessibleBranches?.length || 0,
                assignedSubdealersCount: user.assignedSubdealers?.length || 0,
                userBranch: user.branch ? {
                  _id: user.branch._id,
                  name: user.branch.name
                } : null
              },
              filters: {
                branchId: branchId,
                subdealerId: subdealerId,
                locationType: locationType,
                modelId: modelId,
                colorId: colorId,
                vehicleType: vehicleType,
                modelType: modelType,
                status: status,
                chassisAllocated: false
              }
            });
          }
        }
      }
      
      // Execute the query
      console.log('Executing vehicle query...');
      const vehicles = await vehiclesQuery.lean();
      console.log(`Found ${vehicles.length} vehicles in stock`);
  
      // Apply post-query filtering for model type if needed (alternative approach)
      let finalVehicles = vehicles;
      if (modelType && !modelTypeFilterApplied) {
        console.log('Applying post-query model type filter...');
        finalVehicles = vehicles.filter(vehicle => {
          const vehicleModelType = vehicle.model?.model_type || vehicle.model?.type || '';
          return vehicleModelType.toUpperCase() === modelType.toUpperCase();
        });
        console.log(`After model type filter: ${finalVehicles.length} vehicles`);
      } else {
        finalVehicles = vehicles;
      }
  
      if (finalVehicles.length === 0 && includeZeroStock === 'false') {
        if (format === 'excel') {
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet('Stock Report');
          
          const fileName = `stock_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
          
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
          
          await workbook.xlsx.write(res);
          res.end();
          return;
        } else {
          return res.status(200).json({
            success: true,
            count: 0,
            summary: {
              totalVehicles: 0,
              branchDistribution: {},
              locationTypeDistribution: {},
              modelDistribution: {},
              modelTypeDistribution: {},
              ageDistribution: {},
              averageAge: 0,
              gmApprovalRequired: 0,
              under10DaysCluster: 0
            },
            data: [],
            availableBranches: availableBranches,
            availableSubdealers: availableSubdealers,
            userAccessInfo: {
              hasAllBranchesAccess: hasAllBranchesAccess,
              branchAccess: branchAccess,
              isADBDM: isADBDM,
              accessibleBranchesCount: user.accessibleBranches?.length || 0,
              assignedSubdealersCount: user.assignedSubdealers?.length || 0,
              userBranch: user.branch ? {
                _id: user.branch._id,
                name: user.branch.name
              } : null
            },
            filters: {
              branchId: branchId,
              subdealerId: subdealerId,
              locationType: locationType,
              modelId: modelId,
              colorId: colorId,
              vehicleType: vehicleType,
              modelType: modelType,
              status: status,
              chassisAllocated: false
            }
          });
        }
      }
  
      // Generate Excel report
      if (format === 'excel') {
        const workbook = new ExcelJS.Workbook();
        
        // Create worksheet name
        let worksheetName = 'Current Stock Report';
        if (locationType === 'subdealer' && subdealerId && subdealerId !== 'all') {
          const subdealer = await Subdealer.findById(subdealerId);
          if (subdealer) {
            worksheetName = `${subdealer.firmName || subdealer.name} Stock Report`;
          }
        } else if (filter.unloadLocation && typeof filter.unloadLocation === 'object' && !filter.unloadLocation.$in) {
          const firstVehicle = finalVehicles.find(v => v.unloadLocation);
          if (firstVehicle?.unloadLocation?.name) {
            worksheetName = `${firstVehicle.unloadLocation.name} Stock Report`;
          }
        } else if (hasAllBranchesAccess && (!branchId || branchId === 'all')) {
          worksheetName = 'All Branches Stock Report';
        }
        
        const worksheet = workbook.addWorksheet(worksheetName.substring(0, 31));
  
        // Define column headers
        const columns = [
          { header: 'S.No', key: 'sno', width: 8 },
          { header: 'Model Type', key: 'modelType', width: 12 },
          { header: 'Location', key: 'locationName', width: 25 },
          { header: 'Location Type', key: 'locationType', width: 15 },
          { header: 'Chassis Number', key: 'chassisNumber', width: 20 },
          { header: 'Engine Number', key: 'engineNumber', width: 18 },
          { header: 'Model', key: 'model', width: 25 },
          { header: 'Color', key: 'primaryColor', width: 15 },
          { header: 'Inward Date', key: 'inwardDate', width: 15 },
          { header: 'Age (Days)', key: 'ageInDays', width: 12 },
          { header: 'Status', key: 'status', width: 15 }
        ];
  
        worksheet.columns = columns;
  
        // Add data rows
        finalVehicles.forEach((vehicle, index) => {
          // Get location details
          let locationName = '';
          let locationTypeValue = '';
          
          if (vehicle.locationType === 'branch' && vehicle.unloadLocation) {
            locationName = vehicle.unloadLocation.name || '';
            locationTypeValue = 'Branch';
          } else if (vehicle.locationType === 'subdealer' && vehicle.subdealerLocation) {
            locationName = vehicle.subdealerLocation.name || '';
            locationTypeValue = 'Subdealer';
          } else if (vehicle.locationType === 'yard') {
            locationName = 'Yard';
            locationTypeValue = 'Yard';
          }
  
          // Get color information
          const primaryColor = vehicle.color?.id?.name || vehicle.color?.name || '';
  
          // Get model type (EV/ICE)
          const modelTypeValue = vehicle.model?.model_type || vehicle.model?.type || '';
  
          // Prepare row data
          const rowData = {
            sno: index + 1,
            modelType: modelTypeValue,
            locationName: locationName,
            locationType: locationTypeValue,
            chassisNumber: vehicle.chassisNumber || '',
            engineNumber: vehicle.engineNumber || '',
            model: vehicle.model?.model_name || vehicle.modelName || '',
            primaryColor: primaryColor,
            inwardDate: vehicle.inwardDate ? moment(vehicle.inwardDate).format('DD/MM/YYYY') : '',
            ageInDays: vehicle.ageInDays || 0,
            status: vehicle.status || ''
          };
  
          worksheet.addRow(rowData);
        });
  
        // Style the header row
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell((cell) => {
          cell.font = {
            bold: true,
            color: { argb: 'FFFFFFFF' },
            size: 11
          };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F81BD' }
          };
          cell.alignment = {
            vertical: 'middle',
            horizontal: 'center',
            wrapText: true
          };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
  
        // Format all rows
        for (let i = 1; i <= finalVehicles.length; i++) {
          const row = worksheet.getRow(i + 1);
          
          if (i % 2 === 0) {
            row.eachCell((cell) => {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF2F2F2' }
              };
            });
          }
        }
  
        // Auto-filter
        if (worksheet.rowCount > 1) {
          const lastCol = worksheet.columnCount;
          let lastColLetter = '';
          let tempCol = lastCol;
          while (tempCol > 0) {
            const remainder = (tempCol - 1) % 26;
            lastColLetter = String.fromCharCode(65 + remainder) + lastColLetter;
            tempCol = Math.floor((tempCol - 1) / 26);
          }
          worksheet.autoFilter = {
            from: 'A1',
            to: `${lastColLetter}${worksheet.rowCount}`
          };
        }
  
        // Freeze header row
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  
        // ========== SUMMARY SHEET ==========
        const summarySheet = workbook.addWorksheet('Summary');
  
        // Summary Title
        summarySheet.mergeCells('A1:D1');
        const titleCell = summarySheet.getCell('A1');
        titleCell.value = 'STOCK SUMMARY REPORT';
        titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4F81BD' }
        };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  
        // Report Info
        const infoRows = [
          ['Report Generated:', moment().format('DD MMM YYYY HH:mm:ss')],
          ['Total Vehicles:', finalVehicles.length],
          ['Branch Filter:', branchId || (hasAllBranchesAccess ? 'All Branches' : 'User Accessible Branches')],
          ['Subdealer Filter:', subdealerId || (locationType === 'subdealer' ? 'All Subdealers' : 'Not Applied')],
          ['Location Type Filter:', locationType || 'All'],
          ['Model Type Filter:', modelType || 'All'],
          ['Status Filter:', status || 'in_stock'],
          ['Include Zero Stock:', includeZeroStock === 'true' ? 'Yes' : 'No']
        ];
  
        infoRows.forEach(([label, value], index) => {
          const rowNum = index + 3;
          summarySheet.getCell(`A${rowNum}`).value = label;
          summarySheet.getCell(`B${rowNum}`).value = value;
          summarySheet.getCell(`B${rowNum}`).font = { bold: true };
        });
  
        // ========== BRANCH-WISE SUMMARY ==========
        const branchStartRow = infoRows.length + 5;
  
        // Branch Summary Title
        summarySheet.mergeCells(`A${branchStartRow}:C${branchStartRow}`);
        const branchTitleCell = summarySheet.getCell(`A${branchStartRow}`);
        branchTitleCell.value = 'BRANCH-WISE STOCK SUMMARY';
        branchTitleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        branchTitleCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2E75B5' }
        };
        branchTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  
        // Branch Summary Headers
        const branchHeaders = ['Branch/Subdealer Name', 'Location Type', 'Vehicle Count'];
        const branchHeaderRow = branchStartRow + 1;
        branchHeaders.forEach((header, colIndex) => {
          const cell = summarySheet.getCell(`${String.fromCharCode(65 + colIndex)}${branchHeaderRow}`);
          cell.value = header;
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F81BD' }
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
  
        // Group vehicles by location
        const locationSummary = finalVehicles.reduce((acc, vehicle) => {
          let locationKey = '';
          let locationName = '';
          let locationTypeValue = '';
          
          if (vehicle.locationType === 'branch' && vehicle.unloadLocation) {
            locationKey = `BRANCH_${vehicle.unloadLocation._id}`;
            locationName = vehicle.unloadLocation.name || 'Unknown Branch';
            locationTypeValue = 'Branch';
          } else if (vehicle.locationType === 'subdealer' && vehicle.subdealerLocation) {
            locationKey = `SUBDEALER_${vehicle.subdealerLocation._id}`;
            locationName = vehicle.subdealerLocation.name || 'Unknown Subdealer';
            locationTypeValue = 'Subdealer';
          } else {
            locationKey = 'UNKNOWN';
            locationName = 'Unknown Location';
            locationTypeValue = 'Unknown';
          }
  
          if (!acc[locationKey]) {
            acc[locationKey] = {
              locationName: locationName,
              locationType: locationTypeValue,
              count: 0
            };
          }
          
          acc[locationKey].count++;
          return acc;
        }, {});
  
        // Add location summary data
        Object.values(locationSummary).forEach((location, index) => {
          const rowNum = branchHeaderRow + 1 + index;
          const rowData = [
            location.locationName,
            location.locationType,
            location.count
          ];
          
          rowData.forEach((value, colIndex) => {
            const cell = summarySheet.getCell(`${String.fromCharCode(65 + colIndex)}${rowNum}`);
            cell.value = value;
            cell.alignment = { 
              horizontal: colIndex === 2 ? 'right' : 'left',
              vertical: 'middle'
            };
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
            
            if (index % 2 === 0) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF2F2F2' }
              };
            }
          });
        });
  
        // ========== MODEL TYPE SUMMARY ==========
        const modelTypeStartRow = branchHeaderRow + Object.keys(locationSummary).length + 3;
  
        // Model Type Summary Title
        summarySheet.mergeCells(`A${modelTypeStartRow}:C${modelTypeStartRow}`);
        const modelTypeTitleCell = summarySheet.getCell(`A${modelTypeStartRow}`);
        modelTypeTitleCell.value = 'MODEL TYPE SUMMARY';
        modelTypeTitleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        modelTypeTitleCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2E75B5' }
        };
        modelTypeTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  
        // Model Type Summary Headers
        const modelTypeHeaders = ['Model Type', 'Vehicle Type', 'Count'];
        const modelTypeHeaderRow = modelTypeStartRow + 1;
        modelTypeHeaders.forEach((header, colIndex) => {
          const cell = summarySheet.getCell(`${String.fromCharCode(65 + colIndex)}${modelTypeHeaderRow}`);
          cell.value = header;
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F81BD' }
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
  
        // Group vehicles by model type
        const modelTypeSummary = finalVehicles.reduce((acc, vehicle) => {
          const modelTypeValue = vehicle.model?.model_type || vehicle.model?.type || 'UNKNOWN';
          const vehicleTypeValue = vehicle.type || '';
          
          if (!acc[modelTypeValue]) {
            acc[modelTypeValue] = {
              modelType: modelTypeValue,
              vehicleType: vehicleTypeValue,
              count: 0
            };
          }
          
          acc[modelTypeValue].count++;
          return acc;
        }, {});
  
        // Add model type summary data
        Object.values(modelTypeSummary).forEach((modelTypeData, index) => {
          const rowNum = modelTypeHeaderRow + 1 + index;
          
          const rowData = [
            modelTypeData.modelType,
            modelTypeData.vehicleType,
            modelTypeData.count
          ];
          
          rowData.forEach((value, colIndex) => {
            const cell = summarySheet.getCell(`${String.fromCharCode(65 + colIndex)}${rowNum}`);
            cell.value = value;
            cell.alignment = { 
              horizontal: colIndex === 2 ? 'right' : 'left',
              vertical: 'middle'
            };
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
            
            if (index % 2 === 0) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF2F2F2' }
              };
            }
          });
        });
  
        // ========== AGE ANALYSIS SUMMARY ==========
        const ageStartRow = modelTypeHeaderRow + Object.keys(modelTypeSummary).length + 3;
  
        // Age Analysis Title
        summarySheet.mergeCells(`A${ageStartRow}:C${ageStartRow}`);
        const ageTitleCell = summarySheet.getCell(`A${ageStartRow}`);
        ageTitleCell.value = 'AGE ANALYSIS SUMMARY';
        ageTitleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        ageTitleCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2E75B5' }
        };
        ageTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  
        // Age Analysis Headers
        const ageHeaders = ['Age Range', 'Vehicle Count', 'Percentage'];
        const ageHeaderRow = ageStartRow + 1;
        ageHeaders.forEach((header, colIndex) => {
          const cell = summarySheet.getCell(`${String.fromCharCode(65 + colIndex)}${ageHeaderRow}`);
          cell.value = header;
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F81BD' }
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
  
        // Calculate age distribution
        const ageGroups = {
          '0-5 days': finalVehicles.filter(v => (v.ageInDays || 0) <= 5).length,
          '6-10 days': finalVehicles.filter(v => (v.ageInDays || 0) > 5 && (v.ageInDays || 0) <= 10).length,
          '11-30 days': finalVehicles.filter(v => (v.ageInDays || 0) > 10 && (v.ageInDays || 0) <= 30).length,
          '31-60 days': finalVehicles.filter(v => (v.ageInDays || 0) > 30 && (v.ageInDays || 0) <= 60).length,
          '60+ days': finalVehicles.filter(v => (v.ageInDays || 0) > 60).length
        };
  
        // Add age analysis data
        Object.entries(ageGroups).forEach(([range, count], index) => {
          const rowNum = ageHeaderRow + 1 + index;
          const percentage = finalVehicles.length > 0 ? ((count / finalVehicles.length) * 100).toFixed(1) + '%' : '0%';
          
          const rowData = [range, count, percentage];
          
          rowData.forEach((value, colIndex) => {
            const cell = summarySheet.getCell(`${String.fromCharCode(65 + colIndex)}${rowNum}`);
            cell.value = value;
            cell.alignment = { 
              horizontal: colIndex === 1 ? 'right' : 'left',
              vertical: 'middle'
            };
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
            
            if (index % 2 === 0) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF2F2F2' }
              };
            }
          });
        });
  
        // ========== MODEL-WISE SUMMARY ==========
        const modelStartRow = ageHeaderRow + Object.keys(ageGroups).length + 3;
  
        // Model Summary Title
        summarySheet.mergeCells(`A${modelStartRow}:C${modelStartRow}`);
        const modelTitleCell = summarySheet.getCell(`A${modelStartRow}`);
        modelTitleCell.value = 'MODEL-WISE STOCK SUMMARY';
        modelTitleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        modelTitleCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2E75B5' }
        };
        modelTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  
        // Model Summary Headers
        const modelHeaders = ['Model Name', 'Model Type', 'Count'];
        const modelHeaderRow = modelStartRow + 1;
        modelHeaders.forEach((header, colIndex) => {
          const cell = summarySheet.getCell(`${String.fromCharCode(65 + colIndex)}${modelHeaderRow}`);
          cell.value = header;
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F81BD' }
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
  
        // Group vehicles by model
        const modelSummary = finalVehicles.reduce((acc, vehicle) => {
          const modelKey = vehicle.model?._id || 'unknown';
          const modelName = vehicle.model?.model_name || 'Unknown Model';
          const modelTypeValue = vehicle.model?.model_type || vehicle.model?.type || '';
          
          if (!acc[modelKey]) {
            acc[modelKey] = {
              modelName: modelName,
              modelType: modelTypeValue,
              count: 0
            };
          }
          
          acc[modelKey].count++;
          return acc;
        }, {});
        // Add model summary data
        Object.values(modelSummary).forEach((model, index) => {
          const rowNum = modelHeaderRow + 1 + index;
          const rowData = [
            model.modelName,
            model.modelType,
            model.count
          ];
          rowData.forEach((value, colIndex) => {
            const cell = summarySheet.getCell(`${String.fromCharCode(65 + colIndex)}${rowNum}`);
            cell.value = value;
            cell.alignment = { 
              horizontal: colIndex === 2 ? 'right' : 'left',
              vertical: 'middle'
            };
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
            
            if (index % 2 === 0) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF2F2F2' }
              };
            }
          });
        });
  
        // Set response headers
        const fileName = `stock_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  
        await workbook.xlsx.write(res);
        return res.end();
  
      } else {
        // ========== RETURN JSON FORMAT WITH DROPDOWN DATA ==========
        const formattedVehicles = finalVehicles.map(vehicle => {
          // Get model type
          const modelTypeValue = vehicle.model?.model_type || vehicle.model?.type || '';
  
          // Get location details
          let locationName = '';
          let locationTypeValue = '';
          
          if (vehicle.locationType === 'branch' && vehicle.unloadLocation) {
            locationName = vehicle.unloadLocation.name || '';
            locationTypeValue = 'Branch';
          } else if (vehicle.locationType === 'subdealer' && vehicle.subdealerLocation) {
            locationName = vehicle.subdealerLocation.name || '';
            locationTypeValue = 'Subdealer';
          } else if (vehicle.locationType === 'yard') {
            locationName = 'Yard';
            locationTypeValue = 'Yard';
          }
  
          return {
            chassisNumber: vehicle.chassisNumber,
            engineNumber: vehicle.engineNumber,
            model: vehicle.model?.model_name || vehicle.modelName,
            modelType: modelTypeValue,
            vehicleType: vehicle.type,
            color: vehicle.color?.id?.name || vehicle.color?.name,
            location: {
              type: locationTypeValue,
              name: locationName,
              id: vehicle.locationType === 'branch' ? vehicle.unloadLocation?._id : vehicle.subdealerLocation?._id
            },
            inwardDate: vehicle.inwardDate,
            ageInDays: vehicle.ageInDays || 0,
            status: vehicle.status,
            fifoRank: vehicle.fifoRank,
            requiresGmApproval: vehicle.requiresGmApproval,
            isUnder10DaysCluster: vehicle.isUnder10DaysCluster
          };
        });
  
        // Calculate summary statistics
        const summary = {
          totalVehicles: finalVehicles.length,
          branchDistribution: finalVehicles.reduce((acc, v) => {
            let branchName = '';
            if (v.locationType === 'branch' && v.unloadLocation) {
              branchName = v.unloadLocation.name;
            } else if (v.locationType === 'subdealer' && v.subdealerLocation) {
              branchName = v.subdealerLocation.name;
            } else {
              branchName = 'Other';
            }
            if (branchName) {
              acc[branchName] = (acc[branchName] || 0) + 1;
            }
            return acc;
          }, {}),
          locationTypeDistribution: finalVehicles.reduce((acc, v) => {
            const type = v.locationType || 'unknown';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          }, {}),
          modelDistribution: finalVehicles.reduce((acc, v) => {
            const model = v.model?.model_name || 'Unknown';
            acc[model] = (acc[model] || 0) + 1;
            return acc;
          }, {}),
          modelTypeDistribution: finalVehicles.reduce((acc, v) => {
            const modelTypeValue = v.model?.model_type || v.model?.type || 'Unknown';
            acc[modelTypeValue] = (acc[modelTypeValue] || 0) + 1;
            return acc;
          }, {}),
          ageDistribution: finalVehicles.reduce((acc, v) => {
            const age = v.ageInDays || 0;
            let range = '';
            if (age <= 5) range = '0-5 days';
            else if (age <= 10) range = '6-10 days';
            else if (age <= 30) range = '11-30 days';
            else if (age <= 60) range = '31-60 days';
            else range = '60+ days';
            
            acc[range] = (acc[range] || 0) + 1;
            return acc;
          }, {}),
          averageAge: finalVehicles.length > 0 
            ? Math.round(finalVehicles.reduce((sum, v) => sum + (v.ageInDays || 0), 0) / finalVehicles.length * 10) / 10
            : 0,
          gmApprovalRequired: finalVehicles.filter(v => v.requiresGmApproval === true).length,
          under10DaysCluster: finalVehicles.filter(v => v.isUnder10DaysCluster === true).length
        };
  
        res.status(200).json({
          success: true,
          count: finalVehicles.length,
          summary: summary,
          data: formattedVehicles,
          availableBranches: availableBranches,
          availableSubdealers: availableSubdealers,
          userAccessInfo: {
            hasAllBranchesAccess: hasAllBranchesAccess,
            branchAccess: branchAccess,
            isADBDM: isADBDM,
            accessibleBranchesCount: user.accessibleBranches?.length || 0,
            assignedSubdealersCount: user.assignedSubdealers?.length || 0,
            userBranch: user.branch ? {
              _id: user.branch._id,
              name: user.branch.name
            } : null
          },
          filters: {
            branchId: branchId,
            subdealerId: subdealerId,
            locationType: locationType,
            modelId: modelId,
            colorId: colorId,
            vehicleType: vehicleType,
            modelType: modelType,
            status: status,
            chassisAllocated: false
          }
        });
      }
    } catch (error) {
      console.error('Error generating stock report:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating stock report',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  };
/**
 * Generate Stock Transfer Report
 * @route GET /api/v1/reports/stock/transfers
 * @access Private
 */
exports.generateStockTransferReport = async (req, res) => {
  try {
    const {
      fromBranch,
      toBranch,
      toType,
      status,
      challanStatus,
      startDate,
      endDate,
      modelType, // ADDED: Model type filter
      format = 'excel'
    } = req.query;

    // ========== BRANCH ACCESS CONTROL ==========
    // Get user info from auth middleware
    const userId = req.user.id;
    
    // Fetch user with all necessary data (same as getMe)
    const user = await User.findById(userId)
      .select('-otp -otpExpires -emailOtp -emailOtpExpires -password')
      .populate({
        path: 'roles',
        select: 'name isSuperAdmin permissionsCount'
      })
      .populate('branch')
      .populate({
        path: 'accessibleBranches',
        model: 'Branch',
        select: '_id name address city state pincode phone email is_active logo1'
      })
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`🏢 User's branch: ${user.branch?.name || 'None'}`);
    console.log(`🔑 Branch Access Type: ${user.branchAccess || 'OWN'}`);
    console.log(`🏢 Accessible Branches: ${user.accessibleBranches?.length || 0}`);
    
    // Check user roles and permissions from user object
    const userRoles = user.roles || [];
    
    // Check if user is SUPERADMIN
    const isActualSuperAdmin = userRoles.some(role => 
      role.name === "SUPERADMIN"
    ) || false;
    
    // Check if user has superadmin flag
    const isSuperAdminFlag = userRoles.some(role => 
      role.isSuperAdmin === true
    ) || false;
    
    // Get branch access from user
    const branchAccess = user.branchAccess || 'OWN';
    
    // Check if user has all branches access
    let hasAllBranchesAccess = false;
    
    if (isActualSuperAdmin) {
      hasAllBranchesAccess = true;
      console.log('✅ User is SUPERADMIN - has access to all branches');
    } else if (branchAccess === 'ALL') {
      hasAllBranchesAccess = true;
      console.log('✅ User has ALL branch access permission');
    } else if (isSuperAdminFlag) {
      hasAllBranchesAccess = true;
      console.log('✅ User is ADMIN/GM - has access to all branches');
    } else {
      console.log('ℹ️ User has restricted branch access');
    }

    // ========== GET AVAILABLE BRANCHES FOR DROPDOWN ==========
    let availableBranches = [];
    
    if (hasAllBranchesAccess) {
      // User can see all active branches
      availableBranches = await Branch.find({ is_active: true })
        .select('_id name address city')
        .sort({ name: 1 })
        .lean();
      console.log(`✅ Fetched ${availableBranches.length} total branches for dropdown`);
    } else if (branchAccess === 'ASSIGNED' && user.accessibleBranches) {
      // User can see only assigned branches
      availableBranches = user.accessibleBranches.map(branch => ({
        _id: branch._id,
        name: branch.name,
        address: branch.address,
        city: branch.city
      })).sort((a, b) => a.name.localeCompare(b.name));
      console.log(`✅ Using ${availableBranches.length} assigned branches for dropdown`);
    } else if (user.branch) {
      // User can see only their own branch
      availableBranches = [{
        _id: user.branch._id,
        name: user.branch.name,
        address: user.branch.address,
        city: user.branch.city
      }];
      console.log('✅ Using only own branch for dropdown');
    }
    
    // Add "All" option for users with multiple branch access
    if (availableBranches.length > 1) {
      availableBranches.unshift({
        _id: 'all',
        name: 'All Branches',
        address: '',
        city: ''
      });
      console.log('✅ Added "All Branches" option to dropdown');
    }

    // Build filter conditions
    const filter = {};

    // ========== BRANCH FILTERS WITH ACCESS CONTROL ==========
    if (!hasAllBranchesAccess) {
      if (branchAccess === 'ASSIGNED' && user.accessibleBranches && user.accessibleBranches.length > 0) {
        const accessibleBranchIds = user.accessibleBranches.map(branch => branch._id);
        
        // For fromBranch filter
        if (fromBranch) {
          if (fromBranch === 'all') {
            // User selected "All" - show all accessible branches
            filter.fromBranch = { $in: accessibleBranchIds };
            console.log('✅ Showing transfers from all accessible branches');
          } else {
            const requestedBranchId = new mongoose.Types.ObjectId(fromBranch);
            const hasAccess = accessibleBranchIds.some(branchId => 
              branchId.toString() === requestedBranchId.toString()
            );
            
            if (!hasAccess) {
              return res.status(403).json({
                success: false,
                message: 'You do not have access to this from branch'
              });
            }
            filter.fromBranch = requestedBranchId;
            console.log(`✅ Filtering transfers by from branch: ${fromBranch}`);
          }
        } else {
          // If no fromBranch specified, show transfers from all accessible branches
          filter.fromBranch = { $in: accessibleBranchIds };
          console.log('✅ Showing transfers from all accessible branches (no from branch filter)');
        }
        
        // For toBranch filter (when toType is 'branch')
        if (toBranch && toType === 'branch') {
          if (toBranch === 'all') {
            filter.toBranch = { $in: accessibleBranchIds };
            console.log('✅ Showing transfers to all accessible branches');
          } else {
            const requestedToBranchId = new mongoose.Types.ObjectId(toBranch);
            const hasAccessTo = accessibleBranchIds.some(branchId => 
              branchId.toString() === requestedToBranchId.toString()
            );
            
            if (!hasAccessTo) {
              return res.status(403).json({
                success: false,
                message: 'You do not have access to this to branch'
              });
            }
            filter.toBranch = requestedToBranchId;
            console.log(`✅ Filtering transfers by to branch: ${toBranch}`);
          }
          filter.toType = 'branch';
        }
      } else {
        // User has only OWN branch access
        console.log('User has only OWN branch access');
        if (user.branch && user.branch._id) {
          filter.fromBranch = user.branch._id;
          console.log(`✅ Filtering transfers by own branch: ${user.branch._id}`);
        } else {
          return res.status(403).json({
            success: false,
            message: 'You do not have access to any branch'
          });
        }
      }
    } else {
      // User has all branches permission
      if (fromBranch) {
        if (fromBranch === 'all') {
          // Show transfers from all branches (no filter)
          console.log('✅ Showing transfers from ALL branches');
        } else {
          filter.fromBranch = new mongoose.Types.ObjectId(fromBranch);
          console.log(`✅ Filtering transfers by from branch: ${fromBranch}`);
        }
      }
      
      if (toBranch && toType === 'branch') {
        if (toBranch === 'all') {
          console.log('✅ Showing transfers to ALL branches');
        } else {
          filter.toBranch = new mongoose.Types.ObjectId(toBranch);
          console.log(`✅ Filtering transfers by to branch: ${toBranch}`);
        }
        filter.toType = 'branch';
      }
    }

    // Additional filters (if user has access)
    if (toType) {
      filter.toType = toType;
    }

    // Status filters
    if (status) {
      filter.status = status;
    }
    if (challanStatus) {
      filter.challanStatus = challanStatus;
    }

    // Date range filter
    if (startDate || endDate) {
      filter.transferDate = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.transferDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.transferDate.$lte = end;
      }
    }

    console.log('Stock Transfer Filter:', JSON.stringify(filter, null, 2));

    // Fetch transfers with all required populations
    const transfers = await StockTransfer.find(filter)
      .populate('fromBranchDetails', 'name address city state')
      .populate('toBranchDetails', 'name address city state')
      .populate('toSubdealerDetails', 'name location')
      .populate({
        path: 'items.vehicle',
        select: 'chassisNumber model modelName type colors color status',
        populate: [
          { 
            path: 'model', 
            select: 'model_name manufacturer variant fuel_type model_type' // ADDED: model_type
          },
          { path: 'colors', select: 'name' },
          { path: 'color.id', select: 'name' }
        ]
      })
      .sort({ transferDate: -1, _id: -1 })
      .lean();

    console.log(`Found ${transfers.length} stock transfers`);

    // ========== APPLY MODEL TYPE FILTER IF PROVIDED ==========
    let filteredTransfers = transfers;
    
    if (modelType) {
      console.log(`Applying model type filter: ${modelType}`);
      
      filteredTransfers = transfers.filter(transfer => {
        // Check if any vehicle in the transfer matches the model type
        return transfer.items.some(item => {
          const vehicle = item.vehicle || {};
          const vehicleModelType = vehicle.model?.model_type || vehicle.model?.type || '';
          return vehicleModelType.toUpperCase() === modelType.toUpperCase();
        });
      });
      
      console.log(`Filtered from ${transfers.length} to ${filteredTransfers.length} transfers for model type: ${modelType}`);
    }

    if (filteredTransfers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No stock transfers found for the specified criteria',
        availableBranches: availableBranches,
        userAccessInfo: {
          hasAllBranchesAccess: hasAllBranchesAccess,
          branchAccess: branchAccess,
          accessibleBranchesCount: user.accessibleBranches?.length || 0
        },
        filter: filter
      });
    }

    // Generate Excel report
    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      
      // SINGLE SHEET as requested
      const worksheet = workbook.addWorksheet('Stock Transfer Report');

      // Define column headers (EXACTLY as requested)
      const columns = [
        { header: 'S.No', key: 'sno', width: 8 },
        { header: 'Transfer ID', key: 'transferId', width: 15 },
        { header: 'Transfer Date', key: 'transferDate', width: 15 },
        { header: 'From Branch', key: 'fromBranch', width: 25 },
        { header: 'To Destination', key: 'toDestination', width: 25 },
        { header: 'Chassis Number', key: 'chassisNumber', width: 20 },
        { header: 'Model name', key: 'modelName', width: 25 },
        { header: 'Vehicle Type', key: 'vehicleType', width: 15 },
        { header: 'Color', key: 'color', width: 15 },
        { header: 'Transfer Status', key: 'transferStatus', width: 15 },
        { header: 'Challan Status', key: 'challanStatus', width: 15 }
      ];

      worksheet.columns = columns;

      // Add data rows
      let rowCounter = 1;
      filteredTransfers.forEach((transfer, transferIndex) => {
        const fromBranchName = transfer.fromBranchDetails?.name || '';
        let toDestination = '';
        
        if (transfer.toType === 'branch' && transfer.toBranchDetails) {
          toDestination = transfer.toBranchDetails.name || '';
        } else if (transfer.toType === 'subdealer' && transfer.toSubdealerDetails) {
          toDestination = transfer.toSubdealerDetails.name || '';
        }

        const transferDate = transfer.transferDate ? moment(transfer.transferDate).format('DD/MM/YYYY HH:mm') : '';
        const transferIdShort = transfer._id?.toString().substring(18, 24) || '';

        // Add each vehicle in the transfer
        transfer.items?.forEach((item) => {
          const vehicle = item.vehicle || {};
          const primaryColor = vehicle.color?.id?.name || vehicle.color?.name || '';
          const modelName = vehicle.model?.model_name || vehicle.modelName || '';
          const vehicleType = vehicle.model?.model_type || vehicle.type || '';

          const rowData = {
            sno: rowCounter++,
            transferId: transferIdShort,
            transferDate: transferDate,
            fromBranch: fromBranchName,
            toDestination: toDestination,
            chassisNumber: vehicle.chassisNumber || '',
            modelName: modelName,
            vehicleType: vehicleType,
            color: primaryColor,
            transferStatus: transfer.status ? transfer.status.toUpperCase() : '',
            challanStatus: transfer.challanStatus ? transfer.challanStatus.toUpperCase() : ''
          };

          worksheet.addRow(rowData);
        });
      });

      // Style the header row
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.font = {
          bold: true,
          color: { argb: 'FFFFFFFF' },
          size: 11
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4F81BD' }
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Format all rows (alternating colors)
      for (let i = 1; i <= filteredTransfers.reduce((sum, t) => sum + (t.items?.length || 0), 0); i++) {
        const row = worksheet.getRow(i + 1);
        
        // Apply alternating row colors for better readability
        if (i % 2 === 0) {
          row.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF2F2F2' }
            };
          });
        }
      }

      // Auto-filter
      if (worksheet.rowCount > 1) {
        const lastCol = worksheet.columnCount;
        let lastColLetter = '';
        let tempCol = lastCol;
        while (tempCol > 0) {
          const remainder = (tempCol - 1) % 26;
          lastColLetter = String.fromCharCode(65 + remainder) + lastColLetter;
          tempCol = Math.floor((tempCol - 1) / 26);
        }
        worksheet.autoFilter = {
          from: 'A1',
          to: `${lastColLetter}${worksheet.rowCount}`
        };
      }

      // Freeze header row
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];

      // Set response headers
      const fileName = `stock_transfer_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
      
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`
      );

      await workbook.xlsx.write(res);
      return res.end();

    } else {
      // Return JSON format
      const formattedTransfers = filteredTransfers.map(transfer => {
        const vehicles = transfer.items?.map(item => {
          const vehicle = item.vehicle || {};
          return {
            chassisNumber: vehicle.chassisNumber,
            model: vehicle.model?.model_name,
            modelName: vehicle.modelName,
            vehicleType: vehicle.model?.model_type || vehicle.type,
            color: vehicle.color?.id?.name || vehicle.color?.name,
            colors: vehicle.colors?.map(c => c.name) || [],
            itemStatus: item.status
          };
        }) || [];

        return {
          transferId: transfer._id,
          transferDate: transfer.transferDate,
          fromBranch: {
            id: transfer.fromBranch,
            name: transfer.fromBranchDetails?.name,
            address: transfer.fromBranchDetails?.address,
            city: transfer.fromBranchDetails?.city,
            state: transfer.fromBranchDetails?.state
          },
          toType: transfer.toType,
          toDestination: transfer.toType === 'branch' ? {
            id: transfer.toBranch,
            name: transfer.toBranchDetails?.name,
            address: transfer.toBranchDetails?.address,
            city: transfer.toBranchDetails?.city,
            state: transfer.toBranchDetails?.state
          } : {
            id: transfer.toSubdealer,
            name: transfer.toSubdealerDetails?.name,
            location: transfer.toSubdealerDetails?.location
          },
          vehicles: vehicles,
          vehicleCount: vehicles.length,
          status: transfer.status,
          challanStatus: transfer.challanStatus
        };
      });

      // Calculate summary statistics
      const summary = {
        totalTransfers: filteredTransfers.length,
        totalVehicles: filteredTransfers.reduce((sum, t) => sum + (t.items?.length || 0), 0),
        statusDistribution: filteredTransfers.reduce((acc, t) => {
          const status = t.status || 'unknown';
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        }, {}),
        challanStatusDistribution: filteredTransfers.reduce((acc, t) => {
          const status = t.challanStatus || 'unknown';
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        }, {}),
        toTypeDistribution: filteredTransfers.reduce((acc, t) => {
          const type = t.toType || 'unknown';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {}),
        modelTypeDistribution: filteredTransfers.reduce((acc, t) => {
          t.items?.forEach(item => {
            const vehicle = item.vehicle || {};
            const modelType = vehicle.model?.model_type || vehicle.model?.type || vehicle.type || 'UNKNOWN';
            acc[modelType] = (acc[modelType] || 0) + 1;
          });
          return acc;
        }, {})
      };

      res.status(200).json({
        success: true,
        count: filteredTransfers.length,
        summary: summary,
        data: formattedTransfers,
        availableBranches: availableBranches,
        userAccessInfo: {
          hasAllBranchesAccess: hasAllBranchesAccess,
          branchAccess: branchAccess,
          accessibleBranchesCount: user.accessibleBranches?.length || 0,
          userBranch: user.branch ? {
            _id: user.branch._id,
            name: user.branch.name
          } : null
        },
        filters: {
          fromBranch: fromBranch,
          toBranch: toBranch,
          toType: toType,
          status: status,
          challanStatus: challanStatus,
          startDate: startDate,
          endDate: endDate,
          modelType: modelType
        }
      });
    }

  } catch (error) {
    console.error('Error generating stock transfer report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating stock transfer report',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

exports.generateGCReport = async (req, res) => {
  try {
    const { 
      branchId, 
      startDate, 
      endDate, 
      financerId,
      modelType, // ADDED: Model type filter
      format = 'excel' 
    } = req.query;

    // Build filter conditions
    const filter = {};

    // Get user info from auth middleware
    const userId = req.user.id;
    
    // Fetch user with all necessary data (same as getMe)
    const user = await User.findById(userId)
      .select('-otp -otpExpires -emailOtp -emailOtpExpires -password')
      .populate({
        path: 'roles',
        select: 'name isSuperAdmin permissionsCount'
      })
      .populate('branch')
      .populate({
        path: 'accessibleBranches',
        model: 'Branch',
        select: '_id name address city state pincode phone email is_active logo1'
      })
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`🏢 User's branch: ${user.branch?.name || 'None'}`);
    console.log(`🔑 Branch Access Type: ${user.branchAccess || 'OWN'}`);
    console.log(`🏢 Accessible Branches: ${user.accessibleBranches?.length || 0}`);
    
    // Check user roles and permissions from user object
    const userRoles = user.roles || [];
    
    // Check if user is SUPERADMIN
    const isActualSuperAdmin = userRoles.some(role => 
      role.name === "SUPERADMIN"
    ) || false;
    
    // Check if user has superadmin flag
    const isSuperAdminFlag = userRoles.some(role => 
      role.isSuperAdmin === true
    ) || false;
    
    // Get branch access from user
    const branchAccess = user.branchAccess || 'OWN';
    
    // Check if user has all branches access
    let hasAllBranchesAccess = false;
    
    if (isActualSuperAdmin) {
      hasAllBranchesAccess = true;
      console.log('✅ User is SUPERADMIN - has access to all branches');
    } else if (branchAccess === 'ALL') {
      hasAllBranchesAccess = true;
      console.log('✅ User has ALL branch access permission');
    } else if (isSuperAdminFlag) {
      hasAllBranchesAccess = true;
      console.log('✅ User is ADMIN/GM - has access to all branches');
    } else {
      console.log('ℹ️ User has restricted branch access');
    }

    // ========== GET AVAILABLE BRANCHES FOR DROPDOWN ==========
    let availableBranches = [];
    
    if (hasAllBranchesAccess) {
      // User can see all active branches
      availableBranches = await Branch.find({ is_active: true })
        .select('_id name address city')
        .sort({ name: 1 })
        .lean();
      console.log(`✅ Fetched ${availableBranches.length} total branches for dropdown`);
    } else if (branchAccess === 'ASSIGNED' && user.accessibleBranches) {
      // User can see only assigned branches
      availableBranches = user.accessibleBranches.map(branch => ({
        _id: branch._id,
        name: branch.name,
        address: branch.address,
        city: branch.city
      })).sort((a, b) => a.name.localeCompare(b.name));
      console.log(`✅ Using ${availableBranches.length} assigned branches for dropdown`);
    } else if (user.branch) {
      // User can see only their own branch
      availableBranches = [{
        _id: user.branch._id,
        name: user.branch.name,
        address: user.branch.address,
        city: user.branch.city
      }];
      console.log('✅ Using only own branch for dropdown');
    }
    
    // Add "All" option for users with multiple branch access
    if (availableBranches.length > 1) {
      availableBranches.unshift({
        _id: 'all',
        name: 'All Branches',
        address: '',
        city: ''
      });
      console.log('✅ Added "All Branches" option to dropdown');
    }

    // ========== APPLY BRANCH FILTER ==========
    if (!hasAllBranchesAccess) {
      if (branchAccess === 'ASSIGNED' && user.accessibleBranches && user.accessibleBranches.length > 0) {
        // User has access to specific assigned branches
        const accessibleBranchIds = user.accessibleBranches.map(branch => branch._id);
        console.log(`User has access to ${accessibleBranchIds.length} assigned branches`);
        
        // If branchId is provided in query, check if it's in accessible branches
        if (branchId) {
          if (branchId === 'all') {
            // User selected "All" - show all accessible branches
            filter.branch = { $in: accessibleBranchIds };
            console.log('✅ Showing all accessible branches');
          } else {
            const requestedBranchId = new mongoose.Types.ObjectId(branchId);
            const hasAccess = accessibleBranchIds.some(branchId => 
              branchId.toString() === requestedBranchId.toString()
            );
            
            if (!hasAccess) {
              return res.status(403).json({
                success: false,
                message: 'You do not have access to this branch'
              });
            }
            filter.branch = requestedBranchId;
            console.log(`✅ Filtering by branch: ${branchId}`);
          }
        } else {
          // If no branchId specified, show all accessible branches
          filter.branch = { $in: accessibleBranchIds };
          console.log('✅ Showing all accessible branches (no branch filter)');
        }
      } else {
        // User has only OWN branch access
        console.log('User has only OWN branch access');
        if (user.branch && user.branch._id) {
          filter.branch = user.branch._id;
          console.log(`✅ Filtering by own branch: ${user.branch._id}`);
        } else {
          return res.status(403).json({
            success: false,
            message: 'You do not have access to any branch'
          });
        }
      }
    } else {
      // User has all branches permission
      if (branchId) {
        if (branchId === 'all') {
          // Show all branches (no filter)
          console.log('✅ Showing ALL branches (SUPERADMIN/ADMIN with "All" selected)');
        } else {
          filter.branch = new mongoose.Types.ObjectId(branchId);
          console.log(`✅ Filtering by branch: ${branchId}`);
        }
      } else {
        // If no branchId specified, show all branches
        console.log('✅ Showing ALL branches (no branch filter)');
      }
    }

    // ========== DATE RANGE FILTER ==========
    // Date range filter for receiptDate
    if (startDate || endDate) {
      filter.receiptDate = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.receiptDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.receiptDate.$lte = end;
      }
    }

    // ========== FINANCER FILTER ==========
    if (financerId) {
      // First get all bookings with this financer
      const bookingsWithFinancer = await Booking.find({
        'payment.financer': new mongoose.Types.ObjectId(financerId)
      }).select('_id').lean();
      
      const bookingIds = bookingsWithFinancer.map(b => b._id);
      filter.booking = { $in: bookingIds };
      console.log(`✅ Filtering by financer: ${financerId}, found ${bookingIds.length} bookings`);
    }

    // ========== FILTER FOR FINANCE DISBURSEMENTS WITH GC AMOUNT ==========
    // We're looking for ledger entries where paymentMode is 'Finance Disbursement' AND gcAmount > 0
    filter.paymentMode = 'Finance Disbursement';
    filter.gcAmount = { $gt: 0 };
    filter.approvalStatus = 'Approved';
    filter.isDebit = false; // Only credit entries (receipts)

    console.log('GC Report Filter:', JSON.stringify(filter, null, 2));

    // ========== FETCH LEDGER ENTRIES WITH GC AMOUNTS ==========
    const ledgerEntries = await Ledger.find(filter)
      .populate({
        path: 'booking',
        select: 'bookingNumber customerDetails model payment branch',
        populate: [
          {
            path: 'model',
            select: 'model_name model_type' // ADDED: model_type
          },
          {
            path: 'payment.financer',
            select: 'name'
          },
          {
            path: 'branch',
            select: 'name'
          }
        ]
      })
      .populate({
        path: 'receivedBy',
        select: 'name email'
      })
      .sort({ receiptDate: -1 })
      .lean();

    console.log(`Found ${ledgerEntries.length} ledger entries with GC amounts`);

    // ========== APPLY MODEL TYPE FILTER IF PROVIDED ==========
    let filteredLedgerEntries = ledgerEntries;
    
    if (modelType) {
      console.log(`Applying model type filter: ${modelType}`);
      
      filteredLedgerEntries = ledgerEntries.filter(entry => {
        const entryModelType = entry.booking?.model?.model_type || '';
        return entryModelType.toUpperCase() === modelType.toUpperCase();
      });
      
      console.log(`Filtered from ${ledgerEntries.length} to ${filteredLedgerEntries.length} entries for model type: ${modelType}`);
    }

    if (filteredLedgerEntries.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No GC payments found for the specified criteria',
        availableBranches: availableBranches,
        userAccessInfo: {
          hasAllBranchesAccess: hasAllBranchesAccess,
          branchAccess: branchAccess,
          accessibleBranchesCount: user.accessibleBranches?.length || 0
        }
      });
    }

    // ========== GENERATE EXCEL REPORT ==========
    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      
      // Create worksheet name
      let worksheetName = 'GC Report';
      if (filter.branch && typeof filter.branch === 'object' && !filter.branch.$in) {
        const firstEntry = filteredLedgerEntries[0];
        if (firstEntry?.booking?.branch?.name) {
          worksheetName = `${firstEntry.booking.branch.name} GC Report`;
        }
      } else if (hasAllBranchesAccess && (!branchId || branchId === 'all')) {
        worksheetName = 'All Branches GC Report';
      }
      
      const worksheet = workbook.addWorksheet(worksheetName);

      // Define headers
      const headers = [
        'S.No',
        'Receipt Date',
        'Booking Number',
        'Branch Name',
        'Customer Name',
        'Model',
        'Model Type', // ADDED: Model Type column
        'Financier Name',
        'Total Amount Paid',
        'GC Amount',
        'GC Amount Received',
        'Receipt Number',
        'Transaction Reference',
        'Received By'
      ];

      // Set worksheet columns
      const columns = headers.map((header, index) => {
        let width = 20;
        
        if (header === 'S.No') width = 8;
        else if (header === 'Receipt Date') width = 15;
        else if (header === 'Booking Number') width = 18;
        else if (header === 'Branch Name') width = 20;
        else if (header === 'Customer Name') width = 25;
        else if (header === 'Model') width = 20;
        else if (header === 'Model Type') width = 15; // ADDED: Model Type width
        else if (header === 'Financier Name') width = 25;
        else if (header === 'Total Amount Paid' || header === 'GC Amount' || header === 'GC Amount Received') {
          width = 18;
        } else if (header === 'Receipt Number') width = 20;
        else if (header === 'Transaction Reference') width = 25;
        else if (header === 'Received By') width = 20;

        return {
          header: header,
          key: `col_${index}`,
          width: width,
          style: header.includes('Amount') ? { numFmt: '#,##0.00' } : {}
        };
      });

      worksheet.columns = columns;

      // Add data rows
      filteredLedgerEntries.forEach((entry, index) => {
        const rowData = {};
        
        // S.No
        rowData['col_0'] = index + 1;
        
        // Receipt Date
        rowData['col_1'] = entry.receiptDate ? moment(entry.receiptDate).format('DD/MM/YYYY') : '';
        
        // Booking Number
        rowData['col_2'] = entry.booking?.bookingNumber || '';
        
        // Branch Name
        rowData['col_3'] = entry.booking?.branch?.name || '';
        
        // Customer Name
        rowData['col_4'] = entry.booking?.customerDetails?.name || '';
        
        // Model
        rowData['col_5'] = entry.booking?.model?.model_name || '';
        
        // Model Type (ADDED)
        rowData['col_6'] = entry.booking?.model?.model_type || '';
        
        // Financier Name
        let financierName = '';
        if (entry.booking?.payment?.type === 'FINANCE' && entry.booking?.payment?.financer) {
          financierName = entry.booking.payment.financer.name || '';
        }
        rowData['col_7'] = financierName;
        
        // Total Amount Paid (Gross Amount)
        rowData['col_8'] = entry.amount || 0;
        
        // GC Amount (from ledger entry)
        rowData['col_9'] = entry.gcAmount || 0;
        
        // GC Amount Received (this is the GC amount itself - what was actually received as GC)
        rowData['col_10'] = entry.gcAmount || 0;
        
        // Receipt Number
        rowData['col_11'] = entry.receiptNumber || '';
        
        // Transaction Reference
        rowData['col_12'] = entry.transactionReference || '';
        
        // Received By
        rowData['col_13'] = entry.receivedBy?.name || '';

        worksheet.addRow(rowData);
      });

      // Style the header row
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { 
          bold: true, 
          color: { argb: 'FFFFFFFF' },
          size: 11
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2E75B5' }
        };
        cell.alignment = { 
          vertical: 'middle', 
          horizontal: 'center',
          wrapText: true
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      });

      // Format all amount columns
      for (let i = 1; i <= filteredLedgerEntries.length; i++) {
        const row = worksheet.getRow(i + 1);
        
        // Format amount columns (columns 8, 9, 10 - zero-based)
        [8, 9, 10].forEach(colIndex => {
          const cell = row.getCell(colIndex + 1);
          if (typeof cell.value === 'number') {
            cell.numFmt = '#,##0.00';
            cell.alignment = { horizontal: 'right' };
          }
        });
      }

      // Add totals row
      const totalsRow = worksheet.addRow({});
      
      // Calculate totals
      const totalAmount = filteredLedgerEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
      const totalGCAmount = filteredLedgerEntries.reduce((sum, entry) => sum + (entry.gcAmount || 0), 0);
      const totalGCReceived = totalGCAmount; // GC Received is same as GC Amount
      
      // Set totals
      totalsRow.getCell(9).value = totalAmount; // Total Amount Paid (column 9)
      totalsRow.getCell(10).value = totalGCAmount; // GC Amount (column 10)
      totalsRow.getCell(11).value = totalGCReceived; // GC Amount Received (column 11)
      
      // Style totals row
      totalsRow.eachCell((cell) => {
        cell.font = { bold: true };
        if (cell.col >= 9 && cell.col <= 11) {
          cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: 'right' };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2F2F2' }
          };
        }
      });
      
      // Add label to totals row
      totalsRow.getCell(1).value = 'TOTALS:';
      totalsRow.getCell(1).alignment = { horizontal: 'right' };
      totalsRow.getCell(1).font = { bold: true };

      // Auto-filter for all columns
      if (worksheet.rowCount > 1) {
        const lastColLetter = String.fromCharCode(64 + worksheet.columnCount);
        worksheet.autoFilter = {
          from: 'A1',
          to: `${lastColLetter}${worksheet.rowCount}`
        };
      }

      // Freeze header row
      worksheet.views = [
        { state: 'frozen', ySplit: 1 }
      ];

      // ========== SUMMARY SHEET ==========
      const summarySheet = workbook.addWorksheet('Summary');

      // Summary Title
      summarySheet.mergeCells('A1:D1');
      const titleCell = summarySheet.getCell('A1');
      titleCell.value = 'GC REPORT SUMMARY';
      titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F81BD' }
      };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Report Info
      const infoRows = [
        ['Report Generated:', moment().format('DD MMM YYYY HH:mm:ss')],
        ['Total GC Entries:', filteredLedgerEntries.length],
        ['Date Range:', startDate && endDate ? `${moment(startDate).format('DD/MM/YYYY')} to ${moment(endDate).format('DD/MM/YYYY')}` : 'All Dates'],
        ['Branch Filter:', branchId || (hasAllBranchesAccess ? 'All Branches' : 'User Accessible Branches')],
        ['Model Type Filter:', modelType || 'All'], // ADDED: Model type filter info
        ['Financier Filter:', financerId ? 'Specific Financer' : 'All Financiers']
      ];

      infoRows.forEach(([label, value], index) => {
        const rowNum = index + 3;
        summarySheet.getCell(`A${rowNum}`).value = label;
        summarySheet.getCell(`B${rowNum}`).value = value;
        summarySheet.getCell(`B${rowNum}`).font = { bold: true };
      });

      // ========== FINANCIAL SUMMARY ==========
      const financialStartRow = infoRows.length + 5;

      // Financial Summary Title
      summarySheet.mergeCells(`A${financialStartRow}:C${financialStartRow}`);
      const financialTitleCell = summarySheet.getCell(`A${financialStartRow}`);
      financialTitleCell.value = 'FINANCIAL SUMMARY';
      financialTitleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
      financialTitleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2E75B5' }
      };
      financialTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Financial Summary Headers
      const financialHeaders = ['Description', 'Amount', 'Percentage'];
      const financialHeaderRow = financialStartRow + 1;
      financialHeaders.forEach((header, colIndex) => {
        const cell = summarySheet.getCell(`${String.fromCharCode(65 + colIndex)}${financialHeaderRow}`);
        cell.value = header;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4F81BD' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Financial Summary Data
      const financialData = [
        ['Total Amount Paid', totalAmount],
        ['Total GC Amount', totalGCAmount],
        ['Total GC Amount Received', totalGCReceived],
        ['GC Percentage of Total', totalAmount > 0 ? `${((totalGCAmount / totalAmount) * 100).toFixed(2)}%` : '0%']
      ];

      financialData.forEach(([description, amount], index) => {
        const rowNum = financialHeaderRow + 1 + index;
        
        summarySheet.getCell(`A${rowNum}`).value = description;
        summarySheet.getCell(`B${rowNum}`).value = typeof amount === 'number' ? amount : amount;
        summarySheet.getCell(`C${rowNum}`).value = index === 3 ? amount : totalAmount > 0 ? `${((amount / totalAmount) * 100).toFixed(2)}%` : '0%';
        
        // Style
        [summarySheet.getCell(`A${rowNum}`), summarySheet.getCell(`B${rowNum}`), summarySheet.getCell(`C${rowNum}`)].forEach((cell, cellIndex) => {
          cell.alignment = { 
            horizontal: cellIndex === 0 ? 'left' : 'right',
            vertical: 'middle'
          };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          
          if (index % 2 === 0) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF2F2F2' }
            };
          }
          
          if (cellIndex === 1 && typeof amount === 'number') {
            cell.numFmt = '#,##0.00';
          }
        });
        
        // Bold for important rows
        if (index === 2 || index === 3) {
          summarySheet.getCell(`A${rowNum}`).font = { bold: true };
          summarySheet.getCell(`B${rowNum}`).font = { bold: true };
          summarySheet.getCell(`C${rowNum}`).font = { bold: true };
        }
      });

      // ========== BRANCH-WISE SUMMARY ==========
      const branchStartRow = financialHeaderRow + financialData.length + 3;

      // Branch Summary Title
      summarySheet.mergeCells(`A${branchStartRow}:C${branchStartRow}`);
      const branchTitleCell = summarySheet.getCell(`A${branchStartRow}`);
      branchTitleCell.value = 'BRANCH-WISE GC SUMMARY';
      branchTitleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
      branchTitleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2E75B5' }
      };
      branchTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Branch Summary Headers
      const branchHeaders = ['Branch Name', 'Total GC Received', 'Percentage of Total GC'];
      const branchHeaderRow = branchStartRow + 1;
      branchHeaders.forEach((header, colIndex) => {
        const cell = summarySheet.getCell(`${String.fromCharCode(65 + colIndex)}${branchHeaderRow}`);
        cell.value = header;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4F81BD' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Group by branch
      const branchSummary = filteredLedgerEntries.reduce((acc, entry) => {
        const branchName = entry.booking?.branch?.name || 'Unknown Branch';
        
        if (!acc[branchName]) {
          acc[branchName] = {
            totalGC: 0,
            count: 0
          };
        }
        
        acc[branchName].totalGC += entry.gcAmount || 0;
        acc[branchName].count++;
        return acc;
      }, {});

      // Add branch summary data
      Object.entries(branchSummary).forEach(([branchName, data], index) => {
        const rowNum = branchHeaderRow + 1 + index;
        
        const percentage = totalGCReceived > 0 ? `${((data.totalGC / totalGCReceived) * 100).toFixed(2)}%` : '0%';
        
        summarySheet.getCell(`A${rowNum}`).value = branchName;
        summarySheet.getCell(`B${rowNum}`).value = data.totalGC;
        summarySheet.getCell(`C${rowNum}`).value = percentage;
        
        // Style
        [summarySheet.getCell(`A${rowNum}`), summarySheet.getCell(`B${rowNum}`), summarySheet.getCell(`C${rowNum}`)].forEach((cell, cellIndex) => {
          cell.alignment = { 
            horizontal: cellIndex === 0 ? 'left' : 'right',
            vertical: 'middle'
          };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          
          if (index % 2 === 0) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF2F2F2' }
            };
          }
          
          if (cellIndex === 1) {
            cell.numFmt = '#,##0.00';
          }
        });
      });

      // ========== MODEL TYPE SUMMARY ==========
      const modelTypeStartRow = branchHeaderRow + Object.keys(branchSummary).length + 3;

      // Model Type Summary Title
      summarySheet.mergeCells(`A${modelTypeStartRow}:C${modelTypeStartRow}`);
      const modelTypeTitleCell = summarySheet.getCell(`A${modelTypeStartRow}`);
      modelTypeTitleCell.value = 'MODEL TYPE SUMMARY';
      modelTypeTitleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
      modelTypeTitleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2E75B5' }
      };
      modelTypeTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Model Type Summary Headers
      const modelTypeHeaders = ['Model Type', 'Total GC Received', 'Percentage of Total GC'];
      const modelTypeHeaderRow = modelTypeStartRow + 1;
      modelTypeHeaders.forEach((header, colIndex) => {
        const cell = summarySheet.getCell(`${String.fromCharCode(65 + colIndex)}${modelTypeHeaderRow}`);
        cell.value = header;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4F81BD' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Group by model type
      const modelTypeSummary = filteredLedgerEntries.reduce((acc, entry) => {
        const modelTypeValue = entry.booking?.model?.model_type || 'UNKNOWN';
        
        if (!acc[modelTypeValue]) {
          acc[modelTypeValue] = {
            totalGC: 0,
            count: 0
          };
        }
        
        acc[modelTypeValue].totalGC += entry.gcAmount || 0;
        acc[modelTypeValue].count++;
        return acc;
      }, {});

      // Add model type summary data
      Object.entries(modelTypeSummary).forEach(([modelType, data], index) => {
        const rowNum = modelTypeHeaderRow + 1 + index;
        
        const percentage = totalGCReceived > 0 ? `${((data.totalGC / totalGCReceived) * 100).toFixed(2)}%` : '0%';
        
        summarySheet.getCell(`A${rowNum}`).value = modelType;
        summarySheet.getCell(`B${rowNum}`).value = data.totalGC;
        summarySheet.getCell(`C${rowNum}`).value = percentage;
        
        // Style
        [summarySheet.getCell(`A${rowNum}`), summarySheet.getCell(`B${rowNum}`), summarySheet.getCell(`C${rowNum}`)].forEach((cell, cellIndex) => {
          cell.alignment = { 
            horizontal: cellIndex === 0 ? 'left' : 'right',
            vertical: 'middle'
          };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          
          if (index % 2 === 0) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF2F2F2' }
            };
          }
          
          if (cellIndex === 1) {
            cell.numFmt = '#,##0.00';
          }
        });
      });

      // Set response headers for file download
      const fileName = `gc_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
      
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`
      );

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } else {
      // ========== RETURN JSON FORMAT ==========
      const formattedEntries = filteredLedgerEntries.map((entry, index) => {
        let financierName = '';
        if (entry.booking?.payment?.type === 'FINANCE' && entry.booking?.payment?.financer) {
          financierName = entry.booking.payment.financer.name || '';
        }

        return {
          sno: index + 1,
          receiptDate: entry.receiptDate,
          formattedDate: entry.receiptDate ? moment(entry.receiptDate).format('DD/MM/YYYY') : '',
          bookingNumber: entry.booking?.bookingNumber || '',
          branchName: entry.booking?.branch?.name || '',
          customerName: entry.booking?.customerDetails?.name || '',
          model: entry.booking?.model?.model_name || '',
          modelType: entry.booking?.model?.model_type || '', // ADDED: Model Type
          financierName: financierName,
          totalAmount: entry.amount || 0,
          gcAmount: entry.gcAmount || 0,
          gcAmountReceived: entry.gcAmount || 0,
          receiptNumber: entry.receiptNumber || '',
          transactionReference: entry.transactionReference || '',
          receivedBy: entry.receivedBy?.name || '',
          bookingId: entry.booking?._id,
          financierId: entry.booking?.payment?.financer?._id
        };
      });

      // Calculate overall totals
      const totals = {
        totalAmount: filteredLedgerEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0),
        totalGCAmount: filteredLedgerEntries.reduce((sum, entry) => sum + (entry.gcAmount || 0), 0),
        totalGCReceived: filteredLedgerEntries.reduce((sum, entry) => sum + (entry.gcAmount || 0), 0),
        gcPercentage: 0
      };
      
      totals.gcPercentage = totals.totalAmount > 0 ? (totals.totalGCAmount / totals.totalAmount) * 100 : 0;

      // Branch-wise summary
      const branchSummary = filteredLedgerEntries.reduce((acc, entry) => {
        const branchName = entry.booking?.branch?.name || 'Unknown Branch';
        
        if (!acc[branchName]) {
          acc[branchName] = {
            branchName: branchName,
            totalGC: 0,
            totalGCReceived: 0,
            count: 0,
            totalAmount: 0
          };
        }
        
        acc[branchName].totalGC += entry.gcAmount || 0;
        acc[branchName].totalGCReceived += entry.gcAmount || 0;
        acc[branchName].totalAmount += entry.amount || 0;
        acc[branchName].count++;
        return acc;
      }, {});

      // Convert to array and calculate percentages
      const branchSummaryArray = Object.values(branchSummary).map(item => ({
        ...item,
        percentageOfTotalGC: totals.totalGCReceived > 0 ? (item.totalGC / totals.totalGCReceived) * 100 : 0,
        percentageOfTotalAmount: totals.totalAmount > 0 ? (item.totalAmount / totals.totalAmount) * 100 : 0
      }));

      // Model Type wise summary
      const modelTypeSummary = filteredLedgerEntries.reduce((acc, entry) => {
        const modelType = entry.booking?.model?.model_type || 'UNKNOWN';
        
        if (!acc[modelType]) {
          acc[modelType] = {
            modelType: modelType,
            totalGC: 0,
            totalGCReceived: 0,
            count: 0,
            totalAmount: 0
          };
        }
        
        acc[modelType].totalGC += entry.gcAmount || 0;
        acc[modelType].totalGCReceived += entry.gcAmount || 0;
        acc[modelType].totalAmount += entry.amount || 0;
        acc[modelType].count++;
        return acc;
      }, {});

      // Convert to array
      const modelTypeSummaryArray = Object.values(modelTypeSummary).map(item => ({
        ...item,
        percentageOfTotalGC: totals.totalGCReceived > 0 ? (item.totalGC / totals.totalGCReceived) * 100 : 0,
        percentageOfTotalAmount: totals.totalAmount > 0 ? (item.totalAmount / totals.totalAmount) * 100 : 0
      }));

      // Financier-wise summary
      const financerSummary = filteredLedgerEntries.reduce((acc, entry) => {
        let financierName = 'Unknown';
        let financierId = null;
        
        if (entry.booking?.payment?.type === 'FINANCE' && entry.booking?.payment?.financer) {
          financierName = entry.booking.payment.financer.name || 'Unknown';
          financierId = entry.booking.payment.financer._id;
        }
        
        const key = financierId ? `${financierName}_${financierId}` : financierName;
        
        if (!acc[key]) {
          acc[key] = {
            financierName: financierName,
            financierId: financierId,
            totalGC: 0,
            totalGCReceived: 0,
            count: 0,
            totalAmount: 0
          };
        }
        
        acc[key].totalGC += entry.gcAmount || 0;
        acc[key].totalGCReceived += entry.gcAmount || 0;
        acc[key].totalAmount += entry.amount || 0;
        acc[key].count++;
        return acc;
      }, {});

      // Convert to array
      const financerSummaryArray = Object.values(financerSummary).map(item => ({
        ...item,
        percentageOfTotalGC: totals.totalGCReceived > 0 ? (item.totalGC / totals.totalGCReceived) * 100 : 0,
        percentageOfTotalAmount: totals.totalAmount > 0 ? (item.totalAmount / totals.totalAmount) * 100 : 0
      }));

      res.status(200).json({
        success: true,
        count: filteredLedgerEntries.length,
        totals: totals,
        data: formattedEntries,
        summary: {
          byBranch: branchSummaryArray,
          byModelType: modelTypeSummaryArray, // ADDED: Model Type summary
          byFinancer: financerSummaryArray,
          dateRange: {
            start: startDate,
            end: endDate,
            formatted: startDate && endDate ? 
              `${moment(startDate).format('DD/MM/YYYY')} to ${moment(endDate).format('DD/MM/YYYY')}` : 
              'All Dates'
          }
        },
        // ========== DROPDOWN DATA FOR FRONTEND ==========
        availableBranches: availableBranches,
        userAccessInfo: {
          hasAllBranchesAccess: hasAllBranchesAccess,
          branchAccess: branchAccess,
          accessibleBranchesCount: user.accessibleBranches?.length || 0,
          userBranch: user.branch ? {
            _id: user.branch._id,
            name: user.branch.name
          } : null
        },
        filters: {
          branchId: branchId,
          startDate: startDate,
          endDate: endDate,
          financerId: financerId,
          modelType: modelType // ADDED: Model type filter
        }
      });
    }

  } catch (error) {
    console.error('Error generating GC report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating GC report',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};


exports.generateFieldBasedOutstandingReport = async (req, res) => {
  try {
    const { 
      branchId, 
      status,
      minBalance,
      maxBalance,
      modelType,
      format = 'excel' 
    } = req.query;

    const filter = {};
    const userId = req.user.id;
    
    const user = await User.findById(userId)
      .select('-otp -otpExpires -emailOtp -emailOtpExpires -password')
      .populate({ path: 'roles', select: 'name isSuperAdmin permissionsCount' })
      .populate('branch')
      .populate({
        path: 'accessibleBranches',
        model: 'Branch',
        select: '_id name address city state pincode phone email is_active logo1'
      })
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`🏢 User's branch: ${user.branch?.name || 'None'}`);
    console.log(`🔑 Branch Access Type: ${user.branchAccess || 'OWN'}`);
    console.log(`🏢 Accessible Branches: ${user.accessibleBranches?.length || 0}`);
    
    const userRoles = user.roles || [];
    const isActualSuperAdmin = userRoles.some(role => role.name === "SUPERADMIN") || false;
    const isSuperAdminFlag = userRoles.some(role => role.isSuperAdmin === true) || false;
    const branchAccess = user.branchAccess || 'OWN';
    
    let hasAllBranchesAccess = false;
    if (isActualSuperAdmin) {
      hasAllBranchesAccess = true;
      console.log('User is SUPERADMIN - has access to all branches');
    } else if (branchAccess === 'ALL') {
      hasAllBranchesAccess = true;
      console.log('User has ALL branch access permission');
    } else if (isSuperAdminFlag) {
      hasAllBranchesAccess = true;
      console.log('User is ADMIN/GM - has access to all branches');
    } else {
      console.log('User has restricted branch access');
    }

    // ========== GET AVAILABLE BRANCHES FOR DROPDOWN ==========
    let availableBranches = [];
    
    if (hasAllBranchesAccess) {
      availableBranches = await Branch.find({ is_active: true })
        .select('_id name address city')
        .sort({ name: 1 })
        .lean();
      console.log(`✅ Fetched ${availableBranches.length} total branches for dropdown`);
    } else if (branchAccess === 'ASSIGNED' && user.accessibleBranches) {
      availableBranches = user.accessibleBranches.map(branch => ({
        _id: branch._id,
        name: branch.name,
        address: branch.address,
        city: branch.city
      })).sort((a, b) => a.name.localeCompare(b.name));
      console.log(`✅ Using ${availableBranches.length} assigned branches for dropdown`);
    } else if (user.branch) {
      availableBranches = [{
        _id: user.branch._id,
        name: user.branch.name,
        address: user.branch.address,
        city: user.branch.city
      }];
      console.log('✅ Using only own branch for dropdown');
    }
    
    if (availableBranches.length > 1) {
      availableBranches.unshift({ _id: 'all', name: 'All Branches', address: '', city: '' });
      console.log('✅ Added "All Branches" option to dropdown');
    }

    // ========== APPLY BRANCH FILTER ==========
    if (!hasAllBranchesAccess) {
      if (branchAccess === 'ASSIGNED' && user.accessibleBranches && user.accessibleBranches.length > 0) {
        const accessibleBranchIds = user.accessibleBranches.map(branch => branch._id);
        console.log(`User has access to ${accessibleBranchIds.length} assigned branches`);
        
        if (branchId) {
          if (branchId === 'all') {
            filter.branch = { $in: accessibleBranchIds };
            console.log('✅ Showing all accessible branches');
          } else {
            const requestedBranchId = new mongoose.Types.ObjectId(branchId);
            const hasAccess = accessibleBranchIds.some(id => 
              id.toString() === requestedBranchId.toString()
            );
            if (!hasAccess) {
              return res.status(403).json({ success: false, message: 'You do not have access to this branch' });
            }
            filter.branch = requestedBranchId;
            console.log(`✅ Filtering by branch: ${branchId}`);
          }
        } else {
          filter.branch = { $in: accessibleBranchIds };
          console.log('✅ Showing all accessible branches (no branch filter)');
        }
      } else {
        console.log('User has only OWN branch access');
        if (user.branch && user.branch._id) {
          filter.branch = user.branch._id;
          console.log(`✅ Filtering by own branch: ${user.branch._id}`);
        } else {
          return res.status(403).json({ success: false, message: 'You do not have access to any branch' });
        }
      }
    } else {
      if (branchId) {
        if (branchId === 'all') {
          console.log('✅ Showing ALL branches (SUPERADMIN/ADMIN with "All" selected)');
        } else {
          filter.branch = new mongoose.Types.ObjectId(branchId);
          console.log(`✅ Filtering by branch: ${branchId}`);
        }
      } else {
        console.log('✅ Showing ALL branches (no branch filter)');
      }
    }

    // ========== STATUS FILTER ==========
    if (status) {
      filter.status = status;
    } else {
      filter.status = { $nin: ['CANCELLED', 'COMPLETED', 'CANCELLED_APPROVE', 'CANCELLED_REJECTED'] };
    }

    console.log('Outstanding Report Filter:', JSON.stringify(filter, null, 2));

    // ========== FETCH BOOKINGS ==========
    const bookingsQuery = Booking.find(filter)
      .populate('model', 'model_name type')
      .populate('color', 'name')
      .populate('branch', 'name')
      .populate('salesExecutive', 'name')
      .populate({ path: 'payment.financer', select: 'name' })
      .populate({
        path: 'vehicleRef',
        select: 'chassisNumber allocationHistory inwardDate', // ✅ Added inwardDate
        model: 'Vehicle'
      })
      .sort({ createdAt: -1 });

    // ========== APPLY MODEL TYPE FILTER IF PROVIDED ==========
    if (modelType) {
      console.log(`Applying model type filter: ${modelType}`);
      const models = await mongoose.model('Model').find({ 
        type: modelType.toUpperCase() 
      }).select('_id').lean();
      
      const modelIds = models.map(model => model._id);
      
      if (modelIds.length > 0) {
        bookingsQuery.where('model').in(modelIds);
        console.log(`Filtering by ${modelIds.length} ${modelType} models`);
      } else {
        console.log(`No ${modelType} models found`);
        if (format === 'excel') {
          const workbook = new ExcelJS.Workbook();
          workbook.addWorksheet('Outstanding Report');
          const fileName = `outstanding_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
          await workbook.xlsx.write(res);
          res.end();
          return;
        } else {
          return res.status(200).json({
            success: true,
            count: 0,
            totals: { totalDealAmount: 0, totalReceivedAmount: 0, totalPendingAmount: 0, totalBalanceAmount: 0 },
            data: [],
            availableBranches,
            userAccessInfo: {
              hasAllBranchesAccess,
              branchAccess,
              accessibleBranchesCount: user.accessibleBranches?.length || 0,
              userBranch: user.branch ? { _id: user.branch._id, name: user.branch.name } : null
            },
            filters: { branchId, status, minBalance, maxBalance, modelType }
          });
        }
      }
    }
    
    const bookings = await bookingsQuery.lean();
    console.log(`Found ${bookings.length} bookings`);

    const bookingIds = bookings.map(b => b._id);

    // ========== FETCH ALL LEDGER ENTRIES ==========
    const allLedgerEntries = await Ledger.find({ booking: { $in: bookingIds } })
      .select('amount paymentMode type approvalStatus isDebit booking')
      .lean();

    console.log(`Found ${allLedgerEntries.length} total ledger entries for these bookings`);

    const ledgerByBooking = {};
    allLedgerEntries.forEach(entry => {
      const bookingId = entry.booking.toString();
      if (!ledgerByBooking[bookingId]) ledgerByBooking[bookingId] = [];
      ledgerByBooking[bookingId].push(entry);
    });

    // ========== PROCESS EACH BOOKING ==========
    const processedBookings = bookings.map(booking => {
      const bookingLedgerEntries = ledgerByBooking[booking._id.toString()] || [];
      console.log(`Booking ${booking.bookingNumber}: ${bookingLedgerEntries.length} ledger entries found`);
      
      const approvedEntries = bookingLedgerEntries.filter(entry => 
        entry.approvalStatus === 'Approved' && !entry.isDebit
      );
      const pendingEntries = bookingLedgerEntries.filter(entry => 
        entry.approvalStatus === 'Pending' && !entry.isDebit
      );
      
      if (pendingEntries.length > 0) {
        console.log(`  Found ${pendingEntries.length} pending entries for booking ${booking.bookingNumber}`);
      }
      
      const totalApprovedAmount = approvedEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
      const totalPendingForApproval = pendingEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
      const dealAmount = booking.discountedAmount || 0;
      const balanceAmount = dealAmount - totalApprovedAmount;
      const bookingType = booking.payment?.type || '';
      
      let financierName = '';
      if (booking.payment?.type === 'FINANCE' && booking.payment?.financer) {
        financierName = booking.payment.financer.name || '';
      }
      
      // ========== VEHICLE ALLOCATION AGE (from allocation date) ==========
      let allocatedChassisNumber = '';
      let vehicleAge = '';          // Age from allocation date
      let vehicleInwardAge = '';    // ✅ NEW: Age from inward/purchase date
      let allocationDate = null;
      let ageInDaysFromAllocation = 0;
      
      if (booking.vehicleRef) {
        allocatedChassisNumber = booking.vehicleRef.chassisNumber || '';
        
        // ✅ Calculate vehicle inward age from Vehicle model's inwardDate
        if (booking.vehicleRef.inwardDate) {
          const inwardDateObj = new Date(booking.vehicleRef.inwardDate);
          const currentDate = new Date();
          inwardDateObj.setHours(0, 0, 0, 0);
          currentDate.setHours(0, 0, 0, 0);
          const inwardAgeDays = Math.floor((currentDate - inwardDateObj) / (1000 * 60 * 60 * 24));
          vehicleInwardAge = `${inwardAgeDays}`;
          console.log(`✅ Booking ${booking.bookingNumber}: Inward Age = ${vehicleInwardAge} days (inward on ${moment(booking.vehicleRef.inwardDate).format('DD/MM/YYYY')})`);
        }
        
        // Calculate allocation age from allocationHistory
        if (booking.vehicleRef.allocationHistory && booking.vehicleRef.allocationHistory.length > 0) {
          const allocationEntries = booking.vehicleRef.allocationHistory.filter(
            history => history.bookingId && 
                      history.bookingId.toString() === booking._id.toString() &&
                      history.status === 'ALLOCATED'
          );
          
          if (allocationEntries.length > 0) {
            allocationEntries.sort((a, b) => new Date(b.allocatedAt) - new Date(a.allocatedAt));
            const latestAllocation = allocationEntries[0];
            allocationDate = latestAllocation.allocatedAt;
            
            if (allocationDate) {
              const allocationDateObj = new Date(allocationDate);
              const currentDate = new Date();
              allocationDateObj.setHours(0, 0, 0, 0);
              currentDate.setHours(0, 0, 0, 0);
              ageInDaysFromAllocation = Math.floor((currentDate - allocationDateObj) / (1000 * 60 * 60 * 24));
              
              // ✅ Always show number (0 instead of 'Today')
              vehicleAge = `${ageInDaysFromAllocation}`;
              
              console.log(`✅ Booking ${booking.bookingNumber}: Age from allocation = ${vehicleAge} days (allocated on ${moment(allocationDate).format('DD/MM/YYYY')})`);
            }
          } else {
            console.log(`⚠️ Booking ${booking.bookingNumber}: No allocation entry found in vehicle history for this booking`);
          }
        }
        
        // Fallback if no allocation date found in history
        if (!allocationDate) {
          const fallbackDate = booking.approvedAt || booking.updatedAt || booking.createdAt;
          if (fallbackDate) {
            allocationDate = fallbackDate;
            const fallbackDateObj = new Date(fallbackDate);
            const currentDate = new Date();
            fallbackDateObj.setHours(0, 0, 0, 0);
            currentDate.setHours(0, 0, 0, 0);
            ageInDaysFromAllocation = Math.floor((currentDate - fallbackDateObj) / (1000 * 60 * 60 * 24));
            
            // ✅ Always show number (0 instead of 'Today')
            vehicleAge = `${ageInDaysFromAllocation}`;
            
            console.log(`⚠️ Booking ${booking.bookingNumber}: Using fallback date for age: ${moment(allocationDate).format('DD/MM/YYYY')} -> ${vehicleAge}`);
          }
        }
      }
      
      let salesExecutiveName = '';
      if (booking.salesExecutive) {
        salesExecutiveName = booking.salesExecutive.name || '';
      }
      
      return {
        ...booking,
        bookingType,
        financierName,
        totalApprovedAmount,
        totalPendingForApproval,
        dealAmount,
        balanceAmount,
        approvedEntriesCount: approvedEntries.length,
        pendingEntriesCount: pendingEntries.length,
        allocatedChassisNumber,
        vehicleAge,           // Age from allocation date (numeric string)
        vehicleInwardAge,     // ✅ NEW: Age from inward date (numeric string)
        ageInDays: ageInDaysFromAllocation,
        allocationDate,
        salesExecutiveName,
        ledgerEntriesCount: bookingLedgerEntries.length,
        hasPendingEntries: pendingEntries.length > 0
      };
    });

    // Filter bookings with outstanding balance OR pending for approval
    const outstandingBookings = processedBookings.filter(booking => 
      booking.balanceAmount > 0 || booking.totalPendingForApproval > 0
    );

    // Apply balance range filter if specified
    let filteredBookings = outstandingBookings;
    if (minBalance || maxBalance) {
      filteredBookings = outstandingBookings.filter(booking => {
        if (minBalance && booking.balanceAmount < parseFloat(minBalance)) return false;
        if (maxBalance && booking.balanceAmount > parseFloat(maxBalance)) return false;
        return true;
      });
    }

    console.log(`Found ${filteredBookings.length} bookings with outstanding or pending amounts`);

    if (filteredBookings.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No bookings with outstanding or pending amounts found',
        availableBranches,
        userAccessInfo: { hasAllBranchesAccess, branchAccess, accessibleBranchesCount: user.accessibleBranches?.length || 0 }
      });
    }

    // ========== GENERATE EXCEL REPORT ==========
    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      
      let worksheetName = 'Outstanding Report';
      if (filter.branch && typeof filter.branch === 'object' && !filter.branch.$in) {
        const branch = filteredBookings[0]?.branch;
        if (branch?.name) worksheetName = `${branch.name} Outstanding Report`;
      } else if (hasAllBranchesAccess && (!branchId || branchId === 'all')) {
        worksheetName = 'All Branches Outstanding Report';
      }
      
      const worksheet = workbook.addWorksheet(worksheetName);

      // ✅ Updated headers — added "Vehicle Age (Inward)" column
      const headers = [
        'Booking Number',
        'Customer Name',
        'Mobile 1',
        'Mobile 2',
        'Model',
        'Model Type',
        'Color',
        'Booking Type',
        'Financier Name',
        'Sales Executive',
        'Allocated Chassis Number',
        'Age (Allocation)',       // ✅ Renamed for clarity
        'Age (Inward)',           // ✅ NEW column
        'Allocated Date',
        'Deal Amount',
        'Verified Amount',
        'Pending Verification Amount',
        'Balance Amount',
        'Booking Status',
        'Branch Name',
        'Booking Date'
      ];

      const columns = headers.map((header, index) => {
        let width = 20;
        if (header === 'Booking Number') width = 18;
        else if (header === 'Customer Name') width = 25;
        else if (header === 'Mobile 1' || header === 'Mobile 2') width = 15;
        else if (header === 'Model') width = 20;
        else if (header === 'Model Type') width = 12;
        else if (header === 'Color') width = 15;
        else if (header === 'Booking Type') width = 15;
        else if (header === 'Financier Name') width = 25;
        else if (header === 'Sales Executive') width = 20;
        else if (header === 'Allocated Chassis Number') width = 22;
        else if (header === 'Age (Allocation)') width = 16;
        else if (header === 'Age (Inward)') width = 14;
        else if (header === 'Allocated Date') width = 15;
        else if (['Deal Amount', 'Verified Amount', 'Pending Verification Amount', 'Balance Amount'].includes(header)) width = 18;
        else if (header === 'Booking Status') width = 15;
        else if (header === 'Branch Name') width = 25;
        else if (header === 'Booking Date') width = 15;

        return {
          header,
          key: `col_${index}`,
          width,
          style: header.includes('Amount') ? { numFmt: '#,##0.00' } : {}
        };
      });

      worksheet.columns = columns;

      // ✅ Updated row data mapping with new column
      filteredBookings.forEach((booking) => {
        const rowData = {};
        rowData['col_0']  = booking.bookingNumber || '';
        rowData['col_1']  = booking.customerDetails?.name || '';
        rowData['col_2']  = booking.customerDetails?.mobile1 || '';
        rowData['col_3']  = booking.customerDetails?.mobile2 || '';
        rowData['col_4']  = booking.model?.model_name || '';
        rowData['col_5']  = booking.model?.type || '';
        rowData['col_6']  = booking.color?.name || '';
        rowData['col_7']  = booking.bookingType || '';
        rowData['col_8']  = booking.financierName || '';
        rowData['col_9']  = booking.salesExecutiveName || '';
        rowData['col_10'] = booking.allocatedChassisNumber || '';
        rowData['col_11'] = booking.vehicleAge || '';           // Age from allocation
        rowData['col_12'] = booking.vehicleInwardAge || '';     // ✅ Age from inward date
        rowData['col_13'] = booking.allocationDate ? moment(booking.allocationDate).format('DD/MM/YYYY') : '';
        rowData['col_14'] = booking.dealAmount;
        rowData['col_15'] = booking.totalApprovedAmount;
        rowData['col_16'] = booking.totalPendingForApproval;
        rowData['col_17'] = booking.balanceAmount;
        rowData['col_18'] = booking.status || '';
        rowData['col_19'] = booking.branch?.name || '';
        rowData['col_20'] = booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : '';
        worksheet.addRow(rowData);
      });

      // Style header row
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B5' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
          top: { style: 'thin' }, left: { style: 'thin' },
          bottom: { style: 'thin' }, right: { style: 'thin' }
        };
      });

      // Format amount columns (now shifted by 1 due to new column)
      for (let i = 1; i <= filteredBookings.length; i++) {
        const row = worksheet.getRow(i + 1);
        
        // ✅ Amount columns: Deal(14), Verified(15), Pending(16), Balance(17) → col index 14-17
        [14, 15, 16, 17].forEach(colIndex => {
          const cell = row.getCell(colIndex + 1);
          if (typeof cell.value === 'number') {
            cell.numFmt = '#,##0.00';
            cell.alignment = { horizontal: 'right' };
          }
        });
        
        // ✅ Age columns center-aligned: col_11, col_12
        [11, 12].forEach(colIndex => {
          const cell = row.getCell(colIndex + 1);
          if (cell.value !== '' && cell.value !== null) {
            cell.alignment = { horizontal: 'center' };
          }
        });

        // Date column center-aligned: col_13 (Allocated Date), col_20 (Booking Date)
        [13, 20].forEach(colIndex => {
          const cell = row.getCell(colIndex + 1);
          if (cell.value) cell.alignment = { horizontal: 'center' };
        });
      }

      // Add totals row
      const totalsRow = worksheet.addRow({});
      const totalDealAmount  = filteredBookings.reduce((sum, b) => sum + b.dealAmount, 0);
      const totalReceived    = filteredBookings.reduce((sum, b) => sum + b.totalApprovedAmount, 0);
      const totalPending     = filteredBookings.reduce((sum, b) => sum + b.totalPendingForApproval, 0);
      const totalBalance     = filteredBookings.reduce((sum, b) => sum + b.balanceAmount, 0);
      
      // ✅ Totals shifted by 1 column
      totalsRow.getCell(15).value = totalDealAmount;
      totalsRow.getCell(16).value = totalReceived;
      totalsRow.getCell(17).value = totalPending;
      totalsRow.getCell(18).value = totalBalance;
      
      totalsRow.eachCell((cell) => {
        cell.font = { bold: true };
        if (cell.col >= 15 && cell.col <= 18) {
          cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: 'right' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
        }
      });
      
      totalsRow.getCell(1).value = 'GRAND TOTALS:';
      totalsRow.getCell(1).alignment = { horizontal: 'right' };
      totalsRow.getCell(1).font = { bold: true };

      if (worksheet.rowCount > 1) {
        const lastColLetter = String.fromCharCode(64 + worksheet.columnCount);
        worksheet.autoFilter = { from: 'A1', to: `${lastColLetter}${worksheet.rowCount}` };
      }

      worksheet.views = [{ state: 'frozen', ySplit: 1 }];

      const fileName = `outstanding_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      await workbook.xlsx.write(res);
      res.end();

    } else {
      // ========== RETURN JSON FORMAT ==========
      const formattedBookings = filteredBookings.map(booking => ({
        bookingNumber: booking.bookingNumber,
        customerName: booking.customerDetails?.name || '',
        mobile1: booking.customerDetails?.mobile1 || '',
        mobile2: booking.customerDetails?.mobile2 || '',
        model: booking.model?.model_name || '',
        modelType: booking.model?.type || '',
        color: booking.color?.name || '',
        bookingType: booking.bookingType || '',
        financierName: booking.financierName || '',
        salesExecutiveName: booking.salesExecutiveName || '',
        allocatedChassisNumber: booking.allocatedChassisNumber || '',
        vehicleAge: booking.vehicleAge || '',               // Age from allocation date
        vehicleInwardAge: booking.vehicleInwardAge || '',   // ✅ NEW: Age from inward date
        ageInDays: booking.ageInDays || 0,
        allocationDate: booking.allocationDate ? moment(booking.allocationDate).format('DD/MM/YYYY') : '',
        allocationDateRaw: booking.allocationDate,
        dealAmount: booking.dealAmount,
        totalReceivedAmount: booking.totalApprovedAmount,
        totalPendingAmount: booking.totalPendingForApproval,
        balanceAmount: booking.balanceAmount,
        bookingStatus: booking.status || '',
        branchName: booking.branch?.name || '',
        branchId: booking.branch?._id || null,
        bookingDate: booking.createdAt,
        formattedBookingDate: booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : '',
        bookingId: booking._id,
        customerDetails: {
          aadharNumber: booking.customerDetails?.aadharNumber || '',
          panNo: booking.customerDetails?.panNo || '',
          address: booking.customerDetails?.address || ''
        },
        paymentType: booking.bookingType || '',
        ledgerStats: {
          approvedEntries: booking.approvedEntriesCount,
          pendingEntries: booking.pendingEntriesCount
        },
        hasPendingEntries: booking.hasPendingEntries,
        ledgerEntriesCount: booking.ledgerEntriesCount
      }));

      const totals = {
        totalDealAmount: filteredBookings.reduce((sum, b) => sum + b.dealAmount, 0),
        totalReceivedAmount: filteredBookings.reduce((sum, b) => sum + b.totalApprovedAmount, 0),
        totalPendingAmount: filteredBookings.reduce((sum, b) => sum + b.totalPendingForApproval, 0),
        totalBalanceAmount: filteredBookings.reduce((sum, b) => sum + b.balanceAmount, 0)
      };

      res.status(200).json({
        success: true,
        count: filteredBookings.length,
        totals,
        data: formattedBookings,
        availableBranches,
        userAccessInfo: {
          hasAllBranchesAccess,
          branchAccess,
          accessibleBranchesCount: user.accessibleBranches?.length || 0,
          userBranch: user.branch ? { _id: user.branch._id, name: user.branch.name } : null
        },
        filters: { branchId, status, minBalance, maxBalance, modelType },
        debug: {
          totalBookings: bookings.length,
          totalLedgerEntries: allLedgerEntries.length,
          bookingsWithPendingAmount: filteredBookings.filter(b => b.totalPendingForApproval > 0).length,
          bookingsWithAllocationDate: filteredBookings.filter(b => b.allocationDate).length
        }
      });
    }

  } catch (error) {
    console.error('Error generating outstanding report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating outstanding report',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};


/**
 * Generate Broker Report - Exchange vehicles with broker details
 * @route GET /api/v1/reports/brokers
 * @access Private
 * 
 * EXACT 10 FIELDS:
 * - Booking Date
 * - Branch Name
 * - Booking Number
 * - Exchange Amount
 * - Broker Name
 * - Exchange Vehicle Number
 * - Exchange Chassis Number
 * - Customer Name
 * - Model
 * - Exchange Reference Number (FROM LEDGER MODEL - transactionReference)
 * 
 * FILTERS:
 * - Start Date
 * - End Date
 * - Branch Wise
 */
exports.generateBrokerReport = async (req, res) => {
  try {
    const { 
      branchId, 
      startDate, 
      endDate 
    } = req.query;

    // ========== BRANCH ACCESS LOGIC ==========
    const userId = req.user.id;
    
    const user = await User.findById(userId)
      .select('-otp -otpExpires -emailOtp -emailOtpExpires -password')
      .populate({
        path: 'roles',
        select: 'name isSuperAdmin permissionsCount'
      })
      .populate('branch')
      .populate({
        path: 'accessibleBranches',
        model: 'Branch',
        select: '_id name'
      })
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userRoles = user.roles || [];
    const isActualSuperAdmin = userRoles.some(role => role.name === "SUPERADMIN") || false;
    const isSuperAdminFlag = userRoles.some(role => role.isSuperAdmin === true) || false;
    const branchAccess = user.branchAccess || 'OWN';
    
    let hasAllBranchesAccess = false;
    
    if (isActualSuperAdmin || branchAccess === 'ALL' || isSuperAdminFlag) {
      hasAllBranchesAccess = true;
    }

    // ========== BUILD FILTER ==========
    // ONLY exchange = true - NO STATUS FILTER, show ALL exchange bookings
    const filter = {
      exchange: true
    };

    // ========== BRANCH FILTER ==========
    if (!hasAllBranchesAccess) {
      // User does NOT have access to all branches
      if (branchAccess === 'ASSIGNED' && user.accessibleBranches?.length > 0) {
        const accessibleBranchIds = user.accessibleBranches.map(branch => branch._id);
        
        // Check if specific branch requested (case-insensitive 'all' check)
        if (branchId && branchId.toLowerCase() !== 'all') {
          // Validate branchId format before creating ObjectId
          if (!mongoose.Types.ObjectId.isValid(branchId)) {
            return res.status(400).json({
              success: false,
              message: 'Invalid branch ID format'
            });
          }
          
          const requestedBranchId = new mongoose.Types.ObjectId(branchId);
          const hasAccess = accessibleBranchIds.some(bid => 
            bid.toString() === requestedBranchId.toString()
          );
          
          if (!hasAccess) {
            return res.status(403).json({
              success: false,
              message: 'You do not have access to this branch'
            });
          }
          filter.branch = requestedBranchId;
        } else {
          // No specific branch requested or 'all' - show all accessible branches
          filter.branch = { $in: accessibleBranchIds };
        }
      } else if (user.branch) {
        // User has OWN branch access
        filter.branch = user.branch._id;
      } else {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to any branch'
        });
      }
    } else {
      // User HAS access to all branches (Super Admin, etc.)
      if (branchId && branchId.toLowerCase() !== 'all') {
        // Validate branchId format before creating ObjectId
        if (!mongoose.Types.ObjectId.isValid(branchId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid branch ID format'
          });
        }
        filter.branch = new mongoose.Types.ObjectId(branchId);
      }
      // If branchId is 'all' or not provided, no branch filter is applied
    }

    // ========== DATE RANGE FILTER ==========
    if (startDate || endDate) {
      filter.createdAt = {};
      
      if (startDate) {
        // Validate date format
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid start date format'
          });
        }
        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }
      
      if (endDate) {
        // Validate date format
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid end date format'
          });
        }
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    console.log('Broker Report Filter:', JSON.stringify(filter, null, 2));

    // ========== FETCH BOOKINGS WITH EXCHANGE ==========
    const bookings = await Booking.find(filter)
      .populate('branch', 'name')
      .populate('model', 'model_name')
      .populate({
        path: 'exchangeDetails.broker',
        select: 'name mobile'
      })
      .lean();

    console.log(`Found ${bookings.length} exchange bookings`);

    if (bookings.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No exchange bookings found',
        hint: 'No bookings with exchange:true found in the database'
      });
    }

    // ========== GET BOOKING IDs TO FETCH LEDGER ENTRIES ==========
    const bookingIds = bookings.map(booking => booking._id);
    
    // ========== FETCH LEDGER ENTRIES FOR EXCHANGE REFERENCE NUMBERS ==========
    // Get ledger entries with paymentMode = 'Exchange' to get transactionReference
    const ledgerEntries = await Ledger.find({
      booking: { $in: bookingIds },
      paymentMode: 'Exchange', // Filter for Exchange payment mode
      isDebit: false // Credit entries (receipts)
    })
    .select('booking transactionReference receiptNumber amount')
    .lean();

    console.log(`Found ${ledgerEntries.length} exchange ledger entries`);

    // ========== CREATE MAP OF BOOKING ID TO EXCHANGE REFERENCE ==========
    const exchangeReferenceMap = new Map();
    
    ledgerEntries.forEach(ledger => {
      const bookingId = ledger.booking.toString();
      
      // Get transactionReference from ledger - THIS IS THE EXCHANGE REFERENCE NUMBER
      let exchangeRef = '';
      
      // Priority 1: transactionReference field (EXACTLY AS REQUESTED)
      if (ledger.transactionReference) {
        exchangeRef = ledger.transactionReference;
      }
      // Priority 2: receiptNumber as fallback
      else if (ledger.receiptNumber) {
        exchangeRef = ledger.receiptNumber;
      }
      
      // Store the reference in the map (allow multiple references per booking)
      if (!exchangeReferenceMap.has(bookingId)) {
        exchangeReferenceMap.set(bookingId, []);
      }
      
      // Only add non-empty references
      if (exchangeRef && exchangeRef.trim() !== '') {
        exchangeReferenceMap.get(bookingId).push(exchangeRef);
      }
    });

    console.log('Exchange Reference Map created for', exchangeReferenceMap.size, 'bookings');

    // ========== GENERATE EXCEL REPORT ==========
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Broker Report');

    // EXACT 10 COLUMNS - AS REQUESTED
    const columns = [
      { header: 'Booking Date', key: 'bookingDate', width: 15 },
      { header: 'Branch Name', key: 'branchName', width: 25 },
      { header: 'Booking Number', key: 'bookingNumber', width: 20 },
      { header: 'Exchange Amount', key: 'exchangeAmount', width: 18, style: { numFmt: '#,##0.00' } },
      { header: 'Broker Name', key: 'brokerName', width: 25 },
      { header: 'Exchange Vehicle Number', key: 'vehicleNumber', width: 20 },
      { header: 'Exchange Chassis Number', key: 'chassisNumber', width: 25 },
      { header: 'Customer Name', key: 'customerName', width: 25 },
      { header: 'Model', key: 'model', width: 20 },
      { header: 'Exchange Reference Number', key: 'referenceNumber', width: 25 }
    ];

    worksheet.columns = columns;

    // ADD DATA ROWS - ONLY THE 10 FIELDS
    bookings.forEach((booking) => {
      const bookingId = booking._id.toString();
      
      // Get exchange reference from ledger entries
      let exchangeReference = '';
      const references = exchangeReferenceMap.get(bookingId);
      
      if (references && references.length > 0) {
        // Join multiple references if they exist
        exchangeReference = references.filter(ref => ref && ref.trim() !== '').join(', ');
      }

      const row = {
        bookingDate: booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : '',
        branchName: booking.branch?.name || '',
        bookingNumber: booking.bookingNumber || '',
        exchangeAmount: booking.exchangeDetails?.price || 0,
        brokerName: booking.exchangeDetails?.broker?.name || 'NO BROKER ASSIGNED',
        vehicleNumber: booking.exchangeDetails?.vehicleNumber || '',
        chassisNumber: booking.exchangeDetails?.chassisNumber || '',
        customerName: booking.customerDetails?.name || '',
        model: booking.model?.model_name || '',
        referenceNumber: exchangeReference // FROM LEDGER MODEL - transactionReference
      };
      worksheet.addRow(row);
    });

    // STYLE HEADER ROW
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F81BD' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // FORMAT AMOUNT COLUMN AND ALIGNMENT
    for (let i = 1; i <= bookings.length; i++) {
      const row = worksheet.getRow(i + 1);
      
      // Format amount column
      const amountCell = row.getCell(4); // Exchange Amount column
      if (typeof amountCell.value === 'number') {
        amountCell.numFmt = '#,##0.00';
        amountCell.alignment = { horizontal: 'right' };
      }
      
      // Center align specific columns
      const dateCell = row.getCell(1); // Booking Date
      dateCell.alignment = { horizontal: 'center' };
      
      const bookingNoCell = row.getCell(3); // Booking Number
      bookingNoCell.alignment = { horizontal: 'center' };
      
      const refNoCell = row.getCell(10); // Exchange Reference Number
      refNoCell.alignment = { horizontal: 'center' };
    }

    // AUTO-FILTER
    if (worksheet.rowCount > 1) {
      worksheet.autoFilter = {
        from: 'A1',
        to: `J${worksheet.rowCount}`
      };
    }

    // FREEZE HEADER
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // ========== SUMMARY SHEET ==========
    const summarySheet = workbook.addWorksheet('Summary');

    // Summary Title
    summarySheet.mergeCells('A1:D1');
    const titleCell = summarySheet.getCell('A1');
    titleCell.value = 'BROKER EXCHANGE SUMMARY REPORT';
    titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F81BD' }
    };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Calculate totals
    const totalExchangeAmount = bookings.reduce((sum, b) => sum + (b.exchangeDetails?.price || 0), 0);
    const uniqueBrokers = [...new Set(bookings.map(b => b.exchangeDetails?.broker?._id?.toString()).filter(Boolean))];
    const bookingsWithoutBroker = bookings.filter(b => !b.exchangeDetails?.broker).length;
    const uniqueBookingsWithLedger = new Set(ledgerEntries.map(l => l.booking.toString())).size;
    const bookingsWithoutLedgerEntries = bookings.length - uniqueBookingsWithLedger;

    // Report Info
    const infoRows = [
      ['Report Generated:', moment().format('DD MMM YYYY HH:mm:ss')],
      ['Total Exchange Bookings:', bookings.length],
      ['Total Exchange Amount:', `₹${totalExchangeAmount.toFixed(2)}`],
      ['Unique Brokers:', uniqueBrokers.length],
      ['Bookings Without Broker:', bookingsWithoutBroker],
      ['Bookings With Ledger Entries:', uniqueBookingsWithLedger],
      ['Bookings Without Ledger Entries:', bookingsWithoutLedgerEntries],
      ['Total Ledger Entries Found:', ledgerEntries.length],
      ['Date Range:', startDate && endDate ? 
        `${moment(startDate).format('DD/MM/YYYY')} to ${moment(endDate).format('DD/MM/YYYY')}` : 
        'All Dates'],
      ['Branch Filter:', branchId && branchId.toLowerCase() !== 'all' ? 
        (bookings[0]?.branch?.name || 'Selected Branch') : 
        (hasAllBranchesAccess ? 'All Branches' : 'User Accessible Branches')]
    ];

    infoRows.forEach(([label, value], index) => {
      const rowNum = index + 3;
      summarySheet.getCell(`A${rowNum}`).value = label;
      summarySheet.getCell(`B${rowNum}`).value = value;
      summarySheet.getCell(`A${rowNum}`).font = { bold: true };
      summarySheet.getCell(`B${rowNum}`).font = { bold: true };
      
      if (typeof value === 'string' && value.startsWith('₹')) {
        summarySheet.getCell(`B${rowNum}`).numFmt = '#,##0.00';
      }
    });

    // ========== BROKER-WISE SUMMARY ==========
    const brokerStartRow = infoRows.length + 5;

    // Broker Summary Title
    summarySheet.mergeCells(`A${brokerStartRow}:E${brokerStartRow}`);
    const brokerTitleCell = summarySheet.getCell(`A${brokerStartRow}`);
    brokerTitleCell.value = 'BROKER-WISE SUMMARY';
    brokerTitleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    brokerTitleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2E75B5' }
    };
    brokerTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Broker Summary Headers
    const brokerHeaders = ['Broker Name', 'Mobile', 'Total Exchanges', 'Total Exchange Amount', 'Avg Exchange Amount'];
    const brokerHeaderRow = brokerStartRow + 1;
    brokerHeaders.forEach((header, colIndex) => {
      const cell = summarySheet.getCell(`${String.fromCharCode(65 + colIndex)}${brokerHeaderRow}`);
      cell.value = header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F81BD' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Group by broker
    const brokerSummary = {};
    
    // Add "No Broker" category
    brokerSummary['no_broker'] = {
      brokerName: 'NO BROKER ASSIGNED',
      mobile: '',
      count: 0,
      totalValue: 0
    };
    
    bookings.forEach(booking => {
      const broker = booking.exchangeDetails?.broker;
      if (broker && broker._id) {
        const brokerId = broker._id.toString();
        
        if (!brokerSummary[brokerId]) {
          brokerSummary[brokerId] = {
            brokerName: broker.name || 'Unknown',
            mobile: broker.mobile || '',
            count: 0,
            totalValue: 0
          };
        }
        
        brokerSummary[brokerId].count++;
        brokerSummary[brokerId].totalValue += booking.exchangeDetails?.price || 0;
      } else {
        brokerSummary['no_broker'].count++;
        brokerSummary['no_broker'].totalValue += booking.exchangeDetails?.price || 0;
      }
    });

    // Add broker summary data
    let brokerRowIndex = 0;
    Object.values(brokerSummary).forEach((broker) => {
      if (broker.count === 0) return;
      
      const rowNum = brokerHeaderRow + 1 + brokerRowIndex;
      const avgValue = broker.count > 0 ? broker.totalValue / broker.count : 0;
      
      summarySheet.getCell(`A${rowNum}`).value = broker.brokerName;
      summarySheet.getCell(`B${rowNum}`).value = broker.mobile;
      summarySheet.getCell(`C${rowNum}`).value = broker.count;
      summarySheet.getCell(`D${rowNum}`).value = broker.totalValue;
      summarySheet.getCell(`E${rowNum}`).value = avgValue;
      
      // Style
      ['A', 'B', 'C', 'D', 'E'].forEach((col, colIndex) => {
        const cell = summarySheet.getCell(`${col}${rowNum}`);
        cell.alignment = { 
          horizontal: colIndex === 0 || colIndex === 1 ? 'left' : 'right',
          vertical: 'middle'
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        
        if (brokerRowIndex % 2 === 0) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2F2F2' }
          };
        }
        
        if (colIndex === 3 || colIndex === 4) {
          cell.numFmt = '#,##0.00';
        }
        
        if (broker.brokerName === 'NO BROKER ASSIGNED') {
          cell.font = { color: { argb: 'FFFF0000' }, italic: true };
        }
      });
      
      brokerRowIndex++;
    });

    // ========== BRANCH-WISE SUMMARY ==========
    const branchSummaryStartRow = brokerHeaderRow + brokerRowIndex + 3;

    // Branch Summary Title
    summarySheet.mergeCells(`A${branchSummaryStartRow}:C${branchSummaryStartRow}`);
    const branchTitleCell = summarySheet.getCell(`A${branchSummaryStartRow}`);
    branchTitleCell.value = 'BRANCH-WISE SUMMARY';
    branchTitleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    branchTitleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2E75B5' }
    };
    branchTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Branch Summary Headers
    const branchHeaders = ['Branch Name', 'Total Exchanges', 'Total Exchange Amount'];
    const branchHeaderRow = branchSummaryStartRow + 1;
    branchHeaders.forEach((header, colIndex) => {
      const cell = summarySheet.getCell(`${String.fromCharCode(65 + colIndex)}${branchHeaderRow}`);
      cell.value = header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F81BD' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Group by branch
    const branchSummary = {};
    bookings.forEach(booking => {
      const branchName = booking.branch?.name || 'Unknown Branch';
      
      if (!branchSummary[branchName]) {
        branchSummary[branchName] = {
          branchName: branchName,
          count: 0,
          totalValue: 0
        };
      }
      
      branchSummary[branchName].count++;
      branchSummary[branchName].totalValue += booking.exchangeDetails?.price || 0;
    });

    // Add branch summary data
    let branchRowIndex = 0;
    Object.values(branchSummary).forEach((branch) => {
      const rowNum = branchHeaderRow + 1 + branchRowIndex;
      
      summarySheet.getCell(`A${rowNum}`).value = branch.branchName;
      summarySheet.getCell(`B${rowNum}`).value = branch.count;
      summarySheet.getCell(`C${rowNum}`).value = branch.totalValue;
      
      // Style
      ['A', 'B', 'C'].forEach((col, colIndex) => {
        const cell = summarySheet.getCell(`${col}${rowNum}`);
        cell.alignment = { 
          horizontal: colIndex === 0 ? 'left' : 'right',
          vertical: 'middle'
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        
        if (branchRowIndex % 2 === 0) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2F2F2' }
          };
        }
        
        if (colIndex === 2) {
          cell.numFmt = '#,##0.00';
        }
      });
      
      branchRowIndex++;
    });

    // Add totals row
    const branchTotalRow = branchHeaderRow + branchRowIndex + 1;
    summarySheet.getCell(`A${branchTotalRow}`).value = 'GRAND TOTAL';
    summarySheet.getCell(`A${branchTotalRow}`).font = { bold: true };
    summarySheet.getCell(`A${branchTotalRow}`).alignment = { horizontal: 'right' };
    
    summarySheet.getCell(`B${branchTotalRow}`).value = bookings.length;
    summarySheet.getCell(`B${branchTotalRow}`).font = { bold: true };
    summarySheet.getCell(`B${branchTotalRow}`).alignment = { horizontal: 'right' };
    
    summarySheet.getCell(`C${branchTotalRow}`).value = totalExchangeAmount;
    summarySheet.getCell(`C${branchTotalRow}`).numFmt = '#,##0.00';
    summarySheet.getCell(`C${branchTotalRow}`).font = { bold: true };
    summarySheet.getCell(`C${branchTotalRow}`).alignment = { horizontal: 'right' };

    // ========== LEDGER REFERENCE SUMMARY SHEET ==========
    const ledgerSummarySheet = workbook.addWorksheet('Ledger References');

    // Ledger Summary Title
    ledgerSummarySheet.mergeCells('A1:D1');
    const ledgerTitleCell = ledgerSummarySheet.getCell('A1');
    ledgerTitleCell.value = 'LEDGER EXCHANGE REFERENCE NUMBERS';
    ledgerTitleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    ledgerTitleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F81BD' }
    };
    ledgerTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Ledger Summary Headers
    const ledgerHeaders = ['Booking Number', 'Customer Name', 'Exchange Reference Number', 'Receipt Number', 'Amount'];
    const ledgerHeaderRow = 3;
    ledgerHeaders.forEach((header, colIndex) => {
      const cell = ledgerSummarySheet.getCell(`${String.fromCharCode(65 + colIndex)}${ledgerHeaderRow}`);
      cell.value = header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2E75B5' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Add ledger reference data
    let ledgerRowIndex = 4;
    ledgerEntries.forEach((ledger) => {
      const booking = bookings.find(b => b._id.toString() === ledger.booking.toString());
      if (booking) {
        ledgerSummarySheet.getCell(`A${ledgerRowIndex}`).value = booking.bookingNumber || '';
        ledgerSummarySheet.getCell(`B${ledgerRowIndex}`).value = booking.customerDetails?.name || '';
        ledgerSummarySheet.getCell(`C${ledgerRowIndex}`).value = ledger.transactionReference || '';
        ledgerSummarySheet.getCell(`D${ledgerRowIndex}`).value = ledger.receiptNumber || '';
        ledgerSummarySheet.getCell(`E${ledgerRowIndex}`).value = ledger.amount || 0;
        
        // Style
        ['A', 'B', 'C', 'D', 'E'].forEach((col, colIndex) => {
          const cell = ledgerSummarySheet.getCell(`${col}${ledgerRowIndex}`);
          cell.alignment = { 
            horizontal: colIndex === 0 || colIndex === 1 || colIndex === 2 || colIndex === 3 ? 'left' : 'right',
            vertical: 'middle'
          };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          
          if ((ledgerRowIndex - 4) % 2 === 0) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF2F2F2' }
            };
          }
          
          if (colIndex === 4) {
            cell.numFmt = '#,##0.00';
          }
        });
        
        ledgerRowIndex++;
      }
    });

    ledgerSummarySheet.columns = [
      { width: 20 },
      { width: 25 },
      { width: 30 },
      { width: 20 },
      { width: 18 }
    ];

    // ========== FILTER INFO SHEET ==========
    const filterSheet = workbook.addWorksheet('Filter Info');

    filterSheet.mergeCells('A1:C1');
    const filterTitleCell = filterSheet.getCell('A1');
    filterTitleCell.value = 'REPORT FILTERS APPLIED';
    filterTitleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    filterTitleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F81BD' }
    };
    filterTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    const filterData = [
      ['Filter', 'Value'],
      ['Exchange Status', 'YES (All Exchange Bookings)'],
      ['Exchange Reference Source', 'Ledger Model - transactionReference'],
      ['Date Range', startDate && endDate ? 
        `${moment(startDate).format('DD/MM/YYYY')} to ${moment(endDate).format('DD/MM/YYYY')}` : 
        'All Dates'],
      ['Branch', branchId && branchId.toLowerCase() !== 'all' ? 
        (bookings[0]?.branch?.name || 'Selected Branch') : 
        (hasAllBranchesAccess ? 'All Branches' : 'User Accessible Branches')],
      ['Total Exchange Bookings', bookings.length],
      ['Total Ledger Entries', ledgerEntries.length],
      ['Generated On', moment().format('DD/MM/YYYY HH:mm:ss')],
      ['Generated By', user.name || user.email]
    ];

    filterData.forEach((row, index) => {
      const rowNum = index + 3;
      filterSheet.getCell(`A${rowNum}`).value = row[0];
      filterSheet.getCell(`B${rowNum}`).value = row[1];
      
      filterSheet.getCell(`A${rowNum}`).font = index === 0 ? { bold: true } : {};
      filterSheet.getCell(`B${rowNum}`).font = index === 0 ? { bold: true } : {};
      
      filterSheet.getCell(`A${rowNum}`).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      filterSheet.getCell(`B${rowNum}`).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    filterSheet.columns = [
      { width: 25 },
      { width: 40 },
      { width: 20 }
    ];

    // ========== SEND EXCEL FILE ==========
    const fileName = `broker_exchange_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
    
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`
    );

    await workbook.xlsx.write(res);
    return res.end();

  } catch (error) {
    console.error('Error generating broker report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating broker report',
      error: error.message
    });
  }
};

/**
 * Generate Verified Amount Outstanding Report
 * Shows ONLY bookings with verified/approved payments > 0
 * REMOVES the "Pending Verification Amount" column
 * ONLY FETCHES BOOKINGS WHERE Verified Amount > 0
 * @route GET /api/v1/reports/outstanding/verified
 * @access Private
 */
// exports.generateVerifiedOutstandingReport = async (req, res) => {
//   try {
//     const { 
//       branchId, 
//       startDate, 
//       endDate, 
//       status,
//       minBalance,
//       maxBalance,
//       modelType,
//       format = 'excel' 
//     } = req.query;

//     // Build filter conditions
//     const filter = {};

//     // Get user info from auth middleware
//     const userId = req.user.id;
    
//     // Fetch user with all necessary data
//     const user = await User.findById(userId)
//       .select('-otp -otpExpires -emailOtp -emailOtpExpires -password')
//       .populate({
//         path: 'roles',
//         select: 'name isSuperAdmin permissionsCount'
//       })
//       .populate('branch')
//       .populate({
//         path: 'accessibleBranches',
//         model: 'Branch',
//         select: '_id name address city state pincode phone email is_active logo1'
//       })
//       .lean();

//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: 'User not found'
//       });
//     }

//     console.log(`👤 User: ${user.name} (${user.email})`);
//     console.log(`🏢 User's branch: ${user.branch?.name || 'None'}`);
//     console.log(`🔑 Branch Access Type: ${user.branchAccess || 'OWN'}`);
//     console.log(`🏢 Accessible Branches: ${user.accessibleBranches?.length || 0}`);
    
//     // Check user roles and permissions
//     const userRoles = user.roles || [];
    
//     const isActualSuperAdmin = userRoles.some(role => 
//       role.name === "SUPERADMIN"
//     ) || false;
    
//     const isSuperAdminFlag = userRoles.some(role => 
//       role.isSuperAdmin === true
//     ) || false;
    
//     const branchAccess = user.branchAccess || 'OWN';
    
//     let hasAllBranchesAccess = false;
    
//     if (isActualSuperAdmin) {
//       hasAllBranchesAccess = true;
//       console.log('✅ User is SUPERADMIN - has access to all branches');
//     } else if (branchAccess === 'ALL') {
//       hasAllBranchesAccess = true;
//       console.log('✅ User has ALL branch access permission');
//     } else if (isSuperAdminFlag) {
//       hasAllBranchesAccess = true;
//       console.log('✅ User is ADMIN/GM - has access to all branches');
//     } else {
//       console.log('ℹ️ User has restricted branch access');
//     }

//     // ========== GET AVAILABLE BRANCHES FOR DROPDOWN ==========
//     let availableBranches = [];
    
//     if (hasAllBranchesAccess) {
//       availableBranches = await Branch.find({ is_active: true })
//         .select('_id name address city')
//         .sort({ name: 1 })
//         .lean();
//       console.log(`✅ Fetched ${availableBranches.length} total branches for dropdown`);
//     } else if (branchAccess === 'ASSIGNED' && user.accessibleBranches) {
//       availableBranches = user.accessibleBranches.map(branch => ({
//         _id: branch._id,
//         name: branch.name,
//         address: branch.address,
//         city: branch.city
//       })).sort((a, b) => a.name.localeCompare(b.name));
//       console.log(`✅ Using ${availableBranches.length} assigned branches for dropdown`);
//     } else if (user.branch) {
//       availableBranches = [{
//         _id: user.branch._id,
//         name: user.branch.name,
//         address: user.branch.address,
//         city: user.branch.city
//       }];
//       console.log('✅ Using only own branch for dropdown');
//     }
    
//     if (availableBranches.length > 1) {
//       availableBranches.unshift({
//         _id: 'all',
//         name: 'All Branches',
//         address: '',
//         city: ''
//       });
//       console.log('✅ Added "All Branches" option to dropdown');
//     }

//     // ========== APPLY BRANCH FILTER ==========
//     if (!hasAllBranchesAccess) {
//       if (branchAccess === 'ASSIGNED' && user.accessibleBranches && user.accessibleBranches.length > 0) {
//         const accessibleBranchIds = user.accessibleBranches.map(branch => branch._id);
        
//         if (branchId) {
//           if (branchId === 'all') {
//             filter.branch = { $in: accessibleBranchIds };
//             console.log('✅ Showing all accessible branches');
//           } else {
//             const requestedBranchId = new mongoose.Types.ObjectId(branchId);
//             const hasAccess = accessibleBranchIds.some(branchId => 
//               branchId.toString() === requestedBranchId.toString()
//             );
            
//             if (!hasAccess) {
//               return res.status(403).json({
//                 success: false,
//                 message: 'You do not have access to this branch'
//               });
//             }
//             filter.branch = requestedBranchId;
//             console.log(`✅ Filtering by branch: ${branchId}`);
//           }
//         } else {
//           filter.branch = { $in: accessibleBranchIds };
//           console.log('✅ Showing all accessible branches (no branch filter)');
//         }
//       } else {
//         console.log('User has only OWN branch access');
//         if (user.branch && user.branch._id) {
//           filter.branch = user.branch._id;
//           console.log(`✅ Filtering by own branch: ${user.branch._id}`);
//         } else {
//           return res.status(403).json({
//             success: false,
//             message: 'You do not have access to any branch'
//           });
//         }
//       }
//     } else {
//       if (branchId) {
//         if (branchId === 'all') {
//           console.log('✅ Showing ALL branches (SUPERADMIN/ADMIN with "All" selected)');
//         } else {
//           filter.branch = new mongoose.Types.ObjectId(branchId);
//           console.log(`✅ Filtering by branch: ${branchId}`);
//         }
//       } else {
//         console.log('✅ Showing ALL branches (no branch filter)');
//       }
//     }

//     // ========== DATE RANGE FILTER ==========
//     if (startDate || endDate) {
//       filter.createdAt = {};
//       if (startDate) {
//         const start = new Date(startDate);
//         start.setHours(0, 0, 0, 0);
//         filter.createdAt.$gte = start;
//       }
//       if (endDate) {
//         const end = new Date(endDate);
//         end.setHours(23, 59, 59, 999);
//         filter.createdAt.$lte = end;
//       }
//     }

//     // ========== STATUS FILTER ==========
//     if (status) {
//       filter.status = status;
//     } else {
//       filter.status = { 
//         $nin: ['CANCELLED', 'COMPLETED', 'CANCELLED_APPROVE', 'CANCELLED_REJECTED'] 
//       };
//     }

//     console.log('Verified Outstanding Report Filter:', JSON.stringify(filter, null, 2));

//     // ========== FETCH BOOKINGS ==========
//     const bookingsQuery = Booking.find(filter)
//       .populate('model', 'model_name type')
//       .populate('color', 'name')
//       .populate('branch', 'name')
//       .populate('salesExecutive', 'name')
//       .populate({
//         path: 'payment.financer',
//         select: 'name'
//       })
//       .sort({ createdAt: -1 });

//     // ========== APPLY MODEL TYPE FILTER IF PROVIDED ==========
//     if (modelType) {
//       console.log(`Applying model type filter: ${modelType}`);
      
//       const models = await mongoose.model('Model').find({ 
//         type: modelType.toUpperCase()
//       }).select('_id').lean();
      
//       const modelIds = models.map(model => model._id);
      
//       if (modelIds.length > 0) {
//         bookingsQuery.where('model').in(modelIds);
//         console.log(`Filtering by ${modelIds.length} ${modelType} models`);
//       } else {
//         console.log(`No ${modelType} models found`);
//         if (format === 'excel') {
//           const workbook = new ExcelJS.Workbook();
//           const worksheet = workbook.addWorksheet('Verified Outstanding Report');
          
//           // Add headers even for empty report - BRANCH NAME AND BOOKING DATE AT START
//           const headers = [
//             'Branch Name',
//             'Booking Date',
//             'Booking Number',
//             'Customer Name',
//             'Mobile 1',
//             'Mobile 2',
//             'Model',
//             'Model Type',
//             'Color',
//             'Booking Type',
//             'Financier Name',
//             'Deal Amount',
//             'Verified Amount',
//             'Balance Amount',
//             'Booking Status'
//           ];
          
//           const headerRow = worksheet.addRow(headers);
//           headerRow.eachCell((cell) => {
//             cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
//             cell.fill = {
//               type: 'pattern',
//               pattern: 'solid',
//               fgColor: { argb: 'FF2E75B5' }
//             };
//           });
          
//           const fileName = `verified_outstanding_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
          
//           res.setHeader(
//             'Content-Type',
//             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
//           );
//           res.setHeader(
//             'Content-Disposition',
//             `attachment; filename="${fileName}"`
//           );
          
//           await workbook.xlsx.write(res);
//           res.end();
//           return;
//         } else {
//           return res.status(200).json({
//             success: true,
//             count: 0,
//             totals: { 
//               totalDealAmount: 0, 
//               totalVerifiedAmount: 0, 
//               totalBalanceAmount: 0
//             },
//             data: [],
//             availableBranches: availableBranches,
//             userAccessInfo: {
//               hasAllBranchesAccess: hasAllBranchesAccess,
//               branchAccess: branchAccess,
//               accessibleBranchesCount: user.accessibleBranches?.length || 0,
//               userBranch: user.branch ? {
//                 _id: user.branch._id,
//                 name: user.branch.name
//               } : null
//             },
//             filters: {
//               branchId: branchId,
//               startDate: startDate,
//               endDate: endDate,
//               status: status,
//               minBalance: minBalance,
//               maxBalance: maxBalance,
//               modelType: modelType,
//               reportType: 'VERIFIED_OUTSTANDING'
//             }
//           });
//         }
//       }
//     }
    
//     const bookings = await bookingsQuery.lean();

//     console.log(`Found ${bookings.length} bookings`);

//     const bookingIds = bookings.map(b => b._id);

//     // ========== FETCH ALL APPROVED LEDGER ENTRIES ONLY ==========
//     const allLedgerEntries = await Ledger.find({
//       booking: { $in: bookingIds },
//       approvalStatus: 'Approved',
//       isDebit: false
//     })
//     .select('amount paymentMode type approvalStatus isDebit booking')
//     .lean();

//     console.log(`Found ${allLedgerEntries.length} APPROVED CREDIT ledger entries for these bookings`);

//     // Group ledger entries by booking ID
//     const ledgerByBooking = {};
//     allLedgerEntries.forEach(entry => {
//       const bookingId = entry.booking.toString();
//       if (!ledgerByBooking[bookingId]) {
//         ledgerByBooking[bookingId] = [];
//       }
//       ledgerByBooking[bookingId].push(entry);
//     });

//     // Process each booking to calculate financials
//     const processedBookings = bookings.map(booking => {
//       const bookingLedgerEntries = ledgerByBooking[booking._id.toString()] || [];
      
//       const totalApprovedAmount = bookingLedgerEntries.reduce((sum, entry) => 
//         sum + (entry.amount || 0), 0);
      
//       const dealAmount = booking.discountedAmount || 0;
//       const balanceAmount = dealAmount - totalApprovedAmount;
      
//       // Get financier name properly
//       let financierName = '';
//       if (booking.payment?.type === 'FINANCE' && booking.payment?.financer) {
//         if (typeof booking.payment.financer === 'object' && booking.payment.financer.name) {
//           financierName = booking.payment.financer.name;
//         } else if (typeof booking.payment.financer === 'string') {
//           financierName = booking.payment.financer;
//         }
//       }
      
//       return {
//         ...booking,
//         bookingType: booking.payment?.type || '',
//         financierName: financierName,
//         totalApprovedAmount,
//         dealAmount,
//         balanceAmount,
//         approvedEntriesCount: bookingLedgerEntries.length,
//         branchName: booking.branch?.name || '',
//         formattedBookingDate: booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : ''
//       };
//     });

//     // Filter: ONLY KEEP BOOKINGS WITH VERIFIED AMOUNT > 0
//     const bookingsWithVerifiedAmount = processedBookings.filter(booking => {
//       return booking.totalApprovedAmount > 0;
//     });

//     console.log(`Found ${bookingsWithVerifiedAmount.length} bookings with verified amount > 0`);

//     // Filter bookings with outstanding balance
//     let outstandingBookings = bookingsWithVerifiedAmount.filter(booking => {
//       return booking.balanceAmount > 0;
//     });

//     // Apply balance range filter
//     if (minBalance || maxBalance) {
//       outstandingBookings = outstandingBookings.filter(booking => {
//         if (minBalance && booking.balanceAmount < parseFloat(minBalance)) return false;
//         if (maxBalance && booking.balanceAmount > parseFloat(maxBalance)) return false;
//         return true;
//       });
//     }

//     console.log(`Found ${outstandingBookings.length} bookings with verified amount > 0 AND outstanding balance > 0`);

//     if (outstandingBookings.length === 0) {
//       if (format === 'excel') {
//         const workbook = new ExcelJS.Workbook();
//         const worksheet = workbook.addWorksheet('Verified Outstanding Report');
        
//         // Add headers even for empty report - BRANCH NAME AND BOOKING DATE AT START
//         const headers = [
//           'Branch Name',
//           'Booking Date',
//           'Booking Number',
//           'Customer Name',
//           'Mobile 1',
//           'Mobile 2',
//           'Model',
//           'Model Type',
//           'Color',
//           'Booking Type',
//           'Financier Name',
//           'Deal Amount',
//           'Verified Amount',
//           'Balance Amount',
//           'Booking Status'
//         ];
        
//         const headerRow = worksheet.addRow(headers);
//         headerRow.eachCell((cell) => {
//           cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
//           cell.fill = {
//             type: 'pattern',
//             pattern: 'solid',
//             fgColor: { argb: 'FF2E75B5' }
//           };
//         });
        
//         const fileName = `verified_outstanding_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
        
//         res.setHeader(
//           'Content-Type',
//           'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
//         );
//         res.setHeader(
//           'Content-Disposition',
//           `attachment; filename="${fileName}"`
//         );
        
//         await workbook.xlsx.write(res);
//         res.end();
//         return;
//       } else {
//         return res.status(200).json({
//           success: true,
//           count: 0,
//           totals: { 
//             totalDealAmount: 0, 
//             totalVerifiedAmount: 0, 
//             totalBalanceAmount: 0
//           },
//           data: [],
//           availableBranches: availableBranches,
//           userAccessInfo: {
//             hasAllBranchesAccess: hasAllBranchesAccess,
//             branchAccess: branchAccess,
//             accessibleBranchesCount: user.accessibleBranches?.length || 0
//           },
//           message: 'No bookings with verified amount > 0 and outstanding balance found'
//         });
//       }
//     }

//     // ========== GENERATE EXCEL REPORT ==========
//     if (format === 'excel') {
//       const workbook = new ExcelJS.Workbook();
      
//       let worksheetName = 'Verified Outstanding Report';
//       if (filter.branch && typeof filter.branch === 'object' && !filter.branch.$in) {
//         const branch = outstandingBookings[0]?.branch;
//         if (branch?.name) {
//           worksheetName = `${branch.name} Verified Outstanding Report`;
//         }
//       } else if (hasAllBranchesAccess && (!branchId || branchId === 'all')) {
//         worksheetName = 'All Branches Verified Outstanding Report';
//       }
      
//       const worksheet = workbook.addWorksheet(worksheetName);

//       // DEFINE HEADERS - BRANCH NAME AND BOOKING DATE AT START
//       const headers = [
//         'Branch Name',
//         'Booking Date',
//         'Booking Number',
//         'Customer Name',
//         'Mobile 1',
//         'Mobile 2',
//         'Model',
//         'Model Type',
//         'Color',
//         'Booking Type',
//         'Financier Name',
//         'Deal Amount',
//         'Verified Amount',
//         'Balance Amount',
//         'Booking Status'
//       ];

//       // Add headers row
//       const headerRow = worksheet.addRow(headers);

//       // Style the header row
//       headerRow.eachCell((cell) => {
//         cell.font = { 
//           bold: true, 
//           color: { argb: 'FFFFFFFF' },
//           size: 11
//         };
//         cell.fill = {
//           type: 'pattern',
//           pattern: 'solid',
//           fgColor: { argb: 'FF2E75B5' }
//         };
//         cell.alignment = { 
//           vertical: 'middle', 
//           horizontal: 'center',
//           wrapText: true
//         };
//         cell.border = {
//           top: { style: 'thin' },
//           left: { style: 'thin' },
//           bottom: { style: 'thin' },
//           right: { style: 'thin' }
//         };
//       });

//       // Set column widths
//       worksheet.columns = [
//         { key: 'branchName', width: 25 },
//         { key: 'bookingDate', width: 15 },
//         { key: 'bookingNumber', width: 18 },
//         { key: 'customerName', width: 25 },
//         { key: 'mobile1', width: 15 },
//         { key: 'mobile2', width: 15 },
//         { key: 'model', width: 20 },
//         { key: 'modelType', width: 12 },
//         { key: 'color', width: 15 },
//         { key: 'bookingType', width: 15 },
//         { key: 'financierName', width: 25 },
//         { key: 'dealAmount', width: 18 },
//         { key: 'verifiedAmount', width: 18 },
//         { key: 'balanceAmount', width: 18 },
//         { key: 'status', width: 15 }
//       ];

//       // ADD DATA ROWS
//       outstandingBookings.forEach((booking) => {
//         const rowData = {
//           branchName: booking.branch?.name || '',
//           bookingDate: booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : '',
//           bookingNumber: booking.bookingNumber || '',
//           customerName: booking.customerDetails?.name || '',
//           mobile1: booking.customerDetails?.mobile1 || '',
//           mobile2: booking.customerDetails?.mobile2 || '',
//           model: booking.model?.model_name || '',
//           modelType: booking.model?.type || '',
//           color: booking.color?.name || '',
//           bookingType: booking.payment?.type || '',
//           financierName: booking.financierName || '',
//           dealAmount: booking.dealAmount || 0,
//           verifiedAmount: booking.totalApprovedAmount || 0,
//           balanceAmount: booking.balanceAmount || 0,
//           status: booking.status || ''
//         };

//         worksheet.addRow(rowData);
//       });

//       // Format amount columns and apply alternating row colors
//       for (let i = 0; i < outstandingBookings.length; i++) {
//         const row = worksheet.getRow(i + 2); // +2 because row 1 is header
        
//         // Format amount columns (Deal Amount, Verified Amount, Balance Amount)
//         // Columns are 0-based: dealAmount (11), verifiedAmount (12), balanceAmount (13)
//         [11, 12, 13].forEach(colIndex => {
//           const cell = row.getCell(colIndex + 1); // +1 because ExcelJS columns are 1-based
//           if (typeof cell.value === 'number') {
//             cell.numFmt = '#,##0.00';
//             cell.alignment = { horizontal: 'right' };
//           }
//         });
        
//         // Apply alternating row colors for better readability
//         if (i % 2 === 0) {
//           row.eachCell((cell) => {
//             cell.fill = {
//               type: 'pattern',
//               pattern: 'solid',
//               fgColor: { argb: 'FFF2F2F2' }
//             };
//           });
//         }
//       }

//       // Apply auto-filter
//       if (worksheet.rowCount > 1) {
//         const lastColLetter = String.fromCharCode(64 + worksheet.columnCount);
//         worksheet.autoFilter = {
//           from: 'A1',
//           to: `${lastColLetter}${worksheet.rowCount}`
//         };
//       }

//       // Freeze header row
//       worksheet.views = [{ state: 'frozen', ySplit: 1 }];

//       const fileName = `verified_outstanding_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
      
//       res.setHeader(
//         'Content-Type',
//         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
//       );
//       res.setHeader(
//         'Content-Disposition',
//         `attachment; filename="${fileName}"`
//       );

//       await workbook.xlsx.write(res);
//       res.end();

//     } else {
//       // ========== RETURN JSON FORMAT ==========
//       const formattedBookings = outstandingBookings.map(booking => {
//         return {
//           branchName: booking.branch?.name || '',
//           bookingDate: booking.createdAt,
//           formattedBookingDate: booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : '',
//           bookingNumber: booking.bookingNumber,
//           customerName: booking.customerDetails?.name || '',
//           mobile1: booking.customerDetails?.mobile1 || '',
//           mobile2: booking.customerDetails?.mobile2 || '',
//           model: booking.model?.model_name || '',
//           modelType: booking.model?.type || '',
//           color: booking.color?.name || '',
//           bookingType: booking.bookingType || '',
//           financierName: booking.financierName || '',
//           dealAmount: booking.dealAmount,
//           verifiedAmount: booking.totalApprovedAmount,
//           balanceAmount: booking.balanceAmount,
//           bookingStatus: booking.status || '',
//           bookingId: booking._id,
//           reportType: 'VERIFIED_OUTSTANDING',
//           approvedEntriesCount: booking.approvedEntriesCount
//         };
//       });

//       // Calculate overall totals
//       const totals = {
//         totalDealAmount: outstandingBookings.reduce((sum, booking) => 
//           sum + booking.dealAmount, 0),
//         totalVerifiedAmount: outstandingBookings.reduce((sum, booking) => 
//           sum + booking.totalApprovedAmount, 0),
//         totalBalanceAmount: outstandingBookings.reduce((sum, booking) => 
//           sum + booking.balanceAmount, 0)
//       };

//       res.status(200).json({
//         success: true,
//         count: outstandingBookings.length,
//         totals: totals,
//         data: formattedBookings,
//         availableBranches: availableBranches,
//         userAccessInfo: {
//           hasAllBranchesAccess: hasAllBranchesAccess,
//           branchAccess: branchAccess,
//           accessibleBranchesCount: user.accessibleBranches?.length || 0,
//           userBranch: user.branch ? {
//             _id: user.branch._id,
//             name: user.branch.name
//           } : null
//         },
//         filters: {
//           branchId: branchId,
//           startDate: startDate,
//           endDate: endDate,
//           status: status,
//           minBalance: minBalance,
//           maxBalance: maxBalance,
//           modelType: modelType,
//           reportType: 'VERIFIED_OUTSTANDING'
//         },
//         debug: {
//           totalBookingsWithVerifiedAmount: bookingsWithVerifiedAmount.length,
//           totalBookingsWithOutstanding: outstandingBookings.length,
//           totalApprovedLedgerEntries: allLedgerEntries.length,
//           totalVerifiedAmount: totals.totalVerifiedAmount
//         }
//       });
//     }

//   } catch (error) {
//     console.error('Error generating verified outstanding report:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Error generating verified outstanding report',
//       error: error.message,
//       stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
//     });
//   }
// };

/**
 * Generate Pending Verification Amount Outstanding Report
 * Shows bookings with pending verification amounts
 * REMOVES the "Verified Amount" column
 * @route GET /api/v1/reports/outstanding/pending-verification
 * @access Private
 */
exports.generatePendingVerificationOutstandingReport = async (req, res) => {
  try {
    const { 
      branchId, 
      startDate, 
      endDate, 
      status,
      minPendingAmount,
      maxPendingAmount,
      modelType,
      format = 'excel' 
    } = req.query;

    // Build filter conditions
    const filter = {};

    // Get user info from auth middleware
    const userId = req.user.id;
    
    // Fetch user with all necessary data
    const user = await User.findById(userId)
      .select('-otp -otpExpires -emailOtp -emailOtpExpires -password')
      .populate({
        path: 'roles',
        select: 'name isSuperAdmin permissionsCount'
      })
      .populate('branch')
      .populate({
        path: 'accessibleBranches',
        model: 'Branch',
        select: '_id name address city state pincode phone email is_active logo1'
      })
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`🏢 User's branch: ${user.branch?.name || 'None'}`);
    console.log(`🔑 Branch Access Type: ${user.branchAccess || 'OWN'}`);
    console.log(`🏢 Accessible Branches: ${user.accessibleBranches?.length || 0}`);
    
    const userRoles = user.roles || [];
    
    const isActualSuperAdmin = userRoles.some(role => 
      role.name === "SUPERADMIN"
    ) || false;
    
    const isSuperAdminFlag = userRoles.some(role => 
      role.isSuperAdmin === true
    ) || false;
    
    const branchAccess = user.branchAccess || 'OWN';
    
    let hasAllBranchesAccess = false;
    
    if (isActualSuperAdmin) {
      hasAllBranchesAccess = true;
      console.log('✅ User is SUPERADMIN - has access to all branches');
    } else if (branchAccess === 'ALL') {
      hasAllBranchesAccess = true;
      console.log('✅ User has ALL branch access permission');
    } else if (isSuperAdminFlag) {
      hasAllBranchesAccess = true;
      console.log('✅ User is ADMIN/GM - has access to all branches');
    } else {
      console.log('ℹ️ User has restricted branch access');
    }

    // ========== GET AVAILABLE BRANCHES FOR DROPDOWN ==========
    let availableBranches = [];
    
    if (hasAllBranchesAccess) {
      availableBranches = await Branch.find({ is_active: true })
        .select('_id name address city')
        .sort({ name: 1 })
        .lean();
      console.log(`✅ Fetched ${availableBranches.length} total branches for dropdown`);
    } else if (branchAccess === 'ASSIGNED' && user.accessibleBranches) {
      availableBranches = user.accessibleBranches.map(branch => ({
        _id: branch._id,
        name: branch.name,
        address: branch.address,
        city: branch.city
      })).sort((a, b) => a.name.localeCompare(b.name));
      console.log(`✅ Using ${availableBranches.length} assigned branches for dropdown`);
    } else if (user.branch) {
      availableBranches = [{
        _id: user.branch._id,
        name: user.branch.name,
        address: user.branch.address,
        city: user.branch.city
      }];
      console.log('✅ Using only own branch for dropdown');
    }
    
    if (availableBranches.length > 1) {
      availableBranches.unshift({
        _id: 'all',
        name: 'All Branches',
        address: '',
        city: ''
      });
      console.log('✅ Added "All Branches" option to dropdown');
    }

    // ========== APPLY BRANCH FILTER ==========
    if (!hasAllBranchesAccess) {
      if (branchAccess === 'ASSIGNED' && user.accessibleBranches && user.accessibleBranches.length > 0) {
        const accessibleBranchIds = user.accessibleBranches.map(branch => branch._id);
        
        if (branchId) {
          if (branchId === 'all') {
            filter.branch = { $in: accessibleBranchIds };
            console.log('✅ Showing all accessible branches');
          } else {
            const requestedBranchId = new mongoose.Types.ObjectId(branchId);
            const hasAccess = accessibleBranchIds.some(branchId => 
              branchId.toString() === requestedBranchId.toString()
            );
            
            if (!hasAccess) {
              return res.status(403).json({
                success: false,
                message: 'You do not have access to this branch'
              });
            }
            filter.branch = requestedBranchId;
            console.log(`✅ Filtering by branch: ${branchId}`);
          }
        } else {
          filter.branch = { $in: accessibleBranchIds };
          console.log('✅ Showing all accessible branches (no branch filter)');
        }
      } else {
        console.log('User has only OWN branch access');
        if (user.branch && user.branch._id) {
          filter.branch = user.branch._id;
          console.log(`✅ Filtering by own branch: ${user.branch._id}`);
        } else {
          return res.status(403).json({
            success: false,
            message: 'You do not have access to any branch'
          });
        }
      }
    } else {
      if (branchId) {
        if (branchId === 'all') {
          console.log('✅ Showing ALL branches (SUPERADMIN/ADMIN with "All" selected)');
        } else {
          filter.branch = new mongoose.Types.ObjectId(branchId);
          console.log(`✅ Filtering by branch: ${branchId}`);
        }
      } else {
        console.log('✅ Showing ALL branches (no branch filter)');
      }
    }

    // ========== DATE RANGE FILTER ==========
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    // ========== STATUS FILTER ==========
    if (status) {
      filter.status = status;
    } else {
      filter.status = { 
        $nin: ['CANCELLED', 'COMPLETED', 'CANCELLED_APPROVE', 'CANCELLED_REJECTED'] 
      };
    }

    console.log('Pending Verification Report Filter:', JSON.stringify(filter, null, 2));

    // ========== FETCH BOOKINGS ==========
    const bookingsQuery = Booking.find(filter)
      .populate('model', 'model_name type')
      .populate('color', 'name')
      .populate('branch', 'name')
      .populate('salesExecutive', 'name')
      .populate({
        path: 'payment.financer',
        select: 'name'
      })
      .sort({ createdAt: -1 });

    // ========== APPLY MODEL TYPE FILTER IF PROVIDED ==========
    if (modelType) {
      console.log(`Applying model type filter: ${modelType}`);
      
      const models = await mongoose.model('Model').find({ 
        type: modelType.toUpperCase()
      }).select('_id').lean();
      
      const modelIds = models.map(model => model._id);
      
      if (modelIds.length > 0) {
        bookingsQuery.where('model').in(modelIds);
        console.log(`Filtering by ${modelIds.length} ${modelType} models`);
      } else {
        console.log(`No ${modelType} models found`);
        if (format === 'excel') {
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet('Pending Verification Report');
          
          // Add headers even for empty report - BRANCH NAME AND BOOKING DATE AT START
          const headers = [
            'Branch Name',
            'Booking Date',
            'Booking Number',
            'Customer Name',
            'Mobile 1',
            'Mobile 2',
            'Model',
            'Model Type',
            'Color',
            'Booking Type',
            'Financier Name',
            'Deal Amount',
            'Pending Verification Amount',
            'Balance Amount',
            'Booking Status'
          ];
          
          const headerRow = worksheet.addRow(headers);
          headerRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF2E75B5' }
            };
          });
          
          const fileName = `pending_verification_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
          
          res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          );
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${fileName}"`
          );
          
          await workbook.xlsx.write(res);
          res.end();
          return;
        } else {
          return res.status(200).json({
            success: true,
            count: 0,
            totals: { 
              totalDealAmount: 0, 
              totalPendingAmount: 0, 
              totalBalanceAmount: 0
            },
            data: [],
            availableBranches: availableBranches,
            userAccessInfo: {
              hasAllBranchesAccess: hasAllBranchesAccess,
              branchAccess: branchAccess,
              accessibleBranchesCount: user.accessibleBranches?.length || 0,
              userBranch: user.branch ? {
                _id: user.branch._id,
                name: user.branch.name
              } : null
            },
            filters: {
              branchId: branchId,
              startDate: startDate,
              endDate: endDate,
              status: status,
              minPendingAmount: minPendingAmount,
              maxPendingAmount: maxPendingAmount,
              modelType: modelType,
              reportType: 'PENDING_VERIFICATION'
            }
          });
        }
      }
    }
    
    const bookings = await bookingsQuery.lean();

    console.log(`Found ${bookings.length} bookings`);

    const bookingIds = bookings.map(b => b._id);

    // ========== FETCH ALL LEDGER ENTRIES ==========
    // Fetch ALL ledger entries (both Approved and Pending)
    const allLedgerEntries = await Ledger.find({
      booking: { $in: bookingIds }
    })
    .select('amount paymentMode type approvalStatus isDebit booking')
    .lean();

    console.log(`Found ${allLedgerEntries.length} total ledger entries for these bookings`);

    // Separate approved and pending entries
    const ledgerByBooking = {};
    allLedgerEntries.forEach(entry => {
      const bookingId = entry.booking.toString();
      if (!ledgerByBooking[bookingId]) {
        ledgerByBooking[bookingId] = [];
      }
      ledgerByBooking[bookingId].push(entry);
    });

    // Process each booking to calculate financials - FOCUS ON PENDING AMOUNTS
    const processedBookings = bookings.map(booking => {
      const bookingLedgerEntries = ledgerByBooking[booking._id.toString()] || [];
      
      console.log(`Booking ${booking.bookingNumber}: ${bookingLedgerEntries.length} ledger entries found`);
      
      // Approved entries (verified)
      const approvedEntries = bookingLedgerEntries.filter(entry => 
        entry.approvalStatus === 'Approved' && !entry.isDebit
      );
      
      // Pending entries (waiting for verification)
      const pendingEntries = bookingLedgerEntries.filter(entry => 
        entry.approvalStatus === 'Pending' && !entry.isDebit
      );
      
      const totalApprovedAmount = approvedEntries.reduce((sum, entry) => 
        sum + (entry.amount || 0), 0);
      
      const totalPendingForApproval = pendingEntries.reduce((sum, entry) => 
        sum + (entry.amount || 0), 0);
      
      const dealAmount = booking.discountedAmount || 0;
      const balanceAmount = dealAmount - totalApprovedAmount;
      
      const bookingType = booking.payment?.type || '';
      
      let financierName = '';
      if (booking.payment?.type === 'FINANCE' && booking.payment?.financer) {
        if (typeof booking.payment.financer === 'object' && booking.payment.financer.name) {
          financierName = booking.payment.financer.name;
        } else if (typeof booking.payment.financer === 'string') {
          financierName = booking.payment.financer;
        }
      }
      
      return {
        ...booking,
        bookingType: bookingType,
        financierName: financierName,
        totalApprovedAmount: 0, // NOT SHOWN IN THIS REPORT, SET TO ZERO
        totalPendingForApproval,
        dealAmount,
        balanceAmount,
        approvedEntriesCount: approvedEntries.length,
        pendingEntriesCount: pendingEntries.length,
        ledgerEntriesCount: bookingLedgerEntries.length,
        hasPendingEntries: pendingEntries.length > 0,
        branchName: booking.branch?.name || '',
        formattedBookingDate: booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : ''
      };
    });

    // Filter bookings with pending verification amounts
    let pendingVerificationBookings = processedBookings.filter(booking => {
      return booking.totalPendingForApproval > 0;
    });

    // Apply pending amount range filter if specified
    if (minPendingAmount || maxPendingAmount) {
      pendingVerificationBookings = pendingVerificationBookings.filter(booking => {
        if (minPendingAmount && booking.totalPendingForApproval < parseFloat(minPendingAmount)) return false;
        if (maxPendingAmount && booking.totalPendingForApproval > parseFloat(maxPendingAmount)) return false;
        return true;
      });
    }

    console.log(`Found ${pendingVerificationBookings.length} bookings with pending verification amounts`);

    if (pendingVerificationBookings.length === 0) {
      if (format === 'excel') {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Pending Verification Report');
        
        // Add headers even for empty report - BRANCH NAME AND BOOKING DATE AT START
        const headers = [
          'Branch Name',
          'Booking Date',
          'Booking Number',
          'Customer Name',
          'Mobile 1',
          'Mobile 2',
          'Model',
          'Model Type',
          'Color',
          'Booking Type',
          'Financier Name',
          'Deal Amount',
          'Pending Verification Amount',
          'Balance Amount',
          'Booking Status'
        ];
        
        const headerRow = worksheet.addRow(headers);
        headerRow.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF2E75B5' }
          };
        });
        
        const fileName = `pending_verification_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
        
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${fileName}"`
        );
        
        await workbook.xlsx.write(res);
        res.end();
        return;
      } else {
        return res.status(200).json({
          success: true,
          count: 0,
          totals: { 
            totalDealAmount: 0, 
            totalPendingAmount: 0, 
            totalBalanceAmount: 0
          },
          data: [],
          availableBranches: availableBranches,
          userAccessInfo: {
            hasAllBranchesAccess: hasAllBranchesAccess,
            branchAccess: branchAccess,
            accessibleBranchesCount: user.accessibleBranches?.length || 0
          },
          message: 'No bookings with pending verification amounts found'
        });
      }
    }

    // ========== GENERATE EXCEL REPORT - PENDING VERIFICATION ==========
    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      
      let worksheetName = 'Pending Verification Report';
      if (filter.branch && typeof filter.branch === 'object' && !filter.branch.$in) {
        const branch = pendingVerificationBookings[0]?.branch;
        if (branch?.name) {
          worksheetName = `${branch.name} Pending Verification Report`;
        }
      } else if (hasAllBranchesAccess && (!branchId || branchId === 'all')) {
        worksheetName = 'All Branches Pending Verification Report';
      }
      
      const worksheet = workbook.addWorksheet(worksheetName);

      // DEFINE HEADERS - BRANCH NAME AND BOOKING DATE AT START, WITHOUT "Verified Amount" COLUMN
      const headers = [
        'Branch Name',
        'Booking Date',
        'Booking Number',
        'Customer Name',
        'Mobile 1',
        'Mobile 2',
        'Model',
        'Model Type',
        'Color',
        'Booking Type',
        'Financier Name',
        'Deal Amount',
        'Pending Verification Amount',
        'Balance Amount',
        'Booking Status'
      ];

      // Add headers row
      const headerRow = worksheet.addRow(headers);

      // Style the header row
      headerRow.eachCell((cell) => {
        cell.font = { 
          bold: true, 
          color: { argb: 'FFFFFFFF' },
          size: 11
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2E75B5' }
        };
        cell.alignment = { 
          vertical: 'middle', 
          horizontal: 'center',
          wrapText: true
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Set column widths
      worksheet.columns = [
        { key: 'branchName', width: 25 },
        { key: 'bookingDate', width: 15 },
        { key: 'bookingNumber', width: 18 },
        { key: 'customerName', width: 25 },
        { key: 'mobile1', width: 15 },
        { key: 'mobile2', width: 15 },
        { key: 'model', width: 20 },
        { key: 'modelType', width: 12 },
        { key: 'color', width: 15 },
        { key: 'bookingType', width: 15 },
        { key: 'financierName', width: 25 },
        { key: 'dealAmount', width: 18 },
        { key: 'pendingAmount', width: 18 },
        { key: 'balanceAmount', width: 18 },
        { key: 'status', width: 15 }
      ];

      // ADD DATA ROWS
      pendingVerificationBookings.forEach((booking) => {
        const rowData = {
          branchName: booking.branch?.name || '',
          bookingDate: booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : '',
          bookingNumber: booking.bookingNumber || '',
          customerName: booking.customerDetails?.name || '',
          mobile1: booking.customerDetails?.mobile1 || '',
          mobile2: booking.customerDetails?.mobile2 || '',
          model: booking.model?.model_name || '',
          modelType: booking.model?.type || '',
          color: booking.color?.name || '',
          bookingType: booking.bookingType || '',
          financierName: booking.financierName || '',
          dealAmount: booking.dealAmount || 0,
          pendingAmount: booking.totalPendingForApproval || 0,
          balanceAmount: booking.balanceAmount || 0,
          status: booking.status || ''
        };

        worksheet.addRow(rowData);
      });

      // Format amount columns and apply alternating row colors
      for (let i = 0; i < pendingVerificationBookings.length; i++) {
        const row = worksheet.getRow(i + 2); // +2 because row 1 is header
        
        // Format amount columns (Deal Amount, Pending Amount, Balance Amount)
        // Columns are 0-based: dealAmount (11), pendingAmount (12), balanceAmount (13)
        [11, 12, 13].forEach(colIndex => {
          const cell = row.getCell(colIndex + 1); // +1 because ExcelJS columns are 1-based
          if (typeof cell.value === 'number') {
            cell.numFmt = '#,##0.00';
            cell.alignment = { horizontal: 'right' };
          }
        });
        
        // Apply alternating row colors for better readability
        if (i % 2 === 0) {
          row.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF2F2F2' }
            };
          });
        }
      }

      // Apply auto-filter
      if (worksheet.rowCount > 1) {
        const lastColLetter = String.fromCharCode(64 + worksheet.columnCount);
        worksheet.autoFilter = {
          from: 'A1',
          to: `${lastColLetter}${worksheet.rowCount}`
        };
      }

      worksheet.views = [{ state: 'frozen', ySplit: 1 }];

      const fileName = `pending_verification_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
      
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`
      );

      await workbook.xlsx.write(res);
      res.end();

    } else {
      // ========== RETURN JSON FORMAT ==========
      const formattedBookings = pendingVerificationBookings.map(booking => {
        return {
          branchName: booking.branch?.name || '',
          bookingDate: booking.createdAt,
          formattedBookingDate: booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : '',
          bookingNumber: booking.bookingNumber,
          customerName: booking.customerDetails?.name || '',
          mobile1: booking.customerDetails?.mobile1 || '',
          mobile2: booking.customerDetails?.mobile2 || '',
          model: booking.model?.model_name || '',
          modelType: booking.model?.type || '',
          color: booking.color?.name || '',
          bookingType: booking.bookingType || '',
          financierName: booking.financierName || '',
          dealAmount: booking.dealAmount,
          pendingVerificationAmount: booking.totalPendingForApproval,
          balanceAmount: booking.balanceAmount,
          bookingStatus: booking.status || '',
          bookingId: booking._id,
          pendingEntriesCount: booking.pendingEntriesCount,
          reportType: 'PENDING_VERIFICATION'
        };
      });

      const totals = {
        totalDealAmount: pendingVerificationBookings.reduce((sum, booking) => 
          sum + booking.dealAmount, 0),
        totalPendingAmount: pendingVerificationBookings.reduce((sum, booking) => 
          sum + booking.totalPendingForApproval, 0),
        totalBalanceAmount: pendingVerificationBookings.reduce((sum, booking) => 
          sum + booking.balanceAmount, 0)
      };

      res.status(200).json({
        success: true,
        count: pendingVerificationBookings.length,
        totals: totals,
        data: formattedBookings,
        availableBranches: availableBranches,
        userAccessInfo: {
          hasAllBranchesAccess: hasAllBranchesAccess,
          branchAccess: branchAccess,
          accessibleBranchesCount: user.accessibleBranches?.length || 0,
          userBranch: user.branch ? {
            _id: user.branch._id,
            name: user.branch.name
          } : null
        },
        filters: {
          branchId: branchId,
          startDate: startDate,
          endDate: endDate,
          status: status,
          minPendingAmount: minPendingAmount,
          maxPendingAmount: maxPendingAmount,
          modelType: modelType,
          reportType: 'PENDING_VERIFICATION'
        },
        debug: {
          totalBookings: bookings.length,
          totalLedgerEntries: allLedgerEntries.length,
          totalPendingEntries: pendingVerificationBookings.reduce((sum, b) => sum + b.pendingEntriesCount, 0)
        }
      });
    }

  } catch (error) {
    console.error('Error generating pending verification report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating pending verification report',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Get all approved receipts filtered by approved date
 * @route GET /api/v1/reports/approved-receipts
 * @access Private
 */
/**
 * Get all approved receipts filtered by approval date
 * @route GET /api/v1/reports/approved-receipts
 * @access Private
 */

exports.generateVerifiedOutstandingReport = async (req, res) => {
  try {
    const {
      branchId,
      startDate,
      endDate,
      paymentMode,
      bookingNumber,
      customerId,
      bookingType,
      customerType,
      modelId,
      colorId,
      salesExecutiveId,
      page = 1,
      limit = 100,
      format = 'json'
    } = req.query;

    console.log('🔍 Received filters:', { 
      bookingNumber, 
      customerId,
      startDate, 
      endDate,
      paymentMode 
    });

    // ========== BRANCH ACCESS LOGIC ==========
    const userId = req.user.id;

    const user = await User.findById(userId)
      .select('-otp -otpExpires -emailOtp -emailOtpExpires -password')
      .populate({ path: 'roles', select: 'name isSuperAdmin permissionsCount' })
      .populate('branch')
      .populate({
        path: 'accessibleBranches',
        model: 'Branch',
        select: '_id name address city state pincode phone email is_active logo1'
      })
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userRoles = user.roles || [];
    const isActualSuperAdmin = userRoles.some(role => role.name === 'SUPERADMIN') || false;
    const isSuperAdminFlag = userRoles.some(role => role.isSuperAdmin === true) || false;
    const branchAccess = user.branchAccess || 'OWN';

    let hasAllBranchesAccess = false;
    if (isActualSuperAdmin || branchAccess === 'ALL' || isSuperAdminFlag) {
      hasAllBranchesAccess = true;
    }

    // ========== GET AVAILABLE BRANCHES FOR DROPDOWN ==========
    let availableBranches = [];
    if (hasAllBranchesAccess) {
      availableBranches = await Branch.find({ is_active: true })
        .select('_id name address city')
        .sort({ name: 1 })
        .lean();
    } else if (branchAccess === 'ASSIGNED' && user.accessibleBranches?.length) {
      availableBranches = user.accessibleBranches.map(b => ({
        _id: b._id, 
        name: b.name, 
        address: b.address, 
        city: b.city
      })).sort((a, b) => a.name.localeCompare(b.name));
    } else if (user.branch) {
      availableBranches = [{ 
        _id: user.branch._id, 
        name: user.branch.name, 
        address: user.branch.address, 
        city: user.branch.city 
      }];
    }

    // ========== BUILD BOOKING FILTER FIRST ==========
    let bookingFilter = {};

    // Apply branch access filter
    if (!hasAllBranchesAccess) {
      let allowedBranchIds = [];

      if (branchAccess === 'ASSIGNED' && user.accessibleBranches?.length) {
        allowedBranchIds = user.accessibleBranches.map(b => b._id);

        if (branchId && branchId !== 'all') {
          const requestedId = new mongoose.Types.ObjectId(branchId);
          const hasAccess = allowedBranchIds.some(id => id.toString() === requestedId.toString());
          if (!hasAccess) {
            return res.status(403).json({ success: false, message: 'You do not have access to this branch' });
          }
          allowedBranchIds = [requestedId];
        }
      } else if (user.branch?._id) {
        allowedBranchIds = [user.branch._id];
        
        if (branchId && branchId !== 'all' && branchId !== user.branch._id.toString()) {
          return res.status(403).json({ success: false, message: 'You do not have access to this branch' });
        }
      } else {
        return res.status(403).json({ success: false, message: 'You do not have access to any branch' });
      }

      bookingFilter.branch = { $in: allowedBranchIds };
    } else {
      // SuperAdmin - apply optional branch filter
      if (branchId && branchId !== 'all') {
        bookingFilter.branch = new mongoose.Types.ObjectId(branchId);
      }
    }

    // Apply booking-level filters
    if (bookingType) bookingFilter.bookingType = bookingType;
    if (customerType) bookingFilter.customerType = customerType;
    if (modelId) bookingFilter.model = new mongoose.Types.ObjectId(modelId);
    if (colorId) bookingFilter.color = new mongoose.Types.ObjectId(colorId);
    if (salesExecutiveId) bookingFilter.salesExecutive = new mongoose.Types.ObjectId(salesExecutiveId);
    
    // IMPORTANT FIX: Apply customerId filter directly to booking
    if (customerId) {
      bookingFilter['customerDetails.custId'] = customerId; // Exact match
      console.log('🔍 Filtering by customerId:', customerId);
    }
    
    // IMPORTANT FIX: Apply bookingNumber filter directly to booking
    if (bookingNumber) {
      bookingFilter.bookingNumber = new RegExp(bookingNumber, 'i'); // Case-insensitive partial match
      console.log('🔍 Filtering by bookingNumber:', bookingNumber);
    }

    // ========== GET MATCHING BOOKING IDS ==========
    let matchingBookingIds = [];
    if (Object.keys(bookingFilter).length > 0) {
      const matchingBookings = await Booking.find(bookingFilter).select('_id').lean();
      matchingBookingIds = matchingBookings.map(b => b._id);
      
      console.log(`📚 Found ${matchingBookingIds.length} bookings matching filters`);

      if (matchingBookingIds.length === 0) {
        return res.status(200).json({
          success: true,
          count: 0,
          totalCount: 0,
          totalPages: 0,
          currentPage: parseInt(page),
          summary: { totalReceipts: 0, totalAmount: 0, uniqueBookings: 0 },
          data: [],
          availableBranches,
          message: customerId ? `No bookings found for customer ID: ${customerId}` : 'No bookings found matching the specified filters'
        });
      }
    }

    // ========== BUILD LEDGER MATCH CRITERIA ==========
    let ledgerMatch = {
      approvalStatus: 'Approved',
      isDebit: { $ne: true }
    };

    // Apply booking filter to ledger if we have matching booking IDs
    if (matchingBookingIds.length > 0) {
      ledgerMatch.booking = { $in: matchingBookingIds };
    }

    // Apply date filter on approvedAt
    if (startDate || endDate) {
      ledgerMatch.approvedAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        ledgerMatch.approvedAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        ledgerMatch.approvedAt.$lte = end;
      }
    } else {
      // Default to last 30 days if no date range provided
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);
      ledgerMatch.approvedAt = { $gte: thirtyDaysAgo };
    }

    // Apply payment mode filter
    if (paymentMode) {
      ledgerMatch.paymentMode = paymentMode;
    }

    console.log('🔍 Ledger match criteria:', JSON.stringify(ledgerMatch, null, 2));

    // ========== GET APPROVED LEDGERS ==========
    const ledgers = await Ledger.find(ledgerMatch)
      .populate({ path: 'subPaymentModeDetails', select: 'payment_mode name' })
      .populate({ path: 'approvedBy', select: 'name email' })
      .populate({ path: 'receivedByDetails', select: 'name email' })
      .sort({ approvedAt: -1 })
      .lean();

    console.log(`✅ Found ${ledgers.length} approved ledgers`);

    if (ledgers.length === 0) {
      // Check if there are any ledgers at all for debugging
      const totalLedgers = await Ledger.countDocuments({ approvalStatus: 'Approved' });
      console.log(`📊 Total approved ledgers in DB: ${totalLedgers}`);
      
      return res.status(200).json({
        success: true,
        count: 0,
        totalCount: 0,
        totalPages: 0,
        currentPage: parseInt(page),
        summary: { totalReceipts: 0, totalAmount: 0, uniqueBookings: 0 },
        data: [],
        availableBranches,
        filters: {
          approvalDateRange: { startDate: startDate || null, endDate: endDate || null },
          selectedBranch: branchId || null,
          paymentMode: paymentMode || 'All',
          customerId: customerId || null,
          bookingNumber: bookingNumber || null
        },
        message: 'No approved receipts found for the specified filters'
      });
    }

    const ledgerIds = ledgers.map(l => l._id);

    // Build ledger map for quick lookup
    const ledgerMap = {};
    ledgers.forEach(ledger => {
      ledgerMap[ledger._id.toString()] = ledger;
    });

    // ========== GET RECEIPTS FOR THOSE LEDGERS ==========
    let receipts = await Receipt.find({
      ledger: { $in: ledgerIds },
      status: 'active'
    })
      .populate({ path: 'createdBy', select: 'name email' })
      .populate({ path: 'receivedBy', select: 'name email' })
      .lean();

    console.log(`✅ Found ${receipts.length} receipts for the approved ledgers`);

    // Debug: Log all receipt customer IDs
    receipts.forEach((r, i) => {
      console.log(`Receipt ${i+1}:`, {
        receiptNumber: r.receiptNumber,
        custId: r.customer?.custId,
        bookingNumber: r.bookingNumber
      });
    });

    // Handle receipts that exist in ledger but NOT in Receipt collection
    const receiptLedgerIds = new Set(receipts.map(r => r.ledger?.toString()));
    const missingReceiptLedgers = ledgers.filter(l => !receiptLedgerIds.has(l._id.toString()));

    if (missingReceiptLedgers.length > 0) {
      console.warn(`⚠️ ${missingReceiptLedgers.length} approved ledgers have NO matching Receipt document — including them from ledger data`);

      const syntheticReceipts = missingReceiptLedgers.map(ledger => ({
        _id: null,
        booking: ledger.booking,
        ledger: ledger._id,
        bookingNumber: ledger.bookingNumber || '',
        customer: { 
          name: '', 
          custId: ledger.custId || '' 
        },
        receiptNumber: ledger.receiptNumber || `LEDGER-${ledger._id}`,
        receiptDate: ledger.receiptDate || ledger.createdAt,
        amount: ledger.amount || 0,
        netAmount: ledger.amount || 0,
        gcAmount: ledger.gcAmount || 0,
        paymentMode: ledger.paymentMode || '',
        transactionReference: ledger.transactionReference || '',
        status: 'active',
        createdBy: ledger.receivedBy || null,
        receivedBy: ledger.receivedBy || null,
        _fromLedgerOnly: true
      }));

      receipts = [...receipts, ...syntheticReceipts];
    }

    // ========== COLLECT ALL BOOKING IDs FROM RECEIPTS ==========
    const allBookingIds = [
      ...new Set(
        receipts
          .map(r => r.booking?.toString())
          .filter(Boolean)
      )
    ].map(id => new mongoose.Types.ObjectId(id));

    // ========== GET BOOKING DETAILS ==========
    let bookingMap = {};
    if (allBookingIds.length > 0) {
      const bookings = await Booking.find({ _id: { $in: allBookingIds } })
        .populate({ path: 'vehicle', select: 'chassisNumber engineNumber' })
        .populate({ path: 'model', select: 'model_name' })
        .populate({ path: 'color', select: 'name' })
        .populate({ path: 'branch', select: 'name address city' })
        .lean();

      bookings.forEach(b => {
        bookingMap[b._id.toString()] = b;
      });
      console.log(`✅ Fetched ${bookings.length} booking details`);
    }

    // ========== FINAL SAFETY FILTER - Ensure customerId matches exactly ==========
    if (customerId) {
      const beforeFilter = receipts.length;
      receipts = receipts.filter(r => {
        const booking = r.booking ? bookingMap[r.booking.toString()] : null;
        const receiptCustId = r.customer?.custId;
        const bookingCustId = booking?.customerDetails?.custId;
        
        // Check if either the receipt or booking has the matching customer ID
        const matches = receiptCustId === customerId || bookingCustId === customerId;
        
        if (!matches) {
          console.log('❌ Filtering out receipt:', {
            receiptNumber: r.receiptNumber,
            receiptCustId,
            bookingCustId,
            expectedCustomerId: customerId
          });
        }
        
        return matches;
      });
      console.log(`🔍 After customerId filter: ${beforeFilter} -> ${receipts.length} receipts`);
    }

    if (receipts.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        totalCount: 0,
        totalPages: 0,
        currentPage: parseInt(page),
        summary: { totalReceipts: 0, totalAmount: 0, uniqueBookings: 0 },
        data: [],
        availableBranches,
        message: customerId ? `No receipts found for customer ID: ${customerId}` : 'No receipts found after applying filters'
      });
    }

    // ========== MERGE RECEIPT + LEDGER + BOOKING DATA ==========
    const enrichedReceipts = receipts.map(receipt => {
      const ledger = ledgerMap[receipt.ledger?.toString()] || {};
      const booking = receipt.booking ? bookingMap[receipt.booking.toString()] : null;

      // Chassis / Engine number resolution
      let chassisNumber = booking?.chassisNumber || booking?.vehicle?.chassisNumber || '';
      let engineNumber = booking?.engineNumber || booking?.vehicle?.engineNumber || '';

      // Customer name resolution - PRIORITIZE RECEIPT DATA
      let customerName = receipt.customer?.name || booking?.customerDetails?.name || '';
      let customerCustId = receipt.customer?.custId || booking?.customerDetails?.custId || '';

      // Sub payment mode resolution
      let subPaymentMode = '';
      if (ledger.subPaymentModeDetails) {
        if (Array.isArray(ledger.subPaymentModeDetails) && ledger.subPaymentModeDetails.length > 0) {
          subPaymentMode = ledger.subPaymentModeDetails[0].payment_mode || ledger.subPaymentModeDetails[0].name || '';
        } else if (typeof ledger.subPaymentModeDetails === 'object') {
          subPaymentMode = ledger.subPaymentModeDetails.payment_mode || ledger.subPaymentModeDetails.name || '';
        }
      }
      if (!subPaymentMode && receipt.paymentDetails?.subPaymentMode) {
        subPaymentMode = receipt.paymentDetails.subPaymentMode.name || receipt.paymentDetails.subPaymentMode.code || '';
      }

      // Approver name resolution
      let approverName = '';
      if (ledger.approvedBy) {
        if (typeof ledger.approvedBy === 'object') {
          approverName = ledger.approvedBy.name || ledger.approvedBy.email || ledger.approvedBy.toString();
        } else {
          approverName = ledger.approvedBy.toString();
        }
      }

      return {
        ...receipt,
        ledger,
        bookingDetails: booking,
        approvalDate: ledger.approvedAt,
        receiptDate: receipt.receiptDate,
        chassisNumber,
        engineNumber,
        branchName: booking?.branch?.name || '',
        branchId: booking?.branch?._id?.toString() || '',
        customerName,
        customerCustId, // Include this for debugging
        subPaymentMode,
        approvedBy: approverName,
        approvedById: ledger.approvedBy?._id || ledger.approvedBy,
        approvedAt: ledger.approvedAt,
        receivedByName: receipt.receivedBy?.name || '',
        createdByName: receipt.createdBy?.name || '',
        receiptType: 'Receipt'
      };
    });

    // ========== SORT BY APPROVAL DATE (most recent first) ==========
    enrichedReceipts.sort((a, b) => new Date(b.approvalDate) - new Date(a.approvalDate));

    // ========== PAGINATION ==========
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;

    const paginatedReceipts = enrichedReceipts.slice(startIndex, endIndex);
    const totalPages = Math.ceil(enrichedReceipts.length / limitNum);

    // ========== EXCEL FORMAT ==========
    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();

      let worksheetName = 'Approved Receipts';
      if (branchId && branchId !== 'all') {
        const branch = await Branch.findById(branchId).select('name').lean();
        if (branch?.name) worksheetName = `${branch.name} Approved Receipts`;
      }

      const worksheet = workbook.addWorksheet(worksheetName);

      worksheet.columns = [
        { header: 'S.No', key: 'sno', width: 8 },
        { header: 'Receipt Number', key: 'receiptNumber', width: 25 },
        { header: 'Receipt Date', key: 'receiptDate', width: 15 },
        { header: 'Approval Date', key: 'approvalDate', width: 15 },
        { header: 'Approved By', key: 'approvedBy', width: 25 },
        { header: 'Booking Number', key: 'bookingNumber', width: 20 },
        { header: 'Customer ID', key: 'customerId', width: 15 },
        { header: 'Branch Name', key: 'branchName', width: 25 },
        { header: 'Chassis Number', key: 'chassisNumber', width: 25 },
        { header: 'Engine Number', key: 'engineNumber', width: 25 },
        { header: 'Payment Mode', key: 'paymentMode', width: 15 },
        { header: 'Sub Payment Mode', key: 'subPaymentMode', width: 20 },
        { header: 'Amount (₹)', key: 'amount', width: 15, style: { numFmt: '#,##0.00' } },
        { header: 'Customer Name', key: 'customerName', width: 25 },
        { header: 'Transaction Reference', key: 'transactionReference', width: 25 },
        { header: 'Received By', key: 'receivedBy', width: 25 },
        { header: 'Created By', key: 'createdBy', width: 25 }
      ];

      paginatedReceipts.forEach((receipt, index) => {
        worksheet.addRow({
          sno: startIndex + index + 1,
          receiptNumber: receipt.receiptNumber || '',
          receiptDate: receipt.receiptDate ? moment(receipt.receiptDate).format('DD/MM/YYYY') : '',
          approvalDate: receipt.approvalDate ? moment(receipt.approvalDate).format('DD/MM/YYYY') : '',
          approvedBy: receipt.approvedBy || '',
          bookingNumber: receipt.bookingNumber || receipt.bookingDetails?.bookingNumber || '',
          customerId: receipt.customerCustId || '',
          branchName: receipt.branchName || '',
          chassisNumber: receipt.chassisNumber || '',
          engineNumber: receipt.engineNumber || '',
          paymentMode: receipt.paymentMode || receipt.ledger?.paymentMode || '',
          subPaymentMode: receipt.subPaymentMode || '',
          amount: receipt.netAmount || receipt.amount || receipt.ledger?.amount || 0,
          customerName: receipt.customerName || '',
          transactionReference: receipt.transactionReference || receipt.ledger?.transactionReference || '',
          receivedBy: receipt.receivedByName || '',
          createdBy: receipt.createdByName || ''
        });
      });

      const headerRow = worksheet.getRow(1);
      headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4CAF50' } };
      });

      const fileName = `approved_receipts_${moment().format('YYYY-MM-DD')}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      await workbook.xlsx.write(res);
      return res.end();
    }

    // ========== JSON FORMAT ==========
    const formattedReceipts = paginatedReceipts.map(receipt => ({
      receiptNumber: receipt.receiptNumber,
      receiptDate: receipt.receiptDate ? moment(receipt.receiptDate).format('YYYY-MM-DD') : null,
      approvalDate: receipt.approvalDate ? moment(receipt.approvalDate).format('YYYY-MM-DD') : null,
      approvedBy: receipt.approvedBy,
      approvedById: receipt.approvedById,
      bookingNumber: receipt.bookingNumber || receipt.bookingDetails?.bookingNumber,
      branchName: receipt.branchName,
      branchId: receipt.branchId,
      vehicle: {
        chassisNumber: receipt.chassisNumber,
        engineNumber: receipt.engineNumber
      },
      payment: {
        mode: receipt.paymentMode || receipt.ledger?.paymentMode,
        subPaymentMode: receipt.subPaymentMode,
        amount: receipt.netAmount || receipt.amount || receipt.ledger?.amount,
        transactionReference: receipt.transactionReference || receipt.ledger?.transactionReference
      },
      customer: {
        name: receipt.customerName,
        custId: receipt.customerCustId || receipt.customer?.custId || receipt.bookingDetails?.customerDetails?.custId
      },
      receivedBy: receipt.receivedByName,
      createdBy: receipt.createdByName,
      bookingId: receipt.booking?.toString() || receipt.bookingDetails?._id?.toString(),
      _fromLedgerOnly: receipt._fromLedgerOnly || false
    }));

    // Summary calculations
    const totalAmount = enrichedReceipts.reduce((sum, r) => sum + (r.netAmount || r.amount || r.ledger?.amount || 0), 0);
    const uniqueBookings = [...new Set(enrichedReceipts.map(r => r.booking?.toString()).filter(Boolean))];

    const approvalDates = enrichedReceipts.map(r => r.approvalDate).filter(Boolean);
    const minApprovalDate = approvalDates.length > 0 ? new Date(Math.min(...approvalDates.map(d => new Date(d)))) : null;
    const maxApprovalDate = approvalDates.length > 0 ? new Date(Math.max(...approvalDates.map(d => new Date(d)))) : null;

    return res.status(200).json({
      success: true,
      count: paginatedReceipts.length,
      totalCount: enrichedReceipts.length,
      totalPages,
      currentPage: pageNum,
      summary: {
        totalReceipts: enrichedReceipts.length,
        totalAmount,
        uniqueBookings: uniqueBookings.length,
        approvalDateRange: {
          from: minApprovalDate ? moment(minApprovalDate).format('YYYY-MM-DD') : null,
          to: maxApprovalDate ? moment(maxApprovalDate).format('YYYY-MM-DD') : null
        },
        paymentModeBreakdown: {
          bank: enrichedReceipts.filter(r => (r.paymentMode || r.ledger?.paymentMode) === 'Bank').length,
          cash: enrichedReceipts.filter(r => (r.paymentMode || r.ledger?.paymentMode) === 'Cash').length,
          exchange: enrichedReceipts.filter(r => (r.paymentMode || r.ledger?.paymentMode) === 'Exchange').length,
          other: enrichedReceipts.filter(r => {
            const mode = r.paymentMode || r.ledger?.paymentMode;
            return mode && !['Bank', 'Cash', 'Exchange'].includes(mode);
          }).length
        }
      },
      data: formattedReceipts,
      availableBranches,
      filters: {
        approvalDateRange: { startDate: startDate || null, endDate: endDate || null },
        selectedBranch: branchId || null,
        paymentMode: paymentMode || 'All',
        customerId: customerId || null,
        bookingNumber: bookingNumber || null
      },
      message: `Found ${enrichedReceipts.length} receipts for customer ID: ${customerId || 'all'}`
    });

  } catch (error) {
    console.error('❌ Error fetching approved receipts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching approved receipts',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
exports.getApprovedReceipts = async (req, res) => {
  try {
    const {
      branchId,
      startDate,
      endDate,
      paymentMode,
      bookingNumber,
      customerId,
      bookingType,
      customerType,
      modelId,
      colorId,
      salesExecutiveId,
      page = 1,
      limit = 100,
      format = 'json'
    } = req.query;

    console.log('🔍 Received filters:', { 
      bookingNumber, 
      customerId,
      startDate, 
      endDate,
      paymentMode 
    });

    // ========== BRANCH ACCESS LOGIC ==========
    const userId = req.user.id;

    const user = await User.findById(userId)
      .select('-otp -otpExpires -emailOtp -emailOtpExpires -password')
      .populate({ path: 'roles', select: 'name isSuperAdmin permissionsCount' })
      .populate('branch')
      .populate({
        path: 'accessibleBranches',
        model: 'Branch',
        select: '_id name address city state pincode phone email is_active logo1'
      })
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userRoles = user.roles || [];
    const isActualSuperAdmin = userRoles.some(role => role.name === 'SUPERADMIN') || false;
    const isSuperAdminFlag = userRoles.some(role => role.isSuperAdmin === true) || false;
    const branchAccess = user.branchAccess || 'OWN';

    let hasAllBranchesAccess = false;
    if (isActualSuperAdmin || branchAccess === 'ALL' || isSuperAdminFlag) {
      hasAllBranchesAccess = true;
    }

    // ========== GET AVAILABLE BRANCHES FOR DROPDOWN ==========
    let availableBranches = [];
    if (hasAllBranchesAccess) {
      availableBranches = await Branch.find({ is_active: true })
        .select('_id name address city')
        .sort({ name: 1 })
        .lean();
    } else if (branchAccess === 'ASSIGNED' && user.accessibleBranches?.length) {
      availableBranches = user.accessibleBranches.map(b => ({
        _id: b._id, 
        name: b.name, 
        address: b.address, 
        city: b.city
      })).sort((a, b) => a.name.localeCompare(b.name));
    } else if (user.branch) {
      availableBranches = [{ 
        _id: user.branch._id, 
        name: user.branch.name, 
        address: user.branch.address, 
        city: user.branch.city 
      }];
    }

    // ========== BUILD BOOKING FILTER FIRST ==========
    let bookingFilter = {};

    // Apply branch access filter
    if (!hasAllBranchesAccess) {
      let allowedBranchIds = [];

      if (branchAccess === 'ASSIGNED' && user.accessibleBranches?.length) {
        allowedBranchIds = user.accessibleBranches.map(b => b._id);

        if (branchId && branchId !== 'all') {
          const requestedId = new mongoose.Types.ObjectId(branchId);
          const hasAccess = allowedBranchIds.some(id => id.toString() === requestedId.toString());
          if (!hasAccess) {
            return res.status(403).json({ success: false, message: 'You do not have access to this branch' });
          }
          allowedBranchIds = [requestedId];
        }
      } else if (user.branch?._id) {
        allowedBranchIds = [user.branch._id];
        
        if (branchId && branchId !== 'all' && branchId !== user.branch._id.toString()) {
          return res.status(403).json({ success: false, message: 'You do not have access to this branch' });
        }
      } else {
        return res.status(403).json({ success: false, message: 'You do not have access to any branch' });
      }

      bookingFilter.branch = { $in: allowedBranchIds };
    } else {
      // SuperAdmin - apply optional branch filter
      if (branchId && branchId !== 'all') {
        bookingFilter.branch = new mongoose.Types.ObjectId(branchId);
      }
    }

    // Apply booking-level filters
    if (bookingType) bookingFilter.bookingType = bookingType;
    if (customerType) bookingFilter.customerType = customerType;
    if (modelId) bookingFilter.model = new mongoose.Types.ObjectId(modelId);
    if (colorId) bookingFilter.color = new mongoose.Types.ObjectId(colorId);
    if (salesExecutiveId) bookingFilter.salesExecutive = new mongoose.Types.ObjectId(salesExecutiveId);
    
    // IMPORTANT FIX: Apply customerId filter directly to booking
    if (customerId) {
      bookingFilter['customerDetails.custId'] = customerId; // Exact match
      console.log('🔍 Filtering by customerId:', customerId);
    }
    
    // IMPORTANT FIX: Apply bookingNumber filter directly to booking
    if (bookingNumber) {
      bookingFilter.bookingNumber = new RegExp(bookingNumber, 'i'); // Case-insensitive partial match
      console.log('🔍 Filtering by bookingNumber:', bookingNumber);
    }

    // ========== GET MATCHING BOOKING IDS ==========
    let matchingBookingIds = [];
    if (Object.keys(bookingFilter).length > 0) {
      const matchingBookings = await Booking.find(bookingFilter).select('_id').lean();
      matchingBookingIds = matchingBookings.map(b => b._id);
      
      console.log(`📚 Found ${matchingBookingIds.length} bookings matching filters`);

      if (matchingBookingIds.length === 0) {
        return res.status(200).json({
          success: true,
          count: 0,
          totalCount: 0,
          totalPages: 0,
          currentPage: parseInt(page),
          summary: { totalReceipts: 0, totalAmount: 0, uniqueBookings: 0 },
          data: [],
          availableBranches,
          message: customerId ? `No bookings found for customer ID: ${customerId}` : 'No bookings found matching the specified filters'
        });
      }
    }

    // ========== BUILD LEDGER MATCH CRITERIA ==========
    let ledgerMatch = {
      approvalStatus: 'Approved',
      isDebit: { $ne: true }
    };

    // Apply booking filter to ledger if we have matching booking IDs
    if (matchingBookingIds.length > 0) {
      ledgerMatch.booking = { $in: matchingBookingIds };
    }

    // Apply date filter on approvedAt
    if (startDate || endDate) {
      ledgerMatch.approvedAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        ledgerMatch.approvedAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        ledgerMatch.approvedAt.$lte = end;
      }
    } else {
      // Default to last 30 days if no date range provided
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);
      ledgerMatch.approvedAt = { $gte: thirtyDaysAgo };
    }

    // Apply payment mode filter
    if (paymentMode) {
      ledgerMatch.paymentMode = paymentMode;
    }

    console.log('🔍 Ledger match criteria:', JSON.stringify(ledgerMatch, null, 2));

    // ========== GET APPROVED LEDGERS ==========
    const ledgers = await Ledger.find(ledgerMatch)
      .populate({ path: 'subPaymentModeDetails', select: 'payment_mode name' })
      .populate({ path: 'approvedBy', select: 'name email' })
      .populate({ path: 'receivedByDetails', select: 'name email' })
      .sort({ approvedAt: -1 })
      .lean();

    console.log(`✅ Found ${ledgers.length} approved ledgers`);

    if (ledgers.length === 0) {
      // Check if there are any ledgers at all for debugging
      const totalLedgers = await Ledger.countDocuments({ approvalStatus: 'Approved' });
      console.log(`📊 Total approved ledgers in DB: ${totalLedgers}`);
      
      return res.status(200).json({
        success: true,
        count: 0,
        totalCount: 0,
        totalPages: 0,
        currentPage: parseInt(page),
        summary: { totalReceipts: 0, totalAmount: 0, uniqueBookings: 0 },
        data: [],
        availableBranches,
        filters: {
          approvalDateRange: { startDate: startDate || null, endDate: endDate || null },
          selectedBranch: branchId || null,
          paymentMode: paymentMode || 'All',
          customerId: customerId || null,
          bookingNumber: bookingNumber || null
        },
        message: 'No approved receipts found for the specified filters'
      });
    }

    const ledgerIds = ledgers.map(l => l._id);

    // Build ledger map for quick lookup
    const ledgerMap = {};
    ledgers.forEach(ledger => {
      ledgerMap[ledger._id.toString()] = ledger;
    });

    // ========== GET RECEIPTS FOR THOSE LEDGERS ==========
    let receipts = await Receipt.find({
      ledger: { $in: ledgerIds },
      status: 'active'
    })
      .populate({ path: 'createdBy', select: 'name email' })
      .populate({ path: 'receivedBy', select: 'name email' })
      .lean();

    console.log(`✅ Found ${receipts.length} receipts for the approved ledgers`);

    // Debug: Log all receipt customer IDs
    receipts.forEach((r, i) => {
      console.log(`Receipt ${i+1}:`, {
        receiptNumber: r.receiptNumber,
        custId: r.customer?.custId,
        bookingNumber: r.bookingNumber
      });
    });

    // Handle receipts that exist in ledger but NOT in Receipt collection
    const receiptLedgerIds = new Set(receipts.map(r => r.ledger?.toString()));
    const missingReceiptLedgers = ledgers.filter(l => !receiptLedgerIds.has(l._id.toString()));

    if (missingReceiptLedgers.length > 0) {
      console.warn(`⚠️ ${missingReceiptLedgers.length} approved ledgers have NO matching Receipt document — including them from ledger data`);

      const syntheticReceipts = missingReceiptLedgers.map(ledger => ({
        _id: null,
        booking: ledger.booking,
        ledger: ledger._id,
        bookingNumber: ledger.bookingNumber || '',
        customer: { 
          name: '', 
          custId: ledger.custId || '' 
        },
        receiptNumber: ledger.receiptNumber || `LEDGER-${ledger._id}`,
        receiptDate: ledger.receiptDate || ledger.createdAt,
        amount: ledger.amount || 0,
        netAmount: ledger.amount || 0,
        gcAmount: ledger.gcAmount || 0,
        paymentMode: ledger.paymentMode || '',
        transactionReference: ledger.transactionReference || '',
        status: 'active',
        createdBy: ledger.receivedBy || null,
        receivedBy: ledger.receivedBy || null,
        _fromLedgerOnly: true
      }));

      receipts = [...receipts, ...syntheticReceipts];
    }

    // ========== COLLECT ALL BOOKING IDs FROM RECEIPTS ==========
    const allBookingIds = [
      ...new Set(
        receipts
          .map(r => r.booking?.toString())
          .filter(Boolean)
      )
    ].map(id => new mongoose.Types.ObjectId(id));

    // ========== GET BOOKING DETAILS ==========
    let bookingMap = {};
    if (allBookingIds.length > 0) {
      const bookings = await Booking.find({ _id: { $in: allBookingIds } })
        .populate({ path: 'vehicle', select: 'chassisNumber engineNumber' })
        .populate({ path: 'model', select: 'model_name' })
        .populate({ path: 'color', select: 'name' })
        .populate({ path: 'branch', select: 'name address city' })
        .lean();

      bookings.forEach(b => {
        bookingMap[b._id.toString()] = b;
      });
      console.log(`✅ Fetched ${bookings.length} booking details`);
    }

    // ========== FINAL SAFETY FILTER - Ensure customerId matches exactly ==========
    if (customerId) {
      const beforeFilter = receipts.length;
      receipts = receipts.filter(r => {
        const booking = r.booking ? bookingMap[r.booking.toString()] : null;
        const receiptCustId = r.customer?.custId;
        const bookingCustId = booking?.customerDetails?.custId;
        
        // Check if either the receipt or booking has the matching customer ID
        const matches = receiptCustId === customerId || bookingCustId === customerId;
        
        if (!matches) {
          console.log('❌ Filtering out receipt:', {
            receiptNumber: r.receiptNumber,
            receiptCustId,
            bookingCustId,
            expectedCustomerId: customerId
          });
        }
        
        return matches;
      });
      console.log(`🔍 After customerId filter: ${beforeFilter} -> ${receipts.length} receipts`);
    }

    if (receipts.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        totalCount: 0,
        totalPages: 0,
        currentPage: parseInt(page),
        summary: { totalReceipts: 0, totalAmount: 0, uniqueBookings: 0 },
        data: [],
        availableBranches,
        message: customerId ? `No receipts found for customer ID: ${customerId}` : 'No receipts found after applying filters'
      });
    }

    // ========== MERGE RECEIPT + LEDGER + BOOKING DATA ==========
    const enrichedReceipts = receipts.map(receipt => {
      const ledger = ledgerMap[receipt.ledger?.toString()] || {};
      const booking = receipt.booking ? bookingMap[receipt.booking.toString()] : null;

      // Chassis / Engine number resolution
      let chassisNumber = booking?.chassisNumber || booking?.vehicle?.chassisNumber || '';
      let engineNumber = booking?.engineNumber || booking?.vehicle?.engineNumber || '';

      // Customer name resolution - PRIORITIZE RECEIPT DATA
      let customerName = receipt.customer?.name || booking?.customerDetails?.name || '';
      let customerCustId = receipt.customer?.custId || booking?.customerDetails?.custId || '';

      // Sub payment mode resolution
      let subPaymentMode = '';
      if (ledger.subPaymentModeDetails) {
        if (Array.isArray(ledger.subPaymentModeDetails) && ledger.subPaymentModeDetails.length > 0) {
          subPaymentMode = ledger.subPaymentModeDetails[0].payment_mode || ledger.subPaymentModeDetails[0].name || '';
        } else if (typeof ledger.subPaymentModeDetails === 'object') {
          subPaymentMode = ledger.subPaymentModeDetails.payment_mode || ledger.subPaymentModeDetails.name || '';
        }
      }
      if (!subPaymentMode && receipt.paymentDetails?.subPaymentMode) {
        subPaymentMode = receipt.paymentDetails.subPaymentMode.name || receipt.paymentDetails.subPaymentMode.code || '';
      }

      // Approver name resolution
      let approverName = '';
      if (ledger.approvedBy) {
        if (typeof ledger.approvedBy === 'object') {
          approverName = ledger.approvedBy.name || ledger.approvedBy.email || ledger.approvedBy.toString();
        } else {
          approverName = ledger.approvedBy.toString();
        }
      }

      return {
        ...receipt,
        ledger,
        bookingDetails: booking,
        approvalDate: ledger.approvedAt,
        receiptDate: receipt.receiptDate,
        chassisNumber,
        engineNumber,
        branchName: booking?.branch?.name || '',
        branchId: booking?.branch?._id?.toString() || '',
        customerName,
        customerCustId, // Include this for debugging
        subPaymentMode,
        approvedBy: approverName,
        approvedById: ledger.approvedBy?._id || ledger.approvedBy,
        approvedAt: ledger.approvedAt,
        receivedByName: receipt.receivedBy?.name || '',
        createdByName: receipt.createdBy?.name || '',
        receiptType: 'Receipt'
      };
    });

    // ========== SORT BY APPROVAL DATE (most recent first) ==========
    enrichedReceipts.sort((a, b) => new Date(b.approvalDate) - new Date(a.approvalDate));

    // ========== PAGINATION ==========
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;

    const paginatedReceipts = enrichedReceipts.slice(startIndex, endIndex);
    const totalPages = Math.ceil(enrichedReceipts.length / limitNum);

    // ========== EXCEL FORMAT ==========
    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();

      let worksheetName = 'Approved Receipts';
      if (branchId && branchId !== 'all') {
        const branch = await Branch.findById(branchId).select('name').lean();
        if (branch?.name) worksheetName = `${branch.name} Approved Receipts`;
      }

      const worksheet = workbook.addWorksheet(worksheetName);

      worksheet.columns = [
        { header: 'S.No', key: 'sno', width: 8 },
        { header: 'Receipt Number', key: 'receiptNumber', width: 25 },
        { header: 'Receipt Date', key: 'receiptDate', width: 15 },
        { header: 'Approval Date', key: 'approvalDate', width: 15 },
        { header: 'Approved By', key: 'approvedBy', width: 25 },
        { header: 'Booking Number', key: 'bookingNumber', width: 20 },
        { header: 'Customer ID', key: 'customerId', width: 15 },
        { header: 'Branch Name', key: 'branchName', width: 25 },
        { header: 'Chassis Number', key: 'chassisNumber', width: 25 },
        { header: 'Engine Number', key: 'engineNumber', width: 25 },
        { header: 'Payment Mode', key: 'paymentMode', width: 15 },
        { header: 'Sub Payment Mode', key: 'subPaymentMode', width: 20 },
        { header: 'Amount (₹)', key: 'amount', width: 15, style: { numFmt: '#,##0.00' } },
        { header: 'Customer Name', key: 'customerName', width: 25 },
        { header: 'Transaction Reference', key: 'transactionReference', width: 25 },
        { header: 'Received By', key: 'receivedBy', width: 25 },
        { header: 'Created By', key: 'createdBy', width: 25 }
      ];

      paginatedReceipts.forEach((receipt, index) => {
        worksheet.addRow({
          sno: startIndex + index + 1,
          receiptNumber: receipt.receiptNumber || '',
          receiptDate: receipt.receiptDate ? moment(receipt.receiptDate).format('DD/MM/YYYY') : '',
          approvalDate: receipt.approvalDate ? moment(receipt.approvalDate).format('DD/MM/YYYY') : '',
          approvedBy: receipt.approvedBy || '',
          bookingNumber: receipt.bookingNumber || receipt.bookingDetails?.bookingNumber || '',
          customerId: receipt.customerCustId || '',
          branchName: receipt.branchName || '',
          chassisNumber: receipt.chassisNumber || '',
          engineNumber: receipt.engineNumber || '',
          paymentMode: receipt.paymentMode || receipt.ledger?.paymentMode || '',
          subPaymentMode: receipt.subPaymentMode || '',
          amount: receipt.netAmount || receipt.amount || receipt.ledger?.amount || 0,
          customerName: receipt.customerName || '',
          transactionReference: receipt.transactionReference || receipt.ledger?.transactionReference || '',
          receivedBy: receipt.receivedByName || '',
          createdBy: receipt.createdByName || ''
        });
      });

      const headerRow = worksheet.getRow(1);
      headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4CAF50' } };
      });

      const fileName = `approved_receipts_${moment().format('YYYY-MM-DD')}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      await workbook.xlsx.write(res);
      return res.end();
    }

    // ========== JSON FORMAT ==========
    const formattedReceipts = paginatedReceipts.map(receipt => ({
      receiptNumber: receipt.receiptNumber,
      receiptDate: receipt.receiptDate ? moment(receipt.receiptDate).format('YYYY-MM-DD') : null,
      approvalDate: receipt.approvalDate ? moment(receipt.approvalDate).format('YYYY-MM-DD') : null,
      approvedBy: receipt.approvedBy,
      approvedById: receipt.approvedById,
      bookingNumber: receipt.bookingNumber || receipt.bookingDetails?.bookingNumber,
      branchName: receipt.branchName,
      branchId: receipt.branchId,
      vehicle: {
        chassisNumber: receipt.chassisNumber,
        engineNumber: receipt.engineNumber
      },
      payment: {
        mode: receipt.paymentMode || receipt.ledger?.paymentMode,
        subPaymentMode: receipt.subPaymentMode,
        amount: receipt.netAmount || receipt.amount || receipt.ledger?.amount,
        transactionReference: receipt.transactionReference || receipt.ledger?.transactionReference
      },
      customer: {
        name: receipt.customerName,
        custId: receipt.customerCustId || receipt.customer?.custId || receipt.bookingDetails?.customerDetails?.custId
      },
      receivedBy: receipt.receivedByName,
      createdBy: receipt.createdByName,
      bookingId: receipt.booking?.toString() || receipt.bookingDetails?._id?.toString(),
      _fromLedgerOnly: receipt._fromLedgerOnly || false
    }));

    // Summary calculations
    const totalAmount = enrichedReceipts.reduce((sum, r) => sum + (r.netAmount || r.amount || r.ledger?.amount || 0), 0);
    const uniqueBookings = [...new Set(enrichedReceipts.map(r => r.booking?.toString()).filter(Boolean))];

    const approvalDates = enrichedReceipts.map(r => r.approvalDate).filter(Boolean);
    const minApprovalDate = approvalDates.length > 0 ? new Date(Math.min(...approvalDates.map(d => new Date(d)))) : null;
    const maxApprovalDate = approvalDates.length > 0 ? new Date(Math.max(...approvalDates.map(d => new Date(d)))) : null;

    return res.status(200).json({
      success: true,
      count: paginatedReceipts.length,
      totalCount: enrichedReceipts.length,
      totalPages,
      currentPage: pageNum,
      summary: {
        totalReceipts: enrichedReceipts.length,
        totalAmount,
        uniqueBookings: uniqueBookings.length,
        approvalDateRange: {
          from: minApprovalDate ? moment(minApprovalDate).format('YYYY-MM-DD') : null,
          to: maxApprovalDate ? moment(maxApprovalDate).format('YYYY-MM-DD') : null
        },
        paymentModeBreakdown: {
          bank: enrichedReceipts.filter(r => (r.paymentMode || r.ledger?.paymentMode) === 'Bank').length,
          cash: enrichedReceipts.filter(r => (r.paymentMode || r.ledger?.paymentMode) === 'Cash').length,
          exchange: enrichedReceipts.filter(r => (r.paymentMode || r.ledger?.paymentMode) === 'Exchange').length,
          other: enrichedReceipts.filter(r => {
            const mode = r.paymentMode || r.ledger?.paymentMode;
            return mode && !['Bank', 'Cash', 'Exchange'].includes(mode);
          }).length
        }
      },
      data: formattedReceipts,
      availableBranches,
      filters: {
        approvalDateRange: { startDate: startDate || null, endDate: endDate || null },
        selectedBranch: branchId || null,
        paymentMode: paymentMode || 'All',
        customerId: customerId || null,
        bookingNumber: bookingNumber || null
      },
      message: `Found ${enrichedReceipts.length} receipts for customer ID: ${customerId || 'all'}`
    });

  } catch (error) {
    console.error('❌ Error fetching approved receipts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching approved receipts',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

exports.generateDummyInvoiceReport = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      branchId,
      status,
      format = 'excel' 
    } = req.query;

    // Build filter conditions
    const filter = {};

    // Get user info from auth middleware
    const userId = req.user.id;
    
    // Fetch user with all necessary data
    const user = await User.findById(userId)
      .select('-otp -otpExpires -emailOtp -emailOtpExpires -password')
      .populate({
        path: 'roles',
        select: 'name isSuperAdmin permissionsCount'
      })
      .populate('branch')
      .populate({
        path: 'accessibleBranches',
        model: 'Branch',
        select: '_id name address city state pincode phone email is_active logo1'
      })
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`🏢 User's branch: ${user.branch?.name || 'None'}`);
    console.log(`🔑 Branch Access Type: ${user.branchAccess || 'OWN'}`);
    
    // Check user roles
    const userRoles = user.roles || [];
    const isActualSuperAdmin = userRoles.some(role => role.name === "SUPERADMIN") || false;
    const isSuperAdminFlag = userRoles.some(role => role.isSuperAdmin === true) || false;
    const branchAccess = user.branchAccess || 'OWN';
    
    // Check if user has all branches access
    let hasAllBranchesAccess = false;
    
    if (isActualSuperAdmin || branchAccess === 'ALL' || isSuperAdminFlag) {
      hasAllBranchesAccess = true;
      console.log('✅ User has ALL branch access permission');
    }

    // ========== GET AVAILABLE BRANCHES FOR DROPDOWN ==========
    let availableBranches = [];
    
    if (hasAllBranchesAccess) {
      availableBranches = await Branch.find({ is_active: true })
        .select('_id name address city')
        .sort({ name: 1 })
        .lean();
    } else if (branchAccess === 'ASSIGNED' && user.accessibleBranches) {
      availableBranches = user.accessibleBranches.map(branch => ({
        _id: branch._id,
        name: branch.name,
        address: branch.address,
        city: branch.city
      })).sort((a, b) => a.name.localeCompare(b.name));
    } else if (user.branch) {
      availableBranches = [{
        _id: user.branch._id,
        name: user.branch.name,
        address: user.branch.address,
        city: user.branch.city
      }];
    }
    
    // Add "All" option for users with multiple branch access
    if (availableBranches.length > 1) {
      availableBranches.unshift({
        _id: 'all',
        name: 'All Branches',
        address: '',
        city: ''
      });
    }

    // ========== APPLY BRANCH FILTER ==========
    if (!hasAllBranchesAccess) {
      if (branchAccess === 'ASSIGNED' && user.accessibleBranches && user.accessibleBranches.length > 0) {
        const accessibleBranchIds = user.accessibleBranches.map(branch => branch._id);
        
        if (branchId) {
          if (branchId === 'all') {
            filter.branch = { $in: accessibleBranchIds };
          } else {
            const requestedBranchId = new mongoose.Types.ObjectId(branchId);
            const hasAccess = accessibleBranchIds.some(bId => 
              bId.toString() === requestedBranchId.toString()
            );
            
            if (!hasAccess) {
              return res.status(403).json({
                success: false,
                message: 'You do not have access to this branch'
              });
            }
            filter.branch = requestedBranchId;
          }
        } else {
          filter.branch = { $in: accessibleBranchIds };
        }
      } else if (user.branch && user.branch._id) {
        filter.branch = user.branch._id;
      } else {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to any branch'
        });
      }
    } else if (branchId && branchId !== 'all') {
      filter.branch = new mongoose.Types.ObjectId(branchId);
    }

    // ========== DATE RANGE FILTER ==========
    if (startDate || endDate) {
      filter.invoiceDate = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.invoiceDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.invoiceDate.$lte = end;
      }
    }

    // ========== STATUS FILTER ==========
    if (status) {
      filter.status = status;
    }

    console.log('Generated filter:', JSON.stringify(filter, null, 2));
    
    // ========== FETCH DUMMY INVOICES ==========
    const invoices = await DummyInvoice.find(filter)
      .populate({
        path: 'booking',
        select: 'bookingNumber model color chassisNumber customerDetails bookingNumber',
        populate: [
          { path: 'model', select: 'model_name' },
          { path: 'color', select: 'name' }
        ]
      })
      .populate('createdBy', 'name email')
      .populate('headerPrices.header', 'header_key')
      .sort({ invoiceDate: -1 })
      .lean();

    console.log(`Found ${invoices.length} dummy invoices`);

    if (invoices.length === 0 && format === 'json') {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
        availableBranches: availableBranches,
        userAccessInfo: {
          hasAllBranchesAccess: hasAllBranchesAccess,
          branchAccess: branchAccess,
          accessibleBranchesCount: user.accessibleBranches?.length || 0
        }
      });
    }

    // ========== GET ALL UNIQUE HEADERS FOR DYNAMIC COLUMNS ==========
    const headerMap = new Map();
    
    invoices.forEach(invoice => {
      if (invoice.headerPrices && invoice.headerPrices.length > 0) {
        invoice.headerPrices.forEach(price => {
          if (price.header && price.header_key && !headerMap.has(price.header_key)) {
            headerMap.set(price.header_key, {
              header_key: price.header_key,
              index: headerMap.size
            });
          }
        });
      }
    });

    const priceHeaders = Array.from(headerMap.values());
    
    // Sort headers alphabetically for consistent column order
    priceHeaders.sort((a, b) => a.header_key.localeCompare(b.header_key));

    // ========== GENERATE EXCEL REPORT ==========
    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      
      let worksheetName = 'Dummy Invoice Report';
      if (filter.branch && typeof filter.branch === 'object' && !filter.branch.$in) {
        worksheetName = `Invoice Report`;
      } else if (hasAllBranchesAccess && !branchId) {
        worksheetName = 'All Branches Invoice Report';
      }
      
      const worksheet = workbook.addWorksheet(worksheetName);

      // Define headers - EXACTLY as requested
      const headers = [
        'Sr. No',
        'Booking ID',
        'Model Name',
        'Customer Name',
        'Chassis Number',
        'Booking Date',
        'Invoice Date',
        'Invoice Number',
        'Created By Name'
      ];

      // Add dynamic price headers
      priceHeaders.forEach(header => {
        headers.push(header.header_key);
      });

      // Add total amount header at the end
      headers.push('Total Amount');

      // Set worksheet columns
      const columns = headers.map((header, index) => {
        let width = 15;
        
        if (header === 'Sr. No') width = 8;
        else if (header === 'Booking ID') width = 18;
        else if (header === 'Model Name') width = 20;
        else if (header === 'Customer Name') width = 25;
        else if (header === 'Chassis Number') width = 20;
        else if (header === 'Booking Date') width = 12;
        else if (header === 'Invoice Date') width = 12;
        else if (header === 'Invoice Number') width = 18;
        else if (header === 'Created By Name') width = 20;
        else if (header === 'Total Amount') width = 15;
        else width = 15; // For dynamic price headers

        return {
          header: header,
          key: `col_${index}`,
          width: width,
          style: header === 'Total Amount' || priceHeaders.some(ph => ph.header_key === header) ? 
                 { numFmt: '#,##0.00' } : {}
        };
      });

      worksheet.columns = columns;

      // Add data rows
      invoices.forEach((invoice, index) => {
        const rowData = {};
        
        // Sr. No
        rowData['col_0'] = index + 1;
        
        // Booking ID
        rowData['col_1'] = invoice.booking?.bookingNumber || '';
        
        // Model Name
        rowData['col_2'] = invoice.booking?.model?.model_name || invoice.bookingInfo?.modelName || '';
        
        // Customer Name
        rowData['col_3'] = invoice.customerInfo?.name || invoice.booking?.customerDetails?.name || '';
        
        // Chassis Number
        rowData['col_4'] = invoice.booking?.chassisNumber || invoice.bookingInfo?.chassisNumber || '';
        
        // Booking Date
        rowData['col_5'] = invoice.booking?.createdAt ? 
          moment(invoice.booking.createdAt).format('DD/MM/YYYY') : 
          (invoice.bookingInfo?.bookingDate ? moment(invoice.bookingInfo.bookingDate).format('DD/MM/YYYY') : '');
        
        // Invoice Date
        rowData['col_6'] = invoice.invoiceDate ? moment(invoice.invoiceDate).format('DD/MM/YYYY') : '';
        
        // Invoice Number
        rowData['col_7'] = invoice.invoiceNumber || '';
        
        // Created By Name
        rowData['col_8'] = invoice.createdByName || invoice.createdBy?.name || 'System';

        // Create price component map for this invoice
        const priceMap = new Map();
        if (invoice.headerPrices && invoice.headerPrices.length > 0) {
          invoice.headerPrices.forEach(price => {
            if (price.header_key) {
              priceMap.set(price.header_key, price.unitPrice || 0);
            }
          });
        }

        // Add dynamic price values (starting from column 9)
        priceHeaders.forEach((header, priceIndex) => {
          const columnIndex = 9 + priceIndex;
          rowData[`col_${columnIndex}`] = priceMap.get(header.header_key) || 0;
        });

        // Add total amount (last column)
        const totalAmountIndex = 9 + priceHeaders.length;
        rowData[`col_${totalAmountIndex}`] = invoice.totals?.totalAmount || 0;

        worksheet.addRow(rowData);
      });

      // Style the header row
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { 
          bold: true, 
          color: { argb: 'FFFFFFFF' },
          size: 11
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2E75B5' }
        };
        cell.alignment = { 
          vertical: 'middle', 
          horizontal: 'center',
          wrapText: true
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Format all amount columns
      for (let i = 1; i <= invoices.length; i++) {
        const row = worksheet.getRow(i + 1);
        
        // Format price header columns and total amount
        priceHeaders.forEach((header, priceIndex) => {
          const colIndex = 9 + priceIndex + 1; // +1 because Excel columns are 1-indexed
          const cell = row.getCell(colIndex);
          if (typeof cell.value === 'number') {
            cell.numFmt = '#,##0.00';
            cell.alignment = { horizontal: 'right' };
          }
        });
        
        // Format total amount column
        const totalColIndex = 9 + priceHeaders.length + 1;
        const totalCell = row.getCell(totalColIndex);
        if (typeof totalCell.value === 'number') {
          totalCell.numFmt = '#,##0.00';
          totalCell.alignment = { horizontal: 'right' };
          totalCell.font = { bold: true };
        }
      }

      // Auto-filter for all columns
      if (worksheet.rowCount > 1) {
        const lastColLetter = String.fromCharCode(64 + worksheet.columnCount);
        worksheet.autoFilter = {
          from: 'A1',
          to: `${lastColLetter}${worksheet.rowCount}`
        };
      }

      // Freeze header row
      worksheet.views = [
        { state: 'frozen', ySplit: 1 }
      ];

      // Set response headers for file download
      const fileName = `dummy_invoice_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
      
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`
      );

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } else {
      // ========== RETURN JSON FORMAT ==========
      const formattedInvoices = invoices.map((invoice, index) => {
        // Create price components object
        const priceComponents = {};
        if (invoice.headerPrices && invoice.headerPrices.length > 0) {
          invoice.headerPrices.forEach(price => {
            if (price.header_key) {
              priceComponents[price.header_key] = price.unitPrice || 0;
            }
          });
        }

        return {
          srNo: index + 1,
          bookingId: invoice.booking?.bookingNumber || invoice.bookingInfo?.bookingNumber || '',
          modelName: invoice.booking?.model?.model_name || invoice.bookingInfo?.modelName || '',
          customerName: invoice.customerInfo?.name || invoice.booking?.customerDetails?.name || '',
          chassisNumber: invoice.booking?.chassisNumber || invoice.bookingInfo?.chassisNumber || '',
          bookingDate: invoice.booking?.createdAt ? 
            moment(invoice.booking.createdAt).format('DD/MM/YYYY') : 
            (invoice.bookingInfo?.bookingDate ? moment(invoice.bookingInfo.bookingDate).format('DD/MM/YYYY') : ''),
          invoiceDate: invoice.invoiceDate ? moment(invoice.invoiceDate).format('DD/MM/YYYY') : '',
          invoiceNumber: invoice.invoiceNumber || '',
          createdByName: invoice.createdByName || invoice.createdBy?.name || 'System',
          priceComponents: priceComponents,
          totalAmount: invoice.totals?.totalAmount || 0,
          status: invoice.status
        };
      });

      // Calculate summary statistics
      const summary = {
        totalInvoices: formattedInvoices.length,
        totalAmount: formattedInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0),
        byStatus: {
          DRAFT: formattedInvoices.filter(inv => inv.status === 'DRAFT').length,
          FINAL: formattedInvoices.filter(inv => inv.status === 'FINAL').length,
          CANCELLED: formattedInvoices.filter(inv => inv.status === 'CANCELLED').length
        }
      };

      res.status(200).json({
        success: true,
        count: invoices.length,
        summary: summary,
        data: formattedInvoices,
        availableBranches: availableBranches,
        userAccessInfo: {
          hasAllBranchesAccess: hasAllBranchesAccess,
          branchAccess: branchAccess,
          accessibleBranchesCount: user.accessibleBranches?.length || 0,
          userBranch: user.branch ? {
            _id: user.branch._id,
            name: user.branch.name
          } : null
        },
        filters: {
          dateRange: filter.invoiceDate ? {
            start: filter.invoiceDate.$gte ? filter.invoiceDate.$gte.toISOString() : undefined,
            end: filter.invoiceDate.$lte ? filter.invoiceDate.$lte.toISOString() : undefined
          } : undefined,
          branchId: branchId,
          status: status
        },
        headers: {
          fixed: ['Sr. No', 'Booking ID', 'Model Name', 'Customer Name', 'Chassis Number', 
                  'Booking Date', 'Invoice Date', 'Invoice Number', 'Created By Name'],
          dynamic: priceHeaders.map(h => h.header_key),
          total: 'Total Amount'
        }
      });
    }

  } catch (error) {
    console.error('Error generating dummy invoice report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating dummy invoice report',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Get booking report filtered by allocation date
 * @route GET /api/reports/booking-allocation
 * @access Private (Admin, Manager, Accountant)
 */
exports.getBookingAllocationReport = async (req, res) => {
  try {
    const {
      branchId,
      startDate,
      endDate,
      status,
      bookingType,
      customerType,
      modelType,
      allocationStatus,
      paymentType,
      rto,
      format = 'json'
    } = req.query;

    // Validate required dates
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Set end date to end of day
    end.setHours(23, 59, 59, 999);

    // Validate date range
    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'Start date cannot be greater than end date'
      });
    }

    // Get user info from auth middleware
    const userId = req.user.id;
    
    // Fetch user with all necessary data
    const user = await User.findById(userId)
      .select('-otp -otpExpires -emailOtp -emailOtpExpires -password')
      .populate({
        path: 'roles',
        select: 'name isSuperAdmin permissionsCount'
      })
      .populate('branch')
      .populate({
        path: 'accessibleBranches',
        model: 'Branch',
        select: '_id name address city state pincode phone email is_active logo1'
      })
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`🏢 User's branch: ${user.branch?.name || 'None'}`);
    console.log(`🔑 Branch Access Type: ${user.branchAccess || 'OWN'}`);
    
    // Check user roles
    const userRoles = user.roles || [];
    
    // Check if user is SUPERADMIN
    const isActualSuperAdmin = userRoles.some(role => 
      role.name === "SUPERADMIN"
    ) || false;
    
    // Check if user has superadmin flag
    const isSuperAdminFlag = userRoles.some(role => 
      role.isSuperAdmin === true
    ) || false;
    
    // Get branch access from user
    const branchAccess = user.branchAccess || 'OWN';
    
    // Check if user has all branches access
    let hasAllBranchesAccess = false;
    
    if (isActualSuperAdmin) {
      hasAllBranchesAccess = true;
      console.log('✅ User is SUPERADMIN - has access to all branches');
    } else if (branchAccess === 'ALL') {
      hasAllBranchesAccess = true;
      console.log('✅ User has ALL branch access permission');
    } else if (isSuperAdminFlag) {
      hasAllBranchesAccess = true;
      console.log('✅ User is ADMIN/GM - has access to all branches');
    } else {
      console.log('ℹ️ User has restricted branch access');
    }

    // ========== GET AVAILABLE BRANCHES FOR DROPDOWN ==========
    let availableBranches = [];
    
    if (hasAllBranchesAccess) {
      // User can see all active branches
      availableBranches = await Branch.find({ is_active: true })
        .select('_id name address city')
        .sort({ name: 1 })
        .lean();
      console.log(`✅ Fetched ${availableBranches.length} total branches for dropdown`);
    } else if (branchAccess === 'ASSIGNED' && user.accessibleBranches) {
      // User can see only assigned branches
      availableBranches = user.accessibleBranches.map(branch => ({
        _id: branch._id,
        name: branch.name,
        address: branch.address,
        city: branch.city
      })).sort((a, b) => a.name.localeCompare(b.name));
      console.log(`✅ Using ${availableBranches.length} assigned branches for dropdown`);
    } else if (user.branch) {
      // User can see only their own branch
      availableBranches = [{
        _id: user.branch._id,
        name: user.branch.name,
        address: user.branch.address,
        city: user.branch.city
      }];
      console.log('✅ Using only own branch for dropdown');
    }
    
    // Add "All" option for users with multiple branch access
    if (availableBranches.length > 1) {
      availableBranches.unshift({
        _id: 'all',
        name: 'All Branches',
        address: '',
        city: ''
      });
      console.log('✅ Added "All Branches" option to dropdown');
    }

    // ========== BUILD FILTER CONDITIONS ==========
    
    // Build booking filter for ALLOCATED status
    const bookingFilter = {
      chassisAllocationStatus: 'ALLOCATED' // Only bookings with allocated chassis
    };

    // Apply branch filter
    if (!hasAllBranchesAccess) {
      if (branchAccess === 'ASSIGNED' && user.accessibleBranches && user.accessibleBranches.length > 0) {
        const accessibleBranchIds = user.accessibleBranches.map(branch => branch._id);
        
        if (branchId && branchId !== 'all') {
          const requestedBranchId = new mongoose.Types.ObjectId(branchId);
          const hasAccess = accessibleBranchIds.some(bId => 
            bId.toString() === requestedBranchId.toString()
          );
          
          if (!hasAccess) {
            return res.status(403).json({
              success: false,
              message: 'You do not have access to this branch'
            });
          }
          bookingFilter.branch = requestedBranchId;
        } else if (branchId === 'all') {
          bookingFilter.branch = { $in: accessibleBranchIds };
        } else {
          bookingFilter.branch = { $in: accessibleBranchIds };
        }
      } else {
        if (user.branch && user.branch._id) {
          bookingFilter.branch = user.branch._id;
        } else {
          return res.status(403).json({
            success: false,
            message: 'You do not have access to any branch'
          });
        }
      }
    } else {
      if (branchId && branchId !== 'all') {
        bookingFilter.branch = new mongoose.Types.ObjectId(branchId);
      }
    }

    // Apply additional filters
    if (status) bookingFilter.status = status;
    if (bookingType) bookingFilter.bookingType = bookingType;
    if (customerType) bookingFilter.customerType = customerType;
    if (paymentType) bookingFilter['payment.type'] = paymentType;
    if (rto) bookingFilter.rto = rto;

    console.log('Booking Filter:', JSON.stringify(bookingFilter, null, 2));

    // ========== FETCH BOOKINGS WITH ALLOCATED STATUS ==========
    // First, get all bookings with ALLOCATED status
    let bookingsQuery = Booking.find(bookingFilter)
      .populate('model', 'model_name type')
      .populate('color', 'name')
      .populate('branch', 'name address city')
      .populate('salesExecutive', 'name email mobile')
      .populate('createdBy', 'name email')
      .populate('verticleDetails', 'name')
      .populate({
        path: 'priceComponents.header',
        select: 'header_key category_key priority'
      })
      .populate({
        path: 'ledgerEntries',
        select: 'amount paymentMode type date approvalStatus isDebit',
        match: { approvalStatus: 'Approved' }
      })
      .populate('financeDisbursements', 'disbursementReference disbursementAmount receivedAmount status disbursementDate')
      .populate('exchangeDetails.broker', 'name mobile')
      .populate('payment.financer', 'name')
      .populate({
        path: 'accessories.accessory',
        select: 'name code category description',
        model: 'Accessory'
      })
      .populate({
        path: 'vehicle',
        select: 'chassisNumber engineNumber batteryNumber keyNumber motorNumber chargerNumber allocationHistory',
        model: 'Vehicle'
      });

    // Apply model type filter if provided
    if (modelType) {
      const models = await mongoose.model('Model').find({ 
        type: modelType.toUpperCase() 
      }).select('_id').lean();
      
      const modelIds = models.map(model => model._id);
      
      if (modelIds.length > 0) {
        bookingsQuery = bookingsQuery.where('model').in(modelIds);
      } else {
        // No models of this type found
        if (format === 'excel') {
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet('Allocation Report');
          const headers = getBaseHeaders();
          worksheet.columns = headers.map((header, index) => ({
            header: header,
            key: `col_${index}`,
            width: getColumnWidth(header)
          }));
          
          const fileName = `allocation_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
          
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
          
          await workbook.xlsx.write(res);
          res.end();
          return;
        } else {
          return res.status(200).json({
            success: true,
            count: 0,
            data: [],
            availableBranches: availableBranches,
            userAccessInfo: {
              hasAllBranchesAccess: hasAllBranchesAccess,
              branchAccess: branchAccess,
              accessibleBranchesCount: user.accessibleBranches?.length || 0,
              userBranch: user.branch ? {
                _id: user.branch._id,
                name: user.branch.name
              } : null
            },
            filters: {
              startDate: start,
              endDate: end,
              branchId: branchId,
              status: status,
              bookingType: bookingType,
              customerType: customerType,
              modelType: modelType,
              allocationStatus: 'ALLOCATED',
              paymentType: paymentType,
              rto: rto
            }
          });
        }
      }
    }

    // Execute query
    let bookings = await bookingsQuery.lean();

    console.log(`Found ${bookings.length} bookings with ALLOCATED status before date filtering`);

    // ========== FILTER BY ALLOCATION DATE USING VEHICLE ALLOCATION HISTORY ==========
    // This is the CORRECT way - filter by allocation date from vehicle history
    const filteredBookings = [];
    
    for (const booking of bookings) {
      let allocationDate = null;
      let allocationStatus = null;
      
      // Check vehicle allocation history
      if (booking.vehicle && booking.vehicle.allocationHistory && booking.vehicle.allocationHistory.length > 0) {
        // Find allocation entries for this booking with ALLOCATED status
        const allocationEntries = booking.vehicle.allocationHistory.filter(
          history => history.bookingId && 
                    history.bookingId.toString() === booking._id.toString() &&
                    history.status === 'ALLOCATED' // Only ALLOCATED status
        );
        
        if (allocationEntries.length > 0) {
          // Sort by date (most recent first)
          allocationEntries.sort((a, b) => new Date(b.allocatedAt) - new Date(a.allocatedAt));
          const latestAllocation = allocationEntries[0];
          
          allocationDate = latestAllocation.allocatedAt;
          allocationStatus = latestAllocation.status;
        }
      }
      
      // If allocation date found, check if it's within the requested date range
      if (allocationDate) {
        const allocDate = new Date(allocationDate);
        
        // Check if within range
        const isAfterStart = !startDate || allocDate >= start;
        const isBeforeEnd = !endDate || allocDate <= end;
        
        if (isAfterStart && isBeforeEnd) {
          // Add allocation info to booking
          booking.allocationDate = allocationDate;
          booking.allocationStatus = allocationStatus;
          filteredBookings.push(booking);
        }
      }
    }

    console.log(`After allocation date filtering, ${filteredBookings.length} records with ALLOCATED status in date range`);

    if (filteredBookings.length === 0) {
      if (format === 'excel') {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Allocation Report');
        const headers = getBaseHeaders();
        worksheet.columns = headers.map((header, index) => ({
          header: header,
          key: `col_${index}`,
          width: getColumnWidth(header)
        }));
        
        const fileName = `allocation_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        
        await workbook.xlsx.write(res);
        res.end();
        return;
      } else {
        return res.status(200).json({
          success: true,
          count: 0,
          data: [],
          availableBranches: availableBranches,
          userAccessInfo: {
            hasAllBranchesAccess: hasAllBranchesAccess,
            branchAccess: branchAccess,
            accessibleBranchesCount: user.accessibleBranches?.length || 0,
            userBranch: user.branch ? {
              _id: user.branch._id,
              name: user.branch.name
            } : null
          },
          filters: {
            startDate: start,
            endDate: end,
            branchId: branchId,
            status: status,
            bookingType: bookingType,
            customerType: customerType,
            modelType: modelType,
            allocationStatus: 'ALLOCATED',
            paymentType: paymentType,
            rto: rto
          }
        });
      }
    }

    // ========== GET DYNAMIC PRICE HEADERS FROM ALL BOOKINGS ==========
    // This ensures we capture ALL price headers that appear in ANY booking
    const headerMap = new Map();
    
    filteredBookings.forEach(booking => {
      if (booking.priceComponents && booking.priceComponents.length > 0) {
        // Sort by priority to maintain order
        const sortedComponents = [...booking.priceComponents].sort((a, b) => {
          const priorityA = a.header?.priority || 999;
          const priorityB = b.header?.priority || 999;
          return priorityA - priorityB;
        });

        sortedComponents.forEach(pc => {
          if (pc.header && pc.header.header_key && !headerMap.has(pc.header.header_key)) {
            headerMap.set(pc.header.header_key, {
              header_key: pc.header.header_key,
              priority: pc.header.priority || 999,
              index: headerMap.size
            });
          }
        });
      }
    });

    // Sort price headers by priority
    const priceHeaders = Array.from(headerMap.values())
      .sort((a, b) => a.priority - b.priority);

    console.log(`Found ${priceHeaders.length} dynamic price headers:`, priceHeaders.map(h => h.header_key));

    // ========== BUILD COMPLETE HEADERS LIST ==========
    // Base headers that are always present
    const baseHeaders = [
      'Booking Number',
      'Booking Date',
      'Allocation Date',
      'Branch Name',
      'Sales Executive',
      'Model',
      'Verticle',
      'Model Type',
      'Color',
      'Chassis Number',
      'Engine Number',
      'Customer Name',
      'Mobile1',
      'Mobile2',
      'Address',
      'Pincode',
      'Aadhar number',
      'Pan no',
      'Birthday',
      'Nominee Name',
      'Nominee Relation',
      'Nominee Age',
      'Booking Type',
      'Financier Name',
      'Customer Type',
      'GST Number',
      // Exchange Details Headers
      'Exchange Vehicle',
      'Exchange Vehicle Number',
      'Exchange Chassis Number',
      'Exchange Broker',
      'Exchange Price'
    ];

    // Combine all headers: base + dynamic price headers + totals
    const allHeaders = [
      ...baseHeaders,
      ...priceHeaders.map(ph => ph.header_key), // Dynamic price headers
      'Total Amount',
      'Total Discount Given',
      'Final Deal Amount',
      'Accessories'
    ];

    console.log(`Total headers: ${allHeaders.length}`);

    // ========== FORMAT DATA FOR REPORT ==========
    const reportData = filteredBookings.map(booking => {
      const model = booking.model || {};
      const color = booking.color || {};
      const branch = booking.branch || {};
      const salesExecutive = booking.salesExecutive || {};
      const financer = booking.payment?.financer || {};
      const broker = booking.exchangeDetails?.broker || {};
      const vehicleDetail = booking.vehicle || {};

      // Get verticle names
      let verticleNames = '';
      if (booking.verticleDetails && booking.verticleDetails.length > 0) {
        verticleNames = booking.verticleDetails
          .map(v => v.name || '')
          .filter(name => name !== '')
          .join(', ');
      } else if (booking.verticles && booking.verticles.length > 0) {
        verticleNames = 'Multiple';
      }

      // Create dynamic price components object with ALL headers
      const priceComponents = {};
      
      // Initialize all price headers with 0
      priceHeaders.forEach(ph => {
        priceComponents[ph.header_key] = 0;
      });
      
      // Fill in actual values where they exist
      if (booking.priceComponents && booking.priceComponents.length > 0) {
        booking.priceComponents.forEach(pc => {
          if (pc.header && pc.header.header_key) {
            priceComponents[pc.header.header_key] = pc.discountedValue || 0;
          }
        });
      }

      // Get accessories names
      let accessoriesText = '';
      if (Array.isArray(booking.accessories) && booking.accessories.length > 0) {
        const accessoryNamesArray = booking.accessories
          .map(acc => {
            if (acc.accessory && acc.accessory.name) {
              return acc.accessory.name;
            }
            return '';
          })
          .filter(name => name !== '');
        
        accessoriesText = accessoryNamesArray.join(', ');
      }

      // Calculate total discount
      const totalDiscount = (booking.totalAmount || 0) - (booking.discountedAmount || 0);

      // Build data object with dynamic properties
      const dataItem = {
        // Core fields
        bookingNumber: booking.bookingNumber || '',
        bookingDate: booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : '',
        allocationDate: booking.allocationDate ? moment(booking.allocationDate).format('DD/MM/YYYY') : '',
        branchName: branch.name || '',
        salesExecutive: salesExecutive.name || '',
        model: model.model_name || '',
        verticle: verticleNames,
        modelType: model.type || '',
        color: color.name || '',
        chassisNumber: booking.chassisNumber || vehicleDetail.chassisNumber || '',
        engineNumber: vehicleDetail.engineNumber || booking.engineNumber || '',
        customerName: booking.customerDetails?.name || '',
        mobile1: booking.customerDetails?.mobile1 || '',
        mobile2: booking.customerDetails?.mobile2 || '',
        address: booking.customerDetails?.address || '',
        pincode: booking.customerDetails?.pincode || '',
        aadharNumber: booking.customerDetails?.aadharNumber || '',
        panNo: booking.customerDetails?.panNo || '',
        birthday: booking.customerDetails?.dob ? moment(booking.customerDetails.dob).format('DD/MM/YYYY') : '',
        nomineeName: booking.customerDetails?.nomineeName || '',
        nomineeRelation: booking.customerDetails?.nomineeRelation || '',
        nomineeAge: booking.customerDetails?.nomineeAge || '',
        bookingType: booking.payment?.type || '',
        financierName: financer.name || '',
        customerType: booking.customerType || '',
        gstNumber: (booking.customerType === 'B2B') ? (booking.gstin || '') : '',
        
        // Exchange Details
        exchangeVehicle: booking.exchange ? 'YES' : 'NO',
        exchangeVehicleNumber: booking.exchangeDetails?.vehicleNumber || '',
        exchangeChassisNumber: booking.exchangeDetails?.chassisNumber || '',
        exchangeBroker: broker.name || '',
        exchangePrice: booking.exchangeDetails?.price || 0,
        
        // Dynamic Price Components - add all from priceComponents object
        ...priceComponents,
        
        // Totals
        totalAmount: booking.totalAmount || 0,
        totalDiscountGiven: totalDiscount,
        finalDealAmount: booking.discountedAmount || 0,
        accessories: accessoriesText
      };

      return dataItem;
    });

    // ========== GENERATE EXCEL REPORT ==========
    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      
      // Create worksheet name
      let worksheetName = 'Allocation Report';
      if (branchId && branchId !== 'all' && reportData.length > 0) {
        const branch = reportData[0]?.branchName;
        if (branch) {
          worksheetName = `${branch} Allocation Report`;
        }
      } else if (hasAllBranchesAccess && (!branchId || branchId === 'all')) {
        worksheetName = 'All Branches Allocation Report';
      }
      
      const worksheet = workbook.addWorksheet(worksheetName, {
        properties: { defaultRowHeight: 20 },
        pageSetup: { paperSize: 9, orientation: 'landscape' }
      });

      // Set worksheet columns with proper widths
      const columns = allHeaders.map((header, index) => ({
        header: header,
        key: `col_${index}`,
        width: getColumnWidth(header),
        style: {
          alignment: { vertical: 'middle', horizontal: getAlignment(header) },
          font: { size: 10 }
        }
      }));

      worksheet.columns = columns;

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.height = 30;
      headerRow.eachCell((cell) => {
        cell.font = { 
          bold: true, 
          color: { argb: 'FFFFFFFF' },
          size: 11,
          name: 'Arial'
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2E75B5' }
        };
        cell.alignment = { 
          vertical: 'middle', 
          horizontal: 'center',
          wrapText: true
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Add data rows dynamically
      reportData.forEach((item) => {
        const rowData = {};
        
        allHeaders.forEach((header, index) => {
          // Map header to item property - this works dynamically for all fields
          let value = '';
          
          // Handle special mapping for fields that might have different names
          if (header === 'Booking Number') value = item.bookingNumber;
          else if (header === 'Booking Date') value = item.bookingDate;
          else if (header === 'Allocation Date') value = item.allocationDate;
          else if (header === 'Branch Name') value = item.branchName;
          else if (header === 'Sales Executive') value = item.salesExecutive;
          else if (header === 'Model') value = item.model;
          else if (header === 'Verticle') value = item.verticle;
          else if (header === 'Model Type') value = item.modelType;
          else if (header === 'Color') value = item.color;
          else if (header === 'Chassis Number') value = item.chassisNumber;
          else if (header === 'Engine Number') value = item.engineNumber;
          else if (header === 'Customer Name') value = item.customerName;
          else if (header === 'Mobile1') value = item.mobile1;
          else if (header === 'Mobile2') value = item.mobile2;
          else if (header === 'Address') value = item.address;
          else if (header === 'Pincode') value = item.pincode;
          else if (header === 'Aadhar number') value = item.aadharNumber;
          else if (header === 'Pan no') value = item.panNo;
          else if (header === 'Birthday') value = item.birthday;
          else if (header === 'Nominee Name') value = item.nomineeName;
          else if (header === 'Nominee Relation') value = item.nomineeRelation;
          else if (header === 'Nominee Age') value = item.nomineeAge;
          else if (header === 'Booking Type') value = item.bookingType;
          else if (header === 'Financier Name') value = item.financierName;
          else if (header === 'Customer Type') value = item.customerType;
          else if (header === 'GST Number') value = item.gstNumber;
          else if (header === 'Exchange Vehicle') value = item.exchangeVehicle;
          else if (header === 'Exchange Vehicle Number') value = item.exchangeVehicleNumber;
          else if (header === 'Exchange Chassis Number') value = item.exchangeChassisNumber;
          else if (header === 'Exchange Broker') value = item.exchangeBroker;
          else if (header === 'Exchange Price') value = item.exchangePrice;
          else if (header === 'Total Amount') value = item.totalAmount;
          else if (header === 'Total Discount Given') value = item.totalDiscountGiven;
          else if (header === 'Final Deal Amount') value = item.finalDealAmount;
          else if (header === 'Accessories') value = item.accessories;
          else {
            // For dynamic price headers, get value from item directly
            // The property name should match the header exactly
            value = item[header] !== undefined ? item[header] : 0;
          }
          
          rowData[`col_${index}`] = value;
        });

        const row = worksheet.addRow(rowData);
        
        // Style data rows
        row.height = 20;
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const header = allHeaders[colNumber - 1];
          
          // Set alignment based on content type
          if (header.includes('Amount') || header.includes('Price') || 
              header.includes('Discount') || header.includes('Charges') ||
              header === 'Total Amount' || header === 'Final Deal Amount' ||
              header === 'Exchange Price') {
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
            if (typeof cell.value === 'number' && cell.value !== 0) {
              cell.numFmt = '#,##0.00';
            }
          } else if (header === 'Booking Number' || header === 'Chassis Number' || 
                    header === 'Engine Number' || header === 'Aadhar number' || 
                    header === 'Pan no' || header === 'Mobile1' || header === 'Mobile2' ||
                    header === 'Pincode' || header === 'Nominee Age') {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else {
            cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          }
          
          // Add borders
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });

      // Auto-filter for all columns
      if (worksheet.rowCount > 1) {
        const lastColLetter = String.fromCharCode(64 + worksheet.columnCount);
        worksheet.autoFilter = {
          from: 'A1',
          to: `${lastColLetter}${worksheet.rowCount}`
        };
      }

      // Freeze header row
      worksheet.views = [
        { state: 'frozen', ySplit: 1 }
      ];

      // Set response headers for file download
      const fileName = `allocation_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
      await workbook.xlsx.write(res);
      res.end();

    } else {
      // ========== RETURN JSON FORMAT ==========
      return res.status(200).json({
        success: true,
        count: reportData.length,
        data: reportData,
        priceHeaders: priceHeaders.map(ph => ph.header_key), // Return dynamic headers info
        availableBranches: availableBranches,
        userAccessInfo: {
          hasAllBranchesAccess: hasAllBranchesAccess,
          branchAccess: branchAccess,
          accessibleBranchesCount: user.accessibleBranches?.length || 0,
          userBranch: user.branch ? {
            _id: user.branch._id,
            name: user.branch.name
          } : null
        },
        filters: {
          startDate: start,
          endDate: end,
          branchId: branchId,
          status: status,
          bookingType: bookingType,
          customerType: customerType,
          modelType: modelType,
          allocationStatus: 'ALLOCATED',
          paymentType: paymentType,
          rto: rto
        },
        generatedAt: new Date()
      });
    }

  } catch (error) {
    console.error('Error in getBookingAllocationReport:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating booking allocation report',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Get base headers (without dynamic price headers)
 */
function getBaseHeaders() {
  return [
    'Booking Number',
    'Booking Date',
    'Allocation Date',
    'Branch Name',
    'Sales Executive',
    'Model',
    'Verticle',
    'Model Type',
    'Color',
    'Chassis Number',
    'Engine Number',
    'Customer Name',
    'Mobile1',
    'Mobile2',
    'Address',
    'Pincode',
    'Aadhar number',
    'Pan no',
    'Birthday',
    'Nominee Name',
    'Nominee Relation',
    'Nominee Age',
    'Booking Type',
    'Financier Name',
    'Customer Type',
    'GST Number',
    'Exchange Vehicle',
    'Exchange Vehicle Number',
    'Exchange Chassis Number',
    'Exchange Broker',
    'Exchange Price',
    'Total Amount',
    'Total Discount Given',
    'Final Deal Amount',
    'Accessories'
  ];
}

/**
 * Get column width based on header
 */
function getColumnWidth(header) {
  const widths = {
    'Booking Number': 18,
    'Booking Date': 12,
    'Allocation Date': 12,
    'Branch Name': 25,
    'Sales Executive': 25,
    'Model': 20,
    'Verticle': 20,
    'Model Type': 12,
    'Color': 15,
    'Chassis Number': 20,
    'Engine Number': 20,
    'Customer Name': 25,
    'Mobile1': 15,
    'Mobile2': 15,
    'Address': 40,
    'Pincode': 12,
    'Aadhar number': 20,
    'Pan no': 20,
    'Birthday': 12,
    'Nominee Name': 25,
    'Nominee Relation': 20,
    'Nominee Age': 15,
    'Booking Type': 15,
    'Financier Name': 25,
    'Customer Type': 15,
    'GST Number': 25,
    'Exchange Vehicle': 15,
    'Exchange Vehicle Number': 20,
    'Exchange Chassis Number': 20,
    'Exchange Broker': 25,
    'Exchange Price': 15,
    'Total Amount': 15,
    'Total Discount Given': 18,
    'Final Deal Amount': 18,
    'Accessories': 40
  };
  
  // For dynamic price headers, return standard width
  return widths[header] || 18;
}

/**
 * Get alignment based on header
 */
function getAlignment(header) {
  if (header.includes('Amount') || header.includes('Price') || 
      header.includes('Discount') || header.includes('Charges') ||
      header === 'Total Amount' || header === 'Final Deal Amount' ||
      header === 'Exchange Price') {
    return 'right';
  }
  if (header === 'Booking Number' || header === 'Chassis Number' || 
      header === 'Engine Number' || header === 'Aadhar number' || 
      header === 'Pan no' || header === 'Mobile1' || header === 'Mobile2' ||
      header === 'Pincode' || header === 'Nominee Age') {
    return 'center';
  }
  return 'left';
}

/**
 * Generate Insurance Report - Shows ONLY bookings with AWAITING and LATER insurance status
 * Comprehensive customer and vehicle information
 * @route GET /api/v1/reports/insurance/pending
 * @access Private
 */
// exports.generateInsurancePendingReport = async (req, res) => {
//   try {
//     const {
//       branchId,
//       bookingType,
//       customerType,
//       modelType,
//       format = 'excel'
//     } = req.query;

//     // ========== BRANCH ACCESS LOGIC ==========
//     const userId = req.user.id;
    
//     const user = await User.findById(userId)
//       .select('-otp -otpExpires -emailOtp -emailOtpExpires -password')
//       .populate({
//         path: 'roles',
//         select: 'name isSuperAdmin permissionsCount'
//       })
//       .populate('branch')
//       .populate({
//         path: 'accessibleBranches',
//         model: 'Branch',
//         select: '_id name'
//       })
//       .lean();

//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: 'User not found'
//       });
//     }

//     const userRoles = user.roles || [];
//     const isActualSuperAdmin = userRoles.some(role => role.name === "SUPERADMIN") || false;
//     const isSuperAdminFlag = userRoles.some(role => role.isSuperAdmin === true) || false;
//     const branchAccess = user.branchAccess || 'OWN';
    
//     let hasAllBranchesAccess = false;
    
//     if (isActualSuperAdmin || branchAccess === 'ALL' || isSuperAdminFlag) {
//       hasAllBranchesAccess = true;
//     }

//     // ========== GET AVAILABLE BRANCHES FOR DROPDOWN ==========
//     let availableBranches = [];
    
//     if (hasAllBranchesAccess) {
//       availableBranches = await Branch.find({ is_active: true })
//         .select('_id name')
//         .sort({ name: 1 })
//         .lean();
//     } else if (branchAccess === 'ASSIGNED' && user.accessibleBranches?.length) {
//       availableBranches = user.accessibleBranches.map(b => ({
//         _id: b._id,
//         name: b.name
//       })).sort((a, b) => a.name.localeCompare(b.name));
//     } else if (user.branch) {
//       availableBranches = [{
//         _id: user.branch._id,
//         name: user.branch.name
//       }];
//     }

//     // Add "All" option for users with multiple branch access
//     if (availableBranches.length > 1) {
//       availableBranches.unshift({
//         _id: 'all',
//         name: 'All Branches'
//       });
//     }

//     // ========== BUILD BOOKING FILTER ==========
//     // ONLY show AWAITING and LATER insurance status
//     const bookingFilter = {
//       insuranceStatus: { $in: ['AWAITING', 'LATER'] }
//     };

//     // Branch filter
//     if (!hasAllBranchesAccess) {
//       let allowedBranchIds = [];

//       if (branchAccess === 'ASSIGNED' && user.accessibleBranches?.length) {
//         allowedBranchIds = user.accessibleBranches.map(b => b._id);

//         if (branchId && branchId !== 'all') {
//           const requestedId = new mongoose.Types.ObjectId(branchId);
//           const hasAccess = allowedBranchIds.some(id => id.toString() === requestedId.toString());
//           if (!hasAccess) {
//             return res.status(403).json({
//               success: false,
//               message: 'You do not have access to this branch'
//             });
//           }
//           allowedBranchIds = [requestedId];
//         }
//       } else if (user.branch?._id) {
//         allowedBranchIds = [user.branch._id];
        
//         if (branchId && branchId !== 'all' && branchId !== user.branch._id.toString()) {
//           return res.status(403).json({
//             success: false,
//             message: 'You do not have access to this branch'
//           });
//         }
//       }

//       if (allowedBranchIds.length > 0) {
//         bookingFilter.branch = { $in: allowedBranchIds };
//       }
//     } else if (branchId && branchId !== 'all') {
//       bookingFilter.branch = new mongoose.Types.ObjectId(branchId);
//     }

//     // Apply additional filters
//     if (bookingType) bookingFilter.bookingType = bookingType;
//     if (customerType) bookingFilter.customerType = customerType;

//     // ========== FETCH BOOKINGS WITH INSURANCE STATUS AWAITING/LATER ==========
//     let bookingsQuery = Booking.find(bookingFilter)
//       .populate({
//         path: 'model',
//         select: 'model_name type'
//       })
//       .populate({
//         path: 'color',
//         select: 'name'
//       })
//       .populate({
//         path: 'branch',
//         select: 'name'
//       })
//       .populate({
//         path: 'vehicle',
//         select: 'chassisNumber engineNumber'
//       })
//       // ❌ REMOVED: .populate({ path: 'insuranceDetails', ... })
//       .sort({ createdAt: -1 });

//     // ========== APPLY MODEL TYPE FILTER IF PROVIDED ==========
//     if (modelType) {
//       const models = await mongoose.model('Model').find({ 
//         type: modelType.toUpperCase() 
//       }).select('_id').lean();
      
//       const modelIds = models.map(model => model._id);
      
//       if (modelIds.length > 0) {
//         bookingsQuery = bookingsQuery.where('model').in(modelIds);
//       } else {
//         // No models of this type found
//         if (format === 'excel') {
//           const workbook = new ExcelJS.Workbook();
//           const worksheet = workbook.addWorksheet('Insurance Pending Report');
          
//           // Add headers
//           const headers = [
//             'Sr. No',
//             'Booking ID',
//             'Model Name',
//             'Booking Date',
//             'Customer Name',
//             'Chassis Number',
//             'Engine Number',
//             'Insurance Status',
//             'Customer Information'
//           ];
          
//           worksheet.columns = headers.map((header, index) => ({
//             header: header,
//             key: `col_${index}`,
//             width: header === 'Customer Information' ? 60 : 20
//           }));
          
//           const fileName = `insurance_pending_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
          
//           res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
//           res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
          
//           await workbook.xlsx.write(res);
//           res.end();
//           return;
//         } else {
//           return res.status(200).json({
//             success: true,
//             count: 0,
//             data: [],
//             availableBranches: availableBranches,
//             userAccessInfo: {
//               hasAllBranchesAccess: hasAllBranchesAccess,
//               branchAccess: branchAccess,
//               accessibleBranchesCount: user.accessibleBranches?.length || 0
//             },
//             filters: {
//               branchId: branchId,
//               insuranceStatus: ['AWAITING', 'LATER'],
//               bookingType: bookingType,
//               customerType: customerType,
//               modelType: modelType
//             }
//           });
//         }
//       }
//     }
    
//     const bookings = await bookingsQuery.lean();

//     // ========== GENERATE EXCEL REPORT ==========
//     if (format === 'excel') {
//       const workbook = new ExcelJS.Workbook();
      
//       let worksheetName = 'Insurance Pending Report';
//       if (branchId && branchId !== 'all' && bookings.length > 0) {
//         worksheetName = `${bookings[0]?.branch?.name || ''} Insurance Pending`.trim();
//       } else if (hasAllBranchesAccess && (!branchId || branchId === 'all')) {
//         worksheetName = 'All Branches Insurance Pending';
//       }
      
//       const worksheet = workbook.addWorksheet(worksheetName, {
//         properties: { defaultRowHeight: 45 },
//         pageSetup: { paperSize: 9, orientation: 'landscape' }
//       });

//       // Define headers
//       const headers = [
//         'Sr. No',
//         'Booking ID',
//         'Model Name',
//         'Booking Date',
//         'Customer Name',
//         'Chassis Number',
//         'Engine Number',
//         'Insurance Status',
//         'Customer Information'
//       ];

//       // Set worksheet columns with proper widths
//       worksheet.columns = headers.map((header, index) => ({
//         header: header,
//         key: `col_${index}`,
//         width: header === 'Customer Information' ? 80 : 
//                header === 'Customer Name' ? 30 :
//                header === 'Booking ID' ? 20 : 18
//       }));

//       // Style header row
//       const headerRow = worksheet.getRow(1);
//       headerRow.height = 40;
//       headerRow.eachCell((cell) => {
//         cell.font = { 
//           bold: true, 
//           color: { argb: 'FFFFFFFF' },
//           size: 12,
//           name: 'Arial'
//         };
//         cell.fill = {
//           type: 'pattern',
//           pattern: 'solid',
//           fgColor: { argb: 'FF2E75B5' }
//         };
//         cell.alignment = { 
//           vertical: 'middle', 
//           horizontal: 'center',
//           wrapText: true
//         };
//         cell.border = {
//           top: { style: 'thin' },
//           left: { style: 'thin' },
//           bottom: { style: 'thin' },
//           right: { style: 'thin' }
//         };
//       });

//       // Add data rows
//       bookings.forEach((booking, index) => {
//         // Calculate age from DOB
//         let age = '';
//         if (booking.customerDetails?.dob) {
//           const dob = new Date(booking.customerDetails.dob);
//           const today = new Date();
//           age = today.getFullYear() - dob.getFullYear();
//           const m = today.getMonth() - dob.getMonth();
//           if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
//             age--;
//           }
//         }

//         // Format customer information exactly as shown in your example
//         const customerInfo = [
//           `Customer Name`,
//           `${booking.customerDetails?.salutation || ''} ${booking.customerDetails?.name || ''}`.trim(),
//           ``,
//           `Customer ID`,
//           booking.customerDetails?.custId || '',
//           ``,
//           `Address`,
//           booking.customerDetails?.address || '',
//           `${booking.customerDetails?.taluka || ''} ${booking.customerDetails?.district || ''} - ${booking.customerDetails?.pincode || ''}`.trim(),
//           ``,
//           `Mobile Numbers`,
//           booking.customerDetails?.mobile1 || '',
//           booking.customerDetails?.mobile2 || '',
//           ``,
//           `Identity Documents`,
//           `PAN:${booking.customerDetails?.panNo || ''}`,
//           `Aadhar:${booking.customerDetails?.aadharNumber || ''}`,
//           ``,
//           `Vehicle Information`,
//           `Model Name`,
//           booking.model?.model_name || '',
//           ``,
//           `Color`,
//           booking.color?.name || '',
//           ``,
//           `Chassis Number`,
//           booking.chassisNumber || booking.vehicle?.chassisNumber || '',
//           ``,
//           `Engine Number`,
//           booking.vehicle?.engineNumber || booking.engineNumber || '',
//           ``,
//           `Additional Information`,
//           `Occupation`,
//           booking.customerDetails?.occupation || '',
//           ``,
//           `Date of Birth`,
//           booking.customerDetails?.dob ? moment(booking.customerDetails.dob).format('DD/MM/YYYY') : '',
//           `Age: ${age} years`,
//           ``,
//           `Nominee`,
//           booking.customerDetails?.nomineeName || '',
//           booking.customerDetails?.nomineeRelation ? `(${booking.customerDetails.nomineeRelation})` : ''
//         ].join('\n');

//         const rowData = {
//           col_0: index + 1,
//           col_1: booking.bookingNumber || '',
//           col_2: booking.model?.model_name || '',
//           col_3: booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : '',
//           col_4: `${booking.customerDetails?.salutation || ''} ${booking.customerDetails?.name || ''}`.trim(),
//           col_5: booking.chassisNumber || booking.vehicle?.chassisNumber || '',
//           col_6: booking.vehicle?.engineNumber || booking.engineNumber || '',
//           col_7: booking.insuranceStatus || 'AWAITING',
//           col_8: customerInfo
//         };

//         const row = worksheet.addRow(rowData);
//         row.height = 400; // Tall row for customer information

//         // Style the row
//         row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
//           cell.alignment = {
//             vertical: 'top',
//             horizontal: colNumber === 9 ? 'left' : 'center', // Column 9 is Customer Information
//             wrapText: true
//           };
//           cell.border = {
//             top: { style: 'thin' },
//             left: { style: 'thin' },
//             bottom: { style: 'thin' },
//             right: { style: 'thin' }
//           };

//           // Color code insurance status
//           if (colNumber === 8) { // Insurance Status column (column H)
//             const status = cell.value;
//             if (status === 'AWAITING') {
//               cell.fill = {
//                 type: 'pattern',
//                 pattern: 'solid',
//                 fgColor: { argb: 'FFFFC7CE' } // Light red
//               };
//               cell.font = { bold: true, color: { argb: 'FF9C0006' } };
//             } else if (status === 'LATER') {
//               cell.fill = {
//                 type: 'pattern',
//                 pattern: 'solid',
//                 fgColor: { argb: 'FFFFE699' } // Light orange
//               };
//               cell.font = { bold: true, color: { argb: 'FF9C5700' } };
//             }
//           }

//           // Alternate row colors
//           if (index % 2 === 0 && colNumber !== 8) {
//             cell.fill = {
//               type: 'pattern',
//               pattern: 'solid',
//               fgColor: { argb: 'FFF2F2F2' }
//             };
//           }
//         });
//       });

//       // Auto-filter
//       if (worksheet.rowCount > 1) {
//         const lastColLetter = String.fromCharCode(64 + worksheet.columnCount);
//         worksheet.autoFilter = {
//           from: 'A1',
//           to: `${lastColLetter}${worksheet.rowCount}`
//         };
//       }

//       // Freeze header row
//       worksheet.views = [{ state: 'frozen', ySplit: 1 }];

//       // Add summary section
//       const summaryStartRow = worksheet.rowCount + 3;
      
//       // Summary title
//       worksheet.mergeCells(`A${summaryStartRow}:C${summaryStartRow}`);
//       const titleCell = worksheet.getCell(`A${summaryStartRow}`);
//       titleCell.value = 'INSURANCE PENDING SUMMARY';
//       titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
//       titleCell.fill = {
//         type: 'pattern',
//         pattern: 'solid',
//         fgColor: { argb: 'FF2E75B5' }
//       };
//       titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

//       // Summary data
//       const awaitingCount = bookings.filter(b => b.insuranceStatus === 'AWAITING').length;
//       const laterCount = bookings.filter(b => b.insuranceStatus === 'LATER').length;
      
//       const summaryData = [
//         ['Total Pending Bookings:', bookings.length],
//         ['AWAITING Status:', awaitingCount],
//         ['LATER Status:', laterCount]
//       ];

//       summaryData.forEach(([label, value], index) => {
//         const rowNum = summaryStartRow + 2 + index;
        
//         worksheet.getCell(`A${rowNum}`).value = label;
//         worksheet.getCell(`A${rowNum}`).font = { bold: true };
//         worksheet.getCell(`A${rowNum}`).alignment = { horizontal: 'right' };
        
//         worksheet.getCell(`B${rowNum}`).value = value;
//         worksheet.getCell(`B${rowNum}`).font = { bold: true };
//         worksheet.getCell(`B${rowNum}`).alignment = { horizontal: 'left' };
//       });

//       // Add footer with generation info
//       const footerRow = summaryStartRow + summaryData.length + 3;
//       worksheet.mergeCells(`A${footerRow}:C${footerRow}`);
//       const footerCell = worksheet.getCell(`A${footerRow}`);
//       footerCell.value = `Report generated on ${moment().format('DD MMM YYYY HH:mm:ss')} | Showing ONLY AWAITING and LATER insurance status`;
//       footerCell.font = { italic: true, size: 10, color: { argb: 'FF666666' } };
//       footerCell.alignment = { horizontal: 'center' };

//       // Set response headers
//       const fileName = `insurance_pending_report_${moment().format('YYYY-MM-DD_HH-mm')}.xlsx`;
      
//       res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
//       res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
//       await workbook.xlsx.write(res);
//       res.end();

//     } else {
//       // ========== RETURN JSON FORMAT ==========
//       const formattedBookings = bookings.map((booking, index) => {
//         // Calculate age from DOB
//         let age = '';
//         if (booking.customerDetails?.dob) {
//           const dob = new Date(booking.customerDetails.dob);
//           const today = new Date();
//           age = today.getFullYear() - dob.getFullYear();
//           const m = today.getMonth() - dob.getMonth();
//           if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
//             age--;
//           }
//         }

//         return {
//           srNo: index + 1,
//           bookingId: booking.bookingNumber,
//           modelName: booking.model?.model_name || '',
//           bookingDate: booking.createdAt ? moment(booking.createdAt).format('DD/MM/YYYY') : '',
//           customerInfo: {
//             name: `${booking.customerDetails?.salutation || ''} ${booking.customerDetails?.name || ''}`.trim(),
//             customerId: booking.customerDetails?.custId || '',
//             address: booking.customerDetails?.address || '',
//             taluka: booking.customerDetails?.taluka || '',
//             district: booking.customerDetails?.district || '',
//             pincode: booking.customerDetails?.pincode || '',
//             mobile1: booking.customerDetails?.mobile1 || '',
//             mobile2: booking.customerDetails?.mobile2 || '',
//             panNo: booking.customerDetails?.panNo || '',
//             aadharNumber: booking.customerDetails?.aadharNumber || '',
//             occupation: booking.customerDetails?.occupation || '',
//             dob: booking.customerDetails?.dob ? moment(booking.customerDetails.dob).format('DD/MM/YYYY') : '',
//             age: age,
//             nomineeName: booking.customerDetails?.nomineeName || '',
//             nomineeRelation: booking.customerDetails?.nomineeRelation || ''
//           },
//           vehicleInfo: {
//             chassisNumber: booking.chassisNumber || booking.vehicle?.chassisNumber || '',
//             engineNumber: booking.vehicle?.engineNumber || booking.engineNumber || '',
//             color: booking.color?.name || ''
//           },
//           insuranceStatus: booking.insuranceStatus,
//           branchName: booking.branch?.name || '',
//           bookingType: booking.bookingType,
//           customerType: booking.customerType
//         };
//       });

//       // Calculate summary statistics
//       const summary = {
//         totalPendingBookings: bookings.length,
//         awaitingCount: bookings.filter(b => b.insuranceStatus === 'AWAITING').length,
//         laterCount: bookings.filter(b => b.insuranceStatus === 'LATER').length,
//         branchWiseBreakdown: bookings.reduce((acc, booking) => {
//           const branch = booking.branch?.name || 'Unknown';
//           if (!acc[branch]) {
//             acc[branch] = { total: 0, awaiting: 0, later: 0 };
//           }
//           acc[branch].total++;
//           if (booking.insuranceStatus === 'AWAITING') acc[branch].awaiting++;
//           if (booking.insuranceStatus === 'LATER') acc[branch].later++;
//           return acc;
//         }, {})
//       };
//       res.status(200).json({
//         success: true,
//         count: bookings.length,
//         summary: summary,
//         data: formattedBookings,
//         availableBranches: availableBranches,
//         userAccessInfo: {
//           hasAllBranchesAccess: hasAllBranchesAccess,
//           branchAccess: branchAccess,
//           accessibleBranchesCount: user.accessibleBranches?.length || 0,
//           userBranch: user.branch ? {
//             _id: user.branch._id,
//             name: user.branch.name
//           } : null
//         },
//         filters: {
//           branchId: branchId,
//           insuranceStatus: ['AWAITING', 'LATER'],
//           bookingType: bookingType,
//           customerType: customerType,
//           modelType: modelType
//         },
//         generatedAt: new Date()
//       });
//     }

//   } catch (error) {
//     console.error('Error generating insurance pending report:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Error generating insurance pending report',
//       error: error.message,
//       stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
//     });
//   }
// };