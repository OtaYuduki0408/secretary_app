(() => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isListening = false;
  let bridgePromise = null;
  let cachedBridge = null;

  const waitForBridge = () => {
    if (cachedBridge || window.SpotifyVoiceBridge) {
      cachedBridge = cachedBridge || window.SpotifyVoiceBridge;
      return Promise.resolve(cachedBridge);
    }
    if (!bridgePromise) {
      bridgePromise = new Promise((resolve) => {
        const handler = (event) => {
          cachedBridge = event.detail || window.SpotifyVoiceBridge;
          window.removeEventListener('spotify:voice-bridge-ready', handler);
          resolve(cachedBridge);
        };
        window.addEventListener('spotify:voice-bridge-ready', handler);
      });
    }
    return bridgePromise;
  };

  const setStatus = (message) => {
    const statusEl = document.getElementById('spotify-voice-status');
    if (statusEl) statusEl.textContent = message;
    if (cachedBridge && typeof cachedBridge.setStatus === 'function') {
      cachedBridge.setStatus(message);
    }
  };

  const extractPlaylistName = (text) => {
    const match = text.match(/(?:この曲を)?(.+?)(?:の)?(?:プレイリスト)?に追加/);
    if (!match) return '';
    return (match[1] || '').replace(/この曲|プレイリスト|を|は|の/g, '').trim();
  };

  const handleCommand = async (phrase) => {
    const trimmed = (phrase || '').trim();
    if (!trimmed) {
      throw new Error('音声が認識できませんでした。');
    }
    const command = trimmed.replace(/[。、，．！？!?]/g, ' ').replace(/\s+/g, ' ').trim();
    const bridge = await waitForBridge();

    if (/(次|つぎ)の?曲/.test(command)) {
      await bridge.nextTrack();
      setStatus('次の曲を再生します。');
      return;
    }

    const searchMatch = command.match(/(.+?)を(?:検索|探して|さがして)/);
    if (searchMatch) {
      const keyword = (searchMatch[1] || '').trim();
      if (!keyword) throw new Error('検索キーワードを取得できませんでした。');
      await bridge.searchTracks(keyword);
      setStatus(`「${keyword}」を検索しました。`);
      return;
    }

    if (command.includes('追加')) {
      const playlistName = extractPlaylistName(command);
      await bridge.addCurrentTrackToPlaylist({ playlistName });
      const label = playlistName || '選択中のプレイリスト';
      setStatus(`${label}に現在の曲を追加しました。`);
      return;
    }

    throw new Error('対応していないコマンドです。');
  };

  document.addEventListener('DOMContentLoaded', () => {
    const micButton = document.getElementById('spotify-voice-btn');
    if (!micButton) return;

    if (!SpeechRecognition) {
      micButton.disabled = true;
      micButton.setAttribute('aria-pressed', 'false');
      setStatus('このブラウザは音声認識に対応していません。');
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      isListening = true;
      micButton.setAttribute('aria-pressed', 'true');
      micButton.classList.add('active');
      setStatus('音声を認識しています...');
    };

    recognition.onend = () => {
      isListening = false;
      micButton.setAttribute('aria-pressed', 'false');
      micButton.classList.remove('active');
      if (!cachedBridge) {
        waitForBridge().catch(() => {});
      }
    };

    recognition.onerror = (event) => {
      console.error('spotify voice error', event.error);
      isListening = false;
      micButton.setAttribute('aria-pressed', 'false');
      micButton.classList.remove('active');
      setStatus(`音声認識エラー: ${event.error}`);
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        handleCommand(finalTranscript).catch((err) => {
          console.error(err);
          setStatus(err.message);
        });
      }
    };

    micButton.addEventListener('click', () => {
      if (!recognition) return;
      if (isListening) {
        recognition.stop();
        return;
      }
      try {
        recognition.start();
      } catch (err) {
        console.error('voice start failed', err);
        setStatus('音声認識を開始できませんでした。');
      }
    });

    setStatus('マイクボタンで音声コマンドを開始できます。');
  });
})();
