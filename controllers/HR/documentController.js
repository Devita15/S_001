// controllers/documentController.js
const Document = require('../models/Document');
const cloudStorage = require('../../services/cloudStorageService');
const mongoose = require('mongoose');

// @desc    Upload document
// @route   POST /api/documents/upload
// @access  Private
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Generate document ID through the schema pre-save hook
    const document = new Document({
      // Required fields
      type: req.body.type, // Make sure to send this from frontend
      filename: req.file.filename,
      originalFilename: req.file.originalname,
      fileUrl: req.file.path || `/uploads/${req.file.filename}`,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      
      // Optional fields based on your use case
      candidateId: req.body.candidateId || null,
      employeeId: req.body.employeeId || null,
      offerId: req.body.offerId || null,
      
      // Metadata
      uploadedBy: req.user._id, // Assuming you have user from auth middleware
      metadata: {
        uploadedFrom: req.headers.origin || 'unknown',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      },
      
      // Default values
      status: 'pending',
      version: 1,
      isDeleted: false
    });

    // Save to database - this triggers the pre-save hook and creates documentId
    await document.save();

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: {
        id: document._id,
        documentId: document.documentId, // This will be auto-generated
        filename: document.filename,
        fileUrl: document.fileUrl,
        type: document.type,
        status: document.status
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Verify document
// @route   PUT /api/documents/:id/verify
// @access  Private
const verifyDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { verified, comments } = req.body;

    // Find document by ID
    const document = await Document.findById(id);
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Update verification details
    document.status = verified ? 'verified' : 'rejected';
    document.verificationDetails = {
      verifiedBy: req.user._id,
      verifiedByName: req.user.name,
      verifiedAt: new Date(),
      comments: comments || '',
      rejectionReason: verified ? null : (comments || 'Rejected')
    };

    await document.save();

    res.json({
      success: true,
      message: `Document ${verified ? 'verified' : 'rejected'} successfully`,
      data: {
        id: document._id,
        documentId: document.documentId,
        status: document.status
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Get all documents
// @route   GET /api/documents
// @access  Private
const getDocuments = async (req, res) => {
  try {
    // Build query based on filters
    const query = { isDeleted: false }; // Only get non-deleted documents by default
    
    // Add filters if provided in query params
    if (req.query.type) {
      query.type = req.query.type;
    }
    
    if (req.query.status) {
      query.status = req.query.status;
    }
    
    if (req.query.candidateId) {
      query.candidateId = req.query.candidateId;
    }
    
    if (req.query.employeeId) {
      query.employeeId = req.query.employeeId;
    }
    
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Sorting
    const sortField = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortField]: sortOrder };
    
    // Execute query with pagination
    const documents = await Document.find(query)
      .populate('candidateId', 'firstName lastName email') // Populate candidate reference
      .populate('employeeId', 'firstName lastName employeeCode') // Populate employee reference
      .populate('uploadedBy', 'name email') // Populate user who uploaded
      .populate('verificationDetails.verifiedBy', 'name email') // Populate verifier
      .sort(sort)
      .skip(skip)
      .limit(limit);
    
    // Get total count for pagination
    const total = await Document.countDocuments(query);
    
    res.json({
      success: true,
      data: documents,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      message: 'Documents retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Get document by ID
// @route   GET /api/documents/:id
// @access  Private
const getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if id is valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document ID format'
      });
    }
    
    // Find document by ID
    const document = await Document.findOne({ 
      _id: id, 
      isDeleted: false 
    })
    .populate('candidateId', 'firstName lastName email phone')
    .populate('employeeId', 'firstName lastName employeeCode designation')
    .populate('uploadedBy', 'name email')
    .populate('verificationDetails.verifiedBy', 'name email');
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }
    
    res.json({
      success: true,
      data: document,
      message: 'Document retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Generate upload URL
// @route   GET /api/documents/upload-url
// @access  Private
const generateUploadUrl = async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        url: 'https://example.com/upload-url',
        expiresIn: 3600
      },
      message: 'Upload URL generated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Download document
// @route   GET /api/documents/:id/download
// @access  Private
const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;

    res.json({
      success: true,
      message: 'Download functionality will be implemented'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

module.exports = {
  uploadDocument,
  verifyDocument,
  getDocuments,
  getDocumentById,
  generateUploadUrl,
  downloadDocument
};