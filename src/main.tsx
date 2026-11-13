import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/index.css'

// iOS Safari는 `touchstart` 처리기가 없으면 `:active`를 칠하지 않는다(MDN `:active`, WebKit 138816). 수동 처리기라 스크롤을 막지 않는다.
document.addEventListener('touchstart', () => {}, { passive: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
