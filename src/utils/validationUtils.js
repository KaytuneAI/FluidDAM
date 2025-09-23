/**
 * 文件验证和导入工具
 * 处理Excel文件验证和导入功能
 */

/**
 * 验证Excel文件
 * @param {File} file - 文件对象
 * @returns {boolean} 是否为有效的Excel文件
 */
export function validateExcelFile(file) {
  if (!file) return false;
  
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'application/vnd.ms-excel.sheet.macroEnabled.12' // .xlsm
  ];
  
  const validExtensions = ['.xlsx', '.xls', '.xlsm'];
  const fileName = file.name.toLowerCase();
  
  return validTypes.includes(file.type) || 
         validExtensions.some(ext => fileName.endsWith(ext));
}

/**
 * 验证文件大小
 * @param {File} file - 文件对象
 * @param {number} maxSizeMB - 最大文件大小（MB）
 * @returns {Object} 验证结果
 */
export function validateFileSize(file, maxSizeMB = 10) {
  if (!file) {
    return { valid: false, error: '没有选择文件' };
  }
  
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  const fileSizeMB = file.size / (1024 * 1024);
  
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `文件大小超过限制（${fileSizeMB.toFixed(1)}MB > ${maxSizeMB}MB）`
    };
  }
  
  return {
    valid: true,
    size: fileSizeMB
  };
}

/**
 * 验证编辑器状态
 * @param {Object} editor - TLDraw编辑器实例
 * @returns {Object} 验证结果
 */
export function validateEditor(editor) {
  if (!editor) {
    return { valid: false, error: '编辑器未初始化' };
  }
  
  if (typeof editor.createShapes !== 'function') {
    return { valid: false, error: '编辑器API不完整' };
  }
  
  return { valid: true };
}

/**
 * 验证转换参数
 * @param {Object} params - 转换参数
 * @returns {Object} 验证结果
 */
export function validateConversionParams(params) {
  const errors = [];
  
  if (!params) {
    errors.push('转换参数不能为空');
    return { valid: false, errors };
  }
  
  if (params.scale && (typeof params.scale !== 'number' || params.scale <= 0)) {
    errors.push('缩放比例必须是大于0的数字');
  }
  
  if (params.batchSize && (typeof params.batchSize !== 'number' || params.batchSize <= 0)) {
    errors.push('批处理大小必须是大于0的数字');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 获取文件信息
 * @param {File} file - 文件对象
 * @returns {Object} 文件信息
 */
export function getFileInfo(file) {
  if (!file) {
    return null;
  }
  
  return {
    name: file.name,
    size: file.size,
    sizeMB: (file.size / (1024 * 1024)).toFixed(2),
    type: file.type,
    lastModified: new Date(file.lastModified),
    extension: file.name.split('.').pop().toLowerCase()
  };
}

/**
 * 检查文件是否支持
 * @param {File} file - 文件对象
 * @returns {Object} 检查结果
 */
export function checkFileSupport(file) {
  if (!file) {
    return { supported: false, reason: '没有选择文件' };
  }
  
  const info = getFileInfo(file);
  
  // 检查文件类型
  if (!validateExcelFile(file)) {
    return {
      supported: false,
      reason: `不支持的文件类型: ${info.extension}`
    };
  }
  
  // 检查文件大小
  const sizeCheck = validateFileSize(file);
  if (!sizeCheck.valid) {
    return {
      supported: false,
      reason: sizeCheck.error
    };
  }
  
  return {
    supported: true,
    info
  };
}

/**
 * 创建错误信息
 * @param {string} message - 错误消息
 * @param {string} code - 错误代码
 * @param {Object} details - 错误详情
 * @returns {Object} 错误对象
 */
export function createError(message, code = 'UNKNOWN_ERROR', details = {}) {
  return {
    success: false,
    error: message,
    code,
    details,
    timestamp: new Date().toISOString()
  };
}

/**
 * 创建成功信息
 * @param {string} message - 成功消息
 * @param {Object} data - 返回数据
 * @returns {Object} 成功对象
 */
export function createSuccess(message, data = {}) {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };
}

/**
 * 验证导入结果
 * @param {Object} result - 导入结果
 * @returns {Object} 验证结果
 */
export function validateImportResult(result) {
  if (!result) {
    return { valid: false, error: '导入结果为空' };
  }
  
  if (typeof result.success !== 'boolean') {
    return { valid: false, error: '导入结果格式错误' };
  }
  
  if (result.success) {
    // 验证成功结果
    if (result.shapesCount && typeof result.shapesCount !== 'number') {
      return { valid: false, error: '形状数量格式错误' };
    }
  } else {
    // 验证失败结果
    if (!result.error || typeof result.error !== 'string') {
      return { valid: false, error: '错误信息格式错误' };
    }
  }
  
  return { valid: true };
}
