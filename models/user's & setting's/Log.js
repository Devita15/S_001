const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  UserID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  Action: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  TableName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  RecordID: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  OldData: {
    type: mongoose.Schema.Types.Mixed
  },
  NewData: {
    type: mongoose.Schema.Types.Mixed
  },
  IPAddress: {
    type: String,
    trim: true
  },
  UserAgent: {
    type: String,
    trim: true
  },
  Timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Log', logSchema);