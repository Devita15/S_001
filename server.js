const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');

// Load env vars
dotenv.config();

// Try to load node-cron, but don't fail if it's missing
let cron;
try {
  cron = require('node-cron');
  console.log('✅ node-cron loaded successfully');
} catch (err) {
  console.warn('⚠️ node-cron not installed, scheduled jobs will be disabled');
  cron = { schedule: () => console.log('Cron jobs disabled') };
}

const connectDB = require('./config/database');
const { setupSwagger } = require('./config/swagger');

// Connect to database
connectDB();

// Import route files
const shiftRoutes = require('./routes/shiftRoutes');
const regularizationRoutes = require('./routes/regularizationRoutes');
const holidayRoutes = require('./routes/holidayRoutes');
const safetyRoutes = require('./routes/safetyRoutes');
const productionRoutes = require('./routes/productionRoutes');
const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const roleRoutes = require('./routes/roleRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const designationRoutes = require('./routes/designationRoutes');
const leaveTypeRoutes = require('./routes/leaveTypeRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const companyRoutes = require('./routes/companyRoutes');
const costingRoutes = require('./routes/costingRoutes');
const customerRoutes = require('./routes/customerRoutes');
const dimensionWeightRoutes = require('./routes/dimensionWeightRoutes');
const itemRoutes = require('./routes/itemRoutes');
const processRoutes = require('./routes/processRoutes');
const quotationRoutes = require('./routes/quotationRoutes');
const rawMaterialRoutes = require('./routes/rawMaterialRoutes');
const taxRoutes = require('./routes/taxRoutes');
const termsConditionRoutes = require('./routes/termsConditionRoutes');
const materialRoutes = require('./routes/materialRoutes');
const salaryRoutes = require('./routes/salaryRoutes');
const userRoutes = require('./routes/userRoutes');
const requisitionRoutes = require('./routes/requisitionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const jobRoutes = require('./routes/jobRoutes');
const candidateRoutes = require('./routes/candidateRoutes');
const interviewRoutes = require('./routes/interviewRoutes');
const offerRoutes = require('./routes/offerRoutes');
const documentRoutes = require('./routes/documentRoutes');
const bgvRoutes = require('./routes/bgvRoutes');
const mediclaimRoutes = require('./routes/mediclaimRoutes');
const incrementRoutes = require('./routes/incrementRoutes');
const onboardingRoutes = require('./routes/onboardingRoutes');
const pieceRateMasterRoutes = require('./routes/pieceRateMasterRoutes');
const terminationRoutes = require('./routes/terminationRoutes');
const appointmentLetterRoutes = require('./routes/appointmentLetterRoutes');
const employeeBehaviorRoutes = require('./routes/employeeBehaviorRoutes');
const processDetailRoutes = require('./routes/processDetailRoutes');
const companyFinancialRoutes = require('./routes/companyFinancialRoutes');
const vendorRoutes = require('./routes/vendorRoutes');
const employeeHistoryRoutes = require('./routes/employeeHistoryRoutes');
const templateRoutes = require('./routes/templateRoutes');

const app = express();

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Enable CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Setup Swagger
setupSwagger(app);

// Mount routers - All routes combined from both versions
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/designations', designationRoutes);
app.use('/api/leavetypes', leaveTypeRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/salaries', salaryRoutes);
app.use('/api/costings', costingRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/dimension-weights', dimensionWeightRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/processes', processRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/raw-materials', rawMaterialRoutes);
app.use('/api/taxes', taxRoutes);
app.use('/api/terms-conditions', termsConditionRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/users', userRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/regularization', regularizationRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/requisitions', requisitionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/safety', safetyRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/increment', incrementRoutes);
app.use('/api/mediclaim', mediclaimRoutes);
app.use('/api/piece-rate-master', pieceRateMasterRoutes);
app.use('/api/bgv', bgvRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/terminations', terminationRoutes);
app.use('/api/appointment-letter', appointmentLetterRoutes);
app.use('/api/employee-behavior', employeeBehaviorRoutes);
app.use('/api/process-details', processDetailRoutes);
app.use('/api/company-financial', companyFinancialRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/employee-history', employeeHistoryRoutes); // Note: Changed from '/api/employees' to avoid conflict

// Default route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Employee Management & Quotation System API',
    version: '1.0.0',
    documentation: {
      swagger: `${req.protocol}://${req.get('host')}/api-docs`,
      endpoints: {
        auth: '/api/auth',
        employees: '/api/employees',
        roles: '/api/roles',
        departments: '/api/departments',
        designations: '/api/designations',
        leaveTypes: '/api/leavetypes',
        company: '/api/company',
        costings: '/api/costings',
        customers: '/api/customers',
        dimensionWeights: '/api/dimension-weights',
        items: '/api/items',
        processes: '/api/processes',
        quotations: '/api/quotations',
        rawMaterials: '/api/raw-materials',
        taxes: '/api/taxes',
        termsConditions: '/api/terms-conditions',
        requisitions: '/api/requisitions',
        notifications: '/api/notifications',
        jobs: '/api/jobs',
        candidates: '/api/candidates',
        interviews: '/api/interviews',
        vendors: '/api/vendors',
        employeeHistory: '/api/employee-history'
      }
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    timestamp: new Date().toISOString(),
    server_ip: req.ip,
    client_ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
  });
});

// Schedule cron jobs
if (cron && typeof cron.schedule === 'function') {
  try {
    // Send interview reminders every hour
    cron.schedule('0 * * * *', async () => {
      console.log('Running interview reminders cron job');
      try {
        const { sendInterviewReminders } = require('./services/notificationService');
        await sendInterviewReminders();
      } catch (err) {
        console.error('Error in interview reminders cron job:', err.message);
      }
    });

    // Retry failed job postings every 30 minutes
    cron.schedule('*/30 * * * *', async () => {
      console.log('Running failed job postings retry cron job');
      try {
        const { retryFailedJobPostings } = require('./services/jobBoardService');
        await retryFailedJobPostings();
      } catch (err) {
        console.error('Error in job postings retry cron job:', err.message);
      }
    });
    
    cron.schedule('0 2 * * *', async () => {
      console.log('🔄 Running policy renewal check -', new Date().toISOString());

      try {
        const { autoRenewPolicies } = require('./services/policyRenewalService');
        const result = await autoRenewPolicies();

        console.log('📊 Policy renewal summary:', result);

        // If there were errors, log them but don't crash
        if (result.errors > 0) {
          console.warn(`⚠️ ${result.errors} policies failed to renew`);
        }
      } catch (err) {
        console.error('❌ Error in policy renewal cron job:', err.message);
      }
    });

    // Send renewal reminders daily at 9 AM
    cron.schedule('0 9 * * *', async () => {
      console.log('📧 Sending policy renewal reminders -', new Date().toISOString());

      try {
        const { sendRenewalReminders } = require('./services/policyRenewalService');
        await sendRenewalReminders();
        console.log('✅ Renewal reminders sent successfully');
      } catch (err) {
        console.error('❌ Error sending renewal reminders:', err.message);
      }
    });


    // Run EVERY MINUTE to check for terminations
    cron.schedule('* * * * *', async () => {
      console.log('🔄 Running termination check - ' + new Date().toISOString());

      try {
        const Termination = require('./models/Termination');
        const Employee = require('./models/Employee');

        // Get current UTC date
        const now = new Date();

        // Create UTC date range for TODAY (full day)
        const startOfDayUTC = new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          0, 0, 0, 0
        ));

        const endOfDayUTC = new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          23, 59, 59, 999
        ));

        // Find all approved terminations where lastWorkingDay is TODAY
        const terminationsToProcess = await Termination.find({
          status: 'approved',
          lastWorkingDay: {
            $gte: startOfDayUTC,
            $lte: endOfDayUTC
          }
        }).populate('employeeId');

        if (terminationsToProcess.length > 0) {
          console.log(`📋 Found ${terminationsToProcess.length} terminations to process for today`);
        }

        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const termination of terminationsToProcess) {
          try {
            const employee = termination.employeeId;

            if (!employee) {
              console.error(`❌ Employee not found for termination: ${termination.terminationId}`);
              errorCount++;
              continue;
            }

            // Determine expected status based on termination type
            const expectedStatus = termination.terminationType === 'termination' ? 'terminated' : 'resigned';

            // Check if already updated
            if (employee.EmploymentStatus !== expectedStatus) {
              // Store old status for logging
              const oldStatus = employee.EmploymentStatus;

              // Update employee status
              employee.EmploymentStatus = expectedStatus;
              await employee.save();

              // Update termination record
              termination.updatedAt = new Date();
              await termination.save();

              console.log(`✅ UPDATED: Employee ${employee.EmployeeID} (${employee.FirstName} ${employee.LastName})`);
              console.log(`   From: ${oldStatus} → To: ${expectedStatus}`);
              console.log(`   Last Working Day: ${termination.lastWorkingDay.toISOString()}`);

              updatedCount++;

              // OPTIONAL: Send notification or email
              // await notifyTerminationComplete(employee, termination);

            } else {
              console.log(`⏭️ SKIPPED: Employee ${employee.EmployeeID} already ${expectedStatus}`);
              skippedCount++;
            }
          } catch (err) {
            console.error(`❌ Error processing termination ${termination.terminationId}:`, err.message);
            errorCount++;
          }
        }

        if (terminationsToProcess.length > 0) {
          console.log(`📊 Summary: ${updatedCount} updated, ${skippedCount} skipped, ${errorCount} errors`);
        }

      } catch (err) {
        console.error('❌ Error in termination cron job:', err.message);
      }
    });
    
    
    console.log('✅ Cron jobs scheduled successfully');
  } catch (err) {
    console.warn('⚠️ Could not schedule cron jobs:', err.message);
  }
} else {
  console.log('⏰ Cron jobs disabled');
}

app.post('/api/test/run-termination-cron-now', async (req, res) => {
  console.log('🔧 MANUALLY RUNNING TERMINATION CRON JOB (UTC)');
  try {
    const Termination = require('./models/Termination');
    const Employee = require('./models/Employee');
    
    // Get current UTC date
    const now = new Date();
    
    // Create UTC date range for today
    const startOfDayUTC = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0, 0, 0, 0
    ));
    
    const endOfDayUTC = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23, 59, 59, 999
    ));
    
    console.log('🔍 SEARCH PARAMETERS:');
    console.log('Server Local Time:', now.toString());
    console.log('Server UTC Time:', now.toISOString());
    console.log('UTC Date Range Start:', startOfDayUTC.toISOString());
    console.log('UTC Date Range End:', endOfDayUTC.toISOString());
    console.log('Looking for lastWorkingDay between:', startOfDayUTC.toISOString(), 'and', endOfDayUTC.toISOString());
    
    // Find all approved terminations where lastWorkingDay is today in UTC
    const terminations = await Termination.find({
      status: 'approved',
      lastWorkingDay: { 
        $gte: startOfDayUTC, 
        $lte: endOfDayUTC 
      }
    }).populate('employeeId');
    
    console.log(`Found ${terminations.length} terminations with last working day = today (UTC)`);
    
    // Also log any terminations that are close to this date for debugging
    const allApprovedTerminations = await Termination.find({ 
      status: 'approved' 
    }).populate('employeeId');
    
    console.log('\n📋 ALL APPROVED TERMINATIONS IN SYSTEM:');
    allApprovedTerminations.forEach(t => {
      console.log({
        terminationId: t.terminationId,
        employeeId: t.employeeId?.EmployeeID,
        lastWorkingDay: t.lastWorkingDay.toISOString(),
        lastWorkingDayDate: t.lastWorkingDay.toISOString().split('T')[0],
        todayUTC: startOfDayUTC.toISOString().split('T')[0],
        matches: t.lastWorkingDay.toISOString().split('T')[0] === startOfDayUTC.toISOString().split('T')[0] ? '✅ YES' : '❌ NO'
      });
    });
    
    let results = [];
    for (const termination of terminations) {
      const employee = termination.employeeId;
      if (employee) {
        const expectedStatus = termination.terminationType === 'termination' ? 'terminated' : 'resigned';
        
        console.log(`\n📝 Processing:`, {
          employeeId: employee.EmployeeID,
          currentStatus: employee.EmploymentStatus,
          expectedStatus: expectedStatus,
          lastWorkingDayUTC: termination.lastWorkingDay.toISOString(),
          lastWorkingDayLocal: termination.lastWorkingDay.toLocaleString()
        });
        
        if (employee.EmploymentStatus !== expectedStatus) {
          const oldStatus = employee.EmploymentStatus;
          employee.EmploymentStatus = expectedStatus;
          await employee.save();
          
          termination.updatedAt = new Date();
          await termination.save();
          
          console.log(`✅ UPDATED: ${employee.EmployeeID} from ${oldStatus} to ${expectedStatus}`);
          
          results.push({
            employeeId: employee.EmployeeID,
            oldStatus,
            newStatus: expectedStatus,
            lastWorkingDayUTC: termination.lastWorkingDay.toISOString()
          });
        } else {
          console.log(`⚠️ SKIPPED: ${employee.EmployeeID} already has status ${expectedStatus}`);
          results.push({
            employeeId: employee.EmployeeID,
            status: 'already_updated',
            currentStatus: employee.EmploymentStatus
          });
        }
      }
    }
    
    res.json({
      success: true,
      message: 'Cron job executed with UTC dates',
      serverTime: {
        local: now.toString(),
        utc: now.toISOString()
      },
      searchRange: {
        startUTC: startOfDayUTC.toISOString(),
        endUTC: endOfDayUTC.toISOString()
      },
      totalFound: terminations.length,
      allApprovedCount: allApprovedTerminations.length,
      processed: results.length,
      results,
      note: 'Using UTC dates for consistent comparison'
    });
    
  } catch (error) {
    console.error('Error in test cron:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});


// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    documentation: `${req.protocol}://${req.get('host')}/api-docs`
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5009;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  const address = server.address();
  const host = address.address === '::' ? 'localhost' : address.address;
  const port = address.port;
  
  console.log('\n=================================');
  console.log(`✅ Server running on http://${host}:${port}`);
  console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 MongoDB URI: ${process.env.MONGODB_URI}`);
  console.log('=================================\n');
  console.log(`📚 Swagger Docs: http://localhost:${port}/api-docs`);
  console.log(`🩺 Health Check: http://localhost:${port}/health`);
  console.log(`👥 Auth: http://localhost:${port}/api/auth`);
  console.log(`📊 Requisitions: http://localhost:${port}/api/requisitions`);
  console.log(`💼 Jobs: http://localhost:${port}/api/jobs`);
  console.log(`👤 Candidates: http://localhost:${port}/api/candidates`);
  console.log(`🗓️ Interviews: http://localhost:${port}/api/interviews`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  server.close(() => process.exit(1));
});

module.exports = server;