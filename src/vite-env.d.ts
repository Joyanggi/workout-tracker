/// <reference types="vite/client" />

/**
 * 앱 버전 — `vite.config.ts`의 `define`이 `package.json`의 version을 박아 넣는다 (BB5).
 *
 * 화면에서 버전을 손으로 적지 않기 위한 것이다. 빌드 타임 치환이므로 런타임 비용이 없고,
 * 값이 하나뿐이라 화면마다 갈릴 수 없다.
 */
declare const __APP_VERSION__: string
