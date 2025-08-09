class BarcodeScanner {
    constructor() {
        this.codeReader = new ZXing.BrowserMultiFormatReader();
        this.isScanning = false;
        this.scanResults = this.loadResults();
        this.scanCount = 0;
        this.successCount = 0;
        this.lastScanTime = 0;
        this.settings = this.loadSettings();
        
        this.initElements();
        this.bindEvents();
        this.updateDisplay();
        this.renderResults();
        this.applySettings();
    }

    initElements() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.settingsBtn = document.getElementById('settingsBtn');
        this.exportJsonBtn = document.getElementById('exportJson');
        this.exportCsvBtn = document.getElementById('exportCsv');
        this.shareBtn = document.getElementById('shareBtn');
        this.typeFilter = document.getElementById('typeFilter');
        this.searchInput = document.getElementById('searchInput');
        this.resultsList = document.getElementById('resultsList');
        this.scanCountEl = document.getElementById('scanCount');
        this.successCountEl = document.getElementById('successCount');
        
        // 标签页元素
        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.tabContents = document.querySelectorAll('.tab-content');
        
        // 扫码状态元素
        this.scanStatus = document.getElementById('scanStatus');
        this.lastScan = document.getElementById('lastScan');
        
        // 设置弹窗元素
        this.settingsModal = document.getElementById('settingsModal');
        this.closeModal = document.getElementById('closeModal');
        this.saveSettings = document.getElementById('saveSettings');
        this.resetSettings = document.getElementById('resetSettings');
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => this.startScanning());
        this.stopBtn.addEventListener('click', () => this.stopScanning());
        this.clearBtn.addEventListener('click', () => this.clearResults());
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        this.exportJsonBtn.addEventListener('click', () => this.exportJson());
        this.exportCsvBtn.addEventListener('click', () => this.exportCsv());
        this.shareBtn.addEventListener('click', () => this.shareData());
        this.typeFilter.addEventListener('change', () => this.renderResults());
        this.searchInput.addEventListener('input', () => this.renderResults());
        
        // 设置弹窗事件
        this.closeModal.addEventListener('click', () => this.closeSettings());
        this.saveSettings.addEventListener('click', () => this.saveSettingsData());
        this.resetSettings.addEventListener('click', () => this.resetSettingsData());
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) this.closeSettings();
        });
        
        // 设置项联动事件
        document.getElementById('enableRegex').addEventListener('change', (e) => {
            document.getElementById('regexPattern').disabled = !e.target.checked;
        });
        
        document.getElementById('enableLength').addEventListener('change', (e) => {
            document.getElementById('minLength').disabled = !e.target.checked;
            document.getElementById('maxLength').disabled = !e.target.checked;
        });
        
        document.getElementById('enablePrefix').addEventListener('change', (e) => {
            document.getElementById('prefixFilter').disabled = !e.target.checked;
        });
        
        document.getElementById('autoExport').addEventListener('change', (e) => {
            document.getElementById('autoExportCount').disabled = !e.target.checked;
        });
        
        // 标签页切换事件
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });
    }

    async startScanning() {
        try {
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.isScanning = true;
            this.updateScanStatus('正在启动...');

            // 获取摄像头权限
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            
            this.video.srcObject = stream;
            this.updateScanStatus('扫码中...');
            
            // 开始扫码
            this.codeReader.decodeFromVideoDevice(null, 'video', (result, err) => {
                if (result && this.isScanning) {
                    console.log('ZXing扫码成功:', result);
                    this.handleScanResult(result);
                }
                if (err) {
                    if (err instanceof ZXing.NotFoundException) {
                        // 这是正常的，表示没有找到条码
                        // console.log('未找到条码');
                    } else {
                        console.warn('扫码错误:', err);
                    }
                }
            });

        } catch (error) {
            console.error('启动扫码失败:', error);
            alert('无法访问摄像头，请检查权限设置');
            this.resetButtons();
            this.updateScanStatus('启动失败');
        }
    }

    stopScanning() {
        this.isScanning = false;
        this.codeReader.reset();
        
        // 停止摄像头
        if (this.video.srcObject) {
            const tracks = this.video.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            this.video.srcObject = null;
        }
        
        this.resetButtons();
        this.updateScanStatus('已停止');
    }

    resetButtons() {
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
    }

    handleScanResult(result) {
        const now = Date.now();
        
        // 检查扫码间隔
        if (now - this.lastScanTime < this.settings.scanInterval) {
            return;
        }
        this.lastScanTime = now;

        // 调试信息：显示实际扫描到的格式
        console.log('扫描结果:', {
            text: result.text,
            format: result.format,
            allowedFormats: this.settings.allowedFormats
        });

        // 检查格式是否允许 - 修复格式匹配问题
        const formatString = result.format.toString();
        
        // 临时调试：允许所有格式，只记录不匹配的情况
        if (!this.settings.allowedFormats.includes(formatString)) {
            console.warn('格式不在允许列表中:', formatString, '允许的格式:', this.settings.allowedFormats);
            // 暂时不返回，继续处理扫码结果
            // this.showScanFeedback(false, `不支持的格式: ${formatString}`);
            // return;
        }

        // 验证扫码内容
        const validationResult = this.validateScanContent(result.text);
        if (!validationResult.valid) {
            this.showScanFeedback(false, validationResult.message);
            return;
        }

        const scanData = {
            id: Date.now() + Math.random(),
            text: result.text,
            format: formatString,
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleString('zh-CN'),
            count: 1
        };

        // 处理重复扫码规则
        const existingIndex = this.scanResults.findIndex(item => 
            item.text === scanData.text && item.format === scanData.format
        );

        let shouldAdd = false;
        let message = '扫码成功!';

        switch (this.settings.duplicateRule) {
            case 'ignore':
                if (existingIndex === -1) {
                    shouldAdd = true;
                } else {
                    message = '重复扫码已忽略';
                }
                break;
            case 'allow':
                shouldAdd = true;
                break;
            case 'count':
                if (existingIndex === -1) {
                    shouldAdd = true;
                } else {
                    this.scanResults[existingIndex].count++;
                    this.scanResults[existingIndex].date = scanData.date;
                    message = `重复扫码 (计数: ${this.scanResults[existingIndex].count})`;
                }
                break;
        }

        if (shouldAdd) {
            this.scanResults.unshift(scanData);
            this.successCount++;
        }

        this.scanCount++;
        this.saveResults();
        this.renderResults();
        this.updateDisplay();
        
        // 反馈
        this.showScanFeedback(true, message);
        this.playFeedback();
        this.updateLastScan(scanData.text, formatString);
        
        // 检查自动导出
        this.checkAutoExport();
    }

    showScanFeedback(success, message = '') {
        const feedback = document.createElement('div');
        feedback.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: ${success ? '#27ae60' : '#e74c3c'};
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            font-weight: 600;
            z-index: 1000;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;
        feedback.textContent = success ? '扫码成功!' : `扫码失败: ${message}`;
        
        document.body.appendChild(feedback);
        setTimeout(() => feedback.remove(), 1500);
    }

    updateDisplay() {
        this.scanCountEl.textContent = this.scanCount;
        this.successCountEl.textContent = this.successCount;
    }

    renderResults() {
        const filteredResults = this.getFilteredResults();
        
        if (filteredResults.length === 0) {
            this.resultsList.innerHTML = `
                <div class="empty-state">
                    <div style="font-size: 3rem; margin-bottom: 10px;">📱</div>
                    <p>暂无扫码记录</p>
                </div>
            `;
            return;
        }

        this.resultsList.innerHTML = filteredResults.map(item => `
            <div class="result-item">
                <div class="result-content">
                    <div class="result-text">${this.escapeHtml(item.text)}</div>
                    <div class="result-meta">
                        <span class="result-type">${this.getFormatName(item.format)}</span>
                        <span>📅 ${item.date}</span>
                        ${item.count > 1 ? `<span class="count-badge">计数: ${item.count}</span>` : ''}
                    </div>
                </div>
                <button class="delete-btn" onclick="scanner.deleteResult('${item.id}')">删除</button>
            </div>
        `).join('');
    }

    getFilteredResults() {
        let filtered = [...this.scanResults];
        
        // 类型筛选
        if (this.typeFilter.value) {
            filtered = filtered.filter(item => item.format === this.typeFilter.value);
        }
        
        // 文本搜索
        if (this.searchInput.value.trim()) {
            const searchTerm = this.searchInput.value.trim().toLowerCase();
            filtered = filtered.filter(item => 
                item.text.toLowerCase().includes(searchTerm)
            );
        }
        
        return filtered;
    }

    getFormatName(format) {
        const formatNames = {
            'QR_CODE': '二维码',
            'CODE_128': 'Code 128',
            'CODE_39': 'Code 39',
            'EAN_13': 'EAN-13',
            'EAN_8': 'EAN-8',
            'UPC_A': 'UPC-A',
            'UPC_E': 'UPC-E',
            'CODABAR': 'Codabar',
            'ITF': 'ITF',
            'RSS_14': 'RSS-14',
            'RSS_EXPANDED': 'RSS Expanded',
            'DATA_MATRIX': 'Data Matrix',
            'AZTEC': 'Aztec',
            'PDF_417': 'PDF417'
        };
        return formatNames[format] || format;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    deleteResult(id) {
        this.scanResults = this.scanResults.filter(item => item.id != id);
        this.successCount = this.scanResults.length;
        this.saveResults();
        this.renderResults();
        this.updateDisplay();
    }

    clearResults() {
        if (confirm('确定要清空所有扫码记录吗？')) {
            this.scanResults = [];
            this.scanCount = 0;
            this.successCount = 0;
            this.saveResults();
            this.renderResults();
            this.updateDisplay();
        }
    }

    exportJson() {
        const data = {
            exportTime: new Date().toISOString(),
            totalCount: this.scanResults.length,
            results: this.scanResults
        };
        
        this.downloadFile(
            JSON.stringify(data, null, 2),
            `扫码记录_${new Date().toISOString().split('T')[0]}.json`,
            'application/json'
        );
    }

    exportCsv() {
        const headers = ['序号', '内容', '类型', '扫码时间'];
        const csvContent = [
            headers.join(','),
            ...this.scanResults.map((item, index) => [
                index + 1,
                `"${item.text.replace(/"/g, '""')}"`,
                this.getFormatName(item.format),
                item.date
            ].join(','))
        ].join('\n');
        
        // 添加BOM以支持中文
        const bom = '\uFEFF';
        this.downloadFile(
            bom + csvContent,
            `扫码记录_${new Date().toISOString().split('T')[0]}.csv`,
            'text/csv'
        );
    }

    async shareData() {
        const shareData = {
            title: '扫码统计数据',
            text: `共扫描 ${this.scanResults.length} 条记录`,
            url: window.location.href
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (error) {
                console.log('分享取消或失败');
            }
        } else {
            // 复制到剪贴板
            const textData = this.scanResults.map(item => 
                `${item.text} (${this.getFormatName(item.format)}) - ${item.date}`
            ).join('\n');
            
            try {
                await navigator.clipboard.writeText(textData);
                alert('数据已复制到剪贴板');
            } catch (error) {
                alert('复制失败，请手动复制数据');
            }
        }
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    saveResults() {
        try {
            localStorage.setItem('scanResults', JSON.stringify(this.scanResults));
        } catch (error) {
            console.error('保存数据失败:', error);
        }
    }

    loadResults() {
        try {
            const saved = localStorage.getItem('scanResults');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error('加载数据失败:', error);
            return [];
        }
    }

    // 设置相关方法
    getDefaultSettings() {
        return {
            allowedFormats: [
                'QR_CODE', 'CODE_128', 'CODE_39', 'EAN_13', 'EAN_8', 
                'UPC_A', 'UPC_E', 'DATA_MATRIX', 'PDF_417', 'AZTEC',
                'CODABAR', 'ITF', 'RSS_14', 'RSS_EXPANDED'
            ],
            duplicateRule: 'ignore',
            scanInterval: 500, // 减少间隔时间
            enableRegex: false,
            regexPattern: '',
            enableLength: false,
            minLength: 0,
            maxLength: 100,
            enablePrefix: false,
            prefixFilter: '',
            enableSound: true,
            enableVibration: true,
            autoExport: false,
            autoExportCount: 100
        };
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem('scanSettings');
            return saved ? { ...this.getDefaultSettings(), ...JSON.parse(saved) } : this.getDefaultSettings();
        } catch (error) {
            console.error('加载设置失败:', error);
            return this.getDefaultSettings();
        }
    }

    saveSettingsToStorage() {
        try {
            localStorage.setItem('scanSettings', JSON.stringify(this.settings));
        } catch (error) {
            console.error('保存设置失败:', error);
        }
    }

    openSettings() {
        this.populateSettingsForm();
        this.settingsModal.style.display = 'block';
    }

    closeSettings() {
        this.settingsModal.style.display = 'none';
    }

    populateSettingsForm() {
        // 填充格式选择
        const formatCheckboxes = document.querySelectorAll('.format-checkboxes input[type="checkbox"]');
        formatCheckboxes.forEach(checkbox => {
            checkbox.checked = this.settings.allowedFormats.includes(checkbox.value);
        });

        // 填充重复规则
        document.querySelector(`input[name="duplicateRule"][value="${this.settings.duplicateRule}"]`).checked = true;

        // 填充其他设置
        document.getElementById('scanInterval').value = this.settings.scanInterval;
        document.getElementById('enableRegex').checked = this.settings.enableRegex;
        document.getElementById('regexPattern').value = this.settings.regexPattern;
        document.getElementById('regexPattern').disabled = !this.settings.enableRegex;
        
        document.getElementById('enableLength').checked = this.settings.enableLength;
        document.getElementById('minLength').value = this.settings.minLength;
        document.getElementById('maxLength').value = this.settings.maxLength;
        document.getElementById('minLength').disabled = !this.settings.enableLength;
        document.getElementById('maxLength').disabled = !this.settings.enableLength;
        
        document.getElementById('enablePrefix').checked = this.settings.enablePrefix;
        document.getElementById('prefixFilter').value = this.settings.prefixFilter;
        document.getElementById('prefixFilter').disabled = !this.settings.enablePrefix;
        
        document.getElementById('enableSound').checked = this.settings.enableSound;
        document.getElementById('enableVibration').checked = this.settings.enableVibration;
        
        document.getElementById('autoExport').checked = this.settings.autoExport;
        document.getElementById('autoExportCount').value = this.settings.autoExportCount;
        document.getElementById('autoExportCount').disabled = !this.settings.autoExport;
    }

    saveSettingsData() {
        // 收集格式设置
        const formatCheckboxes = document.querySelectorAll('.format-checkboxes input[type="checkbox"]:checked');
        this.settings.allowedFormats = Array.from(formatCheckboxes).map(cb => cb.value);

        // 收集重复规则
        this.settings.duplicateRule = document.querySelector('input[name="duplicateRule"]:checked').value;

        // 收集其他设置
        this.settings.scanInterval = parseInt(document.getElementById('scanInterval').value) || 1000;
        this.settings.enableRegex = document.getElementById('enableRegex').checked;
        this.settings.regexPattern = document.getElementById('regexPattern').value;
        this.settings.enableLength = document.getElementById('enableLength').checked;
        this.settings.minLength = parseInt(document.getElementById('minLength').value) || 0;
        this.settings.maxLength = parseInt(document.getElementById('maxLength').value) || 100;
        this.settings.enablePrefix = document.getElementById('enablePrefix').checked;
        this.settings.prefixFilter = document.getElementById('prefixFilter').value;
        this.settings.enableSound = document.getElementById('enableSound').checked;
        this.settings.enableVibration = document.getElementById('enableVibration').checked;
        this.settings.autoExport = document.getElementById('autoExport').checked;
        this.settings.autoExportCount = parseInt(document.getElementById('autoExportCount').value) || 100;

        this.saveSettingsToStorage();
        this.applySettings();
        this.closeSettings();
        
        this.showScanFeedback(true, '设置已保存');
    }

    resetSettingsData() {
        if (confirm('确定要重置所有设置为默认值吗？')) {
            this.settings = this.getDefaultSettings();
            this.populateSettingsForm();
        }
    }

    applySettings() {
        // 应用设置到界面和功能
        this.updateTypeFilter();
    }

    updateTypeFilter() {
        // 更新类型筛选器选项
        const typeFilter = document.getElementById('typeFilter');
        const currentValue = typeFilter.value;
        
        // 清空现有选项（保留"所有类型"）
        while (typeFilter.children.length > 1) {
            typeFilter.removeChild(typeFilter.lastChild);
        }
        
        // 添加允许的格式选项
        this.settings.allowedFormats.forEach(format => {
            const option = document.createElement('option');
            option.value = format;
            option.textContent = this.getFormatName(format);
            typeFilter.appendChild(option);
        });
        
        // 恢复之前的选择
        if (this.settings.allowedFormats.includes(currentValue)) {
            typeFilter.value = currentValue;
        } else {
            typeFilter.value = '';
        }
    }

    validateScanContent(text) {
        // 正则表达式验证
        if (this.settings.enableRegex && this.settings.regexPattern) {
            try {
                const regex = new RegExp(this.settings.regexPattern);
                if (!regex.test(text)) {
                    return { valid: false, message: '内容不符合正则表达式规则' };
                }
            } catch (error) {
                console.error('正则表达式错误:', error);
                return { valid: false, message: '正则表达式配置错误' };
            }
        }

        // 长度验证
        if (this.settings.enableLength) {
            if (text.length < this.settings.minLength) {
                return { valid: false, message: `内容长度不能少于${this.settings.minLength}个字符` };
            }
            if (text.length > this.settings.maxLength) {
                return { valid: false, message: `内容长度不能超过${this.settings.maxLength}个字符` };
            }
        }

        // 前缀验证
        if (this.settings.enablePrefix && this.settings.prefixFilter) {
            if (!text.startsWith(this.settings.prefixFilter)) {
                return { valid: false, message: `内容必须以"${this.settings.prefixFilter}"开头` };
            }
        }

        return { valid: true };
    }

    playFeedback() {
        // 播放提示音
        if (this.settings.enableSound) {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.1);
            } catch (error) {
                console.log('无法播放提示音');
            }
        }

        // 震动反馈
        if (this.settings.enableVibration && navigator.vibrate) {
            navigator.vibrate(100);
        }
    }

    checkAutoExport() {
        if (this.settings.autoExport && this.scanResults.length >= this.settings.autoExportCount) {
            this.exportJson();
            this.showScanFeedback(true, `已自动导出${this.settings.autoExportCount}条记录`);
        }
    }

    // 标签页相关方法
    switchTab(tabName) {
        // 更新标签按钮状态
        this.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // 更新标签内容显示
        this.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });

        // 如果切换到统计页面，更新统计数据
        if (tabName === 'statistics') {
            this.updateStatistics();
        }
    }

    updateScanStatus(status) {
        if (this.scanStatus) {
            this.scanStatus.textContent = status;
        }
    }

    updateLastScan(text, format) {
        if (this.lastScan) {
            const shortText = text.length > 20 ? text.substring(0, 20) + '...' : text;
            this.lastScan.textContent = `${shortText} (${this.getFormatName(format)})`;
        }
    }

    // 统计相关方法
    updateStatistics() {
        const stats = this.calculateStatistics();
        
        // 更新统计卡片
        document.getElementById('totalScans').textContent = this.scanCount;
        document.getElementById('uniqueScans').textContent = this.scanResults.length;
        document.getElementById('todayScans').textContent = stats.todayCount;
        document.getElementById('mostUsedFormat').textContent = stats.mostUsedFormat;

        // 更新图表
        this.renderFormatChart(stats.formatDistribution);
        this.renderTimeChart(stats.timeDistribution);
    }

    calculateStatistics() {
        const today = new Date().toDateString();
        const todayCount = this.scanResults.filter(item => 
            new Date(item.timestamp).toDateString() === today
        ).length;

        // 格式分布统计
        const formatCounts = {};
        this.scanResults.forEach(item => {
            const format = item.format;
            formatCounts[format] = (formatCounts[format] || 0) + (item.count || 1);
        });

        const formatDistribution = Object.entries(formatCounts)
            .map(([format, count]) => ({ format, count }))
            .sort((a, b) => b.count - a.count);

        const mostUsedFormat = formatDistribution.length > 0 
            ? this.getFormatName(formatDistribution[0].format)
            : '-';

        // 时间分布统计（按小时）
        const hourCounts = new Array(24).fill(0);
        this.scanResults.forEach(item => {
            const hour = new Date(item.timestamp).getHours();
            hourCounts[hour] += item.count || 1;
        });

        const timeDistribution = hourCounts.map((count, hour) => ({
            hour: `${hour.toString().padStart(2, '0')}:00`,
            count
        })).filter(item => item.count > 0);

        return {
            todayCount,
            mostUsedFormat,
            formatDistribution,
            timeDistribution
        };
    }

    renderFormatChart(formatDistribution) {
        const container = document.getElementById('formatChart');
        if (!container || formatDistribution.length === 0) {
            container.innerHTML = '<p>暂无数据</p>';
            return;
        }

        const maxCount = Math.max(...formatDistribution.map(item => item.count));
        const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe'];

        container.innerHTML = formatDistribution.map((item, index) => `
            <div class="format-chart-item">
                <div class="format-color" style="background: ${colors[index % colors.length]}"></div>
                <div class="format-name">${this.getFormatName(item.format)}</div>
                <div class="format-count">${item.count}</div>
                <div class="format-bar">
                    <div class="format-bar-fill" 
                         style="width: ${(item.count / maxCount) * 100}%; background: ${colors[index % colors.length]}">
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderTimeChart(timeDistribution) {
        const container = document.getElementById('timeChart');
        if (!container || timeDistribution.length === 0) {
            container.innerHTML = '<p>暂无数据</p>';
            return;
        }

        const maxCount = Math.max(...timeDistribution.map(item => item.count));

        container.innerHTML = timeDistribution.map(item => `
            <div class="time-chart-item">
                <div class="time-label">${item.hour}</div>
                <div class="time-bar">
                    <div class="time-bar-fill" style="width: ${(item.count / maxCount) * 100}%"></div>
                </div>
                <div class="time-count">${item.count}</div>
            </div>
        `).join('');
    }
}

// 初始化应用
let scanner;
document.addEventListener('DOMContentLoaded', () => {
    scanner = new BarcodeScanner();
});

// 页面卸载时停止扫码
window.addEventListener('beforeunload', () => {
    if (scanner && scanner.isScanning) {
        scanner.stopScanning();
    }
});