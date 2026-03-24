'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// excelGenerators.js
//
// Generates pixel-perfect Excel workbooks matching each template type:
//   busbar             → Busbar_cost__09_01_2026.xlsx style
//   landed_cost        → CB71942_43_45 style (vertical with ICC)
//   cost_breakup       → Steering_brackets style (simple RM + ops + OH)
//   part_wise          → Poly_sheet customer quotation style
//   nomex_sheet        → Nomex_Paper_Quotation style
//   revised_conversion → 26_02_2026 assembly style
//   laser_fabrication  → CC0L0005002 full sheet metal style
//
// Entry point: generateQuotationExcel(workbook, quotationData, template)
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  NAVY:      'FF1F3864',  BLUE:       'FF2E75B6',  LIGHT_BLUE: 'FFD9E1F2',
  YELLOW:    'FFFFFF2CC', RED:        'FFFF0000',   ORANGE:     'FFED7D31',
  WHITE:     'FFFFFFFF',  GREY:       'FFF0F0F0',   DARK_GREY:  'FF595959',
  ALT_ROW:   'FFDCE6F1',  BORDER:     'FF8EA9C1',   GREEN_BG:   'FFE2EFDA',
  TEAL_HDR:  'FF1F4E79',  TEAL_LIGHT: 'FFD9E1F2',
};

const fill  = a => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: a } });
const font  = (bold, sz, argb, nm) => ({ bold:!!bold, size:sz||10, color:{argb:argb||'FF000000'}, name:nm||'Calibri' });
const align = (h, v, wrap) => ({ horizontal:h||'left', vertical:v||'middle', wrapText:!!wrap });
const bord  = (s) => { const b={style:s||'thin',color:{argb:C.BORDER}}; return {top:b,right:b,bottom:b,left:b}; };
const thickB= () => { const b={style:'medium',color:{argb:C.NAVY}}; return {top:b,right:b,bottom:b,left:b}; };

const fmtNum  = (v, d=2) => +(parseFloat(v)||0).toFixed(d);
const fmtDate = d => { if(!d) return ''; const dt=new Date(d); return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`; };

function sty(cell, o={}) {
  if(o.fill)      cell.fill      = o.fill;
  if(o.font)      cell.font      = o.font;
  if(o.alignment) cell.alignment = o.alignment;
  if(o.border)    cell.border    = o.border;
  if(o.numFmt)    cell.numFmt    = o.numFmt;
  return cell;
}

function mc(ws, r1, c1, r2, c2, value, o={}) {
  if(r1!==r2||c1!==c2) ws.mergeCells(r1,c1,r2,c2);
  const cell = ws.getCell(r1,c1);
  cell.value = value;
  sty(cell,o);
  if(o.height) ws.getRow(r1).height = o.height;
  return cell;
}

// ─── Shared header (company + quotation meta) ─────────────────────────────────
function writeHeader(ws, q, totalCols) {
  mc(ws,1,1,1,totalCols, q.CompanyName||'COMPANY', {
    fill:fill(C.NAVY), font:font(true,16,'FFFFFFFF'), alignment:align('center'), border:thickB(), height:34
  });
  const half = Math.floor(totalCols/2);
  mc(ws,2,1,2,half, `GSTIN: ${q.CompanyGSTIN||''}  |  ${q.CompanyState||''}`, {
    fill:fill(C.BLUE), font:font(false,9,'FFFFFFFF'), alignment:align('left'), height:20
  });
  mc(ws,2,half+1,2,totalCols,'QUOTATION / COST ESTIMATION',{
    fill:fill(C.BLUE), font:font(true,11,'FFFFFFFF'), alignment:align('center')
  });
  const LF=fill(C.GREY), LFt=font(true,9,'1F3864'), VF=font(false,9), VFl=fill(C.WHITE);
  const rs = half+1;
  [['Quotation No.:',q.QuotationNo],['Date:',fmtDate(q.QuotationDate)],['Valid Till:',fmtDate(q.ValidTill)]].forEach(([l,v],i)=>{
    mc(ws,3+i,1,3+i,2,l,{fill:LF,font:LFt,border:bord(),alignment:align('right'),height:18});
    mc(ws,3+i,3,3+i,half,v,{fill:VFl,font:VF,border:bord()});
  });
  [['Customer:',q.CustomerName],['GSTIN:',q.CustomerGSTIN||'—'],['Phone:',q.CustomerPhone||'—']].forEach(([l,v],i)=>{
    mc(ws,3+i,rs,3+i,rs+1,l,{fill:LF,font:LFt,border:bord(),alignment:align('right')});
    mc(ws,3+i,rs+2,3+i,totalCols,v,{fill:VFl,font:VF,border:bord()});
  });
  mc(ws,6,1,6,half,`Address: ${q.CustomerAddress||''}, ${q.CustomerCity||''} ${q.CustomerPincode||''}`,{fill:VFl,font:VF,border:bord(),height:18});
  mc(ws,6,rs,6,totalCols,`Email: ${q.CustomerEmail||''}  Contact: ${q.CustomerContactPerson||''}`,{fill:VFl,font:VF,border:bord()});
  return 7;
}

// ─── Shared totals + T&C footer ───────────────────────────────────────────────
function writeFooter(ws, q, startRow, totalCols) {
  let r = startRow+1;
  mc(ws,r,1,r,totalCols,'TERMS & CONDITIONS',{fill:fill(C.NAVY),font:font(true,10,'FFFFFFFF'),alignment:align('center'),height:20}); r++;
  (q.TermsConditions||[]).forEach((tc,i)=>{
    mc(ws,r,1,r,2,`${i+1}.`,{fill:fill(C.GREY),font:font(true,9),border:bord(),alignment:align('center')});
    mc(ws,r,3,r,totalCols,tc.Description||tc.Title||'',{fill:fill(C.WHITE),font:font(false,9),border:bord(),alignment:align('left','middle',true),height:22});
    r++;
  });
  r++;
  const lc=totalCols-3, amt=totalCols;
  [
    ['Sub Total (Rs.):', fmtNum(q.SubTotal), C.GREY,'000000'],
    [`GST ${q.GSTPercentage||18}% (${q.GSTType||'CGST/SGST'}):`, fmtNum(q.GSTAmount), C.GREY,'000000'],
    ['GRAND TOTAL (Rs.):', fmtNum(q.GrandTotal), C.ORANGE,'FFFFFF'],
  ].forEach(([l,v,bg,fg])=>{
    mc(ws,r,1,r,lc-1,l,{fill:fill(bg),font:font(true,10,fg),alignment:align('right'),border:bord(),height:22});
    mc(ws,r,lc,r,amt,v,{fill:fill(bg),font:font(true,10,fg),alignment:align('right'),border:bord(),numFmt:'#,##0.00'});
    r++;
  });
  r++;
  mc(ws,r,1,r,totalCols,`Amount in Words: ${q.AmountInWords||''}`,{fill:fill(C.LIGHT_BLUE),font:font(true,9,'1F3864'),border:bord(),alignment:align('left','middle',true),height:22}); r++;
  if(q.CustomerRemarks){ mc(ws,r,1,r,totalCols,`Note: ${q.CustomerRemarks}`,{fill:fill(C.WHITE),font:font(false,9),border:bord(),alignment:align('left','middle',true),height:20}); r++; }
  r+=2;
  mc(ws,r,1,r,Math.floor(totalCols/2),'Customer Acknowledgement & Signature',{font:font(true,9),alignment:align('center')});
  mc(ws,r,Math.floor(totalCols/2)+1,r,totalCols,`Authorised Signatory — ${q.CompanyName||''}`,{font:font(true,9),alignment:align('center')});
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 1: BUSBAR  (horizontal table, dynamic process columns)
// ═════════════════════════════════════════════════════════════════════════════
function generateBusbarSheet(ws, q, template) {
  const procNames = [];
  q.Items.forEach(item=>{
    (item.process_breakdown||item.processes||[]).forEach(p=>{
      const n=p.process_name||p.name||''; if(n&&!procNames.includes(n)) procNames.push(n);
    });
  });
  const FIX1=18, FIX2=5, TC=FIX1+procNames.length+FIX2;

  [5,14,25,14,6,18,6,6,8,10,10,12,12,12,10,10,10,10,...procNames.map(()=>10),12,10,12,8,12].forEach((w,i)=>{ ws.getColumn(i+1).width=w; });

  let r=writeHeader(ws,q,TC);
  const H={fill:fill(C.NAVY),font:font(true,9,'FFFFFFFF'),alignment:align('center','middle',true),border:bord('medium'),height:34};
  const S={fill:fill(C.BLUE),font:font(true,9,'FFFFFFFF'),alignment:align('center','middle',true),border:bord(),height:22};

  mc(ws,r,1,r,6,'PART IDENTIFICATION',H); mc(ws,r,7,r,18,'RAW MATERIAL COST',H);
  if(procNames.length) mc(ws,r,19,r,18+procNames.length,'PROCESS COSTS',H);
  mc(ws,r,19+procNames.length,r,TC,'TOTALS',H); r++;

  ['SR.','Part No.','Part Description','Drawing No.','Rev.','RM Grade','T\n(mm)','W\n(mm)','L\n(mm)','G.Wt/Pcs\n(kg)','RM Rate\n(Rs/kg)','Profile\nConv.Rate','Total RM\nRate/kg','Gross RM\nCost (Rs)','Net Wt\n(kg)','Scrap\nKgs','Scrap\nRate/Kg','Scrap\nCost (Rs)']
    .forEach((h,i)=>mc(ws,r,i+1,r,i+1,h,S));
  procNames.forEach((h,i)=>mc(ws,r,FIX1+1+i,r,FIX1+1+i,h,S));
  ['Sub Total\n(Rs)','Margin\n+OH%','Final Part\nCost (Rs)','Qty\nReqd','Amount\n(Rs)'].forEach((h,i)=>mc(ws,r,FIX1+procNames.length+1+i,r,FIX1+procNames.length+1+i,h,S));
  r++;

  q.Items.forEach((item,idx)=>{
    const bg=idx%2?fill(C.ALT_ROW):fill(C.WHITE);
    const D={fill:bg,font:font(false,9),border:bord(),alignment:align('center'),height:18};
    const N={...D,alignment:align('right'),numFmt:'#,##0.00'};
    const pm={};
    (item.process_breakdown||item.processes||[]).forEach(p=>{ pm[p.process_name||p.name]=fmtNum(p.calculated_cost||p.cost||p.amount||0); });
    [idx+1,item.PartNo||'',item.PartName||'',item.drawing_no||'',item.revision_no||'0',item.rm_grade||'',
     fmtNum(item.Thickness,2),fmtNum(item.Width,2),fmtNum(item.Length,2),fmtNum(item.gross_weight_kg,6),
     fmtNum(item.rm_rate),fmtNum(item.profile_conversion_rate||0),fmtNum(item.total_rm_rate),fmtNum(item.gross_rm_cost),
     fmtNum(item.net_weight_kg,6),fmtNum(item.scrap_kgs,6),fmtNum(item.scrap_rate_per_kg),fmtNum(item.scrap_cost)
    ].forEach((v,ci)=>mc(ws,r,ci+1,r,ci+1,v,ci>=6?N:D));
    procNames.forEach((pn,pi)=>mc(ws,r,FIX1+1+pi,r,FIX1+1+pi,pm[pn]||0,N));
    const c1=FIX1+procNames.length+1;
    mc(ws,r,c1,r,c1,fmtNum(item.SubTotal),N);
    mc(ws,r,c1+1,r,c1+1,`${fmtNum(item.MarginPercent||0)}%`,D);
    mc(ws,r,c1+2,r,c1+2,fmtNum(item.FinalRate),N);
    mc(ws,r,c1+3,r,c1+3,item.Quantity||1,D);
    mc(ws,r,c1+4,r,c1+4,fmtNum(item.Amount),N);
    r++;
  });
  writeFooter(ws,q,r+1,TC);
  ws.views=[{state:'frozen',xSplit:3,ySplit:8}];
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 2: LANDED COST — vertical per-item with ICC financing
// ═════════════════════════════════════════════════════════════════════════════
function generateLandedCostSheet(ws, q, template) {
  const TC=6;
  [32,8,18,18,8,18].forEach((w,i)=>ws.getColumn(i+1).width=w);
  let r=writeHeader(ws,q,TC);
  const SC={fill:fill(C.NAVY),font:font(true,10,'FFFFFFFF'),alignment:align('left'),border:bord('medium'),height:24};
  const HD={fill:fill(C.BLUE),font:font(true,9,'FFFFFFFF'),alignment:align('center'),border:bord(),height:20};
  const LB={fill:fill(C.GREY),font:font(true,9,'1F3864'),alignment:align('left'),border:bord(),height:18};
  const VL={fill:fill(C.WHITE),font:font(false,9),alignment:align('right'),border:bord(),numFmt:'#,##0.0000',height:18};
  const HL={fill:fill(C.ORANGE),font:font(true,12,'FFFFFFFF'),alignment:align('right'),border:bord('medium'),numFmt:'#,##0.00',height:28};

  q.Items.forEach((item,idx)=>{
    r++;
    mc(ws,r,1,r,TC,`ITEM ${idx+1}: ${item.PartNo||''} — ${item.PartName||''}`,SC); r++;
    mc(ws,r,1,r,TC,'DRAWING SPECIFICATION',HD); r++;
    [['Item No.',item.PartNo||'','RM Grade',item.rm_grade||''],
     ['Material',item.rm_type||'Copper','RM Source',item.rm_source||''],
     ['Strip Width (mm)',item.Width||'','Pitch / Length (mm)',item.pitch||item.Length||''],
     ['Thickness (mm)',item.Thickness||'','No. of Cavity',item.no_of_cavity||1],
     ['Density (g/cm³)',item.density||8.93,'Qty Required',item.Quantity||'']
    ].forEach(([l1,v1,l2,v2])=>{
      mc(ws,r,1,r,2,l1,LB); mc(ws,r,3,r,3,v1,{...VL,numFmt:'0.######'});
      mc(ws,r,4,r,4,l2,LB); mc(ws,r,5,r,TC,v2,{...VL,numFmt:'0.######'}); r++;
    });

    r++; mc(ws,r,1,r,TC,'WEIGHT CALCULATION',HD); r++;
    [['Gross Weight / Piece (kg)',fmtNum(item.gross_weight_kg,8),'#,##0.00000000'],
     ['RM Rejection %',(item.rm_rejection_percent||2)/100,'0.00%'],
     ['Gross Wt incl. Rejection (kg)',fmtNum(item.gross_wt_incl_rejection||0,8),'#,##0.00000000'],
     ['Net Weight (kg)',fmtNum(item.net_weight_kg,8),'#,##0.00000000'],
     ['Scrap Wt (kg)',fmtNum((item.gross_wt_incl_rejection||0)-item.net_weight_kg,8),'#,##0.00000000'],
     ['Scrap Realisation %',(item.scrap_realisation_percent||98)/100,'0.00%'],
     ['Scrap Rate (Rs/kg)',fmtNum(item.scrap_rate_per_kg||0),'#,##0.00'],
    ].forEach(([l,v,fmt])=>{ mc(ws,r,1,r,3,l,LB); mc(ws,r,4,r,TC,v,{...VL,numFmt:fmt}); r++; });

    r++; mc(ws,r,1,r,TC,'RM RATE CHAIN',HD); r++;
    [['Basic RM Rate (Rs/kg)',item.rm_rate||0,'#,##0.00'],
     ['GST on RM %',(item.rm_gst_pct||18)/100,'0%'],
     ['GST Amount',fmtNum((item.rm_rate||0)*0.18),'#,##0.00'],
     ['Profile Conversion Rate',item.profile_conversion_rate||0,'#,##0.00'],
     ['Transport (Rs/kg)',item.transport_rate_per_kg||0,'#,##0.00'],
     ['Gross RM Rate',fmtNum(item.gross_rm_rate||0),'#,##0.00'],
     ['GST Set-off',fmtNum(item.gst_setoff||0),'#,##0.00'],
     ['NET RM Rate (Rs/kg)',fmtNum(item.net_rm_rate||0),'#,##0.00'],
    ].forEach(([l,v,fmt])=>{ mc(ws,r,1,r,3,l,LB); mc(ws,r,4,r,TC,v,{...VL,numFmt:fmt}); r++; });

    r++; mc(ws,r,1,r,TC,'COST BUILD-UP',HD); r++;
    [['Gross RM Cost (Rs)',item.gross_rm_cost||0],
     ['Scrap Credit (Rs)',-(item.scrap_credit||0)],
     ['Net RM Cost (Rs)',item.net_rm_cost||0],
     ['ICC Financing Cost (Rs)',item.icc_cost||0],
     ['OHP on Material (Rs)',item.ohp_on_material||0],
     ['Total Process Cost (Rs)',item.ProcessCost||0],
     ['OHP on Labour (Rs)',item.ohp_on_labour||0],
     ['Rejection Cost — Labour (Rs)',item.rejection_cost_labour||0],
     ['Packing Cost (Rs)',item.packing_cost||0],
     ['Inspection Cost (Rs)',item.inspection_cost||0],
     ['Tool Maintenance (Rs)',item.tool_maintenance_cost||0],
     ['Plating Cost (Rs)',item.plating_cost||0],
    ].forEach(([l,v])=>{ mc(ws,r,1,r,3,l,LB); mc(ws,r,4,r,TC,fmtNum(v),VL); r++; });

    if((item.process_breakdown||[]).length){
      r++; mc(ws,r,1,r,TC,'PROCESS BREAKDOWN',{fill:fill(C.TEAL_HDR),font:font(true,9,'FFFFFFFF'),alignment:align('center'),border:bord(),height:20}); r++;
      (item.process_breakdown||[]).forEach(p=>{
        mc(ws,r,1,r,3,p.process_name||p.name||'',LB);
        mc(ws,r,4,r,TC,fmtNum(p.calculated_cost||p.cost||p.amount||0),VL); r++;
      });
    }

    r++;
    mc(ws,r,1,r,3,'LANDED COST PER PIECE (Rs)',{fill:fill(C.ORANGE),font:font(true,12,'FFFFFFFF'),alignment:align('left'),border:bord('medium'),height:28});
    mc(ws,r,4,r,TC,fmtNum(item.FinalRate),HL); r+=2;
  });
  writeFooter(ws,q,r,TC);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 3: COST BREAKUP  (Steering bracket / proto parts)
// ═════════════════════════════════════════════════════════════════════════════
function generateCostBreakupSheet(ws, q, template) {
  const TC=5;
  [28,22,22,12,16].forEach((w,i)=>ws.getColumn(i+1).width=w);
  let r=writeHeader(ws,q,TC);

  const TL={fill:fill(C.NAVY),font:font(true,14,'FFFFFFFF'),alignment:align('center'),border:bord('medium'),height:32};
  const MT={fill:fill(C.GREY),font:font(true,9,'1F3864'),alignment:align('right'),border:bord(),height:18};
  const MV={fill:fill(C.WHITE),font:font(false,9),alignment:align('left'),border:bord()};
  const SH={fill:fill(C.BLUE),font:font(true,9,'FFFFFFFF'),alignment:align('left'),border:bord(),height:20};
  const TH={fill:fill(C.LIGHT_BLUE),font:font(true,9,'1F3864'),alignment:align('center'),border:bord(),height:18};
  const DR={fill:fill(C.WHITE),font:font(false,9),alignment:align('left'),border:bord(),height:18};
  const NR={fill:fill(C.WHITE),font:font(false,9),alignment:align('right'),border:bord(),numFmt:'#,##0.00',height:18};
  const TR={fill:fill(C.YELLOW),font:font(true,10),alignment:align('right'),border:bord('medium'),numFmt:'#,##0.00',height:22};
  const FR={fill:fill(C.ORANGE),font:font(true,12,'FFFFFFFF'),alignment:align('right'),border:bord('medium'),numFmt:'#,##0.00',height:28};

  q.Items.forEach((item,idx)=>{
    r++;
    mc(ws,r,1,r,TC,'COST BREAK UP SHEET',TL); r++;
    mc(ws,r,1,r,1,'PART NO',MT); mc(ws,r,2,r,3,item.PartNo||'',MV);
    mc(ws,r,4,r,4,'DATE:',MT); mc(ws,r,5,r,5,fmtDate(q.QuotationDate),MV); r++;
    mc(ws,r,1,r,1,'PART DESCRIPTION',MT); mc(ws,r,2,r,TC,item.PartName||item.Description||'',MV); r++;
    mc(ws,r,1,r,1,'CUSTOMER',MT); mc(ws,r,2,r,TC,q.CustomerName||'',MV); r+=2;
    mc(ws,r,TC,r,TC,'RS',{...TH,alignment:align('right')}); r++;
    mc(ws,r,1,r,2,'RAW MATERIAL COST:-',SH);
    mc(ws,r,3,r,4,item.rm_type||'Material',DR);
    mc(ws,r,5,r,5,fmtNum(item.rm_cost||item.gross_rm_cost||0),NR); r+=2;
    mc(ws,r,1,r,TC,'PROCESSING COST :-',SH); r++;
    mc(ws,r,1,r,1,'OPERATION DESCRIPTION',TH); mc(ws,r,2,r,2,'OPERATION',TH);
    mc(ws,r,3,r,3,'MACHINE',TH); mc(ws,r,4,r,4,'QTY / MANDAYS',TH); mc(ws,r,5,r,5,'AMOUNT (Rs)',TH); r++;
    (item.process_breakdown||item.processes||[]).forEach(p=>{
      mc(ws,r,1,r,1,p.operation_desc||'',DR); mc(ws,r,2,r,2,p.operation||p.process_name||p.name||'',DR);
      mc(ws,r,3,r,3,p.machine||'',DR); mc(ws,r,4,r,4,p.days_mandays||'',DR);
      mc(ws,r,5,r,5,fmtNum(p.calculated_cost||p.cost||p.amount||0),NR); r++;
    });
    r++;
    mc(ws,r,4,r,4,'TOTAL',{...MT,alignment:align('right')});
    mc(ws,r,5,r,5,fmtNum(item.ProcessCost||0),TR); r++;
    mc(ws,r,1,r,4,'TOTAL (RM + Processing)',{...MT,alignment:align('left')});
    mc(ws,r,5,r,5,fmtNum(item.SubTotal||0),TR); r++;
    mc(ws,r,1,r,2,'OVERHEADS & PROFIT',DR);
    mc(ws,r,3,r,3,`${fmtNum(item.OverheadPercent||10,0)}%`,{...DR,alignment:align('center')});
    mc(ws,r,4,r,4,'',DR);
    mc(ws,r,5,r,5,fmtNum(item.OverheadAmount||0),NR); r++;
    mc(ws,r,1,r,4,'COST PER PIECE',{fill:fill(C.ORANGE),font:font(true,11,'FFFFFFFF'),alignment:align('left'),border:bord('medium'),height:26});
    mc(ws,r,5,r,5,fmtNum(item.FinalRate),FR); r+=3;
  });
  writeFooter(ws,q,r,TC);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 4: PART-WISE CUSTOMER QUOTATION  (Poly sheet style)
// ═════════════════════════════════════════════════════════════════════════════
function generatePartWiseSheet(ws, q, template) {
  const TC=16;
  [4,22,12,12,6,5,6,10,14,12,10,11,9,12,11,8].forEach((w,i)=>ws.getColumn(i+1).width=w);
  let r=writeHeader(ws,q,TC);
  r++;
  mc(ws,r,1,r,TC,'Dear Sirs,',{font:font(false,9),height:16}); r++;
  mc(ws,r,1,r,TC,'We are pleased to submit our lowest possible quotation for the following items:',{font:font(false,9),height:16}); r+=2;
  const H={fill:fill(C.NAVY),font:font(true,9,'FFFFFFFF'),alignment:align('center','middle',true),border:bord('medium'),height:34};
  ['SR NO','PART DESCRIPTION','DOC NO','SAP NO.','SHEET','REV','THK\n(mm)','R/M SIZE','R/M TYPE','R/M COST\n(Rs)','CONV COST\n(Rs)','RATE/PC\n(Rs)','MARGIN\n(Rs)','PACKING &\nFWDNG (Rs)','RATE/PC\nFINAL (Rs)','QTY.'].forEach((h,i)=>mc(ws,r,i+1,r,i+1,h,H));
  r++;
  q.Items.forEach((item,idx)=>{
    const bg=idx%2?fill(C.ALT_ROW):fill(C.WHITE);
    const D={fill:bg,font:font(false,9),alignment:align('center'),border:bord(),height:18};
    const N={...D,alignment:align('right'),numFmt:'#,##0.00'};
    const rmSz=item.Width&&item.Length?`${item.Width}X${item.Length}`:'';
    [idx+1,item.PartName||'',item.drawing_no||'',item.PartNo||'',item.sheet_no||1,item.revision_no||0,
     fmtNum(item.Thickness),rmSz,item.rm_type||'',fmtNum(item.gross_rm_cost),fmtNum(item.conversion_cost||0),
     fmtNum(item.rate_per_pc||0),fmtNum(item.MarginAmount||0),fmtNum(item.pf_amount||0),fmtNum(item.FinalRate),item.Quantity||1
    ].forEach((v,ci)=>mc(ws,r,ci+1,r,ci+1,v,[9,10,11,12,13,14].includes(ci)?N:D));
    r++;
  });
  r+=2;
  [`1. GSTIN: ${q.CompanyGSTIN||''}`,`2. GST ${q.GSTPercentage||18}%`,'3. Delivery 15 days from PO','4. Payment 30 days PDC from invoice',`5. HSN: ${q.Items[0]?.HSNCode||''}`].forEach(tc=>{
    mc(ws,r,1,r,TC,tc,{font:font(false,9),alignment:align('left'),border:bord(),height:18}); r++;
  });
  r+=2;
  mc(ws,r,1,r,TC,'We trust that you will find the above satisfactory and release the Purchase Order.',{font:font(false,9),height:16}); r++;
  mc(ws,r,1,r,TC,'Regards,',{font:font(false,9),height:16}); r+=2;
  mc(ws,r,1,r,4,`For ${q.CompanyName||''}`,{font:font(true,10,'1F3864'),alignment:align('left')});
  writeFooter(ws,q,r+3,TC);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 5: NOMEX / SHEET CUT PARTS
// ═════════════════════════════════════════════════════════════════════════════
function generateNomexSheet(ws, q, template) {
  const TC=20;
  [4,12,30,6,6,8,8,7,11,10,11,9,11,13,11,9,11,10,10,11].forEach((w,i)=>ws.getColumn(i+1).width=w);
  let r=writeHeader(ws,q,TC);
  r++;
  const H={fill:fill(C.NAVY),font:font(true,8,'FFFFFFFF'),alignment:align('center','middle',true),border:bord(),height:60};
  ['Sr.\nNo.','SAP Code','Drawing No.','S\nNO','REV','Length\n(mm)','Width\n(mm)','Thk\n(mm)','Total\nWeight\n(kg)','Rate\nper kg\n(Rs)','Cost of\nRaw\nMaterial\n(Rs)','Wastage\n(Rs)','Total\n(Rs)','Fabrication\n/ Cutting\n(Rs)','Total\n(Rs)',`Profit\n${(q.Items[0]?.MarginPercent||15)}%\n(Rs)`,'Total\n(Rs)','Packing &\nFwdng\n(Rs)','Dev.\nCost\n(Rs)','FINAL\nRATE/PC\n(Rs)'].forEach((h,i)=>mc(ws,r,i+1,r,i+1,h,H));
  r++;
  q.Items.forEach((item,idx)=>{
    const bg=idx%2?fill(C.ALT_ROW):fill(C.WHITE);
    const D={fill:bg,font:font(false,8),alignment:align('center'),border:bord(),height:18};
    const N={...D,alignment:align('right'),numFmt:'#,##0.0000'};
    [idx+1,item.PartNo||'',item.drawing_no||'',item.sheet_no||'',item.revision_no||'',
     fmtNum(item.Length),fmtNum(item.Width),fmtNum(item.Thickness),
     fmtNum(item.total_weight_kg,7),fmtNum(item.rm_rate),
     fmtNum(item.gross_rm_cost,7),fmtNum(item.wastage_amount,7),fmtNum(item.total_rm_cost,7),
     fmtNum(item.fabrication_cost,7),fmtNum(item.SubTotal_1,7),
     fmtNum(item.profit_amount,7),fmtNum(item.SubTotal_2,7),
     fmtNum(item.pf_amount,7),fmtNum(item.dev_cost||0,7),fmtNum(item.FinalRate,7)
    ].forEach((v,ci)=>mc(ws,r,ci+1,r,ci+1,v,ci>=8?N:D));
    r++;
  });
  writeFooter(ws,q,r+1,TC);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 6: REVISED CONVERSION (assembly sets with sub-parts)
// ═════════════════════════════════════════════════════════════════════════════
function generateRevisedConversionSheet(ws, q, template) {
  const TC=10;
  [5,14,35,14,8,8,16,16,14,14].forEach((w,i)=>ws.getColumn(i+1).width=w);
  let r=writeHeader(ws,q,TC);
  r++;
  const H={fill:fill(C.NAVY),font:font(true,9,'FFFFFFFF'),alignment:align('center','middle',true),border:bord('medium'),height:28};
  const S={fill:fill(C.BLUE),font:font(true,9,'FFFFFFFF'),alignment:align('center'),border:bord(),height:20};
  mc(ws,r,1,r,TC,'QUOTATION INDEX — ASSEMBLY SETS',H); r++;
  ['SR NO','Material Code','Description','Rate\n(Rs/Set)','THK\n(mm)','Width\n(mm)','Gross Wt\n(kg/pc)','RM Cost\n(Rs)','Plating\n(Rs)','Total\nRate (Rs)'].forEach((h,i)=>mc(ws,r,i+1,r,i+1,h,S));
  r++;
  const INR='#,##0.00';
  q.Items.forEach((item,idx)=>{
    const bg=idx%2?fill(C.ALT_ROW):fill(C.WHITE);
    const D={fill:bg,font:font(false,9),alignment:align('center'),border:bord(),height:18};
    const N={...D,alignment:align('right'),numFmt:INR};
    const sp=(item.sub_parts||[item])[0]||item;
    mc(ws,r,1,r,1,idx+1,D); mc(ws,r,2,r,2,item.PartNo||'',D);
    mc(ws,r,3,r,3,item.PartName||item.Description||'',D);
    mc(ws,r,4,r,4,fmtNum(item.FinalRate),N);
    mc(ws,r,5,r,5,fmtNum(sp.Thickness),D);
    mc(ws,r,6,r,6,fmtNum(sp.Width),D);
    mc(ws,r,7,r,7,fmtNum(sp.gross_weight_kg||sp.grossWt||0,6),N);
    mc(ws,r,8,r,8,fmtNum(sp.rm_cost||sp.gross_rm_cost||0),N);
    mc(ws,r,9,r,9,fmtNum(sp.plating_cost||sp.platingCost||0),N);
    mc(ws,r,10,r,10,fmtNum(item.FinalRate),N);
    r++;
  });
  writeFooter(ws,q,r+1,TC);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 7: LASER FABRICATION — full sheet metal (CC0L0005002 style)
// ═════════════════════════════════════════════════════════════════════════════
function generateLaserFabSheet(ws, q, template) {
  const TC=8;
  [36,10,14,14,8,14,14,14].forEach((w,i)=>ws.getColumn(i+1).width=w);
  let r=writeHeader(ws,q,TC);

  const SC={fill:fill(C.NAVY),font:font(true,10,'FFFFFFFF'),alignment:align('left'),border:bord('medium'),height:24};
  const HD={fill:fill(C.BLUE),font:font(true,9,'FFFFFFFF'),alignment:align('center'),border:bord(),height:20};
  const LB={fill:fill(C.GREY),font:font(true,9,'1F3864'),alignment:align('left'),border:bord(),height:18};
  const VL={fill:fill(C.WHITE),font:font(false,9),alignment:align('right'),border:bord(),numFmt:'#,##0.0000',height:18};
  const TOT={fill:fill(C.YELLOW),font:font(true,10),alignment:align('right'),border:bord('medium'),numFmt:'#,##0.00',height:22};
  const FIN={fill:fill(C.ORANGE),font:font(true,12,'FFFFFFFF'),alignment:align('right'),border:bord('medium'),numFmt:'#,##0.00',height:28};

  const row=(l,v,f)=>{ mc(ws,r,1,r,4,l,LB); mc(ws,r,5,r,TC,fmtNum(v,4),{...VL,numFmt:f||'#,##0.0000'}); r++; };

  q.Items.forEach((item,idx)=>{
    r++;
    mc(ws,r,1,r,TC,`PART ${idx+1}: ${item.PartNo||''} — ${item.PartName||''}`,SC); r++;
    mc(ws,r,1,r,TC,'DRAWING SPECIFICATION',HD); r++;
    [['Drawing No. / Part',`${item.drawing_no||''} / ${item.PartNo||''}`,],
     ['Raw Material Grade',item.rm_grade||'MS PART'],
     ['Length (mm)',item.Length||0],['Width (mm)',item.Width||0],
     ['Thickness (mm)',item.Thickness||0],['Quantity',item.Quantity||1]
    ].forEach(([l,v])=>{ mc(ws,r,1,r,4,l,LB); mc(ws,r,5,r,TC,v,{...VL,numFmt:typeof v==='number'?'#,##0.00##':'@'}); r++; });

    r++; mc(ws,r,1,r,TC,'RAW MATERIAL CALCULATION',HD); r++;
    row('Net Weight (kg)',item.net_weight_kg||0,'#,##0.000000');
    row('Wastage 10% (kg)',item.wastage_kg||0,'#,##0.000000');
    row('Total Weight incl. Wastage (kg)',item.total_weight_kg||0,'#,##0.000000');
    row('RM Rate (Rs/kg)',item.rm_rate||0,'#,##0.00');
    row('RM Cost (Rs)',item.rm_cost||0);
    row('Scrap Rate (Rs/kg)',item.scrap_rate_per_kg||0,'#,##0.00');
    row('Scrap Credit (Rs)',item.scrap_credit||0);
    row('Net Material Cost (Rs)',item.net_material_cost||0);

    r++; mc(ws,r,1,r,TC,'LASER M/C CALCULATION',HD); r++;
    row('Path Length in Sq. mm',item.path_length_sq_mm||0,'#,##0.00');
    row('Laser Rate / Sq. mm (Rs)',item.laser_rate_per_sq_mm||0,'#,##0.0000');
    row('Starting Points (Nos)',item.start_points||0,'0');
    row('Starting Point Rate (Rs)',item.start_point_rate||0,'#,##0.00');
    row('Laser Cost (Rs)',item.laser_cost||0);
    row('Flatning Cost (Rs)',item.flatning_cost||0);

    r++; mc(ws,r,1,r,TC,'SPECIAL OPERATIONS',HD); r++;
    row('Drilling (Rs)',item.drilling_cost||0);
    row('Tapping (Rs)',item.tapping_cost||0);
    row('CSK / Chamfer (Rs)',item.csk_cost||0);
    row('Machining / Grinding / Hardware (Rs)',item.mach_grind_cost||0);

    r++; mc(ws,r,1,r,TC,'BENDING OPERATION',HD); r++;
    row('Bending Cost (Rs)',item.bending_cost||0);

    r++; mc(ws,r,1,r,TC,'FABRICATION & POWDER COATING',HD); r++;
    row('Fabrication / Finishing (Rs)',item.fabrication_cost||0);
    mc(ws,r,1,r,4,'TOTAL PROCESS COST (Rs)',TOT);
    mc(ws,r,5,r,TC,fmtNum(item.ProcessCost),TOT); r++;
    mc(ws,r,1,r,4,'TOTAL (MATERIAL + PROCESS)',TOT);
    mc(ws,r,5,r,TC,fmtNum(item.total_process_plus_mat||item.SubTotal||0),TOT); r++;

    r++; mc(ws,r,1,r,TC,'OVERHEADS & PROFIT',HD); r++;
    row('Inspection Cost (2%)',item.inspection_cost||0);
    row('Rejection Cost (2%)',item.rejection_cost||0);
    row('Design / Jig & Fixture (2%)',item.design_jig_cost||0);
    row('Packaging (2%)',item.packaging_cost||0);
    row('Overhead & Profit (15%)',item.overhead_profit_cost||0);
    row('Transportation Cost (2%)',item.transportation_cost||0);
    mc(ws,r,1,r,4,'TOTAL OVERHEADS (Rs)',TOT);
    mc(ws,r,5,r,TC,fmtNum(item.total_overheads||0),TOT); r++;

    r++;
    mc(ws,r,1,r,4,'FINAL COST PER PIECE (Rs)',FIN);
    mc(ws,r,5,r,TC,fmtNum(item.FinalRate),FIN); r+=3;
  });
  writeFooter(ws,q,r,TC);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────
const GENERATORS = {
  busbar:              generateBusbarSheet,
  landed_cost:         generateLandedCostSheet,
  cost_breakup:        generateCostBreakupSheet,
  part_wise:           generatePartWiseSheet,
  nomex_sheet:         generateNomexSheet,
  revised_conversion:  generateRevisedConversionSheet,
  laser_fabrication:   generateLaserFabSheet,
};

function generateQuotationExcel(workbook, quotationData, template) {
  const engine    = template?.formula_engine || 'busbar';
  const generator = GENERATORS[engine] || generateBusbarSheet;
  const sheetName = `${template?.template_code||engine}_${quotationData.QuotationNo||'QT'}`.slice(0,31);

  const ws = workbook.addWorksheet(sheetName, {
    pageSetup: { paperSize:9, orientation:'landscape', fitToWidth:1, fitToPage:true },
    headerFooter: {
      oddHeader: `&C&B${quotationData.CompanyName||''}`,
      oddFooter:  `&LQuotation: ${quotationData.QuotationNo||''}  |  ${quotationData.CustomerName||''}&R&P of &N`,
    },
  });

  generator(ws, quotationData, template);

  try {
    ws.autoFilter = { from:{ row:8, column:1 }, to:{ row:8, column:ws.columnCount } };
  } catch(_){}

  return ws;
}

module.exports = { generateQuotationExcel, GENERATORS };