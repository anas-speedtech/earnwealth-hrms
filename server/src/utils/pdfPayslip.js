/**
 * PDF Payslip Generator
 *
 * Generates a payslip matching the organisation's salary-slip template:
 * logo + period header, an employee-info grid, Earnings/Deductions tables
 * side by side, totals, a NETPAY line and the PF/ESIC computation notes.
 *
 * Does NOT recalculate money — it renders the approved payroll snapshot plus
 * the reference-only employer contributions and the configured rule notes.
 */

const PDFDocument = require('pdfkit');

const COMPANY_NAME = 'EarnWealth';
const COMPANY_TAGLINE = 'Kamate Raho';
const CURRENCY_SYMBOL = '₹';

const GREEN = '#2e7d32';
const GREEN_BG = '#d4edda';
const RED = '#b71c1c';
const RED_BG = '#fde4e0';
const HEADER_YELLOW = '#fff176';
const GRAY = '#555555';

function formatCurrency(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return `${CURRENCY_SYMBOL} 0`;
  return num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * @param {Object} data — see module usage in payroll.service.getPayslipPDF
 */
function generatePayslipPDF({
  employeeCode,
  employeeName,
  department,
  designation,
  month,
  year,
  earnings = [],
  deductions = [],
  employerContributions = [],
  workedDays,
  lopDays,
  dateOfJoining,
  notes,
  grossEarnings,
  totalDeductions,
  netPay,
  payslipGeneratedAt,
}) {
  const doc = new PDFDocument({ size: 'A4' });

  const margin = 36;
  const pageWidth = doc.page.width;
  const innerW = pageWidth - margin * 2;
  let y = margin;

  // ---- Header: logo box + period band ----
  const logoW = 90;
  const logoH = 40;
  doc.save();
  doc.rect(margin, y, logoW, logoH).lineWidth(0.5).strokeColor('#c00000').stroke();
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#c00000');
  doc.text(COMPANY_NAME, margin + 6, y + 12, { width: logoW - 12, align: 'center' });
  doc.font('Helvetica-Oblique').fontSize(8).fillColor('#8a0000');
  doc.text(COMPANY_TAGLINE, margin + 6, y + 27, { width: logoW - 12, align: 'center' });
  doc.restore();

  const periodX = margin + logoW + 12;
  doc.fillColor(HEADER_YELLOW).rect(periodX, y + 8, innerW - logoW - 12, 24).fill();
  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(13);
  doc.text(`Month - ${MONTHS_SHORT[month - 1] || month} ${year}`, periodX, y + 15, {
    width: innerW - logoW - 12,
    align: 'center',
  });

  y += logoH + 14;

  // ---- Employee info grid (two columns) ----
  const colX = margin + innerW * 0.52;
  const rowH = 15;
  const labelW = 96;

  const infoLeft = [
    ['Employee Name', employeeName || '—'],
    ['Employee ID', employeeCode || '—'],
    ['Designation', designation || '—'],
    ['Department', department || '—'],
    ['Worked / Paid Days', workedDays != null ? String(workedDays) : '—'],
    ['Net Payable', `${formatCurrency(netPay)} ${CURRENCY_SYMBOL}`],
  ];
  const infoRight = [
    ['Date Of Joining', fmtDate(dateOfJoining)],
    ['LOP Days', lopDays != null ? String(lopDays) : '—'],
    ['UAN / ESIC No.', '—'],
    ['Back / A/C Number', '—'],
    ['PAN Number', '—'],
    ['PF No.', '—'],
  ];

  const infoY = y;

  // Draw both columns of the info grid at their computed rows:
  infoLeft.forEach((pair, i) => {
    const rowY = infoY + i * rowH;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111111');
    doc.text(`${pair[0]} :`, margin, rowY, { width: labelW, continued: false });
    doc.font('Helvetica').fontSize(8.5).fillColor('#111111');
    doc.text(pair[1], margin + labelW, rowY, { width: colX - (margin + labelW) - 4 });
  });
  infoRight.forEach((pair, i) => {
    const rowY = infoY + i * rowH;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111111');
    doc.text(`${pair[0]} :`, colX, rowY, { width: labelW, continued: false });
    doc.font('Helvetica').fontSize(8.5).fillColor('#111111');
    doc.text(pair[1], colX + labelW, rowY, { width: Math.max(40, pageWidth - margin - (colX + labelW) - 4) });
  });
  y = infoY + infoLeft.length * rowH + 10;

  doc.moveTo(margin, y).lineTo(pageWidth - margin, y).strokeColor('#bbbbbb').lineWidth(0.5).stroke();
  y += 10;

  // ---- Earnings / Deductions side by side ----
  const halfGap = 12;
  const halfW = (innerW - halfGap) / 2;
  const eLabelW = halfW * 0.62;
  const eAmountW = halfW - eLabelW;

  const drawTable = (title, rows, tx, total, totalBg, totalText) => {
    doc.fillColor(RED_BG).rect(tx, y, halfW, 16).fill();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(RED);
    doc.text(title, tx + 6, y + 5, { width: eLabelW });
    doc.text('Amount', tx + eLabelW + 4, y + 5, { width: eAmountW - 8, align: 'right' });
    let ty = y + 16;

    rows.forEach((row, i) => {
      const rowY = ty + i * 15;
      if (i % 2 === 1) doc.fillColor('#f7f7f7').rect(tx, rowY, halfW, 15).fill();
      doc.font('Helvetica').fontSize(8.5).fillColor('#111111');
      doc.text(String(row.name || ''), tx + 6, rowY + 4, { width: eLabelW - 10 });
      doc.text(formatCurrency(row.amount), tx + eLabelW + 4, rowY + 4, { width: eAmountW - 8, align: 'right' });
    });
    ty += Math.max(rows.length, 1) * 15;

    doc.fillColor(totalBg).rect(tx, ty, halfW, 16).fill();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(totalText);
    doc.text(title === 'Earnings' ? 'Total Earnings' : 'Total Deductions', tx + 6, ty + 4, { width: eLabelW });
    doc.text(formatCurrency(total), tx + eLabelW + 4, ty + 4, { width: eAmountW - 8, align: 'right' });
    return ty + 16;
  };

  const eRows = earnings.map((e) => ({ name: e.name, amount: num(e.amount) }));
  const dRows = deductions.map((d) => ({ name: d.name, amount: num(d.amount) }));

  const earningsBottom = drawTable('Earnings', eRows, margin, grossEarnings, GREEN_BG, GREEN);
  const deductionsBottom = drawTable('Deductions', dRows, margin + halfW + halfGap, totalDeductions, RED_BG, RED);
  y = Math.max(earningsBottom, deductionsBottom) + 10;

  // ---- Employer contributions (reference only) ----
  if (employerContributions.length) {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GRAY);
    doc.text('Employer contributions (reference only, not deducted from net pay):', margin, y, { width: innerW });
    y += 11;
    doc.font('Helvetica').fontSize(8).fillColor(GRAY);
    employerContributions.forEach((c) => {
      doc.text(`${c.name} :  ${formatCurrency(num(c.amount))} ${CURRENCY_SYMBOL}`, margin, y, { width: innerW });
      y += 11;
    });
    y += 4;
  }

  // ---- NETPAY band ----
  doc.fillColor(GREEN_BG).rect(margin, y, innerW, 24).fill();
  doc.font('Helvetica-Bold').fontSize(12).fillColor(GREEN);
  doc.text('NETPAY', margin + 8, y + 7, { width: 100 });
  doc.text(`${CURRENCY_SYMBOL} ${formatCurrency(netPay)}`, pageWidth - margin - 8, y + 7, { width: 160, align: 'right' });
  y += 36;

  // ---- Notes (PF / ESIC computation rules) ----
  if (notes && String(notes).trim()) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111');
    doc.text('Note -', margin, y, { width: innerW });
    y += 12;
    doc.font('Helvetica').fontSize(8).fillColor('#333333');
    String(notes)
      .split('\n')
      .filter((ln) => ln.trim())
      .forEach((ln) => {
        doc.text(ln.trim(), margin, y, { width: innerW });
        y += 11;
      });
    y += 4;
  }

  // ---- Footer ----
  y += 6;
  doc.font('Helvetica').fontSize(7).fillColor('#888888');
  doc.text(
    `Generated ${payslipGeneratedAt ? fmtDate(payslipGeneratedAt) : ''} · ${MONTHS_FULL[month - 1] || ''} ${year} · ${COMPANY_NAME} — Confidential, for employee use only.`,
    margin,
    y,
    { width: innerW }
  );

  return new Promise((resolve) => {
    doc.end();
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function getPayslipFilename(employeeCode, month, year) {
  const safeCode = String(employeeCode || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `Payslip-${safeCode}-${String(month).padStart(2, '0')}-${year}.pdf`;
}

module.exports = { generatePayslipPDF, getPayslipFilename };
