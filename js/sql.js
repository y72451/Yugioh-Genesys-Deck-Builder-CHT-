// sql.js

let db = null;
let isDbReady = false;

// 載入 SQL.js 引擎 (WASM)
async function loadSqlEngine() {
    return new Promise((resolve, reject) => {
        // 檢查是否已經存在 script，避免重複載入
        if (document.querySelector('script[src*="sql-wasm.js"]')) {
             if (window.initSqlJs) {
                 resolve(window.initSqlJs);
             } else {
                 // 如果 script 在載入中，稍微等一下 (簡單處理)
                 setTimeout(() => resolve(window.initSqlJs), 500);
             }
             return;
        }

        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js";
        script.onload = () => resolve(window.initSqlJs);
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// 1. 初始化資料庫 (由 main.js 呼叫)
export async function initializeSQLDatabase() {
    try {
        console.log("正在初始化 SQL 引擎...");
        const initSqlJs = await loadSqlEngine();
        const SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
        });

        console.log("正在下載 cards.cdb...");
        // 加上 timestamp 避免快取，正式上線如果檔案不常變動可拿掉 timestamp
        const response = await fetch(`./data/cards.cdb?t=${Date.now()}`);
        
        if (!response.ok) {
            throw new Error("無法讀取 ./data/cards.cdb");
        }

        const buffer = await response.arrayBuffer();
        db = new SQL.Database(new Uint8Array(buffer));
        //window.SQL_DB = db; // <--- 能在 Console 呼叫
        //console.log("設定windowDB");
        isDbReady = true;
        console.log("SQL 資料庫已就緒");
        return true;

    } catch (err) {
        console.error("SQL 資料庫初始化失敗:", err);
        return false;
    }
}

// 2. 以卡名搜尋 (由 main.js 呼叫)
export function searchCardsByName(searchTerm) {
    if (!isDbReady || !db) {
        console.warn("資料庫尚未就緒");
        return [];
    }

    try {
        // 使用 LIKE 進行模糊搜尋，限制回傳 30 筆以免過多
        // 注意：cards.cdb 通常包含 datas (數值) 和 texts (文字) 兩個表
        // 這裡我們主要查詢 texts 表來找名字
        const stmt = db.prepare(`
            SELECT t.id, t.name, t.desc 
            FROM texts t 
            WHERE t.name LIKE :val 
        `);
        
        const result = [];
        // 綁定參數避免 SQL Injection (雖然是本地讀取，但養成好習慣)
        stmt.bind({ ':val': `%${searchTerm}%` });

        while (stmt.step()) {
            const row = stmt.getAsObject();
            result.push({
                id: row.id,
                name: row.name,
                desc: row.desc,
                // 因為 cdb 通常不含圖片與類型詳細分類(除非關聯 datas 表)
                // 我們這裡先回傳基本資訊，圖片連結會在 main.js 組合
            });
        }
        
        stmt.free();
        return result;

    } catch (err) {
        console.error("搜尋錯誤:", err);
        return [];
    }
}

export function searchCardsByIDs(idList) {
    if (!isDbReady || !db) {
        console.warn("SQL DB 尚未就緒");
        return [];
    }

    const results = [];
    
    // 預編譯 SQL 語句 (Prepared Statement)
    // 我們同時 JOIN datas 表，這樣可以順便拿到 type (雖然是數字)
    const stmt = db.prepare(`
        SELECT t.id, t.name, t.desc, d.type 
        FROM texts t
        LEFT JOIN datas d ON t.id = d.id
        WHERE t.id = :id
    `);

    try {
        // 在 SQL 引擎內部跑迴圈，速度最快
        for (const id of idList) {
            stmt.bind({ ':id': id });
            
            if (stmt.step()) {
                const row = stmt.getAsObject();
                results.push({
                    id: row.id,
                    name: row.name,
                    desc: row.desc,
                    type: row.type // 注意：這裡是整數 (例如 33)，需要轉譯
                });
            }
            
            stmt.reset(); // 重置語句，準備查下一個 ID
        }
    } catch (err) {
        console.error("批量查詢失敗:", err);
    } finally {
        stmt.free(); // 務必釋放記憶體
    }

    return results;
}