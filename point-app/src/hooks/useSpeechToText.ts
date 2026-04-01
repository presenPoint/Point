import { useCallback, useRef, useState } from 'react';

const OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;

async function transcribeWithWhisper(audioBlob: Blob): Promise<string> {
  if (!OPENAI_KEY) throw new Error('OpenAI API 키가 설정되지 않았습니다.');

  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', 'whisper-1');
  formData.append('language', 'ko');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Whisper API 오류 (${res.status}): ${text}`);
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
      setError('OpenAI API 키가 설정되지 않았습니다. .env 파일에 VITE_OPENAI_API_KEY를 추가해주세요.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (chunksRef.current.length === 0) {
          setError('녹음된 오디오가 없습니다.');
          return;
        }

        const blob = new Blob(chunksRef.current, { type: mimeType });
        setTranscribing(true);

        try {
          const text = await transcribeWithWhisper(blob);
          if (text) {
            setTranscript(text);
          } else {
            setError('음성이 감지되지 않았습니다. 다시 시도해주세요.');
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : '음성 변환 중 오류가 발생했습니다.');
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setListening(true);
    } catch {
      setError('마이크 접근이 거부되었습니다. 브라우저 설정에서 마이크를 허용해주세요.');
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
