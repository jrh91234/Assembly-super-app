// Assembly Super App shell: lists the apps from apps.config.json and runs each
// one in its own iframe. Frames stay mounted after first open so switching
// between apps keeps their state (logins, filters, unsaved forms).
//
// When apps.config.json has an authUrl, the portal requires a Super App login
// (see scr/auth.gs) and only shows the apps the user has a role in. Apps on
// this origin pick up the same session from localStorage (portal/sso.js).
(function () {
  const $ = (id) => document.getElementById(id);
  const SSO = window.SuperAppSSO;
  const frames = {};
  let config = { apps: [] };
  let apps = [];
  let session = null;
  let users = [];
  let editing = null;

  const appUrl = (app, path) => `apps/${app.id}/${path || app.entry}`;
  const authOn = () => !!config.authUrl;
  const isAdmin = () => !!(session && session.user.apps.portal && session.user.apps.portal.role === "admin");

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "style") node.style.cssText = v;
      else if (k === "text") node.textContent = v;
      else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : v);
    });
    (children || []).forEach((c) => node.append(c));
    return node;
  }

  function showError(id, msg) {
    $(id).textContent = msg || "";
    $(id).hidden = !msg;
  }

  // ---------- session ----------

  function visibleApps() {
    if (!authOn()) return config.apps;
    if (!session) return [];
    return config.apps.filter((a) => session.user.apps[a.id] && session.user.apps[a.id].role);
  }

  // App-local sessions belong to whoever was logged in before; drop them so
  // each app re-runs SSO for the current user.
  function clearAppSessions() {
    config.apps.forEach((a) =>
      (a.sessionKeys || []).forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch (e) {}
      })
    );
  }

  function applySession() {
    apps = visibleApps();
    const signedIn = !authOn() || !!session;
    $("loginOverlay").hidden = signedIn;
    $("userMenu").hidden = !session;
    $("navAdmin").hidden = !isAdmin();
    if (session) {
      const name = session.user.name || session.user.username;
      $("userName").textContent = name;
      $("userAvatar").textContent = name.trim().charAt(0).toUpperCase();
      $("greeting").textContent = `สวัสดี ${name}`;
    }
    $("footnote").textContent = authOn()
      ? "เข้าสู่ระบบครั้งเดียวที่นี่ แล้วแอปจะเข้าสู่ระบบให้อัตโนมัติตามสิทธิ์ที่ได้รับ"
      : "ยังไม่ได้ตั้งค่าระบบผู้ใช้กลาง (authUrl ใน apps.config.json) — แต่ละแอปใช้ login ของตัวเอง";
    renderNav();
    renderGrid($("search").value);
    route();
  }

  async function refreshSession() {
    if (!session) return;
    try {
      const res = await SSO.call(config.authUrl, "me", { token: session.token });
      if (!res.success) return logout();
      session.user = res.user;
      SSO.write(session);
      applySession();
    } catch (e) {
      // Offline: keep the cached session until it expires.
    }
  }

  function logout() {
    SSO.clear();
    clearAppSessions();
    session = null;
    Object.keys(frames).forEach((id) => {
      frames[id].remove();
      delete frames[id];
    });
    location.hash = "#/";
    applySession();
  }

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("loginError", "");
    $("loginBtn").disabled = true;
    $("loginBtn").textContent = "กำลังเข้าสู่ระบบ…";
    try {
      const res = await SSO.call(config.authUrl, "login", {
        username: $("loginUser").value,
        password: $("loginPass").value,
      });
      if (!res.success) return showError("loginError", res.message);
      clearAppSessions();
      session = { token: res.token, expiresAt: res.expiresAt, authUrl: config.authUrl, user: res.user };
      SSO.write(session);
      $("loginPass").value = "";
      applySession();
      if (res.mustChangePassword) openPasswordModal(true);
    } catch (err) {
      showError("loginError", "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: " + err.message);
    } finally {
      $("loginBtn").disabled = false;
      $("loginBtn").textContent = "เข้าสู่ระบบ";
    }
  });

  // ---------- navigation ----------

  function renderNav() {
    $("navApps").replaceChildren(
      ...apps.map((app) =>
        el("a", { class: "nav-item", href: `#/${app.id}`, "data-id": app.id, style: `--app-color:${app.color}` }, [
          el("span", { class: "nav-icon", text: app.icon }),
          el("span", { class: "nav-label", text: app.name }),
          frames[app.id] ? el("span", { class: "nav-dot", title: "เปิดอยู่" }) : "",
        ])
      )
    );
  }

  function roleOf(app) {
    const a = session && session.user.apps[app.id];
    return a ? a.role + (a.dept ? ` · ${a.dept}` : "") : "";
  }

  function renderGrid(filter) {
    const q = (filter || "").trim().toLowerCase();
    const list = apps.filter(
      (a) => !q || [a.name, a.nameTh, a.description, a.repo].join(" ").toLowerCase().includes(q)
    );
    if (!list.length) {
      $("grid").replaceChildren(
        el("p", { class: "empty", text: q ? "ไม่พบแอปที่ค้นหา" : "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งานแอปใด ติดต่อผู้ดูแลระบบ" })
      );
      return;
    }
    $("grid").replaceChildren(
      ...list.map((app) =>
        el("a", { class: "card", href: `#/${app.id}`, style: `--app-color:${app.color}` }, [
          el("div", { class: "card-head" }, [
            el("div", { class: "card-icon", text: app.icon }),
            el("div", {}, [el("h2", { text: app.name }), el("p", { class: "th", text: app.nameTh })]),
          ]),
          el("p", { class: "desc", text: app.description }),
          el("div", { class: "meta" }, [
            el("span", { text: app.repo }),
            roleOf(app) ? el("span", { class: "role-chip", text: roleOf(app) }) : "",
          ]),
        ])
      )
    );
  }

  function frameFor(app) {
    if (!frames[app.id]) {
      const f = el("iframe", {
        src: appUrl(app),
        title: app.name,
        allow: "camera; microphone; clipboard-read; clipboard-write; fullscreen; geolocation",
      });
      $("frames").append(f);
      frames[app.id] = f;
    }
    return frames[app.id];
  }

  function currentId() {
    return location.hash.replace(/^#\/?/, "").split("/")[0];
  }

  function show(id) {
    document.body.classList.remove("nav-open");
    const app = apps.find((a) => a.id === id);
    const adminView = id === "admin" && isAdmin();
    if (app && !frames[app.id]) {
      frameFor(app);
      renderNav();
    }
    document
      .querySelectorAll(".nav-item")
      .forEach((n) => n.classList.toggle("active", n.dataset.id === (app ? app.id : adminView ? "admin" : "")));

    $("home").hidden = !!(app || adminView);
    $("admin").hidden = !adminView;
    $("frames").hidden = !app;
    $("appActions").hidden = !app;

    if (adminView) {
      $("current").textContent = "⚙️ จัดการผู้ใช้";
      document.title = "จัดการผู้ใช้ · Assembly Super App";
      loadUsers();
      return;
    }
    if (!app) {
      $("current").textContent = "";
      document.title = "Assembly Super App";
      return;
    }

    const frame = frames[app.id];
    Object.values(frames).forEach((f) => (f.hidden = f !== frame));
    $("current").textContent = `${app.icon} ${app.name}`;
    document.title = `${app.name} · Assembly Super App`;
    $("newTabBtn").href = frame.src;

    const sub = $("subPage");
    const pages = [{ label: "หน้าหลัก", path: app.entry }].concat(app.links || []);
    sub.hidden = pages.length < 2;
    sub.replaceChildren(...pages.map((p) => el("option", { value: p.path, text: p.label })));
    const currentPath = new URL(frame.src, location.href).pathname.split(`/apps/${app.id}/`)[1];
    if (pages.some((p) => p.path === currentPath)) sub.value = currentPath;
  }

  function route() {
    show(currentId());
  }

  $("reloadBtn").addEventListener("click", () => {
    const f = frames[currentId()];
    if (f) f.src = f.src;
  });
  $("subPage").addEventListener("change", (e) => {
    const app = apps.find((a) => a.id === currentId());
    if (!app) return;
    frames[app.id].src = appUrl(app, e.target.value);
    $("newTabBtn").href = frames[app.id].src;
  });
  $("menuBtn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
  $("scrim").addEventListener("click", () => document.body.classList.remove("nav-open"));
  $("search").addEventListener("input", (e) => renderGrid(e.target.value));
  window.addEventListener("hashchange", route);

  // ---------- user menu / password ----------

  $("userBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    $("userDropdown").hidden = !$("userDropdown").hidden;
  });
  document.addEventListener("click", () => ($("userDropdown").hidden = true));
  $("logoutBtn").addEventListener("click", logout);
  $("changePwBtn").addEventListener("click", () => openPasswordModal(false));

  function openPasswordModal(forced) {
    $("pwNotice").hidden = !forced;
    $("pwCancel").hidden = forced;
    showError("pwError", "");
    $("pwForm").reset();
    $("pwModal").showModal();
  }
  $("pwCancel").addEventListener("click", () => $("pwModal").close());
  $("pwModal").addEventListener("cancel", (e) => {
    if ($("pwCancel").hidden) e.preventDefault();
  });
  $("pwForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = await SSO.call(config.authUrl, "changePassword", {
      token: session.token,
      oldPassword: $("pwOld").value,
      newPassword: $("pwNew").value,
    }).catch((err) => ({ success: false, message: err.message }));
    if (!res.success) return showError("pwError", res.message);
    $("pwModal").close();
    alert("เปลี่ยนรหัสผ่านเรียบร้อย");
  });

  // ---------- admin: users ----------

  async function adminCall(action, body) {
    const res = await SSO.call(config.authUrl, action, Object.assign({ token: session.token }, body)).catch((err) => ({
      success: false,
      message: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: " + err.message,
    }));
    return res;
  }

  async function loadUsers() {
    const res = await adminCall("listUsers", {});
    if (!res.success) {
      $("userRows").replaceChildren(el("tr", {}, [el("td", { colspan: 5, class: "error", text: res.message })]));
      return;
    }
    users = res.users;
    renderUsers();
  }

  function formatDate(v) {
    if (!v) return "-";
    const d = new Date(v);
    return isNaN(d) ? String(v) : d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  }

  function renderUsers() {
    const q = $("userSearch").value.trim().toLowerCase();
    const list = users.filter((u) => !q || (u.username + " " + u.name).toLowerCase().includes(q));
    if (!list.length) {
      $("userRows").replaceChildren(el("tr", {}, [el("td", { colspan: 5, class: "muted", text: "ไม่พบผู้ใช้" })]));
      return;
    }
    $("userRows").replaceChildren(
      ...list.map((u) => {
        const chips = Object.entries(u.apps || {}).map(([id, a]) => {
          const app = config.apps.find((x) => x.id === id);
          const label = id === "portal" ? "⚙️ Portal" : app ? `${app.icon} ${app.name}` : id;
          return el("span", { class: "chip", text: `${label}: ${a.role}${a.dept ? " · " + a.dept : ""}` });
        });
        return el("tr", {}, [
          el("td", {}, [el("strong", { text: u.name }), el("div", { class: "muted", text: u.username })]),
          el("td", {}, chips.length ? chips : [el("span", { class: "muted", text: "ไม่มีสิทธิ์" })]),
          el("td", {}, [el("span", { class: u.active ? "status on" : "status off", text: u.active ? "ใช้งาน" : "ระงับ" })]),
          el("td", { class: "muted", text: formatDate(u.lastLogin) }),
          el("td", {}, [
            Object.assign(el("button", { class: "btn small", text: "แก้ไข" }), { onclick: () => openUser(u) }),
          ]),
        ]);
      })
    );
  }
  $("userSearch").addEventListener("input", renderUsers);
  $("addUserBtn").addEventListener("click", () => openUser(null));

  function roleSelect(id, roles, value) {
    return el(
      "select",
      { "data-app": id },
      [el("option", { value: "", text: "— ไม่มีสิทธิ์ —" })].concat(
        roles.map((r) => el("option", { value: r, text: r, selected: r === value }))
      )
    );
  }

  function openUser(u) {
    editing = u;
    $("userModalTitle").textContent = u ? `แก้ไขผู้ใช้: ${u.username}` : "เพิ่มผู้ใช้";
    $("fUsername").value = u ? u.username : "";
    $("fUsername").readOnly = !!u;
    $("fName").value = u ? u.name : "";
    $("fPassword").value = "";
    $("fPassword").required = !u;
    $("fPasswordLabel").textContent = u ? "รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)" : "รหัสผ่าน";
    $("fActive").checked = u ? u.active : true;
    $("deleteUserBtn").hidden = !u || u.username === session.user.username;
    showError("userFormError", "");

    const cur = (u && u.apps) || {};
    const rows = [{ id: "portal", icon: "⚙️", name: "Portal (จัดการผู้ใช้)", roles: ["admin"] }].concat(config.apps);
    $("fApps").replaceChildren(
      ...rows.map((app) => {
        const a = cur[app.id] || {};
        const fields = (app.fields || []).map((f) =>
          el("input", { "data-app": app.id, "data-field": f, value: a[f] || "", placeholder: f === "dept" ? "แผนก เช่น ASSEMBLY / ALL" : f })
        );
        return el("div", { class: "app-role" }, [
          el("span", { class: "app-role-name", text: `${app.icon} ${app.name}` }),
          roleSelect(app.id, app.roles || ["user"], a.role),
          ...fields,
        ]);
      })
    );
    $("userModal").showModal();
  }

  $("cancelUserBtn").addEventListener("click", () => $("userModal").close());

  $("userForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const appsAccess = {};
    $("fApps")
      .querySelectorAll("select[data-app]")
      .forEach((s) => {
        if (!s.value) return;
        appsAccess[s.dataset.app] = { role: s.value };
      });
    $("fApps")
      .querySelectorAll("input[data-field]")
      .forEach((i) => {
        if (appsAccess[i.dataset.app] && i.value.trim()) appsAccess[i.dataset.app][i.dataset.field] = i.value.trim();
      });
    $("saveUserBtn").disabled = true;
    const res = await adminCall("saveUser", {
      user: {
        isNew: !editing,
        username: $("fUsername").value,
        name: $("fName").value,
        password: $("fPassword").value,
        active: $("fActive").checked,
        apps: appsAccess,
      },
    });
    $("saveUserBtn").disabled = false;
    if (!res.success) return showError("userFormError", res.message);
    $("userModal").close();
    if (res.user.username === session.user.username) refreshSession();
    loadUsers();
  });

  $("deleteUserBtn").addEventListener("click", async () => {
    if (!editing || !confirm(`ลบผู้ใช้ ${editing.username}?`)) return;
    const res = await adminCall("deleteUser", { username: editing.username });
    if (!res.success) return showError("userFormError", res.message);
    $("userModal").close();
    loadUsers();
  });

  // ---------- boot ----------

  fetch("apps.config.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((cfg) => {
      config = cfg;
      if (authOn()) {
        const s = SSO.read();
        session = s && s.authUrl === config.authUrl ? s : null;
      }
      applySession();
      refreshSession();
    })
    .catch((err) => {
      $("grid").replaceChildren(el("p", { class: "empty", text: "โหลดรายการแอปไม่สำเร็จ: " + err.message }));
    });
})();
