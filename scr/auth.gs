/**
 * Assembly Super App — central user directory & single sign-on (SSO).
 *
 * Sheet "Users": Username | PasswordHash | Salt | Name | Active | Apps | UpdatedAt | LastLogin
 *   Apps is JSON: { "<appId>": { "role": "...", "dept": "..." }, ... }
 *   appId "portal" with role "admin" = may open the Admin panel.
 *
 * Tokens are "<payload>.<hmac>" signed with Script Property SSO_SECRET (auto-created).
 * The token only says who the user is; access and roles are re-read from the
 * sheet on every verify, so changes in the Admin panel apply immediately.
 *
 * Apps call: POST {action:"verify", token, app} → { success, user:{username,name,role,dept} }
 */

var TOKEN_HOURS = 12;
var USER_HEADERS = ['Username', 'PasswordHash', 'Salt', 'Name', 'Active', 'Apps', 'UpdatedAt', 'LastLogin'];

function doGet() {
  return json_({ success: true, service: 'assembly-super-app-auth' });
}

function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ success: false, message: 'Invalid request' });
  }
  try {
    switch (data.action) {
      case 'login': return json_(login_(data.username, data.password));
      case 'verify': return json_(verify_(data.token, data.app));
      case 'me': return json_(me_(data.token));
      case 'changePassword': return json_(changePassword_(data.token, data.oldPassword, data.newPassword));
      case 'listUsers': return json_(withAdmin_(data.token, listUsers_));
      case 'saveUser': return json_(withAdmin_(data.token, function (admin) { return saveUser_(admin, data.user); }));
      case 'deleteUser': return json_(withAdmin_(data.token, function (admin) { return deleteUser_(admin, data.username); }));
      default: return json_({ success: false, message: 'Unknown action' });
    }
  } catch (err) {
    return json_({ success: false, message: String(err && err.message || err) });
  }
}

// ---------- actions ----------

function login_(username, password) {
  username = normUsername_(username);
  password = String(password || '');
  if (!username || !password) return { success: false, message: 'กรุณากรอก Username และ Password' };

  var users = readUsers_();
  // First-time setup: before any portal admin exists, admin/admin creates one.
  // Once a real admin exists this fallback stops working.
  var hasAdmin = users.some(function (u) { return u.active && isPortalAdmin_(u); });
  if (!hasAdmin && username === 'admin' && password === 'admin') {
    var created = writeUser_({ username: 'admin', name: 'Administrator', active: true, apps: { portal: { role: 'admin' } } }, 'admin');
    log_('admin', 'BOOTSTRAP', 'สร้างผู้ดูแลระบบคนแรก');
    return issue_(created, true);
  }

  var user = findUser_(users, username);
  if (!user || !checkPassword_(user, password)) return { success: false, message: 'Username หรือ Password ไม่ถูกต้อง' };
  if (!user.active) return { success: false, message: 'บัญชีถูกระงับ กรุณาติดต่อผู้ดูแลระบบ' };

  sheet_().getRange(user.row, 8).setValue(new Date());
  log_(username, 'LOGIN', '');
  return issue_(user, false);
}

function verify_(token, appId) {
  var user = userFromToken_(token);
  if (!user) return { success: false, message: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' };
  var access = user.apps[appId];
  if (!access || !access.role) return { success: false, message: 'ไม่มีสิทธิ์ใช้งานแอปนี้' };
  return {
    success: true,
    user: { username: user.username, name: user.name, role: access.role || '', dept: access.dept || '' }
  };
}

function me_(token) {
  var user = userFromToken_(token);
  if (!user) return { success: false, message: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' };
  return { success: true, user: publicUser_(user) };
}

function changePassword_(token, oldPassword, newPassword) {
  var user = userFromToken_(token);
  if (!user) return { success: false, message: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' };
  if (!checkPassword_(user, String(oldPassword || ''))) return { success: false, message: 'รหัสผ่านเดิมไม่ถูกต้อง' };
  if (String(newPassword || '').length < 4) return { success: false, message: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร' };
  writeUser_(user, String(newPassword));
  log_(user.username, 'CHANGE_PASSWORD', '');
  return { success: true };
}

function withAdmin_(token, fn) {
  var admin = userFromToken_(token);
  if (!admin || !isPortalAdmin_(admin)) return { success: false, message: 'ต้องเป็นผู้ดูแลระบบ' };
  return fn(admin);
}

function listUsers_() {
  return { success: true, users: readUsers_().map(publicUser_) };
}

function saveUser_(admin, input) {
  input = input || {};
  var username = normUsername_(input.username);
  if (!username) return { success: false, message: 'กรุณากรอก Username' };
  if (!/^[A-Za-z0-9._@-]+$/.test(username)) return { success: false, message: 'Username ใช้ได้เฉพาะ a-z 0-9 . _ - @' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var existing = findUser_(readUsers_(), username);
    if (input.isNew && existing) return { success: false, message: 'Username นี้มีอยู่แล้ว' };
    if (!existing && !input.password) return { success: false, message: 'กรุณาตั้งรหัสผ่านสำหรับผู้ใช้ใหม่' };
    if (input.password && String(input.password).length < 4) return { success: false, message: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร' };

    var apps = cleanApps_(input.apps);
    var active = input.active !== false;
    if (existing && existing.username === admin.username && (!active || !(apps.portal && apps.portal.role === 'admin'))) {
      return { success: false, message: 'ไม่สามารถลดสิทธิ์หรือระงับบัญชีของตัวเองได้' };
    }

    var saved = writeUser_({
      row: existing && existing.row,
      username: username,
      name: String(input.name || username).trim(),
      active: active,
      apps: apps,
      hash: existing && existing.hash,
      salt: existing && existing.salt
    }, input.password ? String(input.password) : null);
    log_(admin.username, existing ? 'UPDATE_USER' : 'CREATE_USER', username + ' ' + JSON.stringify(apps));
    return { success: true, user: publicUser_(saved) };
  } finally {
    lock.releaseLock();
  }
}

function deleteUser_(admin, username) {
  username = normUsername_(username);
  if (username === admin.username) return { success: false, message: 'ไม่สามารถลบบัญชีของตัวเองได้' };
  var user = findUser_(readUsers_(), username);
  if (!user) return { success: false, message: 'ไม่พบผู้ใช้' };
  sheet_().deleteRow(user.row);
  log_(admin.username, 'DELETE_USER', username);
  return { success: true };
}

// ---------- tokens ----------

function issue_(user, mustChangePassword) {
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify({
    u: encodeURIComponent(user.username),
    exp: Date.now() + TOKEN_HOURS * 3600 * 1000,
    n: Utilities.getUuid()
  }));
  return {
    success: true,
    token: payload + '.' + sign_(payload),
    expiresAt: Date.now() + TOKEN_HOURS * 3600 * 1000,
    mustChangePassword: !!mustChangePassword,
    user: publicUser_(user)
  };
}

function userFromToken_(token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 2 || parts[1] !== sign_(parts[0])) return null;
  var session;
  try {
    session = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8'));
  } catch (err) {
    return null;
  }
  if (!session || Number(session.exp) < Date.now()) return null;
  var user = findUser_(readUsers_(), decodeURIComponent(session.u || ''));
  return user && user.active ? user : null;
}

function sign_(payload) {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('SSO_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SSO_SECRET', secret);
  }
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret));
}

// ---------- storage ----------

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  if (!sheet) {
    sheet = ss.insertSheet('Users');
    sheet.appendRow(USER_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readUsers_() {
  var values = sheet_().getDataRange().getValues();
  var users = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (!r[0]) continue;
    var apps = {};
    try { apps = JSON.parse(r[5] || '{}') || {}; } catch (err) { apps = {}; }
    users.push({
      row: i + 1,
      username: normUsername_(r[0]),
      hash: String(r[1] || ''),
      salt: String(r[2] || ''),
      name: String(r[3] || r[0]),
      active: r[4] === true || String(r[4]).toUpperCase() === 'TRUE',
      apps: apps,
      updatedAt: r[6] || '',
      lastLogin: r[7] || ''
    });
  }
  return users;
}

function writeUser_(user, newPassword) {
  var sheet = sheet_();
  if (newPassword) {
    user.salt = Utilities.getUuid();
    user.hash = hash_(newPassword, user.salt);
  }
  var row = [user.username, user.hash, user.salt, user.name, !!user.active, JSON.stringify(user.apps || {}), new Date()];
  if (user.row) {
    sheet.getRange(user.row, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
    user.row = sheet.getLastRow();
  }
  return user;
}

function findUser_(users, username) {
  username = normUsername_(username);
  for (var i = 0; i < users.length; i++) if (users[i].username === username) return users[i];
  return null;
}

function checkPassword_(user, password) {
  return !!user.hash && hash_(password, user.salt) === user.hash;
}

function hash_(password, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function cleanApps_(apps) {
  var out = {};
  Object.keys(apps || {}).forEach(function (id) {
    var a = apps[id];
    if (!a || !a.role) return;
    out[String(id)] = a.dept ? { role: String(a.role), dept: String(a.dept) } : { role: String(a.role) };
  });
  return out;
}

function publicUser_(u) {
  return { username: u.username, name: u.name, active: u.active, apps: u.apps, lastLogin: u.lastLogin || '' };
}

function isPortalAdmin_(u) {
  return !!(u.apps && u.apps.portal && u.apps.portal.role === 'admin');
}

function normUsername_(v) {
  return String(v || '').trim().toLowerCase();
}

function log_(username, action, detail) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('AuditLog') || ss.insertSheet('AuditLog');
  if (sheet.getLastRow() === 0) sheet.appendRow(['Timestamp', 'Username', 'Action', 'Detail']);
  sheet.appendRow([new Date(), username, action, detail]);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
