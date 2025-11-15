// /functions/api/chat.js (AutoRAG 集成 + 会话验证)

// Workers AI Embedding 模型 (用于获取查询向量)
const EMBEDDING_MODEL = "@cf/baai/bge-small-en-v1.5";
// Workers AI LLM 推理模型 (用于生成最终回复)
const INFERENCE_MODEL = "@cf/meta/llama-3-8b-instruct"; 
const RAG_INDEX_NAME = "mota-steep-math-2e65"; // 您的 AutoRAG 索引 ID

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

        // 2. 关键：调用 AutoRAG 集成服务 (使用 stream: true)
        const aiResponse = await env.AI.autorag(RAG_INDEX_NAME).aiSearch({
            query: message,
            model: INFERENCE_MODEL, // 指定 LLM
            stream: true,           // 启用流式输出
        });

        // 3. Workers AI 返回的已经是 ReadableStream
        //    在返回前，我们先读取完整内容用于历史记录，然后返回流
        
        // ⚠️ 修正：由于 Workers AI 的 API 设计，流对象通常不能被提前读取。
        // 我们需要创建 Tee 副本：一个用于历史记录，一个用于返回给前端。
        
        const [historyStream, clientStream] = aiResponse.tee(); 
        
        // 4. 异步存储历史记录 (不阻塞主请求)
        context.waitUntil((async () => {
            let historyText = '';
            const reader = historyStream.getReader();
            const decoder = new TextDecoder();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                historyText += decoder.decode(value, { stream: true });
            }
            
            // 存储对话历史 (ChatHistory 表)
            await db.prepare(
                `INSERT INTO ChatHistory (id, userId, userMessage, aiResponse, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)`
            ).bind(
                crypto.randomUUID(), 
                user.userId, 
                message, 
                historyText, 
                Date.now()
            ).run();
        })());


        // 5. 将流返回给前端
        return new Response(clientStream, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' } // 纯文本流
        });

    } catch (e) {
        console.error('Chat API Fatal Error:', e);
        return new Response(`Processing error: ${e.message}`, { status: 500 });
    }
}

// // ----------------------------------------------------
// // 辅助函数：RAG 检索和生成 (AutoRAG 简化集成)
// // ----------------------------------------------------
// async function generateRAGResponse(env, userQuery) {


//     const aiResponse = await env.AI.autorag(RAG_INDEX_NAME).aiSearch({
//     query: userQuery,
//     rewrite_query: true,
//     stream: true,
//     });

//     // // 1. 获取查询的 Embedding (Workers AI)
//     // const embeddingResponse = await env.AI.run(EMBEDDING_MODEL, { text: userQuery });
//     // const queryEmbedding = embeddingResponse.embedding;

//     // // 2. RAG 检索：Vectorize
//     // const searchResults = await env.RAG_INDEX.query({
//     //     vector: queryEmbedding,
//     //     topK: 3, 
//     //     returnMetadata: true
//     // });
    
//     // 3. 构造上下文
//     // const context = searchResults.matches
//     //     .map(match => match.metadata?.text_chunk || '') 
//     //     .join('\n---\n'); 

//     // const systemInstruction = `You are a helpful customer service AI for MOTA TECHLINK. Use the following CONTEXT to answer the user's question accurately. CONTEXT: ${context}`;
    
//     // // 4. LLM 推理 (Workers AI)
//     // const messages = [
//     //     { role: "system", content: systemInstruction },
//     //     { role: "user", content: userQuery }
//     // ];
    
//     // const aiResponse = await env.AI.run(INFERENCE_MODEL, { messages });
//     return aiResponse.response || "Sorry, I couldn't generate a response.";
// }


// // ----------------------------------------------------
// // 主处理函数 (onRequest)
// // ----------------------------------------------------
// export async function onRequest(context) {
//     const { request, env } = context;
//     const db = env.hugo_auth_db; 
    
//     if (request.method !== 'POST') {
//         return new Response('Method Not Allowed', { status: 405 });
//     }

//     // 1. 验证用户会话
//     const user = await getSessionUser(request, db);
//     if (!user) {
//         return new Response('Unauthorized: Invalid session.', { status: 401 });
//     }

//     try {
//         const { message } = await request.json();

//         // 2. 执行 RAG 检索和 LLM 推理
//         const aiResponseText = await generateRAGResponse(env, message);

//         // 3. 存储对话历史 (chat_history 表)
//         await db.prepare(
//             `INSERT INTO chat_history (id, userId, userMessage, aiResponse, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)`
//         ).bind(
//             crypto.randomUUID(), 
//             user.userId, 
//             message, 
//             aiResponseText, 
//             Date.now()
//         ).run();

//         // 4. 返回 AI 响应
//         return new Response(JSON.stringify({ reply: aiResponseText }), {
//             headers: { 'Content-Type': 'application/json' }
//         });

//     } catch (e) {
//         console.error('Chat API Fatal Error:', e);
//         return new Response(`Processing error: ${e.message}`, { status: 500 });
//     }
// }