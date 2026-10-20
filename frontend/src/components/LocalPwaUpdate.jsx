import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getLang, useLang } from '../lib/i18n.js'
import { checkLocalPwaUpdate, getLocalPwaUpdateSnapshot, subscribeLocalPwaUpdate } from '../lib/local-pwa-update.js'
import { Row } from './ui.jsx'
import Icon from './Icon.jsx'

const useUpdate = () => useSyncExternalStore(subscribeLocalPwaUpdate, getLocalPwaUpdateSnapshot)
const reload = () => window.location.reload()

export function LocalPwaUpdateBanner() {
  const { available } = useUpdate()
  const row = useRef(null)
  useLang()
  const ru = getLang() === 'ru'
  useLayoutEffect(() => {
    const root = document.documentElement
    if (!available || !row.current) return
    const fit = () => root.style.setProperty('--conn', row.current.offsetHeight + 'px')
    fit()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null
    observer?.observe(row.current)
    return () => { observer?.disconnect(); root.style.removeProperty('--conn') }
  }, [available, ru])
  if (!available) return null
  return <div className="conn-bar local-update-bar">
    <div className="conn-row" ref={row} role="status" aria-live="polite">
      <div className="conn">
        <Icon name="download" />
        <span className="conn-t">{ru ? 'Новая версия готова. Обнови после завершения ввода.' : 'New version ready. Finish entering changes before updating.'}</span>
        <button type="button" className="conn-a" onClick={reload}>{ru ? 'Обновить' : 'Update'}</button>
      </div>
    </div>
  </div>
}

export function LocalPwaUpdateRow() {
  const { available, checking, error } = useUpdate()
  const [checked, setChecked] = useState(false)
  useLang()
  const ru = getLang() === 'ru'
  const subtitle = available
    ? (ru ? 'Экран перезапустится. Тренировки и программы сохранятся.' : 'The screen will restart. Your workouts and plans are kept.')
    : checking ? (ru ? 'Загружаю и проверяю файлы приложения…' : 'Downloading and checking app files…')
      : error ? (ru ? 'Не удалось проверить. Подключись к интернету и попробуй ещё раз.' : 'Could not check. Connect to the internet and try again.')
        : checked ? (ru ? 'Установлена актуальная версия.' : 'The app is up to date.')
          : (ru ? 'Тренировки и программы останутся на телефоне.' : 'Your workouts and plans stay on this phone.')
  return <Row icon="download" iconTint="var(--green)"
    title={available ? (ru ? 'Обновить GYM' : 'Update GYM') : (ru ? 'Проверить обновление GYM' : 'Check for GYM updates')}
    subtitle={subtitle} accessory="chevron"
    onClick={async () => {
      if (checking) return
      if (available) return reload()
      await checkLocalPwaUpdate()
      setChecked(true)
    }} />
}
