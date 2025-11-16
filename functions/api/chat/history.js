// functions/api/chat/history.js

// ----------------------------------------------------
// 辅助函数：getSessionUser (必须从 /api/chat.js 复制过来)
// ----------------------------------------------------
async function getSessionUser(request, db) {
    const cookieHeader = request.headers.get('Cookie');
    const sessionMatch = cookieHeader?.match(/__session=([^;]+)/);
    if (!sessionMatch) return null;
    try {
        const [sessionId, userId] = sessionMatch[1].split('|');
        // 假设您的会话表名为 sessions，用户 ID 字段为 user_id
        const { results: sessionCheck } = await db.prepare(`SELECT expires FROM sessions WHERE id = ?1 AND userId = ?2`).bind(sessionId, userId).all();
        if (sessionCheck.length === 0 || sessionCheck[0].expires <= Date.now()) return null;
        const { results: userResult } = await db.prepare(`SELECT id, name, email FROM users WHERE id = ?1`).bind(userId).all();
        if (userResult.length > 0) return { userId: userResult[0].id, name: userResult[0].name, email: userResult[0].email };
    } catch (e) {
        console.error("getSessionUser D1 error:", e);
    }
    return null;
}
// ----------------------------------------------------

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.hugo_auth_db; 

    // 1. 验证用户会话
    const user = await getSessionUser(request, db);
    if (!user) {
        return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        // 2. 查询历史记录，按时间戳升序排序
        const { results } = await db.prepare(
            `SELECT userMessage, aiResponse, timestamp 
             FROM chat_history 
             WHERE userId = ?1 
             ORDER BY timestamp ASC limit 20`
        ).bind(user.userId).all();
        
        // 3. 返回历史记录 JSON 数组
        return new Response(JSON.stringify(results), { 
            headers: { 'Content-Type': 'application/json' } 
        });

    } catch (e) {
        console.error('History API Fatal Error:', e);
        return new Response(JSON.stringify({ message: `Failed to fetch history: ${e.message}` }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}