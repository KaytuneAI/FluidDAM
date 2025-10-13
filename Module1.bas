Option Explicit
Public gRibbon As IRibbonUI

Public Sub OnRibbonLoad(ByVal ribbon As IRibbonUI)
    Set gRibbon = ribbon
End Sub

Public Sub ExportLayoutWin_OnAction(control As IRibbonControl)
    ExportLayoutWin
End Sub

Public Sub ListAllPictures_OnAction(control As IRibbonControl)
    ListAllPictures
End Sub

Public Sub ListAllBorders_OnAction(control As IRibbonControl)
    ListAllBorders
End Sub

Public Sub RefreshCache_OnAction(control As IRibbonControl)
    ListExportedSheets
End Sub

Public Sub OpenDocs_OnAction(control As IRibbonControl)
    Dim p As String
    p = ThisWorkbook.Path & Application.PathSeparator & "README_Pro.txt"
    If Len(Dir$(p)) > 0 Then
        Shell "notepad.exe " & Chr$(34) & p & Chr$(34), vbNormalFocus
    Else
        MsgBox "README_Pro.txt 未找到。", vbInformation
    End If
End Sub

Public Sub About_OnAction(control As IRibbonControl)
    MsgBox "FluidDAM for Excel" & vbCrLf & "Pro (Safe UI)" & vbCrLf & "? 2025 Kaytune", vbInformation, "关于"
End Sub




' ================= ENTRY POINT =================
Public Sub ExportLayoutWin()
    On Error GoTo FAIL

    Dim wb As Workbook, ws As Worksheet
    Set wb = ActiveWorkbook              ' target workbook (not PERSONAL)
    Set ws = ActiveSheet                 ' export current sheet by default

    Application.ScreenUpdating = False

    Dim outCells As Long, outText As Long, outPics As Long, outBorders As Long
    Dim json As String
    json = BuildSheetJson(ws, outCells, outText, outPics, outBorders)

    Dim tgt As Worksheet
    Set tgt = EnsureLayoutJsonSheet(wb)
    
    ' 检测当前工作表是否已经导出过，并确定存储位置
    Dim targetRow As Long
    Dim isUpdate As Boolean
    targetRow = FindSheetExportRow(tgt, ws.Name, isUpdate)
    
    ' 清除目标行的内容
    ClearRowContent tgt, targetRow
    
    ' 检查JSON长度，如果超过32K则分割
    If Len(json) > 32000 Then
        SplitJsonToCells tgt, json, targetRow
    Else
        tgt.Cells(targetRow, 1).Value2 = json
    End If
    
    tgt.Columns("A").ColumnWidth = 120    ' just for readability

    Application.ScreenUpdating = True

    Dim actionMsg As String
    If isUpdate Then
        actionMsg = "Updated existing export for sheet: " & ws.Name
    Else
        actionMsg = "New export added for sheet: " & ws.Name & " (Row " & targetRow & ")"
    End If

    MsgBox actionMsg & vbCrLf & "Target sheet: " & tgt.Name & vbCrLf & "Workbook: " & wb.Name & vbCrLf & "Cells (non-empty): " & outCells & vbCrLf & "Textboxes: " & outText & vbCrLf & "Images: " & outPics & vbCrLf & "Borders: " & outBorders, vbInformation, "Layout export OK"
    Exit Sub

FAIL:
    Application.ScreenUpdating = True
    MsgBox "Export failed: #" & Err.Number & " - " & Err.Description, vbExclamation, "Layout export"
End Sub

' ================= 多工作表导出支持函数 =================
' 检测工作表是否已经导出过，返回目标行号和是否为更新操作
Private Function FindSheetExportRow(ByVal tgt As Worksheet, ByVal sheetName As String, ByRef isUpdate As Boolean) As Long
    Dim maxRow As Long: maxRow = tgt.Cells(tgt.Rows.Count, 1).End(xlUp).Row
    Dim row As Long
    
    ' 遍历所有已使用的行，查找是否已有该工作表的导出
    For row = 1 To maxRow
        Dim cellValue As String
        cellValue = CStr(tgt.Cells(row, 1).Value2)
        
        ' 检查JSON中是否包含当前工作表名称
        If InStr(cellValue, Q("sheet") & ":{" & Q("name") & ":" & Q(sheetName)) > 0 Then
            isUpdate = True
            FindSheetExportRow = row
            Exit Function
        End If
    Next row
    
    ' 如果没有找到，返回下一个空白行
    isUpdate = False
    FindSheetExportRow = maxRow + 1
End Function

' 清除指定行的所有内容
Private Sub ClearRowContent(ByVal ws As Worksheet, ByVal row As Long)
    Dim lastCol As Long
    lastCol = ws.Cells(row, ws.Columns.Count).End(xlToLeft).Column
    If lastCol > 1 Then
        ws.Range(ws.Cells(row, 1), ws.Cells(row, lastCol)).Clear
    ElseIf ws.Cells(row, 1).Value2 <> "" Then
        ws.Cells(row, 1).Clear
    End If
End Sub

' ================= JSON分割函数 =================
Private Sub SplitJsonToCells(ByVal ws As Worksheet, ByVal json As String, ByVal startRow As Long)
    Dim chunkSize As Long: chunkSize = 30000  ' 留一些余量，避免32K限制
    Dim totalLen As Long: totalLen = Len(json)
    Dim chunkCount As Long: chunkCount = Int(totalLen / chunkSize) + 1
    
    Dim i As Long
    For i = 1 To chunkCount
        Dim startPos As Long: startPos = (i - 1) * chunkSize + 1
        Dim endPos As Long: endPos = IIf(i * chunkSize > totalLen, totalLen, i * chunkSize)
        
        Dim chunk As String: chunk = Mid(json, startPos, endPos - startPos + 1)
        ' 横向扩展：第1块放在指定行的A列，第2块放在B列，第3块放在C列...
        ws.Cells(startRow, i).Value2 = chunk
    Next i
End Sub

' ================= 调试函数 =================
' 新增：列出所有图片信息的调试函数
Public Sub ListAllPictures()
    Dim ws As Worksheet
    Set ws = ActiveSheet
    
    Dim shp As Shape
    Dim i As Long: i = 1
    
    Debug.Print "=== All Picture Information in Current Worksheet ==="
    For Each shp In ws.Shapes
        If shp.Type = msoPicture Or shp.Type = msoLinkedPicture Then
            Debug.Print i & ". Name: " & shp.Name & " | Left: " & Round(shp.Left, 2) & " | Top: " & Round(shp.Top, 2) & " | Z: " & shp.ZOrderPosition
            i = i + 1
        End If
    Next shp
    
    MsgBox "Picture information has been output to immediate window, press Ctrl+G to view"
End Sub

' 升级：增强的边框调试函数 - 测试新的EdgeVisible功能
Public Sub ListAllBorders()
    Dim ws As Worksheet
    Set ws = ActiveSheet
    
    Dim ur As Range
    Set ur = ws.UsedRange
    If ur Is Nothing Then
        MsgBox "Current worksheet has no used range", vbInformation
        Exit Sub
    End If
    
    Dim r As Long, c As Long, borderCount As Long, totalChecked As Long
    borderCount = 0
    totalChecked = 0
    
    Debug.Print "=== Enhanced Border Detection Test ==="
    Debug.Print "UsedRange: " & ur.Address
    Debug.Print "Testing new EdgeVisible function..."
    
    For r = ur.row To ur.row + ur.Rows.Count - 1
        For c = ur.Column To ur.Column + ur.Columns.Count - 1
            Dim cell As Range
            Set cell = ws.Cells(r, c)
            totalChecked = totalChecked + 1
            
            ' 测试前几个单元格的详细信息
            If totalChecked <= 10 Then
                Debug.Print "Testing cell " & cell.Address & ":"
                Debug.Print "  EdgeVisible Top: " & EdgeVisible(cell, xlEdgeTop)
                Debug.Print "  EdgeVisible Right: " & EdgeVisible(cell, xlEdgeRight)
                Debug.Print "  EdgeVisible Bottom: " & EdgeVisible(cell, xlEdgeBottom)
                Debug.Print "  EdgeVisible Left: " & EdgeVisible(cell, xlEdgeLeft)
            End If
            
            If HasCellBorder(cell) Then
                borderCount = borderCount + 1
                Debug.Print borderCount & ". Cell: " & cell.Address & " | Row: " & r & " | Col: " & c
                
                ' 使用新的EdgeVisible函数检测各边
                Dim hasTop As Boolean, hasRight As Boolean, hasBottom As Boolean, hasLeft As Boolean
                hasTop = EdgeVisible(cell, xlEdgeTop)
                hasRight = EdgeVisible(cell, xlEdgeRight)
                hasBottom = EdgeVisible(cell, xlEdgeBottom)
                hasLeft = EdgeVisible(cell, xlEdgeLeft)
                
                Debug.Print "   Borders: Top=" & hasTop & ", Right=" & hasRight & ", Bottom=" & hasBottom & ", Left=" & hasLeft
                
                ' 测试JSON输出
                Dim testJson As String
                testJson = BuildBorderJson(cell, r, c, PtToPxFactor())
                Debug.Print "   JSON: " & Left(testJson, 100) & "..."
            End If
        Next c
    Next r
    
    MsgBox "Enhanced border detection completed!" & vbCrLf & "Checked " & totalChecked & " cells, found " & borderCount & " cells with borders" & vbCrLf & "Detailed information has been output to immediate window, press Ctrl+G to view", vbInformation
End Sub

' 新增：专门测试2x2样本和合并单元格的测试函数
Public Sub TestBorderDetection()
    Dim ws As Worksheet
    Set ws = ActiveSheet
    
    Debug.Print "=== Border Detection Test Suite ==="
    
    ' 测试1: 2x2样本测试
    Debug.Print "Test 1: 2x2 sample test"
    Dim testRange As Range
    Set testRange = ws.Range("A1:B2")
    
    Dim r As Long, c As Long
    For r = 1 To 2
        For c = 1 To 2
            Dim cell As Range
            Set cell = testRange.Cells(r, c)
            Debug.Print "Cell " & cell.Address & ":"
            Debug.Print "  Top: " & EdgeVisible(cell, xlEdgeTop)
            Debug.Print "  Right: " & EdgeVisible(cell, xlEdgeRight)
            Debug.Print "  Bottom: " & EdgeVisible(cell, xlEdgeBottom)
            Debug.Print "  Left: " & EdgeVisible(cell, xlEdgeLeft)
        Next c
    Next r
    
    ' 测试2: 合并单元格测试
    Debug.Print "Test 2: Merged cell test"
    Dim mergedCell As Range
    Set mergedCell = ws.Range("D1:E2")
    If mergedCell.MergeCells Then
        Debug.Print "Merged cell " & mergedCell.Address & ":"
        Debug.Print "  Top: " & EdgeVisible(mergedCell, xlEdgeTop)
        Debug.Print "  Right: " & EdgeVisible(mergedCell, xlEdgeRight)
        Debug.Print "  Bottom: " & EdgeVisible(mergedCell, xlEdgeBottom)
        Debug.Print "  Left: " & EdgeVisible(mergedCell, xlEdgeLeft)
    Else
        Debug.Print "No merged cell found at D1:E2"
    End If
    
    MsgBox "Border detection test completed! Check immediate window for results.", vbInformation
End Sub

' 新增：测试JSON格式的函数
Public Sub TestBorderJson()
    Dim ws As Worksheet
    Set ws = ActiveSheet
    
    Debug.Print "=== Border JSON Test ==="
    
    On Error Resume Next
    
    ' 测试基本函数是否存在
    Debug.Print "Testing basic functions..."
    Dim pt2px As Double
    pt2px = PtToPxFactor()
    Debug.Print "PtToPxFactor: " & pt2px
    
    ' 测试单个单元格的JSON输出
    Dim testCell As Range
    Set testCell = ws.Range("A1")
    
    Debug.Print "Testing cell A1..."
    Dim testJson As String
    testJson = BuildBorderJson(testCell, 1, 1, pt2px)
    
    Debug.Print "Test JSON for A1:"
    Debug.Print testJson
    Debug.Print "JSON length: " & Len(testJson)
    
    ' 测试边框数组JSON输出
    Debug.Print "Testing borders array..."
    Dim borderCount As Long
    Dim bordersJson As String
    bordersJson = BordersToJson(ws, pt2px, borderCount)
    
    Debug.Print "Borders JSON length: " & Len(bordersJson)
    Debug.Print "Borders JSON (first 200 chars):"
    Debug.Print Left(bordersJson, 200)
    Debug.Print "Total borders found: " & borderCount
    
    If Err.Number <> 0 Then
        Debug.Print "Error in TestBorderJson: " & Err.Description
        Err.Clear
    End If
    
    On Error GoTo 0
    
    MsgBox "JSON test completed! Check immediate window for results.", vbInformation
End Sub

' 简化的测试函数
Public Sub TestSimple()
    Debug.Print "=== Simple Test ==="
    
    On Error Resume Next
    
    ' 测试基本函数
    Dim pt2px As Double
    pt2px = PtToPxFactor()
    Debug.Print "PtToPxFactor works: " & pt2px
    
    If Err.Number <> 0 Then
        Debug.Print "PtToPxFactor Error: " & Err.Description
        Err.Clear
    End If
    
    ' 测试EdgeVisible函数
    Dim ws As Worksheet
    Set ws = ActiveSheet
    Dim cell As Range
    Set cell = ws.Range("A1")
    
    Dim hasTop As Boolean
    hasTop = EdgeVisible(cell, xlEdgeTop)
    Debug.Print "EdgeVisible works: " & hasTop
    
    If Err.Number <> 0 Then
        Debug.Print "EdgeVisible Error: " & Err.Description
        Err.Clear
    End If
    
    On Error GoTo 0
    
    MsgBox "Simple test completed!"
End Sub

' 最基础的测试函数
Public Sub TestBasic()
    Debug.Print "=== Basic Test ==="
    
    On Error Resume Next
    
    ' 测试基本变量
    Dim testVar As String
    testVar = "Hello"
    Debug.Print "Basic variable works: " & testVar
    
    ' 测试基本函数调用
    Dim pt2px As Double
    pt2px = PtToPxFactor()
    Debug.Print "PtToPxFactor result: " & pt2px
    
    If Err.Number <> 0 Then
        Debug.Print "Error in TestBasic: " & Err.Description
        Err.Clear
    End If
    
    On Error GoTo 0
    
    MsgBox "Basic test completed!"
End Sub

' 测试隐藏单元格过滤功能
Public Sub TestHiddenCells()
    Dim ws As Worksheet
    Set ws = ActiveSheet
    
    Debug.Print "=== Hidden Cells Test ==="
    
    ' 测试隐藏单元格检测
    Dim testCell As Range
    Set testCell = ws.Range("A1")
    
    Debug.Print "Testing cell A1:"
    Debug.Print "  IsHidden: " & IsCellHidden(testCell)
    Debug.Print "  Row Hidden: " & testCell.EntireRow.Hidden
    Debug.Print "  Column Hidden: " & testCell.EntireColumn.Hidden
    
    ' 测试隐藏行
    If ws.Rows.Count >= 2 Then
        Set testCell = ws.Range("A2")
        Debug.Print "Testing cell A2:"
        Debug.Print "  IsHidden: " & IsCellHidden(testCell)
        Debug.Print "  Row Hidden: " & testCell.EntireRow.Hidden
    End If
    
    ' 测试隐藏列
    If ws.Columns.Count >= 2 Then
        Set testCell = ws.Range("B1")
        Debug.Print "Testing cell B1:"
        Debug.Print "  IsHidden: " & IsCellHidden(testCell)
        Debug.Print "  Column Hidden: " & testCell.EntireColumn.Hidden
    End If
    
    MsgBox "Hidden cells test completed! Check immediate window for results.", vbInformation
End Sub

' 测试背景色处理功能
Public Sub TestBackgroundColors()
    Dim ws As Worksheet
    Set ws = ActiveSheet
    
    Debug.Print "=== Background Colors Test ==="
    
    ' 测试几个单元格的背景色
    Dim testCells As Variant
    testCells = Array("A1", "B1", "C1", "A2", "B2", "C2")
    
    Dim i As Long
    For i = 0 To UBound(testCells)
        Dim cell As Range
        Set cell = ws.Range(testCells(i))
        
        Debug.Print "Cell " & testCells(i) & ":"
        Debug.Print "  Interior.Color: " & cell.Interior.Color
        Debug.Print "  Interior.ColorIndex: " & cell.Interior.ColorIndex
        Debug.Print "  DisplayFormat.Interior.Color: " & cell.DisplayFormat.Interior.Color
        Debug.Print "  GetCellFillColor: " & GetCellFillColor(cell)
        Debug.Print "  RGBToHex(Interior.Color): " & RGBToHex(cell.Interior.Color)
        Debug.Print "  RGBToHex(DisplayFormat.Color): " & RGBToHex(cell.DisplayFormat.Interior.Color)
        Debug.Print "  ---"
    Next i
    
    MsgBox "Background colors test completed! Check immediate window for results.", vbInformation
End Sub

' 专门测试土黄色背景色问题
Public Sub TestYellowBackground()
    Dim ws As Worksheet
    Set ws = ActiveSheet
    
    Debug.Print "=== Yellow Background Test ==="
    
    ' 测试常见的土黄色值
    Dim yellowColors As Variant
    yellowColors = Array(65535, 16776960, 16777088, 16777164, 16777200)  ' 各种黄色值
    
    Debug.Print "Testing common yellow color values:"
    Dim i As Long
    For i = 0 To UBound(yellowColors)
        Debug.Print "Color value " & yellowColors(i) & ":"
        Debug.Print "  RGBToHex: " & RGBToHex(yellowColors(i))
        Debug.Print "  ---"
    Next i
    
    ' 测试当前选中单元格的颜色
    Dim selectedCell As Range
    Set selectedCell = Selection
    
    Debug.Print "Selected cell " & selectedCell.Address & ":"
    Debug.Print "  Interior.Color: " & selectedCell.Interior.Color
    Debug.Print "  Interior.ColorIndex: " & selectedCell.Interior.ColorIndex
    Debug.Print "  DisplayFormat.Interior.Color: " & selectedCell.DisplayFormat.Interior.Color
    Debug.Print "  GetCellFillColor result: " & GetCellFillColor(selectedCell)
    Debug.Print "  RGBToHex(Interior.Color): " & RGBToHex(selectedCell.Interior.Color)
    Debug.Print "  RGBToHex(DisplayFormat.Color): " & RGBToHex(selectedCell.DisplayFormat.Interior.Color)
    
    ' 检查是否是土黄色
    Dim colorValue As Long
    colorValue = selectedCell.DisplayFormat.Interior.Color
    If colorValue <> -4142 And colorValue <> 16777215 Then
        Debug.Print "  This cell HAS a background color!"
        Debug.Print "  Color analysis:"
        Dim r As Long, g As Long, b As Long
        r = (colorValue And &HFF)
        g = (colorValue \ &H100) And &HFF
        b = (colorValue \ &H10000) And &HFF
        Debug.Print "    R: " & r & ", G: " & g & ", B: " & b
        Debug.Print "    Is yellow-ish: " & (r > g And g > b And r > 200)
    Else
        Debug.Print "  This cell has NO background color (transparent/white)"
    End If
    
    MsgBox "Yellow background test completed! Check immediate window for results.", vbInformation
End Sub

' 创建测试土黄色单元格
Public Sub CreateYellowTest()
    Dim ws As Worksheet
    Set ws = ActiveSheet
    
    ' 清除A1:C3区域
    ws.Range("A1:C3").Clear
    
    ' 设置不同的土黄色背景
    ws.Range("A1").Interior.Color = 65535        ' 纯黄色
    ws.Range("A1").Value = "Pure Yellow"
    
    ws.Range("B1").Interior.Color = 16776960     ' 土黄色1
    ws.Range("B1").Value = "Yellow 1"
    
    ws.Range("C1").Interior.Color = 16777088     ' 土黄色2
    ws.Range("C1").Value = "Yellow 2"
    
    ws.Range("A2").Interior.Color = 16777164    ' 土黄色3
    ws.Range("A2").Value = "Yellow 3"
    
    ws.Range("B2").Interior.Color = 16777200     ' 土黄色4
    ws.Range("B2").Value = "Yellow 4"
    
    ' 测试无内容的土黄色单元格
    ws.Range("C2").Interior.Color = 16777000
    ' 不设置Value，测试无内容但有背景色的情况
    
    MsgBox "Yellow test cells created! Now run TestYellowBackground to analyze them.", vbInformation
End Sub

' 快速测试土黄色问题
Public Sub QuickYellowTest()
    Dim ws As Worksheet
    Set ws = ActiveSheet
    
    Debug.Print "=== Quick Yellow Test ==="
    
    ' 测试A1单元格（如果有土黄色背景）
    Dim testCell As Range
    Set testCell = ws.Range("A1")
    
    Debug.Print "Testing cell A1:"
    Debug.Print "  Interior.Color: " & testCell.Interior.Color
    Debug.Print "  DisplayFormat.Interior.Color: " & testCell.DisplayFormat.Interior.Color
    Debug.Print "  GetCellFillColor result: " & GetCellFillColor(testCell)
    
    ' 如果GetCellFillColor返回transparent，但实际有颜色，说明有问题
    Dim fillColor As String
    fillColor = GetCellFillColor(testCell)
    
    If fillColor = "transparent" And testCell.DisplayFormat.Interior.Color <> -4142 Then
        Debug.Print "  PROBLEM DETECTED: Cell has color but GetCellFillColor returned transparent!"
        Debug.Print "  This is likely the cause of missing yellow backgrounds."
    Else
        Debug.Print "  Color detection working correctly."
    End If
    
    MsgBox "Quick yellow test completed! Check immediate window for results.", vbInformation
End Sub

' 测试TLdraw颜色映射的完整性
Public Sub TestTldrawColorMapping()
    Dim ws As Worksheet
    Set ws = ActiveSheet
    
    Debug.Print "=== TLdraw Color Mapping Test ==="
    
    ' 测试Excel的56种标准颜色
    Debug.Print "Testing Excel's 56 standard colors:"
    Dim i As Long
    For i = 1 To 56
        Dim colorValue As Long
        colorValue = ThisWorkbook.Colors(i)
        
        Dim r As Long, g As Long, b As Long
        r = (colorValue And &HFF)
        g = (colorValue \ &H100) And &HFF
        b = (colorValue \ &H65536) And &HFF
        
        Dim mappedColor As String
        mappedColor = MapExcelColorToTldraw(colorValue)
        
        Debug.Print "ColorIndex " & i & ": RGB(" & r & "," & g & "," & b & ") -> " & mappedColor
    Next i
    
    ' 测试常见的自定义颜色
    Debug.Print "Testing common custom colors:"
    Dim customColors As Variant
    customColors = Array(65535, 16776960, 16777088, 16777164, 16777200, 255, 65280, 16711680, 16777215, 0, 8421504, 12632256, 16777200)
    
    For i = 0 To UBound(customColors)
        Dim customColor As Long
        customColor = customColors(i)
        Dim mappedCustomColor As String
        mappedCustomColor = MapExcelColorToTldraw(customColor)
        
        Debug.Print "Custom color " & customColor & " -> " & mappedCustomColor
    Next i
    
    ' 测试当前选中单元格
    Dim selectedCell As Range
    Set selectedCell = Selection
    
    Debug.Print "Selected cell " & selectedCell.Address & ":"
    Debug.Print "  Original color: " & selectedCell.DisplayFormat.Interior.Color
    Debug.Print "  Mapped to: " & MapExcelColorToTldraw(selectedCell.DisplayFormat.Interior.Color)
    
    MsgBox "TLdraw color mapping test completed! Check immediate window for results.", vbInformation
End Sub

' 创建TLdraw颜色测试工作表
Public Sub CreateTldrawColorTest()
    Dim ws As Worksheet
    Set ws = ActiveSheet
    
    ' 清除测试区域
    ws.Range("A1:J10").Clear
    
    ' 创建TLdraw颜色测试
    Dim tldrawColors As Variant
    tldrawColors = Array(Array("black", 0, 0, 0), Array("white", 255, 255, 255), Array("red", 255, 0, 0), Array("green", 0, 255, 0), Array("blue", 0, 0, 255), Array("yellow", 255, 255, 0), Array("orange", 255, 165, 0), Array("purple", 128, 0, 128), Array("pink", 255, 192, 203), Array("cyan", 0, 255, 255))
    
    Dim i As Long
    For i = 0 To UBound(tldrawColors)
        Dim colorName As String
        Dim r As Long, g As Long, b As Long
        colorName = tldrawColors(i)(0)
        r = tldrawColors(i)(1)
        g = tldrawColors(i)(2)
        b = tldrawColors(i)(3)
        
        Dim colorValue As Long
        colorValue = RGB(r, g, b)
        
        ' 设置单元格背景色
        Dim cell As Range
        Set cell = ws.Cells(1 + (i \ 5), 1 + (i Mod 5))
        cell.Interior.Color = colorValue
        cell.Value = colorName
        cell.Font.Color = RGB(255 - r, 255 - g, 255 - b)  ' 对比色文字
    Next i
    
    MsgBox "TLdraw color test sheet created! Run TestTldrawColorMapping to analyze.", vbInformation
End Sub

' 测试原始颜色信息输出
Public Sub TestRawColorInfo()
    Dim ws As Worksheet
    Set ws = ActiveSheet
    
    Debug.Print "=== Raw Color Info Test ==="
    
    ' 测试几个单元格的原始颜色信息
    Dim testCells As Variant
    testCells = Array("A1", "B1", "C1", "A2", "B2", "C2")
    
    Dim i As Long
    For i = 0 To UBound(testCells)
        Dim cell As Range
        Set cell = ws.Range(testCells(i))
        
        Debug.Print "Cell " & testCells(i) & ":"
        Debug.Print "  Raw color info: " & GetCellFillColor(cell)
        Debug.Print "  ---"
    Next i
    
    MsgBox "Raw color info test completed! Check immediate window for results.", vbInformation
End Sub

' 测试JSON格式是否正确
Public Sub TestJsonFormat()
    Dim ws As Worksheet
    Set ws = ActiveSheet
    
    Debug.Print "=== JSON Format Test ==="
    
    ' 测试颜色信息JSON格式
    Dim testColor As String
    testColor = BuildColorInfo(16776960, 16776960, 6)
    Debug.Print "Color info JSON: " & testColor
    
    ' 测试单元格JSON构建
    Dim testCell As Range
    Set testCell = ws.Range("A1")
    
    ' 模拟单元格JSON构建
    Dim cellJson As String
    cellJson = "{""r"":1,""c"":1,""x"":0,""y"":0,""w"":100,""h"":20,""v"":""test"",""fillColor"":""" & testColor & """}"
    Debug.Print "Cell JSON: " & cellJson
    
    ' 测试完整的JSON数组
    Dim jsonArray As String
    jsonArray = "[" & cellJson & "]"
    Debug.Print "JSON Array: " & jsonArray
    
    MsgBox "JSON format test completed! Check immediate window for results.", vbInformation
End Sub

' 测试实际的颜色输出格式
Public Sub TestActualColorOutput()
    Dim ws As Worksheet
    Set ws = ActiveSheet
    
    Debug.Print "=== Actual Color Output Test ==="
    
    ' 测试几个单元格的实际颜色输出
    Dim testCells As Variant
    testCells = Array("A1", "B1", "C1", "A2", "B2", "C2")
    
    Dim i As Long
    For i = 0 To UBound(testCells)
        Dim cell As Range
        Set cell = ws.Range(testCells(i))
        
        Debug.Print "Cell " & testCells(i) & ":"
        Debug.Print "  DisplayFormat.Color: " & cell.DisplayFormat.Interior.Color
        Debug.Print "  Interior.Color: " & cell.Interior.Color
        Debug.Print "  Interior.ColorIndex: " & cell.Interior.ColorIndex
        Debug.Print "  GetCellFillColor output: " & GetCellFillColor(cell)
        Debug.Print "  ---"
    Next i
    
    ' 测试有颜色的单元格
    Debug.Print "Testing colored cells:"
    
    ' 设置一些测试颜色
    ws.Range("A1").Interior.Color = RGB(255, 255, 0)  ' 黄色
    ws.Range("B1").Interior.Color = RGB(255, 0, 0)    ' 红色
    ws.Range("C1").Interior.Color = RGB(0, 255, 0)     ' 绿色
    
    For i = 0 To 2
        Dim testCell As Range
        Set testCell = ws.Range(testCells(i))
        
        Debug.Print "Colored cell " & testCells(i) & ":"
        Debug.Print "  DisplayFormat.Color: " & testCell.DisplayFormat.Interior.Color
        Debug.Print "  GetCellFillColor output: " & GetCellFillColor(testCell)
        Debug.Print "  ---"
    Next i
    
    MsgBox "Actual color output test completed! Check immediate window for results.", vbInformation
End Sub

' 新增：列出所有已导出的工作表信息
Public Sub ListExportedSheets()
    Dim wb As Workbook
    Set wb = ActiveWorkbook
    
    Dim tgt As Worksheet
    Set tgt = EnsureLayoutJsonSheet(wb)
    
    Dim maxRow As Long: maxRow = tgt.Cells(tgt.Rows.Count, 1).End(xlUp).Row
    Dim exportedSheets As String: exportedSheets = ""
    Dim count As Long: count = 0
    
    Debug.Print "=== Exported Sheets in LayoutJson ==="
    
    Dim row As Long
    For row = 1 To maxRow
        Dim cellValue As String
        cellValue = CStr(tgt.Cells(row, 1).Value2)
        
        ' 检查JSON中是否包含工作表信息
        If InStr(cellValue, Q("sheet") & ":{" & Q("name")) > 0 Then
            ' 提取工作表名称
            Dim sheetName As String
            sheetName = ExtractSheetNameFromJson(cellValue)
            
            If sheetName <> "" Then
                count = count + 1
                exportedSheets = exportedSheets & count & ". " & sheetName & " (Row " & row & ")" & vbCrLf
                Debug.Print count & ". Sheet: " & sheetName & " | Row: " & row
            End If
        End If
    Next row
    
    If count = 0 Then
        MsgBox "No exported sheets found in LayoutJson", vbInformation, "Exported Sheets"
    Else
        MsgBox "Found " & count & " exported sheet(s):" & vbCrLf & vbCrLf & exportedSheets & "Detailed information has been output to immediate window, press Ctrl+G to view", vbInformation, "Exported Sheets"
    End If
End Sub

' 从JSON字符串中提取工作表名称
Private Function ExtractSheetNameFromJson(ByVal jsonStr As String) As String
    On Error Resume Next
    
    ' 查找 "sheet":{"name":"工作表名称" 的模式
    Dim startPos As Long, endPos As Long
    Dim searchPattern As String
    searchPattern = Q("sheet") & ":{" & Q("name") & ":" & Q("")
    
    startPos = InStr(jsonStr, searchPattern)
    If startPos > 0 Then
        startPos = startPos + Len(searchPattern)
        ' 查找下一个引号
        endPos = InStr(startPos, jsonStr, """")
        If endPos > startPos Then
            ExtractSheetNameFromJson = Mid(jsonStr, startPos, endPos - startPos)
        End If
    End If
    
    On Error GoTo 0
End Function


' ================ CORE JSON BUILDER =================
Private Function BuildSheetJson(ByVal ws As Worksheet, ByRef outCells As Long, ByRef outText As Long, ByRef outPics As Long, ByRef outBorders As Long) As String
    Dim sb As String
    Dim pt2px As Double: pt2px = PtToPxFactor()  ' usually 96/72 = 1.333333
    Dim wPx As Long, hPx As Long
    GetSheetSizePx ws, wPx, hPx, pt2px

    sb = "{"
    sb = sb & Q("version") & ":" & Q("layout.v1") & ","
    sb = sb & Q("generatedAt") & ":" & Q(Format$(Now, "yyyy-mm-dd\THH:NN:SS\Z")) & ","
    sb = sb & Q("units") & ":" & Q("px") & ","
    sb = sb & Q("workbook") & ":" & Q(EscapeJson(ws.Parent.Name)) & ","
    sb = sb & Q("sheet") & ":{"
    sb = sb & Q("name") & ":" & Q(EscapeJson(ws.Name)) & ","
    sb = sb & Q("sizePx") & ":{" & Q("width") & ":" & CNum(wPx) & "," & Q("height") & ":" & CNum(hPx) & "},"
    sb = sb & Q("metrics") & ":{" & Q("ptToPx") & ":" & CNumD(pt2px) & "},"
    sb = sb & Q("cells") & ":" & CellsToJsonSparse(ws, outCells) & ","
    sb = sb & Q("textboxes") & ":" & ShapesTextboxesToJson(ws, outText, pt2px) & ","
    sb = sb & Q("images") & ":" & PicturesToJson(ws, outPics, pt2px) & ","
    
    ' 恢复边框处理
    Dim bordersJson As String
    bordersJson = BordersToJson(ws, pt2px, outBorders)
    sb = sb & Q("borders") & ":" & bordersJson
    sb = sb & "}" ' sheet
    sb = sb & "}"
    
    ' 简单调试：只显示JSON开头
    Debug.Print "JSON starts with: " & Left(sb, 100)

    BuildSheetJson = sb
End Function


' ================ CELLS (complete grid) ====================
' Output: [{"r":1,"c":1,"v":"text","x":0,"y":0,"w":100,"h":20}, ...] all cells with position
Private Function CellsToJsonSparse(ByVal ws As Worksheet, ByRef nonEmptyCount As Long) As String
    On Error GoTo EMPTY_RANGE

    Dim ur As Range
    Set ur = ws.UsedRange
    If ur Is Nothing Then GoTo EMPTY_RANGE

    Dim r As Long, c As Long
    Dim sb As String: sb = "["
    nonEmptyCount = 0
    Dim pt2px As Double: pt2px = PtToPxFactor()

    For r = 1 To ur.Rows.Count
        For c = 1 To ur.Columns.Count
            Dim cell As Range
            Set cell = ur.Cells(r, c)
            
            ' 检查单元格是否被隐藏（行或列隐藏）
            If IsCellHidden(cell) Then
                GoTo NextCell
            End If
            
            ' 获取合并单元格的代表单元格
            Dim representativeCell As Range
            Set representativeCell = GetRepresentativeCell(cell)
            
            ' 如果当前单元格不是合并区域的代表单元格，跳过
            If Not (cell.Row = representativeCell.Row And cell.Column = representativeCell.Column) Then
                GoTo NextCell
            End If
            
            Dim v As Variant
            v = representativeCell.Value2
            
            ' 处理有内容的单元格或有背景色的单元格
            Dim hasContent As Boolean, hasBackground As Boolean
            hasContent = (Not IsEmpty(v) And CStr(v) <> "")
            hasBackground = (GetCellFillColor(representativeCell) <> "transparent")
            
            If hasContent Or hasBackground Then
                If nonEmptyCount > 0 Then sb = sb & ","
                
                ' 获取合并区域的尺寸信息
                Dim mergeArea As Range
                Set mergeArea = representativeCell.MergeArea
                
                ' 构建单元格信息，包括位置、尺寸、对齐方式、底色和字体信息
                ' 对于合并单元格，使用合并区域的尺寸
                sb = sb & "{""r"":" & CNum(ur.row + r - 1) & _
                          ",""c"":" & CNum(ur.Column + c - 1) & _
                          ",""x"":" & CNumD(mergeArea.Left * pt2px) & _
                          ",""y"":" & CNumD(mergeArea.Top * pt2px) & _
                          ",""w"":" & CNumD(mergeArea.Width * pt2px) & _
                          ",""h"":" & CNumD(mergeArea.Height * pt2px) & _
                          ",""v"":""" & IIf(hasContent, EscapeJson(CStr(v)), "") & """," & _
                          """hAlign"":""" & GetCellHAlign(representativeCell) & """," & _
                          """vAlign"":""" & GetCellVAlign(representativeCell) & """," & _
                          """fillColor"":""" & GetCellFillColor(representativeCell) & """," & _
                          """fontName"":""" & EscapeJson(representativeCell.Font.Name) & """," & _
                          """fontSize"":" & CNumD(representativeCell.Font.Size) & "," & _
                          """fontColor"":""" & RGBToHex(representativeCell.Font.Color) & """," & _
                          """fontBold"":" & LCase$(CStr(representativeCell.Font.Bold)) & "," & _
                          """fontItalic"":" & LCase$(CStr(representativeCell.Font.Italic)) & "," & _
                          """isMerged"":" & IIf(representativeCell.MergeCells, "true", "false") & "," & _
                          """mergeArea"":""" & mergeArea.Address & """}"
                
                nonEmptyCount = nonEmptyCount + 1
            End If
            
NextCell:
        Next c
    Next r

    sb = sb & "]"
    CellsToJsonSparse = sb
    Exit Function

EMPTY_RANGE:
    CellsToJsonSparse = "[]"
End Function


' ================ TEXTBOXES =========================
' Output: [{name,left,top,width,height,rotation,z,text,style:{...}}]
Private Function ShapesTextboxesToJson(ByVal ws As Worksheet, ByRef countOut As Long, ByVal pt2px As Double) As String
    Dim sb As String: sb = "["
    Dim first As Boolean: first = True

    Dim shp As Shape
    For Each shp In ws.Shapes
        ' Skip group objects, only process individual shapes
        If shp.Type = msoGroup Then
            ' Recursively process each sub-shape in the group
            Dim subShp As Shape
            For Each subShp In shp.GroupItems
                If subShp.Type = msoTextBox Or (subShp.Type <> msoGroup And HasTextFrame(subShp)) Then
                    If Not first Then sb = sb & "," Else first = False
                    sb = sb & BuildShapeJson(subShp, pt2px)
                    countOut = countOut + 1
                End If
            Next subShp
        ElseIf shp.Type = msoTextBox Or HasTextFrame(shp) Then
            If Not first Then sb = sb & "," Else first = False
            sb = sb & BuildShapeJson(shp, pt2px)
            countOut = countOut + 1
        End If
    Next shp

    sb = sb & "]"
    ShapesTextboxesToJson = sb
End Function


' ================ IMAGES ============================
' Output: [{id,name,left,top,width,height,rotation,z,anchor}]
Private Function PicturesToJson(ByVal ws As Worksheet, ByRef countOut As Long, ByVal pt2px As Double) As String
    ' Collect all picture shapes
    Dim picShapes() As Shape
    Dim picCount As Long: picCount = 0
    
    Dim shp As Shape
    For Each shp In ws.Shapes
        If shp.Type = msoPicture Or shp.Type = msoLinkedPicture Then
            ReDim Preserve picShapes(picCount)
            Set picShapes(picCount) = shp
            picCount = picCount + 1
        End If
    Next shp
    
    ' If no pictures, return empty array
    If picCount = 0 Then
        PicturesToJson = "[]"
        Exit Function
    End If
    
    ' Sort pictures by multiple fields: Z → fromRow → fromCol → Top → Left → Name
    Call SortPictures(picShapes, picCount, ws)
    
    ' Build JSON
    Dim sb As String: sb = "["
    Dim i As Long
    For i = 0 To picCount - 1
        If i > 0 Then sb = sb & ","
        sb = sb & BuildPictureJson(picShapes(i), ws, pt2px)
        countOut = countOut + 1
    Next i
    
    sb = sb & "]"
    PicturesToJson = sb
End Function


' ================ HELPERS ===========================
Private Function EnsureLayoutJsonSheet(wb As Workbook) As Worksheet
    Dim s As Worksheet
    For Each s In wb.Worksheets
        If s.Name = "LayoutJson" Then
            Set EnsureLayoutJsonSheet = s
            Exit Function
        End If
    Next
    Set EnsureLayoutJsonSheet = wb.Worksheets.Add(After:=wb.Sheets(wb.Sheets.Count))
    On Error Resume Next
    EnsureLayoutJsonSheet.Name = "LayoutJson"
    On Error GoTo 0
End Function

Private Sub GetSheetSizePx(ws As Worksheet, ByRef wPx As Long, ByRef hPx As Long, ByVal pt2px As Double)
    ' Approximate canvas size: used range bounds (points) → px
    Dim ur As Range: Set ur = ws.UsedRange
    If ur Is Nothing Then
        wPx = 0: hPx = 0: Exit Sub
    End If
    Dim rightPt As Double, bottomPt As Double
    rightPt = ur.Left + ur.Width
    bottomPt = ur.Top + ur.Height
    wPx = CLng(rightPt * pt2px)
    hPx = CLng(bottomPt * pt2px)
End Sub

Private Function PtToPxFactor() As Double
    ' 96 DPI typical. If you have custom scaling, you can change to 72 * ActiveWindow.Zoom / 54 etc.
    PtToPxFactor = 96# / 72#
End Function

' ---- font & align helpers ----
' 获取单元格水平对齐方式
Private Function GetCellHAlign(ByVal cell As Range) As String
    On Error Resume Next
    Select Case cell.HorizontalAlignment
        Case xlLeft:      GetCellHAlign = "left"
        Case xlCenter:    GetCellHAlign = "center"
        Case xlRight:     GetCellHAlign = "right"
        Case xlJustify:   GetCellHAlign = "justify"
        Case xlDistributed: GetCellHAlign = "distributed"
        Case xlGeneral:   GetCellHAlign = "general"
        Case Else:        GetCellHAlign = "general"
    End Select
    On Error GoTo 0
End Function

' 获取单元格垂直对齐方式
Private Function GetCellVAlign(ByVal cell As Range) As String
    On Error Resume Next
    Select Case cell.VerticalAlignment
        Case xlTop:       GetCellVAlign = "top"
        Case xlCenter:    GetCellVAlign = "middle"
        Case xlBottom:    GetCellVAlign = "bottom"
        Case xlJustify:   GetCellVAlign = "justify"
        Case xlDistributed: GetCellVAlign = "distributed"
        Case Else:        GetCellVAlign = "bottom"
    End Select
    On Error GoTo 0
End Function

' 获取单元格填充颜色（输出原始颜色信息供JavaScript映射）
Private Function GetCellFillColor(ByVal cell As Range) As String
    On Error Resume Next
    
    ' 使用DisplayFormat获取实际显示的颜色（包括条件格式）
    Dim displayColor As Long
    displayColor = cell.DisplayFormat.Interior.Color
    
    ' 调试信息：记录颜色值
    Debug.Print "GetCellFillColor for " & cell.Address & ":"
    Debug.Print "  DisplayFormat.Color: " & displayColor
    Debug.Print "  Interior.Color: " & cell.Interior.Color
    Debug.Print "  Interior.ColorIndex: " & cell.Interior.ColorIndex
    
    ' 检查是否有填充颜色（不是自动颜色）
    If displayColor = -4142 Then  ' xlNone
        ' 检查是否真的是无填充
        If cell.Interior.ColorIndex = xlNone And cell.Interior.Pattern = xlNone Then
            GetCellFillColor = "transparent"  ' 使用透明而不是白色
            Debug.Print "  Result: transparent (no fill)"
        Else
            ' 输出原始颜色信息供JavaScript映射
            GetCellFillColor = BuildColorInfo(displayColor, cell.Interior.Color, cell.Interior.ColorIndex)
            Debug.Print "  Result: " & GetCellFillColor & " (raw color info for JS mapping)"
        End If
    ElseIf displayColor = 16777215 Then  ' 白色
        ' 检查是否真的是白色填充还是无填充
        If cell.Interior.ColorIndex = xlNone And cell.Interior.Pattern = xlNone Then
            GetCellFillColor = "transparent"
            Debug.Print "  Result: transparent (no fill, white display)"
        Else
            GetCellFillColor = BuildColorInfo(displayColor, cell.Interior.Color, cell.Interior.ColorIndex)
            Debug.Print "  Result: " & GetCellFillColor & " (white raw color info)"
        End If
    Else
        ' 有填充颜色，输出原始颜色信息
        GetCellFillColor = BuildColorInfo(displayColor, cell.Interior.Color, cell.Interior.ColorIndex)
        Debug.Print "  Result: " & GetCellFillColor & " (raw color info for JS mapping)"
        
        ' 特别检查土黄色情况
        If displayColor >= 65535 And displayColor <= 16777200 Then
            Debug.Print "  Yellow color detected, raw info: " & GetCellFillColor
        End If
    End If
    
    On Error GoTo 0
End Function

' 构建颜色信息JSON（供JavaScript映射使用）
Private Function BuildColorInfo(ByVal displayColor As Long, ByVal interiorColor As Long, ByVal colorIndex As Long) As String
    Dim sb As String
    sb = "{"
    sb = sb & """displayColor"":" & displayColor & ","
    sb = sb & """interiorColor"":" & interiorColor & ","
    sb = sb & """colorIndex"":" & colorIndex & ","
    sb = sb & """rgb"":""" & RGBToHex(displayColor) & """"
    sb = sb & "}"
    
    ' 转义JSON字符串中的引号，使其可以作为JSON字符串值使用
    BuildColorInfo = EscapeJson(sb)
End Function

Private Function FontNameOfShape(shp As Shape) As String
    On Error Resume Next
    FontNameOfShape = shp.TextFrame2.TextRange.Font.Name
End Function

Private Function FontSizeOfShape(shp As Shape) As Double
    On Error Resume Next
    FontSizeOfShape = shp.TextFrame2.TextRange.Font.Size
End Function

Private Function FontBoldOfShape(shp As Shape) As Boolean
    On Error Resume Next
    FontBoldOfShape = (shp.TextFrame2.TextRange.Font.Bold = msoTrue)
End Function

Private Function FontItalicOfShape(shp As Shape) As Boolean
    On Error Resume Next
    FontItalicOfShape = (shp.TextFrame2.TextRange.Font.Italic = msoTrue)
End Function

Private Function FontColorHexOfShape(shp As Shape) As String
    On Error Resume Next
    Dim rgbVal As Long
    rgbVal = shp.TextFrame2.TextRange.Font.Fill.ForeColor.RGB
    FontColorHexOfShape = RGBToHex(rgbVal)
End Function

Private Function HAlignOfShape(shp As Shape) As String
    On Error Resume Next
    Select Case shp.TextFrame2.TextRange.ParagraphFormat.Alignment
        Case msoAlignLeft:   HAlignOfShape = "left"
        Case msoAlignCenter: HAlignOfShape = "center"
        Case msoAlignRight:  HAlignOfShape = "right"
        Case Else:           HAlignOfShape = "general"
    End Select
End Function

Private Function VAlignOfShape(shp As Shape) As String
    On Error Resume Next
    Select Case shp.TextFrame2.VerticalAnchor
        Case msoAnchorTop:    VAlignOfShape = "top"
        Case msoAnchorMiddle: VAlignOfShape = "middle"
        Case msoAnchorBottom: VAlignOfShape = "bottom"
        Case Else:            VAlignOfShape = "top"
    End Select
End Function

' ---- JSON utils ----
Private Function EscapeJson(ByVal s As String) As String
    Dim t As String
    t = s
    t = Replace$(t, "\", "\\")
    t = Replace$(t, """", "\""")
    t = Replace$(t, vbCr, "\r")
    t = Replace$(t, vbLf, "\n")
    t = Replace$(t, vbTab, "\t")
    EscapeJson = t
End Function

Private Function Q(ByVal s As String) As String
    Q = """" & s & """"
End Function

' numeric to string with dot decimal (locale-safe)
Private Function CNumD(ByVal d As Double) As String
    ' 降低精度到1位小数，节省空间
    CNumD = Replace$(CStr(Round(d, 1)), ",", ".")
End Function

Private Function CNum(ByVal l As Long) As String
    CNum = CStr(l)
End Function

' 映射Excel颜色到TLdraw支持的颜色枚举
Private Function MapExcelColorToTldraw(ByVal excelColor As Long) As String
    On Error Resume Next
    
    ' 处理特殊情况
    If excelColor = -4142 Then  ' xlNone
        MapExcelColorToTldraw = "transparent"
        Exit Function
    End If
    
    If excelColor < 0 Then
        ' 处理负数情况（Excel有时会返回负数）
        excelColor = excelColor + 16777216
    End If
    
    ' 获取RGB值
    Dim r As Long, g As Long, b As Long
    r = (excelColor And &HFF)
    g = (excelColor \ &H100) And &HFF
    b = (excelColor \ &H10000) And &HFF
    
    ' 确保值在有效范围内
    If r < 0 Then r = 0
    If r > 255 Then r = 255
    If g < 0 Then g = 0
    If g > 255 Then g = 255
    If b < 0 Then b = 0
    If b > 255 Then b = 255
    
    ' 映射到TLdraw支持的颜色
    MapExcelColorToTldraw = GetClosestTldrawColor(r, g, b)
    
    On Error GoTo 0
End Function

' 获取最接近的TLdraw颜色
Private Function GetClosestTldrawColor(ByVal r As Long, ByVal g As Long, ByVal b As Long) As String
    ' TLdraw支持的颜色枚举（基于常见的颜色调色板）
    Dim tldrawColors As Variant
    tldrawColors = Array(Array("black", 0, 0, 0), Array("white", 255, 255, 255), Array("red", 255, 0, 0), Array("green", 0, 255, 0), Array("blue", 0, 0, 255), Array("yellow", 255, 255, 0), Array("orange", 255, 165, 0), Array("purple", 128, 0, 128), Array("pink", 255, 192, 203), Array("cyan", 0, 255, 255), Array("magenta", 255, 0, 255), Array("lime", 0, 255, 0), Array("navy", 0, 0, 128), Array("maroon", 128, 0, 0), Array("olive", 128, 128, 0), Array("teal", 0, 128, 128), Array("silver", 192, 192, 192), Array("gray", 128, 128, 128), Array("lightgray", 211, 211, 211), Array("darkgray", 64, 64, 64), Array("lightblue", 173, 216, 230), Array("darkblue", 0, 0, 139), Array("lightgreen", 144, 238, 144), Array("darkgreen", 0, 100, 0), Array("lightyellow", 255, 255, 224), Array("darkyellow", 184, 134, 11), Array("lightred", 255, 182, 193), Array("darkred", 139, 0, 0), Array("brown", 165, 42, 42), Array("tan", 210, 180, 140))
    
    Dim minDistance As Double
    minDistance = 999999
    Dim closestColor As String
    closestColor = "black"  ' 默认颜色
    
    Dim i As Long
    For i = 0 To UBound(tldrawColors)
        Dim tr As Long, tg As Long, tb As Long
        tr = tldrawColors(i)(1)
        tg = tldrawColors(i)(2)
        tb = tldrawColors(i)(3)
        
        ' 计算欧几里得距离
        Dim distance As Double
        distance = Sqr((r - tr) ^ 2 + (g - tg) ^ 2 + (b - tb) ^ 2)
        
        If distance < minDistance Then
            minDistance = distance
            closestColor = tldrawColors(i)(0)
        End If
    Next i
    
    GetClosestTldrawColor = closestColor
End Function

' 保留原有的RGBToHex函数用于调试
Private Function RGBToHex(ByVal rgbVal As Long) As String
    On Error Resume Next
    
    ' 处理特殊情况
    If rgbVal = -4142 Then  ' xlNone
        RGBToHex = "transparent"
        Exit Function
    End If
    
    If rgbVal < 0 Then
        ' 处理负数情况（Excel有时会返回负数）
        rgbVal = rgbVal + 16777216
    End If
    
    Dim r As Long, g As Long, b As Long
    r = (rgbVal And &HFF)
    g = (rgbVal \ &H100) And &HFF
    b = (rgbVal \ &H10000) And &HFF
    
    ' 确保值在有效范围内
    If r < 0 Then r = 0
    If r > 255 Then r = 255
    If g < 0 Then g = 0
    If g > 255 Then g = 255
    If b < 0 Then b = 0
    If b > 255 Then b = 255
    
    RGBToHex = "#" & Right$("0" & Hex$(r), 2) & Right$("0" & Hex$(g), 2) & Right$("0" & Hex$(b), 2)
    
    On Error GoTo 0
End Function

' Check if shape has text frame (safe access)
Private Function HasTextFrame(shp As Shape) As Boolean
    On Error Resume Next
    HasTextFrame = (shp.TextFrame2.HasText = msoTrue)
    On Error GoTo 0
End Function

' Build JSON string for a single shape
Private Function BuildShapeJson(shp As Shape, pt2px As Double) As String
    Dim sb As String
    sb = "{"
    sb = sb & Q("name") & ":" & Q(EscapeJson(shp.Name)) & ","
    sb = sb & Q("left") & ":" & CNumD(shp.Left * pt2px) & ","
    sb = sb & Q("top") & ":" & CNumD(shp.Top * pt2px) & ","
    sb = sb & Q("width") & ":" & CNumD(shp.Width * pt2px) & ","
    sb = sb & Q("height") & ":" & CNumD(shp.Height * pt2px) & ","
    sb = sb & Q("rotation") & ":" & CNumD(shp.Rotation) & ","
    sb = sb & Q("z") & ":" & CNum(shp.ZOrderPosition) & ","
    
    ' Safely get text content
    Dim textContent As String
    textContent = GetShapeText(shp)
    sb = sb & Q("text") & ":" & Q(EscapeJson(textContent)) & ","
    
    ' Get rich text formatting information
    Dim richTextFormatting As String
    richTextFormatting = GetRichTextFormatting(shp)
    sb = sb & Q("richTextFormatting") & ":" & richTextFormatting & ","
    
    ' border information
    sb = sb & Q("border") & ":{"
    sb = sb & Q("style") & ":" & Q(GetShapeBorderStyle(shp)) & ","
    sb = sb & Q("color") & ":" & Q(GetShapeBorderColor(shp)) & ","
    sb = sb & Q("weight") & ":" & CNumD(GetShapeBorderWeight(shp))
    sb = sb & "},"
    
    ' fill information
    sb = sb & Q("fill") & ":{"
    sb = sb & Q("color") & ":" & Q(GetShapeFillColor(shp)) & ","
    sb = sb & Q("opacity") & ":" & CNumD(GetShapeFillOpacity(shp))
    sb = sb & "},"
    
    ' style
    sb = sb & Q("style") & ":{"
    sb = sb & Q("fontName") & ":" & Q(EscapeJson(FontNameOfShape(shp))) & ","
    sb = sb & Q("fontSize") & ":" & CNumD(FontSizeOfShape(shp)) & ","
    sb = sb & Q("bold") & ":" & LCase$(CStr(FontBoldOfShape(shp))) & ","
    sb = sb & Q("italic") & ":" & LCase$(CStr(FontItalicOfShape(shp))) & ","
    sb = sb & Q("color") & ":" & Q(FontColorHexOfShape(shp)) & ","
    sb = sb & Q("hAlign") & ":" & Q(HAlignOfShape(shp)) & ","
    sb = sb & Q("vAlign") & ":" & Q(VAlignOfShape(shp))
    sb = sb & "}"
    sb = sb & "}"
    
    BuildShapeJson = sb
End Function

' Safely get shape text content
Private Function GetShapeText(shp As Shape) As String
    On Error Resume Next
    GetShapeText = shp.TextFrame2.TextRange.Text
    On Error GoTo 0
    If Err.Number <> 0 Then
        GetShapeText = ""
    End If
End Function

' Get rich text formatting information for a shape
Private Function GetRichTextFormatting(shp As Shape) As String
    On Error Resume Next
    
    Dim sb As String: sb = "["
    Dim first As Boolean: first = True
    
    ' 检查是否有文本
    If Not shp.TextFrame2.HasText Then
        GetRichTextFormatting = "[]"
        Exit Function
    End If
    
    Dim textRange As Object
    Set textRange = shp.TextFrame2.TextRange
    
    ' 遍历每个字符，检查格式化变化
    Dim i As Long
    Dim currentFont As String, currentSize As Double, currentBold As Boolean, currentItalic As Boolean, currentColor As String
    Dim startPos As Long, endPos As Long
    Dim textLength As Long
    
    textLength = textRange.Length
    If textLength = 0 Then
        GetRichTextFormatting = "[]"
        Exit Function
    End If
    
    ' 初始化第一个字符的格式
    currentFont = textRange.Characters(1, 1).Font.Name
    currentSize = textRange.Characters(1, 1).Font.Size
    currentBold = (textRange.Characters(1, 1).Font.Bold = msoTrue)
    currentItalic = (textRange.Characters(1, 1).Font.Italic = msoTrue)
    currentColor = RGBToHex(textRange.Characters(1, 1).Font.Fill.ForeColor.RGB)
    startPos = 1
    
    ' 遍历所有字符，寻找格式变化
    For i = 2 To textLength
        Dim charFont As String, charSize As Double, charBold As Boolean, charItalic As Boolean, charColor As String
        
        charFont = textRange.Characters(i, 1).Font.Name
        charSize = textRange.Characters(i, 1).Font.Size
        charBold = (textRange.Characters(i, 1).Font.Bold = msoTrue)
        charItalic = (textRange.Characters(i, 1).Font.Italic = msoTrue)
        charColor = RGBToHex(textRange.Characters(i, 1).Font.Fill.ForeColor.RGB)
        
        ' 检查格式是否发生变化
        If charFont <> currentFont Or charSize <> currentSize Or charBold <> currentBold Or charItalic <> currentItalic Or charColor <> currentColor Then
            ' 格式发生变化，保存当前段落的格式信息
            endPos = i - 1
            
            If Not first Then sb = sb & "," Else first = False
            sb = sb & "{"
            sb = sb & Q("start") & ":" & CNum(startPos) & ","
            sb = sb & Q("end") & ":" & CNum(endPos) & ","
            sb = sb & Q("fontName") & ":" & Q(EscapeJson(currentFont)) & ","
            sb = sb & Q("fontSize") & ":" & CNumD(currentSize) & ","
            sb = sb & Q("bold") & ":" & LCase$(CStr(currentBold)) & ","
            sb = sb & Q("italic") & ":" & LCase$(CStr(currentItalic)) & ","
            sb = sb & Q("color") & ":" & Q(currentColor)
            sb = sb & "}"
            
            ' 更新当前格式
            currentFont = charFont
            currentSize = charSize
            currentBold = charBold
            currentItalic = charItalic
            currentColor = charColor
            startPos = i
        End If
    Next i
    
    ' 处理最后一段
    endPos = textLength
    If Not first Then sb = sb & "," Else first = False
    sb = sb & "{"
    sb = sb & Q("start") & ":" & CNum(startPos) & ","
    sb = sb & Q("end") & ":" & CNum(endPos) & ","
    sb = sb & Q("fontName") & ":" & Q(EscapeJson(currentFont)) & ","
    sb = sb & Q("fontSize") & ":" & CNumD(currentSize) & ","
    sb = sb & Q("bold") & ":" & LCase$(CStr(currentBold)) & ","
    sb = sb & Q("italic") & ":" & LCase$(CStr(currentItalic)) & ","
    sb = sb & Q("color") & ":" & Q(currentColor)
    sb = sb & "}"
    
    sb = sb & "]"
    GetRichTextFormatting = sb
    
    On Error GoTo 0
End Function

' Get shape border style
Private Function GetShapeBorderStyle(shp As Shape) As String
    On Error Resume Next
    ' 检查是否有边框
    If shp.Line.Visible = msoFalse Then
        GetShapeBorderStyle = "none"
        Exit Function
    End If
    
    Select Case shp.Line.Style
        Case 1: GetShapeBorderStyle = "solid"        ' msoLineSingle
        Case 2: GetShapeBorderStyle = "double"       ' msoLineThinThin
        Case 3: GetShapeBorderStyle = "thickThin"    ' msoLineThickThin
        Case 4: GetShapeBorderStyle = "thinThick"   ' msoLineThinThick
        Case 5: GetShapeBorderStyle = "thickBetweenThin" ' msoLineThickBetweenThin
        Case -4115: GetShapeBorderStyle = "dashed"   ' msoLineDash
        Case -4118: GetShapeBorderStyle = "dashDot"  ' msoLineDashDot
        Case -4119: GetShapeBorderStyle = "dashDotDot" ' msoLineDashDotDot
        Case -4117: GetShapeBorderStyle = "dotted"   ' msoLineDot
        Case -4142: GetShapeBorderStyle = "none"    ' msoLineNone
        Case Else: GetShapeBorderStyle = "none"  ' 默认无边框
    End Select
    On Error GoTo 0
End Function

' Get shape border color
Private Function GetShapeBorderColor(shp As Shape) As String
    On Error Resume Next
    GetShapeBorderColor = RGBToHex(shp.Line.ForeColor.RGB)
    On Error GoTo 0
End Function

' Get shape border weight
Private Function GetShapeBorderWeight(shp As Shape) As Double
    On Error Resume Next
    GetShapeBorderWeight = shp.Line.Weight
    On Error GoTo 0
End Function

' Get shape fill color
Private Function GetShapeFillColor(shp As Shape) As String
    On Error Resume Next
    ' 检查是否有填充
    If shp.Fill.Visible = msoFalse Then
        GetShapeFillColor = "#FFFFFF"  ' 无填充时返回白色
        Exit Function
    End If
    
    GetShapeFillColor = RGBToHex(shp.Fill.ForeColor.RGB)
    On Error GoTo 0
End Function

' Get shape fill opacity
Private Function GetShapeFillOpacity(shp As Shape) As Double
    On Error Resume Next
    ' 检查是否有填充
    If shp.Fill.Visible = msoFalse Then
        GetShapeFillOpacity = 0  ' 无填充时透明度为0
        Exit Function
    End If
    
    GetShapeFillOpacity = 1 - shp.Fill.Transparency
    On Error GoTo 0
End Function

' Sort pictures by multiple fields: Z → fromRow → fromCol → Top → Left → Name
Private Sub SortPictures(ByRef picShapes() As Shape, ByVal picCount As Long, ByVal ws As Worksheet)
    Dim i As Long, j As Long
    Dim temp As Shape
    
    ' Use bubble sort (simple but effective)
    For i = 0 To picCount - 2
        For j = 0 To picCount - 2 - i
            If ComparePictures(picShapes(j), picShapes(j + 1), ws) > 0 Then
                Set temp = picShapes(j)
                Set picShapes(j) = picShapes(j + 1)
                Set picShapes(j + 1) = temp
            End If
        Next j
    Next i
End Sub

' Compare sorting priority of two pictures
Private Function ComparePictures(shp1 As Shape, shp2 As Shape, ws As Worksheet) As Long
    ' 1. First sort by Z order (smaller ZOrderPosition comes first)
    If shp1.ZOrderPosition <> shp2.ZOrderPosition Then
        ComparePictures = shp1.ZOrderPosition - shp2.ZOrderPosition
        Exit Function
    End If
    
    ' 2. Then sort by fromRow (Top position converted to row number)
    Dim row1 As Long, row2 As Long
    row1 = GetRowFromTop(shp1.Top, ws)
    row2 = GetRowFromTop(shp2.Top, ws)
    If row1 <> row2 Then
        ComparePictures = row1 - row2
        Exit Function
    End If
    
    ' 3. Then sort by fromCol (Left position converted to column number)
    Dim col1 As Long, col2 As Long
    col1 = GetColFromLeft(shp1.Left, ws)
    col2 = GetColFromLeft(shp2.Left, ws)
    If col1 <> col2 Then
        ComparePictures = col1 - col2
        Exit Function
    End If
    
    ' 4. Then sort by Top
    If shp1.Top <> shp2.Top Then
        ComparePictures = Sgn(shp1.Top - shp2.Top)
        Exit Function
    End If
    
    ' 5. Then sort by Left
    If shp1.Left <> shp2.Left Then
        ComparePictures = Sgn(shp1.Left - shp2.Left)
        Exit Function
    End If
    
    ' 6. Finally sort by Name (string comparison)
    ComparePictures = StrComp(shp1.Name, shp2.Name, vbTextCompare)
End Function

' Calculate row number from Top position
Private Function GetRowFromTop(ByVal topPos As Double, ws As Worksheet) As Long
    Dim row As Long
    Dim cumHeight As Double: cumHeight = 0
    
    For row = 1 To ws.Rows.Count
        cumHeight = cumHeight + ws.Rows(row).Height
        If topPos <= cumHeight Then
            GetRowFromTop = row
            Exit Function
        End If
    Next row
    
    GetRowFromTop = ws.Rows.Count
End Function

' Calculate column number from Left position
Private Function GetColFromLeft(ByVal leftPos As Double, ws As Worksheet) As Long
    Dim col As Long
    Dim cumWidth As Double: cumWidth = 0
    
    For col = 1 To ws.Columns.Count
        cumWidth = cumWidth + ws.Columns(col).Width
        If leftPos <= cumWidth Then
            GetColFromLeft = col
            Exit Function
        End If
    Next col
    
    GetColFromLeft = ws.Columns.Count
End Function

' Build JSON string for a single picture
Private Function BuildPictureJson(shp As Shape, ws As Worksheet, pt2px As Double) As String
    Dim sb As String
    Dim stableId As String
    Dim anchor As String
    
    ' Generate stable ID: SheetName::Shape.Name
    stableId = ws.Name & "::" & shp.Name
    
    ' Calculate anchor information
    anchor = GetAnchorInfo(shp, ws)
    
    sb = "{"
    sb = sb & Q("id") & ":" & Q(EscapeJson(stableId)) & ","
    sb = sb & Q("name") & ":" & Q(EscapeJson(shp.Name)) & ","
    sb = sb & Q("left") & ":" & CNumD(shp.Left * pt2px) & ","
    sb = sb & Q("top") & ":" & CNumD(shp.Top * pt2px) & ","
    sb = sb & Q("width") & ":" & CNumD(shp.Width * pt2px) & ","
    sb = sb & Q("height") & ":" & CNumD(shp.Height * pt2px) & ","
    sb = sb & Q("rotation") & ":" & CNumD(shp.Rotation) & ","
    sb = sb & Q("z") & ":" & CNum(shp.ZOrderPosition) & ","
    sb = sb & Q("anchor") & ":" & Q(EscapeJson(anchor))
    sb = sb & "}"
    
    BuildPictureJson = sb
End Function

' Get anchor information
Private Function GetAnchorInfo(shp As Shape, ws As Worksheet) As String
    Dim row As Long, col As Long
    row = GetRowFromTop(shp.Top, ws)
    col = GetColFromLeft(shp.Left, ws)
    GetAnchorInfo = "R" & row & "C" & col
End Function

' ================ BORDERS ============================
' Extract all cells with borders (debug version)
Private Function BordersToJson(ByVal ws As Worksheet, ByVal pt2px As Double, ByRef borderCount As Long) As String
    Dim sb As String: sb = "["
    Dim first As Boolean: first = True
    borderCount = 0
    
    On Error GoTo EMPTY_RANGE
    
    ' —— 先取 UsedRange ——
    Dim ur As Range
    Set ur = ws.UsedRange
    If ur Is Nothing Then GoTo EMPTY_RANGE
    
    ' 调试信息：记录到Debug窗口
    Debug.Print "BordersToJson: UsedRange = " & ur.Address
    Debug.Print "BordersToJson: Rows = " & ur.Rows.Count & ", Cols = " & ur.Columns.Count
    
    ' 简单方法：直接遍历UsedRange的所有单元格
    Dim r As Long, c As Long, checkedCount As Long
    checkedCount = 0
    
    For r = ur.row To ur.row + ur.Rows.Count - 1
        For c = ur.Column To ur.Column + ur.Columns.Count - 1
            Dim cell As Range
            Set cell = ws.Cells(r, c)
            checkedCount = checkedCount + 1
            
            ' 跳过隐藏的单元格
            If IsCellHidden(cell) Then
                GoTo NextBorderCell
            End If
            
            ' 检查单元格是否有边框
            If HasCellBorder(cell) Then
                Debug.Print "BordersToJson: Found border at " & cell.Address & " (count=" & borderCount & ")"
                
                On Error Resume Next
                If Not first Then sb = sb & "," Else first = False
                
                ' 使用新的BuildBorderJson函数构建完整的边框JSON
                sb = sb & BuildBorderJson(cell, r, c, pt2px)
                borderCount = borderCount + 1
                
                Debug.Print "BordersToJson: JSON so far length = " & Len(sb)
                
                ' 可选：限制输出数量（暂时注释掉，处理所有边框）
                ' If borderCount >= 50 Then
                '     Debug.Print "BordersToJson: Reached limit, exiting"
                '     Exit For
                ' End If
                On Error GoTo EMPTY_RANGE
            End If
            
NextBorderCell:
        Next c
    Next r
    
    Debug.Print "BordersToJson: Checked " & checkedCount & " cells, found " & borderCount & " borders"
    
    ' 修复：确保JSON格式正确
    sb = sb & "]"
    BordersToJson = sb
    Exit Function
    
EMPTY_RANGE:
    Debug.Print "BordersToJson: EMPTY_RANGE"
    BordersToJson = "[]"
End Function

' Get representative cell for merged areas
Private Function GetRepresentativeCell(ByVal cell As Range) As Range
    On Error Resume Next
    ' 如果单元格是合并区域的一部分，返回合并区域的第一个单元格
    If cell.MergeCells Then
        Set GetRepresentativeCell = cell.MergeArea.Cells(1, 1)
    Else
        Set GetRepresentativeCell = cell
    End If
    On Error GoTo 0
    ' 如果出错，返回原单元格
    If GetRepresentativeCell Is Nothing Then
        Set GetRepresentativeCell = cell
    End If
End Function

' ================ ENHANCED BORDER DETECTION =================
' 新增：可视边检测核心函数 - 检测单个单元格的某条边是否可见
Private Function EdgeVisible(ByVal cell As Range, ByVal which As XlBordersIndex) As Boolean
    On Error Resume Next
    EdgeVisible = False
    
    Dim ws As Worksheet
    Set ws = cell.Worksheet
    Dim r As Long, c As Long
    r = cell.Row: c = cell.Column
    
    ' 获取样式来源（合并单元格使用MergeArea(1,1)）
    Dim src As Range
    If cell.MergeCells Then
        Set src = cell.MergeArea.Cells(1, 1)
    Else
        Set src = cell
    End If
    
    ' 1. 本格优先：检查当前单元格的边框
    If src.DisplayFormat.Borders(which).lineStyle <> xlLineStyleNone Then
        EdgeVisible = True
        Exit Function
    ElseIf src.Borders(which).lineStyle <> xlLineStyleNone Then
        EdgeVisible = True
        Exit Function
    End If
    
    ' 2. 相邻格兜底：检查相邻单元格的对边
    Dim neighborCell As Range
    Select Case which
        Case xlEdgeTop
            ' Top边：检查上一行的Bottom边
            If r > 1 Then
                Set neighborCell = ws.Cells(r - 1, c)
                If neighborCell.DisplayFormat.Borders(xlEdgeBottom).lineStyle <> xlLineStyleNone Then
                    EdgeVisible = True
                    Exit Function
                ElseIf neighborCell.Borders(xlEdgeBottom).lineStyle <> xlLineStyleNone Then
                    EdgeVisible = True
                    Exit Function
                End If
            End If
        Case xlEdgeBottom
            ' Bottom边：检查下一行的Top边
            If r < ws.Rows.Count Then
                Set neighborCell = ws.Cells(r + 1, c)
                If neighborCell.DisplayFormat.Borders(xlEdgeTop).lineStyle <> xlLineStyleNone Then
                    EdgeVisible = True
                    Exit Function
                ElseIf neighborCell.Borders(xlEdgeTop).lineStyle <> xlLineStyleNone Then
                    EdgeVisible = True
                    Exit Function
                End If
            End If
        Case xlEdgeLeft
            ' Left边：检查左一列的Right边
            If c > 1 Then
                Set neighborCell = ws.Cells(r, c - 1)
                If neighborCell.DisplayFormat.Borders(xlEdgeRight).lineStyle <> xlLineStyleNone Then
                    EdgeVisible = True
                    Exit Function
                ElseIf neighborCell.Borders(xlEdgeRight).lineStyle <> xlLineStyleNone Then
                    EdgeVisible = True
                    Exit Function
                End If
            End If
        Case xlEdgeRight
            ' Right边：检查右一列的Left边
            If c < ws.Columns.Count Then
                Set neighborCell = ws.Cells(r, c + 1)
                If neighborCell.DisplayFormat.Borders(xlEdgeLeft).lineStyle <> xlLineStyleNone Then
                    EdgeVisible = True
                    Exit Function
                ElseIf neighborCell.Borders(xlEdgeLeft).lineStyle <> xlLineStyleNone Then
                    EdgeVisible = True
                    Exit Function
                End If
            End If
    End Select
    
    ' 3. Inside线检测（关键改进）
    Dim insideRange As Range
    Select Case which
        Case xlEdgeTop
            ' Top边：检查与上一行的InsideHorizontal
            If r > 1 Then
                Set insideRange = ws.Range(ws.Cells(r - 1, c), ws.Cells(r, c))
                If insideRange.DisplayFormat.Borders(xlInsideHorizontal).lineStyle <> xlLineStyleNone Then
                    EdgeVisible = True
                    Exit Function
                ElseIf insideRange.Borders(xlInsideHorizontal).lineStyle <> xlLineStyleNone Then
                    EdgeVisible = True
                    Exit Function
                End If
            End If
        Case xlEdgeBottom
            ' Bottom边：检查与下一行的InsideHorizontal
            If r < ws.Rows.Count Then
                Set insideRange = ws.Range(ws.Cells(r, c), ws.Cells(r + 1, c))
                If insideRange.DisplayFormat.Borders(xlInsideHorizontal).lineStyle <> xlLineStyleNone Then
                    EdgeVisible = True
                    Exit Function
                ElseIf insideRange.Borders(xlInsideHorizontal).lineStyle <> xlLineStyleNone Then
                    EdgeVisible = True
                    Exit Function
                End If
            End If
        Case xlEdgeLeft
            ' Left边：检查与左一列的InsideVertical
            If c > 1 Then
                Set insideRange = ws.Range(ws.Cells(r, c - 1), ws.Cells(r, c))
                If insideRange.DisplayFormat.Borders(xlInsideVertical).lineStyle <> xlLineStyleNone Then
                    EdgeVisible = True
                    Exit Function
                ElseIf insideRange.Borders(xlInsideVertical).lineStyle <> xlLineStyleNone Then
                    EdgeVisible = True
                    Exit Function
                End If
            End If
        Case xlEdgeRight
            ' Right边：检查与右一列的InsideVertical
            If c < ws.Columns.Count Then
                Set insideRange = ws.Range(ws.Cells(r, c), ws.Cells(r, c + 1))
                If insideRange.DisplayFormat.Borders(xlInsideVertical).lineStyle <> xlLineStyleNone Then
                    EdgeVisible = True
                    Exit Function
                ElseIf insideRange.Borders(xlInsideVertical).lineStyle <> xlLineStyleNone Then
                    EdgeVisible = True
                    Exit Function
                End If
            End If
    End Select
    
    On Error GoTo 0
End Function

' 升级：使用EdgeVisible的HasCellBorder函数
Private Function HasCellBorder(ByVal cell As Range) As Boolean
    On Error Resume Next
    HasCellBorder = False
    
    ' 使用新的EdgeVisible函数检测四条边
    Dim hasTop As Boolean, hasBottom As Boolean, hasLeft As Boolean, hasRight As Boolean
    
    hasTop = EdgeVisible(cell, xlEdgeTop)
    hasBottom = EdgeVisible(cell, xlEdgeBottom)
    hasLeft = EdgeVisible(cell, xlEdgeLeft)
    hasRight = EdgeVisible(cell, xlEdgeRight)
    
    HasCellBorder = hasTop Or hasBottom Or hasLeft Or hasRight
    
    On Error GoTo 0
End Function

' 升级：BuildBorderJson函数 - 确保边框信息正确输出
Private Function BuildBorderJson(ByVal cell As Range, ByVal row As Long, ByVal col As Long, ByVal pt2px As Double) As String
    Dim sb As String
    
    ' 直接计算坐标和尺寸，避免字典点访问
    Dim x As Double, y As Double, w As Double, h As Double
    x = cell.Left * pt2px
    y = cell.Top * pt2px
    w = cell.Width * pt2px
    h = cell.Height * pt2px
    
    ' 使用EdgeVisible检测四条边的可见性
    Dim hasTop As Boolean, hasBottom As Boolean, hasLeft As Boolean, hasRight As Boolean
    hasTop = EdgeVisible(cell, xlEdgeTop)
    hasBottom = EdgeVisible(cell, xlEdgeBottom)
    hasLeft = EdgeVisible(cell, xlEdgeLeft)
    hasRight = EdgeVisible(cell, xlEdgeRight)
    
    sb = "{"
    sb = sb & Q("row") & ":" & CNum(row) & ","
    sb = sb & Q("col") & ":" & CNum(col) & ","
    sb = sb & Q("x") & ":" & CNumD(x) & ","
    sb = sb & Q("y") & ":" & CNumD(y) & ","
    sb = sb & Q("width") & ":" & CNumD(w) & ","
    sb = sb & Q("height") & ":" & CNumD(h) & ","
    
    ' 输出边框布尔值
    sb = sb & Q("borders") & ":{"
    sb = sb & Q("top") & ":" & LCase$(CStr(hasTop)) & ","
    sb = sb & Q("right") & ":" & LCase$(CStr(hasRight)) & ","
    sb = sb & Q("bottom") & ":" & LCase$(CStr(hasBottom)) & ","
    sb = sb & Q("left") & ":" & LCase$(CStr(hasLeft))
    sb = sb & "}"
    
    ' 输出边框样式信息（如果存在边框）
    If hasTop Or hasBottom Or hasLeft Or hasRight Then
        sb = sb & "," & Q("styles") & ":{"
        Dim first As Boolean: first = True
        
        On Error Resume Next
        
        If hasTop Then
            If Not first Then sb = sb & "," Else first = False
            sb = sb & Q("top") & ":" & BuildBorderSideInfo(cell, xlEdgeTop)
        End If
        
        If hasRight Then
            If Not first Then sb = sb & "," Else first = False
            sb = sb & Q("right") & ":" & BuildBorderSideInfo(cell, xlEdgeRight)
        End If
        
        If hasBottom Then
            If Not first Then sb = sb & "," Else first = False
            sb = sb & Q("bottom") & ":" & BuildBorderSideInfo(cell, xlEdgeBottom)
        End If
        
        If hasLeft Then
            If Not first Then sb = sb & "," Else first = False
            sb = sb & Q("left") & ":" & BuildBorderSideInfo(cell, xlEdgeLeft)
        End If
        
        On Error GoTo 0
        sb = sb & "}"
    End If
    
    sb = sb & "}"
    
    BuildBorderJson = sb
End Function

' Get cell boundary information - REMOVED: 改为直接计算避免字典点访问

' Build information for each border side (using DisplayFormat)
Private Function BuildBorderSides(ByVal cell As Range) As String
    Dim sb As String
    Dim first As Boolean: first = True
    
    ' Check top border
    If cell.DisplayFormat.Borders(xlEdgeTop).lineStyle <> xlLineStyleNone Then
        If Not first Then sb = sb & "," Else first = False
        sb = sb & Q("top") & ":" & BuildBorderSide(cell.DisplayFormat.Borders(xlEdgeTop))
    End If
    
    ' Check bottom border
    If cell.DisplayFormat.Borders(xlEdgeBottom).lineStyle <> xlLineStyleNone Then
        If Not first Then sb = sb & "," Else first = False
        sb = sb & Q("bottom") & ":" & BuildBorderSide(cell.DisplayFormat.Borders(xlEdgeBottom))
    End If
    
    ' Check left border
    If cell.DisplayFormat.Borders(xlEdgeLeft).lineStyle <> xlLineStyleNone Then
        If Not first Then sb = sb & "," Else first = False
        sb = sb & Q("left") & ":" & BuildBorderSide(cell.DisplayFormat.Borders(xlEdgeLeft))
    End If
    
    ' Check right border
    If cell.DisplayFormat.Borders(xlEdgeRight).lineStyle <> xlLineStyleNone Then
        If Not first Then sb = sb & "," Else first = False
        sb = sb & Q("right") & ":" & BuildBorderSide(cell.DisplayFormat.Borders(xlEdgeRight))
    End If
    
    BuildBorderSides = sb
End Function

' Build information for a single border side
Private Function BuildBorderSide(ByVal bd As border) As String
    Dim sb As String
    sb = "{"
    sb = sb & Q("style") & ":" & Q(GetBorderStyleName(bd.lineStyle)) & ","
    sb = sb & Q("color") & ":" & Q(RGBToHex(bd.Color)) & ","
    sb = sb & Q("weight") & ":" & CNum(bd.Weight)
    sb = sb & "}"
    
    BuildBorderSide = sb
End Function

' 新增：获取单条边框的样式信息
Private Function BuildBorderSideInfo(ByVal cell As Range, ByVal which As XlBordersIndex) As String
    On Error Resume Next
    
    Dim src As Range
    If cell.MergeCells Then
        Set src = cell.MergeArea.Cells(1, 1)
    Else
        Set src = cell
    End If
    
    Dim bd As border  ' 重命名避免与类型名冲突
    Dim sb As String
    
    ' 优先使用DisplayFormat，失败则使用普通Borders
    If src.DisplayFormat.Borders(which).lineStyle <> xlLineStyleNone Then
        Set bd = src.DisplayFormat.Borders(which)
    ElseIf src.Borders(which).lineStyle <> xlLineStyleNone Then
        Set bd = src.Borders(which)
    Else
        ' 如果本格没有，检查相邻格
        Dim ws As Worksheet
        Set ws = cell.Worksheet
        Dim r As Long, c As Long
        r = cell.Row: c = cell.Column
        
        Select Case which
            Case xlEdgeTop
                If r > 1 Then
                    Set bd = ws.Cells(r - 1, c).DisplayFormat.Borders(xlEdgeBottom)
                    If bd.lineStyle = xlLineStyleNone Then
                        Set bd = ws.Cells(r - 1, c).Borders(xlEdgeBottom)
                    End If
                End If
            Case xlEdgeBottom
                If r < ws.Rows.Count Then
                    Set bd = ws.Cells(r + 1, c).DisplayFormat.Borders(xlEdgeTop)
                    If bd.lineStyle = xlLineStyleNone Then
                        Set bd = ws.Cells(r + 1, c).Borders(xlEdgeTop)
                    End If
                End If
            Case xlEdgeLeft
                If c > 1 Then
                    Set bd = ws.Cells(r, c - 1).DisplayFormat.Borders(xlEdgeRight)
                    If bd.lineStyle = xlLineStyleNone Then
                        Set bd = ws.Cells(r, c - 1).Borders(xlEdgeRight)
                    End If
                End If
            Case xlEdgeRight
                If c < ws.Columns.Count Then
                    Set bd = ws.Cells(r, c + 1).DisplayFormat.Borders(xlEdgeLeft)
                    If bd.lineStyle = xlLineStyleNone Then
                        Set bd = ws.Cells(r, c + 1).Borders(xlEdgeLeft)
                    End If
                End If
        End Select
    End If
    
    ' 构建样式信息 - 添加安全检查
    sb = "{"
    If Not bd Is Nothing Then
        sb = sb & Q("style") & ":" & Q(GetBorderStyleName(bd.lineStyle)) & ","
        sb = sb & Q("weightPt") & ":" & CNumD(bd.Weight) & ","
        sb = sb & Q("colorRGB") & ":" & Q(RGBToHex(bd.Color))
    Else
        ' 如果找不到边框，使用默认值
        sb = sb & Q("style") & ":" & Q("Continuous") & ","
        sb = sb & Q("weightPt") & ":" & CNumD(1) & ","
        sb = sb & Q("colorRGB") & ":" & Q("#000000")
    End If
    sb = sb & "}"
    
    BuildBorderSideInfo = sb
    
    On Error GoTo 0
End Function

' Get border style name
Private Function GetBorderStyleName(ByVal lineStyle As Long) As String
    Select Case lineStyle
        Case xlLineStyleNone: GetBorderStyleName = "none"
        Case xlContinuous: GetBorderStyleName = "Continuous"
        Case xlDash: GetBorderStyleName = "Dash"
        Case xlDashDot: GetBorderStyleName = "DashDot"
        Case xlDashDotDot: GetBorderStyleName = "DashDotDot"
        Case xlDot: GetBorderStyleName = "Dot"
        Case xlDouble: GetBorderStyleName = "Double"
        Case xlSlantDashDot: GetBorderStyleName = "SlantDashDot"
        Case Else: GetBorderStyleName = "Continuous"
    End Select
End Function

' 检查单元格是否被隐藏（行或列隐藏）
Private Function IsCellHidden(ByVal cell As Range) As Boolean
    On Error Resume Next
    IsCellHidden = False
    
    ' 检查行是否隐藏
    If cell.EntireRow.Hidden Then
        IsCellHidden = True
        Exit Function
    End If
    
    ' 检查列是否隐藏
    If cell.EntireColumn.Hidden Then
        IsCellHidden = True
        Exit Function
    End If
    
    On Error GoTo 0
End Function



