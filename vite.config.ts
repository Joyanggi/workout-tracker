import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 하위 경로 배포. 레포명이 바뀌면 여기와 manifest scope/start_url을 함께 고쳐야 한다.
const BASE = '/workout-tracker/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      // autoUpdate가 아니라 prompt: 세션 도중 SW가 페이지를 강제 리로드하면
      // 헬스장에서 입력 중인 화면이 날아간다(데이터는 IndexedDB에 남지만 UX가 끊긴다).
      // 업데이트는 배너로 알리고 사용자가 누를 때만 적용한다.
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        id: BASE,
        name: '운동 기록',
        short_name: '운동기록',
        description: '피지크형 상체 루틴 v2.4 전용 운동 기록 PWA',
        lang: 'ko',
        dir: 'ltr',
        display: 'standalone',
        orientation: 'portrait',
        scope: BASE,
        start_url: BASE,
        theme_color: '#0b0b0d',
        background_color: '#0b0b0d',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // 오프라인에서 딥링크로 들어와도 앱 셸을 돌려준다.
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // dev에서도 SW 동작을 확인할 수 있게 (dev-dist는 gitignore)
        enabled: false,
      },
    }),
  ],
  build: {
    target: 'es2020',
    sourcemap: true,
  },
})
