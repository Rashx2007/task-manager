// lib/excel-styles.js
// استایل‌های مشترک Excel مطابق نسخه دسکتاپ (EPPlus → ExcelJS)

export const FONT_HEADER = { name: 'Vazirmatn', size: 12, bold: true, color: { argb: 'FF000000' } };
export const FONT_BODY = { name: 'Vazirmatn', size: 11, bold: true };
export const FONT_BODY_NORMAL = { name: 'Vazirmatn', size: 11, bold: false };

export const FILL_PINK_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF880E4' } };
export const FILL_GREEN_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF80F8E4' } };
export const FILL_ORANGE_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4B084' } };
export const FILL_GREEN_DONE_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF69FF69' } };
export const FILL_GREEN_DONE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3BFF3B' } };
export const FILL_YELLOW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
export const FILL_DARK_SALMON = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9967A' } };
export const FILL_DARK_SEA_GREEN = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8FBC8F' } };
export const FILL_LIGHT_PINK = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFB6C1' } };
export const FILL_HONEYDEW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FFF0' } };
export const FILL_LIGHT_YELLOW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFE0' } };
export const FILL_LIGHT_SALMON = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFA07A' } };
export const FILL_LIGHT_GREEN = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } };
export const FILL_ORANGE_LIGHT = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
export const FILL_GREEN_LIGHT = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC4FFB8' } };

export const BORDER_THICK_AROUND = {
  top: { style: 'thick' }, bottom: { style: 'thick' },
  left: { style: 'thick' }, right: { style: 'thick' },
};

export const BORDER_MEDIUM = {
  top: { style: 'medium' }, bottom: { style: 'medium' },
  left: { style: 'medium' }, right: { style: 'medium' },
};

// اعمال استایل کلی شیت: RTL، ارتفاع سطر، فونت و border سراسری
export function applySheetBase(sheet, options = {}) {
  sheet.views = [{ rightToLeft: true, state: 'frozen', ...options.view }];
  sheet.properties.defaultRowHeight = options.rowHeight || 35;
  sheet.columns.forEach(col => {
    col.alignment = {
      horizontal: 'center', vertical: 'middle',
      readingOrder: 'rightToLeft', wrapText: true,
    };
  });
}

// اعمال هدر (ردیف ۱): فونت، رنگ، border
export function styleHeaderRow(sheet, fill, colCount) {
  const row = sheet.getRow(1);
  row.height = 30;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = FONT_HEADER;
    cell.fill = fill;
    cell.alignment = { horizontal: 'center', vertical: 'top', readingOrder: 'rightToLeft', wrapText: true };
    cell.border = BORDER_THICK_AROUND;
  }
}

// رنگ‌آمیزی ردیف‌های داده: ردیف‌های فرد رنگ روشن، زوج فونت ساده
export function styleDataRows(sheet, startRow, endRow, colCount, oddFill) {
  for (let r = startRow; r <= endRow; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.font = (r % 2 !== 0) ? FONT_BODY : FONT_BODY_NORMAL;
      if (r % 2 !== 0 && oddFill) cell.fill = oddFill;
      cell.alignment = { vertical: 'middle', readingOrder: 'rightToLeft', wrapText: true };
      cell.border = BORDER_MEDIUM;
    }
  }
}

// تنظیم عرض ستون‌ها بر اساس آرایه
export function setColumnWidths(sheet, widths) {
  widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });
}

// ایجاد یک شیت کامل از DataTable (rows) با headers و استایل‌ها
export function buildStyledSheet(wb, sheetName, headers, rows, options) {
  const sheet = wb.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });
  if (options.tabColor) sheet.properties.tabColor = { argb: options.tabColor };

  // headers
  headers.forEach((h, i) => { sheet.getCell(1, i + 1).value = h; });

  // data
  rows.forEach((r, ri) => {
    r.forEach((v, ci) => { sheet.getCell(ri + 2, ci + 1).value = v ?? ''; });
  });

  const colCount = headers.length;
  applySheetBase(sheet);
  styleHeaderRow(sheet, options.headerFill, colCount);
  styleDataRows(sheet, 2, rows.length + 1, colCount, options.oddFill);
  if (options.widths) setColumnWidths(sheet, options.widths);
  if (options.hiddenCols) options.hiddenCols.forEach(c => { sheet.getColumn(c).hidden = true; });
  if (options.freeze) sheet.views = [{ rightToLeft: true, state: 'frozen', xSplit: options.freeze.x, ySplit: options.freeze.y }];

  return sheet;
}