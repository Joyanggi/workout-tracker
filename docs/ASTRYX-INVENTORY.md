# Astryx 적용 현황

> 2026-11-12, 커밋 a462608. `node scripts/astryx-inventory.mjs --write`가 만든다. 판정하지 않는다.

| 파일 | Astryx | 인라인 | 인라인 여백 | legacy 클래스 |
|---|---|---|---|---|
| src/App.tsx | — | 0 | 0 | 7 |
| src/ax/index.tsx | 예 | 0 | 0 | 0 |
| src/components/AddExerciseSheet.tsx | — | 4 | 3 | 12 |
| src/components/CompensationSheet.tsx | — | 5 | 3 | 12 |
| src/components/CompensationWatchSheet.tsx | — | 5 | 3 | 11 |
| src/components/DayPickerSheet.tsx | — | 7 | 9 | 14 |
| src/components/DietDayEditor.tsx | — | 6 | 2 | 27 |
| src/components/DietIoPanel.tsx | — | 5 | 2 | 10 |
| src/components/DietPlanSheet.tsx | — | 9 | 7 | 13 |
| src/components/DietSlotSheet.tsx | — | 11 | 5 | 14 |
| src/components/DietVariantSheet.tsx | — | 5 | 3 | 10 |
| src/components/ExerciseCard.tsx | — | 11 | 9 | 39 |
| src/components/ExercisePickerSheet.tsx | 예 | 0 | 0 | 0 |
| src/components/ExportPanel.tsx | — | 5 | 5 | 10 |
| src/components/FinishSheet.tsx | — | 7 | 4 | 13 |
| src/components/FoodLogSheet.tsx | — | 10 | 8 | 15 |
| src/components/GistPanel.tsx | — | 9 | 8 | 16 |
| src/components/ImportPanel.tsx | — | 4 | 3 | 14 |
| src/components/ManualTimerSheet.tsx | — | 6 | 4 | 9 |
| src/components/MealReminderPanel.tsx | — | 5 | 4 | 5 |
| src/components/MonthCalendar.tsx | — | 0 | 0 | 11 |
| src/components/MuscleVolumeBars.tsx | — | 2 | 1 | 10 |
| src/components/NumberStepper.tsx | — | 0 | 0 | 2 |
| src/components/OpenSessionSheet.tsx | — | 6 | 2 | 13 |
| src/components/RestTimerBar.tsx | — | 1 | 0 | 9 |
| src/components/RoutineIoPanel.tsx | — | 3 | 2 | 14 |
| src/components/RoutineLineSheet.tsx | 예 | 0 | 0 | 0 |
| src/components/RoutineListPanel.tsx | — | 8 | 6 | 8 |
| src/components/SessionResumeStrip.tsx | — | 0 | 0 | 5 |
| src/components/SubstituteSheet.tsx | — | 5 | 3 | 14 |
| src/components/TabBar.tsx | — | 0 | 0 | 2 |
| src/components/TempoGuideSheet.tsx | — | 4 | 1 | 15 |
| src/components/UpdatePrompt.tsx | — | 3 | 2 | 2 |
| src/components/WeekDots.tsx | — | 2 | 2 | 9 |
| src/components/WeightScaleSheet.tsx | — | 8 | 6 | 13 |
| src/components/icons.tsx | — | 0 | 0 | 0 |
| src/main.tsx | — | 0 | 0 | 0 |
| src/screens/AnalyzeScreen.tsx | — | 12 | 10 | 22 |
| src/screens/DietScreen.tsx | — | 0 | 0 | 3 |
| src/screens/ExerciseHistoryScreen.tsx | — | 10 | 7 | 13 |
| src/screens/HistoryScreen.tsx | — | 8 | 6 | 14 |
| src/screens/HomeScreen.tsx | — | 31 | 16 | 38 |
| src/screens/Onboarding.tsx | — | 4 | 2 | 11 |
| src/screens/RoutineEditorScreen.tsx | 예 | 5 | 0 | 0 |
| src/screens/SessionDetailScreen.tsx | — | 11 | 8 | 31 |
| src/screens/SessionScreen.tsx | — | 1 | 1 | 13 |
| src/screens/SettingsScreen.tsx | — | 25 | 18 | 20 |
| src/screens/SummaryScreen.tsx | — | 10 | 6 | 18 |

합계: `.tsx` 48개 가운데 Astryx를 읽는 것 4개, 인라인 스타일 273곳(여백 181).
