/*!
 * Chrome Extension Boilerplate - Runtime 1.0
 * https://github.com/williankeller/chrome-extension-boilerplate/blob/master/src/utils/runtime.js
 * Copyright 2017 "Chrome Extension Boilerplate"
 * Licensed under MIT
 */

// Function to modify the query parameter
function modifyQueryParameters(url) {
  let newUrl = new URL(url);
  newUrl.searchParams.set("limit", "1"); // Change the 'limit' parameter
  return newUrl.href;
}

// Listener to modify the request URL
chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    return { redirectUrl: modifyQueryParameters(details.url) };
  },
  { urls: ["https://chat.openai.com/backend-api/conversations*"] },
  ["blocking"]
);

// Listener to modify the response body
chrome.webRequest.onHeadersReceived.addListener(
  function (details) {
    if (details.responseHeaders) {
      for (var i = 0; i < details.responseHeaders.length; ++i) {
        if (
          details.responseHeaders[i].name.toLowerCase() ===
          "content-security-policy"
        ) {
          details.responseHeaders.splice(i, 1);
          break;
        }
      }
    }
    return { responseHeaders: details.responseHeaders };
  },
  { urls: ["<all_urls>"] },
  ["blocking", "responseHeaders"]
);

/**
 * Define browser runtime API settings.
 * @type Class
 */
export class Runtime {
  /**
   * Find the right request API to instance as object.
   *
   * @param {String} api
   * @returns {Runtime.api.extension}
   */
  api(method) {
    try {
      if (chrome[method]) {
        return chrome[method];
      }
    } catch (e) {}

    // Try to request as Window.
    try {
      if (window[method]) {
        return window[method];
      }
    } catch (e) {}

    // Try to request as Browser.
    try {
      if (browser[method]) {
        return browser[method];
      }
    } catch (e) {}

    // Try to request as extension in browser.
    try {
      return browser.extension[method];
    } catch (e) {}
  }
}

export const runtime = new Runtime();
