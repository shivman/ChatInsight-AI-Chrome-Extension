// Store for chat messages and conversation history
let chatHistory = {
  telegram: [],
  whatsapp: []
};

// Store current chat information
let currentChat = {
  platform: null,
  chatId: null,
  title: null
};

// Maximum number of messages to keep in memory
const MAX_HISTORY_LENGTH = 1000;

// Gemini API configuration
const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
let GEMINI_API_KEY = '';

// Load saved chat history and API key
chrome.storage.local.get(['geminiApiKey'], (result) => {
  if (result.geminiApiKey) {
    GEMINI_API_KEY = result.geminiApiKey;
  }
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'newMessage') {
    // Add new message to history
    handleNewMessage(request.data);
    sendResponse({ status: 'success' });
  } else if (request.action === 'analyzeChats') {
    // Generate insight using Gemini
    handleAnalysis(request.data)
      .then(result => sendResponse({ status: 'success', result }))
      .catch(error => sendResponse({ status: 'error', error: error.message }));
    return true; // Required for async response
  } else if (request.action === 'setApiKey') {
    // Update API key
    GEMINI_API_KEY = request.apiKey;
    chrome.storage.local.set({ geminiApiKey: request.apiKey });
    sendResponse({ status: 'success' });
  } else if (request.action === 'setChatContext') {
    // Update current chat context and clear history
    const { platform, chatId, title } = request.data;
    if (currentChat.chatId !== chatId) {
      console.log('Switching to new chat:', request.data);
      currentChat = { platform, chatId, title };
      chatHistory[platform] = []; // Clear history for new chat
    }
    sendResponse({ status: 'success' });
  }
});

// Handle new messages from content scripts
function handleNewMessage(data) {
  const { platform, message, chatId } = data;
  
  // Verify message belongs to current chat
  if (chatId !== currentChat.chatId) {
    console.log('Message from different chat ignored:', message);
    return;
  }

  // Only store messages from today
  const messageDate = new Date(message.timestamp);
  const today = new Date();
  if (messageDate.toDateString() !== today.toDateString()) {
    console.log('Message from different date ignored:', message);
    return;
  }
  
  // Avoid duplicate messages
  const isDuplicate = chatHistory[platform].some(m => m.id === message.id);
  if (isDuplicate) {
    console.log('Duplicate message ignored:', message);
    return;
  }

  chatHistory[platform].push(message);
  console.log(`Added message to ${platform} history:`, message);

  // Trim history if it exceeds maximum length
  if (chatHistory[platform].length > MAX_HISTORY_LENGTH) {
    chatHistory[platform] = chatHistory[platform].slice(-MAX_HISTORY_LENGTH);
  }
}

// Generate insight using Gemini API
async function handleAnalysis(data) {
  if (!GEMINI_API_KEY) {
    throw new Error('Please set your Gemini API key in the extension settings');
  }

  const { prompt, platform } = data;
  const relevantHistory = chatHistory[platform];

  if (!relevantHistory || relevantHistory.length === 0) {
    throw new Error(`No messages available for analysis in current chat: ${currentChat.title}. Please wait for some messages to be captured.`);
  }

  console.log(`Analyzing ${relevantHistory.length} messages from ${currentChat.title} (${platform})`);

  // Format chat history for the prompt
  const chatContext = relevantHistory
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(msg => `[${new Date(msg.timestamp).toLocaleTimeString()}] ${msg.sender}: ${msg.text}`)
    .join('\n');

  const promptText = `Given these chat messages from "${currentChat.title}" for today (${new Date().toLocaleDateString()}):\n\n${chatContext}\n\nTask: ${prompt}\n\nProvide a clear and concise response. If there are no relevant items matching the task, please indicate that.`;

  // Call Gemini API
  try {
    console.log('Sending request to Gemini API');

    const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: promptText
          }]
        }]
      })
    });

    console.log('Response status:', response.status);
    const responseText = await response.text();
    console.log('Raw response:', responseText);

    if (!response.ok) {
      let errorMessage = 'Failed to get response from Gemini API';
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        console.error('Failed to parse error response:', e);
      }
      throw new Error(errorMessage);
    }

    const result = JSON.parse(responseText);
    if (!result.candidates || !result.candidates[0]?.content?.parts?.[0]?.text) {
      throw new Error('Invalid response format from Gemini API');
    }

    return result.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Gemini API error:', error);
    if (error.message.includes('API key')) {
      throw new Error('Invalid API key. Please check your Gemini API key and try again.');
    }
    throw new Error(`Failed to generate insight: ${error.message}`);
  }
} 