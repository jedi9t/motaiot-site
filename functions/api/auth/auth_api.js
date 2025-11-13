// /functions/api/auth/auth_api.js

import { Auth } from "@auth/core"; 
import { D1Adapter } from "@auth/d1-adapter";

// 导入身份提供者
import Google from "@auth/core/providers/google"; 
import GitHub from "@auth/core/providers/github";
import Discord from "@auth/core/providers/discord";
import LinkedIn from "@auth/core/providers/linkedin"; 
import Reddit from "@auth/core/providers/reddit";
import Twitter from "@auth/core/providers/twitter"; 

/**
 * Auth.js 的配置选项
 * * 注意：在 Cloudflare Pages Functions 的 Edge Runtime 中，
 * 推荐使用 globalThis.env 来访问环境变量和绑定。
 */
const config = {
  // 1. 路由配置
  basePath: "/api/auth", 

  // 2. 数据库适配器：传入 D1 绑定
  adapter: D1Adapter(globalThis.env.hugo_auth_db), 

  // 3. 身份提供者配置
  providers: [
    GitHub({ 
      clientId: globalThis.env.GITHUB_ID, 
      clientSecret: globalThis.env.GITHUB_SECRET 
    }),
    Google({
      clientId: globalThis.env.GOOGLE_ID,
      clientSecret: globalThis.env.GOOGLE_SECRET
    }),
    Discord({ 
      clientId: globalThis.env.DISCORD_ID, 
      clientSecret: globalThis.env.DISCORD_SECRET 
    }),
    LinkedIn({ 
      clientId: globalThis.env.LINKEDIN_ID, 
      clientSecret: globalThis.env.LINKEDIN_SECRET 
    }),
    Reddit({ 
      clientId: globalThis.env.REDDIT_ID, 
      clientSecret: globalThis.env.REDDIT_SECRET 
    }),
    Twitter({ 
      clientId: globalThis.env.TWITTER_ID, 
      clientSecret: globalThis.env.TWITTER_SECRET 
    }),
  ],

  // 4. 安全和会话配置
  secret: globalThis.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: '/login' },

  // 5. [可选但推荐] 回调函数：将用户ID添加到 JWT 和 Session 中
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // user 是在第一次登录时从数据库获取的 User 对象
        token.id = user.id; 
      }
      return token;
    },
    async session({ session, token }) {
      // 从 token 中获取 ID 并添加到 session.user 对象
      if (token.id) {
        session.user.id = token.id;
      }
      return session;
    },
  },
};


// Pages Functions 的入口点
/**
 * @param {object} context - 包含 request, env, params 的对象
 */
export async function onRequest(context) {
  const url = new URL(context.request.url);

  // 关键操作：修改请求 URL 以匹配 Auth.js 内部期望的路由结构
  // 例如：将 /api/auth/signin/github 转换为 /signin/github (移除 basePath)
  url.pathname = url.pathname.replace(config.basePath, '');

  // 确保 Auth.js 接收到一个新的 Request 对象，其中包含修改后的 URL 路径
  return Auth(new Request(url, context.request), config);
}

// ----------------------------------------------------
// 提示：之前的 'const authOptions' 代码块已被删除，以清理文件。
// ----------------------------------------------------