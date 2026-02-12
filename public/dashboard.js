// Dashboard Speech Recognition and Analysis

let recognition = null;
let isRecording = false;
let transcriptText = '';
let speechChunks = [];
let pauseCount = 0;
let lastSpeechTime = 0;
const PAUSE_THRESHOLD = 1000; // 1 second pause threshold

let userTier = 'free';
let usageData = { tier: 'free', usageCount: 0, limit: 3, remaining: 3, canUse: true };

// Initialize Speech Recognition
function initSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            isRecording = true;
            updateRecordButton(true);
            speechChunks = [];
            pauseCount = 0;
            lastSpeechTime = Date.now();
        };

        recognition.onresult = (event) => {
            const currentTime = Date.now();
            const timeSinceLastSpeech = currentTime - lastSpeechTime;
            
            // Detect pauses
            if (timeSinceLastSpeech > PAUSE_THRESHOLD && speechChunks.length > 0) {
                pauseCount++;
                speechChunks.push({
                    type: 'pause',
                    duration: timeSinceLastSpeech,
                    text: `( pause ${Math.round(timeSinceLastSpeech / 1000)}s )`
                });
            }

            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            if (finalTranscript) {
                // Detect tone indicators (question marks, exclamations)
                let processedText = finalTranscript;
                if (finalTranscript.includes('?')) {
                    processedText = processedText.replace(/\?/g, '? ( questioning tone )');
                }
                if (finalTranscript.includes('!')) {
                    processedText = processedText.replace(/!/g, '! ( emphatic tone )');
                }
                if (finalTranscript.toLowerCase().includes('um') || finalTranscript.toLowerCase().includes('uh')) {
                    processedText = processedText.replace(/\b(um|uh)\b/gi, '$1 ( filler word )');
                }

                speechChunks.push({
                    type: 'speech',
                    text: processedText,
                    timestamp: currentTime
                });
                lastSpeechTime = currentTime;
            }

            updateTranscript();
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            showError('Speech recognition error: ' + event.error);
            stopRecording();
        };

        recognition.onend = () => {
            if (isRecording) {
                // Restart recognition if still recording
                try {
                    recognition.start();
                } catch (e) {
                    console.error('Error restarting recognition:', e);
                    stopRecording();
                }
            }
        };
    } else {
        showError('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
    }
}

function updateRecordButton(recording) {
    const button = document.getElementById('recordButton');
    const buttonText = document.getElementById('recordButtonText');
    
    if (recording) {
        button.classList.add('recording');
        buttonText.textContent = 'Stop Recording';
    } else {
        button.classList.remove('recording');
        buttonText.textContent = 'Start Recording';
    }
}

function updateTranscript() {
    const transcriptContent = document.getElementById('transcriptContent');
    
    if (speechChunks.length === 0) {
        transcriptContent.textContent = 'No recording yet. Click "Start Recording" to begin.';
        transcriptContent.classList.add('empty');
        return;
    }

    transcriptContent.classList.remove('empty');
    
    // Format transcript with pauses and tone indicators
    transcriptText = speechChunks.map(chunk => {
        if (chunk.type === 'pause') {
            return chunk.text;
        } else {
            return chunk.text;
        }
    }).join(' ');

    transcriptContent.textContent = transcriptText;
}

function startRecording() {
    if (!recognition) {
        initSpeechRecognition();
    }
    
    if (recognition && !isRecording) {
        try {
            recognition.start();
        } catch (e) {
            console.error('Error starting recognition:', e);
            showError('Could not start recording. Please try again.');
        }
    }
}

function stopRecording() {
    isRecording = false;
    updateRecordButton(false);
    
    if (recognition) {
        recognition.stop();
    }

    // Finalize transcript before analysis
    updateTranscript();

    // Automatically analyze the transcript if there's content
    // Small delay to ensure transcript is fully updated and recognition has stopped
    setTimeout(() => {
        // Update transcript one more time to catch any final results
        updateTranscript();
        
        if (transcriptText.trim().length > 0) {
            analyzeTranscript();
        } else {
            showError('No speech detected. Please try recording again.');
        }
    }, 800);
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

async function analyzeTranscript() {
    const loadingDiv = document.querySelector('.loading');
    const ratingDisplay = document.getElementById('ratingDisplay');
    const feedbackList = document.getElementById('feedbackList');
    const tonalitySelect = document.getElementById('tonalitySelect');
    
    loadingDiv.style.display = 'block';
    ratingDisplay.style.display = 'none';
    feedbackList.innerHTML = '';

    const selectedTonality = tonalitySelect.value;

    try {
        // Note: In production, this should call your backend API which has the OpenAI API key
        const response = await fetchOpenAIAnalysis(transcriptText, selectedTonality);
        
        displayAnalysis(response);
    } catch (error) {
        console.error('Analysis error:', error);
        showError('Failed to analyze transcript. Please try again.');
    } finally {
        loadingDiv.style.display = 'none';
    }
}

async function fetchOpenAIAnalysis(transcript, tonality) {
    // IMPORTANT: Replace this with your actual backend endpoint
    // Never expose your OpenAI API key in frontend code
    
    try {
        // Backend API call - update the URL to match your backend
        // In production, set this to your actual backend URL
        const backendUrl = window.BACKEND_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : '');
        
        // Check if localhost - skip auth for localhost
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        // Get auth token (optional for localhost)
        const token = localStorage.getItem('tonr_token');
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (token && !isLocalhost) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${backendUrl}/api/analyze-speech`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ 
                transcript: transcript,
                tonality: tonality
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `API error: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        throw error; // Re-throw error instead of returning mock data
    }
}

function displayAnalysis(data) {
    const ratingNumber = document.getElementById('ratingNumber');
    const feedbackList = document.getElementById('feedbackList');
    const ratingDisplay = document.getElementById('ratingDisplay');
    
    // Display rating
    ratingNumber.textContent = data.rating;
    
    // Color code the rating
    if (data.rating >= 80) {
        ratingNumber.style.color = '#4ade80'; // green
    } else if (data.rating >= 60) {
        ratingNumber.style.color = '#fbbf24'; // yellow
    } else {
        ratingNumber.style.color = '#f87171'; // red
    }
    
    // Display feedback
    feedbackList.innerHTML = '';
    if (data.feedback && Array.isArray(data.feedback)) {
        data.feedback.forEach(feedback => {
            const li = document.createElement('li');
            li.textContent = feedback;
            feedbackList.appendChild(li);
        });
    }
    
    ratingDisplay.style.display = 'block';
}

async function checkUsage() {
    // Skip usage check for localhost
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalhost) {
        // Set default values for localhost - full access
        usageData = { tier: 'pro', usageCount: 0, limit: 'unlimited', remaining: 'unlimited', canUse: true };
        userTier = 'pro';
        updateUIForTier();
        return;
    }

    const token = localStorage.getItem('tonr_token');
    if (!token) return;

    try {
        const backendUrl = window.BACKEND_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : '');
        const response = await fetch(`${backendUrl}/api/user/usage`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            usageData = await response.json();
            userTier = usageData.tier;
            updateUIForTier();
        }
    } catch (error) {
        console.error('Usage check error:', error);
    }
}

function updateUIForTier() {
    const tonalitySelect = document.getElementById('tonalitySelect');
    const usageDisplay = document.getElementById('usageDisplay');
    
    // Enable/disable tonality selector based on tier
    if (userTier === 'free') {
        tonalitySelect.value = 'neutral';
        tonalitySelect.disabled = true;
        if (usageDisplay) {
            usageDisplay.textContent = `Free Tier: ${usageData.remaining || 0} refinements remaining today`;
        }
    } else {
        tonalitySelect.disabled = false;
        if (usageDisplay) {
            usageDisplay.textContent = 'Pro Tier: Unlimited refinements';
        }
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    const recordButton = document.getElementById('recordButton');
    
    // Check user tier and usage on load
    await checkUsage();
    
    recordButton.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    // Initialize speech recognition on page load
    initSpeechRecognition();
});

