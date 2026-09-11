"use strict";

importScripts(
  "lib/session-core.js",
  "lib/session.js",
  "lib/rest.js",
  "lib/api-router.js",
);

async function refreshBadge() {
  try {
    await CmlSession.listOpenSalesforceSessions();
  } catch (_) {
    /* Cookie/tab permission may still be pending on first install. */
  }
  const count = CmlSession.openOrgCount();
  const ok = count > 0;
  await chrome.action.setBadgeText({ text: ok ? String(count) : "!" });
  await chrome.action.setBadgeBackgroundColor({
    color: ok ? "#059669" : "#dc2626",
  });
  await chrome.action.setTitle({
    title: ok
      ? ("Open CML Tool (" + count + " Salesforce org" + (count === 1 ? "" : "s") + ")")
      : "Open a Salesforce org tab, then open CML Tool",
  });
}

async function openUi() {
  await refreshBadge();
  const page = chrome.runtime.getURL("index.html");
  const tabs = await chrome.tabs.query({ url: page + "*" });
  const existing = tabs[0];
  if (existing && existing.id) {
    await chrome.tabs.update(existing.id, { active: true, url: page });
    if (existing.windowId) {
      try {
        await chrome.windows.update(existing.windowId, { focused: true });
      } catch (_) {
        /* Focusing is optional. */
      }
    }
    return;
  }
  await chrome.tabs.create({ url: page });
}

chrome.action.onClicked.addListener(function () {
  openUi().then(refreshBadge);
});

chrome.runtime.onInstalled.addListener(function () {
  chrome.alarms.create("cml-ping", { periodInMinutes: 1 });
  refreshBadge();
});

chrome.runtime.onStartup.addListener(function () {
  chrome.alarms.create("cml-ping", { periodInMinutes: 1 });
  refreshBadge();
});

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm && alarm.name === "cml-ping") {
    refreshBadge();
  }
});

chrome.tabs.onUpdated.addListener(function (_tabId, changeInfo, tab) {
  const url = changeInfo.url || (tab && tab.url) || "";
  if (!url || !CmlSessionCore.isSalesforcePageUrl(url)) {
    return;
  }
  refreshBadge();
});

chrome.tabs.onRemoved.addListener(function () {
  refreshBadge();
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || message.type !== "cml-api") {
    return false;
  }
  if (sender && sender.id && sender.id !== chrome.runtime.id) {
    sendResponse({ error: "Untrusted sender." });
    return false;
  }
  CmlApiRouter.handleCmlApi(message)
    .then(sendResponse)
    .catch(function (error) {
      sendResponse({
        error: String(error && error.message ? error.message : error),
        ok: false,
        log: String(error && error.message ? error.message : error),
      });
    });
  return true;
});

refreshBadge();
