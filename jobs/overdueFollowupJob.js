'use strict';
const cron         = require('node-cron');
const { Lead }     = require('../models/CRM/Lead');
const Notification = require('../models/Notification');

// Runs every day at 8:00 AM
const startOverdueFollowupJob = () => {
  cron.schedule('0 8 * * *', async () => {
    console.log('[CRON] Running overdue follow-up job:', new Date().toISOString());

    try {
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
      console.log(`[CRON] ✓ Created ${notifications.length} overdue notifications`);

    } catch (err) {
      console.error('[CRON] Overdue follow-up job failed:', err.message);
    }
  }, {
    timezone: 'Asia/Kolkata'  // IST
  });

  console.log('[CRON] Overdue follow-up job scheduled — runs daily at 8:00 AM IST');
};

module.exports = { startOverdueFollowupJob };