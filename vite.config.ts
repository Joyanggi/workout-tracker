import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

/**
 * GitHub Pages 하위 경로 배포.
 *
 * **레포명을 바꾸면 고쳐야 하는 곳 (빌드가 잡아주지 않는다):**
 *   1. 이 상수 — manifest의 scope/start_url/icons가 여기서 파생된다
 *   2. `index.html` — apple-touch-icon, favicon, apple-touch-startup-image 8개.
 *      정적 파일이라 이 상수를 참조할 수 없어 절대 경로가 하드코딩돼 있다
 *   3. `README.md`의 로컬 접속 주소와 배포 URL
 *
 * base가 틀리면 **빌드는 성공하고 배포 후 하얀 화면**이 된다. 로컬 dev에서는
 * base가 무엇이든 동작해서 배포 전에 발견되지 않는다.
 */
const BASE = '/workout-tracker/'

export default defineConfig({
  base: BASE,
  /*
   * 앱 버전을 **package.json 한 곳에서** 파생시킨다 (BB5).
   *
   * 설정 화면에 `v1.1`이 손으로 적혀 있었고 실제 라운드는 v1.7이었다 — 파생 가능한 값을
   * 손으로 적은 패턴 A이고, 이 프로젝트가 네 번째로 잡는 부류다 (kcalLabel, 커밋 메시지
   * 테스트 개수, 시드 해시). 관례: PLAN-v1.N을 구현하면 version을 1.N.0으로 올린다.
   *
   * 루틴 시드 리비전(`routine-v2.4.json`)과는 다른 축이다 — 그쪽은 훈련 규정의 버전이고
   * 이쪽은 앱의 버전이다.
   */
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
