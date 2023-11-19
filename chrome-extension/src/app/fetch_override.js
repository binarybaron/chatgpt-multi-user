const originalFetch = window.fetch

const CHATGPT_URL_REGEX = /^https:\/\/chat\.openai\.com\/.*$/
const CONVERSATIONS_LIST_URL_REGEX =
    /https:\/\/chat\.openai\.com\/backend-api\/conversations(\/|\?).*/
const AUTH_SESSION_URL_REGEX =
    /^https:\/\/chat\.openai\.com\/api\/auth\/session$/
const CONVERSATION_MESSAGE_SENT_URL_REGEX =
    /https:\/\/chat\.openai\.com\/backend-api\/conversation$/

const ANYONE_SUBUSER_NAME = "Anyone"

let currentSubuserName = localStorage.getItem("subuser") || ANYONE_SUBUSER_NAME

let conversationMappings = []
const interceptedAuthHeaders = []
const interceptedSessions = []

function overrideJsonParse (response, callback) {
  console.log('Overriding JSON parse function', response.url)

  response.realJson = response.json

  response.json = async function () {
    // Read and modify the response body
    const responseBody = await response.realJson()
    return callback(responseBody)
  }
}

function changeSubuser(newOne) {
  // Save to local storage
  console.log(`Updating subuser to ${newOne}`)
  currentSubuserName = newOne;
  localStorage.setItem("subuser", currentSubuserName);
  window.location.reload();
}

async function deleteSubuser(subuserName) {
  const userId = getUserId()

  await fetch("http://localhost:3000/delete-subuser", {
    method: "POST",
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: userId,
      subuser_name: subuserName,
    })
  })

  if(currentSubuserName === subuserName) {
    changeSubuser(ANYONE_SUBUSER_NAME)
  }else {
    window.location.reload();
  }
}

function getUserId() {
  if(interceptedSessions.length === 0) {
    throw new Error("No session was intercepted yet. Cannot get user id");
  }
  const interceptedSession = interceptedSessions.at(-1);
  return interceptedSession.user.id;
}


async function retrieveConversationMappings () {
  const userId = getUserId();

  const response = await fetch(`http://localhost:3000/get-mappings?user_id=${userId}`);
  return response.json()
}

let addAllowedConversationIdQueue = Promise.resolve();
async function addAllowedConversationId (id, subuser_name) {
  addAllowedConversationIdQueue = addAllowedConversationIdQueue.then(async () => {
    console.log(`Mapping conversation id ${id} to ${subuser_name}`)

    const userId = getUserId();

    const response = await fetch(`http://localhost:3000/assign-conversation`, {
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        subuser_name: subuser_name,
        conversation_id: id
      })
    });

    const responseJson = await response.json();

    conversationMappings = await retrieveConversationMappings();

    return responseJson.filter(([, s]) => s === subuser_name).map(([conv_id, _]) => conv_id)
  })
  return addAllowedConversationIdQueue;
}

function extractConversationIdFromEventStream (body) {
  for (let objString of body.split('\n')) {
    try {
      const obj = JSON.parse(objString.replace('data: ', '').trim())
      if ('conversation_id' in obj) {
        return obj.conversation_id
      }
    } catch (e) {}
  }
}

function overrideFetch () {
  // Save the original fetch function

  // Override the fetch function
  window.fetch = async function (...args) {
    let url = args[0].toString()

    // Override the limit parameter of conversation list such that we get more conversations
    if (CONVERSATIONS_LIST_URL_REGEX.test(url)) {
      const parsedUrl = new URL(url)
      parsedUrl.searchParams.set('limit', '100')

      url = parsedUrl.toString()

      args[0] = url
    }

    // Call the original fetch function and get the response
    const response = await originalFetch.apply(this, args)

    url = response.url;

    if (CHATGPT_URL_REGEX.test(url)) {
      // Intercept the authentication header if present
      if (args[1]) {
        const authHeader = args[1].headers['Authorization']
        if (authHeader) {
          interceptedAuthHeaders.push(authHeader)
        }
      }
    }

    if (response.status >= 200 && response.status <= 299) {
      if (CONVERSATIONS_LIST_URL_REGEX.test(url)) {
        try {
          conversationMappings = await retrieveConversationMappings(currentSubuserName);
        }catch (e) {
          console.error(`Conversations were not filtered correctly because mapping could not be retrieved due to ${e}`)
        }

        overrideJsonParse(response, async (body) => {
          return filterConversationsList(body)
        })
      }

      if (CONVERSATION_MESSAGE_SENT_URL_REGEX.test(url)) {
        const responseText = await response.clone().text()
        const conversationId =
          extractConversationIdFromEventStream(responseText)

        addAllowedConversationId(conversationId, currentSubuserName).catch((err) => {
          console.error(`Failed to add allowed conversation id due to ${err}`)
        })
      }

      if(AUTH_SESSION_URL_REGEX.test(url)) {
        const jsonBody = await response.clone().json();
        console.log(`Got session ${jsonBody}`)
        interceptedSessions.push(jsonBody);
      }
    }

    return response
  }

  console.log('Fetch function overridden')
}

// Function to modify the response
function filterConversationsList (response) {
  if(currentSubuserName === ANYONE_SUBUSER_NAME) {
    return response;
  }

  response.items = response.items.filter((item) => {
    return conversationMappings.some(mapping => mapping.conversation_id === item.id && mapping.subuser_name === currentSubuserName)
  })

  response.total = response.offset + response.items.length;

  return response
}

function getAuthHeader () {
  if (interceptedAuthHeaders.length === 0) {
    return null
  }

  return interceptedAuthHeaders.at(-1)
}

overrideFetch()

async function createOverlay() {
  conversationMappings = await retrieveConversationMappings();

  // Create a container for the overlay
  const overlay = document.createElement('div');
  overlay.id = 'myExtensionOverlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '10px';
  overlay.style.right = '10px';
  overlay.style.zIndex = '1000';
  overlay.style.backgroundColor = 'black';
  overlay.style.padding = '20px';
  overlay.style.border = '1px solid black';
  overlay.style.borderRadius = '5px';

  // Create an input field
  const inputField = document.createElement('input');
  inputField.type = 'text';
  inputField.style.color = "black";
  inputField.placeholder = 'Enter a new subuser name to create...';
  overlay.appendChild(inputField);

  // Create a button
  const applyButton = document.createElement('button');
  applyButton.textContent = 'Create';
  applyButton.style.marginLeft = '10px';
  overlay.appendChild(applyButton);

  const presetsDiv = document.createElement('div');
  presetsDiv.style.marginTop = '10px';
  overlay.appendChild(presetsDiv);

  // Create elements for each preset username
  [ANYONE_SUBUSER_NAME, ...conversationMappings.map(m => m.subuser_name), currentSubuserName].filter((item, index, self) => self.indexOf(item) === index).forEach(username => {
    const usernameElement = document.createElement('div');
    const usernameTextElement = document.createElement('span');
    const usernameDeleteElement = document.createElement('span');

    usernameElement.style.marginTop = '5px';
    usernameElement.style.display = 'flex';
    usernameElement.style.gap = '5px';
    usernameElement.style.cursor = 'pointer';

    usernameTextElement.textContent = username;
    usernameDeleteElement.textContent = "❌"

    if(username === currentSubuserName) {
      usernameElement.style.color = 'red';
    }

    usernameElement.appendChild(usernameTextElement)
    if(username !== ANYONE_SUBUSER_NAME) {
      usernameElement.appendChild(usernameDeleteElement)
    }

    presetsDiv.appendChild(usernameElement);


    // Add click event listener for each username
    usernameTextElement.addEventListener('click', () => {
      changeSubuser(username)
    });

    usernameDeleteElement.addEventListener('click', () => {
      deleteSubuser(username)
    });
  });

  // Append the overlay to the body
  document.body.appendChild(overlay);

  // Add an event listener to the button
  applyButton.addEventListener('click', () => {
    const inputValue = inputField.value.trim().toLowerCase();

    if(inputValue.length > 0) {
      changeSubuser(inputValue)
    }
  });

  console.log(`Successfully created overlay`)
}

async function waitUntilOverlayCanBeCreated() {
  try {
    await createOverlay()
  }catch (e) {
    console.log(`Failed to create overlday due to ${e}. Retrying in 250ms...`)
    setTimeout(waitUntilOverlayCanBeCreated, 250)
  }
}

waitUntilOverlayCanBeCreated()