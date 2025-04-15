// Track processed messages and current chat
const processedMessages = new Set();
let currentChatId = null;
let observerInstance = null;
let messageProcessingInProgress = false;
let initializationAttempts = 0;
let lastUrl = window.location.href;
const MAX_INIT_RETRIES = 15;
const INIT_RETRY_DELAY = 2000;
const CHAT_LOAD_TIMEOUT = 5000;
let isInitializing = false;
let messageQueue = [];
let isProcessingQueue = false;
let contextCheckInProgress = false;
let extensionInitialized = false;

// Track initialization state with more detail
const initializationState = {
  contextValid: false,
  interfaceLoaded: false,
  observerInitialized: false,
  backgroundConnected: false,
  extensionIdValidated: false,
  lastError: null,
  retryCount: 0
};

// Configuration for the message observer
const observerConfig = {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true
};

// Enhanced message detection selectors
const MESSAGE_SELECTORS = {
  container: [
    '[data-testid="conversation-panel-messages"]',
    '#main div[data-tab="6"]',
    '#main div[data-tab="7"]',
    '#main div[data-tab="8"]',
    '.copyable-area',
    '[role="application"]'
  ],
  message: [
    '[data-testid="msg-container"]',
    '.message',
    '.msg',
    '[role="row"]',
    '.focusable-list-item',
    '.message-in, .message-out'
  ],
  text: [
    '.selectable-text',
    '[data-pre-plain-text]',
    '.copyable-text',
    '.message-text'
  ],
  timestamp: [
    '[data-pre-plain-text]',
    '.copyable-text',
    '[data-timestamp]',
    '.message-datetime'
  ]
};

// Enhanced extension context validation
async function validateExtensionContext(maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Basic API check
      if (typeof chrome === 'undefined') {
        throw new Error('Chrome API not available');
      }

      // Runtime check
      if (!chrome.runtime) {
        throw new Error('Chrome runtime not available');
      }

      // Extension ID check
      const extensionId = chrome.runtime.id;
      if (!extensionId) {
        throw new Error('Extension ID not available');
      }

      // Test message passing
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Context validation timeout')), 3000);
        try {
          chrome.runtime.sendMessage({ action: 'validateContext' }, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        } catch (e) {
          clearTimeout(timeout);
          reject(e);
        }
      });

      if (response?.status === 'ok') {
        console.log('Extension context validated successfully');
        return true;
      }

      throw new Error('Invalid context validation response');
    } catch (error) {
      console.warn(`Context validation attempt ${attempt + 1}/${maxAttempts} failed:`, error);
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  return false;
}

// Ensure extension is ready with improved validation
async function ensureExtensionReady(maxAttempts = 10) {
  initializationState.retryCount = 0;
  
  try {
    // Initial context validation
    const contextValid = await validateExtensionContext(3);
    if (!contextValid) {
      throw new Error('Initial context validation failed');
    }

    // Wait for chrome API to be fully initialized
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Chrome API initialization timeout')), 5000);
      
      const checkAPI = () => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
          clearTimeout(timeout);
          resolve();
        }
      };

      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        clearTimeout(timeout);
        resolve();
      } else {
        const interval = setInterval(() => {
          checkAPI();
          initializationState.retryCount++;
          
          if (initializationState.retryCount >= maxAttempts) {
            clearInterval(interval);
            clearTimeout(timeout);
            reject(new Error('Max retry attempts reached'));
          }
        }, 500);

        // Cleanup on timeout
        timeout.onTimeout = () => {
          clearInterval(interval);
        };
      }
    });

    // Validate extension state
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Check runtime state
        if (!chrome.runtime || !chrome.runtime.id) {
          throw new Error('Runtime not available');
        }

        // Verify message passing
        const response = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Message timeout')), 5000);
          
          try {
            chrome.runtime.sendMessage({ action: 'ping' }, response => {
              clearTimeout(timeout);
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            });
          } catch (e) {
            clearTimeout(timeout);
            reject(e);
          }
        });

        if (response?.status === 'ok') {
          initializationState.contextValid = true;
          initializationState.backgroundConnected = true;
          console.log('Extension fully initialized');
          return true;
        }

        throw new Error('Invalid ping response');
      } catch (error) {
        initializationState.lastError = error;
        console.warn(`Validation attempt ${attempt + 1}/${maxAttempts} failed:`, error);
        
        if (attempt < maxAttempts - 1) {
          // Exponential backoff with max delay of 5 seconds
          const delay = Math.min(1000 * Math.pow(1.5, attempt), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Revalidate context before continuing
          const contextValid = await validateExtensionContext(2);
          if (!contextValid) {
            throw new Error('Extension context invalidated during retry');
          }
        }
      }
    }

    throw new Error('Extension validation failed after all attempts');
  } catch (error) {
    initializationState.lastError = error;
    initializationState.contextValid = false;
    console.error('Extension initialization failed:', error);
    return false;
  }
}

// Initialize with proper context handling
async function initialize(retryCount = 0) {
  if (retryCount >= 5) {
    console.error('Max initialization retries reached');
    return false;
  }

  try {
    // Reset state
    initializationState.contextValid = false;
    initializationState.backgroundConnected = false;
    
    // Ensure extension is ready
    const ready = await ensureExtensionReady();
    if (!ready) {
      throw new Error('Extension not ready');
    }

    // Initialize observer if ready
    if (window.location.href.includes('web.whatsapp.com')) {
      return await initializeWhatsAppObserver();
    }

    return true;
  } catch (error) {
    console.error('Initialization failed:', error);
    
    // Retry with backoff
    const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    return initialize(retryCount + 1);
  }
}

// Start initialization
if (document.readyState === 'complete') {
  initialize();
} else {
  window.addEventListener('load', initialize);
}

// Validate extension ID with proper timing
async function validateExtensionId(maxAttempts = 5) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Ensure chrome API is available
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        throw new Error('Chrome runtime not available');
      }

      // Try to get the extension ID
      const id = await new Promise((resolve, reject) => {
        try {
          // Add a small delay before checking ID
          setTimeout(() => {
            try {
              const extensionId = chrome.runtime.id;
              if (!extensionId) {
                reject(new Error('Extension ID is empty'));
              } else {
                resolve(extensionId);
              }
            } catch (e) {
              reject(e);
            }
          }, 100);
        } catch (e) {
          reject(e);
        }
      });

      // Validate ID format
      if (!id || !/^[a-zA-Z0-9]{32}$/.test(id)) {
        throw new Error('Invalid extension ID format');
      }

      return id;
    } catch (error) {
      console.warn(`Extension ID validation attempt ${i + 1}/${maxAttempts} failed:`, error);
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  throw new Error('Failed to validate extension ID after all attempts');
}

// Utility functions
function getCurrentDate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function getDateFromTimestamp(timestamp) {
  return new Date(timestamp).toISOString().split('T')[0];
}

function clearMessageCache() {
  processedMessages.clear();
  console.log('Message cache cleared');
}

// Enhanced WhatsApp interface detection
async function waitForWhatsAppInterface(maxAttempts = 15) { // Increased attempts
  const selectors = [
    // Main app container
    '#app',
    '.app',
    '[data-testid="whatsapp"]',
    // Chat interface elements
    '#main',
    '[data-testid="conversation-panel-wrapper"]',
    // Loading indicators
    '[data-testid="intro-text"]',
    '[data-testid="loading-screen"]'
  ];

  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Check for main container
      const mainContainer = document.querySelector(selectors.join(','));
      if (mainContainer) {
        // Wait for loading screen to disappear
        const loadingScreen = document.querySelector('[data-testid="loading-screen"]');
        if (!loadingScreen || loadingScreen.style.display === 'none') {
          console.log('WhatsApp interface detected');
          return true;
        }
      }
      
      console.log(`Waiting for WhatsApp interface... Attempt ${i + 1}/${maxAttempts}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.warn('Error checking WhatsApp interface:', error);
    }
  }
  return false;
}

// Enhanced chat title detection
async function detectChatTitle(retries = 7) {
  const titleSelectors = [
    '[data-testid="conversation-title"]',
    '[data-testid="conversation-info-header-chat-title"]',
    '[data-testid="chat-title"]',
    'header [role="heading"]',
    'header span[dir="auto"][title]',
    '#main header span[title]',
    '.chat-title',
    '[data-testid="conversation-contact-name"]'
  ];

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Check if we're in a chat
      const chatHeader = document.querySelector('#main header');
      if (!chatHeader) {
        console.log('Chat header not found, waiting...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      // Try each selector
      for (const selector of titleSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          if (!element) continue;

          // Check visibility
          const style = window.getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden' || !element.offsetParent) {
            continue;
          }

          // Get and validate text
          const text = element.textContent.trim();
          if (text && text.length > 0 && text.length < 100) {
            console.log('Found chat title:', text);
            return text;
          }
        }
      }

      // Try header text directly if no selectors match
      const headerText = chatHeader.textContent.trim();
      if (headerText && headerText.length < 100) {
        console.log('Found chat title from header:', headerText);
        return headerText;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.warn(`Chat title detection attempt ${attempt + 1} failed:`, error);
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  return null;
}

// Get current chat information with enhanced error handling
async function getCurrentChatInfo() {
  if (!await waitForValidContext()) {
    throw new Error('Extension context invalid');
  }

  try {
    // Wait for chat interface
    const interfaceLoaded = await waitForWhatsAppInterface();
    if (!interfaceLoaded) {
      throw new Error('WhatsApp interface not loaded');
    }

    // Enhanced chat title detection
    const chatTitle = await detectChatTitle();
    if (!chatTitle) {
      throw new Error('No valid chat title found after retries');
    }

    // Generate unique chat ID
    const chatId = `whatsapp-${chatTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    // Check if chat has changed
    if (currentChatId && currentChatId !== chatId) {
      console.log('Chat changed from', currentChatId, 'to', chatId);
      clearMessageCache();
    }
    currentChatId = chatId;

    // Find message container
    const messageContainer = await findMessageContainer();
    if (!messageContainer) {
      throw new Error('Message container not found');
    }

    // Create chat context
    const chatContext = {
      platform: 'whatsapp',
      chatId,
      title: chatTitle,
      url: window.location.href,
      availableDates: [getCurrentDate()],
      currentDate: getCurrentDate()
    };

    console.log('Current WhatsApp chat context:', chatContext);
    return chatContext;

  } catch (error) {
    console.error('Error getting WhatsApp chat info:', error);
    throw error;
  }
}

// Enhanced message container detection
async function findMessageContainer(maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Try each container selector
      for (const selector of MESSAGE_SELECTORS.container) {
        const container = document.querySelector(selector);
        if (container && container.offsetParent !== null) {
          console.log('Found message container:', selector);
          return container;
        }
      }

      // If no container found, wait and retry
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.warn(`Error finding message container (attempt ${attempt + 1}):`, error);
    }
  }
  return null;
}

// Process message queue
async function processMessageQueue() {
  if (isProcessingQueue || messageQueue.length === 0) return;
  
  isProcessingQueue = true;
  try {
    while (messageQueue.length > 0) {
      const { messageElement, chatInfo, targetDate } = messageQueue.shift();
      await processMessageWithRetry(messageElement, chatInfo, targetDate);
    }
  } finally {
    isProcessingQueue = false;
  }
}

// Enhanced message processing function
function processMessage(messageElement, chatInfo, targetDate = null) {
  if (!messageElement || !chatInfo) return;

  // Add to queue instead of processing immediately
  messageQueue.push({ messageElement, chatInfo, targetDate });
  
  // Start queue processing if not already running
  if (!isProcessingQueue) {
    processMessageQueue();
  }
}

// Process a batch of messages
async function processMessageBatch(messages, chatInfo) {
  const processedCount = {
    total: messages.length,
    success: 0,
    failed: 0
  };

  try {
    // Process messages in smaller chunks to avoid overwhelming
    const chunkSize = 5;
    for (let i = 0; i < messages.length; i += chunkSize) {
      const chunk = Array.from(messages).slice(i, i + chunkSize);
      
      // Process each message in the chunk
      const results = await Promise.all(chunk.map(async (msg) => {
        try {
          const content = await extractMessageContent(msg, chatInfo);
          if (!content) return false;

          // Generate message ID
          const messageId = `whatsapp-${chatInfo.chatId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          // Skip if already processed
          if (processedMessages.has(messageId)) return false;

          // Send to background
          const response = await sendToBackground({
            action: 'newMessage',
            data: {
              ...content,
              id: messageId,
              chatTitle: chatInfo.title,
              processed: Date.now()
            }
          });

          if (response?.status === 'success') {
            processedMessages.add(messageId);
            processedCount.success++;
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error processing message:', error);
          processedCount.failed++;
          return false;
        }
      }));

      // Add small delay between chunks
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('Message batch processing complete:', processedCount);
    return processedCount.success > 0;

  } catch (error) {
    console.error('Error in batch processing:', error);
    return false;
  }
}

// Enhanced message content extraction
async function extractMessageContent(messageElement, chatInfo) {
  try {
    // Get text content
    let messageText = null;
    for (const selector of MESSAGE_SELECTORS.text) {
      const element = messageElement.querySelector(selector);
      if (element) {
        messageText = element.textContent?.trim();
        if (messageText) break;
      }
    }

    if (!messageText) {
      // Try direct text content if no selectors match
      messageText = messageElement.textContent?.trim();
      if (!messageText) return null;
    }

    // Get timestamp and sender
    let timestamp = null;
    let sender = null;

    // Try data-pre-plain-text first
    const prePlainText = messageElement.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text');
    if (prePlainText) {
      const match = prePlainText.match(/\[(.*?)\] (.*?):/);
      if (match) {
        timestamp = match[1];
        sender = match[2];
      }
    }

    // Fallback timestamp detection
    if (!timestamp) {
      for (const selector of MESSAGE_SELECTORS.timestamp) {
        const element = messageElement.querySelector(selector);
        if (element) {
          timestamp = element.getAttribute('data-timestamp') || 
                     element.getAttribute('title') ||
                     element.textContent?.trim();
          if (timestamp) break;
        }
      }
    }

    // Use current time if no timestamp found
    if (!timestamp) {
      timestamp = new Date().toISOString();
    }

    // Determine message type
    const type = messageElement.classList.contains('message-out') ? 'outgoing' : 'incoming';

    // Create message object
    return {
      text: messageText,
      timestamp,
      sender: sender || 'Unknown',
      chatId: chatInfo.chatId,
      type,
      platform: 'whatsapp'
    };

  } catch (error) {
    console.error('Error extracting message content:', error);
    return null;
  }
}

// Process message with enhanced detection and validation
async function processMessageWithRetry(messageElement, chatInfo, targetDate, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (!messageElement || !chatInfo) {
        console.warn('Invalid message element or chat info');
        return false;
      }

      // Verify message element is visible
      const style = window.getComputedStyle(messageElement);
      if (style.display === 'none' || style.visibility === 'hidden' || !messageElement.offsetParent) {
        console.warn('Message element is not visible');
        continue;
      }

      // Enhanced message content detection
      const messageContent = await extractMessageContent(messageElement, chatInfo);
      if (!messageContent || !messageContent.text) {
        console.log('No valid message content found, retrying...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      // Generate unique message ID
      const messageId = `${chatInfo.chatId}-${messageContent.timestamp}-${messageContent.text.substring(0, 20)}`;
      
      if (processedMessages.has(messageId)) {
        console.log('Message already processed:', messageId);
        return true;
      }

      // Send message to background script
      const response = await sendToBackground({
        action: 'newMessage',
        data: {
          platform: 'whatsapp',
          chatId: chatInfo.chatId,
          message: {
            ...messageContent,
            id: messageId,
            chatId: chatInfo.chatId,
            chatTitle: chatInfo.title,
            platform: 'whatsapp',
            processed: Date.now(),
            date: getDateFromTimestamp(messageContent.timestamp)
          }
        }
      });

      if (response?.status === 'success') {
        processedMessages.add(messageId);
        console.log('Successfully processed message:', messageContent.text.substring(0, 50));
        return true;
      } else {
        console.warn('Failed to process message:', response);
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

    } catch (error) {
      console.error(`Error processing message (attempt ${attempt + 1}):`, error);
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  return false;
}

// Initialize observer with enhanced message processing
async function initializeObserver(targetDate = null, retryCount = 0) {
  if (!window.location.href.includes('web.whatsapp.com')) {
    return;
  }

  try {
    // Wait for valid context
    if (!await waitForValidContext()) {
      throw new Error('Extension context invalid');
    }

    // Get chat info with retries
    let chatInfo = null;
    for (let i = 0; i < 5; i++) {
      try {
        chatInfo = await getCurrentChatInfo();
        if (chatInfo) break;
      } catch (error) {
        console.warn(`Failed to get chat info, attempt ${i + 1}/5`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!chatInfo) {
      throw new Error('Failed to get chat info after retries');
    }

    // Clear message cache for new date
    clearMessageCache();

    // Find message container with retries
    const messageContainer = await findMessageContainer(5);
    if (!messageContainer) {
      throw new Error('Message container not found');
    }

    // Update chat context
    await sendToBackground({
      action: 'setChatContext',
      data: {
        ...chatInfo,
        targetDate,
        clearCache: true
      }
    });

    // Cleanup existing observer
    cleanup();

    // Process existing messages
    console.log('Looking for existing messages...');
    const messageSelectors = [
      '[data-testid="msg-container"]',
      '.message',
      '.msg',
      '[role="row"]',
      '.message-in',
      '.message-out',
      '[data-pre-plain-text]'
    ];

    const existingMessages = messageContainer.querySelectorAll(messageSelectors.join(','));
    console.log(`Found ${existingMessages.length} existing messages`);
    
    if (existingMessages.length === 0) {
      console.warn('No messages found with primary selectors, trying backup selectors...');
      const backupSelectors = [
        '.copyable-text',
        '[data-testid="conversation-panel-messages"] div[role="row"]',
        '.selectable-text',
        '[data-testid*="message"]'
      ];
      const backupMessages = messageContainer.querySelectorAll(backupSelectors.join(','));
      if (backupMessages.length > 0) {
        console.log(`Found ${backupMessages.length} messages with backup selectors`);
        await processMessageBatch(backupMessages, chatInfo, targetDate);
      }
    } else {
      await processMessageBatch(existingMessages, chatInfo, targetDate);
    }

    // Set up new observer
    setupMessageObserver(messageContainer, chatInfo, targetDate);
    console.log('WhatsApp observer initialized successfully');

  } catch (error) {
    console.error('Error initializing WhatsApp observer:', error);
    if (retryCount < MAX_INIT_RETRIES) {
      setTimeout(() => initializeObserver(targetDate, retryCount + 1), INIT_RETRY_DELAY);
    }
  }
}

// Setup message observer with enhanced detection
async function setupMessageObserver(chatInfo) {
  try {
    // Find message container
    const messageContainer = await findMessageContainer();
    if (!messageContainer) {
      throw new Error('Message container not found');
    }

    // Process existing messages first
    console.log('Processing existing messages...');
    const existingMessages = [];
    
    // Try each message selector
    for (const selector of MESSAGE_SELECTORS.message) {
      const messages = messageContainer.querySelectorAll(selector);
      if (messages.length > 0) {
        existingMessages.push(...Array.from(messages));
      }
    }

    if (existingMessages.length > 0) {
      console.log(`Found ${existingMessages.length} existing messages`);
      await processMessageBatch(existingMessages, chatInfo);
    } else {
      console.warn('No existing messages found');
    }

    // Set up observer for new messages
    const observer = new MutationObserver(async (mutations) => {
      try {
        const newMessages = new Set();

        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            // Check added nodes
            mutation.addedNodes.forEach(node => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                // Check if the node itself is a message
                for (const selector of MESSAGE_SELECTORS.message) {
                  if (node.matches(selector)) {
                    newMessages.add(node);
                  }
                  // Check child nodes
                  node.querySelectorAll(selector).forEach(el => newMessages.add(el));
                }
              }
            });
          }
        }

        // Process new messages
        if (newMessages.size > 0) {
          console.log(`Processing ${newMessages.size} new messages`);
          await processMessageBatch(Array.from(newMessages), chatInfo);
        }
      } catch (error) {
        console.error('Error in message observer:', error);
      }
    });

    // Start observing with configuration
    observer.observe(messageContainer, {
      childList: true,
      subtree: true,
      characterData: true
    });

    console.log('Message observer setup complete');
    return observer;

  } catch (error) {
    console.error('Error setting up message observer:', error);
    return null;
  }
}

// Generate unique message ID
async function generateMessageId(messageElement) {
  try {
    const idSelectors = [
      '[data-id]',
      '[data-testid]',
      '[data-message-id]'
    ];

    // Try to get ID from attributes
    for (const selector of idSelectors) {
      const element = messageElement.querySelector(selector) || messageElement;
      const id = element.getAttribute('data-id') || 
                element.getAttribute('data-testid') || 
                element.getAttribute('data-message-id');
      if (id) return id;
    }

    // Fallback: Generate hash from content and timestamp
    const content = messageElement.textContent?.trim();
    const timestamp = messageElement.querySelector('[data-timestamp]')?.getAttribute('data-timestamp');
    
    if (content && timestamp) {
      return `${content.substring(0, 32)}_${timestamp}`;
    }

    return null;
  } catch (error) {
    console.error('Error generating message ID:', error);
    return null;
  }
}

// Cleanup function to handle observer disconnection
function cleanup() {
  if (observerInstance) {
    observerInstance.disconnect();
    observerInstance = null;
  }
}

// Watch for URL changes with proper context check
let urlObserver;
function setupUrlObserver() {
  if (urlObserver) {
    urlObserver.disconnect();
  }

  urlObserver = new MutationObserver(() => {
    if (!isExtensionValid()) {
      cleanup();
      urlObserver.disconnect();
      return;
    }

    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      console.log('WhatsApp URL changed from', lastUrl, 'to', currentUrl);
      lastUrl = currentUrl;
      clearMessageCache();
      // Add delay before reinitializing
      setTimeout(() => initializeObserver(), 2000);
    }
  });

  if (isExtensionValid()) {
    urlObserver.observe(document, { subtree: true, childList: true });
  }
}

// Test WhatsApp observer functionality
async function testWhatsAppObserver() {
  console.log('🔍 Starting WhatsApp observer test...');
  
  try {
    // 1. Test extension context
    console.log('1️⃣ Testing extension context...');
    const contextValid = isExtensionValid();
    console.log(`Extension context valid: ${contextValid}`);
    if (!contextValid) {
      throw new Error('Extension context validation failed');
    }

    // 2. Test background connection
    console.log('2️⃣ Testing background connection...');
    const pingResponse = await sendToBackground({ action: 'ping' }, 5000);
    console.log('Background connection response:', pingResponse);
    if (!pingResponse || pingResponse.status !== 'ok') {
      throw new Error('Background connection failed');
    }

    // 3. Test WhatsApp interface detection
    console.log('3️⃣ Testing WhatsApp interface detection...');
    const interfaceLoaded = await waitForWhatsAppInterface(5);
    console.log(`WhatsApp interface detected: ${interfaceLoaded}`);
    if (!interfaceLoaded) {
      throw new Error('WhatsApp interface not detected');
    }

    // 4. Test chat title detection
    console.log('4️⃣ Testing chat title detection...');
    const chatTitle = await detectChatTitle(3);
    console.log(`Detected chat title: ${chatTitle}`);
    if (!chatTitle) {
      throw new Error('Chat title detection failed');
    }

    // 5. Test message container detection
    console.log('5️⃣ Testing message container detection...');
    const messageContainer = await findMessageContainer();
    console.log(`Message container found: ${!!messageContainer}`);
    if (!messageContainer) {
      throw new Error('Message container not found');
    }

    // 6. Test message processing
    console.log('6️⃣ Testing message processing...');
    const messages = messageContainer.querySelectorAll('[data-testid="msg-container"], .message, .msg, [role="row"]');
    console.log(`Found ${messages.length} messages to process`);
    
    if (messages.length > 0) {
      const chatInfo = await getCurrentChatInfo();
      const testMessage = messages[messages.length - 1]; // Try with most recent message
      const processed = await processMessageWithRetry(testMessage, chatInfo, null);
      console.log(`Test message processed: ${processed}`);
    }

    console.log('✅ WhatsApp observer test completed successfully!');
    return true;

  } catch (error) {
    console.error('❌ WhatsApp observer test failed:', error);
    return false;
  }
}

// Initialize WhatsApp observer with improved error handling
async function initializeWhatsAppObserver() {
  try {
    console.log('Initializing WhatsApp observer...');

    // Wait for valid extension context
    const contextValid = await waitForValidContext();
    if (!contextValid) {
      throw new Error('Extension context invalid');
    }

    // Wait for WhatsApp interface
    const interfaceReady = await waitForWhatsAppInterface();
    if (!interfaceReady) {
      throw new Error('WhatsApp interface not ready');
    }

    // Get current chat info
    const chatInfo = await getCurrentChatInfo();
    if (!chatInfo) {
      throw new Error('Could not get chat info');
    }

    // Set up message observer
    const observer = await setupMessageObserver(chatInfo);
    if (!observer) {
      throw new Error('Failed to set up message observer');
    }

    // Store observer for cleanup
    if (window._whatsappObserver) {
      window._whatsappObserver.disconnect();
    }
    window._whatsappObserver = observer;

    // Set up URL observer for chat changes
    setupUrlObserver();

    console.log('WhatsApp observer initialized successfully');
    return true;

  } catch (error) {
    console.error('Error initializing WhatsApp observer:', error);
    return false;
  }
}

// Cleanup on unload
window.addEventListener('unload', () => {
  if (window._whatsappObserver) {
    window._whatsappObserver.disconnect();
    window._whatsappObserver = null;
  }
}); 