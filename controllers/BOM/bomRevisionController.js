const Bom = require('../../models/BOM/Bom');
const BomRevision = require('../../models/BOM/BomRevision');
const User = require("../../models/user's & setting's/User");
const mongoose = require('mongoose');
const { generateRevisionId } = require('../../utils/BOM/bomHelpers');
const { generateBOMPDF } = require('../../services/BOM/bomPdfService');
const EmailService = require('../../services/emailService');
const fs = require('fs').promises;
const path = require('path');

// @desc    Create new revision snapshot
// @route   POST /api/boms/:id/revise
// @access  Manager, Production
exports.createRevision = async (req, res) => {
  try {
    const bom = await Bom.findById(req.params.id)
      .populate('parent_item_id')
      .populate('components.component_item_id')
      .populate('components.subcontract_vendor');

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

    // Generate revision ID
    const revision_id = await generateRevisionId(bom.bom_id, newRevisionNo);

    // Create revision entry
    const revisionEntry = {
      revision_id,
      bom_id: bom._id,
      revision_no: newRevisionNo,
      snapshot_data: snapshotData,
      created_by: req.user._id,
      created_at: new Date(),
      change_description: req.body.change_description || `Revision ${newRevisionNo} created`,
      previous_revision_no: bom.current_revision,
      is_current: true
    };

    // Add to revision history collection
    await BomRevision.create(revisionEntry);

    // Update previous revision to not be current
    if (bom.current_revision > 0) {
      await BomRevision.updateMany(
        { bom_id: bom._id, revision_no: bom.current_revision },
        { $set: { is_current: false } }
      );
    }

    // Update BOM's current revision
    bom.current_revision = newRevisionNo;
    await bom.save();

    res.status(201).json({
      success: true,
      message: `Revision ${newRevisionNo} created successfully`,
      data: {
        revision_no: newRevisionNo,
        revision_id,
        created_at: revisionEntry.created_at,
        change_description: revisionEntry.change_description
      }
    });

  } catch (error) {
    console.error('Create revision error:', error);
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
      .select('bom_id parent_item_id');

    if (!bom) {
      return res.status(404).json({
        success: false,
        message: 'BOM not found'
      });
    }

    // Find the specific revision
    const revision = await BomRevision.findOne({
      bom_id: id,
      revision_no: revisionNo
    }).populate('created_by', 'name email');

    if (!revision) {
      return res.status(404).json({
        success: false,
        message: `Revision ${revisionNo} not found`
      });
    }

    res.status(200).json({
      success: true,
      data: {
        bom_id: bom.bom_id,
        revision_no: revision.revision_no,
        snapshot_data: revision.snapshot_data,
        created_by: revision.created_by,
        created_at: revision.created_at,
        change_description: revision.change_description,
        is_current: revision.is_current,
        pdf_path: revision.pdf_path,
        email_sent_to: revision.email_sent_to
      }
    });

  } catch (error) {
    console.error('Get revision error:', error);
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
      .select('bom_id parent_part_no current_revision');

    if (!bom) {
      return res.status(404).json({
        success: false,
        message: 'BOM not found'
      });
    }

    const revisions = await BomRevision.find({ bom_id: req.params.id })
      .populate('created_by', 'name email')
      .sort('-revision_no')
      .select('revision_no created_at change_description is_current pdf_path email_sent_to');

    res.status(200).json({
      success: true,
      data: {
        bom_id: bom.bom_id,
        parent_part_no: bom.parent_part_no,
        current_revision: bom.current_revision,
        total_revisions: revisions.length,
        revisions: revisions.map(rev => ({
          revision_no: rev.revision_no,
          created_at: rev.created_at,
          created_by: rev.created_by,
          change_description: rev.change_description,
          is_current: rev.is_current,
          has_pdf: !!rev.pdf_path,
          email_sent_to: rev.email_sent_to || []
        }))
      }
    });

  } catch (error) {
    console.error('Get revision history error:', error);
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
      .select('bom_id parent_part_no');

    if (!bom) {
      return res.status(404).json({
        success: false,
        message: 'BOM not found'
      });
    }

    const revSnapshot1 = await BomRevision.findOne({
      bom_id: id,
      revision_no: revision1
    });

    const revSnapshot2 = await BomRevision.findOne({
      bom_id: id,
      revision_no: revision2
    });

    if (!revSnapshot1 || !revSnapshot2) {
      return res.status(404).json({
        success: false,
        message: 'One or both revisions not found'
      });
    }

    // Get components arrays
    const components1 = revSnapshot1.snapshot_data.components || [];
    const components2 = revSnapshot2.snapshot_data.components || [];

    // Create maps for comparison
    const compMap1 = new Map(components1.map(c => [c.component_part_no, c]));
    const compMap2 = new Map(components2.map(c => [c.component_part_no, c]));

    // Find added, removed, and changed
    const added = [];
    const removed = [];
    const changed = [];

    // Check for added and changed
    for (const [partNo, comp2] of compMap2) {
      const comp1 = compMap1.get(partNo);
      if (!comp1) {
        added.push({
          part_no: partNo,
          description: comp2.component_desc,
          quantity: comp2.quantity_per,
          unit: comp2.unit,
          level: comp2.level
        });
      } else {
        // Check for changes
        const changes = {};
        if (comp1.quantity_per !== comp2.quantity_per) {
          changes.quantity = {
            old: comp1.quantity_per,
            new: comp2.quantity_per
          };
        }
        if (comp1.scrap_percent !== comp2.scrap_percent) {
          changes.scrap = {
            old: comp1.scrap_percent,
            new: comp2.scrap_percent
          };
        }
        if (comp1.is_phantom !== comp2.is_phantom) {
          changes.is_phantom = {
            old: comp1.is_phantom,
            new: comp2.is_phantom
          };
        }
        if (comp1.is_subcontract !== comp2.is_subcontract) {
          changes.is_subcontract = {
            old: comp1.is_subcontract,
            new: comp2.is_subcontract
          };
        }
        if (comp1.level !== comp2.level) {
          changes.level = {
            old: comp1.level,
            new: comp2.level
          };
        }
        if (Object.keys(changes).length > 0) {
          changed.push({
            part_no: partNo,
            description: comp2.component_desc,
            changes
          });
        }
      }
    }

    // Check for removed
    for (const [partNo, comp1] of compMap1) {
      if (!compMap2.has(partNo)) {
        removed.push({
          part_no: partNo,
          description: comp1.component_desc,
          quantity: comp1.quantity_per,
          unit: comp1.unit,
          level: comp1.level
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        bom_id: bom.bom_id,
        parent_part_no: bom.parent_part_no,
        comparison: {
          revision1: {
            no: revision1,
            created_at: revSnapshot1.created_at,
            change_description: revSnapshot1.change_description
          },
          revision2: {
            no: revision2,
            created_at: revSnapshot2.created_at,
            change_description: revSnapshot2.change_description
          },
          summary: {
            total_components_before: components1.length,
            total_components_after: components2.length,
            added: added.length,
            removed: removed.length,
            changed: changed.length
          }
        },
        changes: {
          added,
          removed,
          modified: changed
        }
      }
    });

  } catch (error) {
    console.error('Compare revisions error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Generate BOM PDF for specific revision
// @route   POST /api/boms/:id/revision/:rev/pdf
// @access  Manager, Production
exports.generateRevisionPDF = async (req, res) => {
  try {
    const { id, rev } = req.params;
    const revisionNo = parseInt(rev);

    const revision = await BomRevision.findOne({
      bom_id: id,
      revision_no: revisionNo
    }).populate('created_by', 'name email');

    if (!revision) {
      return res.status(404).json({
        success: false,
        message: `Revision ${revisionNo} not found`
      });
    }

    // Get company info (from settings)
    const companyInfo = {
      name: process.env.COMPANY_NAME || 'MECH·ERP',
      address: process.env.COMPANY_ADDRESS || '',
      phone: process.env.COMPANY_PHONE || '',
      email: process.env.COMPANY_EMAIL || '',
      logo: path.join(__dirname, '../../assets/logo.png')
    };

    // Generate PDF
    const pdfBuffer = await generateBOMPDF(revision.snapshot_data, companyInfo);

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=BOM-${revision.snapshot_data.bom_id}-Rev${revisionNo}.pdf`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);

  } catch (error) {
    console.error('Generate revision PDF error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Email BOM revision (with fallback for testing)
// @route   POST /api/boms/:id/revision/:rev/send
// @access  Manager, Production
exports.emailRevision = async (req, res) => {
  try {
    const { id, rev } = req.params;
    const { email, cc, bcc, subject, message } = req.body;
    const revisionNo = parseInt(rev);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Recipient email is required'
      });
    }

    const revision = await BomRevision.findOne({
      bom_id: id,
      revision_no: revisionNo
    });

    if (!revision) {
      return res.status(404).json({
        success: false,
        message: `Revision ${revisionNo} not found`
      });
    }

    // Get company info
    const companyInfo = {
      name: process.env.COMPANY_NAME || 'MECH·ERP',
      address: process.env.COMPANY_ADDRESS || '',
      phone: process.env.COMPANY_PHONE || '',
      email: process.env.COMPANY_EMAIL || '',
      logo: path.join(__dirname, '../../assets/logo.png')
    };

    // Generate PDF
    const pdfBuffer = await generateBOMPDF(revision.snapshot_data, companyInfo);

    // Save PDF temporarily
    const pdfFileName = `BOM-${revision.snapshot_data.bom_id}-Rev${revisionNo}-${Date.now()}.pdf`;
    const pdfPath = path.join(__dirname, '../../temp', pdfFileName);
    
    // Ensure temp directory exists
    const tempDir = path.join(__dirname, '../../temp');
    try {
      await fs.access(tempDir);
    } catch {
      await fs.mkdir(tempDir, { recursive: true });
    }
    
    await fs.writeFile(pdfPath, pdfBuffer);

    // Try to send email, but don't fail if email fails
    let emailSent = false;
    try {
      // Prepare email
      const mailOptions = {
        to: email,
        cc: cc ? cc.split(',').map(e => e.trim()) : [],
        bcc: bcc ? bcc.split(',').map(e => e.trim()) : [],
        subject: subject || `BOM: ${revision.snapshot_data.bom_id} - Revision ${revisionNo}`,
        html: `
          <h3>BOM Revision Details</h3>
          <p><strong>BOM ID:</strong> ${revision.snapshot_data.bom_id}</p>
          <p><strong>Parent Item:</strong> ${revision.snapshot_data.parent_item.part_no} - ${revision.snapshot_data.parent_item.part_description}</p>
          <p><strong>Version:</strong> ${revision.snapshot_data.bom_version}</p>
          <p><strong>Type:</strong> ${revision.snapshot_data.bom_type}</p>
          <p><strong>Revision:</strong> ${revisionNo}</p>
          <p><strong>Change Description:</strong> ${revision.change_description || 'No description provided'}</p>
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
      emailSent = true;
    } catch (emailError) {
      console.warn('Email sending failed, but continuing:', emailError.message);
    }

    // Update revision with email info (even if email failed, we still record the attempt)
    if (!revision.email_sent_to) {
      revision.email_sent_to = [];
    }
    revision.email_sent_to.push(email);
    revision.pdf_path = pdfPath;
    await revision.save();

    res.status(200).json({
      success: true,
      message: emailSent 
        ? `BOM revision ${revisionNo} PDF sent to ${email} successfully`
        : `BOM revision ${revisionNo} PDF generated but email sending failed. PDF saved at: ${pdfPath}`,
      pdf_path: pdfPath
    });

  } catch (error) {
    console.error('Email revision error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};