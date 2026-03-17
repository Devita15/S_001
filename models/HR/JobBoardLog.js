const mongoose = require('mongoose');

const jobBoardLogSchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobOpening',
    required: true
  },
  platform: {
    type: String,
    enum: ['naukri', 'linkedin', 'indeed', 'careerPage'],
    required: true
  },
  action: {
    type: String,
    enum: ['publish', 'update', 'expire', 'delete'],
    required: true
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    required: true
  },
  requestData: mongoose.Schema.Types.Mixed,
  responseData: mongoose.Schema.Types.Mixed,
  error: String,
  jobUrl: String,
  retryCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('JobBoardLog', jobBoardLogSchema);