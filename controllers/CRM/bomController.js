const Bom = require('../models/Bom');
const Item = require('../models/Item');
const User = require('../models/User');
const mongoose = require('mongoose');
const PDFService = require('../services/pdfService');
const EmailService = require('../services/emailService');
const path = require('path');
const fs = require('fs').promises;

// ... (keep existing createBOM, getBOMs, etc. functions)

// @desc    Create new revision snapshot
// @route   POST /api/boms/:id/revise
// @access  Manager, Production
exports.createRevision = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const bom = await Bom.findById(req.params.id)
      .populate('parent_item_id')
      .populate('components.component_item_id')
      .populate('components.subcontract_vendor')
      .session(session);

    if (!bom) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'BOM not found'
      });
    }

    // Check if BOM is cancelled
    if (bom.status === 'Cancelled') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Cannot create revision for cancelled BOM'
      });
    }

    // Increment revision number
    const newRevisionNo = (bom.current_revision || 0) + 1;

    // Create deep clone of current state
    const snapshotData = {
      bom_id: bom.bom_id,
      parent_item: {
        _id: bom.parent_item_id._id,
        part_no: bom.parent_item_id.part_no,
        part_description: bom.parent_item_id.part_description,
        drawing_no: bom.parent_item_id.drawing_no,
        revision_no: bom.parent_item_id.revision_no
      },
      bom_version: bom.bom_version,
      bom_type: bom.bom_type,
      batch_size: bom.batch_size,
      yield_percent: bom.yield_percent,
      setup_time_min: bom.setup_time_min,
      cycle_time_min: bom.cycle_time_min,
      components: bom.components.map(comp => ({
        level: comp.level,
        component_item_id: comp.component_item_id._id,
        component_part_no: comp.component_part_no,
        component_desc: comp.component_desc,
        quantity_per: comp.quantity_per,
        unit: comp.unit,
        scrap_percent: comp.scrap_percent,
        is_phantom: comp.is_phantom,
        is_subcontract: comp.is_subcontract,
        subcontract_vendor: comp.subcontract_vendor ? {
          _id: comp.subcontract_vendor._id,
          name: comp.subcontract_vendor.name,
          vendor_code: comp.subcontract_vendor.vendor_code
        } : null,
        reference_designator: comp.reference_designator,
        remarks: comp.remarks
      })),
      snapshot_taken_by: req.user._id,
      snapshot_taken_at: new Date()
    };

    // Create revision entry
    const revisionEntry = {
      revision_no: newRevisionNo,
      snapshot_data: snapshotData,
      created_by: req.user._id,
      created_at: new Date(),
      change_description: req.body.change_description || `Revision ${newRevisionNo} created`
    };

    // Add to revision history (append-only)
    bom.revision_history.push(revisionEntry);
    bom.current_revision = newRevisionNo;
    
    await bom.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: `Revision ${newRevisionNo} created successfully`,
      data: {
        revision_no: newRevisionNo,
        created_at: revisionEntry.created_at,
        change_description: revisionEntry.change_description
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get specific revision snapshot
// @route   GET /api/boms/:id/revision/:rev
// @access  All roles
exports.getRevision = async (req, res) => {
  try {
    const { id, rev } = req.params;
    const revisionNo = parseInt(rev);

    const bom = await Bom.findById(id)
      .select('bom_id parent_item_id revision_history');

    if (!bom) {
      return res.status(404).json({
        success: false,
        message: 'BOM not found'
      });
    }

    // Find the specific revision
    const revision = bom.revision_history.find(r => r.revision_no === revisionNo);

    if (!revision) {
      return res.status(404).json({
        success: false,
        message: `Revision ${revisionNo} not found`
      });
    }

    // Populate creator info
    await revision.populate('created_by', 'name email');

    res.status(200).json({
      success: true,
      data: {
        bom_id: bom.bom_id,
        revision_no: revision.revision_no,
        snapshot_data: revision.snapshot_data,
        created_by: revision.created_by,
        created_at: revision.created_at,
        change_description: revision.change_description,
        pdf_path: revision.pdf_path,
        email_sent_to: revision.email_sent_to
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Generate BOM PDF
// @route   GET /api/boms/:id/pdf
// @access  All roles
exports.generatePDF = async (req, res) => {
  try {
    const bom = await Bom.findById(req.params.id)
      .populate('parent_item_id')
      .populate({
        path: 'components.component_item_id',
        select: 'part_no part_description unit rm_grade'
      })
      .populate('components.subcontract_vendor', 'name vendor_code')
      .populate('approved_by', 'name')
      .populate('created_by', 'name');

    if (!bom) {
      return res.status(404).json({
        success: false,
        message: 'BOM not found'
      });
    }

    // Check if BOM is cancelled
    if (bom.status === 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot generate PDF for cancelled BOM'
      });
    }

    // Get company info from settings (you'd have a Settings model)
    const companyInfo = {
      name: 'SUYASH ERP',
      address: 'Your Company Address',
      phone: '+91 1234567890',
      email: 'info@suyasherp.com',
      logo: path.join(__dirname, '../assets/logo.png')
    };

    // Generate PDF
    const pdfBuffer = await PDFService.generateBOMPDF(bom, companyInfo);

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=BOM-${bom.bom_id}.pdf`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Email BOM PDF
// @route   POST /api/boms/:id/send
// @access  Manager, Production
exports.emailBOM = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { email, cc, bcc, subject, message, revision_no } = req.body;

    if (!email) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Recipient email is required'
      });
    }

    const bom = await Bom.findById(req.params.id)
      .populate('parent_item_id')
      .populate({
        path: 'components.component_item_id',
        select: 'part_no part_description unit rm_grade'
      })
      .populate('components.subcontract_vendor', 'name vendor_code')
      .populate('approved_by', 'name')
      .populate('created_by', 'name')
      .session(session);

    if (!bom) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'BOM not found'
      });
    }

    // Check if BOM is cancelled
    if (bom.status === 'Cancelled') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Cannot email cancelled BOM'
      });
    }

    // Get company info
    const companyInfo = {
      name: 'SUYASH ERP',
      address: 'Your Company Address',
      phone: '+91 1234567890',
      email: 'info@suyasherp.com',
      logo: path.join(__dirname, '../assets/logo.png')
    };

    // Generate PDF
    const pdfBuffer = await PDFService.generateBOMPDF(bom, companyInfo);

    // Save PDF temporarily (optional)
    const pdfFileName = `BOM-${bom.bom_id}-${Date.now()}.pdf`;
    const pdfPath = path.join(__dirname, '../temp', pdfFileName);
    await fs.writeFile(pdfPath, pdfBuffer);

    // Prepare email
    const mailOptions = {
      to: email,
      cc: cc ? cc.split(',').map(e => e.trim()) : [],
      bcc: bcc ? bcc.split(',').map(e => e.trim()) : [],
      subject: subject || `BOM: ${bom.bom_id} - Revision ${bom.current_revision}`,
      html: `
        <h3>BOM Details</h3>
        <p><strong>BOM ID:</strong> ${bom.bom_id}</p>
        <p><strong>Parent Item:</strong> ${bom.parent_item_id.part_no} - ${bom.parent_item_id.part_description}</p>
        <p><strong>Version:</strong> ${bom.bom_version}</p>
        <p><strong>Type:</strong> ${bom.bom_type}</p>
        <p><strong>Revision:</strong> ${revision_no || bom.current_revision}</p>
        <p><strong>Generated By:</strong> ${req.user.name}</p>
        <p><strong>Generated At:</strong> ${new Date().toLocaleString()}</p>
        ${message ? `<p><strong>Message:</strong> ${message}</p>` : ''}
        <hr>
        <p>Please find attached the BOM PDF.</p>
      `,
      attachments: [{
        filename: pdfFileName,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }]
    };

    // Send email
    await EmailService.sendEmail(mailOptions);

    // Update revision history if revision number specified
    if (revision_no) {
      const revision = bom.revision_history.find(r => r.revision_no === parseInt(revision_no));
      if (revision) {
        if (!revision.email_sent_to) {
          revision.email_sent_to = [];
        }
        revision.email_sent_to.push(email);
        revision.pdf_path = pdfPath;
      }
    }

    await bom.save({ session });

    // Clean up temp file after sending
    await fs.unlink(pdfPath).catch(console.error);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: `BOM PDF sent to ${email} successfully`
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get revision history list
// @route   GET /api/boms/:id/revisions
// @access  All roles
exports.getRevisionHistory = async (req, res) => {
  try {
    const bom = await Bom.findById(req.params.id)
      .select('bom_id revision_history')
      .populate('revision_history.created_by', 'name email');

    if (!bom) {
      return res.status(404).json({
        success: false,
        message: 'BOM not found'
      });
    }

    const revisions = bom.revision_history.map(rev => ({
      revision_no: rev.revision_no,
      created_at: rev.created_at,
      created_by: rev.created_by,
      change_description: rev.change_description,
      has_pdf: !!rev.pdf_path,
      email_sent_to: rev.email_sent_to || []
    })).sort((a, b) => b.revision_no - a.revision_no);

    res.status(200).json({
      success: true,
      data: {
        bom_id: bom.bom_id,
        current_revision: bom.current_revision,
        total_revisions: revisions.length,
        revisions
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Compare two revisions
// @route   GET /api/boms/:id/compare/:rev1/:rev2
// @access  Manager, Production
exports.compareRevisions = async (req, res) => {
  try {
    const { id, rev1, rev2 } = req.params;
    const revision1 = parseInt(rev1);
    const revision2 = parseInt(rev2);

    const bom = await Bom.findById(id)
      .select('bom_id revision_history');

    if (!bom) {
      return res.status(404).json({
        success: false,
        message: 'BOM not found'
      });
    }

    const revSnapshot1 = bom.revision_history.find(r => r.revision_no === revision1);
    const revSnapshot2 = bom.revision_history.find(r => r.revision_no === revision2);

    if (!revSnapshot1 || !revSnapshot2) {
      return res.status(404).json({
        success: false,
        message: 'One or both revisions not found'
      });
    }

    // Compare components
    const components1 = revSnapshot1.snapshot_data.components || [];
    const components2 = revSnapshot2.snapshot_data.components || [];

    const added = components2.filter(c2 => 
      !components1.some(c1 => c1.component_part_no === c2.component_part_no)
    );

    const removed = components1.filter(c1 => 
      !components2.some(c2 => c2.component_part_no === c1.component_part_no)
    );

    const changed = components2.filter(c2 => {
      const c1 = components1.find(c1 => c1.component_part_no === c2.component_part_no);
      if (c1) {
        return c1.quantity_per !== c2.quantity_per ||
               c1.scrap_percent !== c2.scrap_percent ||
               c1.is_phantom !== c2.is_phantom;
      }
      return false;
    }).map(c2 => {
      const c1 = components1.find(c1 => c1.component_part_no === c2.component_part_no);
      return {
        part_no: c2.component_part_no,
        old_quantity: c1.quantity_per,
        new_quantity: c2.quantity_per,
        old_scrap: c1.scrap_percent,
        new_scrap: c2.scrap_percent
      };
    });

    res.status(200).json({
      success: true,
      data: {
        comparison: {
          revision1: revision1,
          revision2: revision2,
          created_at1: revSnapshot1.created_at,
          created_at2: revSnapshot2.created_at,
          summary: {
            total_components_before: components1.length,
            total_components_after: components2.length,
            added: added.length,
            removed: removed.length,
            changed: changed.length
          }
        },
        changes: {
          added: added.map(a => ({
            part_no: a.component_part_no,
            description: a.component_desc,
            quantity: a.quantity_per
          })),
          removed: removed.map(r => ({
            part_no: r.component_part_no,
            description: r.component_desc,
            quantity: r.quantity_per
          })),
          modified: changed
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};