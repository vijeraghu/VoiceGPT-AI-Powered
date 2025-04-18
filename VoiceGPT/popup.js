// Global variables
let isListening = false;
let voices = [];
const conversationHistory = [];
let connectionEstablished = false;

// Initialize when popup is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Initialize DOM references - needs to happen before any element access
  initializeDOMReferences();
  
  // First check if we can connect to the content script
  checkContentScriptConnection();
});

// Function to initialize DOM references
function initializeDOMReferences() {
  // Get references to all DOM elements after they're loaded
  window.toggleButton = document.getElementById('toggleListening');
  window.statusText = document.getElementById('statusText');
  window.statusLight = document.getElementById('statusLight');
  window.conversation = document.getElementById('conversation');
  window.voiceSelect = document.getElementById('voiceSelect');
  window.speechRate = document.getElementById('speechRate');
  window.rateValue = document.getElementById('rateValue');
  window.apiKeyInput = document.getElementById('apiKeyInput');
  window.saveApiKeyButton = document.getElementById('saveApiKey');
  window.modelSelect = document.getElementById('modelSelect');
  window.testApiConnection = document.getElementById('testApiConnection');
}

// Helper function to show error messages
function showErrorMessage(message) {
  if (window.conversation) {
    window.conversation.innerHTML = `<div class="message system-message">${message}</div>`;
  } else {
    console.error("DOM not ready:", message);
  }
  
  if (window.statusText) {
    window.statusText.textContent = "Error";
  }
  
  if (window.statusLight) {
    window.statusLight.classList.remove('active', 'processing');
    window.statusLight.classList.add('inactive');
  }
}

// Check if content script is available and connected
function checkContentScriptConnection(attempts = 0, maxAttempts = 3) {
  // Check if we're on a valid page for content scripts
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs || !tabs.length) {
      showErrorMessage("Could not detect active tab.");
      return;
    }
    
    const currentUrl = tabs[0].url;
    
    // Chrome extension pages, settings pages, and chrome:// URLs don't support content scripts
    if (currentUrl.startsWith('chrome://') || 
        currentUrl.startsWith('chrome-extension://') ||
        currentUrl.startsWith('chrome-search://')) {
      showErrorMessage("VoiceGPT cannot run on Chrome internal pages.");
      return;
    }
    
    // Try to ping the content script
    try {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'ping' }, (response) => {
        // Handle runtime.lastError
        if (chrome.runtime.lastError) {
          console.log(`Attempt ${attempts + 1} failed: ${chrome.runtime.lastError.message}`);
          
          if (attempts < maxAttempts) {
            // Wait and try again
            setTimeout(() => checkContentScriptConnection(attempts + 1, maxAttempts), 300);
          } else {
            showErrorMessage("Could not connect to page. Try refreshing the page and reopening the extension.");
          }
          return;
        }
        
        // Content script is available, proceed with initialization
        if (response && response.status === 'ok') {
          connectionEstablished = true;
          initialize();
        } else {
          showErrorMessage("Unexpected response from content script.");
        }
      });
    } catch (error) {
      console.error("Connection error:", error);
      showErrorMessage(`Error connecting to page: ${error.message}`);
    }
  });
}

// Main initialization function
function initialize() {
  if (!connectionEstablished) {
    console.log("Initialization aborted: no connection to content script");
    return;
  }
  
  // Load saved settings from storage
  loadSettings();
  
  // Set up speech synthesis voices
  populateVoiceList();
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = populateVoiceList;
  }
  
  // Set up event listeners for UI elements
  if (window.toggleButton) {
    window.toggleButton.addEventListener('click', toggleListening);
  }
  
  if (window.speechRate) {
    window.speechRate.addEventListener('input', updateSpeechRate);
  }
  
  if (window.saveApiKeyButton) {
    window.saveApiKeyButton.addEventListener('click', saveApiKey);
  }
  
  if (window.modelSelect) {
    window.modelSelect.addEventListener('change', saveModel);
  }
  
  if (window.testApiConnection) {
    window.testApiConnection.addEventListener('click', testApiConnection);
  }
  
  // Get the active tab to communicate with content script
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    const activeTab = tabs[0];
    
    if (activeTab && activeTab.id) {
      // Get page info from content script
      chrome.tabs.sendMessage(
        activeTab.id,
        { action: 'getPageInfo' },
        (response) => {
          if (chrome.runtime.lastError) {
            console.log('Error getting page info:', chrome.runtime.lastError.message);
            return;
          }
          
          if (response) {
            displayPageInfo(response);
          }
        }
      );
    }
  });
  
  // Listen for messages from content script
  chrome.runtime.onMessage.addListener(handleMessage);
}

// Load settings from storage
function loadSettings() {
  chrome.storage.sync.get(
    {
      apiKey: '',
      model: 'mistral-large', // Default to Mistral Large
      speechRate: 1.0,
      voiceName: ''
    },
    (items) => {
      if (window.apiKeyInput) {
        window.apiKeyInput.value = items.apiKey;
      }
      
      if (window.modelSelect) {
        window.modelSelect.value = items.model;
      }
      
      if (window.speechRate) {
        window.speechRate.value = items.speechRate;
      }
      
      if (window.rateValue) {
        window.rateValue.textContent = items.speechRate;
      }
      
      // Set voice selection if available
      if (items.voiceName && window.voiceSelect && window.voiceSelect.options.length > 0) {
        for (let i = 0; i < window.voiceSelect.options.length; i++) {
          if (window.voiceSelect.options[i].text === items.voiceName) {
            window.voiceSelect.selectedIndex = i;
            break;
          }
        }
      }
    }
  );
}

// Populate the voice dropdown
function populateVoiceList() {
  if (!window.speechSynthesis || !window.voiceSelect) return;
  
  voices = window.speechSynthesis.getVoices();
  
  window.voiceSelect.innerHTML = '';
  
  voices.forEach((voice, index) => {
    const option = document.createElement('option');
    option.textContent = `${voice.name} (${voice.lang})`;
    option.value = index;
    window.voiceSelect.appendChild(option);
  });
  
  // Select saved voice if exists
  chrome.storage.sync.get('voiceName', (data) => {
    if (data.voiceName) {
      for (let i = 0; i < window.voiceSelect.options.length; i++) {
        if (window.voiceSelect.options[i].text.startsWith(data.voiceName)) {
          window.voiceSelect.selectedIndex = i;
          break;
        }
      }
    }
  });
  
  // Save voice selection on change
  window.voiceSelect.addEventListener('change', () => {
    const selectedVoice = voices[window.voiceSelect.value];
    if (selectedVoice) {
      chrome.storage.sync.set({ voiceName: selectedVoice.name });
      
      // Update content script
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs && tabs.length > 0) {
          try {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'updateSettings',
              settings: { voiceName: selectedVoice.name }
            }, () => {
              if (chrome.runtime.lastError) {
                console.log('Error updating voice settings:', chrome.runtime.lastError.message);
              }
            });
          } catch (error) {
            console.error('Error sending voice settings:', error);
          }
        }
      });
    }
  });
}

// Handle messages from content script
function handleMessage(message, sender, sendResponse) {
  switch (message.action) {
    case 'updateStatus':
      updateStatus(message.status);
      break;
    case 'newUserMessage':
      addMessageToConversation('user', message.message);
      break;
    case 'newAssistantMessage':
      addMessageToConversation('assistant', message.message);
      break;
    case 'recognitionError':
      updateStatus('error');
      addMessageToConversation('system', `Error: ${message.error}`);
      break;
  }
}

// Toggle listening state
function toggleListening() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs || !tabs.length) return;
    
    try {
      if (isListening) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'stopListening' }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('Error stopping listening:', chrome.runtime.lastError.message);
            return;
          }
          
          updateStatus('inactive');
          isListening = false;
          window.toggleButton.textContent = 'Start Listening';
        });
      } else {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'startListening' }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('Error starting listening:', chrome.runtime.lastError.message);
            return;
          }
          
          updateStatus('listening');
          isListening = true;
          window.toggleButton.textContent = 'Stop Listening';
        });
      }
    } catch (error) {
      console.error('Error toggling listening state:', error);
    }
  });
}

// Update the UI status indicators
function updateStatus(status) {
  if (window.statusText) {
    window.statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  }
  
  if (window.statusLight) {
    // Remove all status classes
    window.statusLight.classList.remove('active', 'inactive', 'processing');
    
    // Add appropriate class
    switch (status) {
      case 'listening':
        window.statusLight.classList.add('active');
        break;
      case 'processing':
        window.statusLight.classList.add('processing');
        break;
      case 'inactive':
      case 'error':
        window.statusLight.classList.add('inactive');
        break;
    }
  }
}

// Update speech rate
function updateSpeechRate() {
  if (!window.speechRate || !window.rateValue) return;
  
  const rate = parseFloat(window.speechRate.value);
  window.rateValue.textContent = rate.toFixed(1);
  
  // Save to storage
  chrome.storage.sync.set({ speechRate: rate });
  
  // Update content script
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs || !tabs.length) return;
    
    try {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'updateSettings',
        settings: { speechRate: rate }
      }, () => {
        if (chrome.runtime.lastError) {
          console.log('Error updating speech rate:', chrome.runtime.lastError.message);
        }
      });
    } catch (error) {
      console.error('Error sending speech rate update:', error);
    }
  });
}

// Save API key
function saveApiKey() {
  if (!window.apiKeyInput || !window.saveApiKeyButton) return;
  
  const apiKey = window.apiKeyInput.value.trim();
  
  // Save to storage
  chrome.storage.sync.set({ apiKey: apiKey }, () => {
    // Show feedback
    const originalText = window.saveApiKeyButton.textContent;
    window.saveApiKeyButton.textContent = 'Saved!';
    setTimeout(() => {
      window.saveApiKeyButton.textContent = originalText;
    }, 1500);
  });
  
  // Update content script
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs || !tabs.length) return;
    
    try {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'updateSettings',
        settings: { apiKey: apiKey }
      }, () => {
        if (chrome.runtime.lastError) {
          console.log('Error updating API key:', chrome.runtime.lastError.message);
        }
      });
    } catch (error) {
      console.error('Error sending API key update:', error);
    }
  });
}

// Save selected model
function saveModel() {
  if (!window.modelSelect) return;
  
  const model = window.modelSelect.value;
  
  // Save to storage
  chrome.storage.sync.set({ model: model });
  
  // Update content script
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs || !tabs.length) return;
    
    try {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'updateSettings',
        settings: { model: model }
      }, () => {
        if (chrome.runtime.lastError) {
          console.log('Error updating model selection:', chrome.runtime.lastError.message);
        }
      });
    } catch (error) {
      console.error('Error sending model update:', error);
    }
  });
}

// Add a message to the conversation history
function addMessageToConversation(role, text) {
  if (!window.conversation) return;
  
  // Add to conversation array
  conversationHistory.push({ role, text });
  
  // Add to UI
  const messageElement = document.createElement('div');
  messageElement.className = `message ${role}-message`;
  messageElement.textContent = text;
  
  window.conversation.appendChild(messageElement);
  
  // Scroll to bottom
  window.conversation.scrollTop = window.conversation.scrollHeight;
}

// Display page info
function displayPageInfo(pageInfo) {
  if (!pageInfo || !window.conversation) return;
  
  // Add system message with page info
  addMessageToConversation('system', `Currently on: ${pageInfo.title}`);
}

// Test API connection
function testApiConnection() {
  // Add a message to the conversation indicating we're testing
  addMessageToConversation('system', 'Testing API connection...');
  
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs || !tabs.length) return;
    
    try {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'testApi' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Error testing API:', chrome.runtime.lastError.message);
          addMessageToConversation('system', 'Error testing API: ' + chrome.runtime.lastError.message);
          return;
        }
        
        if (response && response.success) {
          addMessageToConversation('system', 'API connection successful!');
        } else if (response && response.error) {
          addMessageToConversation('system', 'API connection failed: ' + response.error);
        } else {
          addMessageToConversation('system', 'API test completed but received an unexpected response.');
        }
      });
    } catch (error) {
      console.error('Error sending test API request:', error);
      addMessageToConversation('system', 'Error: ' + error.message);
    }
  });
}