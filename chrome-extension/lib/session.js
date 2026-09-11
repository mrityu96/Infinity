"use strict";

const CORE = globalThis.CmlSessionCore;
const sessionsByAlias = new Map();

function cookiesGet(details) {
  return chrome.cookies.get(details).catch(function () { return null; });
}

function cookiesGetAll(details) {
  return chrome.cookies.getAll(details).catch(function () { return []; });
}

async function sidOnUrl(url) {
  const cookie = await cookiesGet({ url: url, name: "sid" });
  return cookie && cookie.value ? cookie.value : "";
}

async function findApiCookie(orgId, pageUrl) {
  const collected = [];
  const allSid = await cookiesGetAll({ name: "sid", secure: true });
  collected.push.apply(collected, allSid || []);
  for (const domain of CORE.COOKIE_SEARCH_DOMAINS) {
    const cookies = await cookiesGetAll({
      name: "sid",
      domain: domain,
      secure: true,
    });
    collected.push.apply(collected, cookies || []);
  }
  let picked = CORE.pickApiCookie(collected, orgId);
  if (picked) {
    return picked;
  }
  let pageHost = "";
  try {
    pageHost = new URL(pageUrl).hostname;
  } catch (_) {
    pageHost = "";
  }
  const classicHost = CORE.classicApiHostFromPageHost(pageHost);
  if (!classicHost) {
    return null;
  }
  const classicCookie = await cookiesGet({
    url: "https://" + classicHost + "/",
    name: "sid",
  });
  if (!classicCookie || !classicCookie.value) {
    return null;
  }
  if (CORE.orgIdFromSid(classicCookie.value) !== orgId) {
    return null;
  }
  if (!CORE.isApiUsableCookieDomain(classicCookie.domain || classicHost)) {
    return null;
  }
  return classicCookie;
}

async function resolveSessionFromTabUrl(url) {
  if (!CORE.isSalesforcePageUrl(url)) {
    return null;
  }
  const tabSid = await sidOnUrl(url);
  const orgId = CORE.orgIdFromSid(tabSid);
  if (!orgId) {
    return null;
  }
  const apiCookie = await findApiCookie(orgId, url);
  if (!apiCookie) {
    return {
      orgId: orgId,
      error: "Found a Lightning session but not an API session. Open the org in Classic or stay logged in, then retry.",
    };
  }
  const hostname = CORE.cookieHostname(apiCookie.domain)
    || CORE.classicApiHostFromPageHost(new URL(url).hostname);
  return {
    orgId: orgId,
    hostname: hostname,
    instance: CORE.instanceUrlFromHostname(hostname),
    token: apiCookie.value,
    alias: CORE.aliasFromHostname(hostname),
  };
}

async function listOpenSalesforceSessions() {
  const tabs = await chrome.tabs.query({
    url: CORE.TAB_URL_PATTERNS.slice(),
  });
  const byOrgId = new Map();
  for (const tab of tabs || []) {
    if (!tab || !tab.url || !CORE.isSalesforcePageUrl(tab.url)) {
      continue;
    }
    const session = await resolveSessionFromTabUrl(tab.url);
    if (!session || !session.orgId || session.error) {
      continue;
    }
    if (!byOrgId.has(session.orgId)) {
      byOrgId.set(session.orgId, session);
    }
  }
  sessionsByAlias.clear();
  const orgs = [];
  for (const session of byOrgId.values()) {
    sessionsByAlias.set(session.alias, session);
    orgs.push({
      alias: session.alias,
      username: session.username || "",
      orgId: session.orgId,
      hostname: session.hostname,
    });
  }
  orgs.sort(function (left, right) {
    return left.alias.toLowerCase().localeCompare(right.alias.toLowerCase());
  });
  return orgs;
}

function getSession(alias) {
  return sessionsByAlias.get(alias) || null;
}

function openOrgCount() {
  return sessionsByAlias.size;
}

globalThis.CmlSession = {
  listOpenSalesforceSessions: listOpenSalesforceSessions,
  resolveSessionFromTabUrl: resolveSessionFromTabUrl,
  getSession: getSession,
  openOrgCount: openOrgCount,
  rememberIdentity: function (alias, username) {
    const session = sessionsByAlias.get(alias);
    if (session) {
      session.username = username;
    }
  },
};
