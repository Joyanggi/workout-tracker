/**
 * 앱이 Astryx를 쓰는 한 곳. 화면은 `@astryxdesign/…`를 직접 import하지 않고 여기서만 가져다 쓴다.
 * 버전을 올릴 때 고칠 자리가 이 폴더뿐이다. 루틴 편집 화면과 함께 지연 청크로 읽힌다.
 */
import '@astryxdesign/core/astryx.css'
import '@astryxdesign/theme-neutral/theme.css'
import './ax.css'

import type { ReactNode } from 'react'
import { Theme } from '@astryxdesign/core/theme'
import { SizeProvider } from '@astryxdesign/core/SizeContext'
import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { TextInput, type TextInputProps } from '@astryxdesign/core/TextInput'
import { BottomSheet, type BottomSheetProps } from '@astryxdesign/core/BottomSheet'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import { AX_NO_AUTOFILL } from '../lib/inputProps'
import { clampStep } from './clampStep'

/** 입력칸 글자 16px 이상 (iOS가 포커스 시 확대하지 않게) */
const CONTROL_STYLE = { fontSize: 'max(16px, 1em)' } as const

/** `NumberInput`은 autoComplete만 받는다. 값은 `NO_AUTOFILL`에서 온다(필드별로 속성을 직접 적지 않는다 — inputProps.test X5·Y2). */
const NUMBER_AUTOFILL = { autoComplete: AX_NO_AUTOFILL.autoComplete } as const

/** 테마·모드·기본 크기·화면 틀. 폰의 라이트/다크 설정을 따른다. */
export function AxRoot({ children }: { children: ReactNode }) {
  return (
    <Theme theme={neutralTheme} mode="system">
      <SizeProvider value="lg">
        <div className="ax-screen">{children}</div>
      </SizeProvider>
    </Theme>
  )
}

/** 텍스트 입력. 자동완성 억제(G5)와 16px 하한을 빠뜨릴 수 없게 한다. */
export function TextField(props: TextInputProps) {
  return <TextInput {...AX_NO_AUTOFILL} controlStyle={CONTROL_STYLE} {...props} />
}

interface StepperProps {
  value: number
  step: number
  min: number
  max: number
  label: string
  onChange: (v: number) => void
}

/** − 입력칸 ＋. `NumberInput`의 증감 버튼은 터치에서 숨어서 버튼을 따로 붙인다. */
export function Stepper({ value, step, min, max, label, onChange }: StepperProps) {
  return (
    <HStack gap={2}>
      <Button
        variant="secondary"
        isIconOnly
        icon={<span aria-hidden="true">−</span>}
        label={`${label} 감소`}
        onClick={() => onChange(clampStep(value, -1, step, min, max))}
      />
      <NumberInput
        label={label}
        isLabelHidden
        isIntegerOnly
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        {...NUMBER_AUTOFILL}
        controlStyle={CONTROL_STYLE}
      />
      <Button
        variant="secondary"
        isIconOnly
        icon={<span aria-hidden="true">+</span>}
        label={`${label} 증가`}
        onClick={() => onChange(clampStep(value, 1, step, min, max))}
      />
    </HStack>
  )
}

interface SheetProps {
  label: string
  purpose?: 'required' | 'form' | 'info'
  height?: BottomSheetProps['height']
  onClose: () => void
  children: ReactNode
}

/** 바텀 시트. 지금 시트처럼 "있으면 그리고 없으면 안 그리는" 쓰임을 받는다. */
export function Sheet({ label, purpose = 'info', height = 'hug', onClose, children }: SheetProps) {
  return (
    <BottomSheet
      label={label}
      purpose={purpose}
      height={height}
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {/* 시트는 화면과 다른 층에 그려져 크기 기본값이 새로 시작한다 → 화면과 같은 크기를 다시 건다 */}
      <SizeProvider value="lg">{children}</SizeProvider>
    </BottomSheet>
  )
}

export { Button } from '@astryxdesign/core/Button'
export { Card } from '@astryxdesign/core/Card'
export { Banner } from '@astryxdesign/core/Banner'
export { Badge } from '@astryxdesign/core/Badge'
export { Heading } from '@astryxdesign/core/Heading'
export { Text } from '@astryxdesign/core/Text'
export { VStack, HStack } from '@astryxdesign/core/Stack'
export { Item } from '@astryxdesign/core/Item'
export { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
export { Switch } from '@astryxdesign/core/Switch'
export { ToggleButton } from '@astryxdesign/core/ToggleButton'
