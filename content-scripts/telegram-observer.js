// Track processed messages and current chat
const processedMessages = new Set();
let currentChatId = null;

// Configuration for the message observer
const observerConfig = {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true
};

// Get current date in YYYY-MM-DD format
function getCurrentDate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

// Safely parse timestamp from various formats
function parseTimestamp(element) {
  try {
    // Check for data-timestamp attribute first
    if (element.hasAttribute('data-timestamp')) {
      const timestamp = parseInt(element.getAttribute('data-timestamp'));
      if (!isNaN(timestamp)) {
        return timestamp * 1000; // Convert seconds to milliseconds
      }
    }

    // Check for datetime attribute
    if (element.hasAttribute('datetime')) {
      const date = new Date(element.getAttribute('datetime'));
      if (!isNaN(date.getTime())) {
        return date.getTime();
      }
    }

    // Check for title attribute (often contains full date)
    if (element.hasAttribute('title')) {
      const date = new Date(element.getAttribute('title'));
      if (!isNaN(date.getTime())) {
        return date.getTime();
      }
    }

    // Try to parse text content for time
    const text = element.textContent.trim();
    if (text) {
      // Handle "today at HH:MM" format
      if (text.toLowerCase().includes('today at')) {
        const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
          const now = new Date();
          const [hours, minutes] = timeMatch.slice(1).map(Number);
          now.setHours(hours, minutes, 0, 0);
          return now.getTime();
        }
      }

      // Handle "DD.MM.YYYY" format
      const dateMatch = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (dateMatch) {
        const [day, month, year] = dateMatch.slice(1).map(Number);
        const date = new Date(year, month - 1, day);
        if (!isNaN(date.getTime())) {
          return date.getTime();
        }
      }

      // Handle time only (assume today)
      const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        const now = new Date();
        const [hours, minutes] = timeMatch.slice(1).map(Number);
        now.setHours(hours, minutes, 0, 0);
        return now.getTime();
      }
    }

    // Default to current time if no valid timestamp found
    return Date.now();
  } catch (error) {
    console.warn('Error parsing timestamp:', error);
    return Date.now();
  }
}

// Convert timestamp to YYYY-MM-DD format
function getDateFromTimestamp(timestamp) {
  try {
    if (typeof timestamp !== 'number' || isNaN(timestamp)) {
      console.warn('Invalid timestamp:', timestamp);
      return getCurrentDate();
    }
    return new Date(timestamp).toISOString().split('T')[0];
  } catch (error) {
    console.warn('Error converting timestamp to date:', error);
    return getCurrentDate();
  }
}

// Check if message is from specified date
function isMessageFromDate(timestamp, targetDate) {
  return getDateFromTimestamp(timestamp) === targetDate;
}

// Clear message cache when switching chats
function clearMessageCache() {
  processedMessages.clear();
  console.log('Message cache cleared');
}

// Get current chat information with date context
function getCurrentChatInfo() {
  try {
    // First try to get the chat title from the main header/top bar
    const mainHeaderSelectors = [
      // Main chat header selectors
      '.chat-info .title',
      '.TopBarInfo .title',
      '.info .title',
      // Dynamic class-based selectors
      '[class*="TopBar"] [class*="title"]',
      '[class*="ChatInfo"] [class*="title"]',
      // General attribute selectors
      '[dir="auto"][role="heading"]',
      'h3[dir="auto"]',
      // Fallback selectors
      '[class*="chat"] [class*="title"]:not([class*="message"])',
      '[class*="dialog"] [class*="title"]'
    ];

    let chatTitleElement = null;
    for (const selector of mainHeaderSelectors) {
      chatTitleElement = document.querySelector(selector);
      if (chatTitleElement && chatTitleElement.textContent.trim()) {
        break;
      }
    }

    if (!chatTitleElement || !chatTitleElement.textContent.trim()) {
      console.log('Chat title not found in primary selectors, trying alternative methods');
      
      // Try to find the first visible heading or title element
      const possibleTitleElements = document.querySelectorAll([
        '[class*="title"]:not([class*="message"])',
        '[class*="name"][dir="auto"]',
        '[class*="header"] [dir="auto"]',
        '[role="heading"]'
      ].join(','));

      for (const element of possibleTitleElements) {
        // Check if element is visible and has text content
        if (element.offsetParent !== null && element.textContent.trim()) {
          const style = window.getComputedStyle(element);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            chatTitleElement = element;
            break;
          }
        }
      }

      if (!chatTitleElement) {
        console.log('No visible chat title found');
        return null;
      }
    }

    const chatTitle = chatTitleElement.textContent.trim();
    console.log('Detected chat title:', chatTitle);

    // Get chat ID from URL or generate one from title
    const urlPath = window.location.pathname;
    const urlChatId = urlPath.split('/').pop();
    const chatId = `telegram-${urlChatId || chatTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    // Check if chat has changed
    if (currentChatId && currentChatId !== chatId) {
      console.log('Chat changed from', currentChatId, 'to', chatId);
      clearMessageCache();
    }
    currentChatId = chatId;

    // Find all possible date indicators
    const dateSelectors = [
      '[class*="date"]',
      '[class*="time"]',
      'time',
      '[data-timestamp]',
      '[class*="Time"]',
      '[class*="message"] [class*="meta"]'
    ];

    const dateIndicators = document.querySelectorAll(dateSelectors.join(','));
    const dates = new Set();
    
    dateIndicators.forEach(indicator => {
      try {
        if (indicator.getAttribute('datetime')) {
          dates.add(getDateFromTimestamp(new Date(indicator.getAttribute('datetime')).getTime()));
        } else if (indicator.getAttribute('data-timestamp')) {
          dates.add(getDateFromTimestamp(Number(indicator.getAttribute('data-timestamp')) * 1000));
        } else if (indicator.title) {
          dates.add(getDateFromTimestamp(new Date(indicator.title).getTime()));
        } else if (indicator.textContent) {
          // Try to parse date from text content if it contains timestamp
          const timeMatch = indicator.textContent.match(/\d{1,2}:\d{2}/);
          if (timeMatch) {
            dates.add(getCurrentDate());
          }
        }
      } catch (e) {
        console.log('Error parsing date from element:', e);
      }
    });

    // Ensure we at least have today's date
    dates.add(getCurrentDate());

    // Create chat context
    const chatContext = {
      platform: 'telegram',
      chatId,
      title: chatTitle,
      url: window.location.href,
      availableDates: Array.from(dates),
      currentDate: getCurrentDate()
    };

    console.log('Current chat context:', chatContext);
    
    // Notify background script of chat change
    chrome.runtime.sendMessage({
      action: 'chatChanged',
      data: chatContext
    });

    return chatContext;

  } catch (error) {
    console.error('Error getting chat info:', error);
    return null;
  }
}

// Check if extension context is valid
function isExtensionValid() {
  try {
    chrome.runtime.getURL('');
    return true;
  } catch (e) {
    return false;
  }
}

// Process individual message elements
function processMessage(messageElement, chatInfo, targetDate = null) {
  if (!messageElement || !chatInfo) return;

  try {
    // Get message timestamp
    const timestampElement = 
      messageElement.querySelector('[class*="time"]') ||
      messageElement.querySelector('time') ||
      messageElement.querySelector('[class*="Time"]') ||
      messageElement.querySelector('[data-timestamp]');

    const timestamp = timestampElement ? parseTimestamp(timestampElement) : Date.now();
    const messageDate = getDateFromTimestamp(timestamp);

    // Skip message if it's not from the target date
    if (targetDate && messageDate !== targetDate) {
      return;
    }

    // Get unique message ID
    const messageId = 
      messageElement.getAttribute('data-message-id') || 
      messageElement.getAttribute('data-mid') ||
      messageElement.querySelector('.time')?.getAttribute('data-message-id') ||
      `${messageElement.textContent}-${timestamp}`;

    if (!messageId || processedMessages.has(messageId)) {
      return;
    }

    // Extract message content
    const textElement = 
      messageElement.querySelector('.text-content') || 
      messageElement.querySelector('.message-text') ||
      messageElement.querySelector('.text') ||
      messageElement.querySelector('[dir="auto"]') ||
      messageElement.querySelector('[class*="text"]');

    // Handle messages with links
    const linkElements = messageElement.querySelectorAll('a');
    let messageText = textElement ? textElement.textContent.trim() : '';
    
    if (linkElements.length > 0) {
      linkElements.forEach(link => {
        if (!messageText.includes(link.href)) {
          messageText += ` ${link.href}`;
        }
      });
    }

    if (!messageText) {
      return;
    }

    // Get sender information
    const senderElement = 
      messageElement.querySelector('.peer-title') ||
      messageElement.querySelector('.message-title') ||
      messageElement.querySelector('.name') ||
      messageElement.querySelector('[class*="title"]:not([class*="reply"])') ||
      messageElement.closest('[class*="message"]')?.querySelector('[class*="name"]');

    const sender = senderElement ? senderElement.textContent.trim() : chatInfo.title;

    // Create message object
    const message = {
      id: messageId,
      text: messageText,
      sender,
      timestamp,
      date: messageDate,
      chatId: chatInfo.chatId,
      chatTitle: chatInfo.title,
      hasLinks: linkElements.length > 0,
      platform: 'telegram'
    };

    // Send message to background script
    chrome.runtime.sendMessage({
      action: 'newMessage',
      data: {
        platform: 'telegram',
        chatId: chatInfo.chatId,
        message,
        dateContext: {
          requestedDate: targetDate,
          messageDate: messageDate,
          currentDate: getCurrentDate()
        }
      }
    }, response => {
      if (chrome.runtime.lastError) {
        console.log('Error sending message:', chrome.runtime.lastError);
        return;
      }
      
      if (response?.status === 'success') {
        processedMessages.add(messageId);
        console.log('Message stored:', message);
      }
    });

  } catch (error) {
    console.error('Error processing message:', error);
  }
}

// Initialize observer with date context
function initializeObserver(targetDate = null) {
  if (!isExtensionValid()) {
    console.log('Extension context invalid, retrying initialization...');
    setTimeout(() => initializeObserver(targetDate), 1000);
    return;
  }

  try {
    const chatInfo = getCurrentChatInfo();
    if (!chatInfo) {
      console.log('Chat info not available, retrying...');
      setTimeout(() => initializeObserver(targetDate), 1000);
      return;
    }

    // Clear message cache when initializing with a new date
    if (targetDate) {
      clearMessageCache();
    }

    // Verify if requested date exists in chat
    if (targetDate && !chatInfo.availableDates.includes(targetDate)) {
      console.log(`No messages found for date ${targetDate} in chat ${chatInfo.title}`);
      return;
    }

    console.log(`Found chat: ${chatInfo.title}, processing messages for date: ${targetDate || 'all'}`);

    // Find chat container
    const chatContainer = 
      document.querySelector('.messages-container') ||
      document.querySelector('.chat-messages') ||
      document.querySelector('.bubbles') ||
      document.querySelector('.MessageList') ||
      document.querySelector('[class*="messages"]') ||
      document.querySelector('[class*="chat"]');

    if (!chatContainer) {
      console.log('Chat container not found, retrying...');
      setTimeout(() => initializeObserver(targetDate), 1000);
      return;
    }

    // Update chat context in background script with clear cache flag
    chrome.runtime.sendMessage({
      action: 'setChatContext',
      data: {
        ...chatInfo,
        targetDate,
        clearCache: true // Signal to clear background script cache
      }
    });

    // Initialize observer for new messages
    const observer = new MutationObserver((mutations) => {
      if (!isExtensionValid()) {
        observer.disconnect();
        return;
      }

      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const messages = node.querySelectorAll('[class*="message-"]:not([class*="reply"]), .Message, [class*="message"]');
            messages.forEach(msg => processMessage(msg, chatInfo, targetDate));
          }
        });
      });
    });

    observer.observe(chatContainer, observerConfig);
    console.log(`Observer initialized for ${chatInfo.title}, watching for messages on ${targetDate || 'all dates'}`);

    // Process existing messages
    const existingMessages = chatContainer.querySelectorAll('[class*="message-"]:not([class*="reply"]), .Message, [class*="message"]');
    console.log(`Found ${existingMessages.length} existing messages`);
    existingMessages.forEach(msg => processMessage(msg, chatInfo, targetDate));

  } catch (error) {
    console.error('Error initializing observer:', error);
    setTimeout(() => initializeObserver(targetDate), 1000);
  }
}

// Watch for URL changes to detect chat switches
let lastUrl = window.location.href;
new MutationObserver(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    console.log('URL changed from', lastUrl, 'to', currentUrl);
    lastUrl = currentUrl;
    clearMessageCache();
    initializeObserver();
  }
}).observe(document, { subtree: true, childList: true });

// Initialize with current date when "today" is requested
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'filterByDate') {
    const targetDate = request.date === 'today' ? getCurrentDate() : request.date;
    initializeObserver(targetDate);
    sendResponse({ status: 'processing' });
  }
});

// Initial setup
initializeObserver();

// Cleanup on unload
window.addEventListener('unload', () => {
  if (window.observer) {
    window.observer.disconnect();
  }
});

// Re-initialize on visibility change
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    initializeObserver();
  }
}); 