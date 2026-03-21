'use strict';

const Notification = require('../../models/CRM/Notification');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const err404 = (res) => res.status(404).json({ success: false, message: 'Notification not found' });
const err500 = (res, e) => res.status(500).json({ success: false, message: e.message });


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/lead-notifications
// Everyone sees ALL overdue follow-up notifications
// Optional filters: is_read, assigned_to, from_date, to_date
// ─────────────────────────────────────────────────────────────────────────────
exports.getAllNotifications = async (req, res) => {
  try {
    const {
      is_read,
      assigned_to,
      from_date,
      to_date,
      page  = 1,
      limit = 20,
    } = req.query;

    const filter = { type: 'OVERDUE_FOLLOWUP' };

    // Filter by read/unread
    if (is_read !== undefined) {
      filter.is_read = is_read === 'true';
    }

    // Filter by salesperson
    if (assigned_to) {
      filter.assigned_to = assigned_to;
    }

    // Filter by date range (createdAt)
    if (from_date || to_date) {
      filter.createdAt = {};
      if (from_date) filter.createdAt.$gte = new Date(from_date);
      if (to_date)   filter.createdAt.$lte = new Date(to_date);
    }

    const pg   = Math.max(parseInt(page)  || 1, 1);
    const lim  = Math.min(parseInt(limit) || 20, 100);
    const skip = (pg - 1) * lim;

    const [data, total] = await Promise.all([
      Notification.find(filter)
        .populate('lead_id',     'lead_id company_name subject status next_follow_up_date priority')
        .populate('assigned_to', 'first_name last_name email')
        .sort('-createdAt')
        .skip(skip)
        .limit(lim)
        .lean(),
      Notification.countDocuments(filter),
    ]);

    // Count unread separately for badge display
    const unread_count = await Notification.countDocuments({
      type:    'OVERDUE_FOLLOWUP',
      is_read: false,
    });

    return res.json({
      success:      true,
      unread_count,
      data,
      pagination: {
        page:  pg,
        limit: lim,
        total,
        pages: Math.ceil(total / lim),
      },
    });

  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/lead-notifications/unread-count
// Quick endpoint for notification badge in frontend navbar
// ─────────────────────────────────────────────────────────────────────────────
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      type:    'OVERDUE_FOLLOWUP',
      is_read: false,
    });

    return res.json({ success: true, unread_count: count });

  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/lead-notifications/:id/read
// Mark a single notification as read
// ─────────────────────────────────────────────────────────────────────────────
exports.markOneRead = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { is_read: true },
      { new: true }
    )
      .populate('lead_id',     'lead_id company_name subject status')
      .populate('assigned_to', 'first_name last_name email');

    if (!notification) return err404(res);

    return res.json({ success: true, data: notification });

  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/lead-notifications/mark-all-read
// Mark ALL unread notifications as read (global — for managers)
// ─────────────────────────────────────────────────────────────────────────────
exports.markAllRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { type: 'OVERDUE_FOLLOWUP', is_read: false },
      { is_read: true }
    );

    return res.json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      updated: result.modifiedCount,
    });

  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/lead-notifications/:id
// Delete a single notification (soft delete not needed — notifications are disposable)
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteOne = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);

    if (!notification) return err404(res);

    return res.json({
      success: true,
      message: 'Notification deleted',
    });

  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/lead-notifications/clear-all-read
// Delete all read notifications — cleanup endpoint
// ─────────────────────────────────────────────────────────────────────────────
exports.clearAllRead = async (req, res) => {
  try {
    const result = await Notification.deleteMany({
      type:    'OVERDUE_FOLLOWUP',
      is_read: true,
    });

    return res.json({
      success: true,
      message: `${result.deletedCount} read notifications cleared`,
      deleted: result.deletedCount,
    });

  } catch (e) { err500(res, e); }
};