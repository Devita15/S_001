// routes/appointmentLetterRoutes.js
const express = require('express');
const router = express.Router();
const {
  generateAppointmentLetter,
  sendAppointmentLetter,
  acceptAppointmentLetter,
  getAppointmentLetterStatusByCandidate,
  getAppointmentLetterStatusById,
  getAllAppointmentLetters,
} = require('../../controllers/HR/appointmentLetterController');
const { protect } = require('../../middleware/authMiddleware');

// All HR routes
router.post('/generate', protect, generateAppointmentLetter);
router.post('/send/:id', protect, sendAppointmentLetter);

// Public route for candidate acceptance
router.get('/accept/:id', acceptAppointmentLetter);

// Status routes
router.get('/status/candidate/:candidateId', protect, getAppointmentLetterStatusByCandidate);
router.get('/status/:documentId', protect, getAppointmentLetterStatusById);
router.get('/all', protect, getAllAppointmentLetters);
module.exports = router;