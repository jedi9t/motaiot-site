// /functions/api/auth/session.js

/**
 * 检查 D1 数据库中的会话是否有效且未过期
 * 假设 D1 表名为 'sessions'，字段包括 sessionId, userId, expires
 * @param {D1Database} db - D1 数据库绑定对象 (env.hugo_auth_db)
 * @param {string} sessionId - 会话ID
 * @param {string} userId - 用户ID
 * @returns {Promise<boolean>} - 如果会话有效则返回 true
 */
async function getD1Session(db, sessionId, userId) {
    const { results } = await db.prepare(
        // 查询匹配的会话，并检查是否已过期 (expires 字段存储时间戳)
        `SELECT expires FROM sessions WHERE sessionId = ?1 AND userId = ?2`
    ).bind(sessionId, userId).all();

    if (results.length === 0) {
        return false;
    }

    const session = results[0];
    const now = Date.now();
    // 检查会话是否过期 (假设 expires 存储的是毫秒时间戳)
    if (session.expires && now > session.expires) {
        // 可选：删除过期会话以清理数据库
        // db.prepare(`DELETE FROM sessions WHERE sessionId = ?1`).bind(sessionId).run();
        return false;
    }

    return true;
}

/**
 * 从 D1 数据库获取用户数据
 * 假设 D1 表名为 'users'，字段包括 id, name, email
 * @param {D1Database} db - D1 数据库绑定对象 (env.hugo_auth_db)
 * @param {string} userId - 用户ID
 * @returns {Promise<object|null>} - 用户对象 (包含 id, name, email)
 */
async function getD1User(db, userId) {
    const { results } = await db.prepare(
        `SELECT id, name, email FROM users WHERE id = ?1`
    ).bind(userId).all();
    
    // 返回第一个结果，如果没有则返回 null
    return results.length > 0 ? results[0] : null;
}


export async function onRequest(context) {
    const { request, env } = context;
    const cookieHeader = request.headers.get('Cookie');

    // 1. 检查会话 Cookie (格式: app_session_id=sessionId|userId)
    const sessionMatch = cookieHeader?.match(/app_session_id=([^;]+)/);

    if (sessionMatch) {
        try {
            // 解析 Session ID 和 User ID
            const [sessionId, userId] = sessionMatch[1].split('|');
            
            // 2. 检查 D1 数据库以确认会话有效且未过期
            const isSessionValid = await getD1Session(env.hugo_auth_db, sessionId, userId);

            if (isSessionValid) {
                // 3. 从 D1 获取完整的用户数据
                const user = await getD1User(env.hugo_auth_db, userId);

                if (user) {
                    // 4. 返回用户信息给前端
                    return new Response(JSON.stringify({ user }), {
                        headers: { 
                            'Content-Type': 'application/json',
                            // 刷新 Cookie 过期时间，保持会话活跃 (可选)
                            'Set-Cookie': `app_session_id=${sessionId}|${userId}; HttpOnly; Secure; Max-Age=2592000; Path=/` 
                        }
                    });
                }
            }
            
            // 如果会话无效、过期或用户不存在，则继续执行到未登录部分
        } catch (e) {
            // 捕获任何解析错误或 D1 错误，打印日志并视为未登录
            console.error("Session check error (D1/Cookie parsing):", e);
        }
    }

    // 未登录
    return new Response(JSON.stringify({ user: null }), {
        headers: { 'Content-Type': 'application/json' }
    });
}