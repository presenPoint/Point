import { useCallback, useRef, useState } from 'react';
import { hasOpenAI, transcribeAudioBlob } from '../lib/openai';

interface MimeChoice { mimeType: string; ext: string }

function pickAudioMime(): MimeChoice {
  const candidates: MimeChoice[] = [
    { mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
    { mimeType: 'audio/webm', ext: 'webm' },
    { mimeType: 'audio/ogg;codecs=opus', ext: 'ogg' },
    { mimeType: 'audio/ogg', ext: 'ogg' },
    { mimeType: 'audio/mp4', ext: 'mp4' },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return { mimeType: '', ext: 'webm' };
}

export function useSpeechToText() {
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    setError(null);
    setTranscript('');

    if (!hasOpenAI()) {
      setError(
        'OpenAI is not configured. Production: set OPENAI_API_KEY on Vercel and VITE_OPENAI_SERVER_PROXY=1 for the build. Local: add VITE_OPENAI_API_KEY to .env or run vercel dev with the proxy.',
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const { mimeType, ext } = pickAudioMime();
      const recorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, recorderOptions);
      const actualExt = ext;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (chunksRef.current.length === 0) {
          setError('No audio was recorded.');
          return;
        }

        const blobType = mimeType || recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: blobType });
        setTranscribing(true);

        try {
          const text = await transcribeAudioBlob(blob, actualExt);
          if (text) {
            setTranscript(text);
          } else {
            setError('No speech detected. Please try again.');
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'An error occurred during transcription.');
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setListening(true);
    } catch {
      setError('Microphone access denied. Please allow microphone in browser settings.');
    }
  }, []);

  const stop = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setTranscript('');
    setError(null);
    setTranscribing(false);
  }, [stop]);

  return { transcript, listening, transcribing, error, start, stop, reset, setTranscript };
}
