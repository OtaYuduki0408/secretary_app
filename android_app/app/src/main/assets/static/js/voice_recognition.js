const startBtn = document.querySelector('.mic-btn');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('searchbox');
const logContainer = document.getElementById('voice-log-container');
const forceAbortBtn = document.getElementById("force-abort-btn");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
  startBtn.disabled = true;
  searchInput.placeholder = "音声認識はサポートされていません";
}

const recognition = new SpeechRecognition();
recognition.lang = 'ja-JP';
recognition.interimResults = true;
recognition.continuous = false;

window.startRecognition = () => {
  try {
    recognition?.start();
  } catch (e) {
    console.error("recognition.start 失敗", e);
  }
};

let wakeWords = [];

const updateWakeWords = () => {
    try {
        const raw = localStorage.getItem('appSettings');
        if (raw) {
            const settings = JSON.parse(raw);
            wakeWords = (settings?.main?.wakeWords || '').split(',').map(w => w.trim()).filter(Boolean);
            console.log('Wake words updated:', wakeWords);
        }
    } catch (e) {
        console.warn('Failed to load wake words from settings', e);
    }
};

updateWakeWords();
window.addEventListener('storage', (event) => {
    if (event.key === 'appSettings') {
        updateWakeWords();
    }
});

const addLog = (text, isInterim = false) => {
  if (!logContainer) return;
  
  let highlightedText = text;
  if(wakeWords.length > 0) {
    wakeWords.forEach(word => {
      const regex = new RegExp(word, 'gi');
      highlightedText = highlightedText.replace(regex, `<span class="highlight-wake-word">${word}</span>`);
    });
  }

  const entry = document.createElement('div');
  entry.className = isInterim ? 'voice-log-entry log-interim' : 'voice-log-entry';
  entry.innerHTML = highlightedText; // Use innerHTML to render the span
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight; // Auto-scroll
};

recognition.onresult = (event) => {
  const transcript = Array.from(event.results)
    .map(result => result[0])
    .map(result => result.transcript)
    .join('');

  const isFinal = event.results[event.results.length - 1].isFinal;

  // Clear previous interim results
  const interims = logContainer.querySelectorAll('.log-interim');
  interims.forEach(i => i.remove());

  addLog(transcript, !isFinal);

  if (isFinal) {
    if(wakeWords.some(w => transcript.includes(w))) {
        const command = transcript.split(wakeWords.find(w => transcript.includes(w)))[1].trim();
        if(command) searchInput.value = command;
    } else {
        searchInput.value = transcript;
    }
    searchForm.dispatchEvent(new Event('submit', { cancelable: true }));
  }
};

recognition.onstart = () => {
  console.log('Voice recognition started');
  startBtn.classList.add('is-recording');
  forceAbortBtn.disabled = false; // Enable abort button
};

recognition.onend = () => {
  console.log('Voice recognition ended');
  startBtn.classList.remove('is-recording');
  forceAbortBtn.disabled = true; // Disable abort button
};

recognition.onerror = (event) => {
  console.error('Voice recognition error', event.error);
  addLog(`エラー: ${event.error}`, false);
  startBtn.classList.remove('is-recording');
  forceAbortBtn.disabled = true;
};

startBtn.addEventListener('click', () => {
  try {
    recognition?.start();
  } catch (e) {
    console.error("recognition.start 失敗", e);
  }
});

forceAbortBtn.addEventListener('click', () => {
    if (recognition) {
        recognition.abort();
        console.log("Voice recognition aborted by user.");
    }
});

searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = searchInput.value;
  if (!query) return;
  addLog(`> ${query}`);

  try {
    if(window.AndroidSync?.post) {
      window.AndroidSync.post(query);
    } else {
      console.error('AndroidSync.post not available');
    }
  } catch (error) {
    console.error('Error posting query:', error);
  }
  searchInput.value = ''; // Clear input after submission
});
