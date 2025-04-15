document.addEventListener('DOMContentLoaded', () => {
  const promptInput = document.getElementById('prompt');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const insightsContainer = document.getElementById('insightsContainer');
  const connectionStatus = document.getElementById('connectionStatus');
  const apiKeyInput = document.getElementById('apiKey');
  const saveApiKeyBtn = document.getElementById('saveApiKey');
  const apiKeyStatus = document.getElementById('apiKeyStatus');

  let currentChatPlatform = null;

  // Load saved API key
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
      apiKeyStatus.textContent = 'API key is set';
      apiKeyStatus.style.color = '#1e8e3e';
      analyzeBtn.disabled = false;
    } else {
      apiKeyStatus.textContent = 'Please enter your Gemini API key';
      apiKeyStatus.style.color = '#d93025';
      analyzeBtn.disabled = true;
    }
  });

  // Save API key
  saveApiKeyBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      apiKeyStatus.textContent = 'API key cannot be empty';
      apiKeyStatus.style.color = '#d93025';
      return;
    }

    chrome.runtime.sendMessage({
      action: 'setApiKey',
      apiKey: apiKey
    }, (response) => {
      if (response.status === 'success') {
        apiKeyStatus.textContent = 'API key saved successfully';
        apiKeyStatus.style.color = '#1e8e3e';
        analyzeBtn.disabled = false;
      } else {
        apiKeyStatus.textContent = 'Failed to save API key';
        apiKeyStatus.style.color = '#d93025';
      }
    });
  });

  // Check current tab for supported platforms
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentUrl = tabs[0].url;
    if (currentUrl.includes('web.telegram.org')) {
      currentChatPlatform = 'telegram';
      connectionStatus.textContent = 'Connected to Telegram Web';
      connectionStatus.style.color = '#1e8e3e';
    } else if (currentUrl.includes('web.whatsapp.com')) {
      currentChatPlatform = 'whatsapp';
      connectionStatus.textContent = 'Connected to WhatsApp Web';
      connectionStatus.style.color = '#1e8e3e';
    } else {
      connectionStatus.textContent = 'Please open Telegram Web or WhatsApp Web';
      connectionStatus.style.color = '#d93025';
      analyzeBtn.disabled = true;
    }
  });

  // Handle analyze button click
  analyzeBtn.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      addInsight('Error', 'Please enter a prompt');
      return;
    }

    // Disable button and show loading state
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Generating...';
    
    try {
      // Request analysis from background service
      const response = await chrome.runtime.sendMessage({
        action: 'analyzeChats',
        data: {
          prompt,
          platform: currentChatPlatform
        }
      });

      if (response.status === 'success') {
        addInsight(prompt, response.result);
        promptInput.value = '';
      } else {
        addInsight('Error', response.error || 'Failed to generate insight');
      }
    } catch (error) {
      console.error('Analysis failed:', error);
      addInsight('Error', error.message || 'Failed to generate insight. Please try again.');
    } finally {
      // Reset button state
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = 'Generate Insight';
    }
  });

  function addInsight(prompt, response) {
    const insightElement = document.createElement('div');
    insightElement.className = 'insight-item';
    
    const isError = prompt === 'Error';
    if (isError) {
      insightElement.style.color = '#d93025';
      insightElement.innerHTML = `<strong>Error:</strong> ${escapeHtml(response)}`;
    } else {
      insightElement.innerHTML = `
        <strong>Prompt:</strong> ${escapeHtml(prompt)}<br>
        <strong>Response:</strong> ${escapeHtml(response)}
      `;
    }
    
    insightsContainer.insertBefore(insightElement, insightsContainer.firstChild);
  }

  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}); 