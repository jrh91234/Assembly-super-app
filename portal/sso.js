// Super App SSO session, shared by the portal and every app on this origin.
// localStorage["SUPERAPP_SSO"] = { token, authUrl, expiresAt, user:{username,name,apps} }
// Apps read it and call POST {action:"verify", token, app} on authUrl.
(function () {
  const KEY = "SUPERAPP_SSO";

  function read() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      return s && s.token && s.expiresAt > Date.now() ? s : null;
    } catch (e) {
      return null;
    }
  }

  function write(session) {
    try {
      localStorage.setItem(KEY, JSON.stringify(session));
    } catch (e) {}
  }

  function clear() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {}
  }

  // text/plain keeps the request "simple" so Apps Script needs no CORS preflight.
  async function call(authUrl, action, body) {
    const res = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action }, body)),
    });
    return res.json();
  }

  window.SuperAppSSO = { KEY, read, write, clear, call };
})();
