const chatProcessor = require('./chat-processor');

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    switch (request.action) {
      case 'newMessage':
        const { platform, chatId, message } = request.data;
        chatProcessor.addMessage(chatId, message);
        sendResponse({ status: 'success' });
        break;

      case 'setChatContext':
        const { data: context } = request;
        chatProcessor.setChatContext(context.chatId, context);
        sendResponse({ status: 'success' });
        break;

      case 'processQuery':
        const { query, chatId: targetChatId } = request;
        const response = chatProcessor.processQuery(query, targetChatId);
        sendResponse({ status: 'success', response });
        break;

      default:
        console.warn('Unknown action:', request.action);
        sendResponse({ status: 'error', error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Error processing message:', error);
    sendResponse({ status: 'error', error: error.message });
  }

  // Required for async response
  return true;
});

// Clean up old messages periodically
setInterval(() => {
  chatProcessor.clearOldMessages();
}, 24 * 60 * 60 * 1000); // Once per day 