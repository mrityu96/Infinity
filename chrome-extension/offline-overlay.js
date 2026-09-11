(function () {
  "use strict";

  function ensureOverlay() {
    let overlay = document.getElementById("cmlOfflineOverlay");
    if (overlay) {
      return overlay;
    }
    overlay = document.createElement("div");
    overlay.id = "cmlOfflineOverlay";
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-labelledby", "cmlOfflineTitle");
    overlay.setAttribute("aria-describedby", "cmlOfflineCopy");
    overlay.innerHTML =
      "<style>"
      + "#cmlOfflineOverlay{position:fixed;inset:0;z-index:4000;display:grid;"
      + "place-items:center;padding:24px;background:rgba(8,16,31,.72);}"
      + "#cmlOfflineOverlay[hidden]{display:none;}"
      + "#cmlOfflineOverlay .cml-offline-card{max-width:560px;width:100%;"
      + "background:#fff;color:#0f172a;border-radius:16px;padding:24px 24px 20px;"
      + "border:1px solid #d7e3f4;}"
      + "html[data-theme='dark'] #cmlOfflineOverlay .cml-offline-card{"
      + "background:#0f1a2e;color:#e8eef8;border-color:#1e3358;}"
      + "#cmlOfflineOverlay h2{margin:0 0 8px;font:700 20px/1.3 system-ui,sans-serif;}"
      + "#cmlOfflineOverlay p,#cmlOfflineOverlay li{font:14px/1.5 system-ui,sans-serif;}"
      + "#cmlOfflineOverlay ol{margin:12px 0 0;padding-left:20px;}"
      + "#cmlOfflineOverlay code{font:13px/1.4 ui-monospace,Menlo,monospace;}"
      + "</style>"
      + '<div class="cml-offline-card">'
      + '<h2 id="cmlOfflineTitle">Reload the unpacked extension</h2>'
      + '<p id="cmlOfflineCopy">The background worker is not responding. Open '
      + "<code>chrome://extensions</code>, find Salesforce CML Tool, and click "
      + "Reload. Allow cookies and Salesforce site access if Chrome asks.</p>"
      + "<ol>"
      + "<li>Keep at least one Salesforce org tab open in this Chrome profile.</li>"
      + "<li>Reload the extension, then click the toolbar icon again.</li>"
      + "</ol>"
      + "<p>This page retries automatically. Fetch uses your browser session; "
      + "deploy still uses the desktop Python tool.</p>"
      + "</div>";
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  async function ping() {
    const payload = await chrome.runtime.sendMessage({
      type: "cml-api",
      method: "GET",
      path: "/api/ping",
    });
    return Boolean(payload && payload.app === "cml-tool");
  }

  async function refresh() {
    const overlay = ensureOverlay();
    try {
      overlay.hidden = await ping();
    } catch (_) {
      overlay.hidden = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh, { once: true });
  } else {
    refresh();
  }
  setInterval(refresh, 1500);
})();
