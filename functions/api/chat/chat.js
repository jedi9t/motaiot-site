// /functions/api/chat.js (AutoRAG 集成 + 会话验证)

// Workers AI Embedding 模型 (用于获取查询向量)
const EMBEDDING_MODEL = "@cf/baai/bge-small-en-v1.5";
// Workers AI LLM 推理模型 (用于生成最终回复)
const INFERENCE_MODEL = "@cf/meta/llama-3-8b-instruct"; 
const RAG_INDEX_NAME = "red-waterfall-61ed"; // 您的 AutoRAG 索引 ID; mota-steep-math-2e65

// ----------------------------------------------------
// 辅助函数：会话验证 (必须存在)
// ----------------------------------------------------
async function getSessionUser(request, db) {
    const cookieHeader = request.headers.get('Cookie');
    const sessionMatch = cookieHeader?.match(/__session=([^;]+)/); 

    if (!sessionMatch) return null;

    try {
        const [sessionId, userId] = sessionMatch[1].split('|'); 

        // 1. 验证 sessions 表中的会话记录
        const { results: sessionCheck } = await db.prepare(
            `SELECT expires FROM sessions WHERE id = ?1 AND userId = ?2`
        ).bind(sessionId, userId).all();

        if (sessionCheck.length === 0 || sessionCheck[0].expires <= Date.now()) {
            return null; 
        }
        
        // 2. 获取用户数据
        const { results: userResult } = await db.prepare(
            `SELECT id, name, email FROM users WHERE id = ?1`
        ).bind(userId).all();

        if (userResult.length > 0) {
            return { userId: userResult[0].id }; // 只返回 ID 即可
        }

    } catch (e) {
        console.error("getSessionUser D1 error:", e);
    }
    return null;
}

// ----------------------------------------------------
// 辅助函数：RAG 检索和生成 (AutoRAG 简化集成)
// ----------------------------------------------------
async function generateRAGResponse(env, userQuery) {


    const aiResponse = await env.AI.autorag(RAG_INDEX_NAME).aiSearch({
    query: userQuery,
    rewrite_query: true,
    stream: true,
    });
    if (!aiResponse.ok) {
        var t;
        let e = await aiResponse.json();
        if (e && (null == e || null == (t = e.errors[0]) ? void 0 : t.message))
            throw Error("autorag-error-msg:".concat(e.errors[0].message));
        throw Error("HTTP error! status: ".concat(a.status, " ").concat(a.statusText))
    }
    // 假设 aiResponse 是一个完整的 Response 对象
    if (!aiResponse.body) {
        throw new Error("AI Search returned a response without a body/stream.");
    }
    
    return aiResponse;
}


// ----------------------------------------------------
// 主处理函数 (onRequest)
// ----------------------------------------------------
export async function onRequest(context) {
    const { request, env } = context;
    const db = env.hugo_auth_db; 
    
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    // 1. 验证用户会话
    const user = await getSessionUser(request, db);
    if (!user) {
        return new Response('Unauthorized: Invalid session.', { status: 401 });
    }

    try {
        const { message } = await request.json();

        // 2. 执行 RAG 检索和 LLM 推理 (返回 Response 对象)
        const aiResponse = await generateRAGResponse(env, message);

        // 3. Tee (分流)：一个流用于历史记录，一个流用于返回给前端
        // 关键修正：对 Response.body 调用 tee() 方法
        const [historyStream, clientStream] = aiResponse.body.tee(); 
        
        // 4. 异步存储历史记录 (不阻塞主请求)
        context.waitUntil((async () => {
            let historyText = '';
            const reader = historyStream.getReader();
            const decoder = new TextDecoder();
            
            // 关键修正 1: 必须初始化 buffer
            let buffer = ''; 

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;                
                    
                    // 关键修正 2: 将解码后的块附加到 buffer 
                    buffer += decoder.decode(value, { stream: true });                                    
                    
                    // 关键修正 3: 在 buffer (字符串) 上查找，而不是在 value (Uint8Array) 上
                    let position = buffer.indexOf("\n\n");
                    
                    // 循环处理 buffer 中所有完整的 SSE 消息
                    while (position !== -1) {
                        const chunk = buffer.substring(0, position);
                        const lines = chunk.split("\n");
                        let data = "";                    
                        
                        for (let line of lines) {
                            if (line.startsWith("data:")) {
                                data += line.substring(5).trimLeft(); 
                            }
                        }

                        if (data) {
                            if (data === '[DONE]') {
                                // 达到流的末尾标记
                                break; 
                            }
                            
                            try {
                                // 尝试解析 JSON
                                const parsedData = JSON.parse(data);
                                // 确保我们只添加实际的文本块
                                const chunkText = parsedData.response || parsedData.reply;
                                if (chunkText) {
                                    historyText += chunkText;
                                }
                            } catch (e) {
                                console.error("History stream JSON parse error (skipping chunk):", e, data);
                            }
                        }
                        
                        // 从 buffer 中移除已处理的块
                        buffer = buffer.substring(position + 2);
                        // 查找下一个消息
                        position = buffer.indexOf("\n\n");
                    }
                }
            
                // 确保我们收集到了一些文本再存入数据库
                if (historyText.trim().length > 0) {
                    // 存储对话历史 (chat_history 表)
                    await db.prepare(                
                        `INSERT INTO chat_history (id, userId, userMessage, aiResponse, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)`
                    ).bind(
                        crypto.randomUUID(), 
                        user.userId, 
                        message, 
                        historyText, // 完整的、拼接好的 AI 回复
                        Date.now()
                    ).run();
                }

            } catch (e) {
                console.error("Failed to process history stream:", e);
                // 即使历史记录失败，也不要让它崩溃
            }
        })());


        // 5. 将客户端流返回给前端
        // 关键：Headers 必须是 SSE/Event Stream 格式
        return new Response(clientStream, {
            headers: { 
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        });

    } catch (e) {
        console.error('Chat API Fatal Error:', e);
        // 如果出错，返回错误信息，而不是流
        return new Response(`Processing error: ${e.message}`, { status: 500 });
    }
}