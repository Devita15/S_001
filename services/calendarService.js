const { google } = require('googleapis');
const { OAuth2 } = google.auth;

class CalendarService {
  constructor() {
    this.oauth2Client = new OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    // Set refresh token if available
    if (process.env.GOOGLE_REFRESH_TOKEN) {
      this.oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      });
    }
    
    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  // Check interviewer availability
  async checkAvailability(interviewerEmails, startTime, duration) {
    try {
      const endTime = new Date(startTime.getTime() + duration * 60000);

      const request = {
        resource: {
          timeMin: startTime.toISOString(),
          timeMax: endTime.toISOString(),
          items: interviewerEmails.map(email => ({ id: email }))
        }
      };

      const response = await this.calendar.freebusy.query(request);
      const busy = response.data.calendars;

      const conflicts = [];
      let available = true;

      for (const [email, data] of Object.entries(busy)) {
        if (data.busy && data.busy.length > 0) {
          available = false;
          conflicts.push({
            email,
            busy: data.busy
          });
        }
      }

      return { available, conflicts };
    } catch (error) {
      console.error('Calendar availability check error:', error);
      // Return available as true if calendar check fails (fallback)
      return { available: true, conflicts: [], error: error.message };
    }
  }

  // Create calendar events for interview
  async createInterviewEvents(interview, application) {
    try {
      const events = {};

      // Create event for each interviewer
      for (const interviewer of interview.interviewers) {
        const event = {
          summary: `Interview: ${application.candidateId.firstName} ${application.candidateId.lastName} - ${interview.round}`,
          description: `Interview for ${application.jobId.title} position\nCandidate: ${application.candidateId.firstName} ${application.candidateId.lastName}\nRound: ${interview.round}`,
          start: {
            dateTime: interview.scheduledAt,
            timeZone: 'Asia/Kolkata'
          },
          end: {
            dateTime: new Date(interview.scheduledAt.getTime() + interview.duration * 60000),
            timeZone: 'Asia/Kolkata'
          },
          attendees: [
            { email: interviewer.email },
            ...(application.candidateId.email ? [{ email: application.candidateId.email }] : [])
          ],
          conferenceData: interview.meetingLink ? {
            createRequest: {
              requestId: `interview-${interview._id}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' }
            }
          } : undefined
        };

        try {
          const response = await this.calendar.events.insert({
            calendarId: 'primary',
            resource: event,
            conferenceDataVersion: interview.meetingLink ? 1 : 0
          });
          events[interviewer.interviewerId] = response.data.id;
        } catch (err) {
          console.error('Error creating calendar event for interviewer:', err);
        }
      }

      return events;
    } catch (error) {
      console.error('Create calendar events error:', error);
      return {};
    }
  }

  // Update calendar events
  async updateInterviewEvents(interview, previousTime) {
    try {
      for (const interviewer of interview.interviewers) {
        if (interview.calendarEvents[interviewer.interviewerId]) {
          try {
            const event = await this.calendar.events.get({
              calendarId: 'primary',
              eventId: interview.calendarEvents[interviewer.interviewerId]
            });

            event.data.start.dateTime = interview.scheduledAt.toISOString();
            event.data.end.dateTime = new Date(
              interview.scheduledAt.getTime() + interview.duration * 60000
            ).toISOString();

            await this.calendar.events.update({
              calendarId: 'primary',
              eventId: interview.calendarEvents[interviewer.interviewerId],
              resource: event.data
            });
          } catch (err) {
            console.error('Error updating calendar event:', err);
          }
        }
      }
    } catch (error) {
      console.error('Update calendar events error:', error);
    }
  }

  // Delete calendar events
  async deleteInterviewEvents(interview) {
    try {
      for (const interviewer of interview.interviewers) {
        if (interview.calendarEvents[interviewer.interviewerId]) {
          try {
            await this.calendar.events.delete({
              calendarId: 'primary',
              eventId: interview.calendarEvents[interviewer.interviewerId]
            });
          } catch (err) {
            console.error('Error deleting calendar event:', err);
          }
        }
      }
    } catch (error) {
      console.error('Delete calendar events error:', error);
    }
  }
}

module.exports = new CalendarService();