import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { getLang, useLang } from '../lib/i18n.js'
import { decodePlanLink, extractPlanLinkPayload, PLAN_LINK_LIMITS } from '../lib/plan-link.js'
import { parsePlan } from '../lib/plan-share.js'
import { planImportSheet } from '../sheets.jsx'
import { Button, TextArea, TextField } from '../components/ui.jsx'

// This local-only addition has Russian and English copy; the upstream locale packs stay intact.
const copy = {
  ru: {
    title: 'Добавить программу по ссылке', link: 'Ссылка на программу', code: 'Код доступа',
    hint: 'Скопируй ссылку из сообщения и вставь её ниже. Затем введи код доступа из того же сообщения.',
    placeholder: 'Вставь сюда ссылку на программу', paste: 'На iPhone: зажми поле и выбери «Вставить».',
    iphone: 'Если GYM установлен на главный экран, вставляй ссылку здесь, открыв GYM с его иконки. В Safari может быть отдельный дневник.',
    ready: 'Зашифрованная программа получена. Введи код доступа.',
    preview: 'Посмотреть программу', busy: 'Открываем…', cancel: 'Отмена',
    invalid: 'Не удалось открыть программу. Проверь ссылку и код доступа.',
    unsupported: 'Обнови iOS/Safari: браузер не поддерживает защищённые ссылки. Импорт файла плана остаётся доступен.',
    private: 'Программа открывается и сохраняется на этом устройстве. На GitHub она не загружается. Ссылка вместе с кодом даёт к ней доступ — не пересылай их посторонним. История тренировок в ссылку не входит.',
  },
  en: {
    title: 'Add a plan by private link', link: 'Plan link', code: 'Access code',
    hint: 'Copy the link from the message and paste it below. Then enter the access code from that message.',
    placeholder: 'Paste the plan link here', paste: 'On iPhone: touch and hold the field, then choose Paste.',
    iphone: 'If GYM is on your home screen, open it from its icon and paste the link here. Safari may have a separate diary.',
    ready: 'Encrypted plan received. Enter its access code.',
    preview: 'Preview plan', busy: 'Opening…', cancel: 'Cancel',
    invalid: 'Could not open the plan. Check the link and access code.',
    unsupported: 'Update iOS/Safari: this browser does not support protected links. Plan file import is still available.',
    private: 'The plan opens and is saved on this device. It is never uploaded to GitHub. The link and code together give access to it; keep both private. Workout history is not included in plan links.',
  },
}

export default function PlanLink() {
  const { payload: incoming = '' } = useParams()
  const nav = useNavigate()
  useLang()
  const text = copy[getLang() === 'ru' ? 'ru' : 'en']
  const [link, setLink] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    // Keep the encrypted payload only in component memory, not in this browser history entry.
    // Router state still owns the mounted route until the user leaves or confirms the preview.
    if (incoming) window.history.replaceState(window.history.state, '', window.location.pathname + '#/import-plan')
    return () => { alive.current = false }
  }, [incoming])

  const preview = async event => {
    event.preventDefault()
    if (busy) return
    setError(''); setBusy(true)
    try {
      const payload = incoming || extractPlanLinkPayload(link.trim())
      const raw = await decodePlanLink(payload, password.trim())
      const bundle = parsePlan(raw, useStore.getState().S.unit || 'kg')
      if (!bundle.routineCount || !bundle.exerciseCount) throw new Error('empty-plan')
      if (!alive.current) return
      setLink(''); setPassword('')
      nav('/plan', { replace: true })
      planImportSheet(bundle)
    } catch (e) {
      if (alive.current) setError(e?.code === 'unsupported' ? text.unsupported : text.invalid)
    } finally { if (alive.current) setBusy(false) }
  }

  return <div className="narrow">
    <div className="hdr"><div><h1>{text.title}</h1></div></div>
    <p className="muted small">{text.hint}</p>
    <p className="small">{text.iphone}</p>
    <form onSubmit={preview}>
      {incoming ? <p className="small">{text.ready}</p> : <div style={{ margin: '16px 0' }}>
        <label htmlFor="plan-link-url">{text.link}</label>
        <TextArea value={link} onChange={e => setLink(e.target.value)} rows={3}
          id="plan-link-url" placeholder={text.placeholder} aria-describedby="plan-link-paste-tip"
          maxLength={PLAN_LINK_LIMITS.maxPayloadLength + 4096} autoCapitalize="none"
          autoCorrect="off" spellCheck={false} required />
        <span id="plan-link-paste-tip" className="dim small">{text.paste}</span>
      </div>}
      <label style={{ display: 'block', margin: '16px 0' }}><span>{text.code}</span>
        <TextField type="password" autoComplete="off" autoCapitalize="none" spellCheck={false}
          value={password} onChange={e => setPassword(e.target.value)} maxLength={256} required />
      </label>
      {error && <p role="alert" className="small" style={{ color: 'var(--red)' }}>{error}</p>}
      <div style={{ height: 16 }} />
      <Button type="submit" variant="primary" disabled={busy || !password.trim() || (!incoming && !link.trim())}>
        {busy ? text.busy : text.preview}
      </Button>
      <Button type="button" variant="ghost" onClick={() => nav('/plan', { replace: true })}>{text.cancel}</Button>
    </form>
    <p className="dim small">{text.private}</p>
  </div>
}
