import { useT } from '../../lib/i18n';
import './chrome.css';

export function LangSwitch() {
  const { t, lang, setLang } = useT();
  return (
    <div role="group" aria-label={t('shell.language')} className="shell-lang">
      <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
        EN
      </button>
      <button type="button" aria-pressed={lang === 'hi'} onClick={() => setLang('hi')}>
        हि
      </button>
    </div>
  );
}
