document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const analyzeButton = document.getElementById('analyzeButton');
  const resultDiv = document.getElementById('result');
  const chatInfoDiv = document.getElementById('chatInfo');
  const messageCountSpan = document.getElementById('messageCount');
  let currentChatInfo = null;

  // Load saved API key
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
  });

  // Update chat info display
  function updateChatInfo() {
    chrome.runtime.sendMessage({ action: 'getChatContext' }, (response) => {
      currentChatInfo = response.chatInfo;
      if (currentChatInfo) {
        chatInfoDiv.innerHTML = `
          <div class="chat-info">
            <strong>Current Chat:</strong> ${currentChatInfo.title}
            <br>
            <small>Platform: ${currentChatInfo.platform}</small>
          </div>
        `;
      } else {
        chatInfoDiv.innerHTML = '<p>No active chat selected</p>';
      }
    });

    // Update message count
    chrome.runtime.sendMessage({ action: 'getMessageCount' }, (response) => {
      if (response.count !== undefined) {
        messageCountSpan.textContent = `Messages available: ${response.count}`;
      }
    });
  }

  // Save API key
  apiKeyInput.addEventListener('change', () => {
    const apiKey = apiKeyInput.value.trim();
    chrome.runtime.sendMessage({
      action: 'setApiKey',
      data: { apiKey }
    }, (response) => {
      if (response.status === 'success') {
        showStatus('API key saved', 'success');
      } else {
        showStatus('Failed to save API key', 'error');
      }
    });
  });

  // Analyze chat
  analyzeButton.addEventListener('click', () => {
    if (!currentChatInfo) {
      showStatus('Please open a chat first', 'error');
      return;
    }

    analyzeButton.disabled = true;
    resultDiv.innerHTML = '<div class="loading">Analyzing messages...</div>';

    chrome.runtime.sendMessage({
      action: 'analyzeChatMessages',
      data: { chatInfo: currentChatInfo }
    }, (response) => {
      analyzeButton.disabled = false;
      
      if (response.status === 'success') {
        resultDiv.innerHTML = `
          <div class="analysis-result">
            <h3>Analysis Results</h3>
            <div class="chat-context">
              <strong>${currentChatInfo.title}</strong>
              <small>Analyzed at: ${new Date().toLocaleString()}</small>
            </div>
            <div class="content">
              ${formatAnalysisResult(response.result)}
            </div>
          </div>
        `;
      } else {
        showStatus(response.error || 'Analysis failed', 'error');
      }
    });
  });

  // Format analysis result with some basic styling
  function formatAnalysisResult(result) {
    if (!result) return '';
    
    // Convert URLs to clickable links
    const linkedText = result.replace(
      /(https?:\/\/[^\s]+)/g, 
      '<a href="$1" target="_blank">$1</a>'
    );
    
    // Convert bullet points to HTML
    return linkedText
      .split('\n')
      .map(line => {
        if (line.trim().startsWith('- ')) {
          return `<li>${line.trim().substring(2)}</li>`;
        }
        if (line.trim().startsWith('• ')) {
          return `<li>${line.trim().substring(2)}</li>`;
        }
        return `<p>${line}</p>`;
      })
      .join('');
  }

  // Show status message
  function showStatus(message, type = 'info') {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = 'status';
    }, 3000);
  }

  // Update chat info when popup opens
  updateChatInfo();

  // Listen for chat context updates
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'chatContextUpdated') {
      updateChatInfo();
    }
    sendResponse({ status: 'success' });
  });
}); 