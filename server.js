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
  console.log(' node-cron loaded successfully');
} catch (err) {
  console.warn('⚠️ node-cron not installed, scheduled jobs will be disabled');
  cron = { schedule: () => console.log('Cron jobs disabled') };
}

const connectDB = require('./config/database');
const { setupSwagger } = require('./config/swagger');

// Connect to database
connectDB();

// Import route files - CORRECTED PATHS with proper apostrophes
const shiftRoutes = require('./routes/HR/shiftRoutes');
const regularizationRoutes = require('./routes/HR/regularizationRoutes');
const holidayRoutes = require('./routes/HR/holidayRoutes');
const safetyRoutes = require('./routes/HR/safetyRoutes');
const productionRoutes = require('./routes/CRM/productionRoutes');
const authRoutes = require('./routes/user\'s & setting\'s/authRoutes');
const employeeRoutes = require('./routes/HR/employeeRoutes');
const roleRoutes = require('./routes/user\'s & setting\'s/roleRoutes');
const departmentRoutes = require('./routes/HR/departmentRoutes');
const designationRoutes = require('./routes/HR/designationRoutes');
const leaveTypeRoutes = require('./routes/HR/leaveTypeRoutes');
const leaveRoutes = require('./routes/HR/leaveRoutes');
const companyRoutes = require('./routes/user\'s & setting\'s/companyRoutes');
const costingRoutes = require('./routes/CRM/costingRoutes');
const customerRoutes = require('./routes/CRM/customerRoutes');
const dimensionWeightRoutes = require('./routes/CRM/dimensionWeightRoutes');
const itemRoutes = require('./routes/CRM/itemRoutes');
const processRoutes = require('./routes/CRM/processRoutes');
const quotationRoutes = require('./routes/CRM/quotationRoutes');
const rawMaterialRoutes = require('./routes/CRM/rawMaterialRoutes');
const taxRoutes = require('./routes/CRM/taxRoutes');
const termsConditionRoutes = require('./routes/CRM/termsConditionRoutes');
const materialRoutes = require('./routes/CRM/materialRoutes');
const salaryRoutes = require('./routes/HR/salaryRoutes');
const userRoutes = require('./routes/user\'s & setting\'s/userRoutes');
const requisitionRoutes = require('./routes/HR/requisitionRoutes');
const notificationRoutes = require('./routes/HR/notificationRoutes');
const jobRoutes = require('./routes/HR/jobRoutes');
const candidateRoutes = require('./routes/HR/candidateRoutes');
const interviewRoutes = require('./routes/HR/interviewRoutes');
const offerRoutes = require('./routes/HR/offerRoutes');
const documentRoutes = require('./routes/HR/documentRoutes');
const bgvRoutes = require('./routes/HR/bgvRoutes');
const mediclaimRoutes = require('./routes/HR/mediclaimRoutes');
const incrementRoutes = require('./routes/CRM/incrementRoutes');
const onboardingRoutes = require('./routes/HR/onboardingRoutes');
const pieceRateMasterRoutes = require('./routes/CRM/pieceRateMasterRoutes');
const terminationRoutes = require('./routes/HR/terminationRoutes');
const appointmentLetterRoutes = require('./routes/HR/appointmentLetterRoutes');
const employeeBehaviorRoutes = require('./routes/HR/employeeBehaviorRoutes');
const processDetailRoutes = require('./routes/CRM/processDetailRoutes');
const companyFinancialRoutes = require('./routes/user\'s & setting\'s/companyFinancialRoutes');
const vendorRoutes = require('./routes/CRM/vendorRoutes');
const employeeHistoryRoutes = require('./routes/HR/employeeHistoryRoutes');
const templateRoutes = require('./routes/CRM/templateRoutes');
const leadRoutes = require('./routes/CRM/leadRoutes');
const leadNotificationRoutes = require('./routes/CRM/leadnotificationroutes');

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

// Mount routers
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
app.use('/api/employee-history', employeeHistoryRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/lead-notifications', leadNotificationRoutes);

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
        employeeHistory: '/api/employee-history',
        leads: '/api/leads',
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

// ─────────────────────────────────────────────────────────────────────────────
// CRON JOBS
// ─────────────────────────────────────────────────────────────────────────────
if (cron && typeof cron.schedule === 'function') {
  try {

    // ── 1. Overdue Follow-up Notifications — daily at 8:00 AM IST ────────────
    cron.schedule('0 8 * * *', async () => {
      console.log('[CRON] Running overdue follow-up job:', new Date().toISOString());
      try {
        const { Lead }     = require('./models/CRM/Lead');
        const Notification = require('./models/Notification');

        const overdueLeads = await Lead.find({
          is_active:           true,
          next_follow_up_date: { $lt: new Date() },
          status:              { $nin: ['Won', 'Lost', 'Junk'] },
        }).select('_id lead_id company_name assigned_to next_follow_up_date');

        if (!overdueLeads.length) {
          console.log('[CRON] No overdue leads found');
          return;
        }

        const notifications = overdueLeads.map(lead => ({
          type:        'OVERDUE_FOLLOWUP',
          title:       'Follow-up Overdue',
          message:     `Follow-up overdue for ${lead.company_name} (${lead.lead_id})`,
          lead_id:     lead._id,
          assigned_to: lead.assigned_to,
          is_read:     false,
          due_date:    lead.next_follow_up_date,
        }));

        await Notification.insertMany(notifications);
        console.log(`[CRON] ✓ Created ${notifications.length} overdue follow-up notifications`);

      } catch (err) {
        console.error('[CRON] Overdue follow-up job failed:', err.message);
      }
    }, { timezone: 'Asia/Kolkata' });

    // ── 2. Interview Reminders — every hour ───────────────────────────────────
    cron.schedule('0 * * * *', async () => {
      console.log('Running interview reminders cron job');
      try {
        const { sendInterviewReminders } = require('./services/notificationService');
        await sendInterviewReminders();
      } catch (err) {
        console.error('Error in interview reminders cron job:', err.message);
      }
    });

    // ── 3. Retry failed job postings — every 30 minutes ──────────────────────
    cron.schedule('*/30 * * * *', async () => {
      console.log('Running failed job postings retry cron job');
      try {
        const { retryFailedJobPostings } = require('./services/jobBoardService');
        await retryFailedJobPostings();
      } catch (err) {
        console.error('Error in job postings retry cron job:', err.message);
      }
    });

    // ── 4. Policy renewal check — daily at 2:00 AM ───────────────────────────
    cron.schedule('0 2 * * *', async () => {
      console.log(' Running policy renewal check -', new Date().toISOString());
      try {
        const { autoRenewPolicies } = require('./services/policyRenewalService');
        const result = await autoRenewPolicies();
        console.log(' Policy renewal summary:', result);
        if (result.errors > 0) {
          console.warn(`⚠️ ${result.errors} policies failed to renew`);
        }
      } catch (err) {
        console.error('Error in policy renewal cron job:', err.message);
      }
    });

    // ── 5. Policy renewal reminders — daily at 9:00 AM ───────────────────────
    cron.schedule('0 9 * * *', async () => {
      console.log(' Sending policy renewal reminders -', new Date().toISOString());
      try {
        const { sendRenewalReminders } = require('./services/policyRenewalService');
        await sendRenewalReminders();
        console.log('Renewal reminders sent successfully');
      } catch (err) {
        console.error(' Error sending renewal reminders:', err.message);
      }
    });

    // ── 6. Termination status update — every minute ───────────────────────────
    cron.schedule('* * * * *', async () => {
      console.log('Running termination check - ' + new Date().toISOString());
      try {
        const Termination = require('./models/HR/Termination');
        const Employee    = require('./models/HR/Employee');

        const now = new Date();

        const startOfDayUTC = new Date(Date.UTC(
          now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
          0, 0, 0, 0
        ));
        const endOfDayUTC = new Date(Date.UTC(
          now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
          23, 59, 59, 999
        ));

        const terminationsToProcess = await Termination.find({
          status:         'approved',
          lastWorkingDay: { $gte: startOfDayUTC, $lte: endOfDayUTC },
        }).populate('employeeId');

        if (terminationsToProcess.length > 0) {
          console.log(` Found ${terminationsToProcess.length} terminations to process for today`);
        }

        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount   = 0;

        for (const termination of terminationsToProcess) {
          try {
            const employee = termination.employeeId;
            if (!employee) {
              console.error(` Employee not found for termination: ${termination.terminationId}`);
              errorCount++;
              continue;
            }

            const expectedStatus = termination.terminationType === 'termination'
              ? 'terminated'
              : 'resigned';

            if (employee.EmploymentStatus !== expectedStatus) {
              const oldStatus = employee.EmploymentStatus;
              employee.EmploymentStatus = expectedStatus;
              await employee.save();
              termination.updatedAt = new Date();
              await termination.save();

              console.log(` UPDATED: Employee ${employee.EmployeeID} (${employee.FirstName} ${employee.LastName})`);
              console.log(`   From: ${oldStatus} → To: ${expectedStatus}`);
              updatedCount++;
            } else {
              console.log(` SKIPPED: Employee ${employee.EmployeeID} already ${expectedStatus}`);
              skippedCount++;
            }
          } catch (err) {
            console.error(` Error processing termination ${termination.terminationId}:`, err.message);
            errorCount++;
          }
        }

        if (terminationsToProcess.length > 0) {
          console.log(` Summary: ${updatedCount} updated, ${skippedCount} skipped, ${errorCount} errors`);
        }

      } catch (err) {
        console.error(' Error in termination cron job:', err.message);
      }
    });

    console.log(' Cron jobs scheduled successfully');

  } catch (err) {
    console.warn('⚠️ Could not schedule cron jobs:', err.message);
  }
} else {
  console.log(' Cron jobs disabled');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST ENDPOINT — manually trigger termination cron
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/test/run-termination-cron-now', async (req, res) => {
  console.log('🔧 MANUALLY RUNNING TERMINATION CRON JOB (UTC)');
  try {
    const Termination = require('./models/HR/Termination');
    const Employee    = require('./models/HR/Employee');

    const now = new Date();

    const startOfDayUTC = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
      0, 0, 0, 0
    ));
    const endOfDayUTC = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
      23, 59, 59, 999
    ));

    console.log(' SEARCH PARAMETERS:');
    console.log('Server Local Time:', now.toString());
    console.log('Server UTC Time:', now.toISOString());
    console.log('UTC Date Range Start:', startOfDayUTC.toISOString());
    console.log('UTC Date Range End:', endOfDayUTC.toISOString());

    const terminations = await Termination.find({
      status:         'approved',
      lastWorkingDay: { $gte: startOfDayUTC, $lte: endOfDayUTC },
    }).populate('employeeId');

    console.log(`Found ${terminations.length} terminations with last working day = today (UTC)`);

    const allApprovedTerminations = await Termination.find({ status: 'approved' }).populate('employeeId');

    console.log('\n ALL APPROVED TERMINATIONS IN SYSTEM:');
    allApprovedTerminations.forEach(t => {
      console.log({
        terminationId:    t.terminationId,
        employeeId:       t.employeeId?.EmployeeID,
        lastWorkingDay:   t.lastWorkingDay.toISOString(),
        lastWorkingDayDate: t.lastWorkingDay.toISOString().split('T')[0],
        todayUTC:         startOfDayUTC.toISOString().split('T')[0],
        matches:          t.lastWorkingDay.toISOString().split('T')[0] === startOfDayUTC.toISOString().split('T')[0]
                            ? '✅ YES' : '❌ NO',
      });
    });

    let results = [];
    for (const termination of terminations) {
      const employee = termination.employeeId;
      if (employee) {
        const expectedStatus = termination.terminationType === 'termination'
          ? 'terminated'
          : 'resigned';

        console.log(`\n Processing:`, {
          employeeId:       employee.EmployeeID,
          currentStatus:    employee.EmploymentStatus,
          expectedStatus,
          lastWorkingDayUTC: termination.lastWorkingDay.toISOString(),
        });

        if (employee.EmploymentStatus !== expectedStatus) {
          const oldStatus = employee.EmploymentStatus;
          employee.EmploymentStatus = expectedStatus;
          await employee.save();
          termination.updatedAt = new Date();
          await termination.save();

          console.log(`UPDATED: ${employee.EmployeeID} from ${oldStatus} to ${expectedStatus}`);
          results.push({
            employeeId:       employee.EmployeeID,
            oldStatus,
            newStatus:        expectedStatus,
            lastWorkingDayUTC: termination.lastWorkingDay.toISOString(),
          });
        } else {
          console.log(`⚠️ SKIPPED: ${employee.EmployeeID} already has status ${expectedStatus}`);
          results.push({
            employeeId:    employee.EmployeeID,
            status:        'already_updated',
            currentStatus: employee.EmploymentStatus,
          });
        }
      }
    }

    res.json({
      success: true,
      message: 'Cron job executed with UTC dates',
      serverTime: {
        local: now.toString(),
        utc:   now.toISOString(),
      },
      searchRange: {
        startUTC: startOfDayUTC.toISOString(),
        endUTC:   endOfDayUTC.toISOString(),
      },
      totalFound:        terminations.length,
      allApprovedCount:  allApprovedTerminations.length,
      processed:         results.length,
      results,
      note: 'Using UTC dates for consistent comparison',
    });

  } catch (error) {
    console.error('Error in test cron:', error);
    res.status(500).json({
      success: false,
      error:   error.message,
      stack:   process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 404 handler
// ─────────────────────────────────────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    documentation: `${req.protocol}://${req.get('host')}/api-docs`,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Global error handler
// ─────────────────────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5009;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  const address = server.address();
  const host    = address.address === '::' ? 'localhost' : address.address;
  const port    = address.port;

  console.log('\n=================================');
  console.log(`Server running on http://${host}:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`MongoDB URI: ${process.env.MONGODB_URI}`);
  console.log('=================================\n');
  console.log(`Swagger Docs: http://localhost:${port}/api-docs`);
  console.log(`Health Check: http://localhost:${port}/health`);
  console.log(`Auth:         http://localhost:${port}/api/auth`);
  console.log(`Leads:        http://localhost:${port}/api/leads`);
  console.log(`Customers:    http://localhost:${port}/api/customers`);
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