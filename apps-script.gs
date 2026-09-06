// ============================================================
//  Workouts App — Google Apps Script
//  Spreadsheet: 1yobeXBER4p6svnbzTCXadrq3iZV1BmrSqhjCA9DZqw4
//  Sheets: Log (data from row 6) | Templates (data from row 6)
// ============================================================

const SS_ID      = '1yobeXBER4p6svnbzTCXadrq3iZV1BmrSqhjCA9DZqw4';
const LOG_SHEET  = 'Log';
const TMPL_SHEET = 'Templates';
const DATA_START = 6;  // first data row (headers on row 5)
const COL_OFFSET = 2;  // columns start at B (col 2)

// ── Column indices (1-based) ──────────────────────────────
// LOG
const L_DATE     = 2;  // B
const L_SESSION  = 3;  // C
const L_EXERCISE = 4;  // D
const L_SETS     = 5;  // E
const L_REPMIN   = 6;  // F
const L_REPMAX   = 7;  // G
const L_REST     = 8;  // H
const L_WEIGHT   = 9;  // I
const L_SET1     = 10; // J
const L_SET2     = 11; // K
const L_SET3     = 12; // L
const L_DURATION = 13; // M

// TEMPLATES
const T_SESSION  = 2;  // B
const T_UNIT     = 3;  // C
const T_TYPE     = 4;  // D
const T_ORDER    = 5;  // E
const T_EXERCISE = 6;  // F
const T_SETS     = 7;  // G
const T_REPMIN   = 8;  // H
const T_REPMAX   = 9;  // I
const T_REST     = 10; // J
const T_INSTRUC  = 11; // K

// ── JSON output (Apps Script does not support addHeader) ──
// CORS is handled by the Vercel proxy — no headers needed here.
function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── doGet — handles all read actions ─────────────────────
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'getAll';
    if (action === 'getAll')       return jsonOut(getAll());
    if (action === 'getTemplates') return jsonOut(getTemplates());
    if (action === 'getLog')       return jsonOut(getLog());
    return jsonOut({ error: 'Unknown action: ' + action });
  } catch(err) {
    return jsonOut({ error: err.message, stack: err.stack });
  }
}

// ── doPost — handles all write actions ───────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action  = payload.action;
    if (action === 'saveWorkout')  return jsonOut(saveWorkout(payload));
    if (action === 'saveTemplate') return jsonOut(saveTemplate(payload));
    return jsonOut({ error: 'Unknown action: ' + action });
  } catch(err) {
    return jsonOut({ error: err.message, stack: err.stack });
  }
}

// ══════════════════════════════════════════════════════════
//  READ FUNCTIONS
// ══════════════════════════════════════════════════════════

function getAll() {
  return {
    log:       getLog().rows,
    templates: getTemplates().templates
  };
}

// Format any date value safely as YYYY-MM-DD
function formatDateSafe(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'UTC', 'yyyy-MM-dd');
  }
  const s = String(val);
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Try parsing
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
    }
  } catch(e) {}
  return s;
}

// Format a Sheets time value (Date object or string) as HH:MM
function formatRest(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const h = val.getHours(), m = val.getMinutes();
    return h + ':' + (m < 10 ? '0' + m : m);
  }
  const s = String(val);
  // Already HH:MM or MM:SS
  if (/^\d{1,2}:\d{2}$/.test(s)) return s;
  // Full date string — extract time
  const match = s.match(/(\d{1,2}:\d{2}):\d{2}/);
  return match ? match[1] : s;
}

// Returns all log rows as array of objects
function getLog() {
  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName(LOG_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START) return { rows: [] };

  const numRows = lastRow - DATA_START + 1;
  const numCols = L_DURATION - COL_OFFSET + 1; // cols B–M = 12 cols
  const data = sheet.getRange(DATA_START, COL_OFFSET, numRows, numCols).getValues();

  const rows = [];
  for (const row of data) {
    const date = row[L_DATE - COL_OFFSET];
    if (!date) continue;

    const dateStr = formatDateSafe(date);

    rows.push({
      date:     dateStr,
      session:  String(row[L_SESSION  - COL_OFFSET] || ''),
      exercise: String(row[L_EXERCISE - COL_OFFSET] || ''),
      sets:     row[L_SETS     - COL_OFFSET] || '',
      repMin:   row[L_REPMIN   - COL_OFFSET] || '',
      repMax:   row[L_REPMAX   - COL_OFFSET] || '',
      rest:     formatRest(row[L_REST - COL_OFFSET]),
      weight:   row[L_WEIGHT   - COL_OFFSET] || '',
      set1:     row[L_SET1     - COL_OFFSET] || '',
      set2:     row[L_SET2     - COL_OFFSET] || '',
      set3:     row[L_SET3     - COL_OFFSET] || '',
      duration: row[L_DURATION - COL_OFFSET] || '',
    });
  }
  return { rows };
}

// Returns all templates grouped by session name
function getTemplates() {
  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName(TMPL_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START) return { templates: [] };

  const numRows = lastRow - DATA_START + 1;
  const numCols = T_INSTRUC - COL_OFFSET + 1; // cols B–K = 10 cols
  const data = sheet.getRange(DATA_START, COL_OFFSET, numRows, numCols).getValues();

  const sessionMap = {};
  for (const row of data) {
    const session = String(row[T_SESSION - COL_OFFSET] || '').trim();
    if (!session) continue;

    if (!sessionMap[session]) {
      sessionMap[session] = {
        session:   session,
        unit:      String(row[T_UNIT - COL_OFFSET] || 'kg').trim().toLowerCase(),
        type:      String(row[T_TYPE - COL_OFFSET] || 'weight').trim().toLowerCase(),
        exercises: []
      };
    }

    sessionMap[session].exercises.push({
      order:        Number(row[T_ORDER    - COL_OFFSET]) || 0,
      exercise:     String(row[T_EXERCISE - COL_OFFSET] || ''),
      sets:         Number(row[T_SETS     - COL_OFFSET]) || 3,
      repMin:       row[T_REPMIN   - COL_OFFSET] || '',
      repMax:       row[T_REPMAX   - COL_OFFSET] || '',
      rest:         formatRest(row[T_REST - COL_OFFSET]),
      instructions: String(row[T_INSTRUC  - COL_OFFSET] || ''),
      unit:         String(row[T_UNIT     - COL_OFFSET] || 'kg').trim().toLowerCase(),
    });
  }

  const templates = Object.values(sessionMap).map(s => {
    s.exercises.sort((a, b) => a.order - b.order);
    return s;
  });

  return { templates };
}

// ══════════════════════════════════════════════════════════
//  WRITE FUNCTIONS
// ══════════════════════════════════════════════════════════

// saveWorkout — appends one row per exercise to Log
function saveWorkout(payload) {
  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName(LOG_SHEET);
  const exercises = payload.exercises || [];
  const date = payload.date || Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'
  );

  const rowsToAppend = exercises.map((ex, i) => {
    const row = new Array(12).fill('');
    row[L_DATE     - COL_OFFSET] = date;
    row[L_SESSION  - COL_OFFSET] = payload.session || '';
    row[L_EXERCISE - COL_OFFSET] = ex.exercise     || '';
    row[L_SETS     - COL_OFFSET] = ex.sets         || '';
    row[L_REPMIN   - COL_OFFSET] = ex.repMin       || '';
    row[L_REPMAX   - COL_OFFSET] = ex.repMax       || '';
    row[L_REST     - COL_OFFSET] = ex.rest         || '';
    row[L_WEIGHT   - COL_OFFSET] = ex.weight       || '';
    row[L_SET1     - COL_OFFSET] = ex.set1         || '';
    row[L_SET2     - COL_OFFSET] = ex.set2         || '';
    row[L_SET3     - COL_OFFSET] = ex.set3         || '';
    row[L_DURATION - COL_OFFSET] = i === 0 ? (payload.duration || '') : '';
    return row;
  });

  if (rowsToAppend.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, COL_OFFSET, rowsToAppend.length, 12).setValues(rowsToAppend);
  }

  return { success: true, rowsWritten: rowsToAppend.length };
}

// saveTemplate — appends a new custom session to Templates
function saveTemplate(payload) {
  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName(TMPL_SHEET);
  const exercises = payload.exercises || [];
  const session   = payload.session || 'Custom';
  const type      = payload.type    || 'weight';

  const rowsToAppend = exercises.map((ex, i) => {
    const row = new Array(10).fill('');
    row[T_SESSION  - COL_OFFSET] = session;
    row[T_UNIT     - COL_OFFSET] = ex.unit         || 'kg';
    row[T_TYPE     - COL_OFFSET] = type;
    row[T_ORDER    - COL_OFFSET] = ex.order        || (i + 1);
    row[T_EXERCISE - COL_OFFSET] = ex.exercise     || '';
    row[T_SETS     - COL_OFFSET] = ex.sets         || 3;
    row[T_REPMIN   - COL_OFFSET] = ex.repMin       || '';
    row[T_REPMAX   - COL_OFFSET] = ex.repMax       || '';
    row[T_REST     - COL_OFFSET] = ex.rest         || '';
    row[T_INSTRUC  - COL_OFFSET] = ex.instructions || '';
    return row;
  });

  if (rowsToAppend.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, COL_OFFSET, rowsToAppend.length, 10).setValues(rowsToAppend);
  }

  return { success: true, rowsWritten: rowsToAppend.length };
}

// ── Test — run this in the Apps Script editor to verify ──
function testGetAll() {
  const result = getAll();
  Logger.log('Templates: ' + result.templates.length + ' sessions');
  Logger.log('Log rows: ' + result.log.length);
  if (result.templates.length > 0) {
    Logger.log('First template: ' + JSON.stringify(result.templates[0], null, 2));
  }
  if (result.log.length > 0) {
    Logger.log('First log row: ' + JSON.stringify(result.log[0], null, 2));
  }
}
