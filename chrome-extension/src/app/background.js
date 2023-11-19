/*chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      for (let i = 0; i < details.responseHeaders.length; i++) {
        if (details.responseHeaders[i].name.toLowerCase() === 'content-security-policy') {
          // Modify the CSP header to allow everything
          details.responseHeaders[i].value = "default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * 'unsafe-inline' data:; style-src * 'unsafe-inline';";
        }
      }
      return { responseHeaders: details.responseHeaders };
    },
    { urls: ["<all_urls>"] },
    ["blocking", "responseHeaders"]
);*/
