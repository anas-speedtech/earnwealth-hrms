/**
 * PDF Payslip Generator
 *
 * Generates a professional payslip PDF for an approved payroll record.
 * Does NOT write to disk — returns the PDF as a Buffer.
 *
 * Does not recalculate totals. Uses the approved payroll snapshot.
 */

const PDFDocument = require('pdfkit');

/**
 * Company display name used in payslip headers.
 * Not hardcoded in the PDF body — injected here as the single source of truth.
 */
const COMPANY_NAME = 'EWS HRMS';

/**
 * Currency symbol for display.
 */
const CURRENCY_SYMBOL = '₹';

/**
 * Format a decimal string as Indian currency.
 */
function formatCurrency(amount) {
  const num = Number(amount);
  if (Number.isNaN(num)) return `${CURRENCY_SYMBOL} 0.00`;
  return `${CURRENCY_SYMBOL} ${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Truncate text to fit within maxWidth at the given fontSize.
 * Falls back to an empty string if it still doesn't fit.
 */
function truncate(text, maxWidth, fontSize = 9) {
  if (!text) return '';
  const len = text.length;
  if (len <= maxWidth / (fontSize * 0.55)) return text;
  return text.slice(0, Math.max(0, Math.floor(maxWidth / (fontSize * 0.55)) - 1)) + '…';
}

/**
 * Generate a payslip PDF for an approved payroll.
 *
 * @param {Object} data
 * @param {string} data.employeeCode - Employee code
 * @param {string} data.employeeName - Full name of employee
 * @param {string} [data.department] - Department name
 * @param {string} [data.designation] - Designation title
 * @param {number} data.month - Payroll month (1-12)
 * @param {number} data.year - Payroll year
 * @param {string} data.grossEarnings - Stored gross earnings
 * @param {string} data.totalDeductions - Stored total deductions
 * @param {string} data.netPay - Stored net pay
 * @param {Array} data.earnings - { name, amount }
 * @param {Array} data.deductions - { name, amount }
 * @param {string} [data.payslipGeneratedAt] - ISO timestamp of payslip creation
 * @returns {Buffer} PDF buffer
 */
function generatePayslipPDF({
  employeeCode,
  employeeName,
  department,
  designation,
  month,
  year,
  grossEarnings,
  totalDeductions,
  netPay,
  earnings,
  deductions,
  payslipGeneratedAt,
}) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 48, bottom: 48, left: 48, right: 48 },
    info: {
      Title: `Payslip ${month.toString().padStart(2, '0')}/${year} - ${employeeCode}`,
      Author: COMPANY_NAME,
      Subject: 'Payslip',
      Creator: `${COMPANY_NAME} Payroll System`,
    },
  });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // ---- Company Header ----
  doc.fontSize(18).font('Helvetica-Bold').text(COMPANY_NAME, { align: 'center' });
  y += 28;
  doc.fontSize(10).font('Helvetica').text('Payslip', { align: 'center' });
  y += 16;

  // Horizontal line
  const lineY = y;
  doc.moveTo(0, lineY).lineTo(pageWidth, lineY).strokeColor('#CCCCCC').lineWidth(0.5).stroke();
  y += 14;

  // ---- Employee Info Section ----
  const infoRowHeight = 14;
  const labelFontSize = 8;
  const valueFontSize = 9;

  // Column headers
  const labelStyle = { font: 'Helvetica', fontSize: labelFontSize, color: '#666666' };
  const valueStyle = { font: 'Helvetica-Bold', fontSize: valueFontSize, color: '#111111' };

  const leftLabels = [
    { label: 'Employee Code', value: employeeCode || '—' },
    { label: 'Employee Name', value: employeeName || '—' },
  ];
  const rightLabels = [
    { label: 'Department', value: department || '—' },
    { label: 'Designation', value: designation || '—' },
  ];

  leftLabels.forEach((item, i) => {
    const rowY = y + i * infoRowHeight;
    doc.font(labelStyle).text(item.label, leftCol, rowY, { width: 80 });
    doc.font(valueStyle).text(truncate(item.value, pageWidth / 2 - 90, valueFontSize), leftCol + 85, rowY, { width: pageWidth / 2 - 90 });
  });

  rightLabels.forEach((item, i) => {
    const rowY = y + i * infoRowHeight;
    doc.font(labelStyle).text(item.label, pageWidth / 2, rowY, { width: 80 });
    doc.font(valueStyle).text(truncate(item.value, pageWidth / 2 - 90, valueFontSize), pageWidth / 2 + 85, rowY, { width: pageWidth / 2 - 90 });
  });

  y += leftLabels.length * infoRowHeight + 10;

  // Period info
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[month - 1] || `Month ${month}`;
  doc.font(labelStyle).text('Pay Period', leftCol, y, { width: 80 });
  doc.font(valueStyle).text(`${monthName} ${year}`, leftCol + 85, y);
  y += 14;

  doc.font(labelStyle).text('Generated On', leftCol, y, { width: 80 });
  if (payslipGeneratedAt) {
    doc.font(valueStyle).text(new Date(payslipGeneratedAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    }), leftCol + 85, y);
  } else {
    doc.font(valueStyle).text('—', leftCol + 85, y);
  }
  y += 18;

  // Horizontal line
  doc.moveTo(0, y).lineTo(pageWidth, y).strokeColor('#CCCCCC').lineWidth(0.5).stroke();
  y += 14;

  // ---- Earnings Table ----
  doc.font('Helvetica-Bold').fontSize(10).text('Earnings', { color: '#166534' });
  y += 4;

  // Table header
  const tableTop = y;
  const col1Width = pageWidth * 0.55;
  const col2Width = pageWidth * 0.45;

  doc.fillColor('#F1F5F9').rect(0, tableTop, pageWidth, 18).fill();
  doc.fillColor('#374151').font('Helvetica-Bold').fontSize(8);
  doc.text('Description', 4, tableTop + 5, { width: col1Width - 4 });
  doc.text('Amount (INR)', col1Width, tableTop + 5, { width: col2Width, align: 'right' });

  y = tableTop + 18;
  doc.fillColor('#000000').font('Helvetica').fontSize(9);

  if (earnings.length === 0) {
    doc.fillColor('#999999').text('No earnings components', 4, y);
    y += 16;
  } else {
    earnings.forEach((item, i) => {
      const rowY = y + i * 16;
      // Alternating very subtle row shading
      if (i % 2 === 1) {
        doc.fillColor('#FAFAFA').rect(0, rowY, pageWidth, 16).fill();
        doc.fillColor('#000000');
      }
      doc.fillColor('#000000').font('Helvetica').fontSize(9);
      doc.text(truncate(item.name, col1Width - 8), 4, rowY + 4, { width: col1Width - 8 });
      doc.text(formatCurrency(item.amount), col1Width, rowY + 4, { width: col2Width, align: 'right' });
    });
    y += earnings.length * 16;
  }

  // Total earnings
  const totalsRowY = y + 2;
  doc.fillColor('#F1F5F9').rect(0, totalsRowY, pageWidth, 18).fill();
  doc.fillColor('#166534').font('Helvetica-Bold').fontSize(9);
  doc.text('Total Earnings', col1Width - 4, totalsRowY + 4, { width: col1Width - 4, align: 'right' });
  doc.text(formatCurrency(grossEarnings), col1Width, totalsRowY + 4, { width: col2Width, align: 'right' });
  y = totalsRowY + 24;

  // ---- Deductions Table ----
  y += 8;
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(10).text('Deductions', { color: '#991B1B' });
  y += 4;

  const dedTableTop = y;
  doc.fillColor('#FEE2E2').rect(0, dedTableTop, pageWidth, 18).fill();
  doc.fillColor('#374151').font('Helvetica-Bold').fontSize(8);
  doc.text('Description', 4, dedTableTop + 5, { width: col1Width - 4 });
  doc.text('Amount (INR)', col1Width, dedTableTop + 5, { width: col2Width, align: 'right' });

  y = dedTableTop + 18;
  doc.fillColor('#000000').font('Helvetica').fontSize(9);

  if (deductions.length === 0) {
    doc.fillColor('#999999').text('No deduction components', 4, y);
    y += 16;
  } else {
    deductions.forEach((item, i) => {
      const rowY = y + i * 16;
      if (i % 2 === 1) {
        doc.fillColor('#FAFAFA').rect(0, rowY, pageWidth, 16).fill();
        doc.fillColor('#000000');
      }
      doc.fillColor('#000000').font('Helvetica').fontSize(9);
      doc.text(truncate(item.name, col1Width - 8), 4, rowY + 4, { width: col1Width - 8 });
      doc.text(formatCurrency(item.amount), col1Width, rowY + 4, { width: col2Width, align: 'right' });
    });
    y += deductions.length * 16;
  }

  // Total deductions
  const dedTotalY = y + 2;
  doc.fillColor('#FEE2E2').rect(0, dedTotalY, pageWidth, 18).fill();
  doc.fillColor('#991B1B').font('Helvetica-Bold').fontSize(9);
  doc.text('Total Deductions', col1Width - 4, dedTotalY + 4, { width: col1Width - 4, align: 'right' });
  doc.text(formatCurrency(totalDeductions), col1Width, dedTotalY + 4, { width: col2Width, align: 'right' });
  y = dedTotalY + 24;

  // ---- Net Pay ----
  y += 6;
  doc.fillColor('#166534').rect(0, y, pageWidth, 30).fill();
  y += 6;
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12);
  doc.text('Net Pay', leftCol, y, { width: col1Width - 4, align: 'right' });
  doc.text(formatCurrency(netPay), col1Width, y, { width: col2Width, align: 'right' });
  y += 36;

  // ---- Footer ----
  const footerY = doc.page.height - doc.page.margins.bottom - 20;
  doc.moveTo(0, footerY - 6).lineTo(pageWidth, footerY - 6).strokeColor('#CCCCCC').lineWidth(0.5).stroke();
  doc.fillColor('#999999').font('Helvetica').fontSize(7);
  doc.text(
    `${COMPANY_NAME} — Confidential. For employee use only.`,
    0, footerY, { align: 'center', width: pageWidth }
  );

  return new Promise((resolve) => {
    doc.end();
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Build a safe attachment filename for the payslip PDF.
 * Format: Payslip-{EmployeeCode}-{MM}-{YYYY}.pdf
 */
function getPayslipFilename(employeeCode, month, year) {
  const safeCode = String(employeeCode || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `Payslip-${safeCode}-${month.toString().padStart(2, '0')}-${year}.pdf`;
}

module.exports = {
  generatePayslipPDF,
  getPayslipFilename,
};
