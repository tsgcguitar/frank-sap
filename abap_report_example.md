# ABAP 報表範例（基礎）

以下是一個最小可執行的 SAP ABAP 報表範例，示範：

- 選擇畫面（選擇條件）
- 讀取資料（示意）
- 以 ALV 顯示結果

## 1) 基礎報表結構

```abap
REPORT z_demo_report.

"------------------------------------------------------------
" 選擇畫面
"------------------------------------------------------------
PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY.
SELECT-OPTIONS: s_belnr FOR bkpf-belnr.

"------------------------------------------------------------
" 資料定義
"------------------------------------------------------------
TYPES: BEGIN OF ty_result,
         bukrs TYPE bkpf-bukrs,
         belnr TYPE bkpf-belnr,
         gjahr TYPE bkpf-gjahr,
         blart TYPE bkpf-blart,
       END OF ty_result.

DATA: gt_result TYPE STANDARD TABLE OF ty_result,
      gs_result TYPE ty_result.

"------------------------------------------------------------
" 主程式
"------------------------------------------------------------
START-OF-SELECTION.
  PERFORM fetch_data.
  PERFORM display_alv.

"------------------------------------------------------------
" 取數
"------------------------------------------------------------
FORM fetch_data.
  SELECT bukrs belnr gjahr blart
    FROM bkpf
    INTO TABLE gt_result
    WHERE bukrs = p_bukrs
      AND belnr IN s_belnr.
ENDFORM.

"------------------------------------------------------------
" 顯示 ALV
"------------------------------------------------------------
FORM display_alv.
  DATA(lo_alv) = NEW cl_salv_table( ).
  cl_salv_table=>factory(
    IMPORTING
      r_salv_table = lo_alv
    CHANGING
      t_table      = gt_result ).

  lo_alv->display( ).
ENDFORM.
```

## 2) 使用說明（重點）

- **REPORT** 宣告為可執行報表（Z 程式）。
- **PARAMETERS / SELECT-OPTIONS** 定義選擇畫面條件。
- **START-OF-SELECTION** 是報表的主要入口。
- **FORM** 用來拆分邏輯：取數、顯示。
- **CL_SALV_TABLE** 是簡單 ALV 顯示方式，適合基礎報表。

## 3) 建議下一步

1. 確認資料表與欄位（例如 BKPF/BSEG）是否符合需求。
2. 依需求增加欄位、排序、匯出功能。
3. 若需求複雜，可改用 **CL_GUI_ALV_GRID** 或 **SALV Model** 的進階設定。

---

如果你能提供：
- 報表目的
- 資料來源表
- 輸出欄位
- 選擇條件

我可以幫你客製完整的報表範本。
