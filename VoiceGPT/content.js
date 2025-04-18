// Global variables
let isListening = false;
let recognition = null;
let synthesis = window.speechSynthesis;
let currentUtterance = null;
let apiKey = null;
let selectedModel = 'mistral-large';
let speechRate = 1.0;
let selectedVoice = null;
let domTree = null;

// Initialize when the content script is injected
initialize();

// Set up message listener immediately
chrome.runtime.onMessage.addListener(handleMessage);

// Timeout for debouncing DOM updates
let domUpdateTimeout = null;

// Main initialization function
function initialize() {
  // Create DOM tree representation for navigation
  buildDOMTree();
  
  // Set up keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcut);
  
  // Load settings
  loadSettings();
  
  // Add listener for DOM changes to update our DOM tree
  const observer = new MutationObserver(() => {
    // Debounce the DOM tree rebuilding to avoid performance issues
    clearTimeout(domUpdateTimeout);
    domUpdateTimeout = setTimeout(() => buildDOMTree(), 2000);
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  });
  
  // Notify that content script is ready
  chrome.runtime.sendMessage({ action: 'contentScriptReady' });
}

// Build structured representation of the DOM for intelligent navigation
function buildDOMTree() {
  domTree = {
    title: document.title,
    headings: [],
    links: [],
    tables: [],
    forms: [],
    images: [],
    lists: [],
    paragraphs: [],
    structure: {}
  };
  
  // Collect all headings
  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headings.forEach((heading, index) => {
    domTree.headings.push({
      id: index,
      level: parseInt(heading.tagName[1]),
      text: heading.textContent.trim(),
      element: heading
    });
  });
  
  // Collect all tables with some metadata
  const tables = document.querySelectorAll('table');
  tables.forEach((table, index) => {
    const tableData = {
      id: index,
      caption: table.querySelector('caption')?.textContent.trim() || null,
      headers: [],
      rowCount: table.querySelectorAll('tr').length,
      element: table
    };
    
    const headerCells = table.querySelectorAll('th');
    headerCells.forEach(cell => {
      tableData.headers.push(cell.textContent.trim());
    });
    
    domTree.tables.push(tableData);
  });
  
  // Collect all forms
  const forms = document.querySelectorAll('form');
  forms.forEach((form, index) => {
    domTree.forms.push({
      id: index,
      inputs: form.querySelectorAll('input, select, textarea').length,
      element: form
    });
  });
  
  // Collect all images with alt text
  const images = document.querySelectorAll('img');
  images.forEach((image, index) => {
    domTree.images.push({
      id: index,
      alt: image.alt || null,
      src: image.src,
      element: image
    });
  });
}

// Handle messages from popup.js or background.js
function handleMessage(message, sender, sendResponse) {
  // Special ping handler to check if content script is available
  if (message.action === 'ping') {
    sendResponse({ status: 'ok' });
    return true;
  }
  
  switch (message.action) {
    case 'startListening':
      startVoiceRecognition();
      sendResponse({ status: 'started' });
      break;
    case 'stopListening':
      stopVoiceRecognition();
      sendResponse({ status: 'stopped' });
      break;
    case 'toggleVoiceInput':
      if (isListening) {
        stopVoiceRecognition();
        sendResponse({ status: 'stopped' });
      } else {
        startVoiceRecognition();
        sendResponse({ status: 'started' });
      }
      break;
    case 'stopSpeech':
      if (currentUtterance) {
        synthesis.cancel();
        currentUtterance = null;
        sendResponse({ status: 'speech_stopped' });
      }
      break;
    case 'processQuery':
      processUserQuery(message.query)
        .then(response => sendResponse({ response }))
        .catch(error => sendResponse({ error: error.message }));
      return true; // Required for async sendResponse
    case 'updateSettings':
      updateSettings(message.settings);
      sendResponse({ status: 'settings_updated' });
      break;
    case 'getPageInfo':
      sendResponse({
        url: window.location.href,
        title: document.title,
        domTree: domTree
      });
      break;
    case 'testApi':
      testApiConnection()
        .then(success => sendResponse({ success }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
  }
  return true; // Indicates async response
}

// Start voice recognition
function startVoiceRecognition() {
  if (isListening || !window.webkitSpeechRecognition) return;
  
  recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  
  recognition.onstart = () => {
    isListening = true;
    speakResponse("I'm listening");
    chrome.runtime.sendMessage({ action: 'updateStatus', status: 'listening' });
  };
  
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    chrome.runtime.sendMessage({ 
      action: 'newUserMessage', 
      message: transcript 
    });
    
    processUserQuery(transcript);
  };
  
  recognition.onerror = (event) => {
    console.error('Speech recognition error', event.error);
    chrome.runtime.sendMessage({ 
      action: 'recognitionError', 
      error: event.error 
    });
    isListening = false;
  };
  
  recognition.onend = () => {
    if (isListening) {
      recognition.start(); // Restart listening
    } else {
      chrome.runtime.sendMessage({ action: 'updateStatus', status: 'inactive' });
    }
  };
  
  recognition.start();
}

// Stop voice recognition
function stopVoiceRecognition() {
  if (recognition) {
    isListening = false;
    recognition.stop();
  }
  
  if (currentUtterance) {
    synthesis.cancel();
  }
}

// Process the user's voice query
async function processUserQuery(query) {
  chrome.runtime.sendMessage({ action: 'updateStatus', status: 'processing' });
  
  try {
    // Extract page content relevant to the query
    const pageContent = extractRelevantContent(query);
    
    // Process navigation commands
    if (isNavigationCommand(query)) {
      handleNavigation(query);
      return;
    }
    
    // First try to use local responses for common queries
    const localResponse = getFallbackResponse(query, pageContent);
    
    // If we have a non-default local response, use it
    if (localResponse) {
      // Send the response back to popup
      chrome.runtime.sendMessage({
        action: 'newAssistantMessage',
        message: localResponse
      });
      
      // Speak the response
      speakResponse(localResponse);
      
      return localResponse;
    }
    
    // Otherwise use AI to generate a response
    const response = await generateAIResponse(query, pageContent);
    
    // Send the response back to popup
    chrome.runtime.sendMessage({
      action: 'newAssistantMessage',
      message: response
    });
    
    // Speak the response
    speakResponse(response);
    
    return response;
  } catch (error) {
    console.error('Error processing query:', error);
    
    // Use fallback response in case of error
    const fallbackMsg = getFallbackResponse(query, extractRelevantContent(query)) || 
                        "Sorry, I encountered an error processing your request.";
    
    chrome.runtime.sendMessage({ 
      action: 'updateStatus', 
      status: 'error' 
    });
    
    chrome.runtime.sendMessage({
      action: 'newAssistantMessage',
      message: fallbackMsg
    });
    
    speakResponse(fallbackMsg);
    return fallbackMsg;
  }
}

// Check if the query is a navigation command
function isNavigationCommand(query) {
  const navigationKeywords = [
    'go to', 'navigate to', 'find', 'scroll to', 'skip to',
    'show me', 'take me to', 'where is'
  ];
  
  return navigationKeywords.some(keyword => 
    query.toLowerCase().includes(keyword)
  );
}

// Handle navigation commands
function handleNavigation(query) {
  query = query.toLowerCase();
  
  // Find target element based on query
  let targetElement = null;
  
  // Check for heading navigation
  if (query.includes('heading') || query.includes('section')) {
    const headingMatch = query.match(/h(\d)|heading (\d)|section (\d)/);
    const headingText = extractTextBetweenKeywords(query, ['to', 'the'], ['heading', 'section']);
    
    if (headingMatch) {
      // Navigate to specific heading level
      const level = headingMatch[1] || headingMatch[2] || headingMatch[3];
      const headings = domTree.headings.filter(h => h.level === parseInt(level));
      if (headings.length > 0) targetElement = headings[0].element;
    } else if (headingText) {
      // Navigate to heading by text
      const heading = domTree.headings.find(h => 
        h.text.toLowerCase().includes(headingText.toLowerCase())
      );
      if (heading) targetElement = heading.element;
    }
  }
  
  // Check for table navigation
  else if (query.includes('table')) {
    const tableIndex = extractNumberAfterKeyword(query, 'table');
    const tableText = extractTextBetweenKeywords(query, ['to', 'the'], ['table']);
    
    if (tableIndex !== null && tableIndex < domTree.tables.length) {
      targetElement = domTree.tables[tableIndex].element;
    } else if (tableText) {
      // Find table by caption or content
      const table = domTree.tables.find(t => 
        (t.caption && t.caption.toLowerCase().includes(tableText.toLowerCase())) ||
        t.headers.some(h => h.toLowerCase().includes(tableText.toLowerCase()))
      );
      if (table) targetElement = table.element;
    } else if (domTree.tables.length > 0) {
      // Default to first table
      targetElement = domTree.tables[0].element;
    }
  }
  
  // Check for link navigation
  else if (query.includes('link')) {
    const linkText = extractTextBetweenKeywords(query, ['to', 'the'], ['link']);
    if (linkText) {
      const links = document.querySelectorAll('a');
      for (const link of links) {
        if (link.textContent.toLowerCase().includes(linkText.toLowerCase())) {
          targetElement = link;
          break;
        }
      }
    }
  }
  
  // Check for image navigation
  else if (query.includes('image') || query.includes('picture')) {
    const imageText = extractTextBetweenKeywords(
      query, 
      ['to', 'the'], 
      ['image', 'picture']
    );
    
    if (imageText) {
      const image = domTree.images.find(img => 
        img.alt && img.alt.toLowerCase().includes(imageText.toLowerCase())
      );
      if (image) targetElement = image.element;
    } else if (domTree.images.length > 0) {
      // Default to first image
      targetElement = domTree.images[0].element;
    }
  }
  
  // Perform the navigation
  if (targetElement) {
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Provide feedback
    const elementDescription = getElementDescription(targetElement);
    speakResponse(`Navigated to ${elementDescription}`);
    
    // Highlight the element temporarily
    highlightElement(targetElement);
  } else {
    speakResponse("I couldn't find what you're looking for on this page.");
  }
}

// Extract text between keywords in a query
function extractTextBetweenKeywords(text, startKeywords, endKeywords) {
  text = text.toLowerCase();
  let startIndex = -1;
  let endIndex = text.length;
  
  // Find start position
  for (const keyword of startKeywords) {
    const index = text.indexOf(keyword);
    if (index !== -1 && (startIndex === -1 || index > startIndex)) {
      startIndex = index + keyword.length;
    }
  }
  
  // Find end position
  for (const keyword of endKeywords) {
    const index = text.indexOf(keyword);
    if (index !== -1 && index < endIndex) {
      endIndex = index;
    }
  }
  
  if (startIndex === -1) startIndex = 0;
  
  const extractedText = text.substring(startIndex, endIndex).trim();
  return extractedText || null;
}

// Extract number after a keyword
function extractNumberAfterKeyword(text, keyword) {
  const regex = new RegExp(keyword + '\\s*(\\d+)', 'i');
  const match = text.match(regex);
  return match ? parseInt(match[1]) - 1 : null; // Convert to 0-based index
}

// Get a description of an element for speech feedback
function getElementDescription(element) {
  const tagName = element.tagName.toLowerCase();
  
  switch (tagName) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return `heading "${element.textContent.trim()}"`;
    
    case 'table':
      const caption = element.querySelector('caption');
      return caption 
        ? `table "${caption.textContent.trim()}"`
        : `table with ${element.querySelectorAll('tr').length} rows`;
    
    case 'a':
      return `link "${element.textContent.trim()}"`;
    
    case 'img':
      return element.alt 
        ? `image with description "${element.alt}"`
        : 'image';
    
    default:
      return tagName;
  }
}

// Highlight an element temporarily
function highlightElement(element) {
  const originalStyles = {
    outline: element.style.outline,
    outlineOffset: element.style.outlineOffset,
    transition: element.style.transition
  };
  
  element.style.outline = '3px solid #4285f4';
  element.style.outlineOffset = '2px';
  element.style.transition = 'outline 0.3s ease-in-out';
  
  setTimeout(() => {
    element.style.outline = originalStyles.outline;
    element.style.outlineOffset = originalStyles.outlineOffset;
    element.style.transition = originalStyles.transition;
  }, 3000); // Remove highlight after 3 seconds
}

// Extract relevant content from the page based on the query
function extractRelevantContent(query) {
  const pageInfo = {
    title: document.title,
    url: window.location.href,
    metaDescription: document.querySelector('meta[name="description"]')?.content || '',
    headings: [],
    mainContent: '',
  };
  
  // Extract main content
  const mainElement = document.querySelector('main') || document.body;
  let mainContent = '';
  
  // Try to identify the main content area and extract text
  const contentSelectors = [
    'article', 
    '[role="main"]', 
    '.content', 
    '#content',
    '.main', 
    '#main',
    '.post', 
    '.entry'
  ];
  
  let contentElement = null;
  
  for (const selector of contentSelectors) {
    contentElement = document.querySelector(selector);
    if (contentElement) break;
  }
  
  if (!contentElement) contentElement = mainElement;
  
  // Get text content, removing script and style elements
  const clonedContent = contentElement.cloneNode(true);
  
  // Remove script and style elements
  const scriptsAndStyles = clonedContent.querySelectorAll('script, style, noscript');
  scriptsAndStyles.forEach(el => el.remove());
  
  mainContent = clonedContent.textContent
    .replace(/\s+/g, ' ')
    .trim();
  
  // Limit to reasonable size
  pageInfo.mainContent = mainContent.substring(0, 5000);
  
  // Get headings
  const headings = document.querySelectorAll('h1, h2, h3');
  headings.forEach(heading => {
    pageInfo.headings.push({
      level: parseInt(heading.tagName[1]),
      text: heading.textContent.trim()
    });
  });
  
  // If the query is about a specific part of the page, extract that part
  if (query.includes('table')) {
    pageInfo.tables = [];
    document.querySelectorAll('table').forEach((table, index) => {
      const caption = table.querySelector('caption')?.textContent.trim() || `Table ${index + 1}`;
      let headers = [];
      table.querySelectorAll('th').forEach(th => headers.push(th.textContent.trim()));
      
      // Get content from first few rows as sample
      let rows = [];
      table.querySelectorAll('tr').forEach((tr, rowIndex) => {
        if (rowIndex < 5) {  // Limit to first 5 rows
          let cells = [];
          tr.querySelectorAll('td').forEach(td => cells.push(td.textContent.trim()));
          rows.push(cells);
        }
      });
      
      pageInfo.tables.push({ caption, headers, rows });
    });
  }
  
  return pageInfo;
}

// Generate a response using AI API
async function generateAIResponse(query, pageContent) {
  // Check for API key
  if (!apiKey) {
    console.log("Missing API key");
    return "Please set up your API key in the extension settings.";
  }
  
  console.log("Using model:", selectedModel);
  
  try {
    // Mistral API format
    const apiEndpoint = 'https://api.mistral.ai/v1/chat/completions';
    
    // Use the correct model format
    const modelName = selectedModel === 'mistral-large' ? 'mistral-large-latest' : 'mistral-small-latest';
    
    const requestBody = {
      model: modelName,
      messages: [
        { 
          "role": "system", 
          "content": "You are VoiceGPT, an AI screen reader assistant for visually impaired users. Provide helpful, concise responses about webpage content."
        },
        {
          "role": "user",
          "content": `I'm on this webpage: "${pageContent.title}"
                     
                     My question is: "${query}"
                     
                     Here is relevant content from the page:
                     ${pageContent.mainContent.substring(0, 1000)}`
        }
      ]
    };
    
    console.log("Sending request to Mistral API...");
    
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log("Response status:", response.status);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error("API error details:", errorData);
      throw new Error(`API error (${response.status}): ${JSON.stringify(errorData)}`);
    }
    
    const data = await response.json();
    console.log("API response received");
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    } else {
      console.error("Unexpected response format:", data);
      throw new Error("Invalid response format from API");
    }
    
  } catch (error) {
    console.error('Error generating AI response:', error);
    return `Sorry, I had trouble generating a response: ${error.message}. Please check the API key and try again.`;
  }
}

// Get fallback response for common queries
function getFallbackResponse(query, pageContent) {
  // Convert query to lowercase for easier matching
  const q = query.toLowerCase();
  
  // Basic information about the page
  if (q.includes("what is this page") || q.includes("what's this page") || 
      q.includes("about this page") || q.includes("tell me about this page")) {
    return `This page is about ${pageContent.title}. It appears to be a ${detectPageType(pageContent)} page.`;
  }
  
  // Navigation requests
  if (q.includes("go to") || q.includes("navigate to") || q.includes("find")) {
    return null; // Let the navigation handler handle this
  }
  
  // Heading count and structure
  if (q.includes("headings") || q.includes("sections")) {
    const headingCount = pageContent.headings.length;
    let headingPreview = "";
    
    if (headingCount > 0 && headingCount <= 5) {
      headingPreview = pageContent.headings.map(h => h.text).join(", ");
      return `This page has ${headingCount} main sections: ${headingPreview}.`;
    } else if (headingCount > 5) {
      headingPreview = pageContent.headings.slice(0, 5).map(h => h.text).join(", ");
      return `This page has ${headingCount} sections. The first few are: ${headingPreview}, and more.`;
    } else {
      return `This page doesn't have clearly defined sections with headings.`;
    }
  }
  
  // Table information
  if (q.includes("table") || q.includes("tables")) {
    const tableCount = document.querySelectorAll('table').length;
    if (tableCount > 0) {
      return `I found ${tableCount} table${tableCount > 1 ? 's' : ''} on this page.`;
    } else {
      return "I don't see any tables on this page.";
    }
  }
  
  // Images
  if (q.includes("image") || q.includes("picture") || q.includes("photo")) {
    const imageCount = document.querySelectorAll('img').length;
    return `This page contains ${imageCount} image${imageCount !== 1 ? 's' : ''}.`;
  }
  
  // Help or instructions
  if (q.includes("help") || q.includes("what can you do") || q.includes("how do you work")) {
    return `I can help you navigate this page and understand its content. Try asking things like "What is this page about?", "Go to the section about X", or "Summarize this page."`;
  }
  
  // Greeting
  if (q.includes("hello") || q.includes("hi ")) {
    return "Hello! I'm your VoiceGPT assistant. How can I help you with this page?";
  }
  
  // Default - return null to indicate we should use AI response
  return null;
}

// Helper function to guess the type of page
function detectPageType(pageContent) {
  const title = pageContent.title.toLowerCase();
  const url = pageContent.url.toLowerCase();
  
  if (url.includes("wikipedia.org")) {
    return "Wikipedia article";
  } else if (title.includes("news") || url.includes("news")) {
    return "news";
  } else if (url.includes("blog") || title.includes("blog")) {
    return "blog";
  } else if (document.querySelectorAll('form').length > 0) {
    return "form or application";
  } else if (document.querySelectorAll('product').length > 0 || 
             url.includes("shop") || url.includes("store")) {
    return "shopping or product";
  } else {
    return "informational";
  }
}

// Speak the response using speech synthesis
function speakResponse(text) {
  if (!synthesis) return;
  
  // Cancel any ongoing speech
  if (currentUtterance) {
    synthesis.cancel();
  }
  
  currentUtterance = new SpeechSynthesisUtterance(text);
  
  // Apply settings
  if (selectedVoice) {
    currentUtterance.voice = selectedVoice;
  }
  
  currentUtterance.rate = speechRate;
  
  synthesis.speak(currentUtterance);
  
  currentUtterance.onend = () => {
    currentUtterance = null;
    if (isListening) {
      // Resume listening after speaking ends
      chrome.runtime.sendMessage({ action: 'updateStatus', status: 'listening' });
    }
  };
}

// Handle keyboard shortcuts
function handleKeyboardShortcut(event) {
  // Alt+Shift+V to toggle voice input
  if (event.altKey && event.shiftKey && event.key === 'V') {
    event.preventDefault();
    if (isListening) {
      stopVoiceRecognition();
    } else {
      startVoiceRecognition();
    }
  }
  
  // Alt+Shift+S to stop speech
  if (event.altKey && event.shiftKey && event.key === 'S') {
    event.preventDefault();
    if (currentUtterance) {
      synthesis.cancel();
      currentUtterance = null;
    }
  }
}

// Function to load settings from storage
function loadSettings() {
  chrome.storage.sync.get(
    {
      apiKey: '',
      model: 'mistral-large', // Default to Mistral Large
      speechRate: 1.0,
      voiceName: ''
    },
    (items) => {
      apiKey = items.apiKey;
      selectedModel = items.model;
      speechRate = items.speechRate;
      
      // Set the voice if available
      if (items.voiceName && synthesis) {
        const voices = synthesis.getVoices();
        selectedVoice = voices.find(voice => voice.name === items.voiceName);
      }
      
      console.log("Settings loaded. Using model:", selectedModel);
    }
  );
}

// Function to update settings
function updateSettings(settings) {
  if (settings.apiKey !== undefined) {
    apiKey = settings.apiKey;
  }
  
  if (settings.model !== undefined) {
    selectedModel = settings.model;
  }
  
  if (settings.speechRate !== undefined) {
    speechRate = parseFloat(settings.speechRate);
  }
  
  if (settings.voiceName !== undefined && synthesis) {
    const voices = synthesis.getVoices();
    selectedVoice = voices.find(voice => voice.name === settings.voiceName);
  }
}

// Test the API connection directly
async function testApiConnection() {
  try {
    const testMessage = "Hello";
    console.log("Testing API connection with key:", apiKey ? "Key exists" : "No API key");
    
    if (!apiKey) {
      speakResponse("No API key provided. Please enter an API key in the settings.");
      return false;
    }
    
    // Mistral API format
    const apiEndpoint = 'https://api.mistral.ai/v1/chat/completions';
    const modelName = 'mistral-small-latest'; // Use small model for test
    
    const requestBody = {
      model: modelName,
      messages: [
        { 
          "role": "user", 
          "content": "Say hello briefly"
        }
      ]
    };
    
    console.log("Sending test request to Mistral API...");
    
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log("Test response status:", response.status);
    
    const data = await response.json();
    console.log("Test API response:", data);
    
    if (response.ok) {
      speakResponse("API connection successful");
      return true;
    } else {
      speakResponse("API connection failed: " + (data.error?.message || "Unknown error"));
      return false;
    }
  } catch (error) {
    console.error("API test error:", error);
    speakResponse("API test error: " + error.message);
    return false;
  }
}