# 聖經一年讀經打卡程式（規劃稿）

這個專案提供一個**每日打卡讀經**、**一年讀完一遍聖經（和合本）**的應用雛形，並預留**語音朗讀**與**可調語速**能力的設計。這個 repo 目前包含：

- 和合本書卷與章節資料（`data/cuv_books.json`）
- 自動生成的 365 天讀經計畫（`data/reading_plan_365.json`）
- 產生計畫的腳本（`scripts/generate_plan.py`）

## 需求目標

1. **每日打卡**
   - 使用者每天完成指定閱讀後打卡。
   - 顯示連續打卡天數與年度完成率。
2. **一年讀完一遍聖經（和合本）**
   - 依照章節順序，平均分配至 365 天。
3. **語音朗讀（TTS）**
   - 支援和合本中文 TTS。
   - 可調整語速（如 0.8x、1.0x、1.2x）。

## 讀經計畫說明

- 本專案以 **1189 章**為基礎，平均分配成 365 天。
- 前 94 天安排 4 章，其餘 271 天安排 3 章，以確保全年讀畢。
- 生成檔案：`data/reading_plan_365.json`

## 腳本使用方式

重新生成讀經計畫：

```bash
python scripts/generate_plan.py
```

## 建議的下一步開發（MVP）

- 儲存使用者打卡狀態（本機 SQLite 或雲端 DB）
- 日期與讀經計畫的對應
- 讀經內容 API（和合本文本來源需授權或公開資源）
- TTS 語音播放（可先使用瀏覽器 SpeechSynthesis 或雲端 TTS）

## 資料結構概念

### 打卡紀錄

```json
{
  "date": "2025-01-01",
  "completed": true,
  "readings": [
    {"book_id": "gen", "chapter": 1},
    {"book_id": "gen", "chapter": 2},
    {"book_id": "gen", "chapter": 3}
  ]
}
```

### 讀經計畫片段

```json
{
  "day": 1,
  "readings": [
    {"book_id": "gen", "book_zh": "創世記", "chapter": 1},
    {"book_id": "gen", "book_zh": "創世記", "chapter": 2},
    {"book_id": "gen", "book_zh": "創世記", "chapter": 3},
    {"book_id": "gen", "book_zh": "創世記", "chapter": 4}
  ]
}
```
