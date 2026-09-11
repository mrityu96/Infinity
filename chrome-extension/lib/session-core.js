(function (root) {
  "use strict";

  var API_VERSION = "v66.0";
  var COOKIE_SEARCH_DOMAINS = [
    "salesforce.com",
    "cloudforce.com",
    "salesforce.mil",
    "cloudforce.mil",
    "sfcrmproducts.cn",
    "force.com",
  ];
  var TAB_URL_PATTERNS = [
    "https://*.salesforce.com/*",
    "https://*.force.com/*",
    "https://*.cloudforce.com/*",
    "https://*.salesforce-setup.com/*",
    "https://*.salesforce.mil/*",
    "https://*.cloudforce.mil/*",
    "https://*.sfcrmapps.cn/*",
    "https://*.sfcrmproducts.cn/*",
  ];
  var BLOCKED_HOSTS = {
    "login.salesforce.com": true,
    "test.salesforce.com": true,
    "help.salesforce.com": true,
    "www.salesforce.com": true,
    "developer.salesforce.com": true,
    "trailhead.salesforce.com": true,
    "status.salesforce.com": true,
  };

  function cookieHostname(domain) {
    return String(domain || "").replace(/^\./, "").toLowerCase();
  }

  function orgIdFromSid(sid) {
    var value = String(sid || "");
    var bang = value.indexOf("!");
    if (bang < 8) {
      return "";
    }
    return value.slice(0, bang);
  }

  function isSalesforcePageUrl(urlString) {
    var parsed;
    try {
      parsed = new URL(urlString);
    } catch (_) {
      return false;
    }
    if (parsed.protocol !== "https:") {
      return false;
    }
    var host = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTS[host]) {
      return false;
    }
    return (
      host.endsWith(".lightning.force.com")
      || host.endsWith(".my.salesforce.com")
      || host.endsWith(".my.salesforce-setup.com")
      || host.endsWith(".cloudforce.com")
      || host.endsWith(".visual.force.com")
      || host.endsWith(".vf.force.com")
      || host.endsWith(".lightning.force.com.mil")
      || host.endsWith(".my.salesforce.mil")
      || host.endsWith(".sfcrmapps.cn")
      || host.endsWith(".sfcrmproducts.cn")
      || (host.endsWith(".salesforce.com") && host.split(".").length >= 3)
    );
  }

  function isApiUsableCookieDomain(domain) {
    var host = cookieHostname(domain);
    if (!host) {
      return false;
    }
    if (host.indexOf("lightning.force.com") !== -1) {
      return false;
    }
    if (host.indexOf("visual.force.com") !== -1 || host.indexOf("vf.force.com") !== -1) {
      return false;
    }
    if (host.indexOf("salesforce-setup.com") !== -1) {
      return false;
    }
    if (host === "help.salesforce.com" || host.endsWith(".help.salesforce.com")) {
      return false;
    }
    if (host.endsWith(".my.salesforce.com") || host.endsWith(".my.salesforce.mil")) {
      return true;
    }
    if (host.endsWith(".cloudforce.com") || host.endsWith(".cloudforce.mil")) {
      return true;
    }
    if (host.endsWith(".sfcrmproducts.cn") || host.endsWith(".sfcrmapps.cn")) {
      return true;
    }
    if (host.endsWith(".salesforce.com") && host.split(".").length >= 3) {
      return true;
    }
    return false;
  }

  function apiHostScore(domain) {
    var host = cookieHostname(domain);
    if (host.indexOf(".my.salesforce.com") !== -1 || host.indexOf(".my.salesforce.mil") !== -1) {
      return 3;
    }
    if (host.endsWith(".cloudforce.com") || host.endsWith(".cloudforce.mil")) {
      return 2;
    }
    if (host.endsWith(".salesforce.com")) {
      return 1;
    }
    return 0;
  }

  function pickApiCookie(cookies, orgId) {
    var prefix = orgId + "!";
    var best = null;
    var bestScore = -1;
    (cookies || []).forEach(function (cookie) {
      if (!cookie || !cookie.value || cookie.value.indexOf(prefix) !== 0) {
        return;
      }
      if (!isApiUsableCookieDomain(cookie.domain)) {
        return;
      }
      var score = apiHostScore(cookie.domain);
      if (score > bestScore) {
        best = cookie;
        bestScore = score;
      }
    });
    return best;
  }

  function classicApiHostFromPageHost(hostname) {
    var host = cookieHostname(hostname);
    var replacements = [
      [".sandbox.lightning.force.com", ".sandbox.my.salesforce.com"],
      [".develop.lightning.force.com", ".develop.my.salesforce.com"],
      [".scratch.lightning.force.com", ".scratch.my.salesforce.com"],
      [".lightning.force.com", ".my.salesforce.com"],
      [".my.salesforce-setup.com", ".my.salesforce.com"],
    ];
    for (var i = 0; i < replacements.length; i += 1) {
      var from = replacements[i][0];
      var to = replacements[i][1];
      if (host.endsWith(from) && host.length > from.length) {
        return host.slice(0, -from.length) + to;
      }
    }
    if (isApiUsableCookieDomain(host)) {
      return host;
    }
    return "";
  }

  function aliasFromHostname(hostname) {
    var host = cookieHostname(hostname);
    var suffixes = [
      ".sandbox.lightning.force.com",
      ".develop.lightning.force.com",
      ".scratch.lightning.force.com",
      ".sandbox.my.salesforce.com",
      ".develop.my.salesforce.com",
      ".scratch.my.salesforce.com",
      ".lightning.force.com",
      ".my.salesforce-setup.com",
      ".my.salesforce.com",
      ".my.salesforce.mil",
      ".cloudforce.com",
      ".salesforce.com",
    ];
    for (var i = 0; i < suffixes.length; i += 1) {
      var suffix = suffixes[i];
      if (host.endsWith(suffix) && host.length > suffix.length) {
        return host.slice(0, -suffix.length);
      }
    }
    return host || "salesforce";
  }

  function instanceUrlFromHostname(hostname) {
    return "https://" + cookieHostname(hostname);
  }

  function soqlStr(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  var api = {
    API_VERSION: API_VERSION,
    COOKIE_SEARCH_DOMAINS: COOKIE_SEARCH_DOMAINS,
    TAB_URL_PATTERNS: TAB_URL_PATTERNS,
    cookieHostname: cookieHostname,
    orgIdFromSid: orgIdFromSid,
    isSalesforcePageUrl: isSalesforcePageUrl,
    isApiUsableCookieDomain: isApiUsableCookieDomain,
    apiHostScore: apiHostScore,
    pickApiCookie: pickApiCookie,
    classicApiHostFromPageHost: classicApiHostFromPageHost,
    aliasFromHostname: aliasFromHostname,
    instanceUrlFromHostname: instanceUrlFromHostname,
    soqlStr: soqlStr,
  };

  root.CmlSessionCore = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
