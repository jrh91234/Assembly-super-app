// Assembly Super App shell: lists the apps from apps.config.json and runs each
// one in its own iframe. Frames stay mounted after first open so switching
// between apps keeps their state (logins, filters, unsaved forms).
(function () {
  const $ = (id) => document.getElementById(id);
  const frames = {};
  let apps = [];

  const appUrl = (app, path) => `apps/${app.id}/${path || app.entry}`;

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "style") node.style.cssText = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    });
    (children || []).forEach((c) => node.append(c));
    return node;
  }

  function renderNav() {
    const nav = $("navApps");
    nav.replaceChildren(
      ...apps.map((app) =>
        el("a", { class: "nav-item", href: `#/${app.id}`, "data-id": app.id, style: `--app-color:${app.color}` }, [
          el("span", { class: "nav-icon", text: app.icon }),
          el("span", { class: "nav-label", text: app.name }),
        ])
      )
    );
  }

  function renderGrid(filter) {
    const q = (filter || "").trim().toLowerCase();
    const list = apps.filter((a) =>
      !q || [a.name, a.nameTh, a.description, a.repo].join(" ").toLowerCase().includes(q)
    );
    const grid = $("grid");
    if (!list.length) {
      grid.replaceChildren(el("p", { class: "empty", text: "ไม่พบแอปที่ค้นหา" }));
      return;
    }
    grid.replaceChildren(
      ...list.map((app) =>
        el("a", { class: "card", href: `#/${app.id}`, style: `--app-color:${app.color}` }, [
          el("div", { class: "card-head" }, [
            el("div", { class: "card-icon", text: app.icon }),
            el("div", {}, [el("h2", { text: app.name }), el("p", { class: "th", text: app.nameTh })]),
          ]),
          el("p", { class: "desc", text: app.description }),
          el("div", { class: "meta", text: app.repo }),
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

  function show(id) {
    const app = apps.find((a) => a.id === id);
    document.body.classList.remove("nav-open");
    document.querySelectorAll(".nav-item").forEach((n) =>
      n.classList.toggle("active", n.dataset.id === (app ? app.id : ""))
    );

    if (!app) {
      $("home").hidden = false;
      $("frames").hidden = true;
      $("appActions").hidden = true;
      $("current").textContent = "";
      document.title = "Assembly Super App";
      return;
    }

    const frame = frameFor(app);
    Object.values(frames).forEach((f) => (f.hidden = f !== frame));
    $("home").hidden = true;
    $("frames").hidden = false;
    $("appActions").hidden = false;
    $("current").textContent = `${app.icon} ${app.name}`;
    document.title = `${app.name} · Assembly Super App`;
    $("newTabBtn").href = frame.src;
    // Green dot = app is mounted and keeps its state.
    const navItem = document.querySelector(`.nav-item[data-id="${app.id}"]`);
    if (navItem && !navItem.querySelector(".nav-dot")) navItem.append(el("span", { class: "nav-dot", title: "เปิดอยู่" }));

    const sub = $("subPage");
    const pages = [{ label: "หน้าหลัก", path: app.entry }].concat(app.links || []);
    sub.hidden = pages.length < 2;
    sub.replaceChildren(...pages.map((p) => el("option", { value: p.path, text: p.label })));
    const currentPath = new URL(frame.src, location.href).pathname.split(`/apps/${app.id}/`)[1];
    if (pages.some((p) => p.path === currentPath)) sub.value = currentPath;
  }

  function route() {
    show(location.hash.replace(/^#\/?/, "").split("/")[0]);
  }

  function currentApp() {
    return apps.find((a) => a.id === location.hash.replace(/^#\/?/, "").split("/")[0]);
  }

  $("reloadBtn").addEventListener("click", () => {
    const app = currentApp();
    if (app && frames[app.id]) frames[app.id].src = frames[app.id].src;
  });
  $("subPage").addEventListener("change", (e) => {
    const app = currentApp();
    if (!app) return;
    frames[app.id].src = appUrl(app, e.target.value);
    $("newTabBtn").href = frames[app.id].src;
  });
  $("menuBtn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
  $("scrim").addEventListener("click", () => document.body.classList.remove("nav-open"));
  $("search").addEventListener("input", (e) => renderGrid(e.target.value));
  window.addEventListener("hashchange", route);

  fetch("apps.config.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((cfg) => {
      apps = cfg.apps;
      renderNav();
      renderGrid();
      route();
    })
    .catch((err) => {
      $("grid").replaceChildren(el("p", { class: "empty", text: "โหลดรายการแอปไม่สำเร็จ: " + err.message }));
    });
})();
