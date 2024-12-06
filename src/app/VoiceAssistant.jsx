'use client';

import { useState, useReducer, useRef, useLayoutEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';
import conversationReducer from './conversationReducer';

const initialConversation = { messages: [], finalTranscripts: [], interimTranscript: '' };

function VoiceAssistant() {
  const [conversation, dispatch] = useReducer(conversationReducer, initialConversation);
  const [isRunning, setIsRunning] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const sourceBufferRef = useRef(null);
  const audioElementRef = useRef(null);
  const backgroundAudioRef = useRef(null);
  const audioDataRef = useRef([]);
  const messagesEndRef = useRef(null);

  // Initialize background audio
  useLayoutEffect(() => {
    backgroundAudioRef.current = new Audio('/background-audio3.mp3');
    backgroundAudioRef.current.loop = true;
    backgroundAudioRef.current.volume = 0.4;

    return () => {
      if (backgroundAudioRef.current) {
        backgroundAudioRef.current.pause();
        backgroundAudioRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation]);

  function openWebSocketConnection() {
    const ws_url = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'wss://ai-backend-1-admin1339.replit.app/media-stream';
    wsRef.current = new WebSocket(ws_url);
    wsRef.current.binaryType = 'arraybuffer';

    function handleAudioStream(streamData) {
      audioDataRef.current.push(new Uint8Array(streamData));
      if (sourceBufferRef.current && !sourceBufferRef.current.updating) {
        sourceBufferRef.current.appendBuffer(audioDataRef.current.shift());
      }
    }

    function handleJsonMessage(jsonData) {
      const message = JSON.parse(jsonData);
      if (message.type === 'finish') {
        endConversation();
      } else {
        if (message.type === 'transcript_final' && isAudioPlaying()) {
          skipCurrentAudio();
        }
        if (message.type === 'audio_end') {
          // Restore background music volume when TTS ends
          if (backgroundAudioRef.current) {
            backgroundAudioRef.current.volume = 0.4;
          }
        }
        dispatch(message);
      }
    }

    wsRef.current.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        handleAudioStream(event.data);
      } else {
        handleJsonMessage(event.data);
      }
    };

    wsRef.current.onclose = () => {
      endConversation();
    }
  }

  function closeWebSocketConnection() {
    if (wsRef.current) {
      wsRef.current.close();
    }
  }

  async function startMicrophone() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorderRef.current = new MediaRecorder(stream);
    mediaRecorderRef.current.addEventListener('dataavailable', e => {
      if (e.data.size > 0 && wsRef.current.readyState == WebSocket.OPEN) {
        wsRef.current.send(e.data);
      }
    });
    mediaRecorderRef.current.start(250);
  }

  function stopMicrophone() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  }

  function startAudioPlayer() {
    // Start background music
    if (backgroundAudioRef.current) {
      backgroundAudioRef.current.play().catch(err => {
        console.log('Error playing background audio:', err);
      });
    }

    mediaSourceRef.current = new MediaSource();
    mediaSourceRef.current.addEventListener('sourceopen', () => {
      if (!MediaSource.isTypeSupported('audio/mpeg')) return;

      sourceBufferRef.current = mediaSourceRef.current.addSourceBuffer('audio/mpeg');
      sourceBufferRef.current.addEventListener('updateend', () => {
        if (audioDataRef.current.length > 0 && !sourceBufferRef.current.updating) {
          sourceBufferRef.current.appendBuffer(audioDataRef.current.shift());
        }
      });
    });

    const audioUrl = URL.createObjectURL(mediaSourceRef.current);
    audioElementRef.current = new Audio(audioUrl);
    audioElementRef.current.play().then(() => {
      // Lower background music volume while TTS plays
      if (backgroundAudioRef.current) {
        backgroundAudioRef.current.volume = 0.35;
      }
    });
  }

  function isAudioPlaying() {
    return audioElementRef.current?.readyState === HTMLMediaElement.HAVE_ENOUGH_DATA;
  }

  function skipCurrentAudio() {
    audioDataRef.current = [];
    const buffered = sourceBufferRef.current?.buffered;
    if (buffered?.length > 0) {
      if (sourceBufferRef.current.updating) {
        sourceBufferRef.current.abort();
      }
      audioElementRef.current.currentTime = buffered.end(buffered.length - 1);
    }
  }

  function stopAudioPlayer() {
    // Stop background music
    if (backgroundAudioRef.current) {
      backgroundAudioRef.current.pause();
      backgroundAudioRef.current.currentTime = 0;
    }

    if (audioElementRef.current) {
      audioElementRef.current.pause();
      URL.revokeObjectURL(audioElementRef.current.src);
      audioElementRef.current = null;
    }

    if (mediaSourceRef.current) {
      if (sourceBufferRef.current) {
        mediaSourceRef.current.removeSourceBuffer(sourceBufferRef.current);
        sourceBufferRef.current = null;
      }
      mediaSourceRef.current = null;
    }

    audioDataRef.current = [];
  }

  async function startConversation() {
    dispatch({ type: 'reset' });
    try {
      openWebSocketConnection();
      await startMicrophone();
      startAudioPlayer();
      setIsRunning(true);
      setIsListening(true);
    } catch (err) {
      console.log('Error starting conversation:', err);
      endConversation();
    }
  }

  function endConversation() {
    closeWebSocketConnection();
    stopMicrophone();
    stopAudioPlayer();
    setIsRunning(false);
    setIsListening(false);
  }

  function toggleListening() {
    if (isListening) {
      mediaRecorderRef.current.pause();
    } else {
      mediaRecorderRef.current.resume();
    }
    setIsListening(!isListening);
  }

  const currentTranscript = [...conversation.finalTranscripts, conversation.interimTranscript].join(' ');

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <header className="relative mb-12">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent animate-pulse">
            Voice AI Assistant
          </h1>
          <div className="absolute -bottom-4 left-0 w-32 h-1 bg-gradient-to-r from-purple-400 to-pink-600 rounded-full" />
        </header>

        <div className="relative mb-12">
          <div className={`absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 blur-xl transition-opacity duration-700 ${isRunning ? 'opacity-100' : 'opacity-0'}`} />

          <div className="relative backdrop-blur-sm bg-gray-800/50 rounded-2xl p-8 border border-gray-700">
            <div className="flex justify-center mb-8">
              <div className={`flex gap-1 items-center h-16 ${isRunning ? 'animate-bounce' : ''}`}>
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-1 bg-gradient-to-t from-purple-400 to-pink-600 rounded-full transform transition-all duration-300 ${
                      isRunning ? 'h-full animate-pulse' : 'h-2'
                    }`}
                    style={{
                      animationDelay: `${i * 0.1}s`,
                      transform: isRunning ? `scaleY(${Math.random() * 0.7 + 0.3})` : 'scaleY(1)'
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col items-center gap-6">
              <p className="text-sm text-gray-400">
                {isRunning
                  ? 'Say "goodbye" to end the conversation'
                  : 'Start your voice conversation'}
              </p>

              <div className="flex items-center gap-6">
                <button
                  onClick={isRunning ? endConversation : startConversation}
                  className="px-8 py-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-600 text-white font-medium hover:opacity-90 transition-all duration-300 hover:scale-105 active:scale-95"
                >
                  {isRunning ? 'End Conversation' : 'Start Conversation'}
                </button>

                <button
                  onClick={toggleListening}
                  disabled={!isRunning}
                  className={`p-4 rounded-full transition-all duration-300 ${
                    isRunning
                      ? 'bg-gradient-to-r from-purple-500 to-pink-600 hover:opacity-90 hover:scale-105 active:scale-95'
                      : 'bg-gray-700 opacity-50 cursor-not-allowed'
                  }`}
                >
                  {isListening ? (
                    <Mic className="w-6 h-6 animate-pulse" />
                  ) : (
                    <MicOff className="w-6 h-6" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {conversation.messages.map(({ role, content }, idx) => (
            <div
              key={idx}
              className={`max-w-[80%] p-4 rounded-2xl transition-all duration-300 animate-slideIn ${
                role === 'user'
                  ? 'ml-auto bg-gradient-to-r from-purple-500 to-pink-600'
                  : 'bg-gray-800 border border-gray-700'
              }`}
            >
              {content}
            </div>
          ))}
          {currentTranscript && (
            <div className="max-w-[80%] ml-auto p-4 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-600 animate-slideIn">
              {currentTranscript}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
}

export default VoiceAssistant;