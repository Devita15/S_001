const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate BOM PDF
 * @param {Object} bomData - BOM data (can be current or revision snapshot)
 * @param {Object} companyInfo - Company information for header
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateBOMPDF(bomData, companyInfo) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `BOM - ${bomData.bom_id}`,
          Author: 'MECH·ERP',
          Subject: 'Bill of Materials',
          Keywords: 'BOM, manufacturing, ERP'
        }
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Add company logo if exists
      if (companyInfo.logo && fs.existsSync(companyInfo.logo)) {
        doc.image(companyInfo.logo, 50, 45, { width: 100 });
      }

      // Header
      doc.fontSize(20).text('BILL OF MATERIALS', 50, 50, { align: 'center' });
      doc.moveDown();

      // Company info
      doc.fontSize(10)
        .text(companyInfo.name, { align: 'right' })
        .text(companyInfo.address, { align: 'right' })
        .text(`Phone: ${companyInfo.phone}`, { align: 'right' })
        .text(`Email: ${companyInfo.email}`, { align: 'right' });
      
      doc.moveDown(2);

      // BOM header info
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text(`BOM ID: ${bomData.bom_id}`);
      doc.font('Helvetica').fontSize(10);
      
      // Parent Item
      if (bomData.parent_item) {
        doc.text(`Parent Item: ${bomData.parent_item.part_no} - ${bomData.parent_item.part_description}`);
        if (bomData.parent_item.drawing_no) {
          doc.text(`Drawing No: ${bomData.parent_item.drawing_no}  Rev: ${bomData.parent_item.revision_no || '0'}`);
        }
      }
      
      doc.text(`Version: ${bomData.bom_version}`);
      doc.text(`Type: ${bomData.bom_type}`);
      doc.text(`Batch Size: ${bomData.batch_size || 1}`);
      if (bomData.yield_percent) {
        doc.text(`Yield %: ${bomData.yield_percent}`);
      }
      
      doc.moveDown();

      // Components table header
      const tableTop = doc.y;
      const col1 = 50;      // Level
      const col2 = 80;      // Part No
      const col3 = 250;     // Description
      const col4 = 400;     // Qty per
      const col5 = 470;     // Unit
      const col6 = 520;     // Scrap %
      
      doc.font('Helvetica-Bold');
      doc.text('Level', col1, tableTop);
      doc.text('Part No', col2, tableTop);
      doc.text('Description', col3, tableTop);
      doc.text('Qty/Batch', col4, tableTop);
      doc.text('Unit', col5, tableTop);
      doc.text('Scrap %', col6, tableTop);
      
      doc.moveTo(50, tableTop + 15)
         .lineTo(570, tableTop + 15)
         .stroke();
      
      doc.font('Helvetica');
      
      // Components table rows
      let rowY = tableTop + 25;
      
      if (bomData.components && bomData.components.length > 0) {
        // Sort by level
        const sortedComponents = [...bomData.components].sort((a, b) => a.level - b.level);
        
        for (const comp of sortedComponents) {
          // Check if we need a new page
          if (rowY > 700) {
            doc.addPage();
            rowY = 50;
            
            // Repeat header on new page
            doc.font('Helvetica-Bold');
            doc.text('Level', col1, rowY);
            doc.text('Part No', col2, rowY);
            doc.text('Description', col3, rowY);
            doc.text('Qty/Batch', col4, rowY);
            doc.text('Unit', col5, rowY);
            doc.text('Scrap %', col6, rowY);
            
            doc.moveTo(50, rowY + 15)
               .lineTo(570, rowY + 15)
               .stroke();
            
            doc.font('Helvetica');
            rowY += 25;
          }
          
          // Indent based on level
          const levelIndent = comp.level * 10;
          
          doc.text(comp.level.toString(), col1, rowY);
          doc.text(comp.component_part_no, col2 + levelIndent, rowY, { 
            width: 150 - levelIndent,
            ellipsis: true 
          });
          doc.text(comp.component_desc || '', col3, rowY, { 
            width: 140,
            ellipsis: true 
          });
          doc.text(comp.quantity_per?.toString() || '1', col4, rowY);
          doc.text(comp.unit || '', col5, rowY);
          doc.text(comp.scrap_percent ? `${comp.scrap_percent}%` : '-', col6, rowY);
          
          // Add phantom indicator
          if (comp.is_phantom) {
            doc.fontSize(8).text('(Phantom)', col2 + levelIndent + 100, rowY + 12);
            doc.fontSize(10);
          }
          
          // Add subcontract indicator
          if (comp.is_subcontract) {
            doc.fontSize(8).text('(Subcontract)', col2 + levelIndent + 100, rowY + 12);
            doc.fontSize(10);
          }
          
          rowY += 20;
        }
      } else {
        doc.text('No components defined', 50, rowY);
      }
      
      // Footer with generation info
      const footerY = 750;
      doc.fontSize(8);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 50, footerY);
      doc.text(`Generated by: MECH·ERP`, 50, footerY + 12);
      
      // Page numbers
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.text(`Page ${i + 1} of ${totalPages}`, 500, 750, { align: 'right' });
      }
      
      doc.end();
      
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateBOMPDF };