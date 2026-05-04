import { useCallback, useRef, useState } from 'react';

const OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;

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

async function transcribeWithWhisper(audioBlob: Blob, ext: string): Promise<string> {
  if (!OPENAI_KEY) throw new Error('OpenAI API key is not configured.');

  const formData = new FormData();
  formData.append('file', audioBlob, `audio.${ext}`);
  formData.append('model', 'whisper-1');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Whisper API error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { text?: string };
  return data.text?.trim() ?? '';
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

    if (!OPENAI_KEY) {
      setError('OpenAI API key is not set. Please add VITE_OPENAI_API_KEY to your .env file.');
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
          const text = await transcribeWithWhisper(blob, actualExt);
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
