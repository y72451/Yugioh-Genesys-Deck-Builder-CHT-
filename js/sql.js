// 1. 改用動態載入腳本的方式，避開 import 語法問題
async function loadSqlEngine() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js";
        script.onload = () => resolve(window.initSqlJs); // sql.js 載入後會產生 window.initSqlJs
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// 取得 UI 元素
const statusDiv = document.getElementById('status');
const outputPre = document.getElementById('output');

function updateStatus(msg, isError = false) {
    statusDiv.textContent = msg;
    statusDiv.className = isError 
        ? "mb-4 p-4 bg-red-900/80 border border-red-500 rounded-lg" 
        : "mb-4 p-4 bg-green-900/80 border border-green-500 rounded-lg";
    statusDiv.classList.remove('animate-pulse');
}

async function runTest() {
    try {
        console.log("--- 步驟 1: 載入並初始化 SQL 引擎 ---");
        updateStatus("正在載入 SQL 引擎...");
        
        const initSqlJs = await loadSqlEngine();
        
        // 初始化 WebAssembly
        const SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
        });

        console.log("--- 步驟 2: 下載 cards.cdb ---");
        updateStatus("正在下載資料庫檔案...");
        
        // 加上 timestamp 避免瀏覽器快取舊檔案
        const response = await fetch(`./data/cards.cdb?t=${Date.now()}`);
        
        if (!response.ok) {
            throw new Error(`找不到檔案！請檢查路徑是否為 ./data/cards.cdb`);
        }

        const buffer = await response.arrayBuffer();
        console.log(`檔案大小: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

        console.log("--- 步驟 3: 開啟資料庫 ---");
        const db = new SQL.Database(new Uint8Array(buffer));

        console.log("--- 步驟 4: 執行查詢 ---");
        // 嘗試查詢 texts 表
        const query = "SELECT id, name, desc FROM texts LIMIT 5";
        const results = db.exec(query);

        if (results.length === 0) {
            updateStatus("資料庫已開啟，但 texts 表格沒有資料", true);
            return;
        }

        const rows = results[0].values;
        let outputText = "";
        rows.forEach(row => {
            outputText += `ID: [${row[0]}] \n卡名: ${row[1]} \n描述: ${row[2].substring(0, 50)}...\n\n----------------\n\n`;
        });

        updateStatus("測試成功！已成功從 cards.cdb 讀取中文資料");
        outputPre.textContent = outputText;

    } catch (err) {
        console.error("發生詳細錯誤:", err);
        updateStatus(`錯誤: ${err.message}`, true);
        outputPre.textContent = "詳細錯誤已顯示在 Console (F12)";
    }
}

// 啟動測試
runTest();