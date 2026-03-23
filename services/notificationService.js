const Notification = require('../models/HR/Notification');
const User = require("../models/user's & setting's/User");

class NotificationService {
  
  // Create and send notification
  async createNotification(notificationData) {
    try {
      const notification = await Notification.create(notificationData);
      
      // In a real application, you would trigger email/SMS here
      // For now, we'll simulate email sending
      await this.sendEmailNotification(notification);
      
      return notification;
    } catch (error) {
      console.error('Notification creation error:', error);
      throw error;
    }
  }

  // Send email notification (simulated)
  async sendEmailNotification(notification) {
    try {
      const user = await User.findById(notification.userId).select('Email Username');
      
      if (!user) return;

      // Here you would integrate with your email service (nodemailer, sendgrid, etc.)
      console.log(`
        ===== EMAIL NOTIFICATION =====
        To: ${user.Email}
        Subject: ${notification.title}
        Message: ${notification.message}
        Type: ${notification.type}
        Data: ${JSON.stringify(notification.data)}
        ==============================
      `);

      // Mark as email sent
      notification.isEmailSent = true;
      notification.emailSentAt = new Date();
      await notification.save();

    } catch (error) {
      console.error('Email sending error:', error);
    }
  }

  // Get notifications for a user
  async getUserNotifications(userId, page = 1, limit = 20, unreadOnly = false) {
    const query = { userId };
    if (unreadOnly) query.isRead = false;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Notification.countDocuments(query);

    return {
      notifications,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    };
  }

  // Mark notification as read
  async markAsRead(notificationId, userId) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    return notification;
  }

  // Mark all notifications as read for a user
  async markAllAsRead(userId) {
    await Notification.updateMany(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    return true;
  }

  // Get unread count for a user
  async getUnreadCount(userId) {
    return await Notification.countDocuments({ userId, isRead: false });
  }
}

module.exports = new NotificationService();