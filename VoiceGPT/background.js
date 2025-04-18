// Background script for VoiceGPT Screen Reader

// Initialize when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log('VoiceGPT Screen Reader installed');
  
  // Set default settings if not already set
  chrome.storage.sync.get(
    {
      apiKey: '',
      model: 'mistral-large',
      speechRate: 1.0,
      voiceName: ''
    },
    (items) => {
      // If no settings exist, set defaults
      if (items.apiKey === undefined) {
        chrome.storage.sync.set({
          apiKey: '',
          model: 'mistral-large',
          speechRate: 1.0,
          voiceName: ''
        });
      }
    }
  );
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Relay messages between popup and content script
  if (message.action === 'updateStatus' || 
      message.action === 'newUserMessage' || 
      message.action === 'newAssistantMessage' || 
      message.action === 'recognitionError' ||
      message.action === 'contentScriptReady') {
    
    // Forward message to popup
    try {
      chrome.runtime.sendMessage(message).catch(error => {
        console.log('Error forwarding message:', error);
      });
    } catch (error) {
      console.log('Error in sendMessage:', error);
    }
  }
  
  // Indicate we've handled the message
  if (sendResponse) {
    sendResponse({status: 'received'});
  }
  return true;
});

// Safely use commands API if available
if (chrome.commands) {
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle_voice_input') {
      // Get the active tab
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs && tabs.length > 0) {
          // Send toggle command to content script
          try {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleVoiceInput' }, () => {
              if (chrome.runtime.lastError) {
                console.log('Error sending toggle command:', chrome.runtime.lastError.message);
              }
            });
          } catch (error) {
            console.log('Error in toggle voice command:', error);
          }
        }
      });
    } else if (command === 'stop_speech') {
      // Get the active tab
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs && tabs.length > 0) {
          // Send stop speech command to content script
          try {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'stopSpeech' }, () => {
              if (chrome.runtime.lastError) {
                console.log('Error sending stop speech command:', chrome.runtime.lastError.message);
              }
            });
          } catch (error) {
            console.log('Error in stop speech command:', error);
          }
        }
      });
    }
  });
}