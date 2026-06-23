import { useCallback, useEffect, useRef, useState } from 'react';
import {
  defaultSpeechLang,
  getSpeechRecognition,
  speechErrorMessage,
  type SpeechRecognitionInstance,
} from '@shared/lib/speechRecognition';

interface UseVoiceInputOptions {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  lang?: string;
}

export function useVoiceInput({
  value,
  onChange,
  disabled = false,
  lang = defaultSpeechLang(),
}: UseVoiceInputOptions) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSupported = getSpeechRecognition() != null;

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const valueRef = useRef(value);
  const baseRef = useRef('');
  const finalsRef = useRef('');

  valueRef.current = value;

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    if (disabled) return;
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError('Voice input is not supported in this environment.');
      return;
    }

    setError(null);
    baseRef.current = valueRef.current;
    finalsRef.current = '';

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0]?.transcript ?? '';
        if (event.results[i].isFinal) {
          finalsRef.current += chunk;
        } else {
          interim += chunk;
        }
      }
      const prefix = baseRef.current;
      const finals = finalsRef.current;
      const glue = prefix && (finals || interim) && !prefix.endsWith(' ') ? ' ' : '';
      onChange(`${prefix}${glue}${finals}${interim}`);
    };

    recognition.onerror = (event) => {
      const msg = speechErrorMessage(event.error);
      if (msg) setError(msg);
      if (event.error !== 'aborted') {
        recognitionRef.current = null;
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch {
      setError('Could not start microphone.');
      recognitionRef.current = null;
      setIsListening(false);
    }
  }, [disabled, lang, onChange]);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (disabled && isListening) stop();
  }, [disabled, isListening, stop]);

  return { isSupported, isListening, error, toggle, stop, start };
}
