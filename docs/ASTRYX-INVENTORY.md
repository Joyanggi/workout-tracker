# Astryx 적용 현황

> 2026-11-13, 커밋 3897885. `node scripts/astryx-inventory.mjs --write`가 만든다. `--check`가 맨 아래 합계 줄을 기준으로 뒷걸음을 막는다.

| 파일 | Astryx | 인라인 | 인라인 여백 | legacy 클래스 |
|---|---|---|---|---|
| src/App.tsx | — | 0 | 0 | 7 |
| src/ax/index.tsx | 예 | 0 | 0 | 0 |
| src/components/AddExerciseSheet.tsx | — | 1 | 0 | 9 |
| src/components/CompensationSheet.tsx | — | 1 | 0 | 9 |
| src/components/CompensationWatchSheet.tsx | — | 1 | 0 | 8 |
| src/components/DayPickerSheet.tsx | — | 0 | 0 | 11 |
| src/components/DietDayEditor.tsx | — | 4 | 0 | 27 |
| src/components/DietIoPanel.tsx | — | 2 | 0 | 10 |
| src/components/DietPlanSheet.tsx | — | 1 | 0 | 10 |
| src/components/DietSlotSheet.tsx | — | 0 | 0 | 11 |
| src/components/DietVariantSheet.tsx | — | 3 | 0 | 7 |
| src/components/ExerciseCard.tsx | — | 4 | 0 | 39 |
| src/components/ExercisePickerSheet.tsx | 예 | 0 | 0 | 0 |
| src/components/ExportPanel.tsx | — | 1 | 0 | 10 |
| src/components/FinishSheet.tsx | — | 1 | 0 | 10 |
| src/components/FoodLogSheet.tsx | — | 3 | 0 | 12 |
| src/components/GistPanel.tsx | — | 2 | 0 | 16 |
| src/components/ImportPanel.tsx | — | 2 | 0 | 14 |
| src/components/ManualTimerSheet.tsx | — | 2 | 0 | 6 |
| src/components/MealReminderPanel.tsx | — | 2 | 0 | 5 |
| src/components/MonthCalendar.tsx | — | 0 | 0 | 11 |
| src/components/MuscleVolumeBars.tsx | — | 1 | 0 | 10 |
| src/components/NumberStepper.tsx | — | 0 | 0 | 2 |
| src/components/OpenSessionSheet.tsx | — | 1 | 0 | 10 |
| src/components/RestTimerBar.tsx | — | 1 | 0 | 9 |
| src/components/RoutineIoPanel.tsx | — | 2 | 0 | 14 |
| src/components/RoutineLineSheet.tsx | 예 | 0 | 0 | 0 |
| src/components/RoutineListPanel.tsx | — | 2 | 0 | 8 |
| src/components/SessionResumeStrip.tsx | — | 0 | 0 | 5 |
| src/components/SheetFrame.tsx | — | 0 | 0 | 1 |
| src/components/SubstituteSheet.tsx | — | 2 | 0 | 11 |
| src/components/TabBar.tsx | — | 0 | 0 | 2 |
| src/components/TempoGuideSheet.tsx | — | 2 | 0 | 12 |
| src/components/UpdatePrompt.tsx | — | 3 | 0 | 2 |
| src/components/WeekDots.tsx | — | 1 | 0 | 9 |
| src/components/WeightScaleSheet.tsx | — | 1 | 0 | 10 |
| src/components/icons.tsx | — | 0 | 0 | 0 |
| src/main.tsx | — | 0 | 0 | 0 |
| src/screens/AnalyzeScreen.tsx | — | 4 | 0 | 22 |
| src/screens/DietScreen.tsx | — | 0 | 0 | 3 |
| src/screens/ExerciseHistoryScreen.tsx | — | 3 | 0 | 13 |
| src/screens/HistoryScreen.tsx | — | 3 | 0 | 14 |
| src/screens/HomeScreen.tsx | — | 20 | 0 | 38 |
| src/screens/Onboarding.tsx | — | 3 | 0 | 11 |
| src/screens/RoutineEditorScreen.tsx | 예 | 5 | 0 | 0 |
| src/screens/SessionDetailScreen.tsx | — | 2 | 0 | 31 |
| src/screens/SessionScreen.tsx | — | 0 | 0 | 13 |
| src/screens/SettingsScreen.tsx | — | 7 | 0 | 20 |
| src/screens/SummaryScreen.tsx | — | 4 | 0 | 18 |

합계: `.tsx` 49개 가운데 Astryx를 읽는 것 4개, 인라인 스타일 97곳(여백 0), legacy 클래스 쓰임 520곳.
