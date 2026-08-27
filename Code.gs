/**
 * AstroLokal VIP Pass — Sheets collector.
 *
 * Deploy: Extensions ▸ Apps Script ▸ paste this ▸ Deploy ▸ New deployment
 *   Type:           Web app
 *   Execute as:     Me
 *   Who has access: Anyone            <-- required; "Anyone with Google account" will NOT work
 * Copy the /exec URL into WEBHOOK_URL in index.html.
 *
 * Re-deploy as a NEW VERSION after any edit here, or the old code keeps serving.
 */

var EVENTS_SHEET = 'Events';
var DONE_SHEET   = 'Completions';

// Intent-pass research instrument (branded / unbranded A-B test).
var INTENT_EVENTS_SHEET = 'IntentEvents';
var INTENT_DONE_SHEET   = 'IntentSessions';

// Astrology-interest qualifying survey (single unbranded page).
var SURVEY_EVENTS_SHEET = 'SurveyEvents';
var SURVEY_DONE_SHEET   = 'SurveySessions';

var EVENT_COLS = [
  'timestamp', 'user_id', 'id_encoding', 'is_anon', 'source', 'session_id', 'event_name', 'screen',
  'benefit_id', 'selection_order', 'benefit_count', 'benefits_selected_ordered',
  'duration_selected', 'total_price_final', 'seconds_since_last_action', 'raw_json'
];
var DONE_COLS = [
  'timestamp', 'user_id', 'id_encoding', 'is_anon', 'source', 'session_id',
  'benefits_selected_ordered', 'duration_selected', 'total_price_final'
];

var INTENT_EVENT_COLS = [
  'timestamp', 'page_variant', 'user_id', 'id_encoding', 'is_anon', 'source', 'session_id',
  'event_name', 'astrology_answer', 'option_id', 'display_position', 'selection_order', 'deselect_seq', 'at_ms',
  'selected_options_ordered', 'selection_count', 'raw_json'
];
// One row per session, completed or not -- a partial session is still data.
var INTENT_DONE_COLS = [
  'timestamp', 'page_variant', 'user_id', 'id_encoding', 'is_anon', 'source', 'session_id',
  'completed', 'abandoned_after_astrology',
  'astrology_answer', 'astrology_changed', 'astrology_answered_at_ms',
  'first_pick', 'selected_options', 'selected_positions', 'selection_count', 'options_order_shown',
  'deselections_flat', 'deselection_count',
  'time_to_first_pick_ms', 'time_to_submit_ms', 'referrer', 'user_agent'
];

function csv_(v) { return Array.isArray(v) ? v.join(',') : (v || ''); }
function num_(v) { return (v === null || v === undefined) ? '' : v; }

var SURVEY_EVENT_COLS = [
  'timestamp', 'user_id', 'id_encoding', 'is_anon', 'source', 'session_id',
  'event_name', 'question', 'answer', 'prior_experience_flat', 'interest_types_flat', 'at_ms', 'raw_json'
];
// One row per session, completed or not -- a partial session is still data.
// believes_in_astrology is the only required field; prior_experience and
// interest_types are both optional multi-selects (arrays), stored flat.
var SURVEY_DONE_COLS = [
  'timestamp', 'user_id', 'id_encoding', 'is_anon', 'source', 'session_id',
  'completed', 'furthest_question_reached',
  'believes_in_astrology', 'prior_experience_flat', 'interest_types_flat',
  'time_to_first_answer_ms', 'time_to_submit_ms', 'referrer', 'user_agent'
];

function sheet_(name, cols) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(cols);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Receives every tracked event from the page. */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);          // serialise appends; concurrent writes race otherwise
  } catch (err) {
    return json_({ ok: false, error: 'busy' });
  }

  try {
    var d = JSON.parse(e.postData.contents);
    var now = new Date();

    // The finally block below releases the lock on this path too.
    if (d.instrument === 'intent') return handleIntent_(d, now);
    if (d.instrument === 'astrology_survey') return handleSurvey_(d, now);

    sheet_(EVENTS_SHEET, EVENT_COLS).appendRow([
      now,
      d.user_id || '',
      d.id_encoding || '',
      d.is_anon === true,
      d.source || '',
      d.session_id || '',
      d.event_name || '',
      d.screen || '',
      d.benefit_id || '',
      d.selection_order || '',
      d.benefit_count === undefined ? '' : d.benefit_count,
      d.benefits_selected_ordered || '',
      d.duration_selected || '',
      d.total_price_final === undefined ? '' : d.total_price_final,
      d.seconds_since_last_action === undefined ? '' : d.seconds_since_last_action,
      JSON.stringify(d)            // keeps any field added later without a schema change
    ]);

    // A completion gets its own row, so the status check below stays cheap.
    // Anonymous users are skipped: their id is device-local, so it is not a
    // stable identity to dedupe on and would collide across devices.
    if (d.event_name === 'get_pass_clicked' && d.is_anon !== true) {
      if (hasCompleted_(d.user_id)) {
        return json_({ ok: true, duplicate: true });   // one row per user, ever
      }
      sheet_(DONE_SHEET, DONE_COLS).appendRow([
        now,
        d.user_id || '',
        d.id_encoding || '',
        d.is_anon === true,
        d.source || '',
        d.session_id || '',
        d.benefits_selected_ordered || '',
        d.duration_selected || '',
        d.total_price_final === undefined ? '' : d.total_price_final
      ]);
    }

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Intent-pass events + one summary row per session. */
function handleIntent_(d, now) {
  sheet_(INTENT_EVENTS_SHEET, INTENT_EVENT_COLS).appendRow([
    now,
    d.page_variant || '',
    d.user_id || '',
    d.id_encoding || '',
    d.is_anon === true,
    d.source || '',
    d.session_id || '',
    d.event_name || '',
    d.astrology_answer || '',
    d.option_id || '',
    d.display_position || '',
    d.selection_order || '',
    d.deselect_seq || '',
    d.at_ms === undefined ? '' : d.at_ms,
    d.selected_options_ordered || '',
    d.selection_count === undefined ? '' : d.selection_count,
    JSON.stringify(d)
  ]);

  // Both the submit and the drop-off beacon carry a full session summary.
  if (d.event_name === 'intent_submitted' || d.event_name === 'session_end') {
    var ordered = d.selected_options_ordered || '';
    sheet_(INTENT_DONE_SHEET, INTENT_DONE_COLS).appendRow([
      now,
      d.page_variant || '',
      d.user_id || '',
      d.id_encoding || '',
      d.is_anon === true,
      d.source || '',
      d.session_id || '',
      d.completed === true,
      d.abandoned_after_astrology === true,
      d.astrology_answer || '',
      d.astrology_changed === true,
      num_(d.astrology_answered_at_ms),
      ordered ? ordered.split(',')[0].split(':')[0] : '',   // strongest signal
      csv_(d.selected_options),        // pick order, not display order
      csv_(d.selected_positions),      // where those picks sat on screen
      num_(d.selection_count),
      csv_(d.options_order_shown),
      d.deselections_flat || '',
      num_(d.deselection_count),
      num_(d.time_to_first_pick_ms),
      num_(d.time_to_submit_ms),
      d.referrer || '',
      d.user_agent || ''
    ]);
  }
  return json_({ ok: true });
}

/** Astrology-interest survey events + one summary row per session. */
function handleSurvey_(d, now) {
  sheet_(SURVEY_EVENTS_SHEET, SURVEY_EVENT_COLS).appendRow([
    now,
    d.user_id || '',
    d.id_encoding || '',
    d.is_anon === true,
    d.source || '',
    d.session_id || '',
    d.event_name || '',
    d.question || '',
    d.answer || '',
    d.prior_experience_flat || '',
    d.interest_types_flat || '',
    d.at_ms === undefined ? '' : d.at_ms,
    JSON.stringify(d)
  ]);

  if (d.event_name === 'survey_submitted' || d.event_name === 'session_end') {
    sheet_(SURVEY_DONE_SHEET, SURVEY_DONE_COLS).appendRow([
      now,
      d.user_id || '',
      d.id_encoding || '',
      d.is_anon === true,
      d.source || '',
      d.session_id || '',
      d.completed === true,
      d.furthest_question_reached === undefined ? '' : d.furthest_question_reached,
      d.believes_in_astrology || '',
      d.prior_experience_flat || '',
      d.interest_types_flat || '',
      num_(d.time_to_first_answer_ms),
      num_(d.time_to_submit_ms),
      d.referrer || '',
      d.user_agent || ''
    ]);
  }
  return json_({ ok: true });
}

/** Has this user completed the survey? */
function surveyCompleted_(userId) {
  if (!userId) return false;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SURVEY_DONE_SHEET);
  if (!sh || sh.getLastRow() < 2) return false;
  // B = user_id, G = completed
  var rows = sh.getRange(2, 2, sh.getLastRow() - 1, 6).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(userId) && rows[i][5] === true) return true;
  }
  return false;
}

/** Has this user completed the given intent variant? */
function intentCompleted_(userId, variant) {
  if (!userId) return false;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INTENT_DONE_SHEET);
  if (!sh || sh.getLastRow() < 2) return false;
  // B = page_variant, C = user_id, H = completed
  var rows = sh.getRange(2, 2, sh.getLastRow() - 1, 7).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(variant) &&
        String(rows[i][1]) === String(userId) &&
        rows[i][6] === true) return true;
  }
  return false;
}

/** ?action=status&user_id=... — has this user already finished? */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action !== 'status') return json_({ ok: true });

  var userId = p.user_id || '';
  if (!userId) return json_({ ok: true, found: false, completed: false });

  if (p.instrument === 'intent') {
    var done = intentCompleted_(userId, p.variant || '');
    // Echo the instrument so the client can tell this reply apart from an
    // older deployment answering a different question.
    return json_({
      ok: true, instrument: 'intent', variant: p.variant || '',
      found: done, completed: done
    });
  }

  if (p.instrument === 'astrology_survey') {
    var surveyDone = surveyCompleted_(userId);
    return json_({ ok: true, instrument: 'astrology_survey', found: surveyDone, completed: surveyDone });
  }

  return json_({ ok: true, found: hasCompleted_(userId), completed: hasCompleted_(userId) });
}

/** Has this user_id already got a Completions row? */
function hasCompleted_(userId) {
  if (!userId) return false;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DONE_SHEET);
  if (!sh || sh.getLastRow() < 2) return false;

  // Column B holds user_id.
  var ids = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(userId)) return true;
  }
  return false;
}
