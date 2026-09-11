"use strict";

const WRITE_UNAVAILABLE = (
  "Writes (deploy, rollback, constraint deploy) are not in this browser-session "
  + "build yet. Fetch and model listing use your open Salesforce tabs. "
  + "Keep the Python desktop tool for guarded writes until that slice ships."
);

function queryPath(path) {
  const url = new URL(path, "https://cml.local");
  return {
    pathname: url.pathname,
    search: url.searchParams,
  };
}

async function enrichOrgIdentities(orgs) {
  const output = [];
  for (const org of orgs) {
    const session = CmlSession.getSession(org.alias);
    if (!session) {
      continue;
    }
    const identity = await CmlRest.identityForSession(session);
    if (identity.error) {
      org.username = org.username || "";
      org.warning = identity.error;
    } else {
      org.username = identity.username || org.username;
      if (identity.orgId) {
        org.orgId = identity.orgId;
      }
      CmlSession.rememberIdentity(org.alias, org.username);
    }
    output.push({
      alias: org.alias,
      username: org.username || "",
      orgId: org.orgId,
    });
  }
  return output;
}

async function listModels(alias) {
  const session = CmlSession.getSession(alias);
  if (!session) {
    return { error: "That org is not in an open Salesforce tab. Open it in Chrome and retry." };
  }
  const query = (
    "SELECT Id, ExpressionSetDefinition.DeveloperName, "
    + "ExpressionSetDefinition.MasterLabel, VersionNumber, Status "
    + "FROM ExpressionSetDefinitionVersion "
    + "WHERE ExpressionSetDefinitionId IN ("
    + "SELECT ExpressionSetDefinitionId FROM ExpressionSet "
    + "WHERE UsageType = 'Constraint') "
    + "ORDER BY ExpressionSetDefinition.DeveloperName, VersionNumber DESC"
  );
  const result = await CmlRest.queryAll(session.instance, session.token, query);
  if (result.error) {
    return { error: result.error };
  }
  const records = result.records || [];
  const versionIds = records.map(function (record) { return record.Id; }).filter(Boolean);
  let runtimeActive = {};
  let runtimeObserved = {};
  let runtimeWarning = "";
  for (let start = 0; start < versionIds.length; start += 200) {
    const chunk = versionIds.slice(start, start + 200);
    const quoted = chunk.map(function (versionId) {
      return "'" + CmlSessionCore.soqlStr(versionId) + "'";
    }).join(",");
    const runtime = await CmlRest.queryAll(
      session.instance,
      session.token,
      "SELECT ExpressionSetDefinitionVerId, IsActive "
      + "FROM ExpressionSetVersion "
      + "WHERE ExpressionSetDefinitionVerId IN (" + quoted + ")",
    );
    if (runtime.error) {
      runtimeWarning = runtime.error;
      break;
    }
    (runtime.records || []).forEach(function (record) {
      const versionId = record.ExpressionSetDefinitionVerId;
      if (!versionId) {
        return;
      }
      runtimeObserved[versionId] = true;
      runtimeActive[versionId] = Boolean(runtimeActive[versionId] || record.IsActive === true);
    });
  }
  const models = [];
  records.forEach(function (rec) {
    const defn = rec.ExpressionSetDefinition || {};
    const name = defn.DeveloperName;
    if (!name || !rec.Id) {
      return;
    }
    const versionId = rec.Id;
    const definitionStatus = rec.Status;
    let status = definitionStatus;
    let statusBasis = "definition";
    let runtimeStatus = runtimeWarning ? "Unknown" : "Not instantiated";
    if (runtimeObserved[versionId]) {
      status = runtimeActive[versionId] ? "Active" : "Inactive";
      statusBasis = "runtime";
      runtimeStatus = status;
    }
    models.push({
      versionId: versionId,
      name: name,
      label: defn.MasterLabel || name,
      version: rec.VersionNumber,
      status: status,
      statusBasis: statusBasis,
      definitionStatus: definitionStatus,
      runtimeStatus: runtimeStatus,
    });
  });
  const statusRank = { active: 0, inactive: 1 };
  models.sort(function (left, right) {
    const leftKey = String(left.status || "").toLowerCase();
    const rightKey = String(right.status || "").toLowerCase();
    const leftRank = Object.prototype.hasOwnProperty.call(statusRank, leftKey)
      ? statusRank[leftKey] : 2;
    const rightRank = Object.prototype.hasOwnProperty.call(statusRank, rightKey)
      ? statusRank[rightKey] : 2;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    const nameCmp = String(left.name || "").toLowerCase()
      .localeCompare(String(right.name || "").toLowerCase());
    if (nameCmp) {
      return nameCmp;
    }
    return String(right.versionId || "").localeCompare(String(left.versionId || ""));
  });
  const payload = { models: models };
  if (runtimeWarning) {
    payload.runtimeStatusWarning = runtimeWarning;
  }
  return payload;
}

async function resolveExactVersion(alias, model, versionId) {
  const session = CmlSession.getSession(alias);
  if (!session) {
    return { error: "That org is not in an open Salesforce tab." };
  }
  if (!model || !versionId) {
    return { error: "Select an exact version before fetching CML." };
  }
  const soql = (
    "SELECT Id, VersionNumber, Status, "
    + "ExpressionSetDefinition.DeveloperName, "
    + "ExpressionSetDefinition.MasterLabel "
    + "FROM ExpressionSetDefinitionVersion "
    + "WHERE Id = '" + CmlSessionCore.soqlStr(versionId) + "' "
    + "AND ExpressionSetDefinitionId IN ("
    + "SELECT ExpressionSetDefinitionId FROM ExpressionSet "
    + "WHERE UsageType = 'Constraint')"
  );
  const result = await CmlRest.queryAll(session.instance, session.token, soql);
  if (result.error) {
    return { error: result.error };
  }
  const recs = result.records || [];
  if (!recs.length) {
    return {
      error: "Exact Constraint CML version '" + versionId
        + "' was not found in '" + alias + "'.",
    };
  }
  const rec = recs[0];
  const definition = rec.ExpressionSetDefinition || {};
  const observed = definition.DeveloperName;
  if (observed !== model) {
    return {
      error: "Version '" + versionId + "' belongs to model '"
        + (observed || "unknown") + "', not '" + model + "'.",
    };
  }
  return {
    record: {
      Id: rec.Id,
      DeveloperName: observed,
      MasterLabel: definition.MasterLabel || observed,
      VersionNumber: rec.VersionNumber,
      Status: rec.Status,
    },
    session: session,
  };
}

async function fetchCml(alias, model, versionId) {
  const resolved = await resolveExactVersion(alias, model, versionId);
  if (resolved.error) {
    return { ok: false, log: resolved.error };
  }
  const rec = resolved.record;
  const session = resolved.session;
  const log = "==> " + rec.DeveloperName + " (" + rec.Id + ") — Status: " + rec.Status;
  const url = session.instance.replace(/\/$/, "")
    + "/services/data/" + CmlRest.API_VERSION
    + "/sobjects/ExpressionSetDefinitionVersion/" + rec.Id + "/ConstraintModel";
  const downloaded = await CmlRest.restText(url, session.token);
  if (downloaded.error) {
    if (String(downloaded.status) === "404" || /NOT_FOUND/i.test(downloaded.error)) {
      return {
        ok: false,
        content: "",
        empty: true,
        file: "(not saved — browser session)",
        versionId: rec.Id,
        versionNumber: rec.VersionNumber,
        versionStatus: rec.Status,
        log: log + "\n\nThe selected version has an EMPTY Constraint Model.",
      };
    }
    return { ok: false, log: log + "\nCould not download CML:\n" + downloaded.error };
  }
  const content = downloaded.text || "";
  if (!content.trim()) {
    return {
      ok: false,
      content: "",
      empty: true,
      file: "(not saved — browser session)",
      versionId: rec.Id,
      versionNumber: rec.VersionNumber,
      versionStatus: rec.Status,
      log: log + "\n\nThe selected version of '" + model + "' in '" + alias
        + "' has an EMPTY Constraint Model.",
    };
  }
  return {
    ok: true,
    log: log,
    content: content,
    file: "(held in this tab — not written to disk)",
    versionId: rec.Id,
    versionNumber: rec.VersionNumber,
    versionStatus: rec.Status,
  };
}

async function handleCmlApi(message) {
  const method = String(message.method || "GET").toUpperCase();
  const parsed = queryPath(message.path || "/");
  const body = message.body || {};

  if (method === "GET" && parsed.pathname === "/api/ping") {
    const orgs = await CmlSession.listOpenSalesforceSessions();
    return {
      app: "cml-tool",
      version: "1.1.0-browser",
      build: "browser-session",
      mode: "browser-session",
      orgCount: orgs.length,
      localRequestToken: "browser-session",
    };
  }

  if (method === "GET" && parsed.pathname === "/api/orgs") {
    const orgs = await CmlSession.listOpenSalesforceSessions();
    return enrichOrgIdentities(orgs);
  }

  if (method === "GET" && parsed.pathname === "/api/models") {
    return listModels(parsed.search.get("org") || "");
  }

  if (method === "GET" && parsed.pathname === "/api/key-fields") {
    return {
      ok: false,
      fields: [],
      log: "Portable-key discovery ships in a later browser-session slice. Type a field API name if needed.",
    };
  }

  if (method === "GET" && parsed.pathname === "/api/backups") {
    return { ok: true, backups: [] };
  }

  if (method === "POST" && parsed.pathname === "/api/fetch") {
    return fetchCml(body.org, body.model, body.versionId);
  }

  if (method === "POST") {
    return { ok: false, log: WRITE_UNAVAILABLE };
  }

  return { error: "not found" };
}

globalThis.CmlApiRouter = {
  handleCmlApi: handleCmlApi,
};
