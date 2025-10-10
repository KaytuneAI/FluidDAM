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
    MsgBox "FluidDAM for Excel" & vbCrLf & _
           "Pro (Safe UI)" & vbCrLf & "? 2025 Kaytune", vbInformation, "关于"
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

    MsgBox actionMsg & vbCrLf & _
           "Target sheet: " & tgt.Name & vbCrLf & _
           "Workbook: " & wb.Name & vbCrLf & _
           "Cells (non-empty): " & outCells & vbCrLf & _
           "Textboxes: " & outText & vbCrLf & _
           "Images: " & outPics & vbCrLf & _
           "Borders: " & outBorders, vbInformation, "Layout export OK"
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
            Debug.Print i & ". Name: " & shp.Name & _
                       " | Left: " & Round(shp.Left, 2) & _
                       " | Top: " & Round(shp.Top, 2) & _
                       " | Z: " & shp.ZOrderPosition
            i = i + 1
        End If
    Next shp
    
    MsgBox "Picture information has been output to immediate window, press Ctrl+G to view"
End Sub

' New: Debug function to list all border information
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
    
    Debug.Print "=== All Border Information in Current Worksheet ==="
    Debug.Print "UsedRange: " & ur.Address
    
    For r = ur.row To ur.row + ur.Rows.Count - 1
        For c = ur.Column To ur.Column + ur.Columns.Count - 1
            Dim cell As Range
            Set cell = ws.Cells(r, c)
            totalChecked = totalChecked + 1
            
            ' 测试前几个单元格的详细信息
            If totalChecked <= 10 Then
                Debug.Print "Testing cell " & cell.Address & ":"
                Debug.Print "  DisplayFormat.Top: " & cell.DisplayFormat.Borders(xlEdgeTop).lineStyle
                Debug.Print "  Regular.Top: " & cell.Borders(xlEdgeTop).lineStyle
                Debug.Print "  xlLineStyleNone = " & xlLineStyleNone
            End If
            
            If HasCellBorder(cell) Then
                borderCount = borderCount + 1
                Debug.Print borderCount & ". Cell: " & cell.Address & " | Row: " & r & " | Col: " & c
                
                ' Check each border using DisplayFormat first
                If cell.DisplayFormat.Borders(xlEdgeTop).lineStyle <> xlLineStyleNone Then
                    Debug.Print "   Top Border (Display): " & GetBorderStyleName(cell.DisplayFormat.Borders(xlEdgeTop).lineStyle) & _
                               " | Color: " & RGBToHex(cell.DisplayFormat.Borders(xlEdgeTop).Color)
                ElseIf cell.Borders(xlEdgeTop).lineStyle <> xlLineStyleNone Then
                    Debug.Print "   Top Border (Regular): " & GetBorderStyleName(cell.Borders(xlEdgeTop).lineStyle) & _
                               " | Color: " & RGBToHex(cell.Borders(xlEdgeTop).Color)
                End If
                
                ' Similar for other borders...
            End If
        Next c
    Next r
    
    MsgBox "Checked " & totalChecked & " cells, found " & borderCount & " cells with borders" & vbCrLf & _
           "Detailed information has been output to immediate window, press Ctrl+G to view", vbInformation
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
        MsgBox "Found " & count & " exported sheet(s):" & vbCrLf & vbCrLf & exportedSheets & _
               "Detailed information has been output to immediate window, press Ctrl+G to view", vbInformation, "Exported Sheets"
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
Private Function BuildSheetJson(ByVal ws As Worksheet, _
                                ByRef outCells As Long, _
                                ByRef outText As Long, _
                                ByRef outPics As Long, _
                                ByRef outBorders As Long) As String
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
            Dim v As Variant
            v = cell.Value2
            
            ' 只处理有内容的单元格
            If Not IsEmpty(v) And CStr(v) <> "" Then
                If nonEmptyCount > 0 Then sb = sb & ","
                
                ' 构建单元格信息，包括位置、尺寸、对齐方式和底色
                sb = sb & "{""r"":" & CNum(ur.row + r - 1) & _
                          ",""c"":" & CNum(ur.Column + c - 1) & _
                          ",""x"":" & CNumD(cell.Left * pt2px) & _
                          ",""y"":" & CNumD(cell.Top * pt2px) & _
                          ",""w"":" & CNumD(cell.Width * pt2px) & _
                          ",""h"":" & CNumD(cell.Height * pt2px) & _
                          ",""v"":""" & EscapeJson(CStr(v)) & """," & _
                          """hAlign"":""" & GetCellHAlign(cell) & """," & _
                          """vAlign"":""" & GetCellVAlign(cell) & """," & _
                          """fillColor"":""" & GetCellFillColor(cell) & """}"
                
                nonEmptyCount = nonEmptyCount + 1
            End If
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

' 获取单元格填充颜色
Private Function GetCellFillColor(ByVal cell As Range) As String
    On Error Resume Next
    ' 检查单元格是否有填充颜色
    If cell.Interior.ColorIndex = xlNone Then
        GetCellFillColor = "#FFFFFF"  ' 无填充时返回白色
    Else
        GetCellFillColor = RGBToHex(cell.Interior.Color)
    End If
    On Error GoTo 0
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

Private Function RGBToHex(ByVal rgbVal As Long) As String
    Dim r As Long, g As Long, b As Long
    r = (rgbVal And &HFF)
    g = (rgbVal \ &H100) And &HFF
    b = (rgbVal \ &H10000) And &HFF
    RGBToHex = "#" & Right$("0" & Hex$(r), 2) & Right$("0" & Hex$(g), 2) & Right$("0" & Hex$(b), 2)
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
            
            ' 检查单元格是否有边框
            If HasCellBorder(cell) Then
                Debug.Print "BordersToJson: Found border at " & cell.Address & " (count=" & borderCount & ")"
                
                On Error Resume Next
                If Not first Then sb = sb & "," Else first = False
                
                ' 构建边框JSON（包含基本边框信息）
                sb = sb & "{""row"":" & r & ",""col"":" & c & ",""address"":""" & cell.Address & """"
                sb = sb & ",""x"":" & CNumD(cell.Left * pt2px)
                sb = sb & ",""y"":" & CNumD(cell.Top * pt2px)
                sb = sb & ",""width"":" & CNumD(cell.Width * pt2px)
                sb = sb & ",""height"":" & CNumD(cell.Height * pt2px)
                sb = sb & "}"
                borderCount = borderCount + 1
                
                Debug.Print "BordersToJson: JSON so far length = " & Len(sb)
                
                ' 可选：限制输出数量（暂时注释掉，处理所有边框）
                ' If borderCount >= 50 Then
                '     Debug.Print "BordersToJson: Reached limit, exiting"
                '     Exit For
                ' End If
                On Error GoTo EMPTY_RANGE
            End If
        Next c
    Next r
    
    Debug.Print "BordersToJson: Checked " & checkedCount & " cells, found " & borderCount & " borders"
    
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

' Check if cell has borders (try both DisplayFormat and regular Borders)
Private Function HasCellBorder(ByVal cell As Range) As Boolean
    On Error Resume Next
    HasCellBorder = False
    
    ' 先尝试使用 DisplayFormat（包括条件格式）
    Dim hasTop As Boolean, hasBottom As Boolean, hasLeft As Boolean, hasRight As Boolean
    
    hasTop = (cell.DisplayFormat.Borders(xlEdgeTop).lineStyle <> xlLineStyleNone)
    hasBottom = (cell.DisplayFormat.Borders(xlEdgeBottom).lineStyle <> xlLineStyleNone)
    hasLeft = (cell.DisplayFormat.Borders(xlEdgeLeft).lineStyle <> xlLineStyleNone)
    hasRight = (cell.DisplayFormat.Borders(xlEdgeRight).lineStyle <> xlLineStyleNone)
    
    ' 如果DisplayFormat没有找到边框，尝试使用普通的Borders
    If Not (hasTop Or hasBottom Or hasLeft Or hasRight) Then
        hasTop = (cell.Borders(xlEdgeTop).lineStyle <> xlLineStyleNone)
        hasBottom = (cell.Borders(xlEdgeBottom).lineStyle <> xlLineStyleNone)
        hasLeft = (cell.Borders(xlEdgeLeft).lineStyle <> xlLineStyleNone)
        hasRight = (cell.Borders(xlEdgeRight).lineStyle <> xlLineStyleNone)
    End If
    
    HasCellBorder = hasTop Or hasBottom Or hasLeft Or hasRight
    
    On Error GoTo 0
End Function

' Build JSON string for a single border
Private Function BuildBorderJson(ByVal cell As Range, ByVal row As Long, ByVal col As Long, ByVal pt2px As Double) As String
    Dim sb As String
    Dim bounds As Object
    Set bounds = GetCellBounds(cell, pt2px)
    
    sb = "{"
    sb = sb & Q("row") & ":" & CNum(row) & ","
    sb = sb & Q("col") & ":" & CNum(col) & ","
    sb = sb & Q("x") & ":" & CNumD(bounds.x) & ","
    sb = sb & Q("y") & ":" & CNumD(bounds.y) & ","
    sb = sb & Q("width") & ":" & CNumD(bounds.Width) & ","
    sb = sb & Q("height") & ":" & CNumD(bounds.Height) & ","
    sb = sb & Q("borders") & ":{"
    sb = sb & BuildBorderSides(cell)
    sb = sb & "}"
    sb = sb & "}"
    
    BuildBorderJson = sb
End Function

' Get cell boundary information
Private Function GetCellBounds(ByVal cell As Range, ByVal pt2px As Double) As Object
    Dim bounds As Object
    Set bounds = CreateObject("Scripting.Dictionary")
    
    bounds("x") = cell.Left * pt2px
    bounds("y") = cell.Top * pt2px
    bounds("width") = cell.Width * pt2px
    bounds("height") = cell.Height * pt2px
    
    Set GetCellBounds = bounds
End Function

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
Private Function BuildBorderSide(ByVal border As border) As String
    Dim sb As String
    sb = "{"
    sb = sb & Q("style") & ":" & Q(GetBorderStyleName(border.lineStyle)) & ","
    sb = sb & Q("color") & ":" & Q(RGBToHex(border.Color)) & ","
    sb = sb & Q("weight") & ":" & CNum(border.Weight)
    sb = sb & "}"
    
    BuildBorderSide = sb
End Function

' Get border style name
Private Function GetBorderStyleName(ByVal lineStyle As Long) As String
    Select Case lineStyle
        Case xlLineStyleNone: GetBorderStyleName = "none"
        Case xlContinuous: GetBorderStyleName = "solid"
        Case xlDash: GetBorderStyleName = "dash"
        Case xlDashDot: GetBorderStyleName = "dashDot"
        Case xlDashDotDot: GetBorderStyleName = "dashDotDot"
        Case xlDot: GetBorderStyleName = "dot"
        Case xlDouble: GetBorderStyleName = "double"
        Case xlSlantDashDot: GetBorderStyleName = "slantDashDot"
        Case Else: GetBorderStyleName = "solid"
    End Select
End Function



