const originalFetch = window.fetch

const CHATGPT_URL_REGEX = /^https:\/\/chat\.openai\.com\/.*$/
const CONVERSATIONS_LIST_URL_REGEX =
    /https:\/\/chat\.openai\.com\/backend-api\/conversations(\/|\?).*/
const AUTH_SESSION_URL_REGEX =
    /^https:\/\/chat\.openai\.com\/api\/auth\/session$/
const CONVERSATION_MESSAGE_SENT_URL_REGEX =
    /https:\/\/chat\.openai\.com\/backend-api\/conversation$/

const CONTENT_STORE_MESSAGE_ID = 'aaa2d765-faf9-4f78-8732-fc6b7612fd45'
const CONTENT_STORE_PARENT_MESSAGE_ID = 'd95b6819-38e9-498b-8a9e-27fe99a1edd5'

let ALLOWED_CONVERSATION_IDS = [
  '3271ffc2-d97d-43ac-af05-a88e52413dc9',
  'e4f251aa-1f95-477b-9e95-171ced08d4d7'
]
const STORE_CHAT_TITLE = 'Chat for storing some notes'

const interceptedAuthHeaders = []
const interceptedConversationIds = []

function overrideJsonParse (response, callback) {
  console.log('Overriding JSON parse function', response.url)

  response.realJson = response.json

  response.json = async function () {
    // Read and modify the response body
    const responseBody = await response.realJson()
    return callback(responseBody)
  }
}

async function retrieveAllowedConversationIds () {
  const savedAllowedConversationIds = await getContentStore()

  if (Array.isArray(savedAllowedConversationIds)) {
    // Merge existing conversation ids with the new ones, and remove duplicates
    ALLOWED_CONVERSATION_IDS = ALLOWED_CONVERSATION_IDS.concat(
      savedAllowedConversationIds
    )
  } else {
    console.error(
      'Content store is not an array but ',
      savedAllowedConversationIds
    )
  }
}

let addAllowedConversationIdQueue = Promise.resolve();
async function addAllowedConversationId (id) {
  addAllowedConversationIdQueue = addAllowedConversationIdQueue.then(async () => {
    if (!ALLOWED_CONVERSATION_IDS.includes(id)) {
      ALLOWED_CONVERSATION_IDS.push(id);

      await modifyContentStoreChatMessage(ALLOWED_CONVERSATION_IDS);
    }
  });

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

async function fetchContentStoreConversationId () {
  const authHeader = getAuthHeader();

  if(authHeader === null) {
    throw new Error("Cannot fetch content store conversation id because we dont have an auth header");
  }

  for (let offset = 0; offset < 400 && getContentStoreChatId() == null;) {
    console.log(`Listing all conversations to find content store one. Offset: ${offset}`)

    const response = await originalFetch(`https://chat.openai.com/backend-api/conversations?offset=${offset}&limit=100&order=updated`, {
      headers: {
        'Authorization': authHeader,
      }
    })
    const body = await response.json()

    body.items.forEach((item) => {
      offset++;
      interceptedConversationIds.push([item.title, item.id])
    })

    if(body.items.length === 0) {
      console.log(`Stopping at offset ${offset} because there are no more chats to search. The content store chat doesnt exist yet`)
      break;
    }
  }

  return getContentStoreChatId()
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
        overrideJsonParse(response, async (body) => {
          try {
            body.items.forEach((item) => {
              interceptedConversationIds.push([item.title, item.id])
            })

            await fetchContentStoreConversationId()
            await retrieveAllowedConversationIds()
          } catch (e) {
            console.error(e)
          }

          return filterConversationsList(body)
        })
      }

      if (CONVERSATION_MESSAGE_SENT_URL_REGEX.test(url)) {
        const responseText = await response.clone().text()
        const conversationId =
          extractConversationIdFromEventStream(responseText)

        if(conversationId !== getContentStoreChatId()) {
          addAllowedConversationId(conversationId).catch((err) => {
            console.error(`Failed to add allowed conversation id due to ${err}`)
          })
        }
      }
    }

    return response
  }

  console.log('Fetch function overridden')
}

// Function to modify the response
function filterConversationsList (response) {
  response.items = response.items.filter((item) =>
    ALLOWED_CONVERSATION_IDS.includes(item.id)
  )
  return response
}

async function renameConversation (id, title) {
  await window.fetch('https://chat.openai.com/backend-api/conversation/' + id, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getAuthHeader()
    },
    body: JSON.stringify({
      title
    })
  })
}

function getContentStoreChatId () {
  return (
    interceptedConversationIds
      .filter(([title, _]) => title === STORE_CHAT_TITLE)
      .map(([_, id]) => id)[0] || null
  )
}

function getAuthHeader () {
  if (interceptedAuthHeaders.length === 0) {
    return null
  }

  return interceptedAuthHeaders.at(-1)
}

async function getContentStore () {
  const conversationId = getContentStoreChatId()
  const authHeader = getAuthHeader()

  if (conversationId === null) {
    throw new Error(
      'Cannot get content store since we do not have the id of the chat to use yet'
    )
  }
  if (authHeader === null) {
    throw new Error(
      'Cannot get content store since we do not have the auth header yet'
    )
  }

  const response = await window.fetch(
    'https://chat.openai.com/backend-api/conversation/' + conversationId,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader
      }
    }
  )

  const json = await response.json()

  const contentStoreMessage = json.mapping[CONTENT_STORE_MESSAGE_ID]
  if (contentStoreMessage === undefined) {
    throw new Error('Content store message not found in API response')
  }

  return JSON.parse(atob(contentStoreMessage.message.content.parts[0]))
}

async function modifyContentStoreChatMessage (message) {
  try {
    console.log('Current content store message: ', await getContentStore())
  } catch (e) {
    console.error('Failed to get content store message', e)
  }

  const previousConversationId = await fetchContentStoreConversationId();
  const authHeader = getAuthHeader();

  if (authHeader === null) {
    throw new Error(
      'No auth headers intercepted, cannot modify content store chat message'
    )
  }

  const response = await window.fetch(
    'https://chat.openai.com/backend-api/conversation',
    {
      headers: {
        accept: 'text/event-stream',
        'accept-language': 'en-US',
        authorization: getAuthHeader(),
        'content-type': 'application/json',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin'
      },
      referrerPolicy: 'same-origin',
      body: JSON.stringify({
        action: 'next',
        messages: [
          {
            id: CONTENT_STORE_MESSAGE_ID,
            author: {
              role: 'user'
            },
            content: {
              content_type: 'text',
              parts: [
                btoa(JSON.stringify(message)),
                "I'm leaving this here for now. I'll come back to it later. Just respond with any empty string. Nothing else. I dont want to waste your resources."
              ]
            }
          }
        ],
        conversation_id: previousConversationId,
        parent_message_id: CONTENT_STORE_PARENT_MESSAGE_ID,
        model: 'text-davinci-002-render-sha',
        timezone_offset_min: -60,
        history_and_training_disabled: false,
        arkose_token: null,
        conversation_mode: {
          kind: 'primary_assistant'
        },
        force_paragen: false,
        force_rate_limit: false
      }),
      method: 'POST',
      mode: 'cors',
      credentials: 'include'
    }
  )

  console.log(`Modified content store NewState: ${message}`)

  if (!previousConversationId) {
    try {
      console.log("Renaming content store conversation because it was first created");
      const responseText = await response.text()

      const conversationId = extractConversationIdFromEventStream(responseText)

      if (conversationId) {
        interceptedConversationIds.push([STORE_CHAT_TITLE, conversationId.conversation_id]);

        await renameConversation(
          conversationId.conversation_id,
          STORE_CHAT_TITLE
        )
      } else {
        throw new Error('Failed to find conversation id in response')
      }
    } catch (e) {
      console.error('Failed to modify content store chat title', e)
    }
  }
}

overrideFetch()
