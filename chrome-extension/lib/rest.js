"use strict";

const API_VERSION = globalThis.CmlSessionCore.API_VERSION;

function redact(text) {
  return String(text || "").replace(
    /\b[A-Za-z0-9]{8,}![A-Za-z0-9._~+/\-=]{8,}\b/g,
    "[REDACTED]",
  );
}

async function rest(method, url, token, body) {
  const headers = {
    Authorization: "Bearer " + token,
    Accept: "application/json",
  };
  const options = { method: method, headers: headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    return { error: redact(error && error.message ? error.message : String(error)) };
  }
  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      parsed = null;
    }
  }
  if (!response.ok) {
    const message = parsed && (parsed[0] && parsed[0].message || parsed.message)
      ? (parsed[0] && parsed[0].message) || parsed.message
      : text.slice(0, 500);
    return {
      error: redact(message || ("Salesforce HTTP " + response.status)),
      status: response.status,
    };
  }
  return { data: parsed, text: text };
}

async function restText(url, token) {
  const result = await rest("GET", url, token);
  if (result.error) {
    return result;
  }
  if (typeof result.data === "string") {
    return { text: result.data };
  }
  if (result.data && typeof result.data.ConstraintModel === "string") {
    return { text: result.data.ConstraintModel };
  }
  return { text: result.text || "" };
}

async function queryAll(instance, token, soql) {
  const records = [];
  let url = instance.replace(/\/$/, "")
    + "/services/data/" + API_VERSION
    + "/query?q=" + encodeURIComponent(soql);
  for (let guard = 0; url && guard < 2000; guard += 1) {
    const result = await rest("GET", url, token);
    if (result.error) {
      return { error: result.error };
    }
    const data = result.data || {};
    records.push.apply(records, data.records || []);
    url = data.nextRecordsUrl
      ? instance.replace(/\/$/, "") + data.nextRecordsUrl
      : "";
  }
  return { records: records };
}

async function identityForSession(session) {
  const root = session.instance.replace(/\/$/, "");
  const versions = await rest(
    "GET",
    root + "/services/data/" + API_VERSION + "/",
    session.token,
  );
  if (!versions.error && versions.data && versions.data.identity) {
    const identity = await rest("GET", versions.data.identity, session.token);
    if (!identity.error && identity.data) {
      const payload = identity.data;
      return {
        username: payload.username || payload.preferred_username || "",
        orgId: payload.organization_id || session.orgId,
        displayName: payload.display_name || "",
      };
    }
  }
  const userinfo = await rest(
    "GET",
    root + "/services/oauth2/userinfo",
    session.token,
  );
  if (userinfo.error) {
    return { error: versions.error || userinfo.error };
  }
  const payload = userinfo.data || {};
  return {
    username: payload.preferred_username || payload.username || "",
    orgId: payload.organization_id || session.orgId,
    displayName: payload.name || "",
  };
}

globalThis.CmlRest = {
  rest: rest,
  restText: restText,
  queryAll: queryAll,
  identityForSession: identityForSession,
  API_VERSION: API_VERSION,
};
