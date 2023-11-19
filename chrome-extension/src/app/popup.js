console.log("Popup intialized");

function sendToContentScript(tabId, data) {
  chrome.tabs.sendMessage(tabId, { type: "FROM_POPUP", data: data });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FROM_CONTENT") {
    // Handle the received data (e.g., display subuser_names)
    console.log("Received from content script:", message.data);
  }
});
