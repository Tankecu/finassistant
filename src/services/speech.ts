/**
 * Слой речевого ввода. Сегодня — Web Speech API (браузерный, без ключей).
 * Позже сюда подключается внешний STT-провайдер с тем же интерфейсом.
 */

export interface SpeechProvider {
  readonly name: string;
  readonly available: boolean;
  /** Начать слушать. Возвращает функцию остановки. */
  listen(opts: {
    locale: string;
    onPartial: (text: string) => void;
    onFinal: (text: string) => void;
    onError: (message: string) => void;
  }): () => void;
}

class WebSpeechProvider implements SpeechProvider {
  readonly name = 'web-speech';
  private Ctor: (new () => SpeechRecognitionLike) | null = null;

  constructor() {
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => SpeechRecognitionLike)
      | undefined;
    this.Ctor = Ctor ?? null;
  }

  get available(): boolean {
    return this.Ctor !== null;
  }

  listen({ locale, onPartial, onFinal, onError }: Parameters<SpeechProvider['listen']>[0]): () => void {
    if (!this.Ctor) {
      onError('Распознавание речи недоступно в этом браузере');
      return () => undefined;
    }
    const rec = new this.Ctor();
    rec.lang = locale;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';

    rec.onresult = (e: SpeechRecognitionEventLike) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (finalText) onFinal(finalText.trim());
      else if (interim) onPartial(interim.trim());
    };
    rec.onerror = (e: SpeechRecognitionErrorEventLike) => {
      const messages: Record<string, string> = {
        'not-allowed': 'Нет доступа к микрофону',
        'service-not-allowed': 'Нет доступа к сервису распознавания',
        'no-speech': 'Речь не распознана',
        network: 'Нет сети для распознавания речи',
      };
      onError(messages[e.error] ?? 'Ошибка распознавания речи');
    };
    try {
      rec.start();
    } catch {
      onError('Не удалось запустить микрофон');
    }
    return () => {
      try {
        rec.stop();
      } catch {
        /* уже остановлен */
      }
    };
  }
}

/** Заглушка для браузеров без Web Speech — интерфейс тот же, распознавания нет. */
class NoopProvider implements SpeechProvider {
  readonly name = 'noop';
  readonly available = false;
  listen({ onError }: Parameters<SpeechProvider['listen']>[0]): () => void {
    onError('Голосовой ввод недоступен в этом браузере — используйте текст');
    return () => undefined;
  }
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

let provider: SpeechProvider | null = null;

export function getSpeechProvider(): SpeechProvider {
  if (provider) return provider;
  try {
    const web = new WebSpeechProvider();
    provider = web.available ? web : new NoopProvider();
  } catch {
    provider = new NoopProvider();
  }
  return provider;
}
